import { loadSettings, saveSettings } from './storage.js';
import { PomodoroTimer } from './timer.js';
import * as bg from './background.js';
import * as spotify from './spotify.js';

const el = (id) => document.getElementById(id);

const settings = loadSettings();
const timer = new PomodoroTimer(settings);

// ---------------------------------------------------------------------------
// Timer UI
// ---------------------------------------------------------------------------

const timeDisplay = el('time-display');
const modeLabel = el('mode-label');
const sessionCount = el('session-count');
const ringProgress = el('ring-progress');
const linearFill = el('linear-bar-fill');
const startPauseBtn = el('start-pause-btn');
const resetBtn = el('reset-btn');
const skipBtn = el('skip-btn');

const RING_RADIUS = 90;
const RING_CIRCUMFERENCE = 2 * Math.PI * RING_RADIUS;
ringProgress.style.strokeDasharray = `${RING_CIRCUMFERENCE}`;

const MODE_LABELS = { focus: 'Focus', short: 'Short Break', long: 'Long Break' };

function formatTime(totalSeconds) {
  const s = Math.max(0, Math.round(totalSeconds));
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

function renderTimer() {
  const remainingFraction = timer.total > 0 ? timer.remaining / timer.total : 0;
  timeDisplay.textContent = formatTime(timer.remaining);
  modeLabel.textContent = MODE_LABELS[timer.mode];
  sessionCount.textContent = `Session ${timer.completedFocusSessions + 1}`;
  ringProgress.style.strokeDashoffset = `${RING_CIRCUMFERENCE * (1 - remainingFraction)}`;
  linearFill.style.width = `${(1 - remainingFraction) * 100}%`;
  document.title = `${formatTime(timer.remaining)} · ${MODE_LABELS[timer.mode]}`;
  startPauseBtn.textContent = timer.running ? 'Pause' : 'Start';
  document.body.classList.toggle('mode-break', timer.mode !== 'focus');
}

function playChime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const now = ctx.currentTime;
    [0, 0.18, 0.36].forEach((t, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = i === 2 ? 880 : 660;
      gain.gain.setValueAtTime(0.0001, now + t);
      gain.gain.exponentialRampToValueAtTime(0.3, now + t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.16);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + t);
      osc.stop(now + t + 0.2);
    });
  } catch (e) {
    /* ignore -- audio isn't essential */
  }
}

function notifySessionEnd(nextModeLabel) {
  if (typeof Notification !== 'undefined' && Notification.permission === 'granted') {
    new Notification('Pomodoro', { body: `Time's up! Starting ${nextModeLabel}.` });
  }
}

timer.addEventListener('tick', renderTimer);
timer.addEventListener('statechange', renderTimer);
timer.addEventListener('modechange', () => {
  renderTimer();
  if (settings.autoPauseSpotify && spotify.isConnected()) {
    if (timer.mode === 'focus') {
      spotify.resumePlayback().catch(() => {});
    } else {
      spotify.pausePlayback().catch(() => {});
    }
  }
});
timer.addEventListener('complete', () => {
  playChime();
  notifySessionEnd(MODE_LABELS[timer.mode]);
});

startPauseBtn.addEventListener('click', () => {
  if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
    Notification.requestPermission();
  }
  if (timer.running) {
    timer.pause();
  } else {
    timer.start();
  }
});
resetBtn.addEventListener('click', () => timer.reset());
skipBtn.addEventListener('click', () => timer.skip());
el('restart-sessions-btn').addEventListener('click', () => {
  timer.restartSessionCount();
  showToast('Session count restarted');
});

renderTimer();

// ---------------------------------------------------------------------------
// Settings drawer
// ---------------------------------------------------------------------------

const settingsOverlay = el('settings-overlay');
el('settings-btn').addEventListener('click', () => settingsOverlay.classList.remove('hidden'));
el('settings-close-btn').addEventListener('click', () => settingsOverlay.classList.add('hidden'));
settingsOverlay.addEventListener('click', (e) => {
  if (e.target === settingsOverlay) settingsOverlay.classList.add('hidden');
});

function selectTab(tabName) {
  document.querySelectorAll('.tab-btn').forEach((b) => b.classList.toggle('active', b.dataset.tab === tabName));
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('hidden', p.dataset.tabPanel !== tabName);
  });
}

document.querySelectorAll('.tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => selectTab(btn.dataset.tab));
});

el('setting-focus').value = settings.focusMin;
el('setting-short').value = settings.shortBreakMin;
el('setting-long').value = settings.longBreakMin;
el('setting-sessions').value = settings.sessionsBeforeLongBreak;
el('setting-autopause').checked = settings.autoPauseSpotify;

el('save-timer-settings').addEventListener('click', () => {
  settings.focusMin = Number(el('setting-focus').value) || 25;
  settings.shortBreakMin = Number(el('setting-short').value) || 5;
  settings.longBreakMin = Number(el('setting-long').value) || 15;
  settings.sessionsBeforeLongBreak = Number(el('setting-sessions').value) || 4;
  settings.autoPauseSpotify = el('setting-autopause').checked;
  saveSettings(settings);
  timer.updateSettings(settings);
  showToast('Timer settings saved');
});

// ---------------------------------------------------------------------------
// Background
// ---------------------------------------------------------------------------

const presetContainer = el('preset-swatches');
Object.entries(bg.PRESETS).forEach(([name, gradient]) => {
  const swatch = document.createElement('button');
  swatch.type = 'button';
  swatch.className = 'swatch';
  swatch.style.background = gradient;
  swatch.title = name;
  swatch.setAttribute('aria-label', name);
  swatch.addEventListener('click', () => {
    bg.applyPreset(name);
    showToast('Background updated');
  });
  presetContainer.appendChild(swatch);
});

el('bg-upload-input').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  await bg.applyUploadedImage(file);
  showToast('Background updated');
});

function renderYouTubeHistory() {
  const container = el('bg-youtube-history');
  const history = bg.getYouTubeHistory();
  container.innerHTML = '';
  if (!history.length) {
    container.classList.add('hidden');
    return;
  }
  history.forEach((entry) => {
    const row = document.createElement('div');
    row.className = 'bg-yt-history-row';

    const applyBtn = document.createElement('button');
    applyBtn.type = 'button';
    applyBtn.className = 'bg-yt-history-apply';

    const thumb = document.createElement('img');
    thumb.className = 'bg-yt-history-thumb';
    thumb.alt = '';
    thumb.src = `https://i.ytimg.com/vi/${entry.videoId}/mqdefault.jpg`;

    const title = document.createElement('span');
    title.className = 'bg-yt-history-title';
    title.textContent = entry.title || entry.url;

    applyBtn.appendChild(thumb);
    applyBtn.appendChild(title);
    applyBtn.addEventListener('click', async () => {
      try {
        await bg.applyYouTubeBackground(entry.url);
        showToast('Background updated');
        renderYouTubeHistory();
      } catch (err) {
        showToast(err.message);
      }
    });

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'bg-yt-history-remove';
    removeBtn.setAttribute('aria-label', 'Remove from history');
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      bg.removeYouTubeHistoryEntry(entry.videoId);
      renderYouTubeHistory();
    });

    row.appendChild(applyBtn);
    row.appendChild(removeBtn);
    container.appendChild(row);
  });
  container.classList.remove('hidden');
}

el('bg-youtube-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const url = el('bg-youtube-input').value;
  try {
    await bg.applyYouTubeBackground(url);
    el('bg-youtube-input').value = '';
    showToast('Background updated');
    renderYouTubeHistory();
  } catch (err) {
    showToast(err.message);
  }
});

renderYouTubeHistory();
bg.restoreBackground().finally(renderYouTubeHistory);

// ---------------------------------------------------------------------------
// Spotify
// ---------------------------------------------------------------------------

const SP_MODE_KEY = 'pomodoro_spotify_mode';

function selectSpotifyMode(mode) {
  document.querySelectorAll('.spotify-mode-tabs .tab-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.spMode === mode);
  });
  document.querySelectorAll('.sp-mode-panel').forEach((p) => {
    p.classList.toggle('hidden', p.dataset.spModePanel !== mode);
  });
  localStorage.setItem(SP_MODE_KEY, mode);
  if (mode === 'login') ensureSpotifyLoginConnected();
}

document.querySelectorAll('.spotify-mode-tabs .tab-btn').forEach((btn) => {
  btn.addEventListener('click', () => selectSpotifyMode(btn.dataset.spMode));
});

// --- Quick mode: paste a link, get Spotify's own embed. No login needed. ---

const SP_LINK_KEY = 'pomodoro_spotify_link';
const SP_DEFAULT_MESSAGE =
  "Paste a Spotify playlist, album, or track link (Share → Copy Link in Spotify). No login needed — Spotify may prompt you to sign in for full tracks, or it'll play 30-second previews otherwise.";

const spMessage = el('spotify-message');
const spEmbedWrap = el('spotify-embed-wrap');
const spEmbed = el('spotify-embed');

function setSpotifyMessage(msg) {
  spMessage.textContent = msg || SP_DEFAULT_MESSAGE;
}

function spotifyEmbedUrl(link) {
  try {
    const u = new URL(link.trim());
    if (!u.hostname.includes('spotify.com')) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => ['playlist', 'album', 'track', 'artist', 'episode', 'show'].includes(p));
    if (idx === -1) return null;
    const type = parts[idx];
    const id = parts[idx + 1];
    if (!id) return null;
    return `https://open.spotify.com/embed/${type}/${id}?utm_source=generator&theme=0`;
  } catch (e) {
    return null;
  }
}

function loadSpotifyEmbed(link) {
  const url = spotifyEmbedUrl(link);
  if (!url) {
    setSpotifyMessage("That doesn't look like a valid Spotify link. Use Spotify's Share → Copy Link.");
    return;
  }
  spEmbed.src = url;
  spEmbedWrap.classList.remove('hidden');
  setSpotifyMessage('');
  localStorage.setItem(SP_LINK_KEY, link.trim());
}

el('sp-play-form').addEventListener('submit', (e) => {
  e.preventDefault();
  loadSpotifyEmbed(el('sp-play-link').value);
});

setSpotifyMessage('');
const savedSpotifyLink = localStorage.getItem(SP_LINK_KEY);
if (savedSpotifyLink) {
  el('sp-play-link').value = savedSpotifyLink;
  loadSpotifyEmbed(savedSpotifyLink);
}

// --- Log in mode: real Spotify account login + playback control ---

const spDisconnected = el('spotify-disconnected');
const spConnected = el('spotify-connected');
const spLoginMessage = el('spotify-login-message');

el('setting-spotify-client-id').value = localStorage.getItem('sp_client_id') || '';
el('redirect-uri-display').textContent = spotify.getRedirectUri();
el('copy-redirect-btn').addEventListener('click', () => {
  navigator.clipboard.writeText(spotify.getRedirectUri());
  showToast('Redirect URI copied');
});

function setSpotifyLoginMessage(msg) {
  spLoginMessage.textContent = msg || '';
}

function showSpotifyConnectedUI(connected) {
  spDisconnected.classList.toggle('hidden', connected);
  spConnected.classList.toggle('hidden', !connected);
}

el('spotify-connect-btn').addEventListener('click', async () => {
  const clientId = el('setting-spotify-client-id').value.trim();
  if (!clientId) {
    setSpotifyLoginMessage('Enter your Spotify Client ID in Settings → Spotify first.');
    settingsOverlay.classList.remove('hidden');
    selectTab('spotify');
    return;
  }
  localStorage.setItem('sp_client_id', clientId);
  await spotify.beginLogin(clientId);
});

el('spotify-disconnect-btn').addEventListener('click', () => {
  spotify.logout();
  loginPlayerInitialized = false;
  showSpotifyConnectedUI(false);
  showToast('Disconnected from Spotify');
});

let loginPlayerInitialized = false;
let hasAttemptedResume = false;

const SP_LOGIN_STATE_KEY = 'pomodoro_spotify_login_state';

function saveSpotifyLoginState(state) {
  const contextUri = state.context && state.context.uri;
  const track = state.track_window && state.track_window.current_track;
  if (!contextUri && !track) return;
  localStorage.setItem(
    SP_LOGIN_STATE_KEY,
    JSON.stringify({
      contextUri: contextUri || null,
      trackUri: track ? track.uri : null,
      positionMs: state.position || 0,
    })
  );
}

async function resumeSavedSpotifyLoginState() {
  const raw = localStorage.getItem(SP_LOGIN_STATE_KEY);
  if (!raw) return;
  let saved;
  try {
    saved = JSON.parse(raw);
  } catch (e) {
    return;
  }
  const target = saved.contextUri || saved.trackUri;
  if (!target) return;
  try {
    await spotify.playContext(target, {
      offsetUri: saved.contextUri ? saved.trackUri : undefined,
      positionMs: saved.positionMs,
    });
  } catch (err) {
    // Browsers can block programmatic playback until you interact with the
    // page once after a fresh load -- that's expected, not an error to show.
  }
}

async function ensureSpotifyLoginConnected() {
  if (!spotify.isConnected() || loginPlayerInitialized) return;
  loginPlayerInitialized = true;
  setSpotifyLoginMessage('Connecting to Spotify…');
  try {
    await spotify.initPlayer({
      onReady: () => {
        setSpotifyLoginMessage('');
        showSpotifyConnectedUI(true);
        if (!hasAttemptedResume) {
          hasAttemptedResume = true;
          resumeSavedSpotifyLoginState();
        }
      },
      onStateChange: (state) => {
        if (!state) return;
        const track = state.track_window && state.track_window.current_track;
        if (track) {
          el('track-name').textContent = track.name;
          el('track-artist').textContent = track.artists.map((a) => a.name).join(', ');
          el('track-art').src = (track.album.images && track.album.images[0] && track.album.images[0].url) || '';
        }
        el('sp-play-pause').textContent = state.paused ? '▶' : '⏸';
        saveSpotifyLoginState(state);
      },
      onError: (message) => setSpotifyLoginMessage(message),
    });
  } catch (err) {
    loginPlayerInitialized = false;
    setSpotifyLoginMessage('Could not start the Spotify player. Make sure you have Spotify Premium.');
  }
}

el('sp-play-pause').addEventListener('click', () => spotify.togglePlay());
el('sp-prev').addEventListener('click', () => spotify.previousTrack());
el('sp-next').addEventListener('click', () => spotify.nextTrack());
el('sp-volume').addEventListener('input', (e) => spotify.setVolume(Number(e.target.value) / 100));

// --- Search songs/playlists instead of needing a link (Log in mode only, needs a token) ---

let spSearchDebounce = null;

function renderSpotifySearchResults(items) {
  const resultsEl = el('sp-search-results');
  resultsEl.innerHTML = '';
  if (!items.length) {
    resultsEl.classList.add('hidden');
    return;
  }
  items.forEach((item) => {
    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'sp-search-result';

    const art = document.createElement('img');
    art.className = 'sp-search-art';
    art.alt = '';
    art.src = item.art;

    const text = document.createElement('span');
    text.className = 'sp-search-text';
    const title = document.createElement('span');
    title.className = 'sp-search-title';
    title.textContent = item.title;
    const subtitle = document.createElement('span');
    subtitle.className = 'sp-search-subtitle';
    subtitle.textContent = item.subtitle;
    text.appendChild(title);
    text.appendChild(subtitle);

    row.appendChild(art);
    row.appendChild(text);
    row.addEventListener('click', async () => {
      try {
        await spotify.playContext(item.uri);
        setSpotifyLoginMessage('');
        resultsEl.classList.add('hidden');
        el('sp-search-input').value = '';
      } catch (err) {
        setSpotifyLoginMessage('Could not start playback. Make sure you have Spotify Premium.');
      }
    });
    resultsEl.appendChild(row);
  });
  resultsEl.classList.remove('hidden');
}

async function runSpotifySearch(query) {
  try {
    const data = await spotify.search(query, ['track', 'playlist'], 6);
    const items = [];
    (data.tracks ? data.tracks.items : []).forEach((t) => {
      items.push({
        uri: t.uri,
        title: t.name,
        subtitle: t.artists.map((a) => a.name).join(', '),
        art: (t.album.images && t.album.images[t.album.images.length - 1] && t.album.images[t.album.images.length - 1].url) || '',
      });
    });
    (data.playlists ? data.playlists.items : []).filter(Boolean).forEach((p) => {
      items.push({
        uri: p.uri,
        title: p.name,
        subtitle: p.owner && p.owner.display_name ? `Playlist · ${p.owner.display_name}` : 'Playlist',
        art: (p.images && p.images[0] && p.images[0].url) || '',
      });
    });
    renderSpotifySearchResults(items);
  } catch (err) {
    renderSpotifySearchResults([]);
  }
}

el('sp-search-input').addEventListener('input', (e) => {
  clearTimeout(spSearchDebounce);
  const query = e.target.value.trim();
  if (!query) {
    renderSpotifySearchResults([]);
    return;
  }
  spSearchDebounce = setTimeout(() => runSpotifySearch(query), 350);
});

el('sp-login-play-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const link = el('sp-login-play-link').value.trim();
  const uri = spotify.linkToUri(link);
  if (!uri) {
    setSpotifyLoginMessage("That doesn't look like a valid Spotify link.");
    return;
  }
  try {
    await spotify.playContext(uri);
    setSpotifyLoginMessage('');
  } catch (err) {
    setSpotifyLoginMessage('Could not start playback. Make sure you have Spotify Premium.');
  }
});

async function initSpotifyLogin() {
  let cameBackFromAuth = false;
  try {
    cameBackFromAuth = await spotify.handleRedirectIfPresent();
  } catch (err) {
    setSpotifyLoginMessage(err.message);
  }
  const savedMode = localStorage.getItem(SP_MODE_KEY) || 'quick';
  selectSpotifyMode(cameBackFromAuth ? 'login' : savedMode);
  if (cameBackFromAuth) showToast('Connected to Spotify');
}
initSpotifyLogin();

// ---------------------------------------------------------------------------
// Toast
// ---------------------------------------------------------------------------

let toastTimeout = null;
function showToast(message) {
  const toast = el('toast');
  toast.textContent = message;
  toast.classList.remove('hidden');
  clearTimeout(toastTimeout);
  toastTimeout = setTimeout(() => toast.classList.add('hidden'), 2500);
}
