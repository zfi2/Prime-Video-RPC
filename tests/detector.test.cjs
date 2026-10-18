const {test}=require('node:test');
const assert=require('node:assert/strict');
const {createDetector}=require('../extension/detector.js');
function fixture() {
  const fields={'.atvwebplayersdk-title-text':{textContent:'Example show'},'.atvwebplayersdk-episode-info':{textContent:'S4 E5 Wukong'}};
  const player={querySelector:selector=>fields[selector] || null};
  const video={paused:true,ended:false,readyState:4,currentSrc:'blob:episode5',currentTime:879.5,duration:3693.184,playbackRate:1,seeking:false,poster:'',
    getBoundingClientRect:()=>({width:1920,height:953}),closest:()=>player};
  const dormant={...video,readyState:0,currentSrc:'',getBoundingClientRect:()=>({width:0,height:0})};
  const doc={title:'Prime Video: Example show',querySelectorAll:()=>[dormant,video],
    querySelector:selector=>selector.includes('hero-background') ? {src:'https://images-eu.ssl-images-amazon.com/images/a.jpg'} : null};
  return {video,doc,fields,view:{getComputedStyle:()=>({visibility:'visible',display:'block'})}};
}
test('chooses the active player over the dormant first player',()=>{
  const f=fixture(),detector=createDetector();
  const p=detector.read(f.doc,'https://www.primevideo.com/detail/test',f.view);
  assert.equal(p.title,'Example show'); assert.equal(p.episode,'S4 E5 Wukong');
  assert.equal(p.currentTime,879.5); assert.equal(p.paused,true);
  assert.match(p.artwork,/images-eu/);
});
test('retains episode when controls unmount; clears it for a new source or page',()=>{
  const f=fixture(),d=createDetector(),url='https://www.primevideo.com/detail/test';
  d.read(f.doc,url,f.view);
  delete f.fields['.atvwebplayersdk-title-text']; delete f.fields['.atvwebplayersdk-episode-info'];
  assert.equal(d.read(f.doc,url,f.view).episode,'S4 E5 Wukong');
  f.video.currentSrc='blob:episode6';
  assert.equal(d.read(f.doc,url,f.view).episode,'');
  f.fields['.atvwebplayersdk-episode-info']={textContent:'S4 E6'}; d.read(f.doc,url,f.view);
  delete f.fields['.atvwebplayersdk-episode-info'];
  assert.equal(d.read(f.doc,'https://www.primevideo.com/detail/another',f.view).episode,'');
});
test('ended, hidden, and unloaded videos clear presence; picture-in-picture is retained',()=>{
  const f=fixture(),d=createDetector(),url='https://www.primevideo.com/detail/test';
  f.video.ended=true; assert.equal(d.read(f.doc,url,f.view).active,false);
  f.video.ended=false; f.video.getBoundingClientRect=()=>({width:0,height:0});
  assert.equal(d.read(f.doc,url,f.view).active,false);
  f.doc.pictureInPictureElement=f.video; assert.equal(d.read(f.doc,url,f.view).active,true);
  f.video.readyState=0; assert.equal(d.read(f.doc,url,f.view).active,false);
});
test('title fallback reads a logo alt attribute instead of reporting an empty heading',()=>{
  const f=fixture(),d=createDetector(); delete f.fields['.atvwebplayersdk-title-text'];
  const previous=f.doc.querySelector;
  f.doc.querySelector=selector=>selector==='main h1' ? {textContent:'',getAttribute:()=>null,querySelector:()=>({alt:'Logo title'})}:previous(selector);
  assert.equal(d.read(f.doc,'https://www.primevideo.com/detail/test',f.view).title,'Logo title');
});
