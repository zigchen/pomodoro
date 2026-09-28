# Pomodoro Timer

A clean, single-page Pomodoro timer with:

- An adjustable circular + linear progress bar (focus / short break / long break lengths, and how many focus sessions before a long break), with customizable accent colors (a few muted-pastel presets, or pick any custom color)
- A custom background: pick a preset gradient, upload your own image, or paste a YouTube link for a looping muted video background (requests the highest resolution YouTube will give it)
- A Spotify player with two modes: **Quick** (paste a link, get an embedded player, zero setup, previews only) or **Log in** (your real account, full tracks, play/pause/skip, search for songs/playlists by name, queue up tracks, and a toggleable "upcoming" panel)

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

**Log in mode** (real account, full tracks, play/pause/skip in the timer) now works out of the box — the app ships with a built-in Spotify Client ID, so anyone can click **Connect Spotify** with nothing to set up. Two things worth knowing:

- **Spotify Premium is required for actual playback** (play/pause/skip, streaming audio from the browser tab) — a restriction Spotify enforces for every app, not something specific to this one. Free accounts can complete login but playback controls won't work; Quick mode's previews work for everyone regardless.
- **Spotify caps who can log in.** A newly-created Spotify app defaults to "Development Mode," which only allows up to 25 explicitly allow-listed Spotify accounts to complete login — regardless of Client ID. If a friend tries Log in mode and gets rejected by Spotify after approving access, that's this cap, not a bug here. To let more people in: open your app at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) → **Settings → User Management**, and add their Spotify account email there (up to 25). For truly public/unlimited use, Spotify requires submitting the app for their **Extended Quota Mode** review.

**Using your own Spotify app instead of the built-in one** (e.g. if the built-in one's 25-user cap is full): open **Settings → Spotify** in the timer and paste your own Client ID into the "Custom Client ID" field — it overrides the built-in one. To get your own:

1. Go to the [Spotify Developer Dashboard](https://developer.spotify.com/dashboard) and log in.
2. Click **Create app**. Fill in any name/description you like.
3. For **Redirect URIs**, add the address shown in this app's **Settings → Spotify** panel (it auto-fills based on wherever you're running it — `http://127.0.0.1:8080/` while testing locally, and your live URL once deployed). You can add both at once.
4. Under **Which API/SDKs are you planning to use?**, check **Web Playback SDK** and **Web API**.
5. Save, then copy the **Client ID** from the app's dashboard page and paste it into Settings → Spotify here.

Since it's a brand new app, the same 25-user Development Mode cap applies to it too — you'd manage its allow-list the same way.

**Picking up where you left off:** in Log in mode, the app remembers whatever track/playlist was playing (and roughly where in it) and tries to resume automatically the next time the player reconnects — no need to re-paste the link. Browsers sometimes block automatic audio playback until you've clicked something on the page first; if it doesn't resume instantly, hitting play once will.

**Searching instead of pasting a link:** once connected in Log in mode, a search box appears above the "paste a link" field — type a song or playlist name and click a result to play it. Clicking a song result plays it now; the small **+** button next to a song adds it to your Spotify queue instead (only songs can be queued — Spotify's API doesn't support queueing a whole playlist at once). Search needs a valid Spotify access token, so it's Log in mode only; Quick mode still needs a pasted link since it never logs in.

**Queue view:** below the search box, "Show upcoming queue" reveals what's playing next — off by default so it doesn't clutter the panel, and it remembers your choice. Click any track in the list to play it immediately. While it's open it refreshes automatically every 12 seconds; closing it stops the refreshing.

**About the Client ID field:** it's masked like a password field with a Show/Hide toggle, mainly to keep it out of screenshots or a glance over your shoulder. Worth knowing though — a Spotify Client ID isn't actually a secret credential; Spotify's docs describe it as a public identifier, and it's visible in plain sight in the browser's network requests during login regardless. This app never uses a Client *Secret* (the part that would genuinely need to stay hidden) — the PKCE login flow it uses was specifically designed not to need one for client-side apps like this.

## Customizing the accent colors

Open **Settings → Theme** to change the colors used for the progress ring, buttons, and bar. Pick from a few muted-pastel presets (each swatch previews both the focus and break color), or set any exact color with the custom color pickers — these use your browser's native color picker, which includes a full color spectrum/wheel. Your choice persists across reloads.

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
js/spotify.js        Log-in mode: OAuth (PKCE), token refresh, Web Playback SDK, search, queue
js/background.js     Preset/upload/YouTube background switching + persistence
js/theme.js            Accent color presets + custom colors
js/storage.js         localStorage + IndexedDB helpers
```
