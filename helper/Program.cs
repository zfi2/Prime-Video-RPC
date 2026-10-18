using System;
using System.IO;
using System.Threading;
using System.Collections.Generic;

namespace PrimeVideoRpc {
    internal sealed class Bridge {
        readonly Stream output;
        readonly object gate = new object(), outputGate = new object();
        readonly AutoResetEvent changed = new AutoResetEvent(false);
        volatile bool running = true;
        string clientId = "", lastStatus = "";
        Dictionary<string,object> activity;
        DateTime received = DateTime.MinValue;
        public Bridge(Stream output) { this.output = output; }
        void Status(string state, string message, bool published) {
            var value = new {type="status",state=state,message=message,published=published};
            string serialized = Json.Encode(value);
            lock(outputGate) {
                if (serialized == lastStatus) return;
                lastStatus = serialized;
                try { Protocol.WriteNative(output,value); } catch (IOException) { running = false; }
            }
        }
        void Work() {
            DiscordClient discord = null;
            string connectedId = "", sent = "";
            DateTime lastSent = DateTime.MinValue, retryAt = DateTime.MinValue;
            try {
                while (running) {
                    changed.WaitOne(1000);
                    if (!running) break;
                    string id;
                    Dictionary<string,object> desired;
                    lock (gate) { id = clientId; desired = (DateTime.UtcNow-received).TotalSeconds > 75 ? null : activity; }
                    if (id.Length == 0) continue;
                    if (id != connectedId && discord != null) { discord.Dispose(); discord = null; retryAt = DateTime.MinValue; }
                    if (DateTime.UtcNow < retryAt) continue;
                    try {
                        if (discord == null) {
                            Status("connecting","Connecting to Discord…",false);
                            discord = DiscordClient.Connect();
                            discord.Handshake(id); connectedId = id; sent = ""; lastSent = DateTime.MinValue;
                        }
                        string serialized = Json.Encode(desired);
                        // Clears bypass throttling. Other changes coalesce, while a heartbeat checks the pipe.
                        double elapsed = (DateTime.UtcNow-lastSent).TotalSeconds;
                        if ((serialized != sent && (desired == null || elapsed >= 5)) || elapsed >= 15) {
                            bool artworkOmitted = discord.SetActivity(desired);
                            sent = serialized; lastSent = DateTime.UtcNow;
                            Status("connected",desired == null ? "Ready. No activity is being shared." :
                                artworkOmitted ? "Presence shared without artwork. Discord rejected this image." : "Presence updated in Discord.",desired != null);
                        }
                    } catch (Exception error) {
                        if (discord != null) { discord.Dispose(); discord = null; }
                        sent = ""; retryAt = DateTime.UtcNow.AddSeconds(10);
                        Status(error is InvalidDataException || error is DiscordCommandException ? "error" : "discord-missing",error.Message,false);
                    }
                }
            } finally {
                if (discord != null) {
                    try { discord.SetActivity(null); } catch { }
                    discord.Dispose();
                }
            }
        }
        public void Run(Stream input) {
            var thread = new Thread(Work) { IsBackground = true, Name = "Discord presence" };
            thread.Start();
            Status("connecting","Helper started.",false);
            try {
                Dictionary<string,object> message;
                while ((message = Protocol.ReadNative(input)) != null) {
                    if (Json.Text(message,"type") != "update") throw new InvalidDataException("Unknown message type.");
                    string id = Json.Text(message,"clientId");
                    if (!Activity.ValidId(id)) throw new InvalidDataException("Invalid Discord Application ID.");
                    var next = Activity.Sanitize(Json.Get(message,"activity"));
                    lock (gate) { clientId = id; activity = next; received = DateTime.UtcNow; }
                    changed.Set();
                }
            } catch (Exception error) { Status("error",error.Message,false); }
            finally { running = false; changed.Set(); thread.Join(3500); }
        }
    }
    internal static class Program {
        [STAThread]
        static void Main() {
            // stdout is exclusively the Chrome native messaging protocol. Never log text to it.
            try {
                using(var input = Console.OpenStandardInput())
                using(var output = Console.OpenStandardOutput()) new Bridge(output).Run(input);
            } catch { Environment.ExitCode = 1; }
        }
    }
}
