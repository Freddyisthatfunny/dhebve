# ExePlayer

Play classic **32‑bit Windows games** on iPhone and iPad with touch controls.
Runs in Safari and installs to the Home Screen like an app.

Under the hood it uses **Boxedwine**, which runs Wine (a Windows compatibility layer) inside the browser.

## What runs

- ✅ 32‑bit Windows games, roughly Windows 95 → XP era (GDI, DirectDraw, early Direct3D/OpenGL)
- ⚠️ Later DirectX 9 games: some work, often slowly
- ❌ 64‑bit `.exe` files, DirectX 10/11/12, modern .NET, anti‑cheat or DRM launchers

The app warns you when you add a 64‑bit or DOS `.exe`. Newer iPads run games best.

## What's in here

Everything is in one place — no folders, and nothing to compile.

- **Windows engine (built in):** `boxedwine.html`, `boxedwine.js`, `boxedwine.wasm`, `boxedwine-shell.js`, `boxedwine.css`.
  Boxedwine compiled for the web (single‑threaded "release" build, Emscripten 3.1.6, with small compatibility patches).
- **Wine file system (built in):** `boxedwine.zip.001` … `.007` plus `boxedwine.zip.parts.json` — Boxedwine's TinyCore 15 +
  Wine 11.0 file system, which includes Boxedwine's web Direct3D (DirectDraw, Direct3D 8/9 drawn with WebGL). Slimmed to 121 MB
  (unused Linux tools and developer files removed) and split into seven parts of about 17 MB so each uploads on github.com from Safari. The app joins them on the device.
- **`wine-ready.zip` (built in):** Wine's one-time Windows setup, already done. It's loaded on top of the Wine file
  system so games skip the long "Wine configuration is being updated" wait, even on their very first launch.

## Set it up on GitHub (all doable from an iPad)

1. Create a GitHub account and a new **public** repository, e.g. `exeplayer`.
2. **Add file → Upload files** and upload **every file** (app zip contents + the seven `boxedwine.zip.00x` parts). You can do it in batches.
3. **Settings → Pages → Source: Deploy from a branch → `main` / `(root)` → Save.**
4. After a minute, open `https://<your-username>.github.io/exeplayer/` in Safari → **Share → Add to Home Screen**.

If the icon on your Home Screen was blank before: delete that shortcut, open the site in Safari once more, then add it again.
The very first launch of each game takes a while (Wine sets up its Windows folder); later launches are faster.

## Adding games

- **A .zip** of the game folder (best: everything stays together)
- **Add game → select several files**: pick the `.exe` *and* its asset files together
- **Add folder** (where Safari supports it), or **drag and drop** files onto the library on iPad

If there's more than one `.exe`, you choose which starts the game (changeable later under **⋯**).
The library shows recently played games first; search appears once you have 6 or more games.

## Game settings (⋯ on a game)

- **Icon** (optional): any picture, cropped to a square
- **Program to run**, **resolution**, **colors**, **sound**, **command‑line arguments**
- **Open Windows desktop instead**: for installers or picking a program by hand
- **Touch control preset**
- **Reset save data**: erases that game's progress and settings, keeps the game
- **Export as standalone website** (below)

## Faster starts

- **Download Windows once:** the library shows a **Download** banner for the one-time ~170 MB Windows download,
  with progress. If you just press Play instead, the progress shows on the start screen.
- **Start screen:** while Windows boots you see the game's name, icon and a timer instead of a blank screen.
  It disappears by itself as soon as the game draws (or tap **Show screen now**).
- **Continue playing:** your last game sits at the top of the library, one tap to start.
- Wine's one-time setup is already done (`wine-ready.zip`), so even a game's first launch skips it.

## Also in this version

- **64‑bit check:** 64‑bit games get a red **64‑bit** badge and explain why they can't run, instead of making you wait.
  If the game also has a 32‑bit program, pick it under **⋯ → Program to run**.
- **In‑game toolbar:** **↻ Restart** and **🔊 Mute** buttons.
- **Library:** sort by Recent, Name or Size (shows once you have 3+ games); a step‑by‑step guide when it's empty.
- **Updates:** after you upload a new version to your site, the app offers to reload (never in the middle of a game).
- **Engine → Free up space:** removes the downloaded Windows files (games and saves stay).

## Playing

| Action | How |
|---|---|
| Left click | Tap (Touch mode) · tap anywhere (Trackpad mode) |
| Right click | Two‑finger tap |
| Drag | Touch & drag (Touch mode) · tap, then tap‑and‑hold and drag (Trackpad mode) |
| Move cursor without clicking | **🖱 Trackpad** mode |
| Type | **⌨︎** opens the iOS keyboard |

Toolbar: **✕** quit · **↻** restart · **🔊** mute · **Touch/Trackpad** · **⌨︎** keyboard · **Fit / Sharp / Stretch** screen mode · **✎** edit controls · **◐** hide controls · **⛶** full screen.

**Edit controls (✎):** drag buttons to move them; tap one to change its key, label, size or shape; add buttons or D‑pads; pick a preset; set opacity. Layouts and screen mode are saved per game.

**Game controllers:** Bluetooth controllers (Xbox, PlayStation, MFi) work automatically.
D‑pad / left stick → the on‑screen D‑pad's keys · A B X Y and shoulder buttons → your on‑screen buttons in order · right stick → mouse · RT → left click · LT → right click · Start → Enter · Back/Select → Esc.

**Hardware keyboard** works directly on iPad. The screen stays awake while you play.

## Export a game as its own website

**⋯ → 🌐 Export as standalone website…** → choose an optional Home Screen icon and a title → **Export .zip** → **Save .zip**.
Unzip it and upload every file as its own site (no folders; every file is under 24 MB); `index.html` is the entry page. Visitors get a Play screen and can add the game to their Home Screen as its own app. Your touch layout and screen mode go with it.

Engine options:

- **Use the engine from this ExePlayer site** (default when available) – the export is just the game plus a few small files. On GitHub, make a new repository for the game (e.g. `space-blaster`), upload the files, and enable Pages with **Source: Deploy from a branch** (`main`, `/ (root)`). It shows up at `https://<you>.github.io/space-blaster/` and borrows the engine from your ExePlayer site, so keep that site online.
- **Include a copy of the engine** – works on any host, but it's large (engine + the 108 MB Wine file system, in parts).
- **Don't include** – you add the engine files next to `index.html` yourself.

Big files in an export are split into parts under 24 MB automatically, so everything uploads on github.com from Safari.

Only export games you have the right to share publicly.

## Offline

After a game has been played once, the engine and game are cached on the device, so it also plays without internet. **Engine → Re‑download engine** clears that cache (use it after updating the engine).

## Troubleshooting

- **"Reload once"**: first launch installs a helper the engine needs.
- **No sound**: tap the screen once after the game starts (iOS only allows sound after a tap).
- **Black screen or error**: try **⋯ → Resolution 640x480** or **Colors 16‑bit**, or **Open Windows desktop instead**.
- **Keys feel stuck**: switching away from the app releases every held key and button.
