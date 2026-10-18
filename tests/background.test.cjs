const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function setup(){
  let listener,disconnectListener; const messages=[];
  const runtime={id:'a'.repeat(32),getURL:p=>'chrome-extension://'+'a'.repeat(32)+'/'+p,
    onMessage:{addListener:fn=>listener=fn},
    connectNative:()=>({onMessage:{addListener(){}},onDisconnect:{addListener:fn=>disconnectListener=fn},postMessage:m=>messages.push(m),disconnect(){disconnectListener();}})};
  const context=vm.createContext({URL,Date,console,setInterval(){},importScripts(){},PrimeRpc:require('../extension/core.js'),
    chrome:{runtime,storage:{local:{get:async()=>({}),set:async()=>{}}},tabs:{onRemoved:{addListener(){}},onUpdated:{addListener(){}}},alarms:{create(){},onAlarm:{addListener(){}}}}});
  vm.runInContext(fs.readFileSync(require.resolve('../extension/background.js'),'utf8'),context);
  return {messages,runtime,send:(message,sender)=>new Promise(resolve=>listener(message,sender,resolve))};
}
test('rejects playback from other sites and settings messages from a content script',async()=>{
  const s=setup(); const page={id:s.runtime.id,tab:{id:1},frameId:0,url:'https://evil.test'};
  assert.equal((await s.send({type:'playback',playback:{active:true,title:'Injected'}},page)).ok,false);
  page.url='https://www.primevideo.com/';
  assert.equal((await s.send({type:'settings',settings:{enabled:false}},page)).ok,false);
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
