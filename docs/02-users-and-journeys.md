# 02 Users, journeys and stories

## Personas

The primary persona is real (James). The others are plausible users for a public version and should be treated as hypotheses until tested.

### 1. The home player (primary)

*Plays guitar and piano for enjoyment, sings along, is building a repertoire.*

- **Context:** sofa, bedroom, keyboard stand. Phone on a stand or the music desk, an arm's length away.
- **Goals:** play songs end to end without losing their place. Learn new songs and keep old ones from slipping.
- **Frustrations:** lyric sites that scroll at the wrong speed or not at all, screens that dim, adverts, fiddling with a thumb mid-strum, chord sheets that don't fit the screen.
- **Behaviour:** knows most songs roughly. Will happily set a tempo once if it then "just works". Opens the app a few times a week, with occasional breaks of weeks.
- **What wins them:** sync that holds, a library that feels like theirs, a gentle nudge toward songs they're forgetting.

### 2. The gigging performer

*Plays open mics, pub gigs or worship sets, with a setlist of 8 to 20 songs.*

- **Context:** a dark stage, phone or tablet on a mic stand, nerves, no time between songs.
- **Goals:** move through a setlist in order, with each song ready to go. A glance-able safety net, not a crutch.
- **Frustrations:** screens locking, bright UI blinding them, songs in the wrong order, apps that need signal.
- **What wins them:** setlists with "next song", offline reliability, a dark readable screen, a count-in that starts them on the beat.

### 3. The learner

*Months into guitar or piano, learning chords alongside words.*

- **Context:** practice sessions with a recording playing on another device.
- **Goals:** see the chords at the right moment, practise slower then build up to full speed.
- **Frustrations:** chords and words out of step, not knowing what to practise next.
- **What wins them:** inline chords, practice speed, a metronome, comfort ratings that show progress.

### Out of scope for now

Bands sharing charts, music teachers managing students, choirs. Their needs (sharing, accounts, multi-part) conflict with "private and free to run" and would be a different product decision.

## Core journeys

Each journey lists the steps and the principle that matters most at the critical step.

### J1. Add a song for the first time

1. Open **Find**, type a title and optionally the artist.
2. See results from LRCLIB, with **Synced** results marked.
3. Preview and save. Cover art and song length are filled in from iTunes, and a tempo is looked up from Deezer if available.
4. **Fallback:** if nothing is found, **Paste** lyrics, with chords inline (`[G]word`) or as a chord-above-words sheet.
5. **Critical step:** set the tempo. Type it, nudge it, or tap along with the recording. Pick a time signature if it isn't 4/4.

*Principle 3: the user's tempo is the primary path. The app should make this step feel quick and normal, not like a missing-data error.*

### J2. Play a song hands-free

1. Open a song from the Library. The first line sits in reading position.
2. Press play. An on-beat count-in clicks one or two bars.
3. During a long intro, a pill counts down to the first line ("first line in 20s, 10 bars"). Optionally skip the intro.
4. Lines highlight in time. The screen stays awake. The optional click keeps time.
5. If the user scrolls by hand to look ahead or back, auto-scroll resumes after a few seconds.
6. At the end, the app asks how it went (comfort rating) and offers the next song in the folder.

*Principles 1 and 2: sync and hands-free. Everything in this journey after "press play" should need zero taps.*

### J3. Prepare and play a setlist

1. Create a folder (for example "Friday open mic") and add songs from each song's menu.
2. Reorder the folder into running order.
3. On the night: open the folder, play the first song, and use **Next in folder** between songs.
4. Works offline once songs are saved.

### J4. Keep the repertoire fresh

1. After playing, rate the song: Not started, Learning, Getting there, Comfortable, Mastered.
2. Ratings fade slowly, counted in days the app is opened, never more than one level.
3. **Practice** shows at most five songs that are "Worth revisiting", plus a summary of songs by comfort.
4. Playing a song most of the way through restores its rating.
5. **Future:** a daily deck of five songs to swipe through (see the feature map).

*Principle 10: encouraging, never debt.*

### J5. Practise slower

1. Open the extra settings sheet (⋯ then Playback) and lower the practice speed.
2. The lyrics, count-in and click all slow together, because speed is a multiple of the song's tempo.
3. A note under the toolbar says "Practising at 90% of the real speed". One tap resets it.

### J6. Protect the library

1. Settings, then **Save backup** writes a file of all songs, folders and ratings.
2. **Restore backup** on a new phone or after a reinstall.
3. App updates never wipe songs, and the user is never asked to clear site data.

## User stories

Grouped by journey. "Shipped" means live in version 1.4.0.

| ID | As a... | I want to... | So that... | Status |
| --- | --- | --- | --- | --- |
| S1 | player | search a free lyrics library by title and artist | I don't have to type lyrics in | Shipped |
| S2 | player | see which results are time-synced | I pick the one that will scroll correctly | Shipped |
| S3 | player | paste my own lyrics with chords | songs that aren't in the library still work | Shipped |
| S4 | player | type, nudge or tap in a song's tempo | the scroll matches how the song really goes | Shipped |
| S5 | player | set a time signature | the count-in and click land on the right beats | Shipped |
| S6 | player | have lines highlight and scroll in time without touching the screen | my hands stay on the instrument | Shipped |
| S7 | player | look ahead by scrolling, then have auto-scroll carry on | I can check a lyric without losing sync | Shipped |
| S8 | player | hear a count-in on the beat | I start in time with the song | Shipped |
| S9 | player | turn a click on and off mid-song | I can keep time when I need to | Shipped |
| S10 | player | see a countdown to the first line during an intro, or skip it | I don't lose my place before the singing starts | Shipped |
| S11 | player | keep the screen awake while playing | it never locks mid-song | Shipped |
| S12 | player | tap along once to give a pasted song exact timings | unsynced songs become as good as synced ones | Shipped |
| S13 | performer | group songs into folders and reorder them | I have a setlist in running order | Shipped |
| S14 | performer | go to the next song in the folder from the player | I move through a set quickly | Shipped |
| S15 | performer | use the app with no signal | it works at any venue | Shipped |
| S16 | player | see cover art and song length in my library | I find songs at a glance | Shipped |
| S17 | player | switch between songs, artists and folders, and sort by recent, most played, comfort, title, artist or date added | a big library stays manageable | Shipped |
| S18 | learner | rate how comfortable I am with each song | I can see my progress | Shipped |
| S19 | learner | see a short list of songs that are slipping | I know what to practise | Shipped |
| S20 | learner | slow a song down without breaking sync | I can practise tricky parts | Shipped |
| S21 | player | back up and restore my library | I never lose my songs | Shipped |
| S22 | learner | swipe through five suggested songs a day | I build a practice habit | Future |
| S23 | player | play a backing track for the song | I can play along with a band sound | Future |
| S24 | performer | have the app follow my voice instead of a fixed tempo | sync survives when I speed up or slow down live | Future |
| S25 | player | discover songs to add | my repertoire grows | Future |
| S26 | performer | use a Bluetooth foot pedal to pause or skip | I control it without hands | Idea, not yet discussed |
| S27 | player | transpose chords or show a capo position | I can play in my vocal key | Idea, not yet discussed |

## Open questions

- Foot pedal support (S26) and transposition (S27) are common in this category and fit the principles. They haven't been discussed with James yet.
- How should the daily deck pick its five songs: slipping songs only, or a mix with new and mastered songs?
