'use strict';
/* global SKINS, INK, MAPS, rentTable, rentAt, houseCost, AIRPORT_RENT, AIRPORT_CAPS, airportVisitRent, COMPANY_MULT, Dice */

const $ = (s, el = document) => el.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const rnd = (n) => Math.floor(Math.random() * n);
const store = {
  get(k) { try { return localStorage.getItem(k); } catch { return null; } },
  set(k, v) { try { localStorage.setItem(k, v); } catch { /* private mode */ } },
};
const COLORS = ['#c0dc52', '#ffc83d', '#ff8438', '#c8474b', '#5a9be0', '#7fe3f4', '#1a9a8a', '#6fe85a', '#a37563', '#c940a8', '#ff7ca0', '#8456dc'];
const CC_COLOR = { br: '#46b04a', il: '#4f8ff0', it: '#2e9e5b', de: '#e0b020', cn: '#e03c31', fr: '#3a5fcf', gb: '#b23a6f', us: '#d04a4a', in: '#ff9933', jp: '#f06292', ca: '#ff5252', tr: '#e57335', ro: '#fbc02d', ie: '#43a047' };
const BOARD = 780;

const roomMatch = location.pathname.match(/^\/room\/([a-z0-9]{4,8})\/?$/);
const ROOM = roomMatch && roomMatch[1];
// ?seat=2 gives a tab its own seat, so one browser can hold several players (local testing).
const SEAT = new URLSearchParams(location.search).get('seat');
const TOKEN_KEY = SEAT ? `tok:${ROOM}:${SEAT}` : `tok:${ROOM}`;

// ---------- sound ----------
let actx = null;
const sndFiles = {};
const muted = () => store.get('muted') === '1';
function ac() { if (!actx) actx = new (window.AudioContext || window.webkitAudioContext)(); return actx; }
function tone(freq, at = 0, dur = 0.1, type = 'sine', vol = 0.08, slide = 0) {
  const c = ac(), o = c.createOscillator(), g = c.createGain(), t = c.currentTime + at;
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
  g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.008); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(c.destination); o.start(t); o.stop(t + dur + 0.02);
}
function noise(at = 0, dur = 0.05, vol = 0.12, hz = 2400) {
  const c = ac(), len = Math.ceil(c.sampleRate * dur), buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
  src.buffer = buf; f.type = 'bandpass'; f.frequency.value = hz; f.Q.value = 1.2; g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination); src.start(c.currentTime + at);
}
// A mallet-like note: fundamental plus two quiet overtones with a fast decay.
function pluck(freq, at = 0, dur = 0.35, vol = 0.09) {
  tone(freq, at, dur, 'sine', vol);
  tone(freq * 2, at, dur * 0.5, 'sine', vol * 0.3);
  tone(freq * 4, at, dur * 0.18, 'sine', vol * 0.12);
}
// A short wooden knock: a pitched thump with a tiny click on top.
function knock(at = 0, pitch = 220, vol = 0.14) {
  tone(pitch, at, 0.07, 'sine', vol, -pitch * 0.45);
  noise(at, 0.012, vol * 0.7, 3200);
}
const SYNTH = {
  roll() { [0, 0.07, 0.13, 0.21, 0.28, 0.39, 0.52, 0.7, 0.92].forEach((t, i) => knock(t, 260 + rnd(240), 0.15 - i * 0.012)); },
  hop() { knock(0, 330, 0.07); },
  buy() { pluck(659, 0, 0.3); pluck(988, 0.09, 0.45); pluck(1319, 0.18, 0.5, 0.05); },
  pay() { pluck(392, 0, 0.25, 0.08); pluck(294, 0.1, 0.4, 0.08); },
  gain() { pluck(1047, 0, 0.2, 0.06); pluck(1568, 0.07, 0.4, 0.06); },
  turn() { pluck(523, 0, 0.3); pluck(659, 0.11, 0.3); pluck(784, 0.22, 0.55); },
  card() { noise(0, 0.12, 0.05, 5200); pluck(880, 0.06, 0.25, 0.06); pluck(1175, 0.14, 0.4, 0.06); },
  jail() { knock(0, 150, 0.2); pluck(196, 0.05, 0.5, 0.09); pluck(185, 0.3, 0.7, 0.09); },
  build() { knock(0, 300, 0.16); knock(0.13, 300, 0.16); pluck(784, 0.26, 0.4, 0.06); },
  start() { [262, 330, 392, 523].forEach((f, i) => pluck(f, i * 0.1, 0.5)); },
  win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => pluck(f, i * 0.13, 0.6, 0.1)); },
  bankrupt() { [392, 330, 262, 196].forEach((f, i) => pluck(f, i * 0.2, 0.7, 0.08)); },
  chat() { pluck(1319, 0, 0.18, 0.04); },
  trade() { pluck(698, 0, 0.25, 0.07); pluck(880, 0.1, 0.4, 0.07); },
  bid() { knock(0, 520, 0.09); },
  mortgage() { pluck(330, 0, 0.3, 0.07); pluck(247, 0.12, 0.45, 0.07); },
  unmortgage() { pluck(247, 0, 0.3, 0.07); pluck(330, 0.12, 0.45, 0.07); },
  set() { [523, 659, 784, 1047, 1319].forEach((f, i) => pluck(f, i * 0.08, 0.5, 0.09)); pluck(1568, 0.45, 0.8, 0.07); },
  break() { noise(0, 0.09, 0.2, 1400); knock(0.02, 140, 0.24); pluck(311, 0.08, 0.45, 0.1); pluck(220, 0.22, 0.7, 0.1); },
};
function sfx(name) {
  if (muted()) return;
  try {
    const a = sndFiles[name];
    if (a) { const c = a.cloneNode(); c.volume = 0.6; c.play().catch(() => {}); return; }
    if (SYNTH[name]) SYNTH[name]();
  } catch { /* audio not available */ }
}
fetch('/api/sounds').then((r) => r.json()).then((list) => {
  for (const f of list) { const a = new Audio(`/sounds/${f}`); a.preload = 'auto'; sndFiles[f.replace(/\.\w+$/, '')] = a; }
}).catch(() => {});
function paintMute() { for (const b of document.querySelectorAll('[data-act=mute]')) b.innerHTML = muted() ? I.mute : I.volume; }

// ---------- icons (simple line art, drawn for this project) ----------
const ic = (d, fill) => `<svg class="ic" viewBox="0 0 24 24" ${fill ? 'fill="currentColor"' : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${d}</svg>`;
const DOT = (x, y) => `<circle cx="${x}" cy="${y}" r="1.1" fill="currentColor" stroke="none"/>`;
const I = {
  play: ic('<path d="M7 4v16l13-8z"/>', 1),
  check: ic('<path d="M4 12l5 5L20 6"/>'),
  cart: ic('<path d="M3 4h2l2.5 11h10L20 7H7"/><circle cx="9" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/>'),
  dice: ic(`<rect x="3" y="3" width="18" height="18" rx="4"/>${DOT(8.5, 8.5)}${DOT(12, 12)}${DOT(15.5, 15.5)}`),
  crown: ic('<path d="M3 18h18l1.5-10-5.5 4L12 5l-5 7-5.5-4z"/>', 1),
  bot: ic(`<rect x="4" y="8" width="16" height="11" rx="3"/><path d="M12 8V4.5"/><circle cx="12" cy="3.5" r="1"/>${DOT(9, 13.5)}${DOT(15, 13.5)}`),
  flag: ic('<path d="M5 3h2v18H5z"/><path d="M7 4h12l-3 4.5 3 4.5H7z"/>', 1),
  plus: ic('<circle cx="12" cy="12" r="9"/><path d="M12 8v8M8 12h8"/>'),
  copy: ic('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
  send: ic('<path d="M3 11l18-8-8 18-2-7z"/>', 1),
  key: ic('<circle cx="8" cy="15" r="4"/><path d="M11 12l9-9M17 6l3 3M14 9l2 2"/>'),
  gavel: ic('<path d="M13 4l7 7M10 7l7 7M11.5 5.5l-4 4M18.5 12.5l-4 4M9.5 11.5L3 18l2 2 6.5-6.5"/>'),
  lock: ic('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>'),
  unlock: ic('<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 7.5-2"/>'),
  up: ic('<path d="M12 19V5M6 11l6-6 6 6"/>'),
  down: ic('<path d="M12 5v14M6 13l6 6 6-6"/>'),
  trash: ic('<path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/>'),
  bank: ic('<path d="M3 10l9-6 9 6M5 10v8M9.5 10v8M14.5 10v8M19 10v8M3 20h18"/>'),
  volume: ic('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M16.5 9a4 4 0 0 1 0 6M19 6.5a8 8 0 0 1 0 11"/>'),
  mute: ic('<path d="M4 9v6h4l5 4V5L8 9z"/><path d="M17 9.5l5 5M22 9.5l-5 5"/>'),
  palette: ic(`<circle cx="12" cy="12" r="9"/>${DOT(8.5, 10)}${DOT(12, 7.5)}${DOT(15.5, 10)}`),
  arrow: ic('<path d="M5 12h14M13 6l6 6-6 6"/>'),
  x: ic('<path d="M6 6l12 12M18 6L6 18"/>'),
  ticket: ic('<path d="M3 9a3 3 0 0 0 0 6v3h18v-3a3 3 0 0 1 0-6V6H3z"/>'),
  swap: ic('<path d="M4 8h15l-3-3M20 16H5l3 3"/>'),
  back: ic('<path d="M4 12a8 8 0 1 0 3-6.2M4 4v5h5"/>'),
  chat: ic('<path d="M4 5h16v11H9l-5 4z"/>'),
};

// ---------- art ----------
// Appearances are defined in skins.js and identified by their colour. A colour with no appearance
// (older rooms) draws as a plain token.
const EYES = '<ellipse cx="59" cy="43" rx="13" ry="15" fill="#fff"/><ellipse cx="85" cy="45" rx="11" ry="13" fill="#fff"/>'
  + `<circle cx="64" cy="47" r="6.5" fill="${INK}"/><circle cx="89" cy="48" r="5.5" fill="${INK}"/>`;
const SKIN = Object.fromEntries(SKINS.map((k) => [k.color, k]));
let clipSeq = 0;
function tokenSVG(color) {
  const k = SKIN[color] || {}, id = `tc${++clipSeq}`;
  // the "mid" layer (stripes, bellies, masks) is clipped to the round body
  const mid = k.mid ? `<clipPath id="${id}"><circle cx="50" cy="50" r="45"/></clipPath><g clip-path="url(#${id})">${k.mid}</g>` : '';
  return `<svg class="tok" viewBox="0 0 100 100">${k.back || ''}<path fill="${color}" d="M50 5C76 5 95 24 95 50S76 95 50 95 5 76 5 50 24 5 50 5z"/>`
    + '<path fill="rgba(0,0,0,.2)" d="M7 58c7 22 24 37 43 37s36-15 43-37C83 74 68 82 50 82S17 74 7 58z"/>'
    + `${mid}${k.eyes || EYES}${k.front || ''}</svg>`;
}
const CHEST = '<svg viewBox="0 0 64 64"><defs><linearGradient id="cg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#ffb23e"/><stop offset="1" stop-color="#e2741a"/></linearGradient></defs>'
  + '<path d="M8 28c0-10 8-16 24-16s24 6 24 16v4H8z" fill="#f59a23"/><rect x="8" y="30" width="48" height="24" rx="4" fill="url(#cg)"/>'
  + '<rect x="8" y="28" width="48" height="6" fill="#b85a10"/><rect x="14" y="13" width="5" height="41" fill="#c96a14" opacity=".7"/><rect x="45" y="13" width="5" height="41" fill="#c96a14" opacity=".7"/>'
  + '<rect x="26" y="26" width="12" height="14" rx="3" fill="#ffe08a"/><circle cx="32" cy="32" r="2.2" fill="#8a4a0c"/><rect x="31" y="32" width="2" height="5" fill="#8a4a0c"/></svg>';
const PIPS = { 1: [5], 2: [1, 9], 3: [1, 5, 9], 4: [1, 3, 7, 9], 5: [1, 3, 5, 7, 9], 6: [1, 3, 4, 6, 7, 9] };
const faceHTML = (n) => Array.from({ length: 9 }, (_, i) => `<i class="${PIPS[n].includes(i + 1) ? 'on' : ''}"></i>`).join('');
for (const c of document.querySelectorAll('.cube')) c.innerHTML = `<div class="face">${faceHTML(5)}</div>`;

function toast(msg) {
  const d = document.createElement('div');
  d.className = 'toast'; d.textContent = msg;
  $('#toasts').append(d);
  setTimeout(() => d.remove(), 3300);
}

// =====================================================================
// Home
// =====================================================================
function initHome() {
  $('#home').hidden = false;
  const name = $('#homeName');
  name.value = store.get('name') || '';
  name.addEventListener('input', () => store.set('name', name.value.trim()));
  const join = () => {
    const m = $('#homeCode').value.trim().toLowerCase().match(/([a-z0-9]{4,8})\/?$/);
    if (!m) return toast('Enter a room code or paste the room link');
    location.href = `/room/${m[1]}`;
  };
  $('#homeCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') join(); });
  document.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) return;
    if (b.dataset.act === 'mute') { store.set('muted', muted() ? '0' : '1'); paintMute(); }
    if (b.dataset.act === 'joinCode') join();
    if (b.dataset.act === 'create') {
      b.disabled = true;
      try { const { code } = await (await fetch('/api/create')).json(); location.href = `/room/${code}`; }
      catch { b.disabled = false; toast('Could not reach the server'); }
    }
  });
}

// =====================================================================
// Room
// =====================================================================
let ws = null, retry = 0, bootBuild = null;
let S = null, prevS = null, myId = null;
let TILES = [], G = null, boardMap = null, tileEls = [];
const tokEls = {}, animUntil = {};
let lastMoveId = null, lastRollId = null, logSeen = 0, shownCard = null, cardTimer = null;
let openProp = null, modal = null, pickMode = false, selColor = null, pendingName = '';
const cache = {};

const wsSend = (o) => { if (ws && ws.readyState === 1) ws.send(JSON.stringify(o)); };
const pl = (id) => S && S.players.find((p) => p.id === id);
const me = () => pl(myId);
const dot = (p) => `<span class="dot">${tokenSVG(p.c || p.color)}</span>`;
const setHTML = (el, key, html) => { if (cache[key] !== html) { cache[key] = html; el.innerHTML = html; return true; } return false; };
const flagStyle = (cc) => `background-image:url(/flags/${cc}.svg)`;
const propIcon = (t) => (t.type === 'city' ? `<span class="miniflag" style="${flagStyle(t.cc)}"></span>` : `<span class="miniflag">${t.type === 'airport' ? '✈️' : t.icon}</span>`);

function connect() {
  ws = new WebSocket(`${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`);
  ws.onopen = () => { retry = 0; $('#conn').hidden = true; wsSend({ type: 'hello', room: ROOM, token: store.get(TOKEN_KEY) }); };
  ws.onmessage = (e) => {
    const m = JSON.parse(e.data);
    if (m.type === 'state') {
      // The server restarted while this page was open: reload once so everyone runs the current code.
      const build = m.state.build || '';
      if (bootBuild === null) bootBuild = build;
      else if (build && build !== bootBuild) { location.reload(); return; }
      prevS = S; S = m.state; myId = m.you; render();
    }
    else if (m.type === 'joined') { store.set(TOKEN_KEY, m.token); pickMode = false; }
    else if (m.type === 'error') toast(m.msg);
  };
  ws.onclose = () => { $('#conn').hidden = false; setTimeout(connect, Math.min(5000, 500 * 2 ** retry++)); };
}

function fit() {
  const mobile = innerWidth < 1100;
  const size = Math.max(300, mobile ? Math.min(innerWidth - 16, 780) : Math.min(innerHeight - 32, innerWidth - 32 - 2 * 316));
  const wrap = $('#boardWrap');
  wrap.style.width = wrap.style.height = `${size}px`;
  $('#board').style.transform = `scale(${size / BOARD})`;
}

// ---------- board ----------
function trackPos(k) { return k === 0 ? G.C / 2 : k === G.n + 1 ? BOARD - G.C / 2 : G.C + (k - 0.5) * G.T; }
function tileRC(i) {
  const s = G.n + 1, side = Math.floor(i / s), o = i % s;
  return side === 0 ? [0, o, 0] : side === 1 ? [o, s, 1] : side === 2 ? [s, s - o, 2] : [s - o, 0, 3];
}
function tileCenter(i) { const [r, c, side] = tileRC(i); return [trackPos(c), trackPos(r), side]; }

function tileHTML(t) {
  const price = t.price ? `<div class="price v"></div>` : '';
  const two = t.name.length > 11 ? ' two' : '';
  switch (t.type) {
    case 'city': return `<div class="bgflag"></div>${price}<div class="name v">${esc(t.name)}</div><div class="flag"></div>`;
    case 'airport': return `${price}<div class="name v">${esc(t.name)}</div><div class="icon">✈️</div>`;
    case 'company': return `${price}<div class="name v${two}">${esc(t.name).replace(' ', '<br>')}</div><div class="icon">${t.icon}</div>`;
    case 'treasure': return `<div class="label v">Treasure</div><div class="icon">${CHEST}</div>`;
    case 'surprise': return '<div class="label v">Surprise</div><div class="q">?</div>';
    case 'taxpct': return `<div class="label v">${esc(t.name)}</div><div class="icon">💸</div><div class="sub v">%${t.pct}</div>`;
    case 'tax': return `<div class="label v">${esc(t.name)}</div><div class="icon">💍</div><div class="sub v">$${t.amount}</div>`;
    case 'refund': return `<div class="label v">${esc(t.name)}</div><div class="icon">💵</div><div class="sub v">$${t.amount}</div>`;
    case 'start': return '<b>START</b><div class="arrows">▶▶</div>';
    case 'prison': return '<div class="pass">Passing by</div><div class="cell">In Prison</div>';
    case 'vacation': return '<div class="icon">🏝️</div>Vacation<div class="pot" hidden></div>';
    case 'gotoprison': return '<div class="icon">☠️</div>Go to prison';
    default: return '';
  }
}

const mapKey = () => `${S.mapId}:${S.mapSeed || 0}`;
function buildBoard() {
  boardMap = mapKey();
  TILES = S.tiles || MAPS[S.mapId].tiles;
  const n = TILES.length / 4 - 1, T = BOARD / (n + 3.06), C = 1.53 * T;
  G = { n, T, C };
  const board = $('#board'), tiles = $('#tiles');
  board.style.setProperty('--ts', (T / 64.7).toFixed(3));
  tiles.style.gridTemplateColumns = tiles.style.gridTemplateRows = `${C}px repeat(${n}, ${T}px) ${C}px`;
  tiles.innerHTML = '';
  tileEls = TILES.map((t, i) => {
    const [r, c, side] = tileRC(i);
    const corner = i % (n + 1) === 0;
    const el = document.createElement('div');
    const prop = !!t.price;
    el.className = `tile ${t.type} ${corner ? 'corner' : `s${side}`}${prop ? ' prop' : ''}${!prop && !corner ? ' special' : ''}`;
    el.style.gridRow = r + 1; el.style.gridColumn = c + 1;
    if (t.cc) el.style.setProperty('--flag', `url(/flags/${t.cc}.svg)`);
    if (prop) el.dataset.tile = i;
    el.innerHTML = tileHTML(t);
    tiles.append(el);
    return el;
  });
  const center = $('#center');
  center.style.left = center.style.top = `${C + 6}px`;
  center.style.width = center.style.height = `${BOARD - 2 * C - 12}px`;
  fitNames();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(fitNames);
  for (const k of Object.keys(cache)) if (k.startsWith('tile')) delete cache[k];
  delete cache.pot;
  for (const id of Object.keys(tokEls)) { tokEls[id].remove(); delete tokEls[id]; }
  openProp = null;
}

// Shrink any single-line tile label that is longer than its tile is wide.
function fitNames() {
  const max = G.T - 5;
  tileEls.forEach((el, i) => {
    if (i % (G.n + 1) === 0) return;
    const vertical = tileRC(i)[2] % 2 === 1;
    for (const t of el.querySelectorAll('.name:not(.two), .label')) {
      t.style.fontSize = '';
      const len = vertical ? t.offsetHeight : t.offsetWidth;
      if (len > max) t.style.fontSize = `${Math.floor((max / len) * 100)}%`;
    }
  });
}

// Small white building icons (drawn for this project) so they stay readable on any owner colour.
const HOUSE = '<svg class="hs" viewBox="0 0 24 24"><path fill="#fff" d="M12 3 2.5 11.5H5V20h14v-8.5h2.5z"/></svg>';
const HOTEL = '<svg class="hs" viewBox="0 0 24 24"><path fill="#fff" fill-rule="evenodd" d="M5 21V4h14v17h-5v-4h-4v4zM8 7h3v3H8zm5 0h3v3h-3zM8 12h3v3H8zm5 0h3v3h-3z"/></svg>';
// Houses are written as icon × count, never as repeated icons. One hotel is just its icon; more get a count.
const buildings = (h) => (h > 5 ? `${HOTEL}×${h - 4}` : h === 5 ? HOTEL : h ? `${HOUSE}×${h}` : '');
const maxLevel = () => 4 + (S.settings.maxHotels || 1);
// Board amounts are written like the price tags: number first, small $ after.
const money = (n) => `${n}<small>$</small>`;
// Paid landings counted for an airport under the per-landing rule: shared by the owner's airports, or its own.
function airportVisits(o) {
  if (!o) return 0;
  const owner = pl(o.owner);
  return S.settings.airportShared ? (owner && owner.av) || 0 : o.visits || 0;
}
function currentRent(i) {
  const t = TILES[i], o = S.owned[i];
  if (o.mortgaged) return '';
  const mine = (x) => S.owned[x.i] && S.owned[x.i].owner === o.owner;
  if (t.type === 'city') {
    const table = rentTable(t.price);
    if (o.houses) return money(rentAt(t.price, o.houses));
    const full = TILES.every((x) => x.type !== 'city' || x.cc !== t.cc || mine(x));
    return money(S.settings.doubleRent && full ? table[0] * 2 : table[0]);
  }
  const n = TILES.filter((x) => x.type === t.type && mine(x)).length;
  if (t.type === 'airport' && S.settings.airportRepeat) return money(airportVisitRent(airportVisits(o), S.settings.airportCap));
  return t.type === 'airport' ? money(AIRPORT_RENT[Math.min(n, AIRPORT_RENT.length) - 1]) : `${COMPANY_MULT[Math.min(n, COMPANY_MULT.length) - 1]}× dice`;
}

function renderBoard() {
  if (boardMap !== mapKey()) buildBoard();
  const turnPlayer = S.phase === 'playing' ? pl(S.turn) : null;
  TILES.forEach((t, i) => {
    const el = tileEls[i];
    if (t.price) {
      const o = S.owned[i], owner = o && pl(o.owner);
      const rent = owner ? currentRent(i) : '';
      const key = owner ? `${owner.color}|${o.houses}|${o.mortgaged}|${o.mortgageTurns}|${rent}` : '';
      if (cache[`tile${i}`] !== key) {
        cache[`tile${i}`] = key;
        el.classList.toggle('owned', !!owner);
        el.classList.toggle('mortgaged', !!(o && o.mortgaged));
        const pe = el.querySelector('.price');
        if (owner) {
          el.style.setProperty('--owner', owner.color);
          const b = buildings(o.houses);
          pe.innerHTML = `<span class="rl">${o.mortgaged ? `<span class="bld">🔒</span>${o.mortgageTurns ? `<span class="rent" title="Turns left to lift the mortgage">${o.mortgageTurns}</span>` : ''}` : `${b ? `<span class="bld">${b}</span>` : ''}<span class="rent">${rent}</span>`}</span>`;
        } else pe.innerHTML = money(t.price);
      }
    }
    if (t.type === 'vacation') {
      // With vacation cash on, show what is waiting in the pot.
      const pot = el.querySelector('.pot'), show = !!S.settings.vacationCash, txt = show ? String(S.pot) : '';
      if (pot && cache.pot !== txt) {
        if (cache.pot !== undefined && show) { pot.classList.remove('bump'); void pot.offsetWidth; pot.classList.add('bump'); }
        cache.pot = txt;
        pot.hidden = !show;
        pot.innerHTML = show ? `💰 ${money(S.pot)}` : '';
      }
    }
    // After a move, the tile the current player stands on glows in that player's colour.
    const landed = !!turnPlayer && turnPlayer.pos === i && S.tp !== 'roll' && S.tp !== 'busy';
    el.classList.toggle('active', landed);
    if (landed) el.style.setProperty('--hl', turnPlayer.color);
  });
}

// ---------- tokens ----------
function placeToken(el, x, y, side) {
  el.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
  el.firstChild.style.transform = side === 1 ? 'rotate(90deg)' : side === 2 ? 'scaleX(-1)' : side === 3 ? 'rotate(-90deg)' : '';
}

function layoutTokens() {
  const shown = S.players.filter((p) => !p.bankrupt);
  for (const id of Object.keys(tokEls)) if (!shown.some((p) => p.id === id)) { tokEls[id].remove(); delete tokEls[id]; }
  const groups = {};
  for (const p of shown) (groups[`${p.pos}|${p.inJail}`] = groups[`${p.pos}|${p.inJail}`] || []).push(p);
  const ts = G.T / 64.7, now = performance.now();
  for (const p of shown) {
    let el = tokEls[p.id];
    if (!el) {
      el = tokEls[p.id] = document.createElement('div');
      el.className = 'token';
      el.innerHTML = '<div class="rot"></div>';
      $('#tokens').append(el);
    }
    if (el.dataset.color !== p.color) { el.dataset.color = p.color; el.firstChild.innerHTML = tokenSVG(p.color); }
    el.classList.toggle('cur', S.phase === 'playing' && S.turn === p.id);
    el.classList.toggle('jailed', p.inJail);
    if (animUntil[p.id] > now) continue;
    const g = groups[`${p.pos}|${p.inJail}`], k = g.indexOf(p);
    let [x, y, side] = tileCenter(p.pos);
    if (TILES[p.pos].type === 'prison') {
      if (p.inJail) { x -= G.C * 0.17; y += G.C * 0.14; } else { x += G.C * 0.34; y += G.C * 0.08; }
    }
    const off = (k - (g.length - 1) / 2) * 13 * ts;
    if (side === 1 || side === 3) x += off; else y += off;
    placeToken(el, x, y, side);
  }
}

function animateMove(mv) {
  const el = tokEls[mv.pid];
  if (!el) return;
  const N = TILES.length;
  if (mv.mode === 'jump') {
    el.classList.add('slide');
    setTimeout(() => el.classList.remove('slide'), 700);
    sfx('jail');
    return;
  }
  const dir = mv.mode === 'back' ? -1 : 1;
  animUntil[mv.pid] = performance.now() + mv.steps * mv.ms + 80;
  el.style.transitionDuration = `${mv.ms}ms`;
  for (let s = 1; s <= mv.steps; s++) {
    setTimeout(() => {
      if (lastMoveId !== mv.id || !tokEls[mv.pid]) return;
      const [x, y, side] = tileCenter((((mv.from + dir * s) % N) + N) % N);
      placeToken(el, x, y, side);
      el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop');
      if (mv.ms > 100 || s % 3 === 0) sfx('hop');
      if (s === mv.steps) {
        setTimeout(() => {
          if (lastMoveId !== mv.id) return;
          animUntil[mv.pid] = 0; el.style.transitionDuration = ''; el.classList.remove('hop');
          layoutTokens();
        }, mv.ms);
      }
    }, (s - 1) * mv.ms);
  }
}

function renderTokens(first) {
  if (S.move && S.move.id !== lastMoveId) {
    const mv = S.move;
    lastMoveId = mv.id;
    if (!first && tokEls[mv.pid]) { animUntil[mv.pid] = 0; animateMove(mv); }
  }
  layoutTokens();
}

// ---------- dice ----------
// Dice are drawn by dice.js (3D on a canvas). The throw always lands on the values the server rolled.
function setDice(d, animate) {
  if (animate) Dice.roll(d); else Dice.set(d);
}
function renderDice(first) {
  if (first || S.rollId < lastRollId) { setDice(S.dice, false); lastRollId = S.rollId; }
  else if (S.rollId !== lastRollId) { lastRollId = S.rollId; setDice(S.dice, true); sfx('roll'); }
  $('#diceBox').classList.toggle('doubles', S.phase === 'playing' && S.again && S.tp === 'roll');
}

// ---------- center ----------
function auctionHTML() {
  const a = S.auction, t = TILES[a.tile], by = a.bidder && pl(a.bidder), m = me();
  const can = (add) => m && !m.bankrupt && a.bidder !== myId && m.money >= a.bid + add;
  return `<div class="auction"><div class="au-title">Auction · ${propIcon(t)} ${esc(t.name)}</div>`
    + `<div class="au-bid">$${a.bid}</div><div class="au-by">${by ? `${dot(by)} <b>${esc(by.name)}</b> is leading` : 'No bids yet'}</div>`
    + `<div class="au-bar"><i style="animation-duration:${a.endsIn}ms"></i></div>`
    + `<div class="au-btns">${[2, 10, 100].map((n) => `<button class="btn sm" data-act="bid" data-add="${n}" ${can(n) ? '' : 'disabled'}>+$${n}</button>`).join('')}</div></div>`;
}

function centerHTML() {
  const m = me(), cur = pl(S.turn);
  if (S.phase === 'lobby') {
    if (!m) return '<div class="status">Waiting for players...</div>';
    if (myId !== S.hostId) return '<div class="status">waiting for the game to start...</div>';
    const few = S.players.length < 2;
    return `<button class="btn" data-act="start" ${few ? 'disabled' : ''}>${I.play} Start Game</button>`
      + (few ? '<div class="hint" style="color:var(--muted)">Share the link with a friend, or add a bot</div>' : '');
  }
  if (S.phase === 'over' || !cur) return '';
  if (S.tp === 'auction' && S.auction) return auctionHTML();
  if (S.turn !== myId) return `<div class="status">${dot(cur)} <b>${esc(cur.name)}</b> is playing...</div>`;
  const debt = m.money < 0 ? '<div class="hint">You are in debt. Sell or mortgage properties, or declare bankruptcy.</div>' : '';
  if (S.tp === 'roll') {
    let h = '';
    if (m.inJail) {
      h += `<button class="btn soft" data-act="payJail" ${m.money < 50 ? 'disabled' : ''}>${I.unlock} Pay $50</button>`;
      if (m.pardons) h += `<button class="btn soft" data-act="usePardon">${I.ticket} Use pardon card</button>`;
    }
    return `${h}<button class="btn ${S.again ? 'blue' : ''}" data-act="roll" ${m.money < 0 ? 'disabled' : ''}>${I.dice} ${S.again ? 'Roll again' : 'Roll the dice'}</button>${debt}`;
  }
  if (S.tp === 'buy') {
    const t = TILES[m.pos];
    const skip = S.settings.auction ? `${I.gavel} Auction` : S.again ? `${I.x} Skip` : `${I.check} End turn`;
    return `<button class="btn" data-act="skip">${skip}</button><button class="btn" data-act="buy" ${m.money < t.price ? 'disabled' : ''}>${I.cart} Buy for $${t.price}</button>`;
  }
  // Fast game on a server that ends turns itself (ver 4+): no button unless the player is stuck in debt.
  if (S.tp === 'end' && S.settings.fastGame && S.ver >= 4 && m.money >= 0) return '<div class="status" style="color:var(--muted)">Ending your turn…</div>';
  if (S.tp === 'end') return `<button class="btn" data-act="endTurn" ${m.money < 0 ? 'disabled' : ''}>${I.check} End turn</button>${debt}`;
  return '';
}

function partHTML(x) {
  if (typeof x === 'string') return esc(x);
  if (x.p) return `${dot(x)} <b>${esc(x.n)}</b>`;
  const t = TILES[x.t];
  return t && t.name === x.n ? `${propIcon(t)} <b>${esc(x.n)}</b>` : `<b>${esc(x.n)}</b>`;
}
function renderLog() {
  const box = $('#log');
  const last = S.log.length ? S.log[S.log.length - 1].id : 0;
  if (!S.log.length || S.log[0].id > logSeen + 1 && logSeen && !S.log.some((e) => e.id === logSeen)) { box.innerHTML = ''; logSeen = 0; }
  for (const e of S.log) {
    if (e.id <= logSeen) continue;
    const d = document.createElement('div');
    d.className = 'lline';
    d.innerHTML = e.parts.map(partHTML).join('');
    box.prepend(d);
  }
  logSeen = last;
  while (box.children.length > 300) box.lastChild.remove();
}

// ---------- right column ----------
function renderPlayers() {
  const box = $('#players');
  const ids = S.players.map((p) => p.id).join(',');
  if (box.dataset.ids !== ids) {
    box.dataset.ids = ids;
    box.innerHTML = S.players.length
      ? S.players.map((p) => `<div class="prow" data-pid="${p.id}"><div style="display:contents"></div></div>`).join('')
      : '<div class="empty" style="padding:10px">Waiting for players...</div>';
    for (const k of Object.keys(cache)) if (k.startsWith('row')) delete cache[k];
  }
  const lobby = S.phase === 'lobby', host = myId === S.hostId;
  for (const p of S.players) {
    const row = box.querySelector(`[data-pid="${p.id}"]`);
    row.className = `prow${p.id === myId ? ' me' : ''}${S.turn === p.id ? ' turn' : ''}${p.bankrupt ? ' out' : ''}${p.connected ? '' : ' off'}`;
    row.style.setProperty('--pc', p.color);
    const tags = `${p.bot ? `<span class="tag" title="Bot">${I.bot}</span>` : ''}${p.id === S.hostId ? `<span class="tag host">${I.crown}${lobby ? ' Host' : ''}</span>` : ''}`
      + `${p.inJail ? `<span class="tag" title="In prison">${I.lock}</span>` : ''}${p.skip ? '<span class="tag" title="On vacation: skips the next turn">🏝️</span>' : ''}${p.pardons ? `<span class="tag" title="Pardon card">${I.ticket}</span>` : ''}${!p.connected && !p.bot ? '<span class="tag">offline</span>' : ''}`;
    let html = `<div class="ptok">${tokenSVG(p.color)}</div><div class="pname"><span>${esc(p.name)}</span>${tags}`;
    if (lobby && p.id === myId) html += `<br><button class="appearance" data-act="pick">${I.palette} Change appearance</button>`;
    html += '</div>';
    if (!lobby) html += `<div class="money">${p.bankrupt ? 'bankrupt' : `$${p.money}`}</div>`;
    if (host && p.id !== myId && !p.bot && p.connected && 'maxHotels' in S.settings) html += `<button class="x mk" data-act="passHost" data-id="${p.id}" title="Make ${esc(p.name)} the host">${I.crown}</button>`;
    if (host && p.id !== myId && !p.bankrupt && S.phase !== 'over') html += `<button class="x" data-act="kick" data-id="${p.id}" title="Remove player">${I.x}</button>`;
    setHTML(row.firstChild, `row${p.id}`, html);
    const q = prevS && prevS.phase === 'playing' && S.phase !== 'lobby' && prevS.players.find((x) => x.id === p.id);
    if (q && q.money !== p.money && !p.bankrupt) {
      const d = document.createElement('div'), diff = p.money - q.money;
      d.className = `delta ${diff > 0 ? 'up' : 'down'}`;
      d.textContent = diff > 0 ? `+${diff}` : diff;
      row.append(d);
      setTimeout(() => d.remove(), 1800);
      // A purchase, build or mortgage has its own cue; don't stack the money cue on top of it.
      if (p.id === myId && JSON.stringify(prevS.owned) === JSON.stringify(S.owned)) sfx(diff > 0 ? 'gain' : 'pay');
    }
  }
}

function settingsHTML() {
  const s = S.settings, dis = myId === S.hostId ? '' : 'disabled';
  const tog = (key, ico, title, desc) => `<div class="srow"><span class="ico">${ico}</span><div><b>${title}</b><small>${desc}</small></div>`
    + `<button class="toggle ${s[key] ? 'on' : ''}" data-act="set" data-key="${key}" data-val="${s[key] ? '' : '1'}" ${dis}></button></div>`;
  const sel = (key, opts, fmt) => `<select data-set="${key}" ${dis}>${opts.map((o) => `<option value="${o}" ${s[key] === o ? 'selected' : ''}>${fmt(o)}</option>`).join('')}</select>`;
  return `<div class="panel set"><h3>Game settings</h3>
    <div class="srow"><span class="ico">👥</span><div><b>Maximum players</b><small>How many players can join the game</small></div>${sel('maxPlayers', [2, 3, 4, 5, 6, 7, 8], (o) => o)}</div>
    <div class="srow"><span class="ico">🔑</span><div><b>Private room</b><small>Rooms can be accessed using the room link only</small></div><button class="toggle on" disabled></button></div>
    <div class="srow"><span class="ico">🤖</span><div><b>Bots</b><small>Fill empty seats with computer players</small></div><button class="btn sm soft" data-act="addBot" ${dis}>+ Add bot</button></div>
    <div class="srow"><span class="ico">🗺️</span><div><b>Board map</b><small>Change map tiles, properties and stacks</small></div><span></span>
      <div class="maprow"><b>${esc(MAPS[s.map].name)}</b><button class="link" data-act="maps">${dis ? 'Browse maps' : 'Change map'} ›</button></div></div>
    <h3>Gameplay rules</h3>
    ${tog('doubleRent', '🪙', 'x2 rent on full-set properties', 'If a player owns a full property set, the base rent payment will be doubled')}
    ${tog('vacationCash', '🏝️', 'Vacation cash', 'If a player lands on Vacation, all collected money from taxes and bank payments will be earned')}
    ${'fastGame' in s ? tog('fastGame', '⚡', 'Fast game', 'Every property you land on is bought automatically if you can afford it, and houses and hotels are built automatically as soon as you can pay for them. Your turn ends automatically, and if you run out of cash your least useful properties are sold automatically') : ''}
    ${'vacationSkip' in s ? tog('vacationSkip', '⏭️', 'Vacation skips a turn', 'A player who lands on Vacation misses their next turn') : ''}
    ${tog('auction', '🔨', 'Auction', 'If someone skips purchasing a property, it will be sold to the highest bidder')}
    ${tog('noRentInPrison', '⛓️', "Don't collect rent while in prison", 'Rent will not be collected when landing on properties whose owners are in prison')}
    ${tog('mortgage', '🏦', 'Mortgage', "Mortgage a property for its sell value (50%). It earns no rent, and if you don't lift the mortgage within 5 of your turns it goes back to the bank")}
    ${'moveAfterPrison' in s ? tog('moveAfterPrison', '🚪', 'Move after paying out of prison', 'When on, you roll and move on the turn you pay or use a pardon card. When off, that ends your turn and you move on your next one. Rolling doubles always gets you out and moving, with no extra roll') : ''}
    ${'airportRepeat' in s ? tog('airportRepeat', '✈️', 'Airport rent grows per landing', 'When off, airport rent doubles with each airport the owner holds. When on, rent starts at $25 and doubles with every paid landing, up to the maximum below') : ''}
    ${'airportCap' in s ? `<div class="srow sub${s.airportRepeat ? '' : ' off'}"><span class="ico"></span><div><b>Airport rent maximum</b><small>Where the per-landing rent stops growing</small></div>${sel('airportCap', AIRPORT_CAPS, (o) => `$${o}`)}</div>
    ${tog('airportShared', '', 'Shared between airports', "A landing on any of an owner's airports raises the rent at all of them. When off, each airport counts its own landings").replace('class="srow"', `class="srow sub${s.airportRepeat ? '' : ' off'}"`)}` : ''}
    ${'maxHotels' in s ? `<div class="srow"><span class="ico">🏨</span><div><b>Hotels per property</b><small>How many hotels can be stacked on one city after its four houses. Two pay 1.5× the hotel rent, three pay 2×</small></div>${sel('maxHotels', [1, 2, 3], (o) => o)}</div>` : ''}
    ${tog('evenBuild', '🏘️', 'Even build', 'Houses and hotels must be built up and sold off evenly within a property set')}
    <div class="srow"><span class="ico">💰</span><div><b>Starting cash</b><small>Adjust how much money players start the game with</small></div>${sel('startingCash', [500, 1000, 1500, 2000, 2500, 3000, 5000, 10000], (o) => `$${o}`)}</div>
    ${tog('randomOrder', '🔀', 'Randomize player order', 'Randomly reorder players at the beginning of the game')}
  </div>`;
}

// What the bank pays for a property and everything built on it (matches the server).
const sellValue = (t) => { const o = S.owned[t.i]; return (o.houses * houseCost(t.price)) / 2 + (o.mortgaged ? 0 : t.price / 2); };
function sellRow(mine) {
  const total = mine.reduce((sum, t) => sum + sellValue(t), 0);
  const can = S.phase === 'playing' && S.turn === myId && S.tp !== 'busy';
  return `<div class="sellall"><span>Sell value <b>${money(total)}</b></span>`
    + (S.ver >= 2 ? `<button class="btn sm red" data-act="sellAll" data-total="${total}" data-n="${mine.length}" ${can ? '' : 'disabled'} title="${can ? 'Sell every building and property to the bank' : 'Available on your turn'}">${I.trash} Sell all</button>` : '') + '</div>';
}

function gameSideHTML() {
  const m = me(), alive = m && !m.bankrupt && S.phase === 'playing';
  let h = '';
  if (alive) h += `<div class="siderow"><button class="btn red sm" data-act="bankrupt">${I.flag} Bankrupt</button></div>`;
  const trades = S.trades.map((t) => {
    const a = pl(t.from), b = pl(t.to);
    if (!a || !b) return '';
    const mine = t.to === myId ? ' — for you' : t.from === myId ? ' — sent' : '';
    return `<button class="tline" data-act="tradeView" data-id="${t.id}">${dot(a)} ${esc(a.name)} ${I.swap} ${dot(b)} ${esc(b.name)}<span class="tag">${mine}</span></button>`;
  }).join('');
  h += `<div class="panel trades"><div class="thead"><div class="ptitle">Trades</div>${alive ? `<button class="btn sm" data-act="tradeNew">${I.plus} Create</button>` : ''}</div>${trades}</div>`;
  if (m) {
    const mine = TILES.filter((t) => S.owned[t.i] && S.owned[t.i].owner === myId);
    h += `<div class="panel myprops"><div class="ptitle">My properties (${mine.length})</div>${mine.map((t) => {
      const o = S.owned[t.i];
      return `<button class="prop${o.mortgaged ? ' mort' : ''}" data-act="prop" data-tile="${t.i}">${propIcon(t)} ${esc(t.name)}${canBuild(t.i) ? `<span class="canb" title="You can build here">${I.up}</span>` : ''}<span class="h">${o.mortgaged ? `🔒${o.mortgageTurns || ''}` : buildings(o.houses)}</span><span class="rent">${currentRent(t.i)}</span></button>`;
    }).join('') || '<div class="empty">Nothing yet</div>'}${mine.length ? sellRow(mine) : ''}</div>`;
  }
  return h;
}
function renderSide() { setHTML($('#side'), 'side', S.phase === 'lobby' ? settingsHTML() : gameSideHTML()); }

function renderChat() {
  const list = $('#chatList');
  const last = S.chat.length ? S.chat[S.chat.length - 1].id : 0;
  if (cache.chat !== last) {
    const fresh = cache.chat !== undefined && last > cache.chat;
    cache.chat = last;
    list.innerHTML = S.chat.map((c) => `<div class="cmsg"><b style="color:${c.color}">${esc(c.name)}</b>${esc(c.text)}</div>`).join('');
    list.scrollTop = list.scrollHeight;
    if (fresh && S.chat[S.chat.length - 1].pid !== myId) sfx('chat');
  }
  $('#chatForm').hidden = !me();
  $('#chatLocked').hidden = !!me();
}

// ---------- overlays & popups ----------
function renderOverlay() {
  const ov = $('#overlay');
  let key = '', html = '';
  if (S.phase === 'lobby' && (!me() || pickMode)) {
    const taken = S.players.filter((p) => p.id !== myId).map((p) => p.color);
    if (!me() && S.players.length >= S.settings.maxPlayers) {
      key = 'full';
      html = '<h2>The room is full.</h2><a class="btn ghost" href="/">Return to lobby</a>';
    } else {
      // Older servers only know the first ten appearances.
      const offer = S.ver >= 3 ? SKINS : SKINS.slice(0, 10);
      if (!selColor || taken.includes(selColor) || !offer.some((k) => k.color === selColor)) {
        const open = offer.filter((k) => !taken.includes(k.color));
        selColor = me() && offer.some((k) => k.color === me().color) ? me().color : (open[rnd(open.length)] || {}).color;
      }
      key = `pick|${taken.join()}|${selColor}|${pickMode}|${offer.length}`;
      html = (me() ? '' : `<input class="field" id="joinName" maxlength="16" placeholder="Your name" value="${esc(pendingName)}">`)
        + `<div>Select your player appearance: <b>${SKIN[selColor] ? esc(SKIN[selColor].name) : ''}</b></div>`
        + `<div class="skins" id="skinGrid">${offer.map((k) => `<button style="--c:${k.color}" class="skin ${k.color === selColor ? 'sel' : ''}" data-act="color" data-c="${k.color}" title="${k.name}" ${taken.includes(k.color) ? 'disabled' : ''}>${tokenSVG(k.color)}<span>${k.name}</span></button>`).join('')}</div>`
        + `<button class="btn" data-act="${me() ? 'savePick' : 'join'}">${me() ? 'Save' : 'Join game'} ${I.arrow}</button>`;
    }
  } else if (S.phase === 'over') {
    const w = pl(S.winner);
    key = `over|${S.winner}|${myId === S.hostId}`;
    const conf = Array.from({ length: 46 }, () => `<i class="confetti" style="left:${rnd(100)}%;background:${COLORS[rnd(12)]};animation-duration:${2.4 + Math.random() * 2.6}s;animation-delay:${-Math.random() * 5}s"></i>`).join('');
    html = `${conf}<div class="winner">${w ? `<div class="wtok" style="margin:auto">${tokenSVG(w.color)}</div><h2>🏆 ${esc(w.name)} won the game!</h2>` : '<h2>Game over</h2>'}</div>`
      + (myId === S.hostId ? `<button class="btn" data-act="lobby">${I.back} Back to lobby</button>` : '<div>Waiting for the host to start a new game…</div>');
  }
  ov.hidden = !key;
  if (key && cache.overlay !== key) {
    const grid = $('#skinGrid'), scrolled = grid ? grid.scrollTop : 0;   // keep the picker where the player scrolled to
    cache.overlay = key; ov.innerHTML = html;
    if ($('#skinGrid')) $('#skinGrid').scrollTop = scrolled;
    const inp = $('#joinName');
    if (inp) inp.addEventListener('input', () => { pendingName = inp.value; });
  }
  if (!key && cache.overlay) { cache.overlay = ''; ov.innerHTML = ''; }
}

function popNear(el, i, w, h) {
  const [x, y] = tileCenter(i), c = BOARD / 2, m = G.C + 10;
  const dx = c - x, dy = c - y, len = Math.hypot(dx, dy) || 1;
  const px = x + (dx / len) * (w / 2 + G.T * 0.6), py = y + (dy / len) * (h / 2 + G.T * 0.6);
  return [Math.max(m + w / 2, Math.min(BOARD - m - w / 2, px)), Math.max(m + h / 2, Math.min(BOARD - m - h / 2, py))];
}

function renderCard() {
  const el = $('#cardPop');
  if (!S.card) { el.hidden = true; shownCard = null; return; }
  if (S.card.id === shownCard) return;
  const first = !prevS;
  shownCard = S.card.id;
  if (first) return;
  const [x, y] = popNear(el, S.card.tile, 170, 90);
  el.style.left = `${x}px`; el.style.top = `${y}px`;
  el.innerHTML = `<button class="x" data-act="closeCard">×</button>${esc(S.card.text)}`;
  el.hidden = true; void el.offsetWidth; el.hidden = false;
  sfx('card');
  clearTimeout(cardTimer);
  cardTimer = setTimeout(() => { el.hidden = true; }, 6000);
}

// True when you could buy a house or hotel on this property right now (mirrors the server's checks).
function canBuild(i) {
  const t = TILES[i], o = S.owned[i], m = me();
  if (!m || !o || o.owner !== myId || t.type !== 'city' || S.phase !== 'playing' || S.turn !== myId || S.tp === 'busy') return false;
  const set = TILES.filter((x) => x.type === 'city' && x.cc === t.cc);
  if (!set.every((x) => S.owned[x.i] && S.owned[x.i].owner === myId && !S.owned[x.i].mortgaged)) return false;
  if (o.houses >= maxLevel()) return false;
  if (S.settings.evenBuild && o.houses > Math.min(...set.map((x) => S.owned[x.i].houses))) return false;
  return m.money >= houseCost(t.price);
}

function propHTML(i) {
  const t = TILES[i], o = S.owned[i], owner = o && pl(o.owner), m = me();
  const row = (label, val, on) => `<tr class="${on ? 'on' : ''}"><td>${label}</td><td>${val}</td></tr>`;
  let rows = '';
  if (t.type === 'city') {
    const labels = ['with rent', 'with one house', 'with two houses', 'with three houses', 'with four houses', 'with a hotel', 'with two hotels', 'with three hotels'];
    rows = labels.slice(0, maxLevel() + 1).map((label, k) => row(label, `$${rentAt(t.price, k)}`, o && !o.mortgaged && o.houses === k)).join('');
  } else {
    const set = TILES.filter((x) => x.type === t.type);
    const n = owner ? set.filter((x) => S.owned[x.i] && S.owned[x.i].owner === owner.id).length : 0;
    const word = t.type === 'airport' ? 'airport' : 'company';
    if (t.type === 'airport' && S.settings.airportRepeat) {
      const visits = airportVisits(o), cap = S.settings.airportCap || 3200, nth = ['1st', '2nd', '3rd', '4th', '5th', '6th', '7th', '8th'];
      const last = nth.findIndex((_, k) => airportVisitRent(k, cap) >= cap);
      rows = nth.slice(0, last + 1).map((label, k) => row(`${label} landing${k === last ? ' and after' : ''}`, `$${airportVisitRent(k, cap)}`, !!o && !o.mortgaged && Math.min(visits, last) === k)).join('')
        + `<tr><td colspan="2" style="color:#b9b5d8;font-size:12px">${S.settings.airportShared ? "Landings count across all of the owner's airports" : 'Each airport counts its own landings'}</td></tr>`;
    } else {
      rows = set.map((_, k) => row(`${k + 1} ${k ? (word === 'company' ? 'companies' : 'airports') : word} owned`,
        t.type === 'airport' ? `$${AIRPORT_RENT[k]}` : `${COMPANY_MULT[k]}× dice`, n === k + 1 && !o.mortgaged)).join('');
    }
  }
  let btns = '';
  if (owner && m && owner.id === myId && S.turn === myId && S.phase === 'playing') {
    const hc = t.type === 'city' ? houseCost(t.price) : 0;
    btns = '<div class="pc-btns">'
      + (t.type === 'city' ? `<button class="btn ${canBuild(i) ? 'go' : 'soft'}" data-act="mg" data-kind="build" data-tile="${i}" title="${canBuild(i) ? `Build a ${o.houses >= 4 ? 'hotel' : 'house'} for $${hc}` : `Build ($${hc}): needs the full set, enough cash${S.settings.evenBuild ? ', and even building' : ''}`}" ${canBuild(i) ? '' : 'disabled'}>${I.up}</button><button class="btn soft" data-act="mg" data-kind="sellHouse" data-tile="${i}" title="Sell a building (+$${hc / 2})" ${o.houses ? '' : 'disabled'}>${I.down}</button>` : '')
      + (S.settings.mortgage ? (o.mortgaged
        ? `<button class="btn soft" data-act="mg" data-kind="unmortgage" data-tile="${i}" title="Lift mortgage ($${Math.round(t.price * 0.55)})">${I.unlock}</button>`
        : `<button class="btn soft" data-act="mg" data-kind="mortgage" data-tile="${i}" title="Mortgage for the sell value (+$${t.price / 2}). Lift it within 5 of your turns or the bank takes the property">${I.bank}</button>`) : '')
      + `<span class="sp"></span><button class="btn" data-act="mg" data-kind="sellProp" data-tile="${i}" title="Sell to the bank (+$${o.mortgaged ? 0 : t.price / 2})">${I.trash}</button></div>`;
  }
  return `<button class="x" data-act="closeProp">×</button><h4>${esc(t.name)}</h4>`
    + `<table class="rt"><tr><th><span>when</span></th><th><span>get</span></th></tr>${rows}</table>${btns}`
    + `<div class="pc-owner">${owner ? `Owner &nbsp; ${dot(owner)} <b>${esc(owner.name)}</b>${o.mortgaged ? ` · mortgaged${o.mortgageTurns ? `, ${o.mortgageTurns} turn${o.mortgageTurns === 1 ? '' : 's'} left` : ''}` : ''}` : 'Not owned yet'}</div>`
    + `<div class="pc-foot"><div><small>Price</small>$ ${t.price}</div>${t.type === 'city' ? `<div><small>🏠</small>$ ${houseCost(t.price)}</div><div><small>🏨</small>$ ${houseCost(t.price)}</div>` : ''}</div>`;
}
function renderProp() {
  const el = $('#propPop');
  if (openProp === null || !TILES[openProp] || !TILES[openProp].price) { el.hidden = true; cache.prop = ''; return; }
  if (setHTML(el, 'prop', propHTML(openProp)) || el.hidden) {
    el.hidden = false;
    const h = el.offsetHeight, [x, y] = popNear(el, openProp, 226, h);
    el.style.left = `${x - 113}px`; el.style.top = `${y - h / 2}px`;
  }
}

// ---------- modals ----------
function miniMap(id) {
  const tiles = MAPS[id].tiles, n = tiles.length / 4 - 1, s = n + 1, mystery = MAPS[id].pick;
  const cells = tiles.map((t, i) => {
    const side = Math.floor(i / s), o = i % s;
    const [r, c] = side === 0 ? [0, o] : side === 1 ? [o, s] : side === 2 ? [s, s - o] : [s - o, 0];
    const col = mystery ? '#6f5cc4' : t.type === 'city' ? CC_COLOR[t.cc] || `hsl(${(t.cc.charCodeAt(0) * 47 + t.cc.charCodeAt(1) * 89) % 360} 60% 55%)` : t.type === 'airport' ? '#9fe0d0' : t.type === 'company' ? '#26c6da' : '#5b4a8c';
    return `<i style="grid-row:${r + 1};grid-column:${c + 1};background:${col}"></i>`;
  }).join('');
  return `<div class="mini" style="grid-template:repeat(${n + 2},1fr)/repeat(${n + 2},1fr)">${cells}<div class="mi">${MAPS[id].icon}</div></div>`;
}
function tradeSide(side, p, data) {
  const props = TILES.filter((t) => S.owned[t.i] && S.owned[t.i].owner === p.id);
  const locked = (t) => TILES.some((x) => x.type === t.type && (t.type !== 'city' || x.cc === t.cc) && S.owned[x.i] && S.owned[x.i].houses > 0);
  return `<div class="tcol"><div class="who"><span class="ptok">${tokenSVG(p.color)}</span>${esc(p.name)} ${side === 'give' ? 'gives' : 'gives'}</div>`
    + `<div class="amt">$<span data-amt="${side}">${data.money}</span></div>`
    + `<input type="range" min="0" max="${Math.max(0, p.money)}" step="${p.money > 400 ? 10 : 1}" value="${data.money}" data-range="${side}">`
    + `<div class="chips">${props.map((t) => `<button class="chip ${data.props.includes(t.i) ? 'on' : ''}" data-act="tChip" data-side="${side}" data-tile="${t.i}" ${locked(t) ? 'disabled title="Sell the buildings in this set first"' : ''}>${propIcon(t)} ${esc(t.name)}</button>`).join('') || '<span class="empty">No properties</span>'}</div></div>`;
}
function tradeSummary(p, data) {
  return `<div class="tcol"><div class="who"><span class="ptok">${tokenSVG(p.color)}</span>${esc(p.name)} gives</div><div class="amt">$${data.money}</div>`
    + `<div class="chips">${data.props.map((i) => `<span class="chip">${propIcon(TILES[i])} ${esc(TILES[i].name)}</span>`).join('') || '<span class="empty">No properties</span>'}</div></div>`;
}
function renderModal() {
  const el = $('#modal');
  if (!modal) { el.hidden = true; el.innerHTML = ''; return; }
  let h = '';
  const X = '<button class="x" data-act="closeModal">×</button>';
  if (modal.type === 'maps') {
    const host = myId === S.hostId && S.phase === 'lobby';
    h = `<div class="mbox">${X}<h3>Board Maps</h3><div class="maps">${Object.entries(MAPS).map(([id, m]) => `<div class="mapcard ${S.settings.map === id ? 'sel' : ''}">${miniMap(id)}<b>${esc(m.name)}</b><span class="free">FREE · ${m.pick ? 'ANY MAP' : `${m.tiles.length} TILES`}</span><small class="blurb">${esc(m.blurb || '')}</small>`
      + `<button class="btn" data-act="useMap" data-map="${id}" ${host ? '' : 'disabled'}>${S.settings.map === id ? (m.random ? `${I.dice} Shuffle again` : `${I.check} In use`) : 'Use'}</button></div>`).join('')}</div></div>`;
  } else if (modal.type === 'help') {
    h = `<div class="mbox narrow">${X}<h3>How to play</h3><ul class="help">
      <li>Roll the dice on your turn. Doubles give you another roll; three doubles in a row send you to prison.</li>
      <li>Land on a free property to buy it. Click any property on the board to see its rents.</li>
      <li>Passing Start pays $200, landing exactly on it pays $300.</li>
      <li>Own all cities of a country to build houses and a hotel — open the property card on your turn and press the up arrow.</li>
      <li>Short on cash? Sell buildings, mortgage or sell properties, or strike a deal in Trades.</li>
      <li>In prison: pay $50, use a pardon card, or roll doubles. Doubles get you out and moving straight away, without the usual extra roll. After three tries you pay. Whether you move on the turn you pay is a room setting.</li>
      <li>Landing on Vacation collects the cash pot. Unless the room turns it off, your turn ends there (even on doubles) and you skip your next one.</li>
      <li>The last player who is not bankrupt wins.</li></ul>
      <p style="color:var(--muted);font-size:13px">Some sound effects from <a class="link" href="https://notificationsounds.com" target="_blank" rel="noopener">notificationsounds.com</a>, Creative Commons Attribution. See <a class="link" href="/sounds/CREDITS.md" target="_blank">credits</a>.</p></div>`;
  } else if (modal.type === 'confirm') {
    h = `<div class="mbox narrow">${X}<h3>${esc(modal.title)}</h3><p>${esc(modal.text)}</p><div class="mfoot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn red" data-act="confirmYes">${esc(modal.yes)}</button></div></div>`;
  } else if (modal.type === 'tradePick') {
    const others = S.players.filter((p) => p.id !== myId && !p.bankrupt);
    h = `<div class="mbox narrow">${X}<h3>Create a trade</h3><p style="color:var(--muted)">Select a player to trade with:</p><div class="plist">${others.map((p) => `<button data-act="tradeWith" data-id="${p.id}"><span class="ptok">${tokenSVG(p.color)}</span>${esc(p.name)}</button>`).join('')}</div></div>`;
  } else if (modal.type === 'tradeEdit') {
    const other = pl(modal.to), m = me();
    if (!other || !m || other.bankrupt) { modal = null; return renderModal(); }
    h = `<div class="mbox">${X}<h3>Create a trade</h3><div class="tradegrid">${tradeSide('give', m, modal.give)}${tradeSide('get', other, modal.get)}</div>`
      + `<div class="mfoot"><button class="btn ghost" data-act="closeModal">Cancel</button><button class="btn" data-act="tradeSend">Send trade ${I.send}</button></div></div>`;
  } else if (modal.type === 'tradeView') {
    const t = S.trades.find((x) => x.id === modal.id), a = t && pl(t.from), b = t && pl(t.to);
    if (!t || !a || !b) { modal = null; return renderModal(); }
    const foot = t.to === myId ? `<button class="btn red" data-act="tradeDecline" data-id="${t.id}">${I.x} Decline</button><button class="btn" data-act="tradeAccept" data-id="${t.id}">${I.check} Accept</button>`
      : t.from === myId ? `<button class="btn red" data-act="tradeCancel" data-id="${t.id}">Cancel trade</button>` : '';
    h = `<div class="mbox">${X}<h3>Trade offer</h3><div class="tradegrid">${tradeSummary(a, t.give)}${tradeSummary(b, t.get)}</div><div class="mfoot">${foot}</div></div>`;
  }
  el.hidden = false;
  setHTML(el, 'modal', h);
}

// ---------- completed sets ----------
// Who holds each whole set (cities of one country, all airports, all companies), or null.
function setOwners(st) {
  const g = {};
  for (const t of TILES) {
    if (!t.price) continue;
    const k = t.type === 'city' ? `c:${t.cc}` : t.type, id = st.owned[t.i] ? st.owned[t.i].owner : null;
    if (!g[k]) g[k] = { id, tiles: [t.i] };
    else { if (g[k].id !== id) g[k].id = null; g[k].tiles.push(t.i); }
  }
  return g;
}
function celebrateSet(p, tiles) {
  for (const i of tiles) {
    const el = tileEls[i];
    if (!el) continue;
    el.style.setProperty('--sc', p.color);
    el.classList.remove('setfx'); void el.offsetWidth; el.classList.add('setfx');
    setTimeout(() => el.classList.remove('setfx'), 2400);
  }
  const first = TILES[tiles[0]];
  const what = first.type === 'city' ? tiles.map((i) => esc(TILES[i].name)).join(' · ') : first.type === 'airport' ? 'every airport' : 'every company';
  const bits = Array.from({ length: 26 }, () => {
    const ang = Math.random() * Math.PI * 2, dist = 110 + Math.random() * 150;
    return `<i style="--x:${Math.round(Math.cos(ang) * dist)}px;--y:${Math.round(Math.sin(ang) * dist)}px;--k:${COLORS[rnd(COLORS.length)]};animation-delay:${Math.round(Math.random() * 120)}ms"></i>`;
  }).join('');
  const b = document.createElement('div');
  b.className = 'setbanner';
  b.style.setProperty('--c', p.color);
  b.innerHTML = `${bits}<div class="sb-tok">${tokenSVG(p.color)}</div><div class="sb-title">Set complete!</div><div><b>${esc(p.name)}</b> now owns ${first.type === 'city' ? propIcon(first) : ''} ${what}</div>`;
  $('#board').append(b);
  setTimeout(() => b.remove(), 2800);
  sfx('set');
}

// A purchase that takes the last property of a set whose every other property belongs to one other player.
function breakerOf(prev, now, i) {
  if (prev.owned[i] || !now.owned[i]) return null;
  const t = TILES[i], others = TILES.filter((x) => x.i !== i && x.type === t.type && (t.type !== 'city' || x.cc === t.cc));
  if (!others.length) return null;
  const first = now.owned[others[0].i];
  if (!first || first.owner === now.owned[i].owner || !others.every((x) => now.owned[x.i] && now.owned[x.i].owner === first.owner)) return null;
  return { breaker: pl(now.owned[i].owner), victim: pl(first.owner), tile: i, others: others.map((x) => x.i) };
}
function showBreak({ breaker, victim, tile, others }) {
  if (!breaker || !victim) return;
  const fx = (i, cls, color, ms) => {
    const el = tileEls[i];
    if (!el) return;
    el.style.setProperty('--sc', color);
    el.classList.remove(cls); void el.offsetWidth; el.classList.add(cls);
    setTimeout(() => el.classList.remove(cls), ms);
  };
  fx(tile, 'breakhit', breaker.color, 2000);
  for (const i of others) fx(i, 'breakfx', victim.color, 1400);
  const t = TILES[tile];
  const b = document.createElement('div');
  b.className = 'setbanner breaker';
  b.style.setProperty('--c', '#ff4d4d');
  b.innerHTML = `<div class="sb-duel"><span class="sb-tok">${tokenSVG(breaker.color)}</span><span class="sb-x">💥</span><span class="sb-tok lost">${tokenSVG(victim.color)}</span></div>`
    + `<div class="sb-title">Set breaker!</div><div><b>${esc(breaker.name)}</b> took ${propIcon(t)} ${esc(t.name)} and blocked <b>${esc(victim.name)}</b></div>`;
  $('#board').append(b);
  setTimeout(() => b.remove(), 2800);
  sfx('break');
}

// ---------- main render ----------
function render() {
  const first = !prevS;
  if (first) {
    $('#shareUrl').value = `${location.origin}/room/${ROOM}`;
    document.title = `Cashup — room ${ROOM}`;
    if (S.phase !== 'lobby' && !myId) toast('Game in progress — you are spectating');
  }
  renderBoard();
  renderTokens(first);
  renderDice(first);
  setHTML($('#actions'), 'actions', centerHTML());
  renderLog();
  renderPlayers();
  renderSide();
  renderChat();
  renderOverlay();
  renderCard();
  renderProp();
  if (modal && modal.type !== 'tradeEdit') { cache.modal = null; renderModal(); }
  if (first) return;
  // sound cues for state transitions
  if (prevS.phase === 'lobby' && S.phase === 'playing') sfx('start');
  if (prevS.phase === 'playing' && S.phase === 'over') sfx(S.winner === myId ? 'win' : 'bankrupt');
  if (S.phase === 'playing' && S.turn === myId && S.tp === 'roll' && (prevS.turn !== myId || prevS.phase !== 'playing')) sfx('turn');
  if (S.phase === 'playing' && prevS.phase === 'playing') {
    const po = prevS.owned, so = S.owned;
    const ids = new Set([...Object.keys(po), ...Object.keys(so)]);
    for (const i of ids) {
      const a = po[i], b = so[i];
      if (!a && b) sfx('buy');
      else if (a && b && b.houses > a.houses) sfx('build');
      else if (a && b && a.mortgaged !== b.mortgaged) sfx(b.mortgaged ? 'mortgage' : 'unmortgage');
    }
    if (S.trades.length !== prevS.trades.length) sfx('trade');
    if (S.mapId === prevS.mapId && S.mapSeed === prevS.mapSeed) {
      for (const i of Object.keys(so)) { const hit = breakerOf(prevS, S, +i); if (hit) showBreak(hit); }
      const was = setOwners(prevS), now = setOwners(S);
      for (const k of Object.keys(now)) {
        const owner = now[k].id && pl(now[k].id);
        if (owner && now[k].tiles.length > 1 && (!was[k] || was[k].id !== now[k].id)) celebrateSet(owner, now[k].tiles);
      }
    }
    if (S.auction && prevS.auction && S.auction.bid !== prevS.auction.bid) sfx('bid');
    if (S.players.some((p) => p.bankrupt && !prevS.players.find((q) => q.id === p.id).bankrupt)) sfx('bankrupt');
  }
}

// ---------- input ----------
const ACT = {
  mute() { store.set('muted', muted() ? '0' : '1'); paintMute(); },
  help() { modal = { type: 'help' }; renderModal(); },
  copyLog() {
    // oldest first, one event per line
    const text = [...document.querySelectorAll('#log .lline')].map((el) => el.innerText.replace(/\s+/g, ' ').trim()).reverse().join('\n');
    if (!text) return toast('The game log is empty');
    (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Game log copied'), () => {
      const ta = document.createElement('textarea');
      ta.value = text; document.body.append(ta); ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      toast(ok ? 'Game log copied' : 'Could not copy: select the log text and copy it manually');
    });
  },
  copy(b) {
    const url = $('#shareUrl').value;
    (navigator.clipboard ? navigator.clipboard.writeText(url) : Promise.reject()).catch(() => { $('#shareUrl').select(); document.execCommand('copy'); });
    b.innerHTML = `${I.check} Copied!`;
    setTimeout(() => { b.innerHTML = `${I.copy} Copy`; }, 1500);
  },
  color(b) { selColor = b.dataset.c; renderOverlay(); },
  join() {
    const name = (pendingName || store.get('name') || '').trim() || `Player${10 + rnd(90)}`;
    store.set('name', name);
    wsSend({ type: 'join', name, color: selColor });
  },
  pick() { pickMode = true; selColor = me().color; renderOverlay(); },
  savePick() { if (selColor !== me().color) wsSend({ type: 'appearance', color: selColor }); pickMode = false; renderOverlay(); },
  start() { wsSend({ type: 'start' }); },
  lobby() { wsSend({ type: 'lobby' }); },
  addBot() { wsSend({ type: 'addBot' }); },
  kick(b) {
    if (S.phase === 'lobby') return wsSend({ type: 'kick', id: b.dataset.id });
    const p = pl(b.dataset.id);
    modal = { type: 'confirm', title: 'Remove player?', text: `${p.name} will go bankrupt and leave the game.`, yes: 'Remove', run: () => wsSend({ type: 'kick', id: p.id }) };
    renderModal();
  },
  passHost(b) {
    const p = pl(b.dataset.id);
    modal = { type: 'confirm', title: 'Hand over host?', text: `${p.name} will control the room settings, start games and remove players. You will become a regular player.`, yes: 'Make host', run: () => wsSend({ type: 'passHost', id: p.id }) };
    renderModal();
  },
  set(b) { wsSend({ type: 'setting', key: b.dataset.key, value: !!b.dataset.val }); },
  maps() { modal = { type: 'maps' }; renderModal(); },
  useMap(b) { wsSend({ type: 'setting', key: 'map', value: b.dataset.map }); if (b.dataset.map !== 'generated' || S.settings.map !== 'generated') modal = null; renderModal(); },
  roll() { wsSend({ type: 'roll' }); },
  buy() { wsSend({ type: 'buy' }); },
  skip() { wsSend({ type: 'skip' }); },
  endTurn() { wsSend({ type: 'endTurn' }); },
  payJail() { wsSend({ type: 'payJail' }); },
  usePardon() { wsSend({ type: 'usePardon' }); },
  bid(b) { wsSend({ type: 'bid', add: +b.dataset.add }); },
  mg(b) { wsSend({ type: b.dataset.kind, tile: +b.dataset.tile }); },
  prop(b) { openProp = +b.dataset.tile; cache.prop = ''; $('#propPop').hidden = true; renderProp(); },
  closeProp() { openProp = null; renderProp(); },
  closeCard() { $('#cardPop').hidden = true; },
  closeModal() { modal = null; renderModal(); },
  confirmYes() { const run = modal.run; modal = null; renderModal(); run(); },
  sellAll(b) {
    const n = +b.dataset.n;
    modal = { type: 'confirm', title: `Sell everything for $${b.dataset.total}?`, text: `All ${n} of your propert${n === 1 ? 'y goes' : 'ies go'} back to the bank, buildings included. This cannot be undone.`, yes: 'Sell all', run: () => wsSend({ type: 'sellAll' }) };
    renderModal();
  },
  bankrupt() {
    modal = { type: 'confirm', title: 'Declare bankruptcy?', text: 'You will lose all your properties and leave the game. This cannot be undone.', yes: 'Bankrupt', run: () => wsSend({ type: 'bankrupt' }) };
    renderModal();
  },
  tradeNew() {
    const others = S.players.filter((p) => p.id !== myId && !p.bankrupt);
    modal = others.length === 1 ? { type: 'tradeEdit', to: others[0].id, give: { money: 0, props: [] }, get: { money: 0, props: [] } } : { type: 'tradePick' };
    cache.modal = null; renderModal();
  },
  tradeWith(b) { modal = { type: 'tradeEdit', to: b.dataset.id, give: { money: 0, props: [] }, get: { money: 0, props: [] } }; cache.modal = null; renderModal(); },
  tChip(b) {
    const list = modal[b.dataset.side].props, i = +b.dataset.tile;
    if (list.includes(i)) list.splice(list.indexOf(i), 1); else list.push(i);
    b.classList.toggle('on');
  },
  tradeSend() { wsSend({ type: 'trade', to: modal.to, give: modal.give, get: modal.get }); modal = null; renderModal(); },
  tradeView(b) { modal = { type: 'tradeView', id: b.dataset.id }; cache.modal = null; renderModal(); },
  tradeAccept(b) { wsSend({ type: 'tradeAccept', id: b.dataset.id }); modal = null; renderModal(); },
  tradeDecline(b) { wsSend({ type: 'tradeDecline', id: b.dataset.id }); modal = null; renderModal(); },
  tradeCancel(b) { wsSend({ type: 'tradeCancel', id: b.dataset.id }); modal = null; renderModal(); },
};

function initRoom() {
  $('#room').hidden = false;
  pendingName = store.get('name') || '';
  Dice.init($('#diceCanvas'));
  fit();
  addEventListener('resize', fit);
  document.addEventListener('click', (e) => {
    const b = e.target.closest('[data-act]');
    if (b && !b.disabled && ACT[b.dataset.act]) { ACT[b.dataset.act](b); return; }
    const tile = e.target.closest('.tile.prop');
    if (tile) { ACT.prop(tile); return; }
    if (e.target.id === 'modal') { ACT.closeModal(); return; }
    if (openProp !== null && !e.target.closest('#propPop')) ACT.closeProp();
  });
  document.addEventListener('change', (e) => {
    const s = e.target.closest('[data-set]');
    if (s) wsSend({ type: 'setting', key: s.dataset.set, value: +s.value });
  });
  document.addEventListener('input', (e) => {
    const r = e.target.closest('[data-range]');
    if (r && modal && modal.type === 'tradeEdit') {
      modal[r.dataset.range].money = +r.value;
      $(`[data-amt="${r.dataset.range}"]`).textContent = r.value;
    }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (modal) ACT.closeModal(); else if (openProp !== null) ACT.closeProp(); }
  });
  $('#chatForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const inp = $('#chatInput');
    if (inp.value.trim()) wsSend({ type: 'chat', text: inp.value });
    inp.value = '';
  });
  connect();
}

paintMute();
for (const [sel, html] of [['[data-act=copyLog]', I.copy], ['[data-act=copy]', `${I.copy} Copy`], ['#chatForm .send', I.send], ['[data-act=joinCode]', `${I.key} Join`]]) {
  const el = $(sel);
  if (el) el.innerHTML = html;
}
if (ROOM) initRoom(); else initHome();
