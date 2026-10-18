const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const C=require('../extension/core.js');
const html=fs.readFileSync(require.resolve('../extension/popup.html'),'utf8');
const script=fs.readFileSync(require.resolve('../extension/popup.js'),'utf8');
const flush=()=>new Promise(resolve=>setImmediate(resolve));

async function setup() {
  const elements=new Map();
  for(const match of html.matchAll(/<[\w-]+\b[^>]*\bid="([^"]+)"[^>]*>/g)) {
    const classes=new Set(),attrs={},handlers={};
    const element={textContent:'',hidden:/\bhidden\b/.test(match[0]),checked:false,style:{},
      classList:{add:name=>classes.add(name),remove:name=>classes.delete(name),contains:name=>classes.has(name),
        toggle(name,on){if(on)classes.add(name);else classes.delete(name);}},
      getAttribute:name=>attrs[name]??null,removeAttribute:name=>delete attrs[name],
      addEventListener(type,fn){handlers[type]=fn;},
      emit(type,event={}){return handlers[type]?.(event);},
      click(){element.checked=!element.checked;return element.emit('change');}};
    Object.defineProperty(element,'src',{get:()=>attrs.src,set:value=>{attrs.src=value;}});
    elements.set(match[1],element);
  }
  const state={settings:C.settings(),status:{state:'connected',published:true,artworkOmitted:false,message:'Presence updated in Discord.'},
    playback:C.snapshot({active:true,title:'Example show',episode:'S1 E2',artwork:'https://m.media-amazon.com/images/example.jpg',currentTime:60,duration:3600})};
  let poll;
  const context=vm.createContext({PrimeRpc:C,document:{getElementById:id=>{assert.ok(elements.has(id),`Missing popup element: ${id}`);return elements.get(id);}},
    chrome:{runtime:{sendMessage:async message=>{
      if(message.type==='settings')state.settings=C.settings({...state.settings,...message.settings});
      return {...state,activity:C.activity(state.playback,state.settings),extensionId:'a'.repeat(32)};
    }}},setInterval:fn=>{poll=fn;},setTimeout(){},clearTimeout(){}});
  vm.runInContext(script,context);await flush();
  return {state,get:id=>elements.get(id),refresh:async()=>{poll();await flush();}};
}

test('artwork fallback shows a warning and truthful card without changing privacy settings',async()=>{
  const p=await setup();
  p.state.status.artworkOmitted=true;
  p.state.status.message='A differently worded helper message';
  await p.refresh();
  assert.equal(p.get('connection-detail').hidden,false);
  assert.match(p.get('connection-detail').textContent,/Discord rejected this image/);
  assert.equal(p.get('preview-label').textContent,'On Discord · no artwork');
  assert.equal(p.get('cover-rejected').hidden,false);
  assert.equal(p.get('cover').classList.contains('off'),true);
  assert.equal(p.get('cover-placeholder').hidden,true);
  assert.equal(p.get('cover-off').hidden,true);
  for(const id of ['artwork','backdrop']) {
    assert.equal(p.get(id).hidden,true);
    assert.equal(p.get(id).getAttribute('src'),null);
  }
  assert.equal(p.get('showArtwork').checked,true);
  assert.equal(p.get('preview-title').textContent,'Example show');
  assert.equal(p.get('preview-state-text').textContent,'S1 E2');
  assert.equal(p.get('preview-timer').textContent,'1:00 / 1:00:00');
  // Removing a rejected image can leave an already queued browser error event.
  await p.get('artwork').emit('error');
  assert.equal(p.get('cover-placeholder').hidden,true);
});

test('successful artwork restores the image, backdrop, and normal badge',async()=>{
  const p=await setup();
  p.state.status.artworkOmitted=true;await p.refresh();
  p.state.status.artworkOmitted=false;await p.refresh();
  assert.equal(p.get('connection-detail').hidden,true);
  assert.equal(p.get('cover-rejected').hidden,true);
  assert.equal(p.get('cover').classList.contains('off'),false);
  assert.equal(p.get('cover').classList.contains('rejected'),false);
  assert.equal(p.get('preview-label').textContent,'On Discord');
  for(const id of ['artwork','backdrop']) {
    assert.equal(p.get(id).hidden,false);
    assert.equal(p.get(id).getAttribute('src'),p.state.playback.artwork);
  }
});

test('cleared and hidden activity do not retain the artwork warning during acknowledgement delays',async()=>{
  for(const change of [
    state=>{state.playback=null;state.status.published=false;},
    state=>{state.settings.enabled=false;},
    state=>{state.playback.paused=true;state.settings.showPaused=false;}
  ]) {
    const p=await setup();
    p.state.status.artworkOmitted=true;await p.refresh();
    change(p.state);await p.refresh();
    assert.equal(p.get('connection-detail').hidden,true);
    assert.equal(p.get('cover-rejected').hidden,true);
    assert.equal(p.get('preview-label').textContent,'Preview');
  }
});

test('switching artwork off keeps the hidden placeholder separate from rejection',async()=>{
  const p=await setup();
  p.state.status.artworkOmitted=true;await p.refresh();
  await p.get('showArtwork').click();
  assert.equal(p.state.settings.showArtwork,false);
  assert.equal(p.get('cover-off').hidden,false);
  assert.equal(p.get('cover-rejected').hidden,true);
  assert.equal(p.get('connection-detail').hidden,true);
  assert.equal(p.get('artwork').hidden,true);
});

test('missing flag and browser image failures are not treated as Discord rejection',async()=>{
  const p=await setup();
  delete p.state.status.artworkOmitted;
  p.state.status.message='Presence shared without artwork. Discord rejected this image.';
  await p.refresh();
  assert.equal(p.get('cover-rejected').hidden,true);
  assert.equal(p.get('preview-label').textContent,'On Discord');
  await p.get('artwork').emit('error');await p.refresh();
  assert.equal(p.get('artwork').hidden,true);
  assert.equal(p.get('cover-placeholder').hidden,false);
  assert.equal(p.get('cover-rejected').hidden,true);
  assert.equal(p.get('connection-detail').hidden,true);
});

test('a lost connection replaces rejection with the connection problem',async()=>{
  const p=await setup();
  p.state.status.artworkOmitted=true;await p.refresh();
  p.state.status={state:'helper-missing',published:false,artworkOmitted:false,message:'Helper disconnected.'};
  await p.refresh();
  assert.equal(p.get('connection-detail').textContent,'Helper disconnected.');
  assert.equal(p.get('cover-rejected').hidden,true);
  assert.equal(p.get('preview-label').textContent,'Preview');
});
