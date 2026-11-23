/* Lyrica: a small offline-first lyrics teleprompter.
 * Everything is stored on the device (localStorage). Lyrics search uses the free LRCLIB API.
 */
'use strict';

const APP_VERSION = '1.0.0';
const LRCLIB = 'https://lrclib.net/api';

/* ---------------- helpers ---------------- */
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
function parseDuration(str) {
  str = String(str || '').trim();
  if (!str) return null;
  const m = str.match(/^(\d+):(\d{1,2})$/);
  if (m) return +m[1] * 60 + +m[2];
  const n = parseFloat(str);
  return isFinite(n) && n > 0 ? n : null;
}
function lrcStamp(sec) {
  const m = Math.floor(sec / 60);
  const s = sec - m * 60;
  return '[' + String(m).padStart(2, '0') + ':' + s.toFixed(2).padStart(5, '0') + ']';
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

function openModal(title, bodyText, actions) {
  $('#modal-title').textContent = title;
  $('#modal-body').textContent = bodyText;
  const box = $('#modal-actions');
  box.innerHTML = '';
  for (const a of actions) {
    const b = el('button', 'btn' + (a.primary ? ' primary' : ''), a.label);
    b.onclick = () => { closeModal(); a.run && a.run(); };
    box.appendChild(b);
  }
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; }
$('#modal-close').onclick = closeModal;
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

/* ---------------- storage ---------------- */
const store = {
  get(key, fallback) {
    try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }
    catch { return fallback; }
  },
  set(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); return true; }
    catch { toast('Could not save: storage is full or blocked'); return false; }
  },
};

const DEFAULT_SETTINGS = { fontSize: 28, resumeDelay: 3, countIn: 3, showChords: true, keepAwake: true, light: false };
let settings = Object.assign({}, DEFAULT_SETTINGS, store.get('lyrica.settings', {}));
function saveSettings() { store.set('lyrica.settings', settings); applySettings(); }
function applySettings() {
  document.documentElement.classList.toggle('light', !!settings.light);
  document.documentElement.style.setProperty('--lyric-size', settings.fontSize + 'px');
  document.querySelector('meta[name=theme-color]').content = settings.light ? '#ffffff' : '#121214';
}

let songs = store.get('lyrica.songs', []);
function saveSongs() { return store.set('lyrica.songs', songs); }
function getSong(id) { return songs.find((s) => s.id === id); }
function upsertSong(song) {
  song.updated = Date.now();
  const i = songs.findIndex((s) => s.id === song.id);
  if (i >= 0) songs[i] = song; else songs.unshift(song);
  saveSongs();
}

/* ---------------- lyric parsing ---------------- */
const CHORD_RE = /^(N\.?C\.?|[A-G](?:#|b|♯|♭)?(?:maj|min|m|M|dim|aug|sus|add|°|ø|\+|-)?\d*(?:(?:sus|add|maj|b|#)\d+)*(?:\/[A-G](?:#|b)?)?)$/;
const SECTION_RE = /^\s*[\[(]?\s*(verse|chorus|pre-?chorus|bridge|intro|outro|hook|solo|instrumental|interlude|refrain|tag|coda|break|post-?chorus)\b[^\])]*[\])]?\s*:?\s*$/i;
const TS_RE = /^\s*\[(\d{1,3}):(\d{1,2}(?:[.:]\d{1,3})?)\]/;
const META_RE = /^\s*\[(ar|ti|al|au|by|length|re|ve|offset|#):([^\]]*)\]\s*$/i;

function isChordLine(line) {
  const toks = line.trim().split(/\s+/).filter(Boolean);
  return toks.length > 0 && toks.every((t) => CHORD_RE.test(t.replace(/[|()]/g, '') || 'x') || /^[|/-]+$/.test(t));
}

/* Convert "chords on the line above the words" into inline [C]hord format. */
function mergeChordLines(rawLines) {
  const out = [];
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];
    const next = rawLines[i + 1];
    if (line.trim() && !TS_RE.test(line) && !line.includes('[') && isChordLine(line)) {
      if (next != null && next.trim() && !isChordLine(next) && !SECTION_RE.test(next) && !next.includes('[')) {
        // place chords at their column positions
        let words = next;
        const chords = [];
        line.replace(/\S+/g, (m, idx) => { chords.push([idx, m]); return m; });
        if (words.length < chords[chords.length - 1][0]) words = words.padEnd(chords[chords.length - 1][0]);
        for (let c = chords.length - 1; c >= 0; c--) {
          const [idx, ch] = chords[c];
          if (/^[|/-]+$/.test(ch)) continue;
          words = words.slice(0, idx) + '[' + ch + ']' + words.slice(idx);
        }
        out.push(words.replace(/\s+$/, ''));
        i++;
        continue;
      }
      // chord-only line (intro riff etc)
      out.push(line.trim().split(/\s+/).map((c) => (/^[|/-]+$/.test(c) ? c : '[' + c + ']')).join(' '));
      continue;
    }
    out.push(line);
  }
  return out;
}

function parseSegments(text) {
  const segs = [];
  let chord = '';
  let last = 0;
  const re = /\[([^\]]{1,16})\]/g;
  let m;
  while ((m = re.exec(text))) {
    const inner = m[1].trim();
    if (!CHORD_RE.test(inner)) continue; // not a chord, leave it as text
    const before = text.slice(last, m.index);
    if (before || chord) segs.push({ chord, text: before });
    chord = inner;
    last = re.lastIndex;
  }
  const rest = text.slice(last);
  if (rest || chord) segs.push({ chord, text: rest });
  return segs;
}

/** Turns raw lyric text into display lines with optional times and chords. */
function parseLyrics(raw) {
  let offset = 0;
  const rawLines = mergeChordLines(String(raw || '').replace(/\r/g, '').split('\n'));
  const lines = [];
  for (const rl of rawLines) {
    const meta = rl.match(META_RE);
    if (meta) {
      if (meta[1].toLowerCase() === 'offset') offset = (parseFloat(meta[2]) || 0) / 1000;
      continue;
    }
    let rest = rl;
    const times = [];
    let m;
    while ((m = rest.match(TS_RE))) {
      times.push(+m[1] * 60 + parseFloat(m[2].replace(':', '.')));
      rest = rest.slice(m[0].length);
    }
    const text = rest.trim();
    let kind = 'lyric';
    if (!text) kind = 'gap';
    else if (SECTION_RE.test(text)) kind = 'note';
    const segs = kind === 'lyric' ? parseSegments(text) : [{ chord: '', text }];
    const hasWords = segs.some((s) => s.text.trim());
    const base = { kind, src: text, segs, hasChords: segs.some((s) => s.chord), hasWords };
    if (times.length) for (const t of times) lines.push(Object.assign({}, base, { time: Math.max(0, t - offset) }));
    else lines.push(Object.assign({}, base, { time: null }));
  }
  const timed = lines.filter((l) => l.time != null).length;
  const content = lines.filter((l) => l.kind === 'lyric').length;
  const synced = timed > 0 && timed >= content * 0.5;
  if (synced) {
    // keep untimed lines in place (blank lines/sections), sort timed ones while preserving untimed positions roughly
    const anyRepeats = lines.some((l, i) => l.time != null && lines.slice(0, i).some((p) => p.time != null && p.time > l.time));
    let ordered = lines;
    if (anyRepeats) ordered = lines.filter((l) => l.time != null).sort((a, b) => a.time - b.time);
    // drop leading/trailing blank spacers
    while (ordered.length && ordered[0].kind === 'gap' && ordered[0].time == null) ordered.shift();
    return { synced: true, lines: ordered.map((l) => (l.kind === 'gap' && l.time != null ? Object.assign({}, l, { kind: 'pause' }) : l)) };
  }
  // trim leading/trailing blank lines and collapse repeated blanks
  const out = [];
  for (const l of lines) {
    if (l.kind === 'gap' && (!out.length || out[out.length - 1].kind === 'gap')) continue;
    out.push(Object.assign({}, l, { time: null }));
  }
  while (out.length && out[out.length - 1].kind === 'gap') out.pop();
  return { synced: false, lines: out };
}

/** Assigns start times to every line. Returns { lines, end }. */
function buildTimeline(parsed, song) {
  const lines = parsed.lines.map((l) => Object.assign({}, l));
  const isTimed = (l) => l.kind === 'lyric' || l.kind === 'pause';
  let end;
  if (parsed.synced) {
    // interpolate untimed lyric lines between their timed neighbours
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].time != null || lines[i].kind !== 'lyric') continue;
      let p = i - 1; while (p >= 0 && lines[p].time == null) p--;
      let n = i + 1; while (n < lines.length && lines[n].time == null) n++;
      const pt = p >= 0 ? lines[p].time : 0;
      const nt = n < lines.length ? lines[n].time : pt + 4 * (n - p);
      lines[i].time = pt + ((nt - pt) * (i - p)) / (n - p);
    }
    const last = lines.reduce((mx, l) => (l.time != null ? Math.max(mx, l.time) : mx), 0);
    end = Math.max(song.duration || 0, last + 4);
  } else {
    const weight = (l) => (l.kind !== 'lyric' ? 0 : l.hasWords ? 2 + l.src.replace(/\[[^\]]*\]/g, '').length / 12 : 1.5);
    const total = lines.reduce((s, l) => s + weight(l), 0) || 1;
    const lyricCount = lines.filter((l) => l.kind === 'lyric').length;
    const dur = song.duration || Math.max(20, lyricCount * 4);
    end = dur;
    let acc = 0;
    for (const l of lines) {
      if (l.kind === 'lyric') { l.time = (acc / total) * dur; acc += weight(l); }
    }
  }
  // index of timed lines in order, for "current line" lookups
  const order = [];
  lines.forEach((l, i) => { if (isTimed(l) && l.time != null) order.push(i); });
  order.sort((a, b) => lines[a].time - lines[b].time || a - b);
  return { lines, end, order };
}

/* ---------------- router ---------------- */
const views = ['library', 'search', 'edit', 'settings', 'player'];
function show(name) {
  for (const v of views) $('#view-' + v).hidden = v !== name;
  window.scrollTo(0, 0);
}
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) location.hash = go.dataset.go;
});
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [name, id] = h.split('/');
  if (name !== 'play') player.leave();
  if (name === 'search') { show('search'); setTimeout(() => $('#search-track').focus(), 50); }
  else if (name === 'edit') openEditor(id);
  else if (name === 'settings') openSettings();
  else if (name === 'play' && getSong(id)) player.open(getSong(id));
  else { show('library'); renderLibrary(); }
}
window.addEventListener('hashchange', route);

/* ---------------- library ---------------- */
function songBadges(song) {
  const p = parseLyrics(song.lyrics);
  const out = [];
  if (p.synced) out.push(['Synced', 'badge synced']);
  if (p.lines.some((l) => l.hasChords)) out.push(['Chords', 'badge']);
  return out;
}
function renderLibrary() {
  const q = $('#lib-filter').value.trim().toLowerCase();
  const list = $('#lib-list');
  list.innerHTML = '';
  const sorted = songs.slice().sort((a, b) => (b.lastPlayed || b.updated || 0) - (a.lastPlayed || a.updated || 0));
  const shown = sorted.filter((s) => !q || (s.title + ' ' + s.artist).toLowerCase().includes(q));
  for (const s of shown) {
    const li = el('li');
    const meta = el('div', 'meta');
    meta.append(el('div', 't', s.title || 'Untitled'), el('div', 'a', s.artist || ''));
    li.appendChild(meta);
    for (const [t, c] of songBadges(s)) li.appendChild(el('span', c, t));
    li.onclick = () => (location.hash = '#/play/' + s.id);
    list.appendChild(li);
  }
  $('#lib-empty').hidden = songs.length > 0;
  $('#lib-filter').hidden = songs.length < 6;
}
$('#lib-filter').addEventListener('input', renderLibrary);

/* ---------------- search (LRCLIB) ---------------- */
$('#search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const track = $('#search-track').value.trim();
  const artist = $('#search-artist').value.trim();
  if (!track) return;
  const status = $('#search-status');
  const list = $('#search-results');
  list.innerHTML = '';
  status.textContent = 'Searching…';
  const params = new URLSearchParams();
  if (artist) { params.set('track_name', track); params.set('artist_name', artist); }
  else params.set('q', track);
  try {
    const res = await fetch(LRCLIB + '/search?' + params);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    let results = await res.json();
    results = results.filter((r) => r.syncedLyrics || r.plainLyrics);
    results.sort((a, b) => (b.syncedLyrics ? 1 : 0) - (a.syncedLyrics ? 1 : 0));
    status.textContent = results.length ? results.length + ' found. Tap one to preview.' : 'Nothing found. Try fewer words, or paste the lyrics yourself.';
    for (const r of results.slice(0, 30)) {
      const li = el('li');
      const meta = el('div', 'meta');
      meta.append(el('div', 't', r.trackName), el('div', 'a', [r.artistName, r.albumName, r.duration ? fmtTime(r.duration) : ''].filter(Boolean).join(' · ')));
      li.appendChild(meta);
      li.appendChild(el('span', r.syncedLyrics ? 'badge synced' : 'badge', r.syncedLyrics ? 'Synced' : 'Words only'));
      li.onclick = () => previewResult(r);
      list.appendChild(li);
    }
  } catch (err) {
    status.textContent = navigator.onLine === false
      ? 'You are offline. Search needs internet, but your saved songs still work.'
      : 'Search failed (' + err.message + '). Try again in a moment.';
  }
});

function previewResult(r) {
  const plain = r.plainLyrics || (r.syncedLyrics || '').replace(/^\s*\[[^\]]*\]\s?/gm, '');
  openModal(r.trackName + ' · ' + r.artistName, plain, [
    { label: 'Cancel' },
    { label: 'Save', primary: true, run: () => saveResult(r) },
  ]);
}
function saveResult(r) {
  let song = songs.find((s) => s.lrclibId === r.id);
  if (!song) {
    song = {
      id: uid(), lrclibId: r.id, title: r.trackName, artist: r.artistName, album: r.albumName || '',
      duration: r.duration || null, lyrics: r.syncedLyrics || r.plainLyrics, speed: 1, source: 'lrclib', created: Date.now(),
    };
    upsertSong(song);
    toast('Saved to your songs');
  }
  location.hash = '#/play/' + song.id;
}

/* ---------------- editor ---------------- */
let editing = null;
let editDirty = false;
function openEditor(id) {
  const existing = id && id !== 'new' ? getSong(id) : null;
  editing = existing ? Object.assign({}, existing) : { id: uid(), title: '', artist: '', lyrics: '', duration: null, speed: 1, source: 'manual', created: Date.now() };
  $('#edit-heading').textContent = existing ? 'Edit song' : 'New song';
  $('#edit-title').value = editing.title || '';
  $('#edit-artist').value = editing.artist || '';
  $('#edit-duration').value = editing.duration ? fmtTime(editing.duration) : '';
  $('#edit-lyrics').value = editing.lyrics || '';
  $('#edit-delete').hidden = !existing;
  editDirty = false;
  show('edit');
}
for (const id of ['#edit-title', '#edit-artist', '#edit-duration', '#edit-lyrics']) $(id).addEventListener('input', () => (editDirty = true));
$('#edit-back').onclick = () => {
  if (editDirty && !confirm('Discard your changes?')) return;
  history.length > 1 ? history.back() : (location.hash = '#/');
};
$('#edit-save').onclick = () => {
  const lyrics = $('#edit-lyrics').value.replace(/\s+$/, '');
  if (!lyrics.trim()) { toast('Add some lyrics first'); return; }
  editing.title = $('#edit-title').value.trim() || lyrics.trim().split('\n')[0].replace(/\[[^\]]*\]/g, '').trim().slice(0, 40) || 'Untitled';
  editing.artist = $('#edit-artist').value.trim();
  editing.duration = parseDuration($('#edit-duration').value);
  editing.lyrics = lyrics;
  upsertSong(editing);
  editDirty = false;
  toast('Saved');
  location.replace('#/play/' + editing.id);
};
$('#edit-delete').onclick = () => {
  if (!confirm('Delete “' + editing.title + '”? This cannot be undone.')) return;
  songs = songs.filter((s) => s.id !== editing.id);
  saveSongs();
  editDirty = false;
  location.hash = '#/';
};

/* ---------------- settings ---------------- */
function openSettings() {
  $('#set-font').value = settings.fontSize;
  $('#set-font-out').textContent = settings.fontSize;
  $('#set-resume').value = String(settings.resumeDelay);
  $('#set-countin').value = String(settings.countIn);
  $('#set-chords').checked = settings.showChords;
  $('#set-wake').checked = settings.keepAwake;
  $('#set-light').checked = settings.light;
  $('#app-version').textContent = 'Version ' + APP_VERSION + ' · ' + songs.length + ' songs saved';
  show('settings');
}
$('#set-font').addEventListener('input', (e) => { settings.fontSize = +e.target.value; $('#set-font-out').textContent = settings.fontSize; saveSettings(); });
$('#set-resume').addEventListener('change', (e) => { settings.resumeDelay = +e.target.value; saveSettings(); });
$('#set-countin').addEventListener('change', (e) => { settings.countIn = +e.target.value; saveSettings(); });
$('#set-chords').addEventListener('change', (e) => { settings.showChords = e.target.checked; saveSettings(); });
$('#set-wake').addEventListener('change', (e) => { settings.keepAwake = e.target.checked; saveSettings(); });
$('#set-light').addEventListener('change', (e) => { settings.light = e.target.checked; saveSettings(); });

$('#backup-export').onclick = () => {
  const data = JSON.stringify({ app: 'lyrica', version: 1, exported: new Date().toISOString(), settings, songs }, null, 1);
  const a = el('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = 'lyrica-backup-' + new Date().toISOString().slice(0, 10) + '.json';
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
};
$('#backup-import').onclick = () => $('#backup-file').click();
$('#backup-file').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.songs)) throw new Error('not a backup');
    let added = 0;
    for (const s of data.songs) {
      if (!s || !s.id || typeof s.lyrics !== 'string') continue;
      const i = songs.findIndex((x) => x.id === s.id);
      if (i >= 0) songs[i] = s; else { songs.push(s); added++; }
    }
    saveSongs();
    toast('Restored ' + data.songs.length + ' songs (' + added + ' new)');
    openSettings();
  } catch {
    toast('That file is not a Lyrica backup');
  }
});

/* ---------------- wake lock ---------------- */
const wake = {
  lock: null,
  wanted: false,
  async on() {
    this.wanted = true;
    if (!settings.keepAwake || !('wakeLock' in navigator) || this.lock) return;
    try {
      this.lock = await navigator.wakeLock.request('screen');
      this.lock.addEventListener('release', () => (this.lock = null));
    } catch { /* not allowed right now (e.g. battery saver) */ }
  },
  off() {
    this.wanted = false;
    if (this.lock) this.lock.release().catch(() => {});
    this.lock = null;
  },
};
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible' && wake.wanted) wake.on();
  if (document.visibilityState === 'hidden' && player.playing) player.pause();
});

/* Renders one lyric line. Chord lines are split word by word so long lines wrap naturally. */
function fillLine(d, l) {
  if (!l.hasChords) { d.classList.add('wrap'); d.appendChild(el('span', 'w', l.src)); return; }
  for (const s of l.segs) {
    const words = (s.text || '').match(/\S*\s*/g).filter(Boolean);
    if (!words.length) words.push('\u2002');
    words.forEach((w, k) => {
      const seg = el('span', 'seg');
      seg.append(el('span', 'ch', k === 0 ? s.chord || '' : ''), el('span', 'w', w));
      d.appendChild(seg);
    });
  }
}

/* ---------------- player ---------------- */
const player = {
  song: null,
  tl: null,
  t: 0,
  playing: false,
  lastFrame: 0,
  manualUntil: 0,
  touching: false,
  cur: -1,
  countdownEnd: 0,
  timing: null, // tap-to-time state
  raf: 0,

  open(song) {
    this.song = song;
    this.t = 0;
    this.playing = false;
    this.manualUntil = 0;
    this.cur = -1;
    this.countdownEnd = 0;
    this.stopTiming(true);
    $('#p-title').textContent = song.title;
    $('#p-artist').textContent = song.artist || '';
    $('#p-more-panel').hidden = true;
    show('player');
    this.render();
    wake.on();
    this.updateUi();
    this.lastFrame = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((ts) => this.frame(ts));
    const box = $('#p-lyrics');
    box.scrollTop = 0;
    song.lastPlayed = Date.now();
    saveSongs();
  },
  leave() {
    if (!this.song) return;
    this.pause();
    this.stopTiming(true);
    cancelAnimationFrame(this.raf);
    wake.off();
    this.song = null;
  },
  render() {
    const parsed = parseLyrics(this.song.lyrics);
    this.tl = buildTimeline(parsed, this.song);
    this.synced = parsed.synced;
    const box = $('#p-lyrics');
    box.innerHTML = '';
    box.classList.toggle('no-chords', !settings.showChords);
    this.nodes = this.tl.lines.map((l, i) => {
      const d = el('div', 'line ' + l.kind);
      d.dataset.i = i;
      if (l.kind === 'pause') d.textContent = '♪';
      else if (l.kind === 'gap') d.innerHTML = '&nbsp;';
      else fillLine(d, l);
      box.appendChild(d);
      return d;
    });
    $('#p-mode').textContent = this.synced ? 'Synced' : 'Auto pace';
    $('#p-mode').className = 'badge' + (this.synced ? ' synced' : '');
    $('#p-chords-toggle').hidden = !this.tl.lines.some((l) => l.hasChords);
  },
  currentIndex(t) {
    const o = this.tl.order;
    let lo = 0, hi = o.length - 1, ans = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (this.tl.lines[o[mid]].time <= t + 0.05) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    return ans; // position within order
  },
  play() {
    if (this.playing) return;
    if (this.t >= this.tl.end - 0.1) this.t = 0;
    this.playing = true;
    this.manualUntil = 0;
    if (settings.countIn > 0 && this.t < 0.05 && !this.timing) this.countdownEnd = performance.now() + settings.countIn * 1000;
    this.lastFrame = performance.now();
    wake.on();
    this.updateUi();
  },
  pause() {
    this.playing = false;
    this.countdownEnd = 0;
    $('#p-countdown').hidden = true;
    this.updateUi();
  },
  toggle() { this.playing ? this.pause() : this.play(); },
  restart() {
    this.t = 0;
    this.manualUntil = 0;
    this.cur = -1;
    if (this.playing) { this.playing = false; this.play(); }
    this.updateUi();
  },
  seekToLine(i) {
    const l = this.tl.lines[i];
    if (!l || l.time == null || this.timing) return;
    this.t = l.time;
    this.manualUntil = 0;
    this.updateUi();
  },
  setSpeed(v) {
    this.song.speed = Math.round(clamp(v, 0.5, 2) * 100) / 100;
    upsertSong(this.song);
    this.updateUi();
  },
  updateUi() {
    $('#p-play').textContent = this.playing ? '❚❚' : '▶';
    $('#p-play').setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    $('#p-speed').textContent = Math.round((this.song.speed || 1) * 100) + '%';
  },
  frame(ts) {
    if (!this.song) return;
    const dt = Math.min(0.25, (ts - this.lastFrame) / 1000);
    this.lastFrame = ts;
    const cd = $('#p-countdown');
    if (this.playing && this.countdownEnd) {
      const left = Math.ceil((this.countdownEnd - ts) / 1000);
      if (left > 0) { cd.hidden = false; cd.textContent = left; }
      else { this.countdownEnd = 0; cd.hidden = true; }
    }
    if (this.playing && !this.countdownEnd) {
      this.t += dt * (this.timing ? 1 : this.song.speed || 1);
      if (!this.timing && this.t >= this.tl.end) { this.t = this.tl.end; this.pause(); }
    }
    this.paint(dt, ts);
    this.raf = requestAnimationFrame((n) => this.frame(n));
  },
  paint(dt, now) {
    const lines = this.tl.lines;
    const order = this.tl.order;
    let pos, frac = 0;
    if (this.timing) {
      pos = this.timing.next - 1;
    } else {
      pos = this.currentIndex(this.t);
      if (pos >= 0 && pos < order.length - 1) {
        const a = lines[order[pos]].time, b = lines[order[pos + 1]].time;
        frac = b > a ? clamp((this.t - a) / (b - a), 0, 1) : 0;
      } else if (pos === order.length - 1) {
        const a = lines[order[pos]].time;
        frac = clamp((this.t - a) / Math.max(1, this.tl.end - a), 0, 1) * 0.5;
      }
    }
    const curLine = pos >= 0 ? order[pos] : -1;
    if (curLine !== this.cur) {
      this.nodes.forEach((n, i) => {
        n.classList.toggle('current', i === curLine);
        n.classList.toggle('past', curLine >= 0 && i < curLine);
      });
      this.cur = curLine;
    }
    // progress
    $('#p-progress').style.width = (this.tl.end ? clamp(this.t / this.tl.end, 0, 1) * 100 : 0) + '%';
    $('#p-time').textContent = fmtTime(this.t) + ' / ' + fmtTime(this.tl.end);

    // auto-scroll (unless the user is scrolling by hand)
    const box = $('#p-lyrics');
    const manual = this.touching || now < this.manualUntil;
    $('#p-manual').hidden = !(manual && this.playing);
    if (manual) return;
    const center = (idx) => { const n = this.nodes[idx]; return n.offsetTop + n.offsetHeight / 2; };
    let target;
    if (curLine < 0) target = order.length ? center(order[0]) - (frac ? 0 : 0) : 0;
    else {
      const nextLine = pos + 1 < order.length ? order[pos + 1] : curLine;
      // ease the scroll so it moves mostly in the second half of each line
      const e = frac < 0.35 ? 0 : (frac - 0.35) / 0.65;
      const eased = e * e * (3 - 2 * e);
      target = center(curLine) + (center(nextLine) - center(curLine)) * eased;
    }
    target -= box.clientHeight * 0.42;
    const diff = target - box.scrollTop;
    if (Math.abs(diff) > 0.5) box.scrollTop += diff * Math.min(1, dt * 6);
  },

  /* ----- tap to time: build synced lyrics by tapping along ----- */
  startTiming() {
    const parsed = parseLyrics(this.song.lyrics);
    // time against the plain layout so every lyric line is stamped once, in order
    const plain = { synced: false, lines: parsed.lines.filter((l) => l.kind !== 'pause').map((l) => Object.assign({}, l, { time: null })) };
    this.tl = buildTimeline(plain, this.song);
    this.timingSource = plain;
    this.renderFromTimeline();
    this.timing = { next: 0, stamps: [] };
    this.pause();
    this.t = 0;
    $('#p-timing').hidden = false;
    $('#p-more-panel').hidden = true;
    $('#p-mode').textContent = 'Timing';
    $('#p-lyrics').scrollTop = 0;
  },
  renderFromTimeline() {
    const saveLyrics = this.song.lyrics;
    this.render(); // render uses parseLyrics; re-apply our timeline after
    this.song.lyrics = saveLyrics;
    this.tl = buildTimeline(this.timingSource, this.song);
    // rebuild nodes for the plain layout
    const box = $('#p-lyrics');
    box.innerHTML = '';
    this.nodes = this.tl.lines.map((l, i) => {
      const d = el('div', 'line ' + l.kind);
      d.dataset.i = i;
      if (l.kind === 'gap') d.innerHTML = '&nbsp;';
      else fillLine(d, l);
      box.appendChild(d);
      return d;
    });
    this.cur = -2;
  },
  timingTap() {
    if (!this.timing) return;
    if (!this.playing) { this.playing = true; this.countdownEnd = 0; this.lastFrame = performance.now(); this.updateUi(); }
    const o = this.tl.order;
    if (this.timing.next >= o.length) return;
    this.timing.stamps[this.timing.next] = this.t;
    this.timing.next++;
    this.manualUntil = 0;
    if (this.timing.next >= o.length) this.finishTiming();
  },
  finishTiming() {
    this.pause();
    const stamps = this.timing.stamps;
    const order = this.tl.order;
    const timeOf = new Map(order.map((li, k) => [li, stamps[k]]));
    const out = [];
    this.tl.lines.forEach((l, i) => {
      if (timeOf.has(i)) out.push(lrcStamp(timeOf.get(i)) + ' ' + l.src);
      else if (l.kind === 'note') out.push(l.src);
      else out.push('');
    });
    const lrc = out.join('\n');
    openModal('Timing finished', 'Save these timings? The song will then scroll exactly in time with how you just tapped it. You can redo it any time.', [
      { label: 'Discard', run: () => { this.stopTiming(); } },
      { label: 'Save timings', primary: true, run: () => {
        this.song.lyrics = lrc;
        if (!this.song.duration || this.song.duration < this.t) this.song.duration = Math.ceil(this.t + 3);
        this.song.speed = 1;
        upsertSong(this.song);
        this.stopTiming();
        toast('Timings saved');
      } },
    ]);
  },
  stopTiming(silent) {
    const was = !!this.timing;
    this.timing = null;
    $('#p-timing').hidden = true;
    if (was && !silent && this.song) {
      this.pause();
      this.t = 0;
      this.render();
      this.updateUi();
      $('#p-lyrics').scrollTop = 0;
    }
  },
};

/* player controls */
$('#p-play').onclick = () => player.toggle();
$('#p-restart').onclick = () => player.restart();
$('#p-slower').onclick = () => { player.setSpeed((player.song.speed || 1) - 0.05); toast('Speed ' + Math.round(player.song.speed * 100) + '%'); };
$('#p-faster').onclick = () => { player.setSpeed((player.song.speed || 1) + 0.05); toast('Speed ' + Math.round(player.song.speed * 100) + '%'); };
$('#p-speed-reset').onclick = () => player.setSpeed(1);
$('#p-more').onclick = () => ($('#p-more-panel').hidden = !$('#p-more-panel').hidden);
$('#p-font-down').onclick = () => { settings.fontSize = clamp(settings.fontSize - 2, 16, 56); saveSettings(); };
$('#p-font-up').onclick = () => { settings.fontSize = clamp(settings.fontSize + 2, 16, 56); saveSettings(); };
$('#p-chords-toggle').onclick = () => { settings.showChords = !settings.showChords; saveSettings(); $('#p-lyrics').classList.toggle('no-chords', !settings.showChords); };
$('#p-edit').onclick = () => { if (player.song) location.hash = '#/edit/' + player.song.id; };
$('#p-tap-time').onclick = () => player.startTiming();
$('#t-next').onclick = () => player.timingTap();
$('#t-cancel').onclick = () => player.stopTiming();

const lyr = $('#p-lyrics');
lyr.addEventListener('click', (e) => {
  const line = e.target.closest('.line');
  if (line) player.seekToLine(+line.dataset.i);
});
const startManual = () => { player.touching = true; };
const endManual = () => { player.touching = false; player.manualUntil = performance.now() + settings.resumeDelay * 1000; };
lyr.addEventListener('touchstart', startManual, { passive: true });
lyr.addEventListener('touchend', endManual, { passive: true });
lyr.addEventListener('touchcancel', endManual, { passive: true });
lyr.addEventListener('wheel', () => { player.manualUntil = performance.now() + settings.resumeDelay * 1000; }, { passive: true });
document.addEventListener('keydown', (e) => {
  if ($('#view-player').hidden || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName)) return;
  if (e.code === 'Space') { e.preventDefault(); player.timing ? player.timingTap() : player.toggle(); }
});

/* ---------------- boot ---------------- */
applySettings();
route();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js').catch(() => {});
}
