using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Collections.Generic;

namespace PrimeVideoRpc {
    internal sealed class DiscordCommandException : IOException {
        public DiscordCommandException(string message) : base("Discord: " + message) { }
    }
    internal sealed class DiscordClient : IDisposable {
        readonly Stream pipe;
        readonly int processId;
        string rejectedArtwork = "";
        public DiscordClient(Stream pipe, int processId) { this.pipe = pipe; this.processId = processId; }
        public static DiscordClient Connect() {
            for (int i = 0; i < 10; i++) {
                var pipe = new NamedPipeClientStream(".","discord-ipc-" + i,PipeDirection.InOut,PipeOptions.Asynchronous);
                try { pipe.Connect(100); return new DiscordClient(pipe,System.Diagnostics.Process.GetCurrentProcess().Id); }
                catch (TimeoutException) { pipe.Dispose(); }
                catch (IOException) { pipe.Dispose(); }
                catch (UnauthorizedAccessException) { pipe.Dispose(); }
            }
            throw new IOException("Open the Discord desktop app. Retrying automatically.");
        }
        Dictionary<string, object> Receive(string expectedNonce) {
            for (int i = 0; i < 20; i++) {
                var header = Protocol.ReadExact(pipe,8,3000);
                if (header == null) throw new EndOfStreamException("Discord disconnected.");
                int opcode = BitConverter.ToInt32(header,0);
                var body = Protocol.ReadBody(pipe,header,4,3000);
                if (opcode == 3) { Protocol.WriteRpc(pipe,4,body); continue; }
                if (opcode == 2) throw new IOException("Discord closed the connection. Check the Application ID.");
                if (opcode != 1) continue;
                var message = Json.Decode(new UTF8Encoding(false,true).GetString(body));
                if (expectedNonce != null && Json.Text(message,"nonce") != expectedNonce) continue;
                if (Json.Text(message,"evt") == "ERROR") {
                    var data = Json.Get(message,"data") as Dictionary<string,object>;
                    throw new DiscordCommandException(Json.Text(data,"message"));
                }
                if (expectedNonce == null && Json.Text(message,"evt") == "READY") return message;
                if (expectedNonce != null && Json.Text(message,"nonce") == expectedNonce) return message;
            }
            throw new IOException("Discord sent an unexpected response.");
        }
        public void Handshake(string id) {
            Protocol.WriteRpc(pipe,0,Encoding.UTF8.GetBytes(Json.Encode(new {v=1,client_id=id})));
            Receive(null);
        }
        void SendActivity(Dictionary<string,object> activity) {
            string nonce = Guid.NewGuid().ToString();
            Protocol.WriteRpc(pipe,1,Encoding.UTF8.GetBytes(Json.Encode(new {cmd="SET_ACTIVITY", args=new {pid=processId,activity=activity},nonce=nonce})));
            Receive(nonce);
        }
        // True means Discord accepted the presence with artwork omitted.
        public bool SetActivity(Dictionary<string,object> activity) {
            var assets = Json.Get(activity,"assets") as Dictionary<string,object>;
            string image = Json.Text(assets,"large_image");
            if (image.Length == 0) { SendActivity(activity); return false; }
            var withoutArtwork = new Dictionary<string,object>(activity);
            withoutArtwork.Remove("assets");
            if (image == rejectedArtwork) { SendActivity(withoutArtwork); return true; }
            try { SendActivity(activity); return false; }
            catch (DiscordCommandException) {
                // Only an explicit command rejection gets a fallback. Transport errors still reconnect.
                SendActivity(withoutArtwork);
                rejectedArtwork = image;
                return true;
            }
        }
        public void Dispose() { pipe.Dispose(); }
    }
}
