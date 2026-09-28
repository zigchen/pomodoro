# Pomodoro Timer

A clean, single-page Pomodoro timer with:

- An adjustable circular + linear progress bar (focus / short break / long break lengths, and how many focus sessions before a long break)
- A custom background: pick a preset gradient, upload your own image, or paste a YouTube link for a looping muted video background (requests the highest resolution YouTube will give it)
- A Spotify player with two modes: **Quick** (paste a link, get an embedded player, zero setup, previews only) or **Log in** (your real account, full tracks, play/pause/skip, and a search box to find songs/playlists by name instead of needing a link)

It's plain HTML/CSS/JS — no build step, no framework, no server required. That makes it a drag-and-drop deploy. The **Quick** Spotify mode needs nothing extra; the **Log in** mode needs a little one-time setup because Spotify requires every app to have its own registered Client ID and redirect URL (see below).

## Running it locally

Because the **Log in** Spotify mode needs a "secure context" and an exact redirect URL match, don't just double-click `index.html` — serve it instead:

```bash
cd /Users/ziggychen/Pomodoro
python3 -m http.server 8080
```

Then open **http://127.0.0.1:8080** (use `127.0.0.1`, not `localhost` — Spotify's dashboard treats them as different addresses).

## Using Spotify

**Quick mode** (default, no setup): copy a link to a playlist, album, or track from Spotify (the **Share → Copy Link** option) and paste it into the box under the timer. It embeds Spotify's own player right there. If you're signed into Spotify in your browser, full tracks play; otherwise you'll get 30-second previews or a prompt to log in, both handled entirely by Spotify's embed.

**Log in mode** (real account, full tracks, play/pause/skip in the timer):

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and log in.
2. Click **Create app**. Fill in any name/description you like.
3. For **Redirect URIs**, add the address shown in this app's **Settings → Spotify** panel (it auto-fills based on wherever you're running it — `http://127.0.0.1:8080/` while testing locally, and your live URL once deployed). You can add both at once.
4. Under **Which API/SDKs are you planning to use?**, check **Web Playback SDK** and **Web API**.
5. Save, then copy the **Client ID** from the app's dashboard page.
6. In the timer, open **Settings → Spotify**, paste the Client ID in, switch the Spotify panel to **Log in**, click **Connect Spotify**, and approve access.

**Note:** actual playback in Log in mode (play/pause/skip, streaming audio from the browser tab) requires a **Spotify Premium** account — this is a restriction Spotify enforces for all apps, not something specific to this one. Free accounts can log in but playback controls won't work; Quick mode's previews work for everyone regardless.

**Picking up where you left off:** in Log in mode, the app remembers whatever track/playlist was playing (and roughly where in it) and tries to resume automatically the next time the player reconnects — no need to re-paste the link. Browsers sometimes block automatic audio playback until you've clicked something on the page first; if it doesn't resume instantly, hitting play once will.

**Searching instead of pasting a link:** once connected in Log in mode, a search box appears above the "paste a link" field — type a song or playlist name and click a result to play it. Search needs a valid Spotify access token, so it's Log in mode only; Quick mode still needs a pasted link since it never logs in.

## A note on YouTube background quality

The video background asks YouTube's player for the highest resolution available (1080p or above) every time it starts and whenever quality changes. YouTube deprecated giving outside apps direct control over this back in 2021 — the player mostly decides on its own based on your connection speed and the video's available resolutions — so this is a best-effort request, not a guarantee. If a specific video was only ever uploaded at a lower resolution, there's nothing to force it higher than what exists.

## Deploying it for real

Any static host works. Two easy options:

### Netlify (drag-and-drop)

1. Go to [app.netlify.com/drop](https://app.netlify.com/drop).
2. Drag the whole `Pomodoro` folder onto the page.
3. Netlify gives you a URL like `https://your-site-name.netlify.app`.
4. If you use **Log in** Spotify mode, open the deployed site's **Settings → Spotify**, copy the new redirect URI shown, and add it as an additional Redirect URI in your Spotify app dashboard.

### GitHub Pages

1. Create a new GitHub repo and push this folder to it.
2. In the repo's **Settings → Pages**, set the source to the `main` branch, root folder.
3. GitHub gives you a URL like `https://yourusername.github.io/your-repo/`.
4. Same as above — copy the redirect URI from the deployed site's Spotify settings tab and register it in your Spotify dashboard if you use Log in mode.

You can keep multiple redirect URIs registered in Spotify at once (e.g. your local dev URL and your production URL), so you don't need to change anything when switching between testing and the live site. Quick mode needs no reconfiguring at all.

## Notes on the background feature

- **Presets** and your **uploaded image** are stored on your device (localStorage / IndexedDB) — nothing is uploaded anywhere.
- The **YouTube background** always plays muted, since Spotify is the intended audio source and two audio tracks fighting would be annoying. You can still unmute it manually via YouTube's own controls if you don't want Spotify running (though the on-screen controls are hidden by design to keep it a clean backdrop).
- Every YouTube link you've used shows up as a small history list (thumbnail + title) under the paste box in Settings → Background, so you can flip back to one you tried before instead of hunting for the link again. Click one to switch to it, or the **×** to remove it. It keeps your last 12.
- Your background choice, YouTube history, timer settings, chosen Spotify mode, and last-loaded link/login all persist across reloads.

## File overview

```
index.html        Page structure
styles.css         All styling (the ring progress bar, glass panels, layout)
js/main.js         Wires everything together
js/timer.js         Pomodoro countdown/session state machine
js/spotify.js        Log-in mode: OAuth (PKCE), token refresh, Web Playback SDK, playback controls
js/background.js     Preset/upload/YouTube background switching + persistence
js/storage.js         localStorage + IndexedDB helpers
```
