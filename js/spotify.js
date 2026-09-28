// Spotify integration: OAuth Authorization Code + PKCE (no backend/secret needed),
// the Web Playback SDK (streams audio from this browser tab), and small helpers
// for turning a pasted playlist/album/track link into a playable URI.
//
// A Client ID is not a secret -- Spotify's PKCE flow is designed to ship one
// publicly in client-side apps like this. DEFAULT_CLIENT_ID lets Log in mode
// work out of the box for any visitor; Settings -> Spotify can still override
// it with a different Client ID (useful if this one hits Spotify's
// Development Mode 25-user login cap -- see README.md). Playback control
// itself requires Premium regardless of which Client ID is used -- that's a
// Spotify platform restriction, not something this code can work around.

export const DEFAULT_CLIENT_ID = '0dd470831c124298a5f3ec67b3d8dc6e';

const AUTH_ENDPOINT = 'https://accounts.spotify.com/authorize';
const TOKEN_ENDPOINT = 'https://accounts.spotify.com/api/token';
const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
].join(' ');

let player = null;
let deviceId = null;

export function getRedirectUri() {
  return window.location.origin + window.location.pathname;
}

function base64UrlEncode(arrayBuffer) {
  let binary = '';
  new Uint8Array(arrayBuffer).forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function generateRandomString(length) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  const randomValues = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(randomValues, (v) => chars[v % chars.length]).join('');
}

async function generateCodeChallenge(verifier) {
  const data = new TextEncoder().encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64UrlEncode(digest);
}

export async function beginLogin(clientId) {
  const verifier = generateRandomString(64);
  const challenge = await generateCodeChallenge(verifier);
  const state = generateRandomString(16);

  sessionStorage.setItem('sp_verifier', verifier);
  sessionStorage.setItem('sp_state', state);
  localStorage.setItem('sp_client_id', clientId);

  const params = new URLSearchParams({
    client_id: clientId,
    response_type: 'code',
    redirect_uri: getRedirectUri(),
    scope: SCOPES,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    state,
  });

  window.location.href = `${AUTH_ENDPOINT}?${params.toString()}`;
}

function storeTokens(tokenData) {
  const expiresAt = Date.now() + tokenData.expires_in * 1000;
  localStorage.setItem('sp_access_token', tokenData.access_token);
  localStorage.setItem('sp_expires_at', String(expiresAt));
  if (tokenData.refresh_token) {
    localStorage.setItem('sp_refresh_token', tokenData.refresh_token);
  }
}

/** Call once on page load. Returns true if this load just completed a login. */
export async function handleRedirectIfPresent() {
  const params = new URLSearchParams(window.location.search);
  const code = params.get('code');
  const state = params.get('state');
  const error = params.get('error');

  if (!code && !error) return false;

  window.history.replaceState({}, document.title, getRedirectUri());

  if (error) {
    throw new Error(`Spotify sign-in was cancelled (${error}).`);
  }

  const expectedState = sessionStorage.getItem('sp_state');
  const verifier = sessionStorage.getItem('sp_verifier');
  const clientId = localStorage.getItem('sp_client_id');

  if (!verifier || !state || state !== expectedState) {
    throw new Error('Spotify sign-in state mismatch -- please try connecting again.');
  }

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'authorization_code',
    code,
    redirect_uri: getRedirectUri(),
    code_verifier: verifier,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    throw new Error('Failed to complete Spotify sign-in. Double-check your Client ID and redirect URI.');
  }

  storeTokens(await res.json());
  return true;
}

export async function refreshAccessToken() {
  const refreshToken = localStorage.getItem('sp_refresh_token');
  const clientId = localStorage.getItem('sp_client_id');
  if (!refreshToken || !clientId) return null;

  const body = new URLSearchParams({
    client_id: clientId,
    grant_type: 'refresh_token',
    refresh_token: refreshToken,
  });

  const res = await fetch(TOKEN_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) return null;
  const tokenData = await res.json();
  storeTokens(tokenData);
  return tokenData.access_token;
}

export async function getValidAccessToken() {
  const token = localStorage.getItem('sp_access_token');
  const expiresAt = Number(localStorage.getItem('sp_expires_at') || 0);
  if (token && Date.now() < expiresAt - 30000) return token;
  return refreshAccessToken();
}

export function isConnected() {
  return Boolean(localStorage.getItem('sp_refresh_token'));
}

export function logout() {
  ['sp_access_token', 'sp_refresh_token', 'sp_expires_at'].forEach((k) => localStorage.removeItem(k));
  if (player) {
    try {
      player.disconnect();
    } catch (e) {
      /* ignore */
    }
  }
  player = null;
  deviceId = null;
}

function loadSdk() {
  return new Promise((resolve) => {
    if (window.Spotify) return resolve(window.Spotify);
    const script = document.createElement('script');
    script.src = 'https://sdk.scdn.co/spotify-player.js';
    document.head.appendChild(script);
    window.onSpotifyWebPlaybackSDKReady = () => resolve(window.Spotify);
  });
}

export async function initPlayer({ onReady, onStateChange, onError } = {}) {
  const Spotify = await loadSdk();

  player = new Spotify.Player({
    name: 'Pomodoro Timer',
    getOAuthToken: (cb) => {
      getValidAccessToken().then(cb);
    },
    volume: 0.5,
  });

  player.addListener('ready', ({ device_id }) => {
    deviceId = device_id;
    onReady && onReady(device_id);
  });
  player.addListener('player_state_changed', (state) => {
    onStateChange && onStateChange(state);
  });
  player.addListener('initialization_error', ({ message }) => onError && onError(message));
  player.addListener('authentication_error', ({ message }) => onError && onError(message));
  player.addListener('account_error', ({ message }) => onError && onError(`${message} (Spotify Premium is required)`));

  await player.connect();
  return player;
}

async function apiRequest(path, options = {}) {
  const token = await getValidAccessToken();
  return fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
  });
}

export async function search(query, types = ['track', 'playlist'], limit = 6) {
  const params = new URLSearchParams({ q: query, type: types.join(','), limit: String(limit) });
  const res = await apiRequest(`/search?${params.toString()}`);
  if (!res.ok) throw new Error('Spotify search failed.');
  return res.json();
}

export async function addToQueue(uri) {
  if (!deviceId) throw new Error('The Spotify player is not ready yet.');
  const res = await apiRequest(`/me/player/queue?uri=${encodeURIComponent(uri)}&device_id=${deviceId}`, {
    method: 'POST',
  });
  if (!res.ok && res.status !== 204) {
    if (res.status === 404) {
      throw new Error("Nothing's playing yet -- start a track first, then you can queue more up.");
    }
    throw new Error('Could not add to queue.');
  }
}

export async function getQueue() {
  const res = await apiRequest('/me/player/queue');
  if (!res.ok) throw new Error('Could not fetch the queue.');
  return res.json();
}

export function togglePlay() {
  return player && player.togglePlay();
}
export function nextTrack() {
  return player && player.nextTrack();
}
export function previousTrack() {
  return player && player.previousTrack();
}
export function setVolume(v) {
  return player && player.setVolume(v);
}
export function getDeviceId() {
  return deviceId;
}

export async function playContext(uri, { offsetUri, positionMs } = {}) {
  if (!deviceId) throw new Error('The Spotify player is not ready yet.');
  const isTrack = uri.startsWith('spotify:track:');
  const body = isTrack ? { uris: [uri] } : { context_uri: uri };
  if (!isTrack && offsetUri) body.offset = { uri: offsetUri };
  if (typeof positionMs === 'number') body.position_ms = positionMs;
  const res = await apiRequest(`/me/player/play?device_id=${deviceId}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  });
  if (!res.ok && res.status !== 204) {
    throw new Error('Could not start playback.');
  }
}

export async function pausePlayback() {
  if (!deviceId) return;
  await apiRequest(`/me/player/pause?device_id=${deviceId}`, { method: 'PUT' });
}

export async function resumePlayback() {
  if (!deviceId) return;
  await apiRequest(`/me/player/play?device_id=${deviceId}`, { method: 'PUT' });
}

/** Turns an open.spotify.com share link (or a raw spotify: URI) into a URI. */
export function linkToUri(link) {
  const trimmed = link.trim();
  if (trimmed.startsWith('spotify:')) return trimmed;
  try {
    const u = new URL(trimmed);
    const parts = u.pathname.split('/').filter(Boolean);
    const idx = parts.findIndex((p) => ['playlist', 'album', 'track', 'artist'].includes(p));
    if (idx === -1) return null;
    const type = parts[idx];
    const id = parts[idx + 1];
    if (!id) return null;
    return `spotify:${type}:${id}`;
  } catch (e) {
    return null;
  }
}
