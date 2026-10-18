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
    static Dictionary<string,object> ReadRpc(Stream stream,out int opcode) {
        var header=Protocol.ReadExact(stream,8,3000); opcode=BitConverter.ToInt32(header,0);
        return Json.Decode(Encoding.UTF8.GetString(Protocol.ReadBody(stream,header,4,3000)));
    }
    static void Write(Stream stream,int opcode,object value) { Protocol.WriteRpc(stream,opcode,Encoding.UTF8.GetBytes(Json.Encode(value))); }
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
            Console.WriteLine(checks+" helper checks passed."); return 0;
        } catch(Exception error) { Console.Error.WriteLine(error); return 1; }
    }
}
