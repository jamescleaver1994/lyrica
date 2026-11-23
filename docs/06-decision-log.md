# 06 Decision log

Newest first. Add a line whenever a decision is made or reversed, and update the doc it affects in the same change.

Format: **date, decision.** Why. *(Affects: doc)*

## November 2026

- **2026-11-23, Foundation docs created** in `docs/`, covering proposition, users, features, design, architecture and this log. *(Affects: all)*
- **2026-11-23, Product principles adopted:** sync to real song time comes first, the user entering tempo is the primary path, and speed adjustment is hidden in extra settings with correct tempo as the default. Why: the app is for following lyrics hands-free while playing, and Deezer tempo data is too sparse to design around. *(Affects: 01, 03, 04)*
- **2026-11-23, Auto-guessed verse and chorus headings removed** (built in 1.3, removed in 1.4). Why: guesses were inconsistent, especially on synced songs without pauses, and wrong labels are worse than none. *(Affects: 03)*
- **2026-11-23, Playback toolbar rebuilt** with fewer buttons: progress row, then tempo pill, play, click toggle and ⋯. Why: the previous toolbar was cramped and sat behind phone chrome. *(Affects: 04)*
- **2026-11-23, Intro help added:** a "first line in" countdown and a per-song skip-intro. Why: long intros made it easy to lose your place before singing starts. *(Affects: 03)*
- **2026-11-23, Speed and tempo merged into one model.** Speed is a multiple of the song's tempo, so lyrics, count-in and click always agree. Why: James flagged that separate speed and BPM controls could clash. *(Affects: 03, 05)*
- **2026-11-23, Metronome click during playback,** with a toggle in the player. Why: James couldn't hear it after the count-in, and the switch was hidden. *(Affects: 03)*
- **2026-11-23, Four-tab navigation** (Library, Find, Practice, Settings) in a Material 3 and iOS style, hidden in the player. Library gets Songs, Artists and Folders views with six sorts and an A to Z rail. *(Affects: 03, 04)*
- **2026-11-23, On-beat count-in** (one bar by default) replaces a 3 second countdown. *(Affects: 03)*
- **2026-11-23, Tempo looked up from Deezer** as an optional pre-fill (JSONP, often empty), with tap tempo and manual entry. *(Affects: 03, 05)*
- **2026-11-23, Safe update path:** cache-busted files, fresh installs and reloads, so updates never need site data cleared. Why: a stale cache caused a black screen. Rule: never ask the user to clear site data, because it wipes songs. *(Affects: 05)*
- **2026-11-23, Comfort ratings** with five levels. Decay counts only days the app is opened, a song slips at most one level, playing restores it, and at most five songs show in "Worth revisiting". Why: avoid everything looking "rusty" after a break. Data is shaped for a future swipe deck. *(Affects: 02, 03)*
- **2026-11-23, Cover art and song length from the iTunes Search API,** hotlinked so nothing is hosted. *(Affects: 03, 05)*
- **2026-11-23, Folders** for setlists and genres. A song can be in several. Setlists are reorderable with "Next in folder". *(Affects: 03)*
- **2026-11-23, Visual identity:** Ocean Sunset palette on an off-black teal background (concert context), Bricolage Grotesque and Hanken Grotesk, soft gradients and grain, no emojis. *(Affects: 04)*
- **2026-11-23, Swipeable practice deck and YouTube backing tracks** recorded as future ideas, not built. *(Affects: 03)*
- **2026-11-23, Repository and name:** `jamescleaver1994/lyrica`, app called Lyrica for personal use. A subdomain on jamescleaver.com was discussed but not committed. *(Affects: 05)*
- **2026-11-23, Platform:** installable web app (PWA), plain HTML, CSS and JavaScript with no build step, on free GitHub Pages, with songs stored on the phone. Why: zero hosting cost and no tooling for a non-coder to manage. *(Affects: 05)*
- **2026-11-23, Lyrics sources:** LRCLIB plus manual paste with chords. No Genius scraping. Why: free, legal for personal use, and covers most needs. *(Affects: 03, 05)*
- **2026-11-23, Mic-based live following** deferred. It must be optional and off by default, with manual tempo and font size as the default and manual scroll overrides that resume automatically. *(Affects: 01, 03)*

## Standing constraints

- Zero hosting cost while Lyrica is personal.
- James doesn't code. Setup steps must be no-code friendly.
- No real lyrics in docs, examples, tests or screenshots. Use placeholder text.
- Going public needs a new name ("Lyrica" is a drug trademark) and licensed or bring-your-own lyrics.
