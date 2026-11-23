/* Lyrica: a small offline-first lyrics teleprompter.
 * Everything is stored on the device (localStorage). Lyrics search uses the free LRCLIB API,
 * cover art is looked up with Apple's free iTunes Search API and shown straight from Apple's servers.
 */
'use strict';

const APP_VERSION = '1.1.1';
const LRCLIB = 'https://lrclib.net/api';
const ITUNES = 'https://itunes.apple.com/search';

/* ---------------- helpers ---------------- */
const $ = (sel) => document.querySelector(sel);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const svgIcon = (name) => {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  const u = document.createElementNS('http://www.w3.org/2000/svg', 'use');
  u.setAttribute('href', '#i-' + name);
  s.appendChild(u);
  return s;
};
const iconBtn = (name, label, cls) => {
  const b = el('button', 'icon-btn' + (cls ? ' ' + cls : ''));
  b.type = 'button';
  b.setAttribute('aria-label', label);
  b.appendChild(svgIcon(name));
  return b;
};
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);

function fmtTime(sec) {
  sec = Math.max(0, Math.floor(sec || 0));
  return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
}
function fmtTotal(sec) {
  const m = Math.round(sec / 60);
  return m >= 60 ? Math.floor(m / 60) + ' hr ' + (m % 60) + ' min' : m + ' min';
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
function hashHue(str) {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

let toastTimer;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => (t.hidden = true), 2600);
}

/* Bottom sheet. body can be a string or a DOM node. */
function openModal(title, body, actions = []) {
  $('#modal-title').textContent = title;
  const b = $('#modal-body');
  b.innerHTML = '';
  if (typeof body === 'string') b.appendChild(el('div', 'pre', body));
  else if (body) b.appendChild(body);
  const box = $('#modal-actions');
  box.innerHTML = '';
  for (const a of actions) {
    const btn = el('button', 'btn' + (a.primary ? ' primary' : '') + (a.danger ? ' danger' : ''), a.label);
    btn.onclick = () => { if (!a.keepOpen) closeModal(); a.run && a.run(); };
    box.appendChild(btn);
  }
  $('#modal').hidden = false;
}
function closeModal() { $('#modal').hidden = true; }
$('#modal-close').onclick = closeModal;
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

function askText(title, label, value, onOk) {
  const wrap = el('label', null, label);
  const input = el('input', 'input');
  input.value = value || '';
  input.autocomplete = 'off';
  wrap.appendChild(input);
  openModal(title, wrap, [
    { label: 'Cancel' },
    { label: 'Save', primary: true, run: () => { const v = input.value.trim(); if (v) onOk(v); } },
  ]);
  input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { closeModal(); const v = input.value.trim(); if (v) onOk(v); } });
  setTimeout(() => input.focus(), 60);
}

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

const DEFAULT_SETTINGS = { fontSize: 28, resumeDelay: 3, countIn: 3, showChords: true, keepAwake: true, motion: true, covers: true };
let settings = Object.assign({}, DEFAULT_SETTINGS, store.get('lyrica.settings', {}));
function saveSettings() { store.set('lyrica.settings', settings); applySettings(); }
function applySettings() {
  document.documentElement.style.setProperty('--lyric-size', settings.fontSize + 'px');
  $('#view-player').classList.toggle('no-motion', !settings.motion);
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
function deleteSong(id) {
  songs = songs.filter((s) => s.id !== id);
  for (const f of folders) f.songIds = f.songIds.filter((x) => x !== id);
  saveSongs();
  saveFolders();
}

/* ---------------- folders (setlists, genres...) ----------------
 * A folder keeps an ordered list of song ids, so a song can sit in several folders
 * and setlists keep their running order.
 */
let folders = store.get('lyrica.folders', []);
function saveFolders() { return store.set('lyrica.folders', folders); }
function getFolder(id) { return folders.find((f) => f.id === id); }
function createFolder(name) {
  const f = { id: uid(), name, songIds: [], created: Date.now() };
  folders.push(f);
  saveFolders();
  return f;
}
function toggleInFolder(folder, songId, on) {
  const has = folder.songIds.includes(songId);
  if (on && !has) folder.songIds.push(songId);
  if (!on && has) folder.songIds = folder.songIds.filter((x) => x !== songId);
  saveFolders();
}

/* ---------------- comfort ratings ----------------
 * Each song can be rated on five levels. Ratings fade slowly so songs you have not
 * played in a while surface as "worth revisiting".
 *
 * To stop everything going rusty after a break, fading is counted in *active days*
 * (days you actually open the app), not calendar days. A month away freezes everything.
 * A rating can also only fade by one level at most, and only 5 songs are suggested at a time.
 *
 * Data kept per song (shaped for a future swipe-card practice mode):
 *   song.comfort = { level, ratedDay, practicedDay, practicedAt, history: [{ at, level }] }
 */
const LEVELS = [
  { label: 'Not started', hint: 'On the list to learn', score: 0, fade: 0 },
  { label: 'Learning', hint: 'Still reading most of it', score: 25, fade: 2 },
  { label: 'Getting there', hint: 'Know the shape, a few gaps', score: 50, fade: 1.5 },
  { label: 'Comfortable', hint: 'Can play it with a glance', score: 75, fade: 1 },
  { label: 'Mastered', hint: 'Could play it in my sleep', score: 100, fade: 0.5 },
];
const REVISIT_LIMIT = 5;
const SLIP_THRESHOLD = 10;

let meta = Object.assign({ activeDay: 0, lastActiveDate: '' }, store.get('lyrica.meta', {}));
(function countActiveDay() {
  const today = new Date().toLocaleDateString('en-CA');
  if (meta.lastActiveDate !== today) {
    meta.activeDay += 1;
    meta.lastActiveDate = today;
    store.set('lyrica.meta', meta);
  }
})();

function comfortOf(song) {
  const c = song.comfort;
  if (!c || c.level == null) return null;
  const lvl = LEVELS[c.level];
  const idle = Math.max(0, meta.activeDay - (c.practicedDay ?? c.ratedDay ?? meta.activeDay));
  const floor = Math.max(0, lvl.score - 25);
  const score = Math.max(floor, lvl.score - lvl.fade * idle);
  return { level: c.level, label: lvl.label, rated: lvl.score, score, slip: lvl.score - score, idle };
}
function rateSong(song, level) {
  const c = song.comfort || { history: [] };
  c.level = level;
  c.ratedDay = meta.activeDay;
  c.practicedDay = meta.activeDay;
  c.practicedAt = Date.now();
  c.history = (c.history || []).concat({ at: Date.now(), level }).slice(-50);
  song.comfort = c;
  upsertSong(song);
}
function markPracticed(song) {
  if (!song.comfort || song.comfort.level == null) return;
  song.comfort.practicedDay = meta.activeDay;
  song.comfort.practicedAt = Date.now();
  upsertSong(song);
}
function revisitList() {
  return songs
    .map((s) => ({ s, c: comfortOf(s) }))
    .filter(({ c }) => c && c.level > 0 && c.slip >= SLIP_THRESHOLD)
    .sort((a, b) => b.c.slip - a.c.slip || (a.s.comfort.practicedAt || 0) - (b.s.comfort.practicedAt || 0))
    .slice(0, REVISIT_LIMIT)
    .map(({ s }) => s);
}

/* ---------------- cover art (iTunes Search API, nothing hosted by us) ---------------- */
const coverQueue = [];
let coverBusy = false;
function needsCover(song) { return settings.covers && song.art === undefined && (song.title || '').trim(); }
function queueCover(song) {
  if (!needsCover(song) || coverQueue.includes(song.id)) return;
  coverQueue.push(song.id);
  runCoverQueue();
}
async function runCoverQueue() {
  if (coverBusy || !coverQueue.length || navigator.onLine === false) return;
  coverBusy = true;
  const song = getSong(coverQueue.shift());
  if (song && needsCover(song)) {
    try {
      const info = await lookupCover(song.title, song.artist);
      song.art = info ? info.art : '';
      if (info && !song.duration && info.duration) song.duration = info.duration;
      upsertSong(song);
      document.querySelectorAll('[data-cover="' + song.id + '"]').forEach((n) => paintCover(n, song));
      document.querySelectorAll('[data-dur="' + song.id + '"]').forEach((n) => (n.textContent = songSubtitle(song)));
    } catch { /* offline or blocked: try again next launch */ }
  }
  coverBusy = false;
  setTimeout(runCoverQueue, 350);
}
async function lookupCover(title, artist) {
  const term = [artist, title].filter(Boolean).join(' ');
  const params = new URLSearchParams({ term, entity: 'song', limit: '8' });
  let data;
  try {
    const res = await fetch(ITUNES + '?' + params);
    if (!res.ok) throw new Error('HTTP ' + res.status);
    data = await res.json();
  } catch {
    data = await jsonp(ITUNES + '?' + params); // fallback if the browser blocks the direct request
  }
  const norm = (s) => String(s || '').toLowerCase().replace(/\(.*?\)|\[.*?\]|feat\..*|[^a-z0-9]/g, '');
  const results = data.results || [];
  const best = results.find((r) => norm(r.trackName) === norm(title) && (!artist || norm(r.artistName).includes(norm(artist)) || norm(artist).includes(norm(r.artistName))))
    || results.find((r) => !artist || norm(r.artistName) === norm(artist))
    || null;
  if (!best || !best.artworkUrl100) return null;
  return { art: best.artworkUrl100.replace(/\/\d+x\d+bb\./, '/300x300bb.'), duration: best.trackTimeMillis ? Math.round(best.trackTimeMillis / 1000) : null };
}
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const name = '__lyrica_cb' + Math.random().toString(36).slice(2);
    const sc = document.createElement('script');
    const done = () => { delete window[name]; sc.remove(); };
    const timer = setTimeout(() => { done(); reject(new Error('timeout')); }, 8000);
    window[name] = (data) => { clearTimeout(timer); done(); resolve(data); };
    sc.onerror = () => { clearTimeout(timer); done(); reject(new Error('blocked')); };
    sc.src = url + '&callback=' + name;
    document.head.appendChild(sc);
  });
}
function paintCover(node, song) {
  const pairs = [['#028090', '#114b5f'], ['#f45b69', '#456990'], ['#456990', '#114b5f'], ['#028090', '#f45b69'], ['#114b5f', '#f45b69']];
  const [c1, c2] = pairs[hashHue((song.title || '') + (song.artist || '')) % pairs.length];
  node.style.setProperty('--c1', c1);
  node.style.setProperty('--c2', c2);
  node.innerHTML = '';
  node.appendChild(svgIcon('note'));
  if (song.art) {
    const img = el('img');
    img.alt = '';
    img.loading = 'lazy';
    img.referrerPolicy = 'no-referrer';
    img.src = song.art;
    img.onerror = () => img.remove();
    node.appendChild(img);
  }
}
function coverNode(song) {
  const c = el('div', 'cover');
  c.dataset.cover = song.id;
  paintCover(c, song);
  return c;
}
function songSubtitle(song) {
  return [song.artist, song.duration ? fmtTime(song.duration) : ''].filter(Boolean).join(' · ');
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
  document.documentElement.classList.toggle('in-player', name === 'player');
  if (name !== 'player') window.scrollTo(0, 0);
}
document.addEventListener('click', (e) => {
  const go = e.target.closest('[data-go]');
  if (go) location.hash = go.dataset.go;
});
function route() {
  closeModal();
  const h = location.hash.replace(/^#\/?/, '');
  const [name, id, extra] = h.split('/');
  if (name !== 'play') player.leave();
  if (name === 'search') { show('search'); setTimeout(() => $('#search-track').focus(), 50); }
  else if (name === 'edit') openEditor(id);
  else if (name === 'settings') openSettings();
  else if (name === 'play' && getSong(id)) player.open(getSong(id), extra && getFolder(extra) ? extra : null);
  else openLibrary(name === 'folder' && getFolder(id) ? id : null);
}
window.addEventListener('hashchange', route);

/* ---------------- library ---------------- */
let libFolder = null;
let reorderMode = false;

function openLibrary(folderId) {
  if (folderId !== libFolder) reorderMode = false;
  libFolder = folderId;
  show('library');
  renderLibrary();
}

function renderChips() {
  const box = $('#folder-chips');
  box.innerHTML = '';
  const mk = (label, active, onClick, cls) => {
    const c = el('button', 'chip' + (active ? ' active' : '') + (cls ? ' ' + cls : ''));
    c.type = 'button';
    if (cls === 'add') c.appendChild(svgIcon('plus'));
    c.appendChild(document.createTextNode(label));
    c.onclick = onClick;
    box.appendChild(c);
    return c;
  };
  mk('All songs', !libFolder, () => (location.hash = '#/'));
  for (const f of folders) mk(f.name, libFolder === f.id, () => (location.hash = '#/folder/' + f.id));
  mk('New folder', false, () => askText('New folder', 'Name, e.g. "Friday setlist" or "Acoustic"', '', (name) => {
    const f = createFolder(name);
    location.hash = '#/folder/' + f.id;
  }), 'add');
}

function comfortRow(song, compact) {
  const c = comfortOf(song);
  const row = el('div', 'comfort');
  const bar = el('div', 'comfort-bar');
  const fill = el('i');
  fill.style.width = (c ? Math.max(4, c.score) : 0) + '%';
  bar.appendChild(fill);
  let label = 'Not rated';
  let slipping = false;
  if (c) {
    slipping = c.slip >= SLIP_THRESHOLD;
    label = slipping ? (compact ? 'Needs a refresh' : c.label + ', needs a refresh') : c.label;
  }
  row.append(bar, el('span', 'comfort-label' + (slipping ? ' slipping' : ''), label));
  return row;
}

function songTile(song, opts = {}) {
  const li = el('li');
  li.appendChild(coverNode(song));
  const m = el('div', 'meta');
  const sub = el('div', 'a', songSubtitle(song));
  sub.dataset.dur = song.id;
  m.append(el('div', 't', song.title || 'Untitled'), sub, comfortRow(song));
  li.appendChild(m);
  if (parseLyrics(song.lyrics).synced) li.appendChild(el('span', 'badge synced', 'Synced'));
  if (opts.reorder) {
    const r = el('div', 'reorder');
    const up = iconBtn('up', 'Move up');
    const down = iconBtn('down', 'Move down');
    up.disabled = opts.index === 0;
    down.disabled = opts.index === opts.count - 1;
    up.onclick = (e) => { e.stopPropagation(); moveInFolder(opts.index, -1); };
    down.onclick = (e) => { e.stopPropagation(); moveInFolder(opts.index, 1); };
    r.append(up, down);
    li.appendChild(r);
  } else {
    const more = iconBtn('more', 'Song options');
    more.onclick = (e) => { e.stopPropagation(); openSongSheet(song); };
    li.appendChild(more);
    li.onclick = () => (location.hash = '#/play/' + song.id + (libFolder ? '/' + libFolder : ''));
  }
  queueCover(song);
  return li;
}

function moveInFolder(i, dir) {
  const f = getFolder(libFolder);
  const j = i + dir;
  if (!f || j < 0 || j >= f.songIds.length) return;
  [f.songIds[i], f.songIds[j]] = [f.songIds[j], f.songIds[i]];
  saveFolders();
  renderLibrary();
}

function renderRevisit() {
  const list = revisitList();
  $('#revisit').hidden = !list.length || !!libFolder;
  const box = $('#revisit-list');
  box.innerHTML = '';
  $('#revisit-sub').textContent = list.length === 1 ? '1 song slipping' : list.length + ' songs slipping';
  for (const s of list) {
    const card = el('div', 'rcard');
    card.append(coverNode(s), el('div', 't', s.title), el('div', 'a', s.artist || ''), comfortRow(s, true));
    card.onclick = () => (location.hash = '#/play/' + s.id);
    box.appendChild(card);
  }
}

function renderLibrary() {
  renderChips();
  renderRevisit();
  const folder = libFolder ? getFolder(libFolder) : null;
  $('#folder-head').hidden = !folder;
  const q = $('#lib-filter').value.trim().toLowerCase();
  let shown;
  if (folder) {
    shown = folder.songIds.map(getSong).filter(Boolean);
    $('#folder-name').textContent = folder.name;
    const total = shown.reduce((s, x) => s + (x.duration || 0), 0);
    $('#folder-meta').textContent = shown.length + (shown.length === 1 ? ' song' : ' songs') + (total ? ' · ' + fmtTotal(total) : '');
    $('#folder-reorder').textContent = reorderMode ? 'Done' : 'Reorder';
    $('#folder-reorder').hidden = shown.length < 2;
  } else {
    shown = songs.slice().sort((a, b) => (b.lastPlayed || b.updated || 0) - (a.lastPlayed || a.updated || 0));
  }
  const pool = shown;
  if (q && !reorderMode) shown = shown.filter((s) => (s.title + ' ' + (s.artist || '')).toLowerCase().includes(q));
  const list = $('#lib-list');
  list.innerHTML = '';
  shown.forEach((s, i) => list.appendChild(songTile(s, { reorder: reorderMode && folder, index: i, count: shown.length })));
  $('#lib-filter').hidden = pool.length < 6 || reorderMode;
  const empty = $('#lib-empty');
  empty.hidden = pool.length > 0;
  empty.textContent = folder
    ? 'This folder is empty. Use the options button on any song to add it here.'
    : 'No songs yet. Find one online or paste your own lyrics to get started.';
}
$('#lib-filter').addEventListener('input', renderLibrary);
$('#folder-reorder').onclick = () => { reorderMode = !reorderMode; renderLibrary(); };
$('#folder-menu').onclick = () => {
  const f = getFolder(libFolder);
  if (!f) return;
  openModal(f.name, f.songIds.length + ' songs. Deleting a folder keeps the songs in your library.', [
    { label: 'Rename', run: () => askText('Rename folder', 'Name', f.name, (name) => { f.name = name; saveFolders(); renderLibrary(); }) },
    { label: 'Delete folder', danger: true, run: () => {
      if (!confirm('Delete the folder "' + f.name + '"? Songs stay in your library.')) return;
      folders = folders.filter((x) => x.id !== f.id);
      saveFolders();
      location.hash = '#/';
    } },
  ]);
};

/* Song options: comfort level, folders, edit, delete */
function levelPicker(current, onPick) {
  const box = el('div', 'levels');
  LEVELS.forEach((lvl, i) => {
    const b = el('button', 'level' + (current === i ? ' active' : ''));
    b.type = 'button';
    const pips = el('span', 'pips');
    for (let k = 1; k <= 4; k++) { const p = el('i'); if (k <= i) p.className = 'on'; pips.appendChild(p); }
    const txt = el('span', 'grow');
    txt.append(document.createTextNode(lvl.label), el('small', null, lvl.hint));
    b.append(pips, txt);
    if (current === i) b.appendChild(svgIcon('check'));
    b.onclick = () => onPick(i);
    box.appendChild(b);
  });
  return box;
}

function openSongSheet(song) {
  const body = el('div', 'stack');
  body.appendChild(el('div', 'field-label', 'How well do you know it?'));
  const c = comfortOf(song);
  body.appendChild(levelPicker(c ? c.level : null, (i) => {
    rateSong(song, i);
    toast('Marked as ' + LEVELS[i].label.toLowerCase());
    closeModal();
    rerender();
  }));
  body.appendChild(el('div', 'field-label', 'Folders'));
  const fo = el('div', 'folder-opts');
  for (const f of folders) {
    const lab = el('label', 'folder-opt');
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = f.songIds.includes(song.id);
    cb.onchange = () => { toggleInFolder(f, song.id, cb.checked); rerender(); };
    lab.append(cb, document.createTextNode(f.name));
    fo.appendChild(lab);
  }
  const nf = el('button', 'btn small');
  nf.type = 'button';
  nf.append(svgIcon('plus'), document.createTextNode('New folder'));
  nf.onclick = () => askText('New folder', 'Name', '', (name) => {
    const f = createFolder(name);
    toggleInFolder(f, song.id, true);
    toast('Added to ' + name);
    rerender();
  });
  fo.appendChild(nf);
  body.appendChild(fo);
  openModal(song.title || 'Song', body, [
    { label: 'Edit lyrics', run: () => (location.hash = '#/edit/' + song.id) },
    { label: 'Delete', danger: true, run: () => {
      if (!confirm('Delete "' + song.title + '"? This cannot be undone.')) return;
      deleteSong(song.id);
      rerender();
    } },
  ]);
}
function rerender() { if (!$('#view-library').hidden) renderLibrary(); }

/* ---------------- search (LRCLIB) ---------------- */
$('#search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const track = $('#search-track').value.trim();
  const artist = $('#search-artist').value.trim();
  if (!track) return;
  const status = $('#search-status');
  const list = $('#search-results');
  list.innerHTML = '';
  list.classList.add('results');
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
      const m = el('div', 'meta');
      m.append(el('div', 't', r.trackName), el('div', 'a', [r.artistName, r.albumName, r.duration ? fmtTime(r.duration) : ''].filter(Boolean).join(' · ')));
      li.appendChild(m);
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
      duration: r.duration ? Math.round(r.duration) : null, lyrics: r.syncedLyrics || r.plainLyrics, speed: 1, source: 'lrclib', created: Date.now(),
    };
    upsertSong(song);
    queueCover(song);
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
  editDirty = false;
  show('edit');
}
for (const id of ['#edit-title', '#edit-artist', '#edit-duration', '#edit-lyrics']) $(id).addEventListener('input', () => (editDirty = true));
$('#edit-back').onclick = () => {
  if (editDirty && !confirm('Discard your changes?')) return;
  editDirty = false;
  history.length > 1 ? history.back() : (location.hash = '#/');
};
$('#edit-save').onclick = () => {
  const lyrics = $('#edit-lyrics').value.replace(/\s+$/, '');
  if (!lyrics.trim()) { toast('Add some lyrics first'); return; }
  const before = getSong(editing.id);
  editing.title = $('#edit-title').value.trim() || lyrics.trim().split('\n')[0].replace(/\[[^\]]*\]/g, '').trim().slice(0, 40) || 'Untitled';
  editing.artist = $('#edit-artist').value.trim();
  editing.duration = parseDuration($('#edit-duration').value);
  editing.lyrics = lyrics;
  if (!before || before.title !== editing.title || before.artist !== editing.artist) delete editing.art; // look the cover up again
  upsertSong(editing);
  queueCover(editing);
  editDirty = false;
  toast('Saved');
  location.replace('#/play/' + editing.id);
};

/* ---------------- settings ---------------- */
function openSettings() {
  $('#set-font').value = settings.fontSize;
  $('#set-font-out').textContent = settings.fontSize;
  $('#set-resume').value = String(settings.resumeDelay);
  $('#set-countin').value = String(settings.countIn);
  $('#set-chords').checked = settings.showChords;
  $('#set-wake').checked = settings.keepAwake;
  $('#set-motion').checked = settings.motion;
  $('#set-covers').checked = settings.covers;
  $('#app-version').textContent = 'Version ' + APP_VERSION + ' · ' + songs.length + ' songs · ' + folders.length + ' folders';
  show('settings');
}
$('#set-font').addEventListener('input', (e) => { settings.fontSize = +e.target.value; $('#set-font-out').textContent = settings.fontSize; saveSettings(); });
$('#set-resume').addEventListener('change', (e) => { settings.resumeDelay = +e.target.value; saveSettings(); });
$('#set-countin').addEventListener('change', (e) => { settings.countIn = +e.target.value; saveSettings(); });
$('#set-chords').addEventListener('change', (e) => { settings.showChords = e.target.checked; saveSettings(); });
$('#set-wake').addEventListener('change', (e) => { settings.keepAwake = e.target.checked; saveSettings(); });
$('#set-motion').addEventListener('change', (e) => { settings.motion = e.target.checked; saveSettings(); });
$('#set-covers').addEventListener('change', (e) => { settings.covers = e.target.checked; saveSettings(); });

$('#backup-export').onclick = () => {
  const data = JSON.stringify({ app: 'lyrica', version: 2, exported: new Date().toISOString(), settings, meta, folders, songs }, null, 1);
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
    for (const f of data.folders || []) {
      if (!f || !f.id || !Array.isArray(f.songIds)) continue;
      const i = folders.findIndex((x) => x.id === f.id);
      if (i >= 0) folders[i] = f; else folders.push(f);
    }
    if (data.meta && data.meta.activeDay > meta.activeDay) { meta.activeDay = data.meta.activeDay; store.set('lyrica.meta', meta); }
    saveSongs();
    saveFolders();
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
function lineNode(l, i) {
  const d = el('div', 'line ' + l.kind);
  d.dataset.i = i;
  if (l.kind === 'pause') { d.append(el('b'), el('b'), el('b')); return d; }
  if (l.kind === 'gap') { d.innerHTML = '&nbsp;'; return d; }
  if (!l.hasChords) { d.classList.add('wrap'); d.appendChild(el('span', 'w', l.src)); return d; }
  for (const s of l.segs) {
    const words = (s.text || '').match(/\S*\s*/g).filter(Boolean);
    if (!words.length) words.push(' ');
    words.forEach((w, k) => {
      const seg = el('span', 'seg');
      seg.append(el('span', 'ch', k === 0 ? s.chord || '' : ''), el('span', 'w', w));
      d.appendChild(seg);
    });
  }
  return d;
}

/* ---------------- player ---------------- */
const ANCHOR = 0.38; // where the current line sits, as a share of the lyric area height

const player = {
  song: null,
  folderId: null,
  tl: null,
  t: 0,
  maxT: 0,
  playing: false,
  lastFrame: 0,
  manualUntil: 0,
  touching: false,
  cur: -1,
  countdownEnd: 0,
  timing: null, // tap-to-time state
  raf: 0,

  open(song, folderId) {
    this.song = song;
    this.folderId = folderId;
    this.t = 0;
    this.maxT = 0;
    this.playing = false;
    this.manualUntil = 0;
    this.cur = -1;
    this.countdownEnd = 0;
    this.stopTiming(true);
    $('#p-title').textContent = song.title;
    $('#p-artist').textContent = song.artist || '';
    $('#p-more-panel').hidden = true;
    $('#p-next').hidden = !this.nextSong();
    show('player');
    const parsed = parseLyrics(song.lyrics);
    this.synced = parsed.synced;
    this.useTimeline(buildTimeline(parsed, song));
    wake.on();
    this.updateUi();
    this.lastFrame = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((ts) => this.frame(ts));
    song.lastPlayed = Date.now();
    saveSongs();
  },
  leave() {
    if (!this.song) return;
    this.creditPractice();
    this.pause();
    this.stopTiming(true);
    cancelAnimationFrame(this.raf);
    wake.off();
    this.song = null;
  },
  creditPractice() {
    if (this.song && this.tl && this.maxT >= this.tl.end * 0.8) { markPracticed(this.song); this.maxT = 0; }
  },
  nextSong() {
    const f = this.folderId && getFolder(this.folderId);
    if (!f || !this.song) return null;
    const i = f.songIds.indexOf(this.song.id);
    return i >= 0 ? getSong(f.songIds[i + 1]) || null : null;
  },
  goNext() {
    const n = this.nextSong();
    if (n) location.hash = '#/play/' + n.id + '/' + this.folderId;
  },
  back() { location.hash = this.folderId ? '#/folder/' + this.folderId : '#/'; },

  useTimeline(tl) {
    this.tl = tl;
    const box = $('#p-lyrics');
    box.innerHTML = '';
    box.classList.toggle('no-chords', !settings.showChords);
    this.nodes = tl.lines.map((l, i) => box.appendChild(lineNode(l, i)));
    this.cur = -2;
    $('#p-mode').textContent = this.timing ? 'Timing' : this.synced ? 'Synced' : 'Auto pace';
    $('#p-mode').className = 'badge' + (this.synced && !this.timing ? ' synced' : '');
    $('#p-chords-toggle').hidden = !tl.lines.some((l) => l.hasChords);
    this.layout();
    box.scrollTop = 0;
  },
  /* Padding so the first line starts at the anchor and you cannot scroll into empty space above it. */
  layout() {
    const box = $('#p-lyrics');
    if (!this.nodes || !this.nodes.length || box.clientHeight === 0) return;
    const h = box.clientHeight;
    const first = this.nodes[0].offsetHeight;
    box.style.paddingTop = Math.max(0, h * ANCHOR - first / 2) + 'px';
    box.style.paddingBottom = h * (1 - ANCHOR) + 'px';
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
    if (this.t >= this.tl.end - 0.1) { this.t = 0; this.maxT = 0; }
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
    this.maxT = 0;
    this.manualUntil = 0;
    this.cur = -2;
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
    const btn = $('#p-play');
    btn.innerHTML = '';
    btn.appendChild(svgIcon(this.playing ? 'pause' : 'play'));
    btn.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    $('#view-player').classList.toggle('is-playing', this.playing);
    if (this.song) $('#p-speed').textContent = Math.round((this.song.speed || 1) * 100) + '%';
  },
  finished() {
    this.pause();
    this.maxT = this.tl.end;
    this.creditPractice();
    this.endSheet();
  },
  endSheet() {
    const song = this.song;
    const c = comfortOf(song);
    const body = el('div', 'stack');
    body.appendChild(el('div', 'muted', 'How well do you know it now? This helps Lyrica suggest what to revisit.'));
    body.appendChild(levelPicker(c ? c.level : null, (i) => { rateSong(song, i); closeModal(); toast('Marked as ' + LEVELS[i].label.toLowerCase()); }));
    const next = this.nextSong();
    const actions = [{ label: 'Play again', run: () => this.restart() }];
    if (next) actions.push({ label: 'Next: ' + next.title, primary: true, run: () => this.goNext() });
    openModal('Nice one', body, actions);
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
      this.maxT = Math.max(this.maxT, this.t);
      if (!this.timing && this.t >= this.tl.end) { this.t = this.tl.end; this.finished(); }
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
    $('#p-progress').style.width = (this.tl.end ? clamp(this.t / this.tl.end, 0, 1) * 100 : 0) + '%';
    $('#p-time').textContent = fmtTime(this.t) + ' / ' + fmtTime(this.tl.end);

    // auto-scroll (unless the user is scrolling by hand)
    const box = $('#p-lyrics');
    const manual = this.touching || now < this.manualUntil;
    $('#p-manual').hidden = !(manual && this.playing);
    if (manual || !this.nodes.length) return;
    const center = (idx) => { const n = this.nodes[idx]; return n.offsetTop + n.offsetHeight / 2; };
    let target;
    if (curLine < 0) target = order.length ? center(order[0]) : center(0);
    else {
      const nextLine = pos + 1 < order.length ? order[pos + 1] : curLine;
      // ease the scroll so it moves mostly in the second half of each line
      const e = frac < 0.35 ? 0 : (frac - 0.35) / 0.65;
      const eased = e * e * (3 - 2 * e);
      target = center(curLine) + (center(nextLine) - center(curLine)) * eased;
    }
    target -= box.clientHeight * ANCHOR;
    const diff = target - box.scrollTop;
    if (Math.abs(diff) > 0.5) box.scrollTop += diff * Math.min(1, dt * 6);
  },

  /* ----- tap to time: build synced lyrics by tapping along ----- */
  startTiming() {
    const parsed = parseLyrics(this.song.lyrics);
    // time against the plain layout so every lyric line is stamped once, in order
    const plain = { synced: false, lines: parsed.lines.filter((l) => l.kind !== 'pause').map((l) => Object.assign({}, l, { time: null })) };
    this.timing = { next: 0, stamps: [] };
    this.pause();
    this.t = 0;
    this.useTimeline(buildTimeline(plain, this.song));
    $('#p-timing').hidden = false;
    $('#p-more-panel').hidden = true;
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
    const timeOf = new Map(this.tl.order.map((li, k) => [li, stamps[k]]));
    const out = this.tl.lines.map((l, i) => (timeOf.has(i) ? lrcStamp(timeOf.get(i)) + ' ' + l.src : l.kind === 'note' ? l.src : ''));
    const lrc = out.join('\n');
    openModal('Timing finished', 'Save these timings? The song will then scroll exactly in time with how you just tapped it. You can redo it any time.', [
      { label: 'Discard', run: () => this.stopTiming() },
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
      const parsed = parseLyrics(this.song.lyrics);
      this.synced = parsed.synced;
      this.useTimeline(buildTimeline(parsed, this.song));
      this.updateUi();
    }
  },
};

/* player controls */
$('#p-back').onclick = () => player.back();
$('#p-play').onclick = () => player.toggle();
$('#p-restart').onclick = () => player.restart();
$('#p-slower').onclick = () => { player.setSpeed((player.song.speed || 1) - 0.05); toast('Speed ' + Math.round(player.song.speed * 100) + '%'); };
$('#p-faster').onclick = () => { player.setSpeed((player.song.speed || 1) + 0.05); toast('Speed ' + Math.round(player.song.speed * 100) + '%'); };
$('#p-speed-reset').onclick = () => player.setSpeed(1);
$('#p-more').onclick = () => { $('#p-more-panel').hidden = !$('#p-more-panel').hidden; requestAnimationFrame(() => player.layout()); };
const changeFont = (d) => { settings.fontSize = clamp(settings.fontSize + d, 18, 56); saveSettings(); requestAnimationFrame(() => player.layout()); };
$('#p-font-down').onclick = () => changeFont(-2);
$('#p-font-up').onclick = () => changeFont(2);
$('#p-chords-toggle').onclick = () => { settings.showChords = !settings.showChords; saveSettings(); $('#p-lyrics').classList.toggle('no-chords', !settings.showChords); player.layout(); };
$('#p-edit').onclick = () => { if (player.song) location.hash = '#/edit/' + player.song.id; };
$('#p-tap-time').onclick = () => player.startTiming();
$('#p-next').onclick = () => player.goNext();
$('#t-next').onclick = () => player.timingTap();
$('#t-cancel').onclick = () => player.stopTiming();
window.addEventListener('resize', () => player.song && player.layout());

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
  if ($('#view-player').hidden || /INPUT|TEXTAREA|SELECT/.test(e.target.tagName) || !$('#modal').hidden) return;
  if (e.code === 'Space') { e.preventDefault(); player.timing ? player.timingTap() : player.toggle(); }
});

/* ---------------- boot ---------------- */
applySettings();
route();
window.__lyricaBoot = true;
try { sessionStorage.removeItem('lyrica.recovered'); } catch {}
if (document.fonts) document.fonts.ready.then(() => player.song && player.layout());
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
}
