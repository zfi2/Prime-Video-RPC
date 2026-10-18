importScripts('core.js');
const C = PrimeRpc, HOST = 'com.lain.prime_video_rpc';
let preferences = C.settings(), port = null, status = { state: 'starting', message: 'Starting…', published: false };
let activeId = null, reconnectAfter = 0;
const sessions = new Map();
const ready = chrome.storage.local.get('settings').then(value => { preferences = C.settings(value.settings); });

function connection() {
  if (port || Date.now() < reconnectAfter) return;
  status = { state: 'connecting', message: 'Connecting to the helper…', published: false };
  try {
    const connected = chrome.runtime.connectNative(HOST);
    port = connected;
    connected.onMessage.addListener(message => {
      if (port !== connected || message?.type !== 'status') return;
      status = { state: C.text(message.state, 32), message: C.text(message.message, 220), published: message.published === true };
    });
    connected.onDisconnect.addListener(() => {
      const error = chrome.runtime.lastError?.message || 'Helper disconnected.';
      if (port !== connected) return;
      port = null; reconnectAfter = Date.now() + 15000;
      status = { state: 'helper-missing', message: error, published: false };
    });
  } catch (error) {
    port = null; reconnectAfter = Date.now() + 15000;
    status = { state: 'helper-missing', message: C.text(error.message), published: false };
  }
}
function disconnect(state, message) {
  if (port) { const old = port; port = null; old.disconnect(); }
  status = { state, message, published: false };
}
function publish() {
  if (!preferences.enabled) { disconnect('disabled', 'Sharing is switched off.'); return; }
  if (!C.validId(preferences.clientId)) { disconnect('needs-id', 'Add your Discord Application ID.'); return; }
  for (const [id, entry] of sessions) if (Date.now() - entry.seen >= C.TTL) sessions.delete(id);
  const selected = C.selectSession(sessions, activeId);
  activeId = selected?.[0] ?? null;
  const activity = C.activity(C.projectPlayback(selected?.[1]), preferences);
  connection();
  if (port) {
    try { port.postMessage({ type: 'update', clientId: preferences.clientId, activity }); }
    catch { disconnect('helper-missing', 'The helper disconnected.'); reconnectAfter = Date.now() + 15000; }
  }
}
function view() {
  const selected = C.selectSession(sessions, activeId);
  const playback = C.projectPlayback(selected?.[1]);
  return { settings: preferences, status, playback,
    activity: C.activity(playback, preferences), extensionId: chrome.runtime.id };
}
async function handle(message, sender) {
  await ready;
  if (message?.type === 'playback') {
    if (sender.id !== chrome.runtime.id || !sender.tab || sender.frameId !== 0 || !C.primeUrl(sender.url)) return { ok: false };
    const item = C.snapshot(message.playback), previous = sessions.get(sender.tab.id);
    if (item) sessions.set(sender.tab.id, { snapshot:item, seen:Date.now(),
      started: !previous || (previous.snapshot.paused && !item.paused) ? Date.now() : previous.started });
    else sessions.delete(sender.tab.id);
    publish(); return { ok: true };
  }
  // Only our own popup can change privacy settings or request status.
  if (sender.id !== chrome.runtime.id || sender.tab || sender.url !== chrome.runtime.getURL('popup.html')) return { ok: false };
  if (message?.type === 'settings') {
    const next = C.settings({ ...preferences, ...message.settings });
    if (!C.validId(next.clientId)) throw new Error('Enter a 17–20 digit Application ID.');
    const changedId = next.clientId !== preferences.clientId;
    preferences = next;
    await chrome.storage.local.set({settings:preferences});
    if (changedId) { disconnect('connecting', 'Switching application…'); reconnectAfter = 0; }
    publish();
  } else if (message?.type === 'reconnect') {
    disconnect('connecting', 'Reconnecting…'); reconnectAfter = 0; publish();
  } else if (message?.type !== 'status') return { ok:false };
  return view();
}
chrome.runtime.onMessage.addListener((message, sender, respond) => {
  handle(message, sender).then(respond, error => respond({ error: C.text(error.message, 220) }));
  return true;
});
chrome.tabs.onRemoved.addListener(id => { sessions.delete(id); ready.then(publish); });
chrome.tabs.onUpdated.addListener((id, change) => {
  if (change.status === 'loading' || (change.url && !C.primeUrl(change.url))) { sessions.delete(id); ready.then(publish); }
});
chrome.alarms.onAlarm.addListener(alarm => { if (alarm.name === 'presence') ready.then(publish); });
chrome.alarms.create('presence', {periodInMinutes:0.5});
setInterval(() => ready.then(publish), 10000);
ready.then(publish);
