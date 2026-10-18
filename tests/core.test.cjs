const {test} = require('node:test');
const assert = require('node:assert/strict');
const C = require('../extension/core.js');
const base = { active:true,title:'Example show',episode:'S4 E5 Wukong',artwork:'https://m.media-amazon.com/images/test.jpg',paused:false,buffering:false,currentTime:120,duration:3600,playbackRate:1 };
test('playing presence has Watching type, metadata, and timestamps in seconds',()=>{
  const activity = C.activity(base,C.DEFAULTS,1800000000000);
  assert.equal(activity.type,3); assert.equal(activity.details,'Example show');
  assert.equal(activity.state,'S4 E5 Wukong');
  assert.deepEqual(activity.timestamps,{start:1799999880,end:1800003480});
  assert.equal(activity.assets.large_image,base.artwork);
});
test('each privacy switch removes the corresponding field, including artwork tooltip',()=>{
  const activity=C.activity(base,{showTitle:false,showEpisode:false,showArtwork:false,showTimer:false});
  assert.deepEqual(activity,{type:3,details:'Watching Prime Video'});
  assert.equal(C.activity(base,{showTitle:false}).assets.large_text,'Prime Video');
  assert.equal(C.activity(base,{enabled:false}),null);
});
test('paused presence stops the clock; disabling paused sharing hides it',()=>{
  const paused={...base,paused:true};
  assert.equal(C.activity(paused,{}).state,'S4 E5 Wukong · Paused');
  assert.equal(C.activity(paused,{}).timestamps,undefined);
  assert.equal(C.activity(paused,{showPaused:false}),null);
});
test('buffering, seeking, live streams, and nonstandard speeds do not report a false countdown',()=>{
  assert.equal(C.activity({...base,buffering:true},{}).timestamps,undefined);
  assert.equal(C.activity({...base,duration:Infinity},{}).timestamps,undefined);
  const rate = C.activity({...base,playbackRate:2},{},1800000000000);
  assert.deepEqual(rate.timestamps,{start:1799999940,end:1800001740});
  const seek = C.activity({...base,currentTime:500},{},1800000000000);
  assert.equal(seek.timestamps.end,1800003100);
});
test('artwork URLs and site origins are constrained',()=>{
  for(const url of ['https://evil.test/x','http://m.media-amazon.com/x','https://m.media-amazon.com.evil.test/x','https://user@images-amazon.com/x','data:image/png,x']) assert.equal(C.artworkUrl(url),'');
  assert.ok(C.artworkUrl('https://images-eu.ssl-images-amazon.com/images/a.jpg'));
  assert.equal(C.primeUrl('https://www.primevideo.com/region/eu/detail/test'),true);
  assert.equal(C.primeUrl('https://primevideo.com.evil.test'),false);
  assert.equal(C.primeUrl('http://primevideo.com'),false);
});
test('multiple playing tabs do not fight; stale entries expire; playing wins over paused',()=>{
  const now=100000;
  const sessions=new Map([[1,{seen:now,started:10,snapshot:base}],[2,{seen:now,started:20,snapshot:base}]]);
  assert.equal(C.selectSession(sessions,1,now)[0],1);
  sessions.get(1).snapshot={...base,paused:true};
  assert.equal(C.selectSession(sessions,1,now)[0],2);
  sessions.get(2).seen=0;
  assert.equal(C.selectSession(sessions,2,now)[0],1);
  assert.equal(C.selectSession(sessions,1,now+C.TTL),null);
});
test('invalid values cannot leak arbitrary settings or malformed payloads',()=>{
  assert.equal(C.snapshot({active:true,title:''}),null);
  assert.equal(C.activity(null,{}),null);
  assert.equal(C.settings({enabled:'false',arbitrary:'value'}).enabled,true);
  assert.equal(C.settings({arbitrary:'value'}).arbitrary,undefined);
  assert.equal(C.validId('1561253975787966494'),true);
  assert.equal(C.validId('token'),false);
  assert.equal(C.text('A\n\u0000 B'),'A B');
  assert.equal(C.formatTime(3661),'1:01:01');
});
test('countdown stays anchored between content-script heartbeats',()=>{
  const seen=1800000000000,entry={seen,snapshot:base};
  const initial=C.activity(C.projectPlayback(entry,seen),{},seen);
  const later=C.activity(C.projectPlayback(entry,seen+9000),{},seen+9000);
  assert.deepEqual(later.timestamps,initial.timestamps);
  assert.equal(C.projectPlayback({...entry,snapshot:{...base,paused:true}},seen+9000).currentTime,120);
  assert.equal(C.projectPlayback({...entry,snapshot:{...base,buffering:true}},seen+9000).currentTime,120);
  assert.equal(C.projectPlayback({...entry,snapshot:{...base,playbackRate:2}},seen+9000).currentTime,138);
});
