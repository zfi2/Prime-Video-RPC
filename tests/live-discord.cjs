// Optional real-client smoke check. Connects and clears only; never publishes a test title.
const {spawn}=require('node:child_process');
const path=require('node:path');
const clientId=process.argv[2];
if(!/^\d{17,20}$/.test(clientId||'')) throw new Error('Pass a Discord Application ID.');
const child=spawn(path.resolve(__dirname,'../dist/PrimeVideoRpc.exe'),[],{windowsHide:true,stdio:['pipe','pipe','pipe']});
let buffer=Buffer.alloc(0),done=false;
const timeout=setTimeout(()=>{console.error('Timed out waiting for Discord.');child.kill();process.exitCode=1;},20000);
child.stdout.on('data',chunk=>{
  buffer=Buffer.concat([buffer,chunk]);
  while(buffer.length>=4&&buffer.length>=4+buffer.readUInt32LE(0)) {
    const size=buffer.readUInt32LE(0),message=JSON.parse(buffer.subarray(4,4+size));buffer=buffer.subarray(4+size);
    console.log(JSON.stringify(message));
    if(message.state==='connected') {done=true;clearTimeout(timeout);child.stdin.end();}
  }
});
child.on('error',error=>{clearTimeout(timeout);console.error(error.message);process.exitCode=1;});
child.on('exit',code=>{clearTimeout(timeout);if(!done||code)process.exitCode=1;});
const message=Buffer.from(JSON.stringify({type:'update',clientId,activity:null}));
const header=Buffer.alloc(4);header.writeUInt32LE(message.length);child.stdin.write(Buffer.concat([header,message]));
