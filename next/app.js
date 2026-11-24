/* Stanze (formerly Lyrica; storage keys keep the old name so saved songs carry over): a small offline-first lyrics teleprompter.
 * Everything is stored on the device (localStorage). Lyrics search uses the free LRCLIB API,
 * cover art is looked up with Apple's free iTunes Search API and shown straight from Apple's servers.
 */
'use strict';

const APP_VERSION = '1.8.1 test';
const LRCLIB = 'https://lrclib.net/api';
const ITUNES = 'https://itunes.apple.com/search';
const DEEZER = 'https://api.deezer.com';

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
  if (modalCleanup) { const fn = modalCleanup; modalCleanup = null; fn(); }
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
let modalCleanup = null; // run when the sheet closes (e.g. to stop a preview video)
function closeModal() {
  $('#modal').hidden = true;
  const fn = modalCleanup;
  modalCleanup = null;
  if (fn) fn();
}
$('#modal-close').onclick = closeModal;
$('#modal').addEventListener('click', (e) => { if (e.target.id === 'modal') closeModal(); });

/* Swipe a sheet down to close it. The drag starts from the handle and title, or from anywhere in the
 * sheet when its content is already scrolled to the top, so scrolling a long sheet still works.
 * Let go past a third of the way (or with a quick flick) and it slides away; otherwise it springs back. */
(function sheetSwipe() {
  const card = $('#modal .modal-card');
  const body = $('#modal-body');
  let drag = null;
  const skip = (t) => t.closest('input, textarea, select, [contenteditable], .no-swipe, input[type=range]');
  card.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1 || skip(e.target)) { drag = null; return; }
    const inBody = body.contains(e.target);
    const scroller = inBody ? e.target.closest('.modal-body, [data-scroll]') : null;
    if (inBody && scroller && scroller.scrollTop > 0) { drag = null; return; }
    drag = { y: e.touches[0].clientY, x: e.touches[0].clientX, t: performance.now(), dy: 0, live: false, inBody };
  }, { passive: true });
  card.addEventListener('touchmove', (e) => {
    if (!drag) return;
    const dy = e.touches[0].clientY - drag.y, dx = e.touches[0].clientX - drag.x;
    if (!drag.live) {
      if (Math.abs(dy) < 8 && Math.abs(dx) < 8) return;
      // only a mostly-downward pull becomes a swipe; anything else is left to scroll or tap
      if (dy <= 0 || Math.abs(dx) > dy || (drag.inBody && body.scrollTop > 0)) { drag = null; return; }
      drag.live = true;
      drag.y = e.touches[0].clientY;
      card.classList.add('swiping');
    }
    drag.dy = Math.max(0, e.touches[0].clientY - drag.y);
    card.style.transform = 'translateY(' + drag.dy + 'px)';
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  const end = () => {
    if (!drag || !drag.live) { drag = null; return; }
    const { dy, t } = drag;
    drag = null;
    const fast = dy > 40 && dy / Math.max(1, performance.now() - t) > 0.6;
    card.classList.remove('swiping');
    if (dy > card.offsetHeight / 3 || fast) {
      card.classList.add('swiped');
      card.style.transform = 'translateY(100%)';
      setTimeout(() => { closeModal(); card.classList.remove('swiped'); card.style.transform = ''; }, 220);
    } else {
      card.style.transform = '';
    }
  };
  card.addEventListener('touchend', end);
  card.addEventListener('touchcancel', end);
})();

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

const DEFAULT_SETTINGS = {
  fontSize: 28, resumeDelay: 3, countIn: '1bar', clickSound: true, autoBpm: true, metroOn: false,
  showChords: true, keepAwake: true, motion: true, covers: true, libView: 'songs', libSort: 'recent', pauseGaps: false,
};
let settings = Object.assign({}, DEFAULT_SETTINGS, store.get('lyrica.settings', {}));
if (!settings.v120) { // one-off upgrade: move the old 3 second default to an on-beat count-in
  if (settings.countIn === 3) settings.countIn = '1bar';
  settings.countIn = String(settings.countIn);
  settings.v120 = true;
  store.set('lyrica.settings', settings);
}
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
/* BPM_CHECK bumps when the online lookup improves, so songs that found nothing before get one more try. */
const BPM_CHECK = 2;
function needsBpm(song) {
  if (!settings.autoBpm || !(song.title || '').trim()) return false;
  if (song.bpm === undefined) return true;
  return song.bpm === null && (song.bpmCheck || 0) < BPM_CHECK;
}
function queueEnrich(song) { if (needsCover(song) || needsBpm(song)) queueCover(song); }
function queueCover(song) {
  if ((!needsCover(song) && !needsBpm(song)) || coverQueue.includes(song.id)) return;
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
  if (song && needsBpm(song)) {
    try {
      const bpm = await lookupBpm(song.title, song.artist);
      song.bpm = bpm || null;
      song.bpmCheck = BPM_CHECK;
      if (bpm) song.bpmSource = 'deezer'; // a suggestion until the user checks it
      upsertSong(song);
      if (player.song && player.song.id === song.id) player.tempoChanged();
    } catch { /* try again next launch */ }
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
/* Song tempo from Deezer's free API. It has no CORS support, so it is read with JSONP.
 * A plain "artist title" search finds far more than Deezer's strict artist:/track: syntax.
 * We prefer the original studio recording over live, acoustic, remastered or medley versions,
 * and try a few candidates because Deezer returns 0 when it doesn't know a track's tempo. */
const ALT_VERSION = /\b(live|acoustic|remaster(ed)?|demo|medley|version|edit|mix|remix|karaoke|instrumental|cover|tribute|session|unplugged|rehearsal|orchestral|piano|sped|slowed)\b/i;
function bpmNorm(x) { return String(x || '').toLowerCase().replace(/\(.*?\)|\[.*?\]|\s-\s.*$|feat\..*|ft\..*|[^a-z0-9]/g, ''); }
function rankBpmHits(hits, title, artist) {
  const t = bpmNorm(title);
  const a = bpmNorm(artist);
  const scored = [];
  hits.forEach((r, i) => {
    const rt = bpmNorm(r.title_short || r.title);
    if (!t || !rt || !(rt === t || rt.includes(t) || t.includes(rt))) return;
    let score = i; // Deezer's own order, mostly popularity
    if (rt !== t) score += 6;
    const ra = bpmNorm(r.artist && r.artist.name);
    if (a && !(ra === a || ra.includes(a) || a.includes(ra))) score += 20;
    const extra = [r.title, r.title_version, r.album && r.album.title].filter(Boolean).join(' ');
    if (ALT_VERSION.test(extra)) score += 12;
    scored.push({ r, score });
  });
  return scored.sort((x, y) => x.score - y.score).map((x) => x.r);
}
async function lookupBpm(title, artist) {
  const q = [artist, title].filter(Boolean).join(' ');
  const found = await jsonp(DEEZER + '/search?' + new URLSearchParams({ q, limit: '15', output: 'jsonp' }));
  const ranked = rankBpmHits((found && found.data) || [], title, artist).slice(0, 3);
  for (const hit of ranked) {
    const track = await jsonp(DEEZER + '/track/' + hit.id + '?output=jsonp');
    const bpm = track && Math.round(track.bpm || 0);
    if (bpm >= 30 && bpm <= 300) return bpm;
  }
  return null;
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
const SECTION_WORDS = '(?:verse|chorus|pre-?chorus|bridge|intro|outro|hook|solo|instrumental|interlude|refrain|tag|coda|break|post-?chorus)';
// "[Chorus]", "(Verse 2)", or a bare "Chorus" / "Verse 2:" / "Chorus x2" on its own line. Not "Break my heart".
const SECTION_RE = new RegExp('^\\s*(?:[\\[(]\\s*' + SECTION_WORDS + '\\b[^\\])]*[\\])]|' + SECTION_WORDS + '(?:\\s*\\d+)?(?:\\s*[x×]\\s*\\d+)?\\s*:?)\\s*$', 'i');
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

/* Instrumental gaps: stretches with nothing to sing. Only synced lyrics know where they are.
 * A gap starts at a blank timed line, or roughly when a line has had time to be sung. */
function findGaps(tl, song, synced) {
  if (!synced) return [];
  const lines = tl.lines;
  const lyrics = tl.order.filter((i) => lines[i].kind === 'lyric');
  const barSec = song.bpm ? (60 / song.bpm) * (song.beatsPerBar || 4) : 0;
  const minLen = Math.max(7, barSec * 3);
  const gaps = [];
  if (lyrics.length && lines[lyrics[0]].time >= 4) gaps.push({ start: 0, end: lines[lyrics[0]].time, intro: true, next: lyrics[0] });
  for (let k = 0; k < lyrics.length - 1; k++) {
    const a = lines[lyrics[k]];
    const b = lines[lyrics[k + 1]];
    let start = null;
    for (let i = lyrics[k] + 1; i < lyrics[k + 1]; i++) if (lines[i].kind === 'pause' && lines[i].time != null) { start = lines[i].time; break; }
    if (start == null) {
      const words = (a.src || '').replace(/\[[^\]]*\]/g, ' ').trim().split(/\s+/).filter(Boolean).length;
      start = a.time + clamp(words * 0.42 + 0.8, 1.5, 7);
    }
    if (b.time - start >= minLen) gaps.push({ start, end: b.time, intro: false, next: lyrics[k + 1] });
  }
  return gaps;
}

/* ---------------- router ---------------- */
const views = ['library', 'folder', 'search', 'practice', 'edit', 'settings', 'player'];
const TAB_OF = { library: 'library', folder: 'library', search: 'search', practice: 'practice', settings: 'settings' };
function show(name) {
  for (const v of views) $('#view-' + v).hidden = v !== name;
  document.documentElement.classList.toggle('in-player', name === 'player');
  $('#tabbar').classList.toggle('hide', !TAB_OF[name]);
  document.querySelectorAll('.tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === TAB_OF[name]));
  $('#alpha-rail').hidden = true;
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
  if (name === 'search') show('search');
  else if (name === 'practice') openPractice();
  else if (name === 'edit') openEditor(id);
  else if (name === 'settings') openSettings();
  else if (name === 'play' && getSong(id)) player.open(getSong(id), extra && getFolder(extra) ? extra : null);
  else if (name === 'folder' && getFolder(id)) openFolder(id);
  else openLibrary();
}
window.addEventListener('hashchange', route);

/* ---------------- shared song tiles ---------------- */
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
  const sub = el('div', 'a', opts.hideArtist ? (song.duration ? fmtTime(song.duration) : '') : songSubtitle(song));
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
    more.onclick = (e) => { e.stopPropagation(); openSongSheet(song, opts.folderId); };
    li.appendChild(more);
    li.onclick = () => (location.hash = '#/play/' + song.id + (opts.folderId ? '/' + opts.folderId : ''));
  }
  queueEnrich(song);
  return li;
}

/* ---------------- the cord through lists ----------------
 * Songs hang on a loose, wavy cord with a bead for each one. In a folder the beads are numbered
 * and the first is coral (up next). Rows string themselves on one after another. */
function threadList(ul, numbered) {
  ul.classList.add('threaded');
  ul.classList.toggle('numbered', !!numbered);
  const rows = [...ul.children].filter((li) => li.tagName === 'LI' && !li.classList.contains('letter-head'));
  rows.forEach((li, i) => {
    li.style.setProperty('--i', Math.min(i, 14));
    const bead = el('span', 'bead' + (i === 0 ? ' first' : ''), numbered ? String(i + 1) : '');
    bead.setAttribute('aria-hidden', 'true');
    li.prepend(bead);
  });
  requestAnimationFrame(() => drawThread(ul));
}
/* The cord is drawn as a smooth line through the beads, swaying gently between them.
 * A list being reordered adds a live displacement (ul._cordU) on top, from the string simulation below. */
function cordGeom(ul) {
  const beads = [...ul.querySelectorAll(':scope > li > .bead')];
  if (!beads.length || !ul.offsetParent) return null;
  const ur = ul.getBoundingClientRect();
  const pins = beads.map((bd) => { const r = bd.getBoundingClientRect(); return [r.left - ur.left + r.width / 2, r.top - ur.top + r.height / 2]; });
  // the cord's ends come from the resting layout, so they stay put while a row is being dragged
  const rest = beads.map((bd) => bd.parentElement.offsetTop + bd.parentElement.offsetHeight / 2);
  const ys = pins.map((p) => p[1]);
  return { x: pins[0][0], ys, sorted: ys.slice().sort((p, q) => p - q), y0: Math.max(0, Math.min(...rest) - 26), y1: Math.max(...rest) + 60, h: ul.scrollHeight };
}
const CORD_STEP = 8;
function cordRest(g, y) {
  // between each pair of beads the cord bows out a little, alternating sides
  const ys = [g.y0].concat(g.sorted, [g.y1]);
  for (let j = 0; j < ys.length - 1; j++) {
    if (y <= ys[j + 1] || j === ys.length - 2) {
      const t = clamp((y - ys[j]) / Math.max(1, ys[j + 1] - ys[j]), 0, 1);
      return (j % 2 ? 1 : -1) * 8 * Math.sin(Math.PI * t);
    }
  }
  return 0;
}
function drawThread(ul) {
  const g = cordGeom(ul);
  let svg = ul.querySelector(':scope > svg.thread');
  if (!g) { if (svg) svg.remove(); return; }
  const ns = 'http://www.w3.org/2000/svg';
  if (!svg) {
    svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('class', 'thread');
    svg.setAttribute('aria-hidden', 'true');
    svg.appendChild(document.createElementNS(ns, 'path')).setAttribute('pathLength', '1');
    ul.prepend(svg);
  }
  svg.setAttribute('width', g.x * 2 + 60);
  svg.setAttribute('height', g.h + 80);
  const y0 = g.y0, y1 = g.y1;
  const u = ul._cordU;
  let d = '';
  for (let y = y0, i = 0; y <= y1 + 0.01; y += CORD_STEP, i++) {
    const x = g.x + cordRest(g, y) + (u && u.x[i] ? u.x[i] : 0);
    d += (i ? ' L' : 'M') + x.toFixed(1) + ' ' + y.toFixed(1);
  }
  svg.firstChild.setAttribute('d', d);
  return { g, y0, n: Math.floor((y1 - y0) / CORD_STEP) + 1 };
}

/* ----- Reorder a folder by dragging a bead along the cord -----
 * The cord is a little string simulation: each sample can move sideways, pulled back by its neighbours
 * (tension) and by the beads it passes through. Dragging a bead shakes it gently; dropping it gives
 * one small snap that settles. Displacement is capped, so the cord bends but never folds or crosses. */
function cordSim(ul) {
  if (ul._sim) return ul._sim;
  const sim = { ul, x: [], v: [], pinHeld: null, raf: 0, last: 0, quietFor: 0 };
  ul._cordU = sim;
  const MAXU = 22;
  const step = (dt) => {
    const info = drawThread(ul);
    if (!info) return false;
    const n = info.n;
    while (sim.x.length < n) { sim.x.push(0); sim.v.push(0); }
    sim.x.length = sim.v.length = n;
    const pinIdx = info.g.ys.map((y) => Math.round((y - info.y0) / CORD_STEP));
    const K = 900, DAMP = 5, HOME = 6, PIN = 260;
    const subs = 4, h = dt / subs;
    for (let s = 0; s < subs; s++) {
      for (let i = 0; i < n; i++) {
        const l = i > 0 ? sim.x[i - 1] : 0, r = i < n - 1 ? sim.x[i + 1] : 0;
        let a = K * (l + r - 2 * sim.x[i]) / 4 - DAMP * sim.v[i] - HOME * sim.x[i];
        sim.v[i] += a * h;
      }
      pinIdx.forEach((pi, k) => {
        if (pi < 0 || pi >= n) return;
        if (sim.pinHeld && sim.pinHeld.k === k) {
          // the bead in your hand leads the cord a little sideways, plus a sway from how fast you move
          const want = clamp(sim.pinHeld.dx, -MAXU, MAXU);
          sim.v[pi] += (want - sim.x[pi]) * PIN * 2 * h;
          sim.v[pi] *= 0.8;
        } else {
          sim.v[pi] += -sim.x[pi] * PIN * h;
        }
      });
      for (let i = 0; i < n; i++) { sim.x[i] = clamp(sim.x[i] + sim.v[i] * h, -MAXU, MAXU); }
    }
    return true;
  };
  const loop = (now) => {
    const dt = Math.min(0.033, (now - (sim.last || now)) / 1000) || 0.016;
    sim.last = now;
    if (!ul.isConnected || !step(dt)) { sim.stop(); return; }
    const energy = sim.x.reduce((m, v) => Math.max(m, Math.abs(v)), 0) + sim.v.reduce((m, v) => Math.max(m, Math.abs(v)), 0) / 20;
    sim.quietFor = energy < 0.15 && !sim.pinHeld ? sim.quietFor + dt : 0;
    if (sim.quietFor > 0.25) { sim.stop(); drawThread(ul); return; }
    sim.raf = requestAnimationFrame(loop);
  };
  sim.kick = () => { if (!sim.raf) { sim.last = 0; sim.raf = requestAnimationFrame(loop); } };
  sim.stop = () => { cancelAnimationFrame(sim.raf); sim.raf = 0; sim.x = []; sim.v = []; ul._sim = null; ul._cordU = null; };
  sim.pluck = (k, amount) => {
    const g = cordGeom(ul);
    if (!g) return;
    const i = Math.round((g.ys[k] - g.y0) / CORD_STEP);
    [-2, -1, 1, 2].forEach((o, j) => { if (sim.v[i + o] != null) sim.v[i + o] += amount * (j % 2 ? 1 : -1); });
  };
  ul._sim = sim;
  sim.kick();
  return sim;
}

function enableCordReorder(ul, folder) {
  const rows = () => [...ul.querySelectorAll(':scope > li')];
  const beadOf = (li) => li.querySelector('.bead');
  // paints the numbers and the "up next" highlight for an order; while dragging this is the order
  // the list will have if you let go now, so the highlight follows the songs instead of jumping at the end
  const paint = (order) => order.forEach((li, i) => {
    const b = beadOf(li);
    b.textContent = String(i + 1);
    b.classList.toggle('first', i === 0);
    li.classList.toggle('up-next', i === 0);
  });
  const renumber = () => {
    const all = rows();
    paint(all);
    all.forEach((li, i) => beadOf(li).setAttribute('aria-label', 'Move ' + (li.dataset.title || 'song') + ', number ' + (i + 1) + ' of ' + all.length + '. Drag, or use the up and down arrow keys.'));
  };
  const orderIf = (all, from, to) => { const o = all.slice(); o.splice(to, 0, o.splice(from, 1)[0]); return o; };
  const commit = () => {
    folder.songIds = rows().map((li) => li.dataset.id);
    saveFolders();
    renumber();
  };
  const settle = (li, k) => {
    const b = beadOf(li);
    b.classList.remove('snap');
    void b.offsetWidth;
    b.classList.add('snap');
    const sim = cordSim(ul);
    sim.pluck(k, 110);
    sim.kick();
    if (navigator.vibrate) { try { navigator.vibrate(14); } catch { /* fine */ } }
  };
  rows().forEach((li) => {
    const bead = beadOf(li);
    bead.setAttribute('role', 'button');
    bead.setAttribute('tabindex', '0');
    bead.addEventListener('click', (e) => e.stopPropagation());
    bead.addEventListener('keydown', (e) => {
      const d = e.key === 'ArrowUp' ? -1 : e.key === 'ArrowDown' ? 1 : 0;
      if (!d) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); li.click(); } return; }
      e.preventDefault();
      const all = rows();
      const i = all.indexOf(li), j = i + d;
      if (j < 0 || j >= all.length) return;
      if (d < 0) ul.insertBefore(li, all[j]); else ul.insertBefore(all[j], li);
      commit();
      bead.focus();
      settle(li, j);
    });
    bead.addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      e.preventDefault();
      e.stopPropagation();
      const all = rows();
      const from = all.indexOf(li);
      const tops = all.map((r) => r.offsetTop);
      const hts = all.map((r) => r.offsetHeight);
      const gap = all.length > 1 ? tops[1] - tops[0] - hts[0] : 8;
      const startY = e.clientY + window.scrollY, startX = e.clientX;
      let moved = false, to = from, lastY = e.clientY, vy = 0, raf = 0, curY = e.clientY, curX = e.clientX;
      try { bead.setPointerCapture(e.pointerId); } catch { /* fine */ }
      const sim = cordSim(ul);
      const frame = () => {
        // keep the list scrolling when you hold a bead near the top or bottom of the screen
        const edge = 70, vh = window.innerHeight;
        if (curY > vh - edge - 90) window.scrollBy(0, 6); else if (curY < edge + 60) window.scrollBy(0, -6);
        const dy = curY + window.scrollY - startY;
        const lo = -tops[from], hi = tops[all.length - 1] + hts[all.length - 1] - tops[from] - hts[from];
        const y = clamp(dy, lo, hi);
        li.style.transform = 'translateY(' + y + 'px) scale(1.02)';
        const mid = tops[from] + y + hts[from] / 2;
        // the slot you're over: past the middle of a row below, or above the middle of a row above
        let t = from;
        // (a third of the way into a row is enough, so the first and last slots can be reached
        // even though the row can't be dragged past the ends of the list)
        for (let k = from + 1; k < all.length; k++) if (mid > tops[k] + hts[k] * 0.35) t = k;
        for (let k = from - 1; k >= 0; k--) if (mid < tops[k] + hts[k] * 0.65) t = k;
        if (t !== to) { to = t; paint(orderIf(all, from, to)); if (navigator.vibrate) { try { navigator.vibrate(6); } catch { /* fine */ } } }
        all.forEach((r, k) => {
          if (k === from) return;
          const shift = from < to && k > from && k <= to ? -(hts[from] + gap) : from > to && k < from && k >= to ? hts[from] + gap : 0;
          r.style.transform = shift ? 'translateY(' + shift + 'px)' : '';
        });
        sim.pinHeld = { k: from, dx: (curX - startX) * 0.35 + clamp(vy * 1.4, -18, 18) };
        vy *= 0.85;
        raf = requestAnimationFrame(frame);
      };
      const move = (ev) => {
        if (!moved && Math.abs(ev.clientY + window.scrollY - startY) < 5 && Math.abs(ev.clientX - startX) < 5) return;
        if (!moved) {
          moved = true;
          dismissReorderHint();
          ul.classList.add('reordering', 'settled');
          li.classList.add('lifted');
          all.forEach((r) => { if (r !== li) r.classList.add('making-room'); });
          raf = requestAnimationFrame(frame);
        }
        vy = vy * 0.6 + (ev.clientY - lastY) * 0.4;
        lastY = ev.clientY;
        curY = ev.clientY;
        curX = ev.clientX;
      };
      const up = () => {
        bead.removeEventListener('pointermove', move);
        bead.removeEventListener('pointerup', up);
        bead.removeEventListener('pointercancel', up);
        cancelAnimationFrame(raf);
        sim.pinHeld = null;
        if (!moved) { li.click(); return; } // a tap on the bead plays from that song
        paint(orderIf(all, from, to));
        // glide into the new slot, then put the rows in their new order without any jump
        const slot = to === from ? 0 : to > from ? tops[to] + hts[to] - tops[from] - hts[from] : tops[to] - tops[from];
        li.classList.remove('lifted');
        li.classList.add('dropping');
        li.style.transform = 'translateY(' + slot + 'px)';
        setTimeout(() => {
          all.forEach((r) => { r.classList.remove('making-room', 'dropping'); r.style.transition = 'none'; r.style.transform = ''; });
          if (to !== from) { if (to > from) all[to].after(li); else all[to].before(li); }
          ul.classList.remove('reordering');
          void ul.offsetHeight;
          all.forEach((r) => { r.style.transition = ''; });
          if (to !== from) commit();
          settle(li, to);
        }, 260);
      };
      bead.addEventListener('pointermove', move);
      bead.addEventListener('pointerup', up);
      bead.addEventListener('pointercancel', up);
    });
  });
  renumber();
}
window.addEventListener('resize', () => document.querySelectorAll('ul.threaded').forEach(drawThread));

/* ---------------- library: songs / artists / folders ---------------- */
const SORTS = {
  recent: { label: 'Recently played', short: 'Recent', fn: (a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0) || (b.created || 0) - (a.created || 0) },
  plays: { label: 'Most played', short: 'Most played', fn: (a, b) => (b.plays || 0) - (a.plays || 0) || (b.lastPlayed || 0) - (a.lastPlayed || 0) },
  comfort: { label: 'Needs the most practice', short: 'Comfort', fn: (a, b) => comfortSortKey(a) - comfortSortKey(b) || byTitle(a, b) },
  title: { label: 'Title, A to Z', short: 'A to Z', fn: (a, b) => byTitle(a, b), letters: (s) => s.title },
  artist: { label: 'Artist, A to Z', short: 'Artist', fn: (a, b) => byArtist(a, b) || byTitle(a, b), letters: (s) => s.artist },
  added: { label: 'Recently added', short: 'Added', fn: (a, b) => (b.created || 0) - (a.created || 0) },
};
const collator = new Intl.Collator(undefined, { sensitivity: 'base', numeric: true });
const sortName = (s) => String(s || '').trim().replace(/^the\s+/i, '');
const byTitle = (a, b) => collator.compare(sortName(a.title), sortName(b.title));
const byArtist = (a, b) => collator.compare(sortName(a.artist) || '￿', sortName(b.artist) || '￿');
function comfortSortKey(s) { const c = comfortOf(s); return c ? c.score + (c.slip >= SLIP_THRESHOLD ? -100 : 0) : 1000; }
function letterOf(str) {
  const ch = sortName(str).charAt(0).toUpperCase();
  return /[A-Z]/.test(ch) ? ch : '#';
}
const BIG_LIST = 20;

function openLibrary() {
  show('library');
  renderLibrary();
}

function renderLibrary() {
  const view = settings.libView;
  document.querySelectorAll('#lib-views button').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === view);
    b.setAttribute('aria-selected', b.dataset.view === view);
  });
  $('#lib-sort').hidden = view === 'folders';
  $('#lib-sort-label').textContent = SORTS[settings.libSort].short;
  $('#lib-filter').placeholder = view === 'folders' ? 'Filter folders' : view === 'artists' ? 'Filter artists or songs' : 'Filter songs';
  $('#lib-filter').parentElement.hidden = view !== 'folders' && songs.length === 0;
  const box = $('#lib-list');
  box.innerHTML = '';
  const q = $('#lib-filter').value.trim().toLowerCase();
  const match = (s) => !q || (s.title + ' ' + (s.artist || '')).toLowerCase().includes(q);
  const empty = $('#lib-empty');
  empty.hidden = true;
  let letters = null;

  if (view === 'folders') {
    const newBtn = el('button', 'btn');
    newBtn.type = 'button';
    newBtn.append(svgIcon('plus'), document.createTextNode('New folder'));
    newBtn.onclick = () => askText('New folder', 'Name, e.g. "Friday setlist" or "Acoustic"', '', (name) => {
      const f = createFolder(name);
      location.hash = '#/folder/' + f.id;
      // a new folder is empty, so go straight on to choosing its songs
      if (songs.length) setTimeout(() => openAddSongs(f), 260);
    });
    box.appendChild(newBtn);
    const ul = el('ul', 'list');
    for (const f of folders.filter((f) => !q || f.name.toLowerCase().includes(q))) {
      const list = f.songIds.map(getSong).filter(Boolean);
      const total = list.reduce((s, x) => s + (x.duration || 0), 0);
      const li = el('li', 'folder-tile');
      const cov = el('div', 'cover');
      const firstArt = list.find((x) => x.art);
      if (firstArt) paintCover(cov, firstArt); else cov.appendChild(svgIcon('folder'));
      const m = el('div', 'meta');
      m.append(el('div', 't', f.name), el('div', 'a', list.length + (list.length === 1 ? ' song' : ' songs') + (total ? ' · ' + fmtTotal(total) : '')));
      li.append(cov, m, svgIcon('chevron'));
      li.onclick = () => (location.hash = '#/folder/' + f.id);
      ul.appendChild(li);
    }
    box.appendChild(ul);
    [...ul.children].forEach((li, i) => li.style.setProperty('--i', Math.min(i, 14)));
    ul.classList.add('strung');
    if (!folders.length) { empty.hidden = false; empty.textContent = 'Folders keep setlists, genres or anything else together. A song can be in as many folders as you like.'; }
  } else if (view === 'artists') {
    const groups = new Map();
    for (const s of songs) {
      const key = (s.artist || '').trim() || 'Unknown artist';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(s);
    }
    let names = [...groups.keys()].sort((a, b) => (a === 'Unknown artist') - (b === 'Unknown artist') || collator.compare(sortName(a), sortName(b)));
    if (q) names = names.filter((n) => n.toLowerCase().includes(q) || groups.get(n).some(match));
    const big = names.length >= BIG_LIST;
    let lastLetter = null;
    letters = new Map();
    for (const name of names) {
      const list = groups.get(name).slice().sort(SORTS[settings.libSort].fn);
      const shownSongs = q && !name.toLowerCase().includes(q) ? list.filter(match) : list;
      const L = name === 'Unknown artist' ? '#' : letterOf(name);
      if (big && L !== lastLetter) { const hd = el('div', 'letter-head', L); box.appendChild(hd); letters.set(L, hd); lastLetter = L; }
      const g = el('div', 'group' + (q || openArtists.has(name) ? ' open' : ''));
      if (!letters.has(L)) letters.set(L, g);
      const head = el('div', 'group-head');
      const cov = el('div', 'cover round');
      const withArt = list.find((x) => x.art);
      if (withArt) paintCover(cov, withArt); else cov.appendChild(svgIcon('person'));
      const total = list.reduce((s, x) => s + (x.duration || 0), 0);
      const m = el('div', 'meta');
      m.append(el('div', 't', name), el('div', 'a', list.length + (list.length === 1 ? ' song' : ' songs') + (total ? ' · ' + fmtTotal(total) : '')));
      const chev = svgIcon('chevron');
      chev.classList.add('chev');
      head.append(cov, m, chev);
      const ul = el('ul', 'list');
      const fill = () => { ul.innerHTML = ''; shownSongs.forEach((s) => ul.appendChild(songTile(s, { hideArtist: true }))); };
      if (g.classList.contains('open')) fill();
      head.onclick = () => {
        const open = g.classList.toggle('open');
        if (open) { openArtists.add(name); fill(); } else { openArtists.delete(name); ul.innerHTML = ''; }
      };
      g.append(head, ul);
      box.appendChild(g);
    }
    if (!big) letters = null;
    if (!names.length) { empty.hidden = false; empty.textContent = songs.length ? 'No artists match that filter.' : 'No songs yet. Use Find to look one up, or the plus button to paste your own.'; }
  } else {
    const sort = SORTS[settings.libSort];
    const list = songs.filter(match).sort(sort.fn);
    const big = sort.letters && list.length >= BIG_LIST;
    const ul = el('ul', 'list');
    box.appendChild(ul);
    if (big) letters = new Map();
    let lastLetter = null;
    for (const s of list) {
      if (big) {
        const L = letterOf(sort.letters(s));
        if (L !== lastLetter) { const hd = el('li', 'letter-head', L); ul.appendChild(hd); letters.set(L, hd); lastLetter = L; }
      }
      ul.appendChild(songTile(s));
    }
    threadList(ul, false);
    if (!list.length) { empty.hidden = false; empty.textContent = songs.length ? 'No songs match that filter.' : 'No songs yet. Use Find to look one up, or the plus button to paste your own.'; }
  }
  renderAlphaRail(letters);
}
const openArtists = new Set();

/* A to Z jump bar for big lists: tap or slide a finger down it */
function renderAlphaRail(letters) {
  const rail = $('#alpha-rail');
  rail.innerHTML = '';
  rail.hidden = !letters || letters.size < 4;
  $('#view-library').classList.toggle('has-rail', !rail.hidden);
  if (rail.hidden) return;
  const all = ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'];
  for (const L of all) {
    const sp = el('span', letters.has(L) ? '' : 'off', L);
    sp.dataset.l = L;
    rail.appendChild(sp);
  }
  const jump = (y) => {
    const spans = [...rail.children];
    const hit = spans.find((sp) => { const r = sp.getBoundingClientRect(); return y >= r.top && y <= r.bottom; });
    if (!hit) return;
    // nearest available letter at or after the touched one
    const i = all.indexOf(hit.dataset.l);
    const L = all.slice(i).find((x) => letters.has(x)) || [...letters.keys()].pop();
    const target = letters.get(L);
    if (target) target.scrollIntoView({ block: 'start' });
  };
  rail.onpointerdown = (e) => { rail.setPointerCapture(e.pointerId); jump(e.clientY); };
  rail.onpointermove = (e) => { if (e.buttons || e.pointerType === 'touch') jump(e.clientY); };
}

$('#lib-filter').addEventListener('input', renderLibrary);
document.querySelectorAll('#lib-views button').forEach((b) => (b.onclick = () => { settings.libView = b.dataset.view; saveSettings(); renderLibrary(); }));
$('#lib-sort').onclick = () => {
  const body = el('div', 'levels');
  for (const [key, s] of Object.entries(SORTS)) {
    const b = el('button', 'level' + (settings.libSort === key ? ' active' : ''));
    b.type = 'button';
    b.append(el('span', 'grow', s.label));
    if (settings.libSort === key) b.appendChild(svgIcon('check'));
    b.onclick = () => { settings.libSort = key; saveSettings(); closeModal(); renderLibrary(); };
    body.appendChild(b);
  }
  openModal('Sort songs by', body);
};

/* ---------------- folder detail ---------------- */
let currentFolder = null;
let reorderMode = false;
function openFolder(id) {
  if (id !== currentFolder) reorderMode = false;
  currentFolder = id;
  show('folder');
  renderFolder();
}
function renderFolder() {
  const f = getFolder(currentFolder);
  if (!f) return;
  const list = f.songIds.map(getSong).filter(Boolean);
  const total = list.reduce((s, x) => s + (x.duration || 0), 0);
  $('#folder-name').textContent = f.name;
  $('#folder-meta').textContent = list.length + (list.length === 1 ? ' song' : ' songs') + (total ? ' · ' + fmtTotal(total) : '');
  const ul = $('#folder-list');
  ul.innerHTML = '';
  list.forEach((s) => { const li = songTile(s, { folderId: f.id }); li.dataset.id = s.id; li.dataset.title = s.title || 'Untitled'; ul.appendChild(li); });
  threadList(ul, true);
  if (list.length > 1) enableCordReorder(ul, f);
  $('#folder-drag-note').hidden = list.length < 2;
  if (list.length > 1 && !settings.reorderHintSeen) setTimeout(() => showReorderHint(ul), 700);
  $('#folder-empty').hidden = list.length > 0;
}
/* The first time someone has a folder with two or more songs, show them the beads can be dragged:
 * the first row nudges down along the cord and back, with a short note beside it. After that a
 * small "Drag the numbers to reorder" line under the folder's title keeps reminding them. */
function showReorderHint(ul) {
  if (settings.reorderHintSeen || $('#view-folder').hidden || document.querySelector('.drag-hint')) return;
  const li = ul.querySelector(':scope > li');
  if (!li) return;
  const tip = el('div', 'drag-hint');
  tip.setAttribute('role', 'status');
  tip.append(el('span', null, 'Hold a number and drag it up or down to change the order'));
  const ok = el('button', 'btn small', 'Got it');
  ok.type = 'button';
  ok.onclick = dismissReorderHint;
  tip.appendChild(ok);
  li.after(tip);
  tip.style.top = (li.offsetTop + li.offsetHeight + 6) + 'px';
  const nudge = () => {
    if (!tip.isConnected) return;
    li.classList.remove('hint-nudge');
    void li.offsetWidth;
    li.classList.add('hint-nudge');
    const sim = ul._sim || cordSim(ul);
    setTimeout(() => { sim.pluck(0, 60); sim.kick(); }, 380);
  };
  nudge();
  tip._timer = setInterval(nudge, 3200);
}
function dismissReorderHint() {
  const tip = document.querySelector('.drag-hint');
  if (tip) { clearInterval(tip._timer); tip.classList.add('going'); setTimeout(() => tip.remove(), 250); }
  document.querySelectorAll('li.hint-nudge').forEach((li) => li.classList.remove('hint-nudge'));
  if (!settings.reorderHintSeen) { settings.reorderHintSeen = true; saveSettings(); }
}
function moveInFolder(i, dir) {
  const f = getFolder(currentFolder);
  if (!f) return;
  const ids = f.songIds.filter((x) => getSong(x));
  const j = i + dir;
  if (j < 0 || j >= ids.length) return;
  [ids[i], ids[j]] = [ids[j], ids[i]];
  f.songIds = ids;
  saveFolders();
  renderFolder();
}
$('#folder-back').onclick = () => { settings.libView = 'folders'; saveSettings(); location.hash = '#/'; };
$('#folder-add').onclick = $('#folder-empty-add').onclick = () => { const f = getFolder(currentFolder); if (f) openAddSongs(f); };
$('#folder-menu').onclick = () => {
  const f = getFolder(currentFolder);
  if (!f) return;
  openModal(f.name, f.songIds.length + ' songs. Deleting a folder keeps the songs in your library.', [
    { label: 'Add songs', run: () => openAddSongs(f) },
    { label: 'Rename', run: () => askText('Rename folder', 'Name', f.name, (name) => { f.name = name; saveFolders(); renderFolder(); }) },
    { label: 'Delete folder', danger: true, run: () => {
      if (!confirm('Delete the folder "' + f.name + '"? Songs stay in your library.')) return;
      folders = folders.filter((x) => x.id !== f.id);
      saveFolders();
      location.hash = '#/';
    } },
  ]);
};

/* ---------------- practice ---------------- */
function openPractice() {
  show('practice');
  const list = revisitList();
  const ul = $('#revisit-list');
  ul.innerHTML = '';
  list.forEach((s) => ul.appendChild(songTile(s)));
  $('#revisit-empty').hidden = list.length > 0;
  $('#revisit-sub').textContent = list.length ? (list.length === 1 ? '1 song' : list.length + ' songs') : '';
  const counts = LEVELS.map(() => 0);
  let unrated = 0;
  for (const s of songs) { const c = comfortOf(s); if (c) counts[c.level]++; else unrated++; }
  const max = Math.max(1, ...counts, unrated);
  const box = $('#comfort-summary');
  box.innerHTML = '';
  const row = (label, n) => {
    const r = el('div', 'cs-row');
    const bar = el('div', 'bar');
    const i = el('i');
    i.style.width = (n / max) * 100 + '%';
    bar.appendChild(i);
    r.append(el('span', null, label), bar, el('span', 'n', String(n)));
    box.appendChild(r);
  };
  for (let k = LEVELS.length - 1; k >= 0; k--) row(LEVELS[k].label, counts[k]);
  row('Not rated', unrated);
}

/* Song options: comfort level, folders, edit, delete */
/* A song you've started learning (Learning or Getting there) that has gone longest without a play.
 * Anything played in the last day doesn't count as "a while". */
function pickBackUp(exceptId) {
  const dayAgo = Date.now() - 86400000;
  const cands = songs.filter((s) => {
    if (s.id === exceptId) return false;
    const c = comfortOf(s);
    return c && (c.level === 1 || c.level === 2) && (s.lastPlayed || 0) < dayAgo;
  });
  cands.sort((a, b) => (a.lastPlayed || 0) - (b.lastPlayed || 0));
  return cands[0] || null;
}
function playedAgo(s) {
  if (!s.lastPlayed) return 'not played yet';
  const d = Math.floor((Date.now() - s.lastPlayed) / 86400000);
  if (d < 2) return 'played yesterday';
  if (d < 14) return 'last played ' + d + ' days ago';
  const w = Math.floor(d / 7);
  return w < 9 ? 'last played ' + w + ' weeks ago' : 'last played over 2 months ago';
}

/* The comfort rating as one linear scale: five joined segments filled up to where the song stands.
 * Tap a segment to move it there, or leave it as it is. */
function comfortScale(song) {
  const wrap = el('div', 'end-rate');
  const q = el('div', 'er-q');
  q.append(el('span', null, 'How\'s it feeling now?'));
  const now = el('b', 'er-now');
  q.appendChild(now);
  const scale = el('div', 'er-scale');
  scale.setAttribute('role', 'radiogroup');
  scale.setAttribute('aria-label', 'Comfort with this song');
  const hint = el('div', 'er-hint');
  const c = comfortOf(song);
  const start = c ? c.level : -1;
  const paint = (level, changed) => {
    [...scale.children].forEach((b, i) => {
      b.classList.toggle('on', i <= level);
      b.classList.toggle('top', i === level);
      b.setAttribute('aria-checked', String(i === level));
    });
    now.textContent = level >= 0 ? LEVELS[level].label : 'Not rated';
    hint.textContent = changed ? (level === start ? 'Kept as ' + LEVELS[level].label.toLowerCase() + '.' : 'Updated. ' + LEVELS[level].hint + '.')
      : level >= 0 ? 'Tap to move it, or leave it as it is.' : 'Tap where it\'s at.';
  };
  LEVELS.forEach((lvl, i) => {
    const b = el('button', 'er-seg');
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.setAttribute('aria-label', lvl.label + ': ' + lvl.hint);
    b.onclick = () => { rateSong(song, i); paint(i, true); };
    scale.appendChild(b);
  });
  const ends = el('div', 'er-ends');
  ends.append(el('span', null, LEVELS[0].label), el('span', null, LEVELS[LEVELS.length - 1].label));
  wrap.append(q, scale, ends, hint);
  paint(start, false);
  return wrap;
}

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

/* A pick list: rows you tick on and off, each with a round check bead. */
function pickRow(title, sub, opts = {}) {
  const b = el('button', 'pick-row' + (opts.locked ? ' locked' : ''));
  b.type = 'button';
  b.setAttribute('role', 'checkbox');
  b.setAttribute('aria-checked', String(!!opts.checked));
  if (opts.locked) b.setAttribute('aria-disabled', 'true');
  if (opts.cover) b.appendChild(opts.cover);
  const t = el('span', 'pick-text');
  t.append(el('b', null, title));
  if (sub) t.append(el('small', null, sub));
  const tick = el('span', 'pick-tick');
  tick.appendChild(svgIcon('check'));
  b.append(t, tick);
  b.onclick = () => {
    if (opts.locked) return;
    const on = b.getAttribute('aria-checked') !== 'true';
    b.setAttribute('aria-checked', String(on));
    if (navigator.vibrate) try { navigator.vibrate(6); } catch {}
    opts.onToggle && opts.onToggle(on);
  };
  return b;
}
function pickConfirm(label) {
  // the sheet's primary button, kept in step with how many rows are ticked
  const btn = $('#modal-actions .btn.primary');
  if (btn) { btn.textContent = label.text; btn.disabled = !label.n; }
}

/* Add songs to a folder: tick any number from the library, then confirm. */
function openAddSongs(folder) {
  const pool = songs.filter((s) => !folder.songIds.includes(s.id)).sort((a, b) => (a.title || '').localeCompare(b.title || ''));
  if (!pool.length) {
    openModal('Add songs', songs.length ? 'Every song in your library is already in this folder.' : 'Your library is empty. Find a song first, then add it here.', songs.length ? [{ label: 'OK' }] : [{ label: 'Find a song', primary: true, run: () => (location.hash = '#/search') }]);
    return;
  }
  const chosen = new Set();
  const body = el('div', 'stack pick');
  let search = null;
  if (pool.length > 6) {
    search = el('input', 'input pick-search');
    search.type = 'search';
    search.placeholder = 'Filter by song or artist';
    search.setAttribute('aria-label', 'Filter songs');
    body.appendChild(search);
  }
  const list = el('div', 'pick-list');
  const label = () => ({ n: chosen.size, text: chosen.size ? 'Add ' + chosen.size + (chosen.size === 1 ? ' song' : ' songs') : 'Add songs' });
  for (const s of pool) {
    const row = pickRow(s.title || 'Untitled', s.artist || '', { cover: coverNode(s), onToggle: (on) => { on ? chosen.add(s.id) : chosen.delete(s.id); pickConfirm(label()); } });
    row.dataset.q = ((s.title || '') + ' ' + (s.artist || '')).toLowerCase();
    list.appendChild(row);
  }
  body.appendChild(list);
  if (search) search.oninput = () => { const q = search.value.trim().toLowerCase(); for (const r of list.children) r.hidden = !!q && !r.dataset.q.includes(q); };
  openModal('Add to ' + folder.name, body, [
    { label: 'Cancel' },
    { label: 'Add songs', primary: true, run: () => {
      if (!chosen.size) return;
      // keep the library order the person ticked them in
      for (const id of chosen) if (!folder.songIds.includes(id)) folder.songIds.push(id);
      saveFolders();
      toast('Added ' + chosen.size + (chosen.size === 1 ? ' song' : ' songs') + ' to ' + folder.name);
      rerender();
    } },
  ]);
  pickConfirm(label());
}

/* Add one song to folders: tick one or several, then confirm. Folders it is already in show as ticked. */
function openFolderPicker(song, preselect) {
  const chosen = new Set(preselect || []);
  const body = el('div', 'stack pick');
  const list = el('div', 'pick-list');
  const label = () => ({ n: chosen.size, text: chosen.size ? 'Add to ' + (chosen.size === 1 ? '1 folder' : chosen.size + ' folders') : 'Add to folder' });
  for (const f of folders) {
    const has = f.songIds.includes(song.id);
    const n = f.songIds.length;
    list.appendChild(pickRow(f.name, has ? 'Already in here' : n + (n === 1 ? ' song' : ' songs'), {
      locked: has, checked: has || chosen.has(f.id),
      onToggle: (on) => { on ? chosen.add(f.id) : chosen.delete(f.id); pickConfirm(label()); },
    }));
  }
  const nf = el('button', 'pick-row new');
  nf.type = 'button';
  const plus = el('span', 'pick-plus');
  plus.appendChild(svgIcon('plus'));
  nf.append(plus, el('span', 'pick-text', 'New folder'));
  nf.onclick = () => askText('New folder', 'Name', '', (name) => { const f = createFolder(name); openFolderPicker(song, [...chosen, f.id]); });
  list.appendChild(nf);
  body.appendChild(list);
  openModal('Add to folder', body, [
    { label: 'Cancel' },
    { label: 'Add to folder', primary: true, run: () => {
      const picked = folders.filter((f) => chosen.has(f.id));
      if (!picked.length) return;
      for (const f of picked) toggleInFolder(f, song.id, true);
      toast('Added to ' + (picked.length === 1 ? picked[0].name : picked.length + ' folders'));
      rerender();
    } },
  ]);
  pickConfirm(label());
}

function openSongSheet(song, folderId) {
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
  const fo = el('div', 'folder-row');
  const inF = folders.filter((f) => f.songIds.includes(song.id));
  fo.appendChild(el('span', 'muted small grow', inF.length ? 'In ' + inF.map((f) => f.name).join(', ') : 'Not in any folders yet'));
  const add = el('button', 'btn small');
  add.type = 'button';
  add.append(svgIcon('plus'), document.createTextNode('Add to folder'));
  add.onclick = () => openFolderPicker(song);
  fo.appendChild(add);
  body.appendChild(fo);
  const stats = [song.plays ? song.plays + (song.plays === 1 ? ' play' : ' plays') : 'Not played yet', song.bpm ? song.bpm + ' BPM' : ''].filter(Boolean).join(' · ');
  body.appendChild(el('div', 'muted small', stats));
  openModal(song.title || 'Song', body, [
    { label: 'Edit song', run: () => (location.hash = '#/edit/' + song.id) },
    ...(folderId && getFolder(folderId) ? [{ label: 'Remove from ' + getFolder(folderId).name, run: () => { toggleInFolder(getFolder(folderId), song.id, false); rerender(); } }] : []),
    { label: 'Delete', danger: true, run: () => {
      if (!confirm('Delete "' + song.title + '"? This cannot be undone.')) return;
      deleteSong(song.id);
      rerender();
    } },
  ]);
}
function rerender() {
  if (!$('#view-library').hidden) renderLibrary();
  else if (!$('#view-folder').hidden) renderFolder();
  else if (!$('#view-practice').hidden) openPractice();
}

/* ---------------- search (LRCLIB) ---------------- */
let searchRun = 0; // bumped when a search starts or is cleared, so a slow answer can't refill a cleared screen
/* Once a song is added, Find starts fresh next time instead of showing the old search. */
function clearSearch() {
  searchRun++;
  $('#search-track').value = '';
  $('#search-artist').value = '';
  $('#search-status').textContent = '';
  $('#search-results').innerHTML = '';
}
$('#search-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const run = ++searchRun;
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
    if (run !== searchRun) return;
    results = results.filter((r) => r.syncedLyrics || r.plainLyrics);
    results.sort((a, b) => (b.syncedLyrics ? 1 : 0) - (a.syncedLyrics ? 1 : 0));
    status.textContent = results.length ? results.length + ' found. Tap one to preview.' : 'Nothing found. Try fewer words, or paste the lyrics yourself.';
    results.slice(0, 30).forEach((r, i) => {
      const li = el('li');
      li.style.setProperty('--i', Math.min(i, 14));
      const m = el('div', 'meta');
      m.append(el('div', 't', r.trackName), el('div', 'a', [r.artistName, r.albumName, r.duration ? fmtTime(r.duration) : ''].filter(Boolean).join(' · ')));
      li.appendChild(m);
      li.appendChild(el('span', r.syncedLyrics ? 'badge synced' : 'badge', r.syncedLyrics ? 'Synced' : 'Words only'));
      li.onclick = () => previewResult(r);
      if (i === 0) {
        // the best match blooms open: a few lines to recognise it, and a way to add it straight away
        li.classList.add('bloom');
        const plain = (r.plainLyrics || (r.syncedLyrics || '').replace(/^\s*\[[^\]]*\]\s?/gm, '')).split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 3);
        const pv = el('div', 'bloom-lines');
        plain.forEach((line) => pv.appendChild(el('div', null, line)));
        const add = el('button', 'btn primary', 'Add to library');
        add.type = 'button';
        add.onclick = (e) => { e.stopPropagation(); saveResult(r); };
        li.append(pv, add);
      }
      list.appendChild(li);
    });
    list.classList.add('strung');
  } catch (err) {
    if (run !== searchRun) return;
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
    queueEnrich(song);
    toast('Saved to your songs');
  }
  clearSearch();
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
  $('#edit-bpm').value = editing.bpm || '';
  $('#edit-bpb').value = String(editing.beatsPerBar || 4);
  $('#edit-bpm-note').textContent = editing.bpm && editing.bpmSource === 'deezer' ? 'Suggested from online data. Tap along to check it.' : 'Tap along with the recording, or type it in.';
  $('#edit-tap').textContent = 'Tap on the beat';
  $('#edit-lyrics').value = editing.lyrics || '';
  editDirty = false;
  show('edit');
}
const editTap = makeTapper((n) => { $('#edit-bpm').value = n; editDirty = true; $('#edit-tap').textContent = n + ' BPM · keep tapping'; }, (left) => { $('#edit-tap').textContent = 'Keep going… ' + left + ' more'; });
$('#edit-tap').onpointerdown = (e) => { e.preventDefault(); editTap(); };
for (const id of ['#edit-title', '#edit-artist', '#edit-duration', '#edit-bpm', '#edit-bpb', '#edit-lyrics']) $(id).addEventListener('input', () => (editDirty = true));
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
  const bpm = Math.round(parseFloat($('#edit-bpm').value));
  if (bpm >= 30 && bpm <= 300) { if (bpm !== before?.bpm) editing.bpmSource = 'manual'; editing.bpm = bpm; }
  else if (!$('#edit-bpm').value.trim() && before && before.bpm && before.bpmSource !== 'deezer') { editing.bpm = undefined; }
  editing.beatsPerBar = +$('#edit-bpb').value || 4;
  editing.lyrics = lyrics;
  if (!before || before.title !== editing.title || before.artist !== editing.artist) {
    delete editing.art; // look the cover (and tempo, unless set by hand) up again
    if (!['manual', 'tap', 'confirmed'].includes(editing.bpmSource)) delete editing.bpm;
  }
  upsertSong(editing);
  queueEnrich(editing);
  editDirty = false;
  toast('Saved');
  location.replace('#/play/' + editing.id);
};

/* ---------------- settings ---------------- */
/* Segmented pickers: a <select data-seg="A|B|C"> becomes a row of chunky pill options.
 * The select stays in the page (hidden) and still fires 'change', so nothing else needs to know. */
function makePicker(select) {
  const labels = select.dataset.seg.split('|');
  const seg = el('div', 'segmented picker-seg');
  seg.setAttribute('role', 'radiogroup');
  const lab = select.getAttribute('aria-labelledby');
  if (lab) seg.setAttribute('aria-labelledby', lab);
  [...select.options].forEach((o, i) => {
    const b = el('button', null, labels[i] || o.textContent);
    b.type = 'button';
    b.setAttribute('role', 'radio');
    b.dataset.v = o.value;
    b.onclick = () => {
      if (select.value === o.value) return;
      select.value = o.value;
      select.dispatchEvent(new Event('change'));
      syncPicker(select);
    };
    seg.appendChild(b);
  });
  select.hidden = true;
  select.after(seg);
  select._seg = seg;
}
function syncPicker(select) {
  if (!select._seg) return;
  for (const b of select._seg.children) {
    const on = b.dataset.v === select.value;
    b.classList.toggle('active', on);
    b.setAttribute('aria-checked', String(on));
  }
}
function syncPickers() { document.querySelectorAll('select[data-seg]').forEach(syncPicker); }
document.querySelectorAll('select[data-seg]').forEach(makePicker);
function openSettings() {
  $('#set-font').value = settings.fontSize;
  $('#set-font-out').textContent = settings.fontSize;
  $('#set-resume').value = String(settings.resumeDelay);
  $('#set-countin').value = String(settings.countIn);
  $('#set-click').checked = settings.clickSound;
  $('#set-gaps').checked = !!settings.pauseGaps;
  $('#set-bpm').checked = settings.autoBpm;
  $('#set-chords').checked = settings.showChords;
  $('#set-wake').checked = settings.keepAwake;
  $('#set-motion').checked = settings.motion;
  $('#set-covers').checked = settings.covers;
  syncPickers();
  $('#app-version').textContent = 'Version ' + APP_VERSION + ' · ' + songs.length + ' songs · ' + folders.length + ' folders';
  show('settings');
}
$('#set-font').addEventListener('input', (e) => { settings.fontSize = +e.target.value; $('#set-font-out').textContent = settings.fontSize; saveSettings(); });
$('#set-resume').addEventListener('change', (e) => { settings.resumeDelay = +e.target.value; saveSettings(); });
$('#set-countin').addEventListener('change', (e) => { settings.countIn = e.target.value; saveSettings(); });
$('#set-click').addEventListener('change', (e) => { settings.clickSound = e.target.checked; saveSettings(); });
$('#set-gaps').addEventListener('change', (e) => { settings.pauseGaps = e.target.checked; saveSettings(); });
$('#set-bpm').addEventListener('change', (e) => { settings.autoBpm = e.target.checked; saveSettings(); });
$('#set-chords').addEventListener('change', (e) => { settings.showChords = e.target.checked; saveSettings(); });
$('#set-wake').addEventListener('change', (e) => { settings.keepAwake = e.target.checked; saveSettings(); });
$('#set-motion').addEventListener('change', (e) => { settings.motion = e.target.checked; saveSettings(); });
$('#set-covers').addEventListener('change', (e) => { settings.covers = e.target.checked; saveSettings(); });

$('#backup-export').onclick = () => {
  const data = JSON.stringify({ app: 'lyrica', version: 2, exported: new Date().toISOString(), settings, meta, folders, songs }, null, 1);
  const a = el('a');
  a.href = URL.createObjectURL(new Blob([data], { type: 'application/json' }));
  a.download = 'stanze-backup-' + new Date().toISOString().slice(0, 10) + '.json';
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
    toast('That file is not a Stanze backup');
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

/* ---------------- metronome (Web Audio clicks, scheduled ahead for steady timing) ---------------- */
const metro = {
  ctx: null,
  timer: null,
  next: 0,
  beat: 0,
  bpm: 120,
  bpb: 4,
  ensure() {
    try {
      if (!this.ctx) { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return null; this.ctx = new AC(); }
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return this.ctx;
    } catch { return null; }
  },
  click(at, accent) {
    const ctx = this.ctx;
    if (!ctx) return;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = accent ? 1760 : 1175;
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(accent ? 0.9 : 0.55, at + 0.002);
    g.gain.exponentialRampToValueAtTime(0.0001, at + 0.06);
    o.connect(g).connect(ctx.destination);
    o.start(at);
    o.stop(at + 0.08);
  },
  flash(at, accent) {
    const delay = Math.max(0, (at - this.ctx.currentTime) * 1000);
    setTimeout(() => {
      // the click button gives a small ripple on each beat it sounds
      const d = $('#p-metro');
      d.classList.remove('tick', 'accent');
      void d.offsetWidth;
      d.classList.add('tick');
      d.classList.toggle('accent', accent);
    }, delay);
  },
  start(bpm, bpb, firstAt) {
    this.stop();
    if (!this.ensure()) return;
    this.bpm = bpm;
    this.bpb = bpb;
    this.next = Math.max(firstAt || 0, this.ctx.currentTime + 0.05);
    this.beat = 0;
    this.timer = setInterval(() => this.tick(), 25);
    this.tick();
  },
  tick() {
    while (this.next < this.ctx.currentTime + 0.12) {
      const accent = this.beat % this.bpb === 0;
      this.click(this.next, accent);
      this.flash(this.next, accent);
      this.next += 60 / this.bpm;
      this.beat++;
    }
  },
  stop() { clearInterval(this.timer); this.timer = null; },
  get running() { return !!this.timer; },
};

/* ---------------- player ---------------- */
const ANCHOR = 0.3; // where the current line sits, as a share of the lyric area height

/* ---------------- YouTube: play along with the full song or a backing track ----------------
 * Nothing is searched from inside the app (that needs a private key). Instead we open YouTube
 * already searched, and the user pastes back the link of the video they pick.
 * While a video plays, the lyrics follow the video's own clock. */
const YT_KINDS = { full: 'Full song', backing: 'Backing track' };
function ytId(text) {
  const s = String(text || '').trim();
  if (/^[\w-]{11}$/.test(s)) return s;
  const m = s.match(/(?:youtu\.be\/|[?&]v=|\/(?:shorts|embed|live|v)\/)([\w-]{11})/);
  return m ? m[1] : null;
}
function ytSearchUrl(song, kind) {
  const q = [song.artist, song.title, kind === 'backing' ? 'backing track' : ''].filter(Boolean).join(' ');
  return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q);
}
let ytApi = null;
function loadYouTube() {
  if (ytApi) return ytApi;
  ytApi = new Promise((resolve, reject) => {
    if (window.YT && window.YT.Player) { resolve(window.YT); return; }
    const prev = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => { if (prev) prev(); resolve(window.YT); };
    const sc = document.createElement('script');
    sc.src = 'https://www.youtube.com/iframe_api';
    sc.onerror = () => { ytApi = null; reject(new Error('blocked')); };
    document.head.appendChild(sc);
    setTimeout(() => { if (!(window.YT && window.YT.Player)) { ytApi = null; reject(new Error('timeout')); } }, 12000);
  });
  return ytApi;
}
/* Builds a player inside host. Resolves with the YT.Player once it is ready. */
function makeYtPlayer(host, videoId, handlers = {}) {
  return loadYouTube().then((YT) => new Promise((resolve) => {
    host.innerHTML = '';
    const div = document.createElement('div');
    host.appendChild(div);
    const vp = new YT.Player(div, {
      videoId, width: '100%', height: '100%',
      playerVars: { playsinline: 1, rel: 0, controls: 0, fs: 0, disablekb: 1, iv_load_policy: 3, origin: location.origin },
      events: {
        onReady: () => resolve(vp),
        onStateChange: (e) => handlers.onState && handlers.onState(e.data),
        onError: (e) => { if (handlers.onError) handlers.onError(e.data); resolve(vp); },
      },
    });
  }));
}
function ytErrorText(code) {
  if (code === 101 || code === 150) return 'The owner of this video doesn\'t allow it to play inside other apps. Try another one.';
  if (code === 100 || code === 2) return 'That video can\'t be found. It may be private or removed.';
  return 'This video won\'t play here. Try another one.';
}
/* Poll for a video's length (YouTube only knows it once the video's details have loaded). */
function ytDuration(vp, ms = 5000) {
  return new Promise((resolve) => {
    const t0 = performance.now();
    const tick = () => {
      let d = 0;
      try { d = vp.getDuration(); } catch { /* not ready */ }
      if (d > 0) resolve(Math.round(d));
      else if (performance.now() - t0 > ms) resolve(null);
      else setTimeout(tick, 250);
    };
    tick();
  });
}

/* Add (or replace) the full song or backing track for a song. */
function openTrackSheet(song, kind) {
  const body = el('div', 'stack track-sheet');
  body.appendChild(el('p', 'muted small', kind === 'backing'
    ? 'Pick a backing track that follows the original recording, so the lyrics stay in time. Copy its link (Share, then Copy link) and paste it below.'
    : 'Pick the original studio recording. Copy its link (Share, then Copy link) and paste it below.'));
  const find = el('a', 'btn');
  find.href = ytSearchUrl(song, kind);
  find.target = '_blank';
  find.rel = 'noopener';
  find.appendChild(svgIcon('search'));
  find.appendChild(document.createTextNode('Search YouTube for ' + (kind === 'backing' ? 'a backing track' : 'the song')));
  body.appendChild(find);
  const row = el('div', 'row gap');
  const input = el('input', 'input grow');
  input.placeholder = 'Paste a YouTube link';
  input.inputMode = 'url';
  input.setAttribute('aria-label', 'YouTube link');
  const paste = el('button', 'btn small', 'Paste');
  paste.type = 'button';
  row.append(input, paste);
  body.appendChild(row);
  const frame = el('div', 'vc-frame preview');
  frame.hidden = true;
  body.appendChild(frame);
  const status = el('p', 'track-status small');
  status.hidden = true;
  body.appendChild(status);
  const use = el('button', 'btn primary', 'Use this video');
  use.type = 'button';
  use.hidden = true;
  body.appendChild(use);

  let vp = null;
  let checking = 0;
  let found = null;
  const say = (text, tone) => { status.hidden = !text; status.textContent = text || ''; status.className = 'track-status small' + (tone ? ' ' + tone : ''); };
  const stopPreview = () => { if (vp) { try { vp.destroy(); } catch { /* gone */ } vp = null; } };
  const check = async () => {
    const id = ytId(input.value);
    const run = ++checking;
    use.hidden = true;
    found = null;
    if (!input.value.trim()) { say(''); frame.hidden = true; stopPreview(); return; }
    if (!id) { say('That doesn\'t look like a YouTube link.', 'warn'); return; }
    say('Checking the video…');
    stopPreview();
    frame.hidden = false;
    let err = null;
    try {
      vp = await makeYtPlayer(frame, id, { onError: (c) => { err = c; if (run === checking) { say(ytErrorText(c), 'warn'); use.hidden = true; } } });
    } catch {
      if (run === checking) { frame.hidden = true; say('Can\'t reach YouTube right now. Check your connection and try again.', 'warn'); }
      return;
    }
    if (run !== checking) return;
    if (err) return;
    const dur = await ytDuration(vp);
    if (run !== checking || err) return;
    let title = '';
    try { title = (vp.getVideoData() || {}).title || ''; } catch { /* optional */ }
    found = { id, dur, title };
    const orig = song.duration;
    use.hidden = false;
    use.textContent = 'Use this video';
    if (!dur) say('Couldn\'t read how long this video is, so it can\'t be checked against the original.', '');
    else if (!orig) say('Length ' + fmtTime(dur) + '. Stanze doesn\'t know how long the original is, so it can\'t compare them.', '');
    else {
      const diff = dur - orig;
      if (Math.abs(diff) <= 5) say('Length ' + fmtTime(dur) + ', which matches the original (' + fmtTime(orig) + ').', 'ok');
      else {
        say('This runs ' + fmtTime(Math.abs(diff)) + (diff > 0 ? ' longer' : ' shorter') + ' than the original (' + fmtTime(orig) + '), so the lyrics will probably drift. Best to try another.', 'warn');
        use.textContent = 'Use it anyway';
      }
    }
  };
  input.addEventListener('input', () => { clearTimeout(input._t); input._t = setTimeout(check, 300); });
  paste.onclick = async () => {
    try { input.value = await navigator.clipboard.readText(); check(); }
    catch { input.focus(); toast('Press and hold the box, then choose Paste'); }
  };
  use.onclick = () => {
    if (!found) return;
    song.yt = Object.assign({}, song.yt, { [kind]: found });
    song.ytUse = kind;
    upsertSong(song);
    closeModal();
    if (player.song && player.song.id === song.id) player.mountVideo();
    toast(YT_KINDS[kind] + ' added');
  };
  openModal(YT_KINDS[kind], body, [{ label: 'Cancel' }]);
  modalCleanup = stopPreview;
  const cur = song.yt && song.yt[kind];
  if (cur) say('Replacing the current ' + YT_KINDS[kind].toLowerCase() + '.', '');
}
function removeTrack(song, kind) {
  if (!song.yt || !song.yt[kind]) return;
  const yt = Object.assign({}, song.yt);
  delete yt[kind];
  song.yt = yt;
  if (song.ytUse === kind) song.ytUse = 'off';
  upsertSong(song);
  if (player.song && player.song.id === song.id) { player.mountVideo(); player.updateUi(); }
  toast(YT_KINDS[kind] + ' removed');
}
function openTrackOptions(song) {
  const kind = song.ytUse;
  const tr = song.yt && song.yt[kind];
  if (!tr) return;
  const body = el('div', 'stack');
  if (tr.title) body.appendChild(el('div', 'strong', tr.title));
  body.appendChild(el('p', 'muted small', 'If this ' + YT_KINDS[kind].toLowerCase() + ' doesn\'t keep in time with the lyrics, try another or remove it.'));
  const links = el('div', 'sheet-links');
  const mk = (label, icon, fn) => { const b = el('button', 'btn small'); b.type = 'button'; b.appendChild(svgIcon(icon)); b.appendChild(document.createTextNode(label)); b.onclick = fn; links.appendChild(b); };
  mk('Try another', 'search', () => openTrackSheet(song, kind));
  mk('Remove', 'close', () => { closeModal(); removeTrack(song, kind); });
  body.appendChild(links);
  openModal(YT_KINDS[kind], body);
}

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
  countIn: null,
  taps: [],
  playCounted: false,
  timing: null, // tap-to-time state
  raf: 0,
  // YouTube video (full song or backing track)
  vp: null,
  vpId: null,
  vpState: -1,
  vpError: null,
  vpFailed: false,
  vpDur: 0,
  vpAnchor: null,
  vpLast: -1,
  vpToken: 0,
  gaps: [],
  gapHold: null, // paused at an instrumental, waiting to come back in
  lit: new Map(), // line index -> focus level currently painted

  open(song, folderId) {
    this.song = song;
    this.folderId = folderId;
    this.t = 0;
    this.maxT = 0;
    this.playing = false;
    this.manualUntil = 0;
    this.cur = -1;
    this.countIn = null;
    this.playCounted = false;
    this.stopTiming(true);
    $('#p-title').textContent = song.title;
    $('#p-artist').textContent = song.artist || '';
    show('player');
    let parsed = parseLyrics(song.lyrics);
    this.synced = parsed.synced;
    this.useTimeline(buildTimeline(parsed, song));
    wake.on();
    this.mountVideo();
    this.tempoChanged();
    this.updateUi();
    this.lastFrame = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame((ts) => this.frame(ts));
    song.lastPlayed = Date.now();
    saveSongs();
    if (this.autoStart) {
      this.autoStart = false;
      setTimeout(() => { if (this.song === song && !this.playing) this.play(); }, 450);
    }
  },
  leave() {
    if (!this.song) return;
    this.clearEnd();
    this.creditPractice();
    this.pause();
    this.stopTiming(true);
    this.unmountVideo();
    cancelAnimationFrame(this.raf);
    wake.off();
    this.song = null;
  },

  /* ----- YouTube video ----- */
  track() { const s = this.song; return s && s.yt && s.ytUse && s.yt[s.ytUse] ? s.yt[s.ytUse] : null; },
  // the lyrics follow the video only while one is loaded and working
  usingVideo() { return !!(this.track() && this.vp && !this.vpError && !this.vpFailed && !this.timing); },
  endT() { return this.usingVideo() && this.vpDur ? Math.max(this.vpDur, this.tl.end) : this.tl.end; },
  mountVideo() {
    const tr = this.track();
    if (!tr) { this.unmountVideo(); this.renderVideoCard(); return; }
    if (this.vp && this.vpId === tr.id && !this.vpError) { this.renderVideoCard(); return; }
    this.unmountVideo();
    if (this.playing) this.pause();
    this.vpId = tr.id;
    this.vpDur = tr.dur || 0;
    const token = ++this.vpToken;
    this.renderVideoCard();
    if (navigator.onLine === false) { this.vpFailed = true; this.renderVideoCard(); return; }
    makeYtPlayer($('#p-video-frame'), tr.id, {
      onState: (st) => { if (token === this.vpToken) this.videoState(st); },
      onError: (code) => { if (token !== this.vpToken) return; this.vpError = code; if (this.playing) this.pause(); this.renderVideoCard(); this.updateUi(); },
    }).then((vp) => {
      if (token !== this.vpToken) { try { vp.destroy(); } catch { /* gone */ } return; }
      this.vp = vp;
      ytDuration(vp, 8000).then((d) => { if (d && token === this.vpToken) this.vpDur = d; });
      try { vp.setPlaybackRate(this.song.speed || 1); } catch { /* fine */ }
      this.renderVideoCard();
      this.updateUi();
    }).catch(() => {
      if (token !== this.vpToken) return;
      this.vpFailed = true;
      this.renderVideoCard();
      this.updateUi();
    });
  },
  unmountVideo() {
    this.vpToken++;
    if (this.vp) { try { this.vp.destroy(); } catch { /* gone */ } }
    this.vp = null;
    this.vpId = null;
    this.vpState = -1;
    this.vpError = null;
    this.vpFailed = false;
    this.vpAnchor = null;
    this.vpLast = -1;
    const f = $('#p-video-frame');
    if (f) f.innerHTML = '';
  },
  /* YouTube's own state changes (including taps on the video itself) */
  videoState(st) {
    this.vpState = st;
    if (st === 1 && !this.playing) { this.playing = true; this.manualUntil = 0; wake.on(); this.updateUi(); }
    else if (st === 2 && this.playing) { this.playing = false; this.updateUi(); }
    else if (st === 0 && this.playing) { this.t = this.endT(); this.finished(); }
    if (st !== 1) this.vpAnchor = null;
  },
  videoTime() { try { return this.vp.getCurrentTime() || 0; } catch { return this.t; } },
  videoSeek(t) {
    this.vpAnchor = null;
    // seeking a video that hasn't started yet would start it, so leave that for play()
    if (this.vpState === 1 || this.vpState === 2 || this.vpState === 3) { try { this.vp.seekTo(t, true); } catch { /* fine */ } }
  },
  renderVideoCard() {
    const card = $('#p-video');
    const s = this.song;
    const has = s && s.yt && (s.yt.full || s.yt.backing);
    card.hidden = !has;
    if (!has) { requestAnimationFrame(() => this.layout()); return; }
    const tr = this.track();
    const sw = $('#p-video-switch');
    sw.innerHTML = '';
    const opts = [['full', 'Full song'], ['backing', 'Backing'], ['off', 'No video']];
    for (const [k, label] of opts) {
      const b = el('button', (s.ytUse || 'off') === k || (k === 'off' && !tr) ? 'active' : '', label);
      b.type = 'button';
      if (k !== 'off' && !s.yt[k]) { b.classList.add('add'); b.prepend(svgIcon('plus')); b.setAttribute('aria-label', 'Add a ' + YT_KINDS[k].toLowerCase()); }
      b.onclick = () => {
        if (k !== 'off' && !s.yt[k]) { openTrackSheet(s, k); return; }
        if (s.ytUse === k) return;
        s.ytUse = k;
        upsertSong(s);
        this.mountVideo();
        this.updateUi();
      };
      sw.appendChild(b);
    }
    $('#p-video-more').hidden = !tr;
    $('#p-video-wrap').hidden = !tr;
    const msg = $('#p-video-msg');
    let text = '';
    if (tr && this.vpError) text = ytErrorText(this.vpError) + ' The lyrics will run on their own timer.';
    else if (tr && this.vpFailed) text = 'Can\'t reach YouTube, so the lyrics will run on their own timer.';
    msg.hidden = !text;
    msg.textContent = text;
    requestAnimationFrame(() => this.layout());
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
  goNext(start) {
    this.stopEndTimer();
    const n = this.nextSong();
    if (!n) return;
    this.autoStart = !!start; // from the end card, the next song starts playing (with its count-in)
    location.hash = '#/play/' + n.id + '/' + this.folderId;
  },
  back() { location.hash = this.folderId ? '#/folder/' + this.folderId : '#/'; },

  useTimeline(tl) {
    this.tl = tl;
    const box = $('#p-lyrics');
    this.clearEnd();
    box.innerHTML = '';
    box.classList.toggle('no-chords', !settings.showChords);
    this.nodes = tl.lines.map((l, i) => box.appendChild(lineNode(l, i)));
    this.lit = new Map();
    this.gapHold = null;
    this.gaps = this.song ? findGaps(tl, this.song, this.synced && !this.timing) : [];
    this.cur = -2;
    this.hasChords = tl.lines.some((l) => l.hasChords);
    this.buildGapCards();
    box.scrollTop = 0;
  },
  /* The song starts at the top of the screen (no empty space above it). Padding below lets the last line reach the anchor. */
  layout() {
    const box = $('#p-lyrics');
    if (!this.nodes || !this.nodes.length) return;
    // measure without the old padding, otherwise the box can't shrink when the video card appears
    box.style.paddingTop = box.style.paddingBottom = '0px';
    const h = box.clientHeight;
    if (h === 0) return;
    $('#view-player').scrollTop = 0;
    box.style.paddingTop = '14px';
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
    if (this.usingVideo()) {
      if (this.t >= this.endT() - 0.5) { this.t = 0; this.maxT = 0; }
      if (this.t < 0.05 && this.song.skipIntro && this.synced) this.t = this.introSkipTo();
      this.playing = true;
      this.manualUntil = 0;
      this.vpAnchor = null;
      // the recording keeps time, so there is no count-in or click
      try {
        if (Math.abs(this.videoTime() - this.t) > 0.3) this.vp.seekTo(this.t, true);
        this.vp.setPlaybackRate(this.song.speed || 1);
        this.vp.playVideo();
      } catch { /* the error handler reports it */ }
      wake.on();
      this.updateUi();
      return;
    }
    if (this.t >= this.tl.end - 0.1) { this.t = 0; this.maxT = 0; }
    this.clearEnd();
    this.playing = true;
    this.manualUntil = 0;
    const hold = this.gapHold;
    this.gapHold = null;
    if (hold && !this.timing) {
      // come back in right where the next line starts, after a count-in
      this.t = hold.end;
      this.gapDone = hold;
      this.startCountIn(String(settings.countIn) === '0' ? '1bar' : null);
    } else if (this.t < 0.05 && !this.timing) {
      if (this.song.skipIntro && this.synced) this.t = this.introSkipTo();
      this.startCountIn();
    }
    if (!this.countIn) { this.startMetro(); this.beatFrom = this.t; }
    this.lastFrame = performance.now();
    wake.on();
    this.updateUi();
  },
  pause() {
    this.playing = false;
    this.countIn = null;
    if (this.vp && (this.vpState === 1 || this.vpState === 3)) { try { this.vp.pauseVideo(); } catch { /* fine */ } }
    metro.stop();
    paintRing(-1);
    this.updateUi();
  },
  toggle() { this.playing ? this.pause() : this.play(); },
  restart() {
    this.clearEnd();
    this.gapHold = null;
    this.t = 0;
    this.maxT = 0;
    this.manualUntil = 0;
    this.cur = -2;
    this.playCounted = false;
    if (this.usingVideo()) this.videoSeek(0);
    if (this.playing) { this.pause(); this.play(); }
    this.updateUi();
  },
  seekToLine(i) {
    const l = this.tl.lines[i];
    if (!l || l.time == null || this.timing) return;
    this.clearEnd();
    this.t = l.time;
    this.manualUntil = 0;
    this.gapHold = null;
    if (this.usingVideo()) this.videoSeek(l.time);
    this.updateUi();
  },
  setSpeed(v) {
    this.song.speed = Math.round(clamp(v, 0.5, 2) * 1000) / 1000;
    upsertSong(this.song);
    if (metro.running && this.song.bpm) metro.bpm = this.song.bpm * this.song.speed;
    if (this.vp) { try { this.vp.setPlaybackRate(this.song.speed); } catch { /* fine */ } this.vpAnchor = null; }
    this.updateUi();
  },
  /* Start a bar (or 3 seconds) before the first sung line. */
  introSkipTo() {
    const o = this.tl.order;
    if (!o.length) return 0;
    const first = this.tl.lines[o[0]].time;
    const lead = this.song.bpm ? (60 / this.song.bpm) * (this.song.beatsPerBar || 4) : 3;
    return first - lead > 1 ? first - lead : 0;
  },
  /* Count-in: on the beat when the song has a tempo, otherwise a plain seconds countdown. */
  startCountIn(force) {
    const mode = force || String(settings.countIn);
    if (mode === '0' || this.usingVideo()) return;
    const bpb = this.song.beatsPerBar || 4;
    let beats, beatSec, accentEvery;
    if (/bar$/.test(mode) && this.song.bpm) {
      beats = bpb * parseInt(mode, 10);
      beatSec = 60 / (this.song.bpm * (this.song.speed || 1));
      accentEvery = bpb;
    } else {
      beats = /bar$/.test(mode) ? 3 : +mode;
      beatSec = 1;
      accentEvery = 1000;
    }
    const lead = 0.08;
    this.countIn = { start: performance.now() + lead * 1000, beatMs: beatSec * 1000, beats, shown: -1, bpb: accentEvery, audioEnd: 0 };
    if (settings.clickSound && metro.ensure()) {
      const t0 = metro.ctx.currentTime + lead;
      for (let i = 0; i < beats; i++) metro.click(t0 + i * beatSec, i % accentEvery === 0);
      this.countIn.audioEnd = t0 + beats * beatSec;
    }
  },
  startMetro(firstAt) {
    if (!settings.metroOn || !this.song.bpm || this.timing || this.usingVideo()) return;
    metro.start(this.song.bpm * (this.song.speed || 1), this.song.beatsPerBar || 4, firstAt);
  },
  tempoChanged() {
    const bpm = this.song && this.song.bpm;
    if (this.song && this.tl) { this.gaps = findGaps(this.tl, this.song, this.synced && !this.timing); this.buildGapCards(); }
    // the background glow breathes once every two bars when the tempo is known
    $('#view-player').style.setProperty('--breathe', bpm ? clamp((60 / bpm) * 8, 4, 14).toFixed(2) + 's' : '9s');
    if (metro.running && bpm) metro.bpm = bpm * (this.song.speed || 1);
    this.updateUi();
  },
  /* Tempo model: song.bpm is the song's own tempo, song.speed scales everything.
   * What you hear and see is bpm x speed, so the speed and the metronome can never disagree. */
  playingBpm() { return this.song.bpm ? Math.round(this.song.bpm * (this.song.speed || 1)) : null; },
  setPlayingBpm(target) {
    if (!this.song.bpm) return;
    const speed = clamp(target / this.song.bpm, 0.5, 2);
    if (speed !== target / this.song.bpm) toast('Tempo can go from half to double the song\'s own ' + this.song.bpm + ' BPM');
    this.setSpeed(speed);
  },
  setBpm(bpm, source) {
    this.song.bpm = Math.round(clamp(bpm, 30, 300));
    this.song.bpmSource = source;
    upsertSong(this.song);
    this.tempoChanged();
    if (settings.metroOn && this.playing && !this.countIn && !metro.running) this.startMetro();
  },
  updateUi() {
    const btn = $('#p-play');
    btn.innerHTML = '';
    btn.appendChild(svgIcon(this.playing ? 'pause' : 'play'));
    btn.setAttribute('aria-label', this.playing ? 'Pause' : 'Play');
    $('#view-player').classList.toggle('is-playing', this.playing);
    if (!this.song) return;
    const on = !!settings.metroOn;
    const has = !!this.song.bpm;
    const pct = Math.round((this.song.speed || 1) * 100);
    const suggested = has && this.song.bpmSource === 'deezer';
    $('#p-tempo-btn').classList.toggle('empty', !has);
    $('#p-tempo-btn').classList.toggle('suggested', suggested);
    $('#p-tempo-num').textContent = has ? String(this.playingBpm()) : 'Tap';
    $('#p-tempo-sub').textContent = !has ? 'tempo' : suggested ? 'check' : 'bpm';
    $('#p-tempo-btn').setAttribute('aria-label', !has ? 'Set the tempo by tapping' : suggested ? 'Suggested tempo of ' + this.playingBpm() + ' BPM, tap to check it' : 'Tempo ' + this.playingBpm() + ' BPM, ' + timeSig(this.song.beatsPerBar));
    const video = this.usingVideo();
    $('#p-metro').setAttribute('aria-pressed', String(on && has && !video));
    $('#p-metro').classList.toggle('unavailable', !has || video);
    const note = $('#p-speed-note');
    note.hidden = pct === 100;
    note.textContent = 'Practising at ' + pct + '% of the real speed. Tap to reset.';
  },
  finished() {
    this.pause();
    this.maxT = this.tl.end;
    this.creditPractice();
    this.endSheet();
  },
  /* ----- onward journeys: the end-of-song card -----
   * When a song ends a card unspools under the last line, in the lyric column. It gives you a quiet
   * well done, then the way on: from a folder the next song, which starts by itself once a bar has
   * filled for 10 seconds (tap it to go now, or stay here); outside a folder a song you're learning
   * that you haven't played for a while. Play again is always there, and the comfort scale shows
   * where the song stands, to nudge up or down or leave as it is. */
  endCard: null,
  endTimer: 0,
  autoStart: false,
  endSheet() {
    this.clearEnd();
    const song = this.song;
    const box = $('#p-lyrics');
    if (!song || !box) return;
    const card = el('section', 'end-card');
    card.setAttribute('aria-label', 'End of song');
    const f = this.folderId && getFolder(this.folderId);
    const ids = f ? f.songIds.filter((id) => getSong(id)) : [];
    const pos = f ? ids.indexOf(song.id) : -1;
    const next = this.nextSong();
    const title = song.title || 'this one';
    const words = ['no', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine', 'ten'];
    const say = (n) => words[n] || String(n);
    let head = 'Nicely played', sub = 'That\'s ' + title + ', start to finish.';
    if (f && next) {
      const left = ids.length - pos - 1;
      sub = 'That\'s ' + title + ', start to finish. ' + (pos === 0 ? 'One down, ' : say(pos + 1).replace(/^./, (c) => c.toUpperCase()) + ' down, ') + say(left) + ' to go.';
    } else if (f) {
      head = 'That\'s the set';
      sub = ids.length > 1 ? 'All ' + say(ids.length) + ' songs in ' + f.name + ', start to finish. Well played.' : 'Start to finish. Well played.';
    }
    const hd = el('div', 'end-head');
    hd.append(el('h2', null, head), el('p', null, sub));
    card.appendChild(hd);

    // a song tile, like the ones in your lists, as the way on
    const tile = (kicker, s, meta, icon, run) => {
      const b = el('button', 'end-tile');
      b.type = 'button';
      const fills = el('span', 'et-fill');
      fills.setAttribute('aria-hidden', 'true');
      fills.append(el('i', 'et-soft'), el('i', 'et-solid'));
      const m = el('span', 'et-meta');
      m.append(el('small', null, kicker), el('b', null, s.title || 'Untitled'), el('span', 'et-sub', meta));
      const go = el('span', 'et-go');
      go.appendChild(svgIcon(icon));
      b.append(fills, coverNode(s), m, go);
      b.onclick = run;
      return b;
    };
    if (f && next) {
      const t = tile('Up next', next, [next.artist, (ids.indexOf(next.id) + 1) + ' of ' + ids.length].filter(Boolean).join(' · '), 'next', () => this.goNext(true));
      card.appendChild(t);
      // starts by itself after 10 seconds; the bar fills while you wait
      const row = el('div', 'end-auto');
      const note = el('span', 'ea-note', 'Starts in 10');
      const stay = el('button', 'ea-stay', 'Stay here');
      stay.type = 'button';
      row.append(note, stay);
      card.appendChild(row);
      const SECS = 10;
      const t0 = performance.now();
      requestAnimationFrame(() => requestAnimationFrame(() => t.classList.add('counting')));
      t.style.setProperty('--secs', SECS + 's');
      const tick = () => {
        const left = Math.ceil(SECS - (performance.now() - t0) / 1000);
        if (left <= 0) { this.endTimer = 0; this.goNext(true); return; }
        note.textContent = 'Starts in ' + left;
        this.endTimer = setTimeout(tick, 200);
      };
      this.endTimer = setTimeout(tick, 200);
      stay.onclick = () => {
        this.stopEndTimer();
        t.classList.remove('counting');
        t.classList.add('stopped');
        row.remove();
      };
    } else if (f) {
      const b = el('button', 'btn end-back');
      b.type = 'button';
      b.append(svgIcon('folder'), document.createTextNode('Back to ' + f.name));
      b.onclick = () => this.back();
      card.appendChild(b);
    } else {
      const pick = pickBackUp(song.id);
      if (pick) {
        const c = comfortOf(pick);
        card.appendChild(tile('While you\'re warmed up', pick, [pick.artist, c.label, playedAgo(pick)].filter(Boolean).join(' · '), 'play', () => { this.autoStart = false; location.hash = '#/play/' + pick.id; }));
      }
    }
    const again = el('button', 'btn end-again');
    again.type = 'button';
    again.append(svgIcon('restart'), document.createTextNode('Play again'));
    again.onclick = () => { this.restart(); this.play(); };
    card.appendChild(again);
    card.appendChild(comfortScale(song));
    box.appendChild(card);
    this.endCard = card;
    this.manualUntil = 0;
    this.touching = false;
  },
  stopEndTimer() {
    if (this.endTimer) { clearTimeout(this.endTimer); this.endTimer = 0; }
  },
  clearEnd() {
    this.stopEndTimer();
    if (this.endCard) { this.endCard.remove(); this.endCard = null; }
  },

  frame(ts) {
    if (!this.song) return;
    const dt = Math.min(0.25, (ts - this.lastFrame) / 1000);
    this.lastFrame = ts;
    const ci = this.countIn;
    if (this.playing && ci) {
      const idx = Math.floor((ts - ci.start) / ci.beatMs);
      if (idx < ci.beats) {
        // the count-in runs round the play button, one segment per beat
        if (idx !== ci.shown) { ci.shown = idx; paintRing(Math.max(0, idx), ci.beats, ci.beatMs, ci.bpb); }
      } else {
        this.countIn = null;
        paintRing(-1);
        this.lastFrame = ts;
        this.beatFrom = this.t;
        this.startMetro(ci.audioEnd || 0);
      }
    }
    if (this.playing && this.usingVideo()) {
      // follow the video's clock, smoothed between YouTube's time updates
      const vt = this.videoTime();
      let rate = this.song.speed || 1;
      try { rate = this.vp.getPlaybackRate() || rate; } catch { /* fine */ }
      if (vt !== this.vpLast || !this.vpAnchor) { this.vpLast = vt; this.vpAnchor = { t: vt, at: ts }; }
      const t = this.vpState === 1 ? this.vpAnchor.t + ((ts - this.vpAnchor.at) / 1000) * rate : vt;
      // ignore tiny backward wobbles; real seeks are bigger than this
      if (!(t < this.t && this.t - t < 0.25)) this.t = t;
      this.maxT = Math.max(this.maxT, this.t);
      if (!this.playCounted && this.maxT >= this.tl.end * 0.5) {
        this.playCounted = true;
        this.song.plays = (this.song.plays || 0) + 1;
        upsertSong(this.song);
      }
    } else if (this.playing && !this.countIn) {
      this.t += dt * (this.timing ? 1 : this.song.speed || 1);
      this.maxT = Math.max(this.maxT, this.t);
      if (!this.timing && !this.playCounted && this.maxT >= this.tl.end * 0.5) {
        this.playCounted = true;
        this.song.plays = (this.song.plays || 0) + 1;
        upsertSong(this.song);
      }
      if (!this.timing && this.t >= this.tl.end) { this.t = this.tl.end; this.finished(); }
      else if (settings.pauseGaps && !this.timing) {
        const g = this.gaps.find((x) => !x.intro && this.t >= x.start && this.t < x.start + 1.5);
        if (g && g !== this.gapDone) { this.pause(); this.gapHold = g; this.gapDone = g; this.updateUi(); }
      }
    }
    this.paint(dt, ts);
    this.raf = requestAnimationFrame((n) => this.frame(n));
  },
  /* Soft focus band: the current line and its neighbours are lit, fading with distance,
   * so being half a line ahead or behind still reads naturally. */
  paintBand(pos, frac, gap) {
    const box = $('#p-lyrics');
    const band = !this.timing;
    box.classList.toggle('band', band);
    if (!band) return;
    const order = this.tl.order;
    const next = new Map();
    if (pos >= -1 && order.length) {
      const c = pos + frac;
      let nextLine = -1;
      let rise = 0;
      if (gap) {
        // during an instrumental everything rests, and the next line wakes up in the last bar
        nextLine = gap.next;
        const barSec = this.song.bpm ? (60 / this.song.bpm) * (this.song.beatsPerBar || 4) : 4;
        rise = clamp(1 - (gap.end - this.t) / barSec, 0, 1);
      }
      for (let k = Math.max(0, Math.floor(c) - 3); k <= Math.min(order.length - 1, Math.ceil(c) + 3); k++) {
        const d = Math.abs(k + 0.5 - c);
        let f = clamp(1 - (d - 0.5) / 1.4, 0, 1);
        if (gap) f = order[k] === nextLine ? Math.max(f * 0.35, rise) : f * 0.35;
        if (f > 0.01) next.set(order[k], Math.round(f * 50) / 50);
      }
    }
    for (const [i] of this.lit) if (!next.has(i)) this.nodes[i].style.removeProperty('--f');
    for (const [i, f] of next) if (this.lit.get(i) !== f) this.nodes[i].style.setProperty('--f', f);
    this.lit = next;
  },
  /* Visual metronome: a ring round the tempo button, one segment per beat of the bar.
   * The segment for the current beat lights up (coral on the downbeat). It runs whether the
   * click is on or muted, on the same grid the audible click uses. */
  paintDots() {
    const ring = $('#p-beatring');
    const bpm = this.song.bpm;
    const show = !!(bpm && this.playing && !this.countIn && !this.timing && !this.usingVideo() && this.beatFrom != null);
    if (!show) { if (ring.classList.contains('live')) { ring.classList.remove('live'); this.dotBeat = -1; } return; }
    const bpb = this.song.beatsPerBar || 4;
    if (ring.childElementCount !== bpb) { ring.innerHTML = ringArcs(32, 32, 29, bpb, bpb > 6 ? 0.34 : 0.5); this.dotBeat = -1; }
    ring.classList.add('live');
    const beat = Math.floor((this.t - this.beatFrom) / (60 / (bpm * (this.song.speed || 1))) + 0.0001);
    if (beat === this.dotBeat || beat < 0) return;
    this.dotBeat = beat;
    const on = beat % bpb;
    [...ring.children].forEach((d, i) => d.setAttribute('class', i === on ? (i === 0 ? 'on down' : 'on') : ''));
  },
  /* Instrumental and intro cards sit in the lyric column, between the lines they separate.
   * Each shows how long the gap is, bar by bar, and "Back in 4, 3, 2, 1" at the end. */
  buildGapCards() {
    const box = $('#p-lyrics');
    if (!box || !this.nodes) return;
    box.querySelectorAll('.gap-inline').forEach((n) => n.remove());
    const bpm = this.song && this.song.bpm;
    const barSec = bpm ? (60 / bpm) * (this.song.beatsPerBar || 4) : 0;
    for (const g of this.gaps) {
      const len = g.end - g.start;
      const bars = barSec ? Math.max(1, Math.round(len / barSec)) : 0;
      const card = el('div', 'gap-card gap-inline');
      card.dataset.t = g.intro ? 0 : g.start;
      const head = el('div', 'gc-head');
      const ic = el('span', 'gc-ic');
      ic.appendChild(svgIcon('note'));
      head.append(ic, el('span', 'gc-title', g.intro ? 'Intro' : 'Instrumental'), el('span', 'gc-sub'));
      const track = el('div', 'gc-bars');
      const segs = bars && bars <= 16 ? bars : 1;
      for (let i = 0; i < segs; i++) track.appendChild(el('i', null)).appendChild(el('b'));
      card.append(head, track, el('div', 'gc-count'));
      card.setAttribute('role', 'button');
      card.setAttribute('aria-label', (g.intro ? 'Intro' : 'Instrumental') + ', jump here');
      const before = this.nodes[g.next];
      box.insertBefore(card, before || null);
      g.card = card;
      g.bars = bars;
      g.barSec = barSec;
      g.state = '';
    }
    // waypoints for the scroll: every timed line, plus each card at the start of its gap
    const ways = this.tl.order.map((i) => ({ t: this.tl.lines[i].time, node: this.nodes[i] }));
    for (const g of this.gaps) ways.push({ t: g.intro ? 0 : g.start, node: g.card, card: true });
    ways.sort((x, y) => x.t - y.t || (x.card ? -1 : 1));
    this.ways = ways;
    this.layout();
    if (typeof cord !== 'undefined') cord.build();
  },
  paintGap(active) {
    const speed = this.song.speed || 1;
    const bpm = this.song.bpm;
    const bpb = this.song.beatsPerBar || 4;
    for (const g of this.gaps) {
      if (!g.card) continue;
      const card = g.card;
      const sub = card.querySelector('.gc-sub');
      const count = card.querySelector('.gc-count');
      const segsEls = card.querySelectorAll('.gc-bars i b');
      const len = g.end - g.start;
      const lenText = g.bars ? g.bars + (g.bars === 1 ? ' bar' : ' bars') : Math.round(len / speed) + 's';
      if (g !== active) {
        const state = this.t >= g.end ? 'past' : 'future';
        if (g.state === state) continue;
        g.state = state;
        card.classList.remove('now', 'held');
        sub.textContent = lenText;
        count.textContent = '';
        count.classList.remove('go');
        segsEls.forEach((b) => { b.style.transform = 'scaleX(' + (state === 'past' ? 1 : 0) + ')'; });
        continue;
      }
      g.state = 'now';
      card.classList.add('now');
      card.classList.toggle('held', !!this.gapHold);
      const left = Math.max(0, g.end - this.t); // song seconds until the next line
      if (this.gapHold) {
        sub.textContent = lenText;
        count.textContent = 'Paused. Press play to come back in with a count-in.';
        count.classList.remove('go');
      } else {
        const barsLeft = g.barSec ? Math.min(g.bars, Math.ceil(left / g.barSec - 0.001)) : 0;
        sub.textContent = g.bars ? barsLeft + ' of ' + lenText + ' left' : Math.ceil(left / speed) + 's left';
        // the last bar (or last 4 seconds without a tempo) counts you back in
        const beatSec = bpm ? 60 / bpm : 1;
        const beatsLeft = Math.ceil(left / beatSec - 0.001);
        const inLast = bpm ? beatsLeft <= bpb : left / speed <= 4;
        count.textContent = inLast && beatsLeft > 0 ? 'Back in ' + beatsLeft : '';
        count.classList.toggle('go', inLast);
      }
      const done = clamp((this.t - g.start) / len, 0, 1);
      const n = segsEls.length;
      segsEls.forEach((b, i) => { b.style.transform = 'scaleX(' + clamp(done * n - i, 0, 1) + ')'; });
    }
  },
  /* Jump anywhere: the cord, its clues and the cards all come through here. */
  seek(t, live) {
    if (this.timing || !this.tl) return;
    this.clearEnd();
    this.t = clamp(t, 0, this.endT());
    this.manualUntil = 0;
    this.touching = false;
    this.gapHold = null;
    // landing on an instrumental shouldn't immediately pause there
    this.gapDone = this.gaps.find((g) => !g.intro && this.t >= g.start - 0.05 && this.t < g.start + 1.5) || null;
    if (!live && this.usingVideo()) this.videoSeek(this.t);
    if (this.playing && !this.countIn) this.beatFrom = this.t;
  },
  /* Your own knots on the cord, saved with the song. */
  tieKnot(t, label) {
    const s = this.song;
    s.knots = (s.knots || []).filter((k) => Math.abs(k.t - t) > 1);
    s.knots.push({ t: Math.round(t * 10) / 10, label });
    s.knots.sort((x, y) => x.t - y.t);
    upsertSong(s);
    cord.build();
  },
  untieKnots() {
    delete this.song.knots;
    upsertSong(this.song);
    cord.build();
  },
  /* What's happening at a given moment, in a few words (for the cord's bubble and the tie sheet). */
  describe(t) {
    const g = this.gaps.find((x) => t >= x.start && t < x.end);
    if (g) return g.intro ? 'Intro' : 'Instrumental';
    const pos = this.currentIndex(t);
    if (pos < 0) return 'Before the first line';
    const l = this.tl.lines[this.tl.order[pos]];
    return l.kind === 'pause' ? 'Break' : (l.src || '').replace(/\[[^\]]*\]/g, '').replace(/\s+/g, ' ').trim();
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
    const gap = this.timing ? null : this.gaps.find((g) => this.t >= g.start && this.t < g.end) || null;
    this.paintBand(pos, frac, gap);
    const end = this.endT();
    cord.paint(this.t, end);
    $('#p-time').textContent = fmtTime(this.t);
    $('#p-total').textContent = '-' + fmtTime(Math.max(0, end - this.t) / (this.song.speed || 1));
    this.paintGap(this.timing ? null : this.gapHold || gap);
    this.paintDots();

    // auto-scroll (unless the user is scrolling by hand)
    const box = $('#p-lyrics');
    if (!this.nodes.length) return;
    const center = (n) => n.offsetTop + n.offsetHeight / 2;
    let target;
    const ways = this.timing ? null : this.ways;
    if (this.timing) target = center(this.nodes[curLine >= 0 ? curLine : order.length ? order[0] : 0]);
    else if (!ways || !ways.length) target = center(this.nodes[0]);
    else {
      // glide from one line (or card) to the next over the last couple of seconds before it, never in steps
      let k = -1;
      for (let j = 0; j < ways.length; j++) { if (ways[j].t <= this.t + 0.05) k = j; else break; }
      if (k < 0) target = center(ways[0].node);
      else {
        const a = ways[k], b = ways[k + 1];
        if (!b) target = center(a.node);
        else {
          const from = Math.max(a.t + (b.t - a.t) * 0.35, b.t - 2.5);
          const e = clamp((this.t - from) / Math.max(0.001, b.t - from), 0, 1);
          target = center(a.node) + (center(b.node) - center(a.node)) * e * e * (3 - 2 * e);
        }
      }
    }
    // once the song has ended, glide on to the end card
    if (this.endCard && !this.playing) target = this.endCard.offsetTop - 28 + box.clientHeight * ANCHOR;
    target = Math.max(0, target - box.clientHeight * ANCHOR);
    const manual = this.touching || now < this.manualUntil;
    const away = Math.abs(target - box.scrollTop) > 60;
    const back = $('#p-backnow');
    back.hidden = !(manual && away);
    if (!back.hidden) {
      back.querySelector('use').setAttribute('href', target < box.scrollTop ? '#i-up' : '#i-down');
      $('#p-backnow-text').textContent = this.playing ? 'Back to now' : 'Back to ' + fmtTime(this.t);
    }
    if (manual) return;
    const diff = target - box.scrollTop;
    if (Math.abs(diff) > 0.5) box.scrollTop += diff * Math.min(1, dt * 6);
  },

  /* ----- tap to time: build synced lyrics by tapping along ----- */
  startTiming() {
    const parsed = parseLyrics(this.song.lyrics);
    // time against the plain layout so every lyric line is stamped once, in order
    const plain = { synced: false, lines: parsed.lines.filter((l) => l.kind !== 'pause').map((l) => Object.assign({}, l, { time: null })) };
    this.pause();
    this.timing = { next: 0, stamps: [] };
    this.updateUi();
    this.t = 0;
    this.useTimeline(buildTimeline(plain, this.song));
    $('#p-timing').hidden = false;
  },
  timingTap() {
    if (!this.timing) return;
    if (!this.playing) { this.playing = true; this.countIn = null; this.lastFrame = performance.now(); this.updateUi(); }
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
      let parsed = parseLyrics(this.song.lyrics);
      this.synced = parsed.synced;
      this.useTimeline(buildTimeline(parsed, this.song));
      this.updateUi();
    }
  },
};

/* Arcs round a circle, one per beat, with a small gap between them. pathLength=1 lets CSS sweep each one. */
function ringArcs(cx, cy, r, beats, gap) {
  const step = (Math.PI * 2) / beats;
  let h = '';
  for (let k = 0; k < beats; k++) {
    const a0 = -Math.PI / 2 + k * step + gap / 2, a1 = a0 + step - gap;
    h += '<path pathLength="1" d="M' + (cx + r * Math.cos(a0)).toFixed(2) + ' ' + (cy + r * Math.sin(a0)).toFixed(2) + ' A' + r + ' ' + r + ' 0 0 1 ' + (cx + r * Math.cos(a1)).toFixed(2) + ' ' + (cy + r * Math.sin(a1)).toFixed(2) + '"/>';
  }
  return h;
}

/* ---------------- count-in: round the play button ----------------
 * Each beat's segment sweeps full over the length of the beat, a ripple leaves the button,
 * and the beat number pops up in the middle. When the count ends the ring lets go outwards. */
function paintRing(on, beats, beatMs, bpb) {
  const ring = $('#p-ring');
  const wrap = $('#p-playwrap');
  const num = $('#p-cinum');
  if (!ring) return;
  if (on < 0) {
    if (ring.classList.contains('live')) {
      ring.classList.add('go');
      setTimeout(() => ring.classList.remove('live', 'go'), 420);
    }
    wrap.classList.remove('counting');
    num.textContent = '';
    return;
  }
  if (+ring.dataset.beats !== beats || !ring.querySelector('.seg')) {
    const gap = beats > 6 ? 0.2 : 0.3;
    const arcs = ringArcs(46, 46, 42, beats, gap);
    ring.innerHTML = '<g class="track">' + arcs + '</g><g class="seg">' + arcs + '</g>';
    ring.dataset.beats = beats;
  }
  ring.classList.remove('go');
  ring.classList.add('live');
  ring.style.setProperty('--beat', (beatMs || 600) + 'ms');
  [...ring.querySelector('.seg').children].forEach((p, k) => p.setAttribute('class', k < on ? 'done' : k === on ? 'on' + (bpb && k % bpb === 0 ? ' down' : '') : ''));
  wrap.classList.add('counting');
  // musicians count within the bar (1 2 3 4); a plain seconds count-in counts down
  num.textContent = String(bpb && bpb < 100 ? (on % bpb) + 1 : beats - on);
  num.classList.toggle('down', !!(bpb && bpb < 100 && on % bpb === 0));
  for (const n of [num, wrap]) { n.classList.remove('pop'); void n.offsetWidth; n.classList.add('pop'); }
}

/* ---------------- the progress cord: knots, clues, tap to jump, drag to scrub ---------------- */
const cord = {
  W: 300, H: 56, MID: 30, AMP: 6,
  knots: [],
  scrubbing: false,
  down: null,
  snapped: null,
  scrubT: 0,
  end() { return player.tl ? player.endT() : 1; },
  x(t) { return 8 + (this.W - 16) * clamp(t / (this.end() || 1), 0, 1); },
  t(x) { return clamp((x - 8) / (this.W - 16), 0, 1) * this.end(); },
  y(x) { return this.MID + this.AMP * Math.sin((2 * Math.PI * (x - 8)) / (this.W / 2.3)); },
  build() {
    const svg = $('#p-cord');
    if (!svg || !player.song || !player.tl) return;
    this.W = svg.clientWidth || 300;
    svg.setAttribute('viewBox', '0 0 ' + this.W + ' ' + this.H);
    let d = 'M8 ' + this.y(8).toFixed(1);
    for (let x = 12; x < this.W - 8; x += 4) d += ' L' + x + ' ' + this.y(x).toFixed(1);
    d += ' L' + (this.W - 8) + ' ' + this.y(this.W - 8).toFixed(1);
    $('#p-cord-rest').setAttribute('d', d);
    $('#p-cord-played').setAttribute('d', d);
    // knots: instrumentals found in the timed lyrics, plus the ones you tie yourself
    const auto = player.timing ? [] : player.gaps.filter((g) => !g.intro).map((g) => ({ t: g.start, label: 'Instrumental', auto: true }));
    const mine = player.timing ? [] : (player.song.knots || []).map((k) => ({ t: k.t, label: k.label, auto: false }));
    this.knots = auto.concat(mine).filter((k) => k.t < this.end()).sort((a, b) => a.t - b.t);
    const ns = 'http://www.w3.org/2000/svg';
    const kg = $('#p-knots'), tg = $('#p-tethers'), clues = $('#p-clues');
    kg.innerHTML = ''; tg.innerHTML = ''; clues.innerHTML = '';
    const placed = [];
    for (const k of this.knots) {
      const x = this.x(k.t), y = this.y(x);
      const c = document.createElementNS(ns, 'circle');
      c.setAttribute('cx', x); c.setAttribute('cy', y); c.setAttribute('r', 6.5);
      c.setAttribute('class', 'knot' + (k.auto ? '' : ' mine'));
      c.dataset.t = k.t;
      kg.appendChild(c);
      const b = el('button', 'clue' + (k.auto ? '' : ' mine'));
      b.type = 'button';
      b.setAttribute('aria-label', 'Jump to ' + k.label + ' at ' + fmtTime(k.t));
      b.append(svgIcon(k.auto ? 'note' : 'flag'), el('span', null, k.label));
      clues.appendChild(b);
      let w = b.offsetWidth, left = clamp(x - w / 2, 0, Math.max(0, this.W - w));
      // clues that would overlap shrink to just their icon
      if (placed.some((p) => left < p.r + 4 && left + w > p.l - 4)) {
        b.querySelector('span').remove();
        w = b.offsetWidth; left = clamp(x - w / 2, 0, Math.max(0, this.W - w));
      }
      b.style.left = left + 'px';
      placed.push({ l: left, r: left + w });
      const tether = document.createElementNS(ns, 'path');
      tether.setAttribute('d', 'M' + x + ' -4 V' + (y - 9));
      tether.setAttribute('class', 'tether');
      tg.appendChild(tether);
      b.onclick = () => player.seek(k.t);
    }
    $('#p-cordbox').classList.toggle('timing', !!player.timing);
  },
  paint(t, end) {
    const x = this.x(this.scrubbing ? this.scrubT : t), y = this.y(x);
    $('#p-cord-cliprect').setAttribute('width', x);
    for (const id of ['#p-cord-bead', '#p-cord-halo']) { const c = $(id); c.setAttribute('cx', x); c.setAttribute('cy', y); }
    $('#p-cord-bead').setAttribute('r', this.scrubbing ? 13 : 9);
    const pt = this.scrubbing ? this.scrubT : t;
    for (const c of $('#p-knots').children) c.classList.toggle('passed', +c.dataset.t <= pt);
    const svg = $('#p-cord');
    svg.setAttribute('aria-valuenow', Math.round((end ? pt / end : 0) * 100));
    svg.setAttribute('aria-valuetext', fmtTime(pt) + ' of ' + fmtTime(end));
  },
  bubble(t) {
    const bub = $('#p-cord-bubble');
    $('#p-bub-time').textContent = (this.snapped ? this.snapped.label + ' · ' : '') + fmtTime(t);
    $('#p-bub-text').textContent = this.snapped ? '' : player.describe(t);
    bub.hidden = false;
    const w = bub.offsetWidth;
    bub.style.left = clamp(this.x(t), w / 2 + 2, this.W - w / 2 - 2) + 'px';
  },
};
{
  const svg = $('#p-cord');
  svg.addEventListener('pointerdown', (e) => {
    if (player.timing) return;
    cord.down = { x: e.clientX - svg.getBoundingClientRect().left };
    try { svg.setPointerCapture(e.pointerId); } catch { /* fine */ }
  });
  svg.addEventListener('pointermove', (e) => {
    if (!cord.down) return;
    const x = e.clientX - svg.getBoundingClientRect().left;
    // dragging starts only once the finger moves, so a tap on bare cord does nothing
    if (!cord.scrubbing && Math.abs(x - cord.down.x) > 6) {
      cord.scrubbing = true;
      cord.scrubT = player.t;
      $('#p-cordbox').classList.add('scrubbing');
    }
    if (!cord.scrubbing) return;
    let t = cord.t(x), snap = null;
    for (const k of cord.knots) if (Math.abs(cord.x(k.t) - x) < 16) snap = k;
    if (snap) { t = snap.t; if (cord.snapped !== snap && navigator.vibrate) { try { navigator.vibrate(12); } catch { /* fine */ } } }
    cord.snapped = snap;
    cord.scrubT = t;
    player.seek(t, true); // the lyrics follow your finger; a video catches up when you let go
    cord.bubble(t);
  });
  const end = () => {
    if (!cord.down) return;
    cord.down = null;
    if (!cord.scrubbing) return;
    cord.scrubbing = false;
    cord.snapped = null;
    $('#p-cordbox').classList.remove('scrubbing');
    $('#p-cord-bubble').hidden = true;
    player.seek(cord.scrubT);
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);
  svg.addEventListener('lostpointercapture', end);
  svg.addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    player.seek(player.t + (e.key === 'ArrowRight' ? 5 : -5));
  });
}

/* Tie a knot where you are, with an optional name. */
function openTieSheet() {
  const song = player.song;
  if (!song || player.timing) return;
  const t = player.t;
  const body = el('div', 'stack');
  body.appendChild(el('div', 'muted', player.describe(t)));
  const row = el('div', 'sheet-links');
  for (const name of ['Knot', 'Chorus', 'Verse', 'Bridge', 'Solo']) {
    const b = el('button', 'btn small' + (name === 'Knot' ? ' primary' : ''), name === 'Knot' ? 'Just a knot' : name);
    b.type = 'button';
    b.onclick = () => { player.tieKnot(t, name); closeModal(); toast(name + ' tied at ' + fmtTime(t)); };
    row.appendChild(b);
  }
  body.appendChild(row);
  body.appendChild(el('div', 'muted small', 'Knots sit on the cord under the lyrics. Tap one to jump there.'));
  openModal('Tie a knot at ' + fmtTime(t), body);
}

/* player controls */
$('#p-back').onclick = () => player.back();
$('#p-play').onclick = () => player.toggle();
$('#p-restart').onclick = () => player.restart();
const changeFont = (d) => { settings.fontSize = clamp(settings.fontSize + d, 18, 56); saveSettings(); requestAnimationFrame(() => player.layout()); };
$('#p-edit').onclick = () => { if (player.song) location.hash = '#/edit/' + player.song.id; };
$('#p-speed-note').onclick = () => player.setSpeed(1);

function toggleMetronome() {
  if (!player.song.bpm) { openTempoSheet(); return; }
  if (player.usingVideo()) { toast('The click is off while a YouTube track plays. The recording keeps time.'); return; }
  settings.metroOn = !settings.metroOn;
  saveSettings();
  metro.ensure(); // unlock audio on this tap
  if (settings.metroOn && player.playing && !player.countIn) player.startMetro();
  else if (!settings.metroOn) metro.stop();
  player.updateUi();
}
$('#p-metro').onclick = toggleMetronome;
$('#p-tempo-btn').onclick = () => openTempoSheet();

/* Tap tempo: average the gaps between the last few taps. */
function makeTapper(onBpm, onStep) {
  let taps = [];
  return () => {
    const now = performance.now();
    if (taps.length && now - taps[taps.length - 1] > 2000) taps = [];
    taps.push(now);
    taps = taps.slice(-8);
    if (taps.length >= 4) {
      const gaps = taps.slice(1).map((t, i) => t - taps[i]);
      onBpm(Math.round(60000 / (gaps.reduce((x, y) => x + y, 0) / gaps.length)));
    } else onStep(4 - taps.length);
  };
}
const SIGS = { 2: '2/4', 3: '3/4', 4: '4/4', 5: '5/4', 6: '6/8', 7: '7/8' };
function timeSig(bpb) { return SIGS[bpb || 4] || (bpb + '/4'); }

/* A tempo found online is sometimes counted at double or half the speed people feel it. */
function tempoAlt(bpm) {
  if (bpm >= 150) return Math.round(bpm / 2);
  if (bpm <= 75) return bpm * 2;
  return null;
}
/* Compare a tapped tempo with a suggestion: same, half, double or just different. */
function compareTap(tapped, suggested) {
  const near = (a, b) => Math.abs(a - b) / b <= 0.05;
  if (near(tapped, suggested)) return 'same';
  if (near(tapped, suggested / 2)) return 'half';
  if (near(tapped, suggested * 2)) return 'double';
  return 'other';
}

/* The song's tempo: the main way to set it. Tapping comes first; typing and nudging are there too.
 * A tempo found online is shown as a suggestion to check against a few taps. */
function openTempoSheet() {
  const song = player.song;
  if (!song) return;
  let bpm = song.bpm || null;
  let bpb = song.beatsPerBar || 4;
  let source = song.bpmSource || 'manual';
  const suggestion = song.bpm && song.bpmSource === 'deezer' ? song.bpm : null;
  const body = el('div', 'stack tempo-sheet');
  body.appendChild(el('p', 'muted small', bpm
    ? 'The tempo of the original recording. The count-in and click follow it, and practice speed is applied on top.'
    : 'Play the recording and tap along on the beat. Four taps is enough, more makes it steadier.'));

  // suggestion card: found online, not yet checked
  let card = null;
  let cardMsg = null;
  let cardActions = null;
  if (suggestion) {
    card = el('div', 'suggest-card');
    card.appendChild(el('div', 'suggest-title', 'Found online: ' + suggestion + ' BPM. Sounds right?'));
    cardMsg = el('p', 'muted small', 'Tap along with the recording below to check it.');
    card.appendChild(cardMsg);
    cardActions = el('div', 'row gap wrap');
    card.appendChild(cardActions);
    body.appendChild(card);
  }
  const setCard = (msg, actions) => {
    if (!card) return;
    cardMsg.textContent = msg;
    cardActions.innerHTML = '';
    for (const a of actions) {
      const b = el('button', 'btn small' + (a.primary ? ' primary' : ''), a.label);
      b.type = 'button';
      b.onclick = a.run;
      cardActions.appendChild(b);
    }
  };
  const confirmAction = { label: 'Sounds right', primary: true, run: () => { bpm = suggestion; source = 'confirmed'; sync(); setCard('Confirmed. Save to keep it.', []); card.classList.add('ok'); } };
  const resetCard = () => {
    const alt = tempoAlt(suggestion);
    const acts = [confirmAction];
    if (alt) acts.push({ label: (alt < suggestion ? 'Use half: ' : 'Use double: ') + alt, run: () => { bpm = alt; source = 'manual'; sync(); setCard('Using ' + alt + ' BPM. Save to keep it.', []); } });
    setCard(alt
      ? (alt < suggestion ? 'That\'s quick. Online tempos are sometimes counted double, so ' + alt + ' may be what you feel.' : 'That\'s slow. Online tempos are sometimes counted half, so ' + alt + ' may be what you feel.') + ' Tap along below to check.'
      : 'Tap along with the recording below to check it.', acts);
  };
  if (suggestion) resetCard();

  const pad = el('button', 'tap-pad' + (bpm ? '' : ' lead'), 'Tap here on the beat');
  pad.type = 'button';
  const big = el('div', 'big-stepper');
  const down = iconBtn('minus', 'Slower');
  const up = iconBtn('plus', 'Faster');
  const input = el('input', 'big-bpm');
  input.inputMode = 'numeric';
  input.placeholder = '--';
  input.setAttribute('aria-label', 'Beats per minute');
  const unit = el('span', 'big-unit', 'BPM');
  const mid = el('div', 'big-mid');
  mid.append(input, unit);
  // The dial: turn the loop of cord to set the tempo. The bead pulses on every beat, so you can check it against the recording.
  const DMIN = 40, DMAX = 240, R = 84, C = 94;
  const ns = 'http://www.w3.org/2000/svg';
  const dial = document.createElementNS(ns, 'svg');
  dial.setAttribute('class', 'dial');
  dial.setAttribute('viewBox', '0 0 188 188');
  dial.setAttribute('role', 'slider');
  dial.setAttribute('tabindex', '0');
  dial.setAttribute('aria-label', 'Tempo dial. Turn it, or use the arrow keys.');
  dial.setAttribute('aria-valuemin', '30');
  dial.setAttribute('aria-valuemax', '300');
  const angOf = (v) => 135 + (270 * (clamp(v, DMIN, DMAX) - DMIN)) / (DMAX - DMIN);
  const pt = (a) => [C + R * Math.cos((a * Math.PI) / 180), C + R * Math.sin((a * Math.PI) / 180)];
  const arc = (a0, a1) => { const [x0, y0] = pt(a0), [x1, y1] = pt(a1); return 'M' + x0.toFixed(2) + ' ' + y0.toFixed(2) + ' A' + R + ' ' + R + ' 0 ' + (a1 - a0 > 180 ? 1 : 0) + ' 1 ' + x1.toFixed(2) + ' ' + y1.toFixed(2); };
  dial.innerHTML = '<path class="d-track" d="' + arc(135, 405) + '"/><path class="d-fill"/><circle class="d-hit" cx="94" cy="94" r="84"/><circle class="d-bead" r="11"/>';
  const fillP = dial.querySelector('.d-fill'), beadC = dial.querySelector('.d-bead');
  const drawDial = () => {
    const a = angOf(bpm || 100);
    fillP.setAttribute('d', bpm ? arc(135, Math.max(135.01, a)) : '');
    const [x, y] = pt(a);
    beadC.setAttribute('cx', x.toFixed(2));
    beadC.setAttribute('cy', y.toFixed(2));
    beadC.classList.toggle('none', !bpm);
    dial.setAttribute('aria-valuenow', String(bpm || 0));
    dial.setAttribute('aria-valuetext', bpm ? bpm + ' BPM' : 'No tempo yet');
  };
  let lastTick = 0;
  const fromPointer = (e) => {
    const r = dial.getBoundingClientRect();
    const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
    let a = (Math.atan2(dy, dx) * 180) / Math.PI; // -180..180, 0 = right, 90 = down
    if (a < 0) a += 360;
    if (a < 45) a += 360; // the dial runs from 135deg (bottom left) round to 405deg (bottom right)
    else if (a <= 135) a = a < 90 ? 405 : 135; // in the gap at the bottom: whichever end is nearer
    const v = Math.round(DMIN + ((a - 135) / 270) * (DMAX - DMIN));
    if (v === bpm) return;
    bpm = v;
    source = 'manual';
    pad.textContent = 'Tap here on the beat';
    if (Math.abs(v - lastTick) >= 5 && navigator.vibrate) { lastTick = v; try { navigator.vibrate(6); } catch { /* fine */ } }
    sync();
  };
  let turning = false;
  dial.addEventListener('pointerdown', (e) => {
    const r = dial.getBoundingClientRect();
    const dist = Math.hypot(e.clientX - (r.left + r.width / 2), e.clientY - (r.top + r.height / 2));
    if (dist < r.width * 0.3) return; // the middle is the number, which you can type into
    e.preventDefault();
    turning = true;
    dial.classList.add('turning');
    try { dial.setPointerCapture(e.pointerId); } catch { /* fine */ }
    fromPointer(e);
  });
  dial.addEventListener('pointermove', (e) => { if (turning) fromPointer(e); });
  const stopTurn = () => { turning = false; dial.classList.remove('turning'); };
  dial.addEventListener('pointerup', stopTurn);
  dial.addEventListener('pointercancel', stopTurn);
  dial.addEventListener('keydown', (e) => {
    const d = { ArrowUp: 1, ArrowRight: 1, ArrowDown: -1, ArrowLeft: -1, PageUp: 10, PageDown: -10 }[e.key];
    if (!d) return;
    e.preventDefault();
    nudge(d);
  });
  mid.prepend(dial);
  big.append(down, mid, up);
  // the bead pulses on each beat of the tempo shown
  let beatRaf = 0, beatFrom = performance.now(), shownBpm = null;
  const beatLoop = (now) => {
    if (!dial.isConnected) return;
    if (bpm !== shownBpm) { shownBpm = bpm; beatFrom = now; }
    if (bpm && !turning) {
      const phase = ((now - beatFrom) / (60000 / bpm)) % 1;
      const k = Math.exp(-phase * 7);
      beadC.setAttribute('r', (11 + 5 * k).toFixed(2));
      dial.style.setProperty('--beat', k.toFixed(3));
    } else beadC.setAttribute('r', turning ? '15' : '11');
    beatRaf = requestAnimationFrame(beatLoop);
  };
  beatRaf = requestAnimationFrame(beatLoop);
  // with no tempo yet, tapping is the first thing you see
  if (bpm) body.append(big, pad); else body.append(pad, big);
  const sync = () => { input.value = bpm || ''; drawDial(); };
  sync();
  const nudge = (d) => { bpm = clamp((bpm || 100) + d, 30, 300); source = 'manual'; sync(); };
  down.onclick = () => nudge(-1);
  up.onclick = () => nudge(1);
  input.addEventListener('input', () => { const n = parseInt(input.value, 10); bpm = n >= 30 && n <= 300 ? n : null; source = 'manual'; pad.textContent = 'Tap here on the beat'; drawDial(); });
  input.addEventListener('focus', () => input.select());
  const tap = makeTapper((n) => {
    if (!suggestion) { bpm = n; source = 'tap'; sync(); pad.textContent = n + ' BPM · keep tapping to refine'; return; }
    const how = compareTap(n, suggestion);
    pad.textContent = 'You tapped ' + n + ' BPM · keep tapping to refine';
    if (how === 'same') { bpm = suggestion; source = 'confirmed'; sync(); card.classList.add('ok'); setCard('Matches what you tapped. Save to keep it.', []); return; }
    card.classList.remove('ok');
    bpm = n; source = 'tap'; sync();
    const useSugg = { label: 'Keep ' + suggestion, run: () => { bpm = suggestion; source = 'deezer'; sync(); resetCard(); } };
    if (how === 'half') setCard('You\'re feeling it at half time. Using your ' + n + ' BPM, which keeps the count-in at the pace you play.', [useSugg]);
    else if (how === 'double') setCard('You\'re feeling it at double time. Using your ' + n + ' BPM.', [useSugg]);
    else setCard('That\'s different from the ' + suggestion + ' found online, so your tapped tempo will be used.', [useSugg]);
  }, (left) => { pad.textContent = 'Keep going… ' + left + ' more'; });
  pad.onpointerdown = (e) => { e.preventDefault(); metro.ensure(); tap(); pad.classList.remove('hit'); void pad.offsetWidth; pad.classList.add('hit'); };
  body.appendChild(el('div', 'field-label', 'Time signature'));
  const seg = el('div', 'segmented');
  for (const [v, label] of Object.entries(SIGS)) {
    const b = el('button', +v === bpb ? 'active' : '', label);
    b.type = 'button';
    b.onclick = () => { bpb = +v; seg.querySelectorAll('button').forEach((x) => x.classList.toggle('active', x === b)); };
    seg.appendChild(b);
  }
  body.appendChild(seg);
  openModal('Song tempo', body, [
    { label: 'Cancel' },
    { label: 'Save', primary: true, run: () => {
      song.beatsPerBar = bpb;
      if (bpm) player.setBpm(bpm, bpm === song.bpm && source === 'manual' ? (song.bpmSource || 'manual') : source);
      else { upsertSong(song); player.updateUi(); }
      if (bpm && !settings.metroOn) toast('Tempo saved. The speaker button turns the click on.');
    } },
  ]);
}

/* Everything else for playback lives in one sheet, so the toolbar stays simple. */
function openPlaybackSheet() {
  const song = player.song;
  if (!song) return;
  const body = el('div', 'stack');
  // play along with YouTube
  body.appendChild(el('div', 'field-label', 'Play along with YouTube'));
  const ytRow = el('div', 'sheet-links');
  for (const k of ['full', 'backing']) {
    const has = song.yt && song.yt[k];
    const b = el('button', 'btn small');
    b.type = 'button';
    b.appendChild(svgIcon(has ? 'check' : 'plus'));
    b.appendChild(document.createTextNode(has ? YT_KINDS[k] + ' added' : 'Add ' + YT_KINDS[k].toLowerCase()));
    b.onclick = () => {
      if (!has) { openTrackSheet(song, k); return; }
      closeModal();
      song.ytUse = k;
      upsertSong(song);
      player.mountVideo();
      player.updateUi();
    };
    ytRow.appendChild(b);
  }
  body.appendChild(ytRow);
  // practice speed (deliberately tucked away: real speed is the default)
  body.appendChild(el('div', 'field-label', 'Practice speed'));
  const sp = el('div', 'row gap');
  const minus = el('button', 'btn small', '−');
  const val = el('output', 'strong speed-val');
  const plus = el('button', 'btn small', '+');
  const reset = el('button', 'btn small', 'Real speed');
  const showSpeed = () => {
    const pct = Math.round((song.speed || 1) * 100);
    val.textContent = pct + '%' + (song.bpm ? ' · ' + player.playingBpm() + ' BPM' : '');
    reset.disabled = pct === 100;
  };
  minus.onclick = () => { player.setSpeed((song.speed || 1) - 0.05); showSpeed(); };
  plus.onclick = () => { player.setSpeed((song.speed || 1) + 0.05); showSpeed(); };
  reset.onclick = () => { player.setSpeed(1); showSpeed(); };
  sp.append(minus, val, plus, reset);
  showSpeed();
  body.appendChild(sp);
  body.appendChild(el('div', 'muted small', 'Slows down or speeds up the lyrics, count-in and click together.'));
  // intro
  if (player.synced && player.introSkipTo() > 0) {
    const lab = el('label', 'setting check');
    const cb = el('input');
    cb.type = 'checkbox'; cb.setAttribute('role', 'switch');
    cb.checked = !!song.skipIntro;
    cb.onchange = () => { song.skipIntro = cb.checked; upsertSong(song); };
    lab.append(cb, el('span', null, 'Skip the intro'));
    body.appendChild(lab);
  }
  if (player.gaps.some((g) => !g.intro)) {
    const lab = el('label', 'setting check');
    const cb = el('input');
    cb.type = 'checkbox'; cb.setAttribute('role', 'switch');
    cb.checked = !!settings.pauseGaps;
    cb.onchange = () => { settings.pauseGaps = cb.checked; saveSettings(); };
    lab.append(cb, el('span', null, 'Pause at instrumentals'));
    body.appendChild(lab);
  }
  // display
  body.appendChild(el('div', 'field-label', 'Display'));
  const disp = el('div', 'sheet-links');
  const mk = (label, fn, icon) => { const b = el('button', 'btn small'); b.type = 'button'; if (icon) b.appendChild(svgIcon(icon)); b.appendChild(document.createTextNode(label)); b.onclick = fn; disp.appendChild(b); return b; };
  mk('Smaller text', () => changeFont(-2));
  mk('Bigger text', () => changeFont(2));
  if (player.hasChords) mk(settings.showChords ? 'Hide chords' : 'Show chords', () => { settings.showChords = !settings.showChords; saveSettings(); $('#p-lyrics').classList.toggle('no-chords', !settings.showChords); player.layout(); closeModal(); });
  body.appendChild(disp);
  body.appendChild(el('div', 'field-label', 'Song'));
  const acts = el('div', 'sheet-links');
  const mk2 = (label, icon, fn) => { const b = el('button', 'btn small'); b.type = 'button'; if (icon) b.appendChild(svgIcon(icon)); b.appendChild(document.createTextNode(label)); b.onclick = () => { closeModal(); fn(); }; acts.appendChild(b); };
  mk2('Start again', 'restart', () => player.restart());
  if (!player.timing) mk2('Tie a knot here', 'flag', () => openTieSheet());
  if (song.knots && song.knots.length) mk2('Untie my knots', null, () => { player.untieKnots(); toast('Your knots are untied'); });
  mk2('Tap to time', 'timer', () => player.startTiming());
  if (player.nextSong()) mk2('Next in folder', 'next', () => player.goNext());
  mk2('Edit song', 'edit', () => (location.hash = '#/edit/' + song.id));
  body.appendChild(acts);
  body.appendChild(el('div', 'muted small', player.synced ? 'Synced: lines follow the timings of the original recording.' : 'Paced: lines are spread across the song length. Use Tap to time for exact timings.'));
  openModal('Playback', body);
}
$('#p-more').onclick = openPlaybackSheet;
$('#p-video-more').onclick = () => { if (player.song) openTrackOptions(player.song); };
$('#t-next').onclick = () => player.timingTap();
$('#t-cancel').onclick = () => player.stopTiming();
window.addEventListener('resize', () => { if (player.song) { player.layout(); cord.build(); } });

const lyr = $('#p-lyrics');
lyr.addEventListener('click', (e) => {
  const card = e.target.closest('.gap-inline');
  if (card) { player.seek(+card.dataset.t); return; }
  const line = e.target.closest('.line');
  if (line) player.seekToLine(+line.dataset.i);
});
$('#p-backnow').onclick = () => { player.touching = false; player.manualUntil = 0; };
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
if (document.fonts) document.fonts.ready.then(() => { if (player.song) { player.layout(); cord.build(); } });
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  navigator.serviceWorker.register('sw.js', { updateViaCache: 'none' }).then((r) => r.update()).catch(() => {});
}
