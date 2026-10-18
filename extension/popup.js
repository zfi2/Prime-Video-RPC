'use strict';
const $ = id => document.getElementById(id);
let current = null, busy = false;
const toggles = Object.keys(PrimeRpc.DEFAULTS).filter(key => key !== 'clientId');
const descriptions = {
  starting:['Starting up','Checking your local helper.'], connecting:['Connecting','Waiting for Discord…'],
  connected:['Connected to Discord','Your helper is ready.'], 'helper-missing':['Install the helper','Run Install.cmd, then reconnect.'],
  'discord-missing':['Waiting for Discord','Open the Discord desktop app.'], disabled:['Sharing is off','Your activity is hidden.'],
  'needs-id':['Application ID needed','Add your ID in Connection & setup.'], error:['Connection needs attention','Check the details below.']
};
function feedback(message, error = false) { $('feedback').textContent = message; $('feedback').className = error ? 'error' : ''; }
function render(data, syncInputs = false) {
  if (!data?.settings) return;
  current = data;
  const {settings, status, activity, playback} = data;
  if (syncInputs) { for (const key of toggles) $(key).checked = settings[key]; $('clientId').value = settings.clientId; }
  const [title, description] = descriptions[status.state] || descriptions.error;
  $('connection-title').textContent = title;
  $('connection-detail').textContent = ['error','helper-missing'].includes(status.state) ? status.message || description : description;
  $('status-dot').className = `dot ${status.state}`;
  $('extension-id').textContent = data.extensionId;
  $('preview-label').textContent = activity && status.published ? 'SHARING' : 'PREVIEW';
  $('preview-title').textContent = activity?.details || (!settings.enabled ? 'Sharing is off' : playback?.paused && !settings.showPaused ? 'Hidden while paused' : 'Ready when you are');
  $('preview-state').textContent = activity?.state || (activity ? 'Enjoy the show.' : 'Open a movie or episode to get started.');
  const image = activity?.assets?.large_image;
  if (image && $('artwork').getAttribute('src') !== image) $('artwork').src = image;
  if (!image) $('artwork').removeAttribute('src');
  $('artwork').hidden = !image; $('cover-placeholder').hidden = !!image;
  $('cover').hidden = !!activity && !settings.showArtwork;
  $('preview-timer').textContent = activity?.timestamps ? `${PrimeRpc.formatTime(playback.currentTime)} / ${PrimeRpc.formatTime(playback.duration)}` : '';
  $('progress').hidden = !activity?.timestamps;
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
$('id-form').addEventListener('submit', async event => {
  event.preventDefault(); busy = true;
  try { await request({type:'settings',settings:{clientId:$('clientId').value.trim()}}); feedback('Application ID saved'); }
  catch (error) { feedback(error.message, true); }
  finally { busy = false; }
});
$('reconnect').addEventListener('click', () => request({type:'reconnect'}).catch(error => feedback(error.message,true)));
$('artwork').addEventListener('error', () => { $('artwork').hidden = true; $('cover-placeholder').hidden = false; });
request({type:'status'},true).catch(error => feedback(error.message,true));
setInterval(() => { if (!busy) request({type:'status'}).catch(() => {}); },1500);
