(() => {
  'use strict';
  const detector = PrimeDetector.createDetector();
  let stopped = false, pending, last = '', sentAt = 0;
  function send(force = false) {
    if (stopped) return;
    const playback = detector.read(document, location.href, window);
    const fingerprint = JSON.stringify(playback);
    if (!force && fingerprint === last && Date.now() - sentAt < 10000) return;
    last = fingerprint; sentAt = Date.now();
    try { chrome.runtime.sendMessage({ type: 'playback', playback }).catch(() => { stopped = true; cleanup(); }); }
    catch { stopped = true; cleanup(); }
  }
  function schedule() { clearTimeout(pending); pending = setTimeout(() => send(), 200); }
  const events = ['play', 'pause', 'ended', 'seeked', 'seeking', 'loadedmetadata', 'emptied', 'waiting', 'playing', 'ratechange'];
  for (const event of events) document.addEventListener(event, schedule, true);
  document.addEventListener('visibilitychange', schedule);
  const observer = new MutationObserver(schedule);
  observer.observe(document.documentElement, { childList: true, subtree: true, characterData: true });
  const timer = setInterval(() => send(true), 10000);
  function cleanup() {
    clearInterval(timer); clearTimeout(pending); observer.disconnect();
    for (const event of events) document.removeEventListener(event, schedule, true);
    document.removeEventListener('visibilitychange', schedule);
  }
  window.addEventListener('pagehide', () => {
    try { chrome.runtime.sendMessage({type:'playback', playback:{active:false}}).catch(() => {}); } catch {}
    detector.reset();
  });
  window.addEventListener('pageshow', () => send(true));
  send(true);
})();
