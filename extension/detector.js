(function (root) {
  'use strict';
  const C = root.PrimeRpc || require('./core.js');
  function createDetector() {
    let previousVideo = null, previousUrl = '', previousSource = '', cached = {};
    function reset() { previousVideo = null; previousSource = ''; cached = {}; }
    function read(doc, href, view) {
      const url = href.split(/[?#]/)[0];
      if (url !== previousUrl) { reset(); previousUrl = url; }
      const candidates = [...doc.querySelectorAll('[id^="dv-web-player"] video')].filter(video => {
        const bounds = video.getBoundingClientRect();
        const style = view.getComputedStyle(video);
        return !video.ended && video.readyState >= 1 && (video.currentSrc || video.src) &&
          ((bounds.width > 200 && bounds.height > 100 && style.visibility !== 'hidden' && style.display !== 'none') || doc.pictureInPictureElement === video);
      });
      candidates.sort((a,b) => Number(a.paused) - Number(b.paused) || b.getBoundingClientRect().width - a.getBoundingClientRect().width);
      const video = candidates[0];
      if (!video) { reset(); return { active: false }; }
      const source = video.currentSrc || video.src;
      if (video !== previousVideo || source !== previousSource) { reset(); previousVideo = video; previousSource = source; }
      const player = video.closest('[id^="dv-web-player"]');
      const readText = (scope, selectors) => {
        for (const selector of selectors) {
          const node = scope?.querySelector(selector);
          const value = C.text(node?.textContent || node?.getAttribute('alt') || node?.querySelector('img')?.alt);
          if (value) return value;
        }
        return '';
      };
      // Player controls are mounted/unmounted as the pointer moves. Cache only for this video/source.
      const title = readText(player, ['.atvwebplayersdk-title-text', 'h1']) || cached.title ||
        readText(doc, ['main h1', 'h1[data-automation-id="title"]']) ||
        C.text(doc.title.replace(/^Prime Video\s*:\s*/i, '').replace(/\s*[|–-]\s*Prime Video$/i, ''));
      const episode = readText(player, ['.atvwebplayersdk-episode-info', '.atvwebplayersdk-subtitle-text']) || cached.episode || '';
      const image = doc.querySelector('main [data-automation-id="hero-background"] img');
      const artwork = C.artworkUrl(video.poster) || C.artworkUrl(image?.currentSrc || image?.src) || cached.artwork || '';
      cached = { title, episode, artwork };
      if (!title || /^Prime Video$|^Watch movies,/i.test(title)) return { active: false };
      return { active: true, ...cached, paused: video.paused,
        buffering: !video.paused && (video.readyState < 3 || video.seeking),
        currentTime: video.currentTime, duration: Number.isFinite(video.duration) ? video.duration : 0,
        playbackRate: video.playbackRate };
    }
    return { read, reset };
  }
  root.PrimeDetector = { createDetector };
  if (typeof module !== 'undefined') module.exports = { createDetector };
})(globalThis);
