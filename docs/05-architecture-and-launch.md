# 05 Architecture and path to launch

## Today: a personal web app (MVP)

The current build is an MVP and concept, kept as simple as possible on purpose. It is the right setup for testing the idea and for personal use. It isn't meant to be the architecture of a public product.

| Part | Choice | Why |
| --- | --- | --- |
| App type | Installable web app (PWA) | Works on Android (and iPhone) from a link, installs to the home screen, no store needed |
| Code | Plain HTML, CSS and JavaScript (`index.html`, `style.css`, `app.js`), no framework, no build step | Easy to change and deploy by pushing files. No tooling for James to manage. |
| Hosting | GitHub Pages from the `main` branch of `jamescleaver1994/lyrica` | Free. Live at https://jamescleaver1994.github.io/lyrica/ |
| Storage | The phone's browser storage (`localStorage`): `lyrica.songs`, `lyrica.folders`, `lyrica.settings`, `lyrica.meta` | No server, no account, private by default |
| Offline | Service worker (`sw.js`) caches the app, fonts and cover images | Works with no signal |
| Fonts | Google Fonts, cached by the service worker | Free |

### External services (all free, called from the phone)

| Service | Used for | Notes |
| --- | --- | --- |
| LRCLIB (`lrclib.net/api`) | Lyrics search, synced and plain | Open, community-run, no key. Licensing of the lyrics themselves is not cleared for commercial use. |
| iTunes Search API | Cover art and song length | Images are hotlinked from Apple. Apple's terms expect use to promote iTunes content, which is fine personally but needs review for a public app. |
| Deezer API (JSONP) | Tempo (BPM) | Mostly returns 0. Treated as an optional pre-fill. |

### Data model (per song, simplified)

- `id`, `title`, `artist`, `lyrics` (raw text, may contain `[mm:ss]` timestamps and `[chord]` marks), `duration`
- `bpm`, `bpmSource` (user or online), `beatsPerBar`, `skipIntro`, `speed` (practice speed, 1 = real speed)
- `art` (cover URL), `plays`, `lastPlayed`, `updated`
- `comfort`: `{ level, ratedDay, practicedDay, practicedAt, history[] }`, where days count **active days** (days the app was opened), stored in `lyrica.meta.activeDay`

Folders are `{ id, name, songIds[] }`, ordered, so one song can be in several folders.

### How playback timing works

1. Lyrics are parsed into lines: lyric, chord, pause (instrumental gap) and note lines. Chord-above-words sheets are merged into inline chords.
2. **Synced songs** use their timestamps, and untimed lines in between are interpolated.
3. **Unsynced songs** are spread across the song length, weighted by how long each line is.
4. The clock runs at the song's real speed multiplied by the practice speed. The count-in, click and background pulse all use the song's tempo and time signature, so they can't drift apart.

### Releasing (important)

- Bump the version in three places together: `VERSION` in `sw.js`, the `?v=` numbers in `index.html`, and `APP_VERSION` in `app.js`. A mismatch once caused a black screen on James's phone.
- The service worker installs new files fresh, then reloads open windows. Existing installs update on their own when reopened.
- **Never ask the user to clear site data.** That deletes their songs. Point them to backup and restore instead.

### Known limits

- `localStorage` is around 5 MB, which is enough for hundreds of songs, but browsers can evict it on low storage. Backups are the safety net.
- iPhone supports install and wake lock in recent iOS versions, but background audio and some PWA behaviour is weaker than on Android.
- No sync between devices.

## Path to a public launch

Going public changes the constraints. This is a sketch, not a commitment.

### Blockers that must be solved first

1. **A new name.** "Lyrica" is a registered trademark for a prescription drug (pregabalin). It must not be used for a public app. Run a trademark and store search on candidates.
2. **Licensed lyrics.** Displaying full lyrics publicly needs a licence from publishers. Options:
   - **Musixmatch or LyricFind API:** licensed and include synced lyrics, but cost money and limit display and caching. Breaks zero-cost, so it needs a business model.
   - **Bring your own lyrics:** the app ships with no lyrics. Users paste or import their own, as they do now. Lowest risk and zero cost, but harder onboarding. LRCLIB search would have to go or be legally reviewed.
   - **Hybrid:** bring-your-own by default, licensed search as a paid add-on.
3. **Chords.** Chord charts are also copyrighted arrangements. The same licensing question applies to any chord catalogue. User-entered chords are fine.
4. **Third-party terms.** Review iTunes artwork, Deezer and LRCLIB terms for public and commercial use.

### Shipping options

| Option | Effort | Notes |
| --- | --- | --- |
| **Keep it a PWA** | Lowest | Share a link. No store fees. Discoverability is poor and iPhone support is weaker. |
| **Wrap the PWA as an Android app (Trusted Web Activity)** | Low | Puts the same web app on Google Play. Needs a Play developer account (one-off fee) and a privacy policy. |
| **Wrap with Capacitor for Android and iOS** | Medium | Same code in a native shell, so it can use native wake lock, file storage, Bluetooth pedals and audio. Needs an Apple developer account (yearly fee). |
| **Rebuild native or cross-platform (for example React Native or Flutter)** | High | Only worth it if mic following or audio sync needs native performance. |

Recommended path if launch becomes real: pick a name, choose the lyrics model (bring-your-own is the safest first step), move storage from `localStorage` to IndexedDB, add a privacy policy, then wrap with Capacitor so both stores are covered from one codebase.

### What would change in the architecture

- **Storage:** IndexedDB, or native storage via Capacitor, for capacity and durability. Optional cloud sync later, which would need accounts and a backend (a cost).
- **Lyrics provider layer:** a small interface so LRCLIB, a licensed API or user import can be swapped without touching the player.
- **Build step:** probably worth adding at that point (bundling, tests, type checking).
- **Analytics and crash reporting:** privacy-respecting and opt-in, if any.
- **Business model:** needed if licensed lyrics are used. One-off purchase or subscription to cover licence costs.

## Open questions

- Is launch a real goal, and on what timescale? That decides whether to start the name and licensing work now.
- If bring-your-own lyrics, what's the best import experience (paste, share sheet from other apps, file import)?
- Does mic-based following need native code, or can it run in the browser on-device?
