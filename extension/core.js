(function (root) {
  'use strict';
  const DEFAULTS = Object.freeze({
    clientId: '1561253975787966494', enabled: true, showTitle: true,
    showEpisode: true, showArtwork: true, showTimer: true, showPaused: true
  });
  const TTL = 70000;
  const text = (value, max = 128) => typeof value === 'string'
    ? Array.from(value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, max).join('') : '';
  function primeUrl(value) {
    try { const u = new URL(value); return u.protocol === 'https:' && ['primevideo.com', 'www.primevideo.com'].includes(u.hostname); }
    catch { return false; }
  }
  function artworkUrl(value) {
    try {
      const u = new URL(value);
      return u.protocol === 'https:' && !u.username && !u.password && !u.port &&
        /(^|\.)(media-amazon\.com|ssl-images-amazon\.com|images-amazon\.com)$/.test(u.hostname) && u.href.length <= 1024 ? u.href : '';
    } catch { return ''; }
  }
  function settings(value = {}) {
    const result = { ...DEFAULTS };
    for (const key of Object.keys(DEFAULTS)) {
      if (key === 'clientId') { if (typeof value.clientId === 'string') result.clientId = value.clientId.trim(); }
      else if (typeof value[key] === 'boolean') result[key] = value[key];
    }
    return result;
  }
  const validId = value => typeof value === 'string' && /^[0-9]{17,20}$/.test(value);
  function snapshot(value) {
    if (!value || value.active !== true) return null;
    const title = text(value.title);
    if (!title) return null;
    const number = (n, max) => typeof n === 'number' && Number.isFinite(n) ? Math.min(max, Math.max(0, n)) : 0;
    return { active: true, title, episode: text(value.episode), artwork: artworkUrl(value.artwork),
      paused: value.paused === true, buffering: value.buffering === true,
      currentTime: number(value.currentTime, 604800), duration: number(value.duration, 604800),
      playbackRate: number(value.playbackRate, 16) || 1 };
  }
  function activity(item, preferences, now = Date.now()) {
    const s = settings(preferences), p = snapshot(item);
    if (!s.enabled || !p || (p.paused && !s.showPaused)) return null;
    const result = { type: 3, details: s.showTitle ? p.title : 'Watching Prime Video' };
    const states = [];
    if (s.showEpisode && p.episode) states.push(p.episode);
    if (p.paused) states.push('Paused');
    else if (p.buffering) states.push('Buffering');
    if (states.length) result.state = text(states.join(' · '));
    if (s.showArtwork && p.artwork) result.assets = { large_image: p.artwork, large_text: s.showTitle ? p.title : 'Prime Video' };
    if (s.showTimer && !p.paused && !p.buffering && p.duration > p.currentTime) {
      result.timestamps = { start: Math.floor(now / 1000 - p.currentTime / p.playbackRate),
        end: Math.ceil(now / 1000 + (p.duration - p.currentTime) / p.playbackRate) };
    }
    return result;
  }
  function selectSession(sessions, currentId, now = Date.now()) {
    const entries = [...sessions.entries()].filter(([, entry]) => now - entry.seen < TTL);
    // Keep the current playing tab stable; polling order must not decide the winner.
    const current = entries.find(([id]) => id === currentId);
    if (current && !current[1].snapshot.paused) return current;
    return entries.filter(([, e]) => !e.snapshot.paused).sort((a,b) => b[1].started - a[1].started)[0] ||
      current || entries.sort((a,b) => b[1].started - a[1].started)[0] || null;
  }
  function projectPlayback(entry, now = Date.now()) {
    if (!entry) return null;
    const p = { ...entry.snapshot };
    if (!p.paused && !p.buffering) {
      p.currentTime += Math.max(0, now - entry.seen) / 1000 * p.playbackRate;
      if (p.duration > 0) p.currentTime = Math.min(p.duration, p.currentTime);
    }
    return p;
  }
  function formatTime(seconds) {
    const n = Math.max(0, Math.floor(seconds || 0));
    return n >= 3600 ? `${Math.floor(n/3600)}:${String(Math.floor(n/60)%60).padStart(2,'0')}:${String(n%60).padStart(2,'0')}` : `${Math.floor(n/60)}:${String(n%60).padStart(2,'0')}`;
  }
  const api = { DEFAULTS, TTL, text, primeUrl, artworkUrl, settings, validId, snapshot, activity, selectSession, projectPlayback, formatTime };
  root.PrimeRpc = api;
  if (typeof module !== 'undefined') module.exports = api;
})(globalThis);
