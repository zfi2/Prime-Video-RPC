using System;
using System.IO;
using System.IO.Pipes;
using System.Text;
using System.Threading;
using System.Collections.Generic;
using PrimeVideoRpc;

internal class HelperTests {
    static int checks;
    static void Check(bool ok,string label) { if(!ok) throw new Exception(label); checks++; Console.WriteLine("PASS " + label); }
    static Dictionary<string,object> ReadRpc(Stream stream,out int opcode,int timeout=3000) {
        var header=Protocol.ReadExact(stream,8,timeout); opcode=BitConverter.ToInt32(header,0);
        return Json.Decode(Encoding.UTF8.GetString(Protocol.ReadBody(stream,header,4,3000)));
    }
    static void Write(Stream stream,int opcode,object value) { Protocol.WriteRpc(stream,opcode,Encoding.UTF8.GetBytes(Json.Encode(value))); }
    static void WithDiscord(Action<Stream> serve,Action<DiscordClient> useClient) {
        string name="prime-rpc-test-"+Guid.NewGuid().ToString("N");
        Exception serverError=null;
        using(var server=new NamedPipeServerStream(name,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous)) {
            var thread=new Thread(()=>{
                try {
                    server.WaitForConnection(); int opcode;
                    ReadRpc(server,out opcode);
                    Write(server,1,new {cmd="DISPATCH",evt="READY",data=new {v=1}});
                    serve(server);
                } catch(Exception error) { serverError=error; }
            }) {IsBackground=true};
            thread.Start();
            using(var pipe=new NamedPipeClientStream(".",name,PipeDirection.InOut,PipeOptions.Asynchronous)) {
                pipe.Connect(2000);
                using(var client=new DiscordClient(pipe,1234)) {
                    client.Handshake("123456789012345678"); useClient(client);
                }
            }
            if(!thread.Join(5000)) throw new Exception("Mock Discord did not finish.");
            if(serverError!=null) throw serverError;
        }
    }
    static void ArtworkTests() {
        var activity=Activity.Sanitize(Json.Decode("{\"details\":\"Example\",\"state\":\"S1 E2\",\"assets\":{\"large_image\":\"https://m.media-amazon.com/images/rejected.jpg\"}}"));
        WithDiscord(server=>{
            for(int i=0;i<5;i++) {
                int opcode; var request=ReadRpc(server,out opcode);
                var args=Json.Get(request,"args") as Dictionary<string,object>;
                var incoming=Json.Get(args,"activity") as Dictionary<string,object>;
                if(i==4) { if(incoming!=null) throw new Exception("Clear was not sent."); }
                else {
                    bool hasArtwork=Json.Get(incoming,"assets")!=null;
                    if(hasArtwork!=(i==0||i==3)) throw new Exception("Wrong artwork retry behavior.");
                    if(Json.Text(incoming,"details")!="Example" || Json.Text(incoming,"state")!="S1 E2") throw new Exception("Fallback lost metadata.");
                }
                if(i==0) Write(server,1,new {cmd="SET_ACTIVITY",evt="ERROR",nonce=Json.Text(request,"nonce"),data=new {message="Invalid image"}});
                else {
                    if(i==1) Write(server,1,new {cmd="SET_ACTIVITY",evt="ERROR",nonce="unrelated",data=new {message="Unrelated failure"}});
                    Write(server,1,new {cmd="SET_ACTIVITY",nonce=Json.Text(request,"nonce"),data=new {}});
                }
            }
        },client=>{
            Check(client.SetActivity(activity),"rejected artwork retries as text presence on the same connection");
            Check(client.SetActivity(activity),"heartbeat skips artwork already rejected by Discord");
            Check(activity.ContainsKey("assets"),"fallback leaves the original activity intact");
            var next=new Dictionary<string,object>(activity);
            next["assets"]=new Dictionary<string,object>{{"large_image","https://m.media-amazon.com/images/new.jpg"}};
            Check(!client.SetActivity(next),"a new image is attempted normally");
            Check(!client.SetActivity(null),"clearing still works after artwork fallback");
        });
        WithDiscord(server=>{
            for(int i=0;i<2;i++) {
                int opcode; var request=ReadRpc(server,out opcode);
                Write(server,1,new {cmd="SET_ACTIVITY",evt="ERROR",nonce=Json.Text(request,"nonce"),data=new {message="Invalid activity"}});
            }
        },client=>{
            bool failed=false;
            try { client.SetActivity(activity); } catch(DiscordCommandException) { failed=true; }
            Check(failed,"a rejected text fallback is reported as an error");
        });
        WithDiscord(server=>{ int opcode; ReadRpc(server,out opcode); server.Dispose(); },client=>{
            bool failed=false;
            try { client.SetActivity(activity); } catch(EndOfStreamException) { failed=true; }
            Check(failed,"a broken connection is not treated as an artwork rejection");
        });
    }
    static Dictionary<string,object> ReadStatus(Stream stream,string state) {
        for(int i=0;i<5;i++) {
            var header=Protocol.ReadExact(stream,4,10000);
            var status=Json.Decode(Encoding.UTF8.GetString(Protocol.ReadBody(stream,header,0,3000)));
            if(Json.Text(status,"type")!="status") throw new Exception("Expected native status message.");
            if(Json.Text(status,"state")==state) return status;
        }
        throw new Exception("Expected status: "+state);
    }
    static void BridgeStatusTests() {
        string discordName="prime-rpc-test-"+Guid.NewGuid().ToString("N");
        string nativeName="prime-rpc-test-"+Guid.NewGuid().ToString("N");
        Exception discordError=null,bridgeError=null;
        using(var discord=new NamedPipeServerStream(discordName,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous))
        using(var native=new NamedPipeServerStream(nativeName,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous)) {
            var discordThread=new Thread(()=>{
                try {
                    discord.WaitForConnection(); int opcode;
                    ReadRpc(discord,out opcode);
                    Write(discord,1,new {cmd="DISPATCH",evt="READY",data=new {v=1}});
                    for(int i=0;i<6;i++) {
                        var request=ReadRpc(discord,out opcode,10000);
                        var incoming=Json.Get(Json.Get(request,"args") as Dictionary<string,object>,"activity") as Dictionary<string,object>;
                        if(i>=4 && incoming!=null) throw new Exception("Expected activity clear.");
                        if(i<4 && (incoming==null || (Json.Get(incoming,"assets")!=null)!=(i==0||i==2)))
                            throw new Exception("Unexpected artwork in bridge request.");
                        if(i==0) Write(discord,1,new {cmd="SET_ACTIVITY",evt="ERROR",nonce=Json.Text(request,"nonce"),data=new {message="Invalid image"}});
                        else Write(discord,1,new {cmd="SET_ACTIVITY",nonce=Json.Text(request,"nonce"),data=new {}});
                    }
                } catch(Exception error) { discordError=error; }
            }) {IsBackground=true};
            var bridgeThread=new Thread(()=>{
                try {
                    native.WaitForConnection();
                    new Bridge(native,()=>{
                        var pipe=new NamedPipeClientStream(".",discordName,PipeDirection.InOut,PipeOptions.Asynchronous);
                        pipe.Connect(2000); return new DiscordClient(pipe,1234);
                    }).Run(native);
                } catch(Exception error) { bridgeError=error; }
            }) {IsBackground=true};
            discordThread.Start(); bridgeThread.Start();
            using(var browser=new NamedPipeClientStream(".",nativeName,PipeDirection.InOut,PipeOptions.Asynchronous)) {
                browser.Connect(2000);
                var status=ReadStatus(browser,"connecting");
                Check(Object.Equals(Json.Get(status,"artworkOmitted"),false),"native connecting status has no artwork warning");
                var rejected=Json.Decode("{\"details\":\"Example\",\"assets\":{\"large_image\":\"https://m.media-amazon.com/images/rejected.jpg\"}}");
                var accepted=Json.Decode("{\"details\":\"Example\",\"assets\":{\"large_image\":\"https://m.media-amazon.com/images/accepted.jpg\"}}");
                Protocol.WriteNative(browser,new {type="update",clientId="123456789012345678",activity=rejected});
                status=ReadStatus(browser,"connected");
                Check(Object.Equals(Json.Get(status,"published"),true) && Object.Equals(Json.Get(status,"artworkOmitted"),true),"native status reports acknowledged artwork fallback");
                Protocol.WriteNative(browser,new {type="update",clientId="123456789012345678",activity=accepted});
                status=ReadStatus(browser,"connected");
                Check(Object.Equals(Json.Get(status,"artworkOmitted"),false),"successful artwork clears the native warning");
                Protocol.WriteNative(browser,new {type="update",clientId="123456789012345678",activity=rejected});
                status=ReadStatus(browser,"connected");
                Check(Object.Equals(Json.Get(status,"artworkOmitted"),true),"cached artwork rejection remains explicit in native status");
                Protocol.WriteNative(browser,new {type="update",clientId="123456789012345678",activity=(object)null});
                status=ReadStatus(browser,"connected");
                Check(Object.Equals(Json.Get(status,"published"),false) && Object.Equals(Json.Get(status,"artworkOmitted"),false),"clearing presence clears the native artwork warning");
                Protocol.WriteNative(browser,new {type="invalid"});
                status=ReadStatus(browser,"error");
                Check(Object.Equals(Json.Get(status,"artworkOmitted"),false),"native errors do not retain an artwork warning");
            }
            if(!bridgeThread.Join(5000) || !discordThread.Join(5000)) throw new Exception("Bridge status test did not finish.");
            if(bridgeError!=null) throw bridgeError;
            if(discordError!=null) throw discordError;
        }
    }
    static int Main() {
        try {
            using(var memory=new MemoryStream()) {
                Protocol.WriteNative(memory,new {title="Zażółć 🎬"}); memory.Position=0;
                Check(Json.Text(Protocol.ReadNative(memory),"title")=="Zażółć 🎬","native framing preserves UTF-8");
                Check(Protocol.ReadNative(memory)==null,"clean EOF");
            }
            bool rejected=false;
            try { Protocol.ReadNative(new MemoryStream(BitConverter.GetBytes(Protocol.MaxLength+1))); } catch(InvalidDataException) { rejected=true; }
            Check(rejected,"oversized frames rejected");
            rejected=false;
            try { Protocol.ReadNative(new MemoryStream(new byte[]{10,0,0,0,123})); } catch(EndOfStreamException) { rejected=true; }
            Check(rejected,"truncated frames rejected");
            var sanitized=Activity.Sanitize(Json.Decode("{\"details\":\"Example\",\"type\":0,\"secret\":\"discard\",\"assets\":{\"large_image\":\"https://evil.test/image\"}}"));
            Check(!sanitized.ContainsKey("assets") && !sanitized.ContainsKey("secret") && (int)sanitized["type"]==3,"activity allowlist and image validation");
            string pipeName="prime-rpc-test-"+Guid.NewGuid().ToString("N");
            Exception serverError=null;
            using(var server=new NamedPipeServerStream(pipeName,PipeDirection.InOut,1,PipeTransmissionMode.Byte,PipeOptions.Asynchronous)) {
                var thread=new Thread(()=>{
                    try {
                        server.WaitForConnection(); int opcode;
                        var handshake=ReadRpc(server,out opcode);
                        if(opcode!=0 || Json.Text(handshake,"client_id")!="1561253975787966494") throw new Exception("Incorrect handshake");
                        Write(server,1,new {cmd="DISPATCH",evt="READY",data=new {v=1}});
                        for(int i=0;i<2;i++) {
                            var request=ReadRpc(server,out opcode);
                            if(opcode!=1 || Json.Text(request,"cmd")!="SET_ACTIVITY") throw new Exception("Incorrect command");
                            var args=Json.Get(request,"args") as Dictionary<string,object>;
                            if((i==0)!=(Json.Get(args,"activity")!=null)) throw new Exception("Activity/clear mismatch");
                            if(i==0) {
                                Write(server,3,new {ping=1});
                                ReadRpc(server,out opcode); if(opcode!=4) throw new Exception("No pong");
                            }
                            Write(server,1,new {cmd="SET_ACTIVITY",nonce=Json.Text(request,"nonce"),data=new {}});
                        }
                    } catch(Exception error) { serverError=error; }
                }) {IsBackground=true};
                thread.Start();
                using(var pipe=new NamedPipeClientStream(".",pipeName,PipeDirection.InOut,PipeOptions.Asynchronous)) {
                    pipe.Connect(2000);
                    using(var client=new DiscordClient(pipe,1234)) {
                        client.Handshake("1561253975787966494");
                        client.SetActivity(sanitized); client.SetActivity(null);
                    }
                }
                Check(thread.Join(5000),"mock Discord server completes");
                if(serverError!=null) throw serverError;
                Check(true,"named-pipe handshake, SET_ACTIVITY, ping/pong, and clear");
            }
            ArtworkTests();
            BridgeStatusTests();
            Console.WriteLine(checks+" helper checks passed."); return 0;
        } catch(Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
