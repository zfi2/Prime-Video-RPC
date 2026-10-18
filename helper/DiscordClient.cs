using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Collections.Generic;

namespace PrimeVideoRpc {
    internal sealed class DiscordClient : IDisposable {
        readonly Stream pipe;
        readonly int processId;
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
                if (Json.Text(message,"evt") == "ERROR") {
                    var data = Json.Get(message,"data") as Dictionary<string,object>;
                    throw new InvalidDataException("Discord: " + Json.Text(data,"message"));
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
        public void SetActivity(Dictionary<string,object> activity) {
            string nonce = Guid.NewGuid().ToString();
            Protocol.WriteRpc(pipe,1,Encoding.UTF8.GetBytes(Json.Encode(new {cmd="SET_ACTIVITY", args=new {pid=processId,activity=activity},nonce=nonce})));
            Receive(nonce);
        }
        public void Dispose() { pipe.Dispose(); }
    }
}
