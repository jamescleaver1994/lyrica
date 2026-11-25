# 04 MVP design notes

**Status: current state, not a design system.** The app shipped in November 2026 is an MVP and concept. Apart from the Ocean Sunset palette and the two typefaces, which James chose on purpose, everything here describes choices made quickly while building the MVP. None of it has been designed, tested or signed off as a system. A proper design system is planned future work (see the end of this doc).

Use these notes to keep small changes consistent until then, and as raw material for the real design system. Values live in `style.css` (`:root` tokens).

| Area | Status |
| --- | --- |
| Palette (Ocean Sunset) | Chosen by James |
| Typefaces (Bricolage Grotesque, Hanken Grotesk) | Chosen by James |
| Dark, off-black background | Chosen by James (concert context) |
| No emojis, line icons | Chosen by James |
| Grain and soft gradients | Chosen by James |
| Working colour tokens, type scale, spacing, components, motion values, layout | MVP placeholders, to be designed |

## Design principles (working draft)

These came out of feedback during the MVP build. They should be reviewed when the design system is developed.


1. **The current line is the hero.** At any moment one line is unmistakably "now". Everything else steps back: upcoming lines are dimmed, chrome is minimal, the toolbar is quiet.
2. **Stage-dark by default.** An off-black, slightly teal background suits dark rooms and stages, saves battery on OLED screens, and doesn't blind the player. Light mode is not planned.
3. **Readable at arm's length.** Lyric text starts at 28 px and goes to 56 px. Body text never goes below 13 px. Touch targets are at least 44 px, and primary playback controls are bigger.
4. **Calm motion with a purpose.** Background motion is slow and soft, and it breathes with the song's tempo so it reinforces the beat rather than distracting. It pauses when playback pauses, can be turned off, and respects reduced-motion settings.
5. **Crafted, not generic.** No emojis anywhere. One consistent line icon set (inline SVG, 24 px grid, 1.8 to 2 px rounded strokes). Grain and soft gradients give warmth.
6. **Clear about uncertainty.** Data that came from a guess or an online lookup is labelled ("found online, check it against the recording"). Speed changes are always visible.
7. **Respect the device.** Controls sit inside Android and iOS safe areas, clear of the home indicator and navigation bar. The player fills the viewport exactly.

## Colour

### Brand palette: Ocean Sunset

| Name | Hex | Role |
| --- | --- | --- |
| Dark Teal | `#114B5F` | Deep surfaces and gradient stops. Not for text (contrast 2.0:1 on the background). |
| Teal | `#028090` | Cool accent, glows, active states. Large text or graphics only (4.0:1). |
| Frosted Mint | `#E4FDE1` | Primary text and the current lyric line (17.5:1). |
| Baltic Blue | `#456990` | Glows and decorative gradients. Not for text (3.3:1). |
| Bubblegum Pink | `#F45B69` | Primary accent: play button, primary actions, current-line glow (5.9:1). |

### Working tokens (MVP, not designed)

| Token | Value | Use | Contrast on `--bg` |
| --- | --- | --- | --- |
| `--bg` | `#0a1215` | App background, off-black with a teal tint | |
| `--bg-2` | `#0f2229` | Raised background | |
| `--surface` / `--surface-strong` | Mint at 6% / 10% | Cards, inputs, sheets | |
| `--text` | `#e4fde1` | Primary text, current line | 17.5:1 |
| `--muted` | `#9cc3c0` | Secondary text, labels | 9.9:1 |
| `--dim` | `#4f7b86` | Upcoming and past lyric lines | 4.1:1 |
| `--accent` | `#f45b69` | Primary accent | 5.9:1 |
| `--accent-2` | `#ff8f7e` | Sunset coral, pairs with pink in gradients, count-in numbers | 8.5:1 |
| `--accent-text` | `#1c0b10` | Text on pink buttons | 5.9:1 on pink |
| `--chord` | `#7fe3d6` | Chord names above lyrics | 12.5:1 |
| `--danger` | `#ff8a94` | Destructive actions | |

**Rules**
- Text uses Mint, muted, chord or coral only. Dark Teal and Baltic Blue are for surfaces and glows.
- Pink means "the main thing to do" or "now". Don't use it for decoration.
- `--dim` passes 3:1 for large text, which is fine for lyric lines at 28 px and up. If lyric size ever goes smaller, raise it.

## Typography

The typefaces are chosen. The scale, weights and spacing below are MVP values only.

| Family | Use | Notes |
| --- | --- | --- |
| **Bricolage Grotesque** | Brand, headings, buttons, tabs, numbers in the tempo sheet and count-in | Weights 400 to 800. Personality and display. |
| **Hanken Grotesk** | Lyrics, body text, inputs | Weights 400 to 700. Chosen for readability. Lyrics use 600 at 1.3 line height. |
| Monospace | The lyrics editor only | Keeps chord-above-words sheets aligned while editing. |

Scale in use: brand 26, h1 20, h2 18, body 16, labels 14, small 13, badges 11. Lyrics are user-set from 18 to 56 (default 28). Headings use slight negative letter spacing.

## Texture, light and motion

- **Grain:** a fixed, subtle noise layer over everything.
- **Glows:** three large radial gradients (pink, teal, blue) drift slowly behind the player over 38 to 52 seconds.
- **Pulse:** a soft glow that breathes in time with the tempo during playback, and stops on pause.
- **Current line:** Mint text with a soft pink glow. Colour transitions over 0.35 s.
- **Instrumental gaps:** three dots pulse on the current pause line.
- All motion can be turned off in Settings, and is off when the system asks for reduced motion.

## Layout and components (as built in the MVP)

- **Tab bar:** four tabs (Library, Find, Practice, Settings), icon plus label, pill behind the active tab, frosted translucent background, 72 px plus the safe area. Hidden in the player.
- **Player:** header with title and back. The lyric area has the current line anchored about 38% from the top. Bottom toolbar, top row: elapsed time, progress, remaining. Bottom row: tempo pill, large play button, click toggle, ⋯ for more.
- **Sheets:** bottom sheets for tempo, playback (speed, text size, skip intro) and song options. They keep playback controls out of the main toolbar.
- **Song tile:** cover art (or a generated colour from the title), title, artist, length, comfort badge.
- **Segmented control** for library views. **Pill buttons** for sort and filters. **Toasts** for short confirmations.
- **Empty states** explain what will appear and how to get it there, in plain words.

## Voice and content

- Plain, friendly, short. Sentence case everywhere.
- Talk about music the way players do: "tempo", "on the beat", "count-in", "first line in 20s".
- Say what happens, not what the system did: "Tap along with the beat to set one", not "BPM not found".
- No lyrics in examples, screenshots or docs. Use placeholder lines (also avoids copyright problems).

## Future work: a proper design system

To be developed in its own piece of work. Likely scope:

- Design principles, reviewed and agreed
- Colour roles and tokens built from the palette, with accessibility checked for every pairing, plus states (hover, pressed, disabled, focus)
- Type scale, spacing scale, radii, elevation and grid
- Icon set and illustration style
- Motion principles and timings
- A component library (buttons, inputs, sheets, tiles, tab bar, player toolbar, toasts, empty states) with usage guidance
- Content and voice guidelines
- Design tokens in a shareable format (for example JSON), so a future native or store build can use the same values
- A Figma (or similar) library to match

## Open questions

- Should there be a light theme for daytime outdoor use, or a high-contrast "stage" mode (pure black, larger current line)?
- Icon set: keep hand-drawn custom icons, or adopt a library (for example Lucide) when the app grows?
- A design-token file (JSON) would help a future native or cross-platform build share the same values.
