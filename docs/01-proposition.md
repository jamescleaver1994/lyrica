# 01 Proposition and principles

## The proposition

**For** people who play guitar or piano and sing along, at home, at rehearsal or on stage,
**who** need the words and chords in front of them but can't take their hands off the instrument to scroll,
**Lyrica is** a hands-free lyric and chord follower
**that** scrolls and highlights each line in time with the real song, from a tempo they set once.
**Unlike** lyric sites, chord sites and general teleprompter apps, which scroll at a guessed or fixed speed and need constant nudging,
**Lyrica** treats staying in sync with the song as the whole job, and wraps it in a calm, dark, stage-ready screen and a light practice routine.

### In one line

Set the tempo, press play, keep playing.

### The problem it solves

When you play and sing, you need three things at once: the words, the chords, and your hands. Paper falls off music stands. Lyric sites scroll at the wrong speed, show adverts, and dim the screen. Chord apps need a thumb to scroll, which you don't have free. The real cost is losing your place mid-song.

### What Lyrica is not

- Not a music player. It doesn't play the recording (a backing-track idea exists, see the feature map, but the core works with no audio).
- Not a lyrics catalogue or a social platform. It holds your own library.
- Not a learning course or a tab editor. It supports practice, it doesn't teach.
- Not a karaoke app. The audience is the performer, not a party.

## Product principles

Ordered. When two principles conflict, the higher one wins.

1. **Sync to the real song comes above everything.** Lyrica exists to keep the highlighted line where the singer is. Any feature that risks drifting out of time, or adds a tap during playback, has to earn its place against this.
2. **Hands-free once playing.** After pressing play, the user shouldn't need to touch the screen. Manual scroll is an override that hands control back automatically (after a short, configurable delay).
3. **The user's tempo is the primary path.** Online tempo data (Deezer) is too sparse to rely on. The interface is designed around the user typing, nudging or tapping in a BPM, with online data as a pre-fill to check, never as the truth.
4. **Correct tempo is the default. Speed changes are a deliberate, visible exception.** Practice speed lives in the extra settings sheet. When it's not 100%, the screen says so and offers a one-tap reset.
5. **Honest over clever.** Don't show guesses as facts. Auto-guessed verse and chorus headings were built, tried and removed because they were wrong too often. Prefer no information to wrong information.
6. **Readable at arm's length, in the dark.** Large type, high contrast, off-black background, one obvious current line. Designed for a phone on a music stand under stage lighting.
7. **Private and owned by the user.** Songs live on the device. No account is needed. Backups are a file the user keeps.
8. **Costs nothing to run.** No servers to pay for. Every external service is free and called straight from the phone. This is a hard constraint while Lyrica is personal, and a strong preference after.
9. **Crafted, not vibe-coded.** No emojis, consistent line icons, considered typography and motion. It should feel like a designed instrument, not a weekend script.
10. **Practice should feel encouraging, never like debt.** Comfort ratings fade gently and only on days the app is used, and only a few songs are surfaced at once, so a break never leaves everything looking "rusty".

## How to use the principles

- **Breaking ties:** if a proposal helps practice (10) but adds a tap during playback (2), playback wins. Look for a way to move the practice step before or after the song.
- **New data sources:** if it can't be called from the phone for free, it breaks principle 8 for the personal app. Log it as a launch-phase idea instead.
- **New "smart" features** (auto-detection, mic following, AI): they must be opt-in, must degrade to the manual path, and must pass principle 5. If accuracy is uncertain, ship them behind a setting that is off by default.

## Success, in the user's terms

- "I got through the whole song without touching my phone."
- "The highlighted line was where I was singing."
- "I could read it from my stool without leaning in."
- "I opened it after two weeks off and it didn't make me feel bad."

## Open questions

- Is the long-term audience just James, a small circle of musicians, or the public? This decides how much of the [launch path](05-architecture-and-launch.md) matters.
- Should singers without instruments (choir, vocal practice) be in scope? They share most needs but not chords or metronome.
- A new product name is needed before any public release (see the [decision log](06-decision-log.md)).
