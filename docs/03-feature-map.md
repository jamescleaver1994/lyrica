# 03 Feature map

Status at version 1.4.0 (23 November 2026). Keep this in step with the live app.

The 1.4.0 app is an MVP and concept. "Shipped" means a working first version exists, not that the feature is designed or finished.

## Shipped in the MVP

### Getting songs in
- **LRCLIB search** by title and artist, with time-synced results marked. Free, no key, called from the phone.
- **Paste lyrics**, with chords as `[G]word` or a chord-above-words sheet (auto-merged). `[mm:ss.xx]` timestamps are understood, so synced LRC files can be pasted.
- **Tap to time:** tap along once to give any song exact line timings.
- **Enrichment on save:** cover art and song length from the iTunes Search API (hotlinked, nothing hosted), tempo from Deezer when it has one (often it doesn't).
- **Song editor:** title, artist, length, tempo (typed or tapped), time signature, lyrics.

### Playing
- **Line highlight and auto-scroll.** The current line sits about 38% down the screen. Synced songs follow their timestamps. Unsynced songs are paced across the song length, weighted by line length.
- **Manual override:** scroll by hand, and auto-scroll resumes after 2 to 8 seconds (setting).
- **Tap a line** to jump there.
- **Tempo first:** a tempo pill opens a tempo sheet with a large typed number, − and +, a "Tap here on the beat" pad, and time signatures 2/4, 3/4, 4/4, 5/4, 6/8 and 7/8. Online tempos are labelled as found online, to check.
- **Count-in:** one or two bars on the beat (default one), or plain seconds. Optional click.
- **Metronome click** during playback, toggled from the toolbar.
- **Intro help:** "first line in Ns (N bars)" countdown, and a per-song skip-intro.
- **Practice speed** in ⋯ then Playback, as a multiple of the song tempo, with a visible reset note.
- **Wake lock** keeps the screen on while playing.
- **Text size** (18 to 56 px) and a chords on/off switch.
- **Moving background:** a slow gradient that breathes in time with the tempo. Can be turned off.
- **Next in folder** from the player.

### Library and practice
- **Four tabs:** Library (default), Find, Practice, Settings. The tab bar hides in the player.
- **Library views:** Songs, Artists (grouped, expandable), Folders. Sorts: recently played, most played, needs the most practice, title, artist, recently added. Filter box. A to Z rail for lists over 20.
- **Folders** for setlists or genres. A song can be in several. Reorderable.
- **Play counts and last played** tracked per song.
- **Comfort ratings,** five levels, asked after a song finishes. Fade only on days the app is opened, at most one level. Playing restores.
- **Worth revisiting:** up to five slipping songs on the Practice tab, plus a comfort summary.

### Platform
- Installable web app (PWA). Works offline. Self-updating without losing data.
- Backup to and restore from a file.

## Next (likely, not yet committed)

These follow directly from the principles or from feedback so far. Confirm with James before building.

- **Check that tempo lookup works on the phone.** Deezer returned no tempo for most of James's songs. That may be sparse data or a failing lookup.
- **Smoother tempo entry in Find:** prompt for the tempo straight after saving a song, as part of adding it.
- **Foot pedal and keyboard control** (space to pause, arrows to skip). Many Bluetooth page-turner pedals act as keyboards, so this is cheap and fits "hands-free".
- **Chord transpose and capo.**
- **Landscape and tablet layout** for music stands.
- **Develop a proper design system.** Only the palette and typefaces are decided so far (see [MVP design notes](04-design-system.md)).

## Future ideas

| Idea | Notes |
| --- | --- |
| **Daily practice deck** | Five songs a day to swipe through, driven by comfort data. The data is already shaped for this (`song.comfort` keeps level, practised day and history). A "coming soon" card is on the Practice tab. Must not overwhelm after a break. |
| **YouTube backing tracks** | Find and play a backing track with the embedded YouTube player. Free and no hosting. Syncing its time to the lyrics is the hard part. |
| **Mic-based live following** | Listen and follow the performer's pace. Must be an optional setting, off by default, falling back to tempo sync. On-device only, for privacy and cost. Accuracy is the risk (principle 5). |
| **Discover tab** | Suggest songs to add. Find has room for it. Needs a free data source. |
| **Genres** as a library view | Planned next to Songs, Artists and Folders. Needs a genre source or user tags. |

## Rejected, and why

| Idea | Why it was rejected |
| --- | --- |
| **Auto-guessed verse and chorus headings** | Built in 1.3, removed in 1.4. Guessing from repeated blocks and pauses was wrong too often, especially on synced songs without gaps. Breaks "honest over clever". User-written `[Chorus]` tags in pasted lyrics may still be worth respecting. |
| **Scraping lyrics from Genius** | Against Genius's terms and legally risky. LRCLIB plus paste covers the need. |
| **Relying on online tempo data** | Deezer's BPM field is empty for most songs. The user's tempo is the primary path instead. |
| **Speed as a main control** | It competed with tempo and could drift away from the real song. It's now a multiple of tempo, tucked into extra settings. |
| **Paid hosting or a backend** | Breaks the zero-cost constraint. Everything runs on the phone. |
| **Emojis in the UI** | Made it feel "vibe-coded". Replaced with a consistent line icon set. |
