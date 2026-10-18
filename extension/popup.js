'use strict';
const $ = id => document.getElementById(id);
let current = null, busy = false, setupSeen = false, failedImage = '', feedbackTimer = 0;
const toggles = Object.keys(PrimeRpc.DEFAULTS).filter(key => key !== 'clientId');
const descriptions = {
  starting:['Starting up','Checking your local helper.'], connecting:['Connecting','Waiting for Discord…'],
  connected:['Connected to Discord','Your helper is ready.'], 'helper-missing':['Install the helper','Run Install.cmd, then reconnect.'],
  'discord-missing':['Waiting for Discord','Open the Discord desktop app.'], disabled:['Sharing is off','Your activity is hidden.'],
  'needs-id':['Application ID needed','Add your ID in Connection & setup.'], error:['Connection needs attention','Try reconnecting, or check Connection & setup.']
};
// Healthy and switched-off states are fully described by the status line; the notice is only for problems.
const quietStates = ['connected', 'disabled'];
const setupStates = ['needs-id', 'helper-missing'];
const setText = (id, value) => { const element = $(id); if (element.textContent !== value) element.textContent = value; };
function feedback(message, error = false) {
  clearTimeout(feedbackTimer);
  setText('feedback', message); $('feedback').className = error ? 'error' : '';
  if (message && !error) feedbackTimer = setTimeout(() => setText('feedback', ''), 1800);
}
function render(data, syncInputs = false) {
  if (!data?.settings) return;
  current = data;
  const {settings, status, activity, playback} = data;
  if (syncInputs) { for (const key of toggles) $(key).checked = settings[key]; $('clientId').value = settings.clientId; }

  const [title, description] = descriptions[status.state] || descriptions.error;
  const detail = ['connected','error','helper-missing'].includes(status.state) ? status.message || description : description;
  const showDetail = !quietStates.includes(status.state);
  setText('connection-title', title);
  setText('connection-detail', showDetail ? detail : ''); $('connection-detail').hidden = !showDetail;
  $('status-dot').className = `dot ${status.state}`;
  setText('extension-id', data.extensionId);
  // First-run problems are fixed in the setup panel, so open it once instead of making people hunt for it.
  if (setupStates.includes(status.state) && !setupSeen) { setupSeen = true; $('setup').open = true; }

  // A field is "hidden" when something is being shared but this detail is switched off.
  const hidden = key => !!activity && !settings[key];
  const live = !!activity && !!status.published;
  setText('preview-label', live ? 'On Discord' : 'Preview');
  $('preview-label').classList.toggle('live', live);
  $('preview').classList.toggle('interactive', !!activity);

  const hiddenWhilePaused = settings.enabled && playback?.paused && !settings.showPaused;
  const titleOff = hidden('showTitle');
  setText('preview-title', titleOff ? 'Title hidden' : activity?.details || (!settings.enabled ? 'Sharing is off' : hiddenWhilePaused ? 'Hidden while paused' : 'Ready when you are'));
  $('preview-title').classList.toggle('off', titleOff);

  $('episode-off').hidden = !hidden('showEpisode');
  setText('preview-state-text', activity ? activity.state || '' :
    !settings.enabled ? 'Turn on sharing to show your activity.' :
    hiddenWhilePaused ? 'Resume playback to show it again.' : 'Open a movie or episode to get started.');

  const image = activity?.assets?.large_image, showImage = !!image && image !== failedImage, artworkOff = hidden('showArtwork');
  if (showImage && $('artwork').getAttribute('src') !== image) { $('artwork').src = image; $('backdrop').src = image; }
  if (!showImage) { $('artwork').removeAttribute('src'); $('backdrop').removeAttribute('src'); }
  $('artwork').hidden = !showImage; $('backdrop').hidden = !showImage;
  $('cover-placeholder').hidden = showImage || artworkOff;
  $('cover-off').hidden = !artworkOff;
  $('cover').classList.toggle('off', artworkOff);

  const timerOff = hidden('showTimer'), hasTime = !!activity?.timestamps;
  $('timer-row').hidden = !(timerOff || hasTime);
  $('timer-off').hidden = !timerOff;
  $('progress').hidden = !hasTime; $('preview-timer').hidden = !hasTime;
  setText('preview-timer', hasTime ? `${PrimeRpc.formatTime(playback.currentTime)} / ${PrimeRpc.formatTime(playback.duration)}` : '');
  $('progress-fill').style.width = `${Math.min(100, playback?.duration ? playback.currentTime / playback.duration * 100 : 0)}%`;
}
async function request(message, sync = false) {
  const data = await chrome.runtime.sendMessage(message);
  if (data?.error) throw new Error(data.error);
  render(data, sync); return data;
}
for (const key of toggles) $(key).addEventListener('change', async () => {
  busy = true;
  try { await request({type:'settings', settings:{[key]:$(key).checked}}); feedback('Saved'); }
  catch (error) { feedback(error.message, true); if (current) render(current, true); }
  finally { busy = false; }
});
// Tapping a field on the card flips the matching chip, which keeps one code path for saving.
$('preview').addEventListener('click', event => {
  const field = event.target.closest('[data-toggle]');
  if (field && !busy && $('preview').classList.contains('interactive')) $(field.dataset.toggle).click();
});
$('id-form').addEventListener('submit', async event => {
  event.preventDefault(); busy = true;
  try { await request({type:'settings',settings:{clientId:$('clientId').value.trim()}}); feedback('Application ID saved'); }
  catch (error) { feedback(error.message, true); }
  finally { busy = false; }
});
$('reconnect').addEventListener('click', () => {
  const button = $('reconnect');
  button.classList.remove('spin'); void button.offsetWidth; button.classList.add('spin');
  request({type:'reconnect'}).catch(error => feedback(error.message,true));
});
$('reconnect').addEventListener('animationend', () => $('reconnect').classList.remove('spin'));
$('setup').addEventListener('toggle', () => { setupSeen = true; });
$('artwork').addEventListener('error', () => { failedImage = $('artwork').getAttribute('src') || ''; $('artwork').hidden = true; $('backdrop').hidden = true; $('cover-placeholder').hidden = false; });
request({type:'status'},true).catch(error => feedback(error.message,true));
setInterval(() => { if (!busy) request({type:'status'}).catch(() => {}); },1500);
