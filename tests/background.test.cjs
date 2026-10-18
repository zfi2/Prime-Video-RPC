const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){
  let listener; const messages=[],ports=[];
  const runtime={id:'a'.repeat(32),getURL:p=>'chrome-extension://'+'a'.repeat(32)+'/'+p,
    onMessage:{addListener:fn=>listener=fn},
    connectNative:()=>{
      let receive,disconnected;
      const port={onMessage:{addListener:fn=>receive=fn},onDisconnect:{addListener:fn=>disconnected=fn},
        postMessage:m=>messages.push(m),disconnect:()=>disconnected(),receive:message=>receive(message)};
      ports.push(port); return port;
    }};
  const context=vm.createContext({URL,Date,console,setInterval(){},importScripts(){},PrimeRpc:require('../extension/core.js'),
    chrome:{runtime,storage:{local:{get:async()=>({}),set:async()=>{}}},tabs:{onRemoved:{addListener(){}},onUpdated:{addListener(){}}},alarms:{create(){},onAlarm:{addListener(){}}}}});
  vm.runInContext(fs.readFileSync(require.resolve('../extension/background.js'),'utf8'),context);
  return {messages,runtime,ports,send:(message,sender)=>new Promise(resolve=>listener(message,sender,resolve))};
}
test('rejects playback from other sites and settings messages from a content script',async()=>{
  const s=setup(); const page={id:s.runtime.id,tab:{id:1},frameId:0,url:'https://evil.test'};
  assert.equal((await s.send({type:'playback',playback:{active:true,title:'Injected'}},page)).ok,false);
  page.url='https://www.primevideo.com/';
  assert.equal((await s.send({type:'settings',settings:{enabled:false}},page)).ok,false);
});

test('forwards artwork outcome and resets it on recovery, clear, and legacy helper messages',async()=>{
  const s=setup(),popup={id:s.runtime.id,url:s.runtime.getURL('popup.html')};
  await s.send({type:'status'},popup);
  const status=async message=>{
    s.ports.at(-1).receive({type:'status',state:'connected',published:true,message:'Message wording is irrelevant',...message});
    return (await s.send({type:'status'},popup)).status;
  };
  assert.equal((await status({artworkOmitted:true})).artworkOmitted,true);
  assert.equal((await status({artworkOmitted:false})).artworkOmitted,false);
  await status({artworkOmitted:true});
  assert.equal((await status({published:false,artworkOmitted:true})).artworkOmitted,false);
  await status({artworkOmitted:true});
  assert.equal((await status({})).artworkOmitted,false);
  assert.equal((await status({artworkOmitted:'true'})).artworkOmitted,false);
  assert.equal((await status({state:'error',artworkOmitted:true})).artworkOmitted,false);
});

test('disconnecting, reconnecting, and disabling sharing clear artwork outcome',async()=>{
  const s=setup(),popup={id:s.runtime.id,url:s.runtime.getURL('popup.html')};
  await s.send({type:'status'},popup);
  const omitted={type:'status',state:'connected',published:true,artworkOmitted:true};
  const old=s.ports.at(-1);
  old.receive(omitted);
  old.disconnect();
  const missing=(await s.send({type:'status'},popup)).status;
  assert.equal(missing.state,'helper-missing');assert.equal(missing.artworkOmitted,false);
  assert.equal((await s.send({type:'reconnect'},popup)).status.artworkOmitted,false);
  old.receive(omitted);
  assert.equal((await s.send({type:'status'},popup)).status.artworkOmitted,false);
  s.ports.at(-1).receive(omitted);
  const disabled=(await s.send({type:'settings',settings:{enabled:false}},popup)).status;
  assert.equal(disabled.state,'disabled');assert.equal(disabled.artworkOmitted,false);
});
test('updates playback, applies privacy toggles, and clears after playback ends',async()=>{
  const s=setup(); const page={id:s.runtime.id,tab:{id:1},frameId:0,url:'https://www.primevideo.com/detail/test'};
  const popup={id:s.runtime.id,url:s.runtime.getURL('popup.html')};
  await s.send({type:'playback',playback:{active:true,title:'Example show',paused:false}},page);
  assert.equal(s.messages.at(-1).activity.details,'Example show');
  await s.send({type:'settings',settings:{showTitle:false}},popup);
  assert.equal(s.messages.at(-1).activity.details,'Watching Prime Video');
  await s.send({type:'playback',playback:{active:false}},page);
  assert.equal(s.messages.at(-1).activity,null);
});
