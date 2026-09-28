// Background switching: CSS gradient presets, an uploaded image (persisted in
// IndexedDB), or a YouTube video turned into a muted, looping, full-viewport
// backdrop via the YouTube IFrame API.

import { idbSet, idbGet, BG_MODE_KEY, BG_VALUE_KEY, BG_YT_HISTORY_KEY } from './storage.js';

const YT_HISTORY_LIMIT = 12;

export const PRESETS = {
  sunset: 'linear-gradient(135deg, #ff9966, #ff5e62)',
  ocean: 'linear-gradient(135deg, #2193b0, #6dd5ed)',
  forest: 'linear-gradient(135deg, #134e5e, #71b280)',
  dusk: 'linear-gradient(135deg, #0f2027, #203a43, #2c5364)',
  lavender: 'linear-gradient(135deg, #667eea, #764ba2)',
  midnight: 'linear-gradient(135deg, #05050a, #1c1c2e)',
};

let ytPlayer = null;
let resizeHandlerAttached = false;
let lastObjectUrl = null;

function els() {
  return {
    imageLayer: document.getElementById('bg-image-layer'),
    ytLayer: document.getElementById('bg-yt-layer'),
    ytContainer: document.getElementById('yt-player'),
  };
}

function destroyYouTube() {
  if (ytPlayer) {
    try {
      ytPlayer.destroy();
    } catch (e) {
      /* ignore */
    }
    ytPlayer = null;
  }
}

function showImageLayer(cssBackground) {
  const { imageLayer, ytLayer } = els();
  imageLayer.style.background = cssBackground;
  imageLayer.classList.add('active');
  ytLayer.classList.remove('active');
  destroyYouTube();
}

export function applyPreset(name) {
  const gradient = PRESETS[name] || PRESETS.dusk;
  showImageLayer(gradient);
  localStorage.setItem(BG_MODE_KEY, 'preset');
  localStorage.setItem(BG_VALUE_KEY, name);
}

function applyImageBlob(blob) {
  if (lastObjectUrl) URL.revokeObjectURL(lastObjectUrl);
  lastObjectUrl = URL.createObjectURL(blob);
  showImageLayer(`center / cover no-repeat url(${JSON.stringify(lastObjectUrl)})`);
}

export async function applyUploadedImage(file) {
  await idbSet('bgImage', file);
  applyImageBlob(file);
  localStorage.setItem(BG_MODE_KEY, 'upload');
  localStorage.setItem(BG_VALUE_KEY, 'stored');
}

export function extractYouTubeId(url) {
  try {
    const u = new URL(url.trim());
    if (u.hostname.replace('www.', '') === 'youtu.be') {
      return u.pathname.slice(1) || null;
    }
    const v = u.searchParams.get('v');
    if (v) return v;
    const match = u.pathname.match(/\/(embed|shorts|live)\/([^/?]+)/);
    if (match) return match[2];
  } catch (e) {
    return null;
  }
  return null;
}

export function getYouTubeHistory() {
  try {
    const raw = localStorage.getItem(BG_YT_HISTORY_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch (e) {
    return [];
  }
}

function setYouTubeHistory(list) {
  localStorage.setItem(BG_YT_HISTORY_KEY, JSON.stringify(list));
}

export function removeYouTubeHistoryEntry(videoId) {
  setYouTubeHistory(getYouTubeHistory().filter((entry) => entry.videoId !== videoId));
}

async function fetchYouTubeTitle(videoId) {
  try {
    const oembedUrl = `https://www.youtube.com/oembed?url=${encodeURIComponent(
      `https://www.youtube.com/watch?v=${videoId}`
    )}&format=json`;
    const res = await fetch(oembedUrl);
    if (!res.ok) return null;
    const data = await res.json();
    return data.title || null;
  } catch (e) {
    return null;
  }
}

async function recordYouTubeHistoryEntry(url, videoId) {
  const existing = getYouTubeHistory().filter((entry) => entry.videoId !== videoId);
  const title = await fetchYouTubeTitle(videoId);
  const entry = { videoId, url, title: title || url };
  setYouTubeHistory([entry, ...existing].slice(0, YT_HISTORY_LIMIT));
}

function loadYouTubeApi() {
  return new Promise((resolve) => {
    if (window.YT && window.YT.Player) return resolve(window.YT);
    if (!document.getElementById('yt-iframe-api')) {
      const tag = document.createElement('script');
      tag.id = 'yt-iframe-api';
      tag.src = 'https://www.youtube.com/iframe_api';
      document.head.appendChild(tag);
    }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      if (typeof prev === 'function') prev();
      resolve(window.YT);
    };
  });
}

function requestHighestQuality(player) {
  try {
    const levels = player.getAvailableQualityLevels ? player.getAvailableQualityLevels() : [];
    const preferredOrder = ['highres', 'hd1080'];
    const target = preferredOrder.find((q) => levels.includes(q)) || levels[0];
    if (target) player.setPlaybackQuality(target);
  } catch (e) {
    // YouTube may ignore this entirely -- since 2021 the player mostly picks
    // quality automatically and third-party quality control is best-effort.
  }
}

function sizeYouTubeIframe() {
  const { ytContainer } = els();
  const iframe = ytContainer.querySelector('iframe');
  if (!iframe) return;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const ratio = 16 / 9;
  let width;
  let height;
  if (vw / vh > ratio) {
    width = vw;
    height = width / ratio;
  } else {
    height = vh;
    width = height * ratio;
  }
  iframe.style.position = 'absolute';
  iframe.style.width = `${width}px`;
  iframe.style.height = `${height}px`;
  iframe.style.left = `${(vw - width) / 2}px`;
  iframe.style.top = `${(vh - height) / 2}px`;
}

export async function applyYouTubeBackground(url) {
  const videoId = extractYouTubeId(url);
  if (!videoId) throw new Error("That doesn't look like a valid YouTube link.");

  const { imageLayer, ytLayer, ytContainer } = els();
  destroyYouTube();
  // YT.Player REPLACES the element it's given with the <iframe>, so we hand it
  // a throwaway inner div -- ytContainer itself must stay in the DOM or we'd
  // lose our stable reference for sizing/resizing later.
  ytContainer.innerHTML = '<div id="yt-inner"></div>';

  const YT = await loadYouTubeApi();
  ytPlayer = new YT.Player('yt-inner', {
    videoId,
    playerVars: {
      autoplay: 1,
      mute: 1,
      loop: 1,
      playlist: videoId,
      controls: 0,
      disablekb: 1,
      modestbranding: 1,
      playsinline: 1,
      fs: 0,
      rel: 0,
      iv_load_policy: 3,
    },
    events: {
      onReady: (e) => {
        e.target.mute();
        e.target.playVideo();
        requestHighestQuality(e.target);
        sizeYouTubeIframe();
      },
      onPlaybackQualityChange: (e) => requestHighestQuality(e.target),
    },
  });

  ytLayer.classList.add('active');
  imageLayer.classList.remove('active');

  if (!resizeHandlerAttached) {
    window.addEventListener('resize', sizeYouTubeIframe);
    resizeHandlerAttached = true;
  }

  localStorage.setItem(BG_MODE_KEY, 'youtube');
  localStorage.setItem(BG_VALUE_KEY, url.trim());

  try {
    await recordYouTubeHistoryEntry(url.trim(), videoId);
  } catch (e) {
    // History is a nice-to-have -- don't let it block the background change.
  }
}

export async function restoreBackground() {
  const mode = localStorage.getItem(BG_MODE_KEY);
  const value = localStorage.getItem(BG_VALUE_KEY);

  if (mode === 'preset' && value) {
    applyPreset(value);
    return;
  }
  if (mode === 'upload') {
    const blob = await idbGet('bgImage');
    if (blob) {
      applyImageBlob(blob);
      return;
    }
  }
  if (mode === 'youtube' && value) {
    try {
      await applyYouTubeBackground(value);
      return;
    } catch (e) {
      /* fall through to default */
    }
  }
  applyPreset('dusk');
}
