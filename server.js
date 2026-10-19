'use strict';
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { WebSocketServer } = require('ws');
const { MAPS, rentTable, rentAt, houseCost, builtCost, AIRPORT_RENT, AIRPORT_CAPS, airportVisitRent, COMPANY_MULT, randomMap } = require('./public/maps.js');

const PORT = process.env.PORT || 3000;
// Test-only: SPEED=40 shrinks every animation/bot delay so a scripted game finishes in seconds.
const SPEED = Number(process.env.SPEED) || 1;
// Changes on every start. Pages that were open across a restart see a new value and reload themselves to pick up new code.
const BUILD = Date.now().toString(36);
const PUBLIC = path.join(__dirname, 'public');
const FLAGS = path.join(__dirname, 'node_modules', 'flag-icons', 'flags', '1x1');
const MIME = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon', '.json': 'application/json', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav',
};

const BASE_COLORS = ['#c0dc52', '#ffc83d', '#ff8438', '#c8474b', '#5a9be0', '#7fe3f4', '#1a9a8a', '#6fe85a', '#a37563', '#c940a8', '#ff7ca0', '#8456dc'];
// Appearances are keyed by their own colour (see public/skins.js); the client draws the matching character.
// The plain base colours are still accepted so older links keep working.
const SKIN_COLORS = require('./public/skins.js').SKINS.map((k) => k.color);
const COLORS = [...BASE_COLORS, ...SKIN_COLORS];
const BOT_A = ['Sneaky', 'Lucky', 'Greedy', 'Jolly', 'Witty', 'Bold', 'Thrifty', 'Fancy', 'Shady', 'Mighty', 'Clever', 'Dizzy'];
const BOT_B = ['Baron', 'Tycoon', 'Banker', 'Mogul', 'Broker', 'Investor', 'Landlord', 'Dealer', 'Magnate', 'Trader', 'Duke', 'Fox'];
const JAIL_FEE = 50;
// Reactions a player can send over their token. Must match EMOTES in public/app.js.
const EMOTES = ['😂', '😎', '🔥', '👏', '😭', '😡', '💸', '🤝'];

// ---------- player stats ----------
// Kept on disk across restarts, keyed by lower-cased player name. Every save writes the main file and a copy
// outside the repo folder; loading falls back to the copy if the main file is missing or damaged.
// STATS=/tmp/a.json,/tmp/b.json points tests elsewhere.
const STATS_FILES = (process.env.STATS || [path.join(__dirname, 'data', 'stats.json'), path.join(__dirname, '..', 'cashup-stats-copy.json')].join(',')).split(',');
const DEFAULT_PROFILES = ['vk', 'Tony Wayne'];
function loadStats() {
  for (const f of STATS_FILES) {
    try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { /* missing or damaged: try the next copy */ }
  }
  return {};
}
const STATS = loadStats();
for (const name of DEFAULT_PROFILES) STATS[name.toLowerCase()] ||= { name, games: 0, wins: 0, best: 0, last: 0 };
function saveStats() {
  const data = JSON.stringify(STATS, null, 1);
  for (const f of STATS_FILES) {
    try {
      fs.mkdirSync(path.dirname(f), { recursive: true });
      fs.writeFileSync(`${f}.tmp`, data);
      fs.renameSync(`${f}.tmp`, f);   // write-then-rename so a crash never leaves a half-written file
    } catch (e) { console.error('Could not save stats to', f, e.message); }
  }
}
saveStats();
// Every finished (or abandoned) game is written to <stats folder>/log/<start date_time>.json.
const LOG_DIR = path.join(path.dirname(STATS_FILES[0]), 'log');
function saveGameLog(name, game) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    const data = JSON.stringify(game, null, 1);
    try { fs.writeFileSync(path.join(LOG_DIR, `${name}.json`), data, { flag: 'wx' }); }
    catch { fs.writeFileSync(path.join(LOG_DIR, `${name}_${game.room}.json`), data); }   // two rooms started in the same second
  } catch (e) { console.error('Could not save game log', e.message); }
}
function statsList() {
  return Object.values(STATS).sort((a, b) => b.wins - a.wins || b.games - a.games || a.name.localeCompare(b.name));
}
// A mortgage pays the sell value up front; if it is not lifted within this many of the owner's turns, the bank takes the property.
const MORTGAGE_TURNS = 5;
// Fast game: how long a player in debt has to sell something themselves before the game does it for them.
const DEBT_GRACE = 10000;
// Bots value a property's rent as this many landings still to come, on top of its price.
const TRADE_LANDINGS = 6;
const PASS_START = 200;
const LAND_START = 300;

const SURPRISE = [
  { text: 'Advance to Start.', fx: ['start'] },
  { text: 'Busted! Go straight to prison.', fx: ['jail'] },
  { text: 'Wrong turn. Go back 3 steps.', fx: ['back', 3] },
  { text: 'Catch a flight to the nearest airport.', fx: ['nearest', 'airport'] },
  { text: 'Head over to the nearest company.', fx: ['nearest', 'company'] },
  { text: 'You lost a bet. Pay every player $50.', fx: ['payEach', 50] },
  { text: 'Time to renovate. Pay $25 per house and $100 per hotel.', fx: ['repairs', 25, 100] },
  { text: 'The bank pays you a dividend of $50.', fx: ['money', 50] },
  { text: 'Speeding ticket. Pay $15.', fx: ['money', -15] },
  { text: 'Your investment paid off. Collect $150.', fx: ['money', 150] },
  { text: 'Pardon card! Keep it to walk out of prison for free.', fx: ['pardon'] },
  { text: 'Advance to the priciest city on the board.', fx: ['priciest'] },
  { text: 'You won a crossword contest. Collect $100.', fx: ['money', 100] },
  { text: 'Free ticket! Advance to any city you choose.', fx: ['choose'] },
  { text: 'Advance to the city charging the highest rent right now.', fx: ['topRent'] },
  { text: 'Tailwind! Move forward 5 steps.', fx: ['forward', 5] },
  { text: 'Take a break. Advance to Vacation.', fx: ['nearest', 'vacation'] },
  { text: 'Property boom! Collect $25 for every property you own.', fx: ['perProp', 25] },
  { text: 'Jackpot! Collect $300.', fx: ['money', 300] },
];
const TREASURE = [
  { text: 'Bank error in your favor. Collect $200.', fx: ['money', 200] },
  { text: "Doctor's fee. Pay $50.", fx: ['money', -50] },
  { text: 'You sold some stock. Collect $50.', fx: ['money', 50] },
  { text: 'Pardon card! Keep it to walk out of prison for free.', fx: ['pardon'] },
  { text: 'Caught red-handed. Go to prison.', fx: ['jail'] },
  { text: 'Your holiday fund matures. Collect $100.', fx: ['money', 100] },
  { text: 'Tax refund. Collect $20.', fx: ['money', 20] },
  { text: "It's your birthday! Collect $10 from every player.", fx: ['collectEach', 10] },
  { text: 'Hospital bill. Pay $100.', fx: ['money', -100] },
  { text: 'School fees. Pay $50.', fx: ['money', -50] },
  { text: 'Consulting gig. Collect $25.', fx: ['money', 25] },
  { text: 'Street repairs. Pay $40 per house and $115 per hotel.', fx: ['repairs', 40, 115] },
  { text: 'Second prize in a beauty contest. Collect $10.', fx: ['money', 10] },
  { text: 'You inherit $100.', fx: ['money', 100] },
  { text: 'Advance to Start.', fx: ['start'] },
  { text: 'The richest other player pays you $100 to keep a secret.', fx: ['fromRichest', 100] },
  { text: 'Lucky streak. Collect $250.', fx: ['money', 250] },
  { text: 'Rental income. Collect $15 for every property you own.', fx: ['perProp', 15] },
  { text: 'Free ticket! Advance to any city you choose.', fx: ['choose'] },
];

// Dice, card shuffles and seat order all draw from the OS's cryptographic random source.
const rnd = (n) => crypto.randomInt(n);
const shuffle = (a) => { for (let i = a.length - 1; i > 0; i--) { const j = rnd(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const isProp = (t) => t.type === 'city' || t.type === 'airport' || t.type === 'company';
const send = (ws, obj) => { if (ws.readyState === 1) ws.send(JSON.stringify(obj)); };

class Room {
  constructor(code) {
    this.code = code;
    this.clients = new Set();
    this.players = [];
    this.hostId = null;
    this.settings = {
      maxPlayers: 4, map: 'classic', doubleRent: true, vacationCash: true, auction: false,
      noRentInPrison: true, mortgage: false, evenBuild: false, startingCash: 3000, randomOrder: true,
      moveAfterPrison: false, vacationSkip: true, maxHotels: 1, airportRepeat: false, airportShared: true, airportSelf: false, airportCap: 3200, fastGame: false, teams: 0, teamNoRent: true, teamSets: true,
    };
    this.chat = [];
    this.timers = new Set();
    this.epoch = 0;
    this.botTimer = null;
    this.logId = 0;
    this.seq = 0;
    this.uid = 0;
    this.lastActive = Date.now();
    this.resetGame();
  }

  resetGame() {
    this.epoch++;
    for (const t of this.timers) clearTimeout(t);
    this.timers.clear();
    this.phase = 'lobby';
    this.turnIdx = 0;
    this.tp = 'roll';
    this.again = false;
    this.dice = [3, 4];
    this.rollId = 0;
    this.owned = {};
    this.pot = 0;
    this.trades = [];
    this.auction = null;
    this.card = null;
    this.move = null;
    this.winner = null;
    this.winTeam = null;
    this.tie = null;
    this.log = [];
    this.decks = { surprise: [], treasure: [] };
  }

  // ---------- helpers ----------
  // 'random' resolves to one of the fixed maps (chosen at game start); 'generated' uses a board dealt for this room.
  get mapId() { return this.settings.map === 'random' ? this.pickedMap || 'classic' : this.settings.map; }
  get tiles() { return this.settings.map === 'generated' && this.randomTiles ? this.randomTiles : MAPS[this.mapId].tiles; }
  cur() { return this.players[this.turnIdx]; }
  byId(id) { return this.players.find((p) => p.id === id); }
  active() { return this.players.filter((p) => !p.bankrupt); }
  isTurn(p) { return this.phase === 'playing' && p && this.cur() === p && !p.bankrupt; }
  P(p) { return { p: p.id, n: p.name, c: p.color }; }
  TL(i) { return { t: i, n: this.tiles[i].name }; }
  say(...parts) {
    if (this.history) this.history.push({ t: Date.now(), text: parts.map((x) => (typeof x === 'string' ? x : x.n)).join('') });
    this.log.push({ id: ++this.logId, parts }); if (this.log.length > 60) this.log.shift(); }
  err(client, msg) { if (client) send(client.ws, { type: 'error', msg }); }

  after(ms, fn) {
    const e = this.epoch;
    const t = setTimeout(() => {
      this.timers.delete(t);
      if (e !== this.epoch) return;
      try { fn(); } catch (err) {
        console.error(err);
        if (this.phase === 'playing') { this.tp = 'end'; this.broadcast(); }
      }
    }, ms / SPEED);
    this.timers.add(t);
  }

  setOf(i) {
    const t = this.tiles[i];
    return this.tiles.filter((x) => x.type === t.type && (t.type !== 'city' || x.cc === t.cc)).map((x) => x.i);
  }
  // In a team game teammates share sets: a set held between them counts as full for each of them.
  side(pid) { const p = this.settings.teams && this.settings.teamSets && this.byId(pid); return p ? `team${p.team}` : pid; }
  ownsSet(pid, i) { return this.setOf(i).every((j) => this.owned[j] && this.side(this.owned[j].owner) === this.side(pid)); }
  propsOf(p) { return Object.keys(this.owned).map(Number).filter((i) => this.owned[i].owner === p.id); }

  rent(i, diceSum) {
    const t = this.tiles[i], o = this.owned[i];
    if (t.type === 'city') {
      const table = rentTable(t.price);
      if (o.houses > 0) return rentAt(t.price, o.houses);
      return this.settings.doubleRent && this.ownsSet(o.owner, i) ? table[0] * 2 : table[0];
    }
    const n = this.setOf(i).filter((j) => this.owned[j] && this.side(this.owned[j].owner) === this.side(o.owner)).length;
    if (t.type === 'airport') {
      if (!this.settings.airportRepeat) return AIRPORT_RENT[Math.min(n, AIRPORT_RENT.length) - 1];
      // Per-landing rule: the count is shared by all of the owner's airports, or kept per airport.
      const visits = this.settings.airportShared ? this.byId(o.owner).airportVisits || 0 : o.visits || 0;
      return airportVisitRent(visits, this.settings.airportCap);
    }
    return COMPANY_MULT[Math.min(n, COMPANY_MULT.length) - 1] * diceSum;
  }

  pay(p, amt, to) {
    if (amt <= 0) return;
    p.money -= amt;
    if (to) { to.money += amt; this.say(this.P(p), ` paid $${amt} to `, this.P(to)); }
    else if (this.settings.vacationCash) this.pot += amt;
  }

  // ---------- state sync ----------
  state() {
    return {
      seq: ++this.seq, ver: 10, build: BUILD, emote: this.emote || null,
      debt: this.debt ? { pid: this.debt.pid, endsIn: Math.max(0, this.debt.endsAt - Date.now()) } : null,
      code: this.code, hostId: this.hostId, phase: this.phase, settings: this.settings,
      mapId: this.mapId, tiles: this.settings.map === 'generated' ? this.tiles : null, mapSeed: this.mapSeed || 0,
      players: this.players.map((p) => ({
        id: p.id, name: p.name, color: p.color, money: p.money, pos: p.pos, inJail: p.inJail, jailTurns: p.jailTurns,
        pardons: p.pardons, bankrupt: p.bankrupt, bot: p.bot, connected: p.connected, skip: !!p.skip, av: p.airportVisits || 0, team: p.team,
      })),
      turn: this.phase === 'playing' && this.cur() ? this.cur().id : null,
      tp: this.tp, again: this.again, dice: this.dice, rollId: this.rollId,
      owned: this.owned, pot: this.pot, log: this.log.slice(-40), chat: this.chat.slice(-80),
      trades: this.trades,
      auction: this.auction && { ...this.auction, endsIn: Math.max(0, this.auction.endsAt - Date.now()) },
      card: this.card, move: this.move, winner: this.winner, winTeam: this.winTeam, tie: this.tie,
      stats: this.phase === 'over' ? this.players.filter((p) => !p.bot).map((p) => STATS[p.name.toLowerCase()]).filter(Boolean) : null,
    };
  }

  broadcast() {
    this.lastActive = Date.now();
    // Fast game: a player to act who is in debt gets DEBT_GRACE ms to sell something themselves;
    // after that their least useful holdings are sold for them.
    const p = this.phase === 'playing' && this.settings.fastGame && (this.tp === 'roll' || this.tp === 'end') ? this.cur() : null;
    const owes = p && !p.bankrupt && p.money < 0 && this.propsOf(p).some((i) => !this.owned[i].mortgaged || this.owned[i].houses > 0);
    if (!owes) this.debt = null;
    else if (!this.debt || this.debt.pid !== p.id) {
      const debt = this.debt = { pid: p.id, endsAt: Date.now() + DEBT_GRACE / SPEED };
      this.after(DEBT_GRACE, () => {
        if (this.debt !== debt) return;
        this.debt = null;
        if (this.cur() === p && p.money < 0) { this.autoSell(p); this.broadcast(); }
      });
    }
    const st = this.state();
    for (const c of this.clients) send(c.ws, { type: 'state', state: st, you: c.player ? c.player.id : null });
    this.pokeBots();
  }

  // ---------- lobby ----------
  addPlayer(name, color, bot) {
    const p = {
      id: crypto.randomBytes(4).toString('hex'), token: crypto.randomBytes(12).toString('hex'),
      name, color, money: this.settings.startingCash, pos: 0, inJail: false, jailTurns: 0, pardons: 0,
      bankrupt: false, bot: !!bot, connected: true, doubles: 0, skip: false, airportVisits: 0,
      team: this.smallestTeam(),
    };
    this.players.push(p);
    if (!this.hostId && !bot) this.hostId = p.id;
    this.say(this.P(p), ' joined the game');
    return p;
  }

  // The team (1 to the room's team count) with the fewest players; ties go to the lowest number.
  smallestTeam() {
    const n = this.settings.teams || 2, size = (k) => this.players.filter((x) => x.team === k).length;
    let best = 1;
    for (let k = 2; k <= n; k++) if (size(k) < size(best)) best = k;
    return best;
  }

  removePlayer(p) {
    this.players = this.players.filter((x) => x !== p);
    for (const c of this.clients) if (c.player === p) c.player = null;
    this.say(this.P(p), ' left the game');
    this.fixHost();
  }

  fixHost() {
    const host = this.byId(this.hostId);
    if (host && host.connected && !host.bot) return;
    const next = this.players.find((p) => !p.bot && p.connected);
    if (next) this.hostId = next.id;
    else if (!host) this.hostId = null;
  }

  start() {
    if (this.settings.map === 'random') {
      const ids = Object.keys(MAPS).filter((k) => !MAPS[k].pick && !MAPS[k].random);
      this.pickedMap = ids[rnd(ids.length)];
      this.mapSeed = ++this.uid;
    }
    if (this.settings.randomOrder) shuffle(this.players);
    for (const p of this.players) Object.assign(p, { money: this.settings.startingCash, pos: 0, inJail: false, jailTurns: 0, pardons: 0, bankrupt: false, doubles: 0, skip: false, airportVisits: 0, asked: [] });
    const keepLog = this.log;
    this.resetGame();
    this.log = keepLog;
    const hasCompany = this.tiles.some((t) => t.type === 'company');
    this.cards = {
      surprise: SURPRISE.filter((c) => hasCompany || c.fx[1] !== 'company'),
      treasure: TREASURE,
    };
    this.phase = 'playing';
    this.startedAt = new Date();
    this.history = [];
    if (this.settings.map === 'random') this.say(`Random map: ${MAPS[this.pickedMap].name}`);
    this.say(`Game started${this.settings.randomOrder ? ' with a randomized players order' : ''}. Good luck!`);
  }

  // ---------- turn flow ----------
  roll(p) {
    const d = [1 + rnd(6), 1 + rnd(6)];
    this.dice = d;
    this.rollId++;
    this.tp = 'busy';
    this.card = null;
    this.broadcast();
    this.after(1150, () => this.afterRoll(p, d));
  }

  afterRoll(p, d) {
    const dbl = d[0] === d[1], sum = d[0] + d[1];
    this.again = false;
    if (p.inJail) {
      if (dbl) {
        p.inJail = false; p.jailTurns = 0;
        this.say(this.P(p), ' rolled doubles and walked out of prison');
        // Doubles always get you out and moving, whatever the "move after leaving prison" setting says,
        // but they never earn the extra roll (`again` stays false).
        return this.moveBy(p, sum);
      }
      p.jailTurns++;
      if (p.jailTurns >= 3) {
        p.inJail = false; p.jailTurns = 0;
        this.pay(p, JAIL_FEE, null);
        this.say(this.P(p), ` paid $${JAIL_FEE} to get out of prison`);
        return this.leftPrison(p) ? this.moveBy(p, sum) : this.broadcast();
      }
      this.say(this.P(p), ' failed to roll doubles and stays in prison');
      this.tp = 'end';
      return this.broadcast();
    }
    if (dbl) {
      p.doubles++;
      if (p.doubles >= 3) {
        this.say(this.P(p), ' rolled doubles three times in a row');
        return this.sendToJail(p);
      }
      this.again = true;
    }
    this.moveBy(p, sum);
  }

  // With "move after leaving prison" off, paying or using a pardon uses up the turn: the player moves on their next one.
  // (Rolling doubles in prison always moves the player; see afterRoll.)
  leftPrison(p) {
    if (this.settings.moveAfterPrison) return true;
    this.again = false;
    this.tp = 'end';
    return false;
  }

  // Announce a set the moment one player holds all of it.
  noteSet(p, i) {
    const set = this.setOf(i);
    if (set.length < 2 || !this.ownsSet(p.id, i)) return;
    const parts = [this.P(p), ' completed a set: '];
    set.forEach((j, k) => { if (k) parts.push(', '); parts.push(this.TL(j)); });
    this.say(...parts);
  }

  // Announce when a purchase takes the last property of a set whose every other property belongs to one other player.
  noteBreak(p, i) {
    const others = this.setOf(i).filter((j) => j !== i);
    if (!others.length) return;
    const first = this.owned[others[0]];
    if (!first || first.owner === p.id || !others.every((j) => this.owned[j] && this.owned[j].owner === first.owner)) return;
    this.say(this.P(p), ' broke ', this.P(this.byId(first.owner)), "'s set by taking ", this.TL(i));
  }

  moveBy(p, steps) {
    const N = this.tiles.length;
    const from = p.pos;
    const to = (((from + steps) % N) + N) % N;
    const n = Math.abs(steps);
    const ms = n > 12 ? 60 : 160;
    const passed = steps > 0 && from + steps > N;
    p.pos = to;
    this.move = { id: ++this.uid, pid: p.id, from, to, mode: steps > 0 ? 'hop' : 'back', steps: n, ms };
    this.tp = 'busy';
    this.broadcast();
    this.after(n * ms + 350, () => {
      if (passed) { p.money += PASS_START; this.say(this.P(p), ` passed Start and received $${PASS_START}`); }
      this.land(p);
    });
  }

  sendToJail(p) {
    const jail = this.tiles.findIndex((t) => t.type === 'prison');
    this.move = { id: ++this.uid, pid: p.id, from: p.pos, to: jail, mode: 'jump', steps: 0, ms: 600 };
    p.pos = jail; p.inJail = true; p.jailTurns = 0; p.doubles = 0;
    this.again = false;
    this.say(this.P(p), ' went to prison');
    this.tp = 'end';
    this.broadcast();
  }

  land(p) {
    const t = this.tiles[p.pos];
    switch (t.type) {
      case 'start':
        p.money += LAND_START;
        this.say(this.P(p), ` landed on Start and received $${LAND_START}`);
        break;
      case 'city': case 'airport': case 'company': {
        const o = this.owned[p.pos];
        if (!o) {
          // Fast game: take it without asking when affordable. When it is not, a player who owns something
          // they could sell gets the normal buy prompt so they can raise the cash; otherwise play moves on.
          if (this.settings.fastGame) {
            if (p.money >= t.price) return this.buy(p);
            const canRaise = this.propsOf(p).some((i) => !this.owned[i].mortgaged || this.owned[i].houses > 0);
            if (!canRaise) return this.settings.auction ? this.startAuction(p) : this.finish(p);
          }
          this.tp = 'buy';
          return this.broadcast();
        }
        if (o.mortgaged) break;
        const owner = this.byId(o.owner);
        // "Repeat" airports: every paid landing doubles the next rent at that airport; with airportSelf the owner's own landings do too.
        const bumpAirport = () => {
          if (this.settings.airportShared) owner.airportVisits = (owner.airportVisits || 0) + 1;
          else o.visits = (o.visits || 0) + 1;
        };
        const repeat = t.type === 'airport' && this.settings.airportRepeat;
        if (o.owner === p.id) {
          if (repeat && this.settings.airportSelf) { bumpAirport(); this.say(this.P(p), ' landed on their own airport and raised its rent'); }
          break;
        }
        if (this.settings.teams && this.settings.teamNoRent && owner.team === p.team) {
          this.say(this.P(p), ' pays no rent to teammate ', this.P(owner));
          break;
        }
        if (this.settings.noRentInPrison && owner.inJail) {
          this.say(this.P(p), ' pays no rent: ', this.P(owner), ' is in prison');
          break;
        }
        this.pay(p, this.rent(p.pos, this.dice[0] + this.dice[1]), owner);   // card moves still charge companies by the dice you rolled
        if (repeat) bumpAirport();
        break;
      }
      case 'taxpct': {
        const amt = Math.floor(Math.max(0, p.money) * t.pct / 100);
        this.pay(p, amt, null);
        this.say(this.P(p), ` paid $${amt} ${t.name}`);
        break;
      }
      case 'tax':
        this.pay(p, t.amount, null);
        this.say(this.P(p), ` paid $${t.amount} ${t.name}`);
        break;
      case 'refund':
        p.money += t.amount;
        this.say(this.P(p), ` received a $${t.amount} ${t.name}`);
        break;
      case 'treasure': case 'surprise':
        return this.drawCard(p, t.type);
      case 'gotoprison':
        return this.sendToJail(p);
      case 'vacation':
        if (this.settings.vacationCash && this.pot > 0) {
          p.money += this.pot;
          this.say(this.P(p), ` went on vacation and collected $${this.pot}`);
          this.pot = 0;
        } else this.say(this.P(p), ' went on vacation');
        // A vacation ends the turn on the spot (doubles earn no extra roll here) and costs the next turn,
        // so the player is still sitting on Vacation when that turn is skipped.
        if (this.settings.vacationSkip) { p.skip = true; this.again = false; }
        break;
      case 'prison':
        this.say(this.P(p), ' is just passing by');
        break;
    }
    this.finish(p);
  }

  // Fast game: a player in debt has their least useful holdings sold to the bank until they are solvent.
  // Order: loose properties (blocked city sets first, then lowest current rent), then buildings (tallest first),
  // then properties of full sets (lowest rent first). Mortgaged properties are skipped: selling them pays nothing.
  // With the mortgage rule on, properties are mortgaged instead of sold (same cash, and the player can lift it later).
  autoSell(p) {
    if (!p || p.bankrupt || p.money >= 0) return;
    const rentNow = (i) => this.rent(i, 7);
    const blocked = (i) => this.tiles[i].type === 'city' && this.setOf(i).some((j) => this.owned[j] && this.side(this.owned[j].owner) !== this.side(p.id));
    const sold = [], trimmed = {};
    const sellProp = (i) => {
      const amount = this.tiles[i].price / 2;
      if (this.settings.mortgage) Object.assign(this.owned[i], { mortgaged: true, mortgageTurns: MORTGAGE_TURNS });
      else delete this.owned[i];
      p.money += amount;
      sold.push([i, amount]);
    };
    for (let guard = 0; guard < 300 && p.money < 0; guard++) {
      const mine = this.propsOf(p);
      const loose = mine.filter((i) => !this.owned[i].mortgaged && !this.ownsSet(p.id, i));
      if (loose.length) {
        sellProp(loose.sort((a, b) => (blocked(b) ? 1 : 0) - (blocked(a) ? 1 : 0) || rentNow(a) - rentNow(b) || this.tiles[a].price - this.tiles[b].price)[0]);
        continue;
      }
      const built = mine.filter((i) => this.owned[i].houses > 0);
      if (built.length) {
        const i = built.sort((a, b) => this.owned[b].houses - this.owned[a].houses || this.tiles[a].price - this.tiles[b].price)[0];
        p.money += houseCost(this.tiles[i].price, this.owned[i].houses) / 2;
        this.owned[i].houses--;
        trimmed[i] = (trimmed[i] || 0) + 1;
        continue;
      }
      const rest = mine.filter((i) => !this.owned[i].mortgaged);
      if (!rest.length) break;
      sellProp(rest.sort((a, b) => rentNow(a) - rentNow(b) || this.tiles[a].price - this.tiles[b].price)[0]);
    }
    for (const [i, n] of Object.entries(trimmed)) this.say(this.P(p), ` sold ${n} building${n > 1 ? 's' : ''} on `, this.TL(+i), ' to cover a debt');
    const verb = this.settings.mortgage ? ' mortgaged ' : ' sold ';
    for (const [i, amount] of sold) this.say(this.P(p), verb, this.TL(i), ` for $${amount} to cover a debt`);
  }

  // Fast game: spend what the player has on houses and hotels, lowest building first (highest price on ties),
  // until nothing more is affordable or every city in their full sets is at the room's limit.
  autoBuild(p) {
    if (!p || p.bankrupt) return;
    const top = 4 + this.settings.maxHotels, added = {};
    for (let guard = 0; guard < 400; guard++) {
      const options = this.propsOf(p).filter((i) => {
        const t = this.tiles[i], o = this.owned[i];
        if (t.type !== 'city' || o.houses >= top || !this.ownsSet(p.id, i)) return false;
        const set = this.setOf(i);
        if (set.some((j) => this.owned[j].mortgaged)) return false;
        if (this.settings.evenBuild && o.houses > Math.min(...set.map((j) => this.owned[j].houses))) return false;
        return p.money >= houseCost(t.price, o.houses + 1);
      });
      if (!options.length) break;
      const i = options.sort((a, b) => this.owned[a].houses - this.owned[b].houses || this.tiles[b].price - this.tiles[a].price)[0];
      p.money -= houseCost(this.tiles[i].price, this.owned[i].houses + 1);
      this.owned[i].houses++;
      added[i] = true;
    }
    for (const i of Object.keys(added).map(Number)) {
      const h = this.owned[i].houses;
      const what = h > 5 ? `${h - 4} hotels` : h === 5 ? 'a hotel' : h === 1 ? '1 house' : `${h} houses`;
      this.say(this.P(p), ' built ', this.TL(i), ` up to ${what}`);
    }
  }

  finish(p) {
    if (this.phase !== 'playing' || p.bankrupt) return;
    if (this.settings.fastGame) this.autoBuild(p);
    this.tp = this.again && !p.inJail ? 'roll' : 'end';
    this.broadcast();
  }

  drawCard(p, type) {
    if (!this.decks[type].length) this.decks[type] = shuffle(this.cards[type].slice());
    const c = this.decks[type].pop();
    this.card = { id: ++this.uid, type, text: c.text, tile: p.pos };
    this.say(this.P(p), ` got a ${type} card: ${c.text}`);
    this.broadcast();
    this.after(1300, () => this.applyCard(p, c));
  }

  applyCard(p, c) {
    const [k, a, b] = c.fx;
    const N = this.tiles.length;
    switch (k) {
      case 'money':
        if (a > 0) p.money += a; else this.pay(p, -a, null);
        break;
      case 'payEach':
        for (const o of this.active()) if (o !== p) this.pay(p, a, o);
        break;
      case 'collectEach':
        for (const o of this.active()) if (o !== p) this.pay(o, a, p);
        break;
      case 'repairs': {
        let total = 0;
        for (const i of this.propsOf(p)) { const h = this.owned[i].houses; total += h >= 5 ? b * (h - 4) : h * a; }
        this.pay(p, total, null);
        if (total) this.say(this.P(p), ` paid $${total} for repairs`);
        break;
      }
      case 'pardon': p.pardons++; break;
      case 'jail': return this.sendToJail(p);
      case 'start': return this.moveBy(p, N - p.pos);
      case 'back': return this.moveBy(p, -a);
      case 'nearest': {
        for (let d = 1; d < N; d++) if (this.tiles[(p.pos + d) % N].type === a) return this.moveBy(p, d);
        break;
      }
      case 'priciest': {
        const best = this.tiles.filter((t) => t.type === 'city').sort((x, y) => y.price - x.price)[0];
        const d = (best.i - p.pos + N) % N;
        if (d) return this.moveBy(p, d);
        break;
      }
      case 'forward': return this.moveBy(p, a);
      case 'topRent': {
        // What landing would cost right now: houses, hotels and full-set bonus count; an unbought city counts its base rent.
        let best = -1, bestRent = -1;
        for (let d = 1; d < N; d++) {
          const i = (p.pos + d) % N, o = this.owned[i];
          if (this.tiles[i].type !== 'city') continue;
          const r = !o ? rentTable(this.tiles[i].price)[0] : o.mortgaged ? 0 : this.rent(i, 7);
          if (r > bestRent) { best = d; bestRent = r; }   // strictly greater: the nearest one wins a tie
        }
        if (best > 0) return this.moveBy(p, best);
        break;
      }
      case 'choose':
        if (p.bot) return this.gotoCity(p, this.botPickCity(p));
        this.tp = 'pickCity';
        return this.broadcast();
      case 'perProp': {
        const n = this.propsOf(p).length;
        if (n) { p.money += n * a; this.say(this.P(p), ` collected $${n * a} for ${n} ${n === 1 ? 'property' : 'properties'}`); }
        break;
      }
      case 'fromRichest': {
        const rich = this.active().filter((o) => o !== p).sort((x, y) => y.money - x.money)[0];
        if (rich) this.pay(rich, a, p);
        break;
      }
    }
    this.finish(p);
  }

  // "Advance to any city": move forward to the chosen city (passing Start pays as usual).
  gotoCity(p, i) {
    const N = this.tiles.length, d = (i - p.pos + N) % N;
    this.say(this.P(p), ' chose to travel to ', this.TL(i));
    return d ? this.moveBy(p, d) : this.land(p);
  }

  // A bot spends a free ticket on the best unbought city it can afford (sets it is building or blocking first);
  // failing that it heads for one of its own cities, and failing that the cheapest rent on the board.
  botPickCity(p) {
    const score = (i) => {
      const t = this.tiles[i], o = this.owned[i];
      if (!o) return p.money >= t.price ? 1e6 + this.stake(p.id, i) * 1e4 + t.price : -rentTable(t.price)[0];
      if (this.side(o.owner) === this.side(p.id) || o.mortgaged) return 5e5;
      return -this.rent(i, 7);
    };
    return this.tiles.filter((t) => t.type === 'city').map((t) => t.i).sort((x, y) => score(y) - score(x))[0];
  }

  buy(p) {
    const t = this.tiles[p.pos];
    p.money -= t.price;
    this.owned[p.pos] = { owner: p.id, houses: 0, mortgaged: false };
    this.say(this.P(p), ' bought ', this.TL(p.pos));
    this.noteSet(p, p.pos);
    this.noteBreak(p, p.pos);
    this.finish(p);
  }

  startAuction(p) {
    this.auction = { id: ++this.uid, tile: p.pos, bid: 0, bidder: null, endsAt: Date.now() + 9000 / SPEED };
    this.tp = 'auction';
    this.say('Auction started for ', this.TL(p.pos));
    this.armAuction();
    this.broadcast();
  }

  armAuction() {
    const a = this.auction;
    this.after(Math.max(50, a.endsAt - Date.now()) * SPEED, () => {
      if (this.auction !== a) return;
      if (Date.now() < a.endsAt - 5) return this.armAuction();
      const w = a.bidder && this.byId(a.bidder);
      if (w && !w.bankrupt) {
        w.money -= a.bid;
        this.owned[a.tile] = { owner: w.id, houses: 0, mortgaged: false };
        this.say(this.P(w), ' won the auction for ', this.TL(a.tile), ` with $${a.bid}`);
        this.noteSet(w, a.tile);
        this.noteBreak(w, a.tile);
      } else this.say('Nobody bid on ', this.TL(a.tile));
      this.auction = null;
      this.finish(this.cur());
    });
  }

  bid(p, add) {
    const a = this.auction;
    if (!a || this.tp !== 'auction' || p.bankrupt || a.bidder === p.id) return false;
    const next = a.bid + add;
    if (p.money < next) return false;
    a.bid = next; a.bidder = p.id;
    a.endsAt = Date.now() + 6000 / SPEED;
    return true;
  }

  nextTurn() {
    this.epoch++;
    const c = this.cur();
    if (c) c.doubles = 0;
    this.debt = null;
    // Count down the mortgages of the player whose turn just ended; expired ones return to the bank.
    if (c && !c.bankrupt) {
      for (const i of this.propsOf(c)) {
        const o = this.owned[i];
        if (!o.mortgaged || o.mortgageTurns === undefined) continue;
        if (--o.mortgageTurns <= 0) {
          delete this.owned[i];
          this.say('The mortgage on ', this.TL(i), ' ran out: ', this.P(c), ' lost it to the bank');
        }
      }
    }
    this.auction = null;
    this.again = false;
    let i = this.turnIdx;
    for (let k = 0; k < this.players.length * 2 + 1; k++) {
      i = (i + 1) % this.players.length;
      const q = this.players[i];
      if (q.bankrupt) continue;
      if (q.skip) {
        q.skip = false;
        // Only skip someone who is actually still on Vacation.
        if (this.tiles[q.pos].type === 'vacation') { this.say(this.P(q), ' is on vacation and skips this turn'); continue; }
      }
      break;
    }
    this.turnIdx = i;
    this.tp = 'roll';
    if (this.settings.fastGame) this.autoBuild(this.cur());
    this.broadcast();
  }

  bankrupt(p) {
    if (p.bankrupt || this.phase !== 'playing') return;
    const wasTurn = this.cur() === p;
    for (const i of this.propsOf(p)) delete this.owned[i];
    p.bankrupt = true; p.money = 0; p.inJail = false;
    this.trades = this.trades.filter((t) => t.from !== p.id && t.to !== p.id);
    if (this.auction && this.auction.bidder === p.id) { this.auction.bidder = null; this.auction.bid = 0; }
    this.say(this.P(p), ' went bankrupt');
    this.tie = null;
    const left = this.active().sort((a, b) => b.money - a.money);
    if (left.length <= 1 || (this.settings.teams && left.every((x) => x.team === left[0].team))) {
      this.epoch++;
      this.phase = 'over';
      this.auction = null;
      this.winner = left[0] ? left[0].id : null;   // in a team game, the richest player of the winning team
      if (this.settings.teams && left[0]) { this.winTeam = left[0].team; this.say(`Team ${left[0].team} won the game! 🏆`); }
      else if (left[0]) this.say(this.P(left[0]), ' won the game! 🏆');
      this.recordStats();
      return this.broadcast();
    }
    if (wasTurn) return this.nextTurn();
    this.broadcast();
  }

  tieCheck() {
    if (this.active().some((x) => !x.bot && !this.tie.yes.includes(x.id))) return this.broadcast();
    this.epoch++;
    this.phase = 'over';
    this.auction = null;
    this.say('The game ended in a tie 🤝');
    this.recordStats();
    this.broadcast();
  }

  // Every person (not bot) still seated when the game ends gets a game; the last one standing gets the win.
  // A game with fewer than two people (one person against bots) is logged but not counted.
  recordStats() {
    const counted = this.players.filter((p) => !p.bot).length >= 2;
    this.saveLog(this.tie ? 'tie' : 'win', counted);
    if (!counted) return;
    for (const p of this.players) {
      if (p.bot) continue;
      const k = p.name.toLowerCase(), r = STATS[k] ||= { name: p.name, games: 0, wins: 0, best: 0, last: 0 };
      r.games++; r.last = Date.now();
      if (this.winTeam ? p.team === this.winTeam : p.id === this.winner) { r.wins++; r.best = Math.max(r.best, p.money); }
    }
    saveStats();
  }

  saveLog(result, counted) {
    const d = this.startedAt, two = (n) => String(n).padStart(2, '0');
    saveGameLog(`${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}_${two(d.getHours())}-${two(d.getMinutes())}-${two(d.getSeconds())}`, {
      room: this.code, startedAt: d.toISOString(), endedAt: new Date().toISOString(), result, counted,
      winner: result === 'win' && this.byId(this.winner) ? this.byId(this.winner).name : null, winTeam: this.winTeam,
      map: this.mapId, settings: this.settings,
      players: this.players.map((p) => ({ name: p.name, bot: p.bot, team: this.settings.teams ? p.team : undefined, money: p.money, bankrupt: p.bankrupt, properties: this.propsOf(p).length })),
      log: this.history,
    });
  }

  // ---------- property management ----------
  manage(client, p, kind, i) {
    const t = this.tiles[i], o = this.owned[i];
    if (!this.isTurn(p) || this.tp === 'busy') return this.err(client, 'You can manage properties only during your turn');
    if (!t || !o || o.owner !== p.id) return this.err(client, 'You do not own this property');
    const set = this.setOf(i);
    const setHouses = set.map((j) => (this.owned[j] ? this.owned[j].houses : 0));
    const cost = houseCost(t.price, o && o.houses + 1);
    switch (kind) {
      case 'build':
        if (t.type !== 'city') return this.err(client, 'You can build only on cities');
        if (!this.ownsSet(p.id, i)) return this.err(client, 'You need the full set to build');
        if (set.some((j) => this.owned[j].mortgaged)) return this.err(client, 'Unmortgage the whole set first');
        if (o.houses >= 4 + this.settings.maxHotels) return this.err(client, this.settings.maxHotels > 1 ? 'Already has the maximum number of hotels' : 'Already has a hotel');
        if (this.settings.evenBuild && o.houses > Math.min(...setHouses)) return this.err(client, 'Build evenly across the set');
        if (p.money < cost) return this.err(client, 'Not enough money');
        p.money -= cost; o.houses++;
        this.say(this.P(p), o.houses >= 5 ? ' built a hotel in ' : ' built a house in ', this.TL(i));
        break;
      case 'sellHouse':
        if (!o.houses) return;
        if (this.settings.evenBuild && o.houses < Math.max(...setHouses)) return this.err(client, 'Sell evenly across the set');
        p.money += houseCost(t.price, o.houses) / 2; o.houses--;
        this.say(this.P(p), ' downgraded ', this.TL(i));
        break;
      case 'mortgage':
        if (!this.settings.mortgage) return this.err(client, 'Mortgage is disabled in this room');
        if (o.mortgaged) return;
        if (Math.max(...setHouses) > 0) return this.err(client, 'Sell the buildings in this set first');
        o.mortgaged = true; o.mortgageTurns = MORTGAGE_TURNS; p.money += t.price / 2;
        this.say(this.P(p), ' mortgaged ', this.TL(i), ` for $${t.price / 2}`);
        break;
      case 'unmortgage': {
        if (!o.mortgaged) return;
        const fee = Math.round(t.price * 0.55);
        if (p.money < fee) return this.err(client, 'Not enough money');
        o.mortgaged = false; delete o.mortgageTurns; p.money -= fee;
        this.say(this.P(p), ' unmortgaged ', this.TL(i));
        break;
      }
      case 'sellProp':
        if (Math.max(...setHouses) > 0) return this.err(client, 'Sell the buildings in this set first');
        delete this.owned[i];
        p.money += o.mortgaged ? 0 : t.price / 2;
        this.say(this.P(p), ' sold ', this.TL(i));
        break;
      default: return;
    }
    this.broadcast();
  }

  // ---------- trades ----------
  validTrade(tr) {
    const a = this.byId(tr.from), b = this.byId(tr.to);
    if (!a || !b || a === b || a.bankrupt || b.bankrupt) return false;
    if (a.money < tr.give.money || b.money < tr.get.money) return false;
    const ok = (pid, props) => props.every((i) => this.owned[i] && this.owned[i].owner === pid
      && !this.setOf(i).some((j) => this.owned[j] && this.owned[j].houses > 0));
    return ok(a.id, tr.give.props) && ok(b.id, tr.get.props);
  }

  acceptTrade(tr) {
    const a = this.byId(tr.from), b = this.byId(tr.to);
    a.money += tr.get.money - tr.give.money;
    b.money += tr.give.money - tr.get.money;
    for (const i of tr.give.props) this.owned[i].owner = b.id;
    for (const i of tr.get.props) this.owned[i].owner = a.id;
    this.trades = this.trades.filter((t) => t !== tr);
    this.say(this.P(b), ' accepted a trade with ', this.P(a));
    const seen = new Set();
    for (const [who, props] of [[b, tr.give.props], [a, tr.get.props]]) {
      for (const i of props) {
        const key = this.setOf(i).join();
        if (!seen.has(key)) { seen.add(key); this.noteSet(who, i); }
      }
    }
    this.trades = this.trades.filter((t) => this.validTrade(t));
  }

  // ---------- bots ----------
  pokeBots() {
    if (this.botTimer || this.phase !== 'playing') return;
    if (!this.players.some((p) => p.bot && !p.bankrupt)) return;
    this.botTimer = setTimeout(() => {
      this.botTimer = null;
      try { this.botTick(); } catch (e) { console.error(e); }
    }, (750 + rnd(500)) / SPEED);
  }

  // How much a property matters to a player, as a multiple of its price. Blocking an opponent who holds the
  // rest of a set ranks above completing the bot's own set: an opponent's full set is what loses games.
  // `owner` maps a tile to its owner id, so a trade can be scored on the ownership it would leave behind.
  stake(pid, i, owner = (j) => this.owned[j] && this.owned[j].owner) {
    pid = this.side(pid);
    const others = this.setOf(i).filter((j) => j !== i).map((j) => owner(j) && this.side(owner(j)));
    if (!others.length) return 1;
    const rival = others.find((o) => o && o !== pid);
    const onlyRival = rival && others.every((o) => !o || o === rival);
    if (onlyRival && others.every((o) => o === rival)) return 2.5;          // blocks an opponent's set
    if (others.every((o) => o === pid)) return 2;                            // completes our own set
    if (onlyRival && others.filter((o) => o === rival).length * 2 >= others.length) return 1.5;   // an opponent is collecting it
    if (others.every((o) => !o || o === pid) && others.includes(pid)) return 1.3;                  // we are collecting it
    return 1;
  }

  // Rent per landing that tile i's group (its city set, or every airport or company) earns `pid`'s side,
  // with `owner` mapping a tile to its owner id. Counts the full-set bonus, the airport and company count,
  // and the per-landing airport counters (the owner's own when shared, the airport's own otherwise).
  groupRent(pid, i, owner) {
    const set = this.setOf(i), ours = set.filter((j) => owner(j) && this.side(owner(j)) === this.side(pid));
    const t = this.tiles[i], n = ours.length;
    if (!n) return 0;
    if (t.type === 'city') {
      const full = this.settings.doubleRent && n === set.length ? 2 : 1;
      return ours.reduce((sum, j) => sum + rentTable(this.tiles[j].price)[0] * full, 0);
    }
    if (t.type === 'company') return n * COMPANY_MULT[Math.min(n, COMPANY_MULT.length) - 1] * 7;
    if (!this.settings.airportRepeat) return n * AIRPORT_RENT[Math.min(n, AIRPORT_RENT.length) - 1];
    return ours.reduce((sum, j) => sum + airportVisitRent(
      this.settings.airportShared ? this.byId(owner(j)).airportVisits || 0 : this.owned[j].visits || 0, this.settings.airportCap), 0);
  }

  // What tile i is worth to `pid` under the ownership `owner`: its price weighed by its stake,
  // plus the rent the whole group gains from it over the landings still to come.
  tileWorth(pid, i, owner) {
    const without = (j) => (j === i ? null : owner(j));
    return this.tiles[i].price * this.stake(pid, i, owner) + TRADE_LANDINGS * (this.groupRent(pid, i, owner) - this.groupRent(pid, i, without));
  }

  // A bot's answer to a trade offered to it. A teammate's offer is always taken: the team plans together.
  // It never hands an opponent a full set, whatever the price; otherwise each property is weighed by
  // what it is worth to the bot and to the rival, and the bot wants a margin on top.
  botWantsTrade(tr) {
    if (!this.validTrade(tr)) return { ok: false };
    const bot = tr.to, rival = tr.from;
    if (this.settings.teams && this.byId(bot).team === this.byId(rival).team) return { ok: true };
    const now = (j) => this.owned[j] && this.owned[j].owner;
    const after = (j) => (tr.give.props.includes(j) ? bot : tr.get.props.includes(j) ? rival : now(j));
    const theirs = (j, f) => f(j) && this.side(f(j)) === this.side(rival);
    const completes = tr.get.props.some((i) => !this.setOf(i).every((j) => theirs(j, now)) && this.setOf(i).every((j) => theirs(j, after)));
    if (completes) return { ok: false, why: 'it would complete their set' };
    const gain = tr.give.money + tr.give.props.reduce((sum, i) => sum + this.tileWorth(bot, i, after), 0);
    const cost = tr.get.money + tr.get.props.reduce((sum, i) => sum + Math.max(this.tileWorth(bot, i, now), this.tileWorth(rival, i, after)), 0);
    return { ok: gain >= cost * 1.15 };
  }

  raiseFunds(p) {
    let guard = 200;
    while (p.money < 0 && guard-- > 0) {
      const mine = this.propsOf(p);
      const withHouse = mine.filter((i) => this.owned[i].houses > 0).sort((x, y) => this.owned[y].houses - this.owned[x].houses)[0];
      if (withHouse !== undefined) { p.money += houseCost(this.tiles[withHouse].price, this.owned[withHouse].houses--) / 2; continue; }
      // give up the least strategic property first, so blocking tiles are the last to go
      const worth = (i) => this.tiles[i].price * this.stake(p.id, i);
      const free = mine.filter((i) => !this.owned[i].mortgaged).sort((x, y) => worth(x) - worth(y))[0];
      if (free === undefined) break;
      if (this.settings.mortgage) { this.owned[free].mortgaged = true; this.owned[free].mortgageTurns = MORTGAGE_TURNS; p.money += this.tiles[free].price / 2; this.say(this.P(p), ' mortgaged ', this.TL(free)); }
      else { delete this.owned[free]; p.money += this.tiles[free].price / 2; this.say(this.P(p), ' sold ', this.TL(free)); }
    }
    return p.money >= 0;
  }

  botBuild(p) {
    for (;;) {
      const options = this.propsOf(p).filter((i) => {
        const t = this.tiles[i], o = this.owned[i];
        if (t.type !== 'city' || o.houses >= 4 + this.settings.maxHotels || !this.ownsSet(p.id, i)) return false;
        const set = this.setOf(i);
        if (set.some((j) => this.owned[j].mortgaged)) return false;
        if (this.settings.evenBuild && o.houses > Math.min(...set.map((j) => this.owned[j].houses))) return false;
        return p.money - houseCost(t.price, o.houses + 1) >= 250;
      });
      if (!options.length) return;
      const i = options.sort((x, y) => this.tiles[y].price - this.tiles[x].price)[0];
      p.money -= houseCost(this.tiles[i].price, this.owned[i].houses + 1);
      this.owned[i].houses++;
      this.say(this.P(p), this.owned[i].houses >= 5 ? ' built a hotel in ' : ' built a house in ', this.TL(i));
    }
  }

  // Team play: a bot covers a teammate's debt from its spare cash (keeping $200), or hands a teammate the
  // last city of a set they hold the rest of. One gift per tick, like every other bot action.
  botHelpTeam() {
    if (!this.settings.teams) return false;
    for (const b of this.active().filter((x) => x.bot)) {
      const mates = this.active().filter((x) => x !== b && x.team === b.team);
      const broke = mates.find((m) => m.money < 0);
      const give = broke && Math.min(-broke.money, b.money - 200);
      if (give > 0) {
        b.money -= give; broke.money += give;
        this.say(this.P(b), ` gave $${give} to teammate `, this.P(broke));
        return true;
      }
      for (const i of this.propsOf(b)) {
        if (this.tiles[i].type !== 'city' || this.owned[i].mortgaged) continue;
        const rest = this.setOf(i).filter((j) => j !== i);
        if (this.setOf(i).some((j) => this.owned[j] && this.owned[j].houses > 0)) continue;
        const m = rest.length && mates.find((x) => rest.every((j) => this.owned[j] && this.owned[j].owner === x.id));
        if (!m) continue;
        this.owned[i].owner = m.id;
        this.say(this.P(b), ' gave ', this.TL(i), ' to teammate ', this.P(m), ' to complete their set');
        this.noteSet(m, i);
        this.trades = this.trades.filter((t) => this.validTrade(t));
        return true;
      }
    }
    return false;
  }

  // On its turn a bot that holds all but one city of a set offers a person who owns the last one
  // twice its price (if it can spare that and keep $200). It asks each owner for each city once per game.
  botOffer(p) {
    if (this.trades.some((t) => t.from === p.id)) return false;
    for (const i of Object.keys(this.owned).map(Number)) {
      const o = this.owned[i], owner = this.byId(o.owner);
      if (this.tiles[i].type !== 'city' || !owner || owner.bot || this.side(owner.id) === this.side(p.id)) continue;
      if (!this.setOf(i).every((j) => j === i || (this.owned[j] && this.side(this.owned[j].owner) === this.side(p.id)))) continue;
      const key = `${i}:${owner.id}`, money = Math.floor(this.tiles[i].price * 2 / 10) * 10;
      if ((p.asked ||= []).includes(key) || p.money - money < 200) continue;
      const tr = { id: crypto.randomBytes(4).toString('hex'), from: p.id, to: owner.id, give: { money, props: [] }, get: { money: 0, props: [i] } };
      if (!this.validTrade(tr)) continue;
      p.asked.push(key);
      this.trades.push(tr);
      this.say(this.P(p), ' offered a trade to ', this.P(owner));
      return true;
    }
    return false;
  }

  botTick() {
    if (this.phase !== 'playing') return;
    if (!this.players.some((p) => !p.bot && p.connected)) return; // nobody watching: pause
    const tr = this.trades.find((t) => this.byId(t.to) && this.byId(t.to).bot);
    if (tr) {
      const answer = this.botWantsTrade(tr);
      if (answer.ok) this.acceptTrade(tr);
      else {
        this.trades = this.trades.filter((t) => t !== tr);
        this.say(this.P(this.byId(tr.to)), ' declined a trade from ', this.P(this.byId(tr.from)), answer.why ? `: ${answer.why}` : '');
      }
      return this.broadcast();
    }
    if (this.tp === 'auction' && this.auction) {
      const a = this.auction, price = this.tiles[a.tile].price;
      const bidders = this.active().filter((b) => b.bot && a.bidder !== b.id);
      for (const b of shuffle(bidders)) {
        // bid higher for a tile that blocks an opponent's set or completes our own, and keep less cash back for it
        const k = this.stake(b.id, a.tile);
        const limit = Math.min(price * 0.85 * k, b.money - (k >= 2 ? 20 : 120));
        const add = a.bid + 100 <= limit * 0.6 ? 100 : 10;
        if (a.bid + add <= limit && this.bid(b, add)) return this.broadcast();
      }
      return;
    }
    if (this.botHelpTeam()) return this.broadcast();
    const p = this.cur();
    if (!p || !p.bot || p.bankrupt) return;
    if (this.tp === 'roll' && this.botOffer(p)) return this.broadcast();
    if (this.tp === 'roll') {
      if (p.money < 0 && !this.raiseFunds(p)) return this.bankrupt(p);
      const jailed = p.inJail;
      if (p.inJail && p.pardons > 0) { p.pardons--; p.inJail = false; p.jailTurns = 0; this.say(this.P(p), ' used a pardon card'); }
      else if (p.inJail && p.money > 500) { this.pay(p, JAIL_FEE, null); p.inJail = false; p.jailTurns = 0; this.say(this.P(p), ` paid $${JAIL_FEE} to get out of prison`); }
      if (jailed && !p.inJail && !this.leftPrison(p)) return this.broadcast();
      this.botBuild(p);
      return this.roll(p);
    }
    if (this.tp === 'pickCity') return this.gotoCity(p, this.botPickCity(p));
    if (this.tp === 'buy') {
      const t = this.tiles[p.pos], k = this.stake(p.id, p.pos);
      // a blocking or set-completing tile is worth spending down to the last dollar
      if (p.money - t.price >= (k >= 2 ? 0 : k > 1 ? 30 : 60)) return this.buy(p);
      return this.settings.auction ? this.startAuction(p) : this.finish(p);
    }
    if (this.tp === 'end') {
      if (p.money < 0 && !this.raiseFunds(p)) return this.bankrupt(p);
      for (const i of this.propsOf(p)) {
        const o = this.owned[i], fee = Math.round(this.tiles[i].price * 0.55);
        if (o.mortgaged && p.money - fee >= 300) { o.mortgaged = false; delete o.mortgageTurns; p.money -= fee; this.say(this.P(p), ' unmortgaged ', this.TL(i)); }
      }
      this.botBuild(p);
      return this.nextTurn();
    }
  }

  // ---------- client messages ----------
  handle(client, m) {
    const p = client.player;
    const host = p && p.id === this.hostId;
    switch (m.type) {
      case 'join': {
        if (p) return;
        if (this.phase !== 'lobby') return this.err(client, 'The game already started — you are spectating');
        if (this.players.length >= this.settings.maxPlayers) return this.err(client, 'The room is full');
        if (!COLORS.includes(m.color) || this.players.some((x) => x.color === m.color)) return this.err(client, 'That appearance is taken');
        const name = String(m.name || '').replace(/\s+/g, ' ').trim().slice(0, 16) || 'Player';
        client.player = this.addPlayer(name, m.color, false);
        send(client.ws, { type: 'joined', id: client.player.id, token: client.player.token });
        return this.broadcast();
      }
      case 'goto': {
        const i = m.tile;
        if (!this.isTurn(p) || this.tp !== 'pickCity') return;
        if (!Number.isInteger(i) || !this.tiles[i] || this.tiles[i].type !== 'city') return this.err(client, 'Pick a city');
        return this.gotoCity(p, i);
      }
      case 'appearance':
        if (!p || p.bankrupt || this.phase === 'over') return;
        if (!COLORS.includes(m.color) || this.players.some((x) => x.color === m.color)) return this.err(client, 'That appearance is taken');
        p.color = m.color;
        return this.broadcast();
      case 'emote': {
        // a reaction that bursts over the player's token on every screen; at most one per player every 0.7s
        if (!p || !EMOTES.includes(m.e) || Date.now() - (p.lastEmote || 0) < 700) return;
        p.lastEmote = Date.now();
        this.emote = { id: ++this.logId, pid: p.id, e: m.e };
        return this.broadcast();
      }
      case 'chat': {
        if (!p) return;
        const text = String(m.text || '').trim().slice(0, 200);
        if (!text) return;
        this.chat.push({ id: ++this.logId, pid: p.id, name: p.name, color: p.color, text });
        if (this.chat.length > 120) this.chat.shift();
        return this.broadcast();
      }
      case 'setting': {
        if (!host || this.phase !== 'lobby') return;
        const s = this.settings, v = m.value;
        const bools = ['doubleRent', 'vacationCash', 'auction', 'noRentInPrison', 'mortgage', 'evenBuild', 'randomOrder', 'moveAfterPrison', 'airportRepeat', 'airportShared', 'airportSelf', 'vacationSkip', 'fastGame', 'teamNoRent', 'teamSets'];
        if (bools.includes(m.key)) s[m.key] = !!v;
        else if (m.key === 'maxPlayers' && Number.isInteger(v) && v >= 2 && v <= 8 && v >= this.players.length) s.maxPlayers = v;
        else if (m.key === 'startingCash' && [500, 1000, 1500, 2000, 2500, 3000, 5000, 10000].includes(v)) s.startingCash = v;
        else if (m.key === 'teams' && [0, 2, 3, 4].includes(v)) {
          s.teams = v;
          // players on a team that no longer exists move to the smallest remaining one
          for (const x of this.players) if (x.team > (v || 2)) { x.team = 0; x.team = this.smallestTeam(); }
        }
        else if (m.key === 'maxHotels' && [1, 2, 3, 4, 5].includes(v)) s.maxHotels = v;
        else if (m.key === 'airportCap' && AIRPORT_CAPS.includes(v)) s.airportCap = v;
        else if (m.key === 'map' && MAPS[v]) {
          s.map = v;
          // Picking Generated (again) deals a fresh board; every client gets the layout in the state.
          if (v === 'generated') { this.randomTiles = randomMap(); this.mapSeed = ++this.uid; }
        }
        return this.broadcast();
      }
      case 'addBot': {
        if (!host || this.phase !== 'lobby') return;
        if (this.players.length >= this.settings.maxPlayers) return this.err(client, 'The room is full');
        const unused = (list) => list.filter((c) => !this.players.some((x) => x.color === c));
        const color = shuffle(unused(SKIN_COLORS).length ? unused(SKIN_COLORS) : unused(COLORS))[0];
        let name;
        do { name = `${BOT_A[rnd(BOT_A.length)]} ${BOT_B[rnd(BOT_B.length)]}`; } while (this.players.some((x) => x.name === name));
        this.addPlayer(name, color, true);
        return this.broadcast();
      }
      case 'team': {
        // In the lobby a player switches their own team; the host can move anyone, bots included.
        const target = this.byId(m.id);
        if (!target || this.phase !== 'lobby' || !Number.isInteger(m.team) || m.team < 1 || m.team > this.settings.teams || (target !== p && !host)) return;
        target.team = m.team;
        return this.broadcast();
      }
      case 'passHost': {
        // The host hands the role to another human player who is currently connected.
        const target = this.byId(m.id);
        if (!host || !target || target === p || target.bot || !target.connected) return;
        this.hostId = target.id;
        this.say(this.P(p), ' made ', this.P(target), ' the host');
        return this.broadcast();
      }
      case 'kick': {
        const target = this.byId(m.id);
        if (!host || !target || target === p) return;
        if (this.phase === 'lobby') this.removePlayer(target);
        else if (this.phase === 'playing') { this.say(this.P(target), ' was removed by the host'); return this.bankrupt(target); }
        return this.broadcast();
      }
      case 'start':
        if (!host || this.phase !== 'lobby') return;
        if (this.players.length < 2) return this.err(client, 'You need at least 2 players (add a bot or invite a friend)');
        if (this.settings.teams && new Set(this.players.map((x) => x.team)).size < 2) return this.err(client, 'Players need to be on at least two different teams');
        this.start();
        return this.broadcast();
      case 'lobby':
        if (!host || this.phase !== 'over') return;
        this.resetGame();
        this.players = this.players.filter((x) => x.bot || x.connected);
        this.fixHost();
        for (const x of this.players) Object.assign(x, { money: this.settings.startingCash, pos: 0, inJail: false, jailTurns: 0, pardons: 0, bankrupt: false, doubles: 0, skip: false, airportVisits: 0 });
        return this.broadcast();
    }

    // Everything below is in-game only.
    if (!p || this.phase !== 'playing' || p.bankrupt) return;
    const myTurn = this.isTurn(p);
    switch (m.type) {
      case 'roll':
        if (!myTurn || this.tp !== 'roll') return;
        if (p.money < 0) return this.err(client, 'You are in debt — raise money first');
        return this.roll(p);
      case 'payJail':
        if (!myTurn || this.tp !== 'roll' || !p.inJail) return;
        if (p.money < JAIL_FEE) return this.err(client, 'Not enough money');
        this.pay(p, JAIL_FEE, null); p.inJail = false; p.jailTurns = 0;
        this.say(this.P(p), ` paid $${JAIL_FEE} to get out of prison`);
        this.leftPrison(p);
        return this.broadcast();
      case 'usePardon':
        if (!myTurn || this.tp !== 'roll' || !p.inJail || p.pardons < 1) return;
        p.pardons--; p.inJail = false; p.jailTurns = 0;
        this.say(this.P(p), ' used a pardon card');
        this.leftPrison(p);
        return this.broadcast();
      case 'buy':
        if (!myTurn || this.tp !== 'buy') return;
        if (p.money < this.tiles[p.pos].price) return this.err(client, 'Not enough money');
        return this.buy(p);
      case 'skip':
        if (!myTurn || this.tp !== 'buy') return;
        return this.settings.auction ? this.startAuction(p) : this.finish(p);
      case 'bid':
        if (![2, 10, 100].includes(m.add)) return;
        if (!this.bid(p, m.add)) return this.err(client, 'You cannot place that bid');
        return this.broadcast();
      case 'endTurn':
        if (!myTurn || this.tp !== 'end') return;
        if (p.money < 0) return this.err(client, 'You are in debt — raise money or declare bankruptcy');
        return this.nextTurn();
      case 'build': case 'sellHouse': case 'mortgage': case 'unmortgage': case 'sellProp':
        return this.manage(client, p, m.type, m.tile);
      case 'sellAll': {
        // Sell every building and property to the bank at once, for the same amounts as selling them one by one.
        if (!myTurn || this.tp === 'busy') return this.err(client, 'You can sell only during your turn');
        const mine = this.propsOf(p);
        if (!mine.length) return;
        let total = 0;
        for (const i of mine) {
          const o = this.owned[i], t = this.tiles[i];
          total += builtCost(t.price, o.houses) / 2 + (o.mortgaged ? 0 : t.price / 2);
          delete this.owned[i];
        }
        p.money += total;
        this.say(this.P(p), ` sold all ${mine.length} properties to the bank for $${total}`);
        return this.broadcast();
      }
      case 'bankrupt':
        if (myTurn && this.tp === 'busy') return;
        return this.bankrupt(p);
      case 'tieOffer':
        // Every other person still in the game must accept; bots do not get a say.
        if (p.bot || this.tie) return;
        this.tie = { from: p.id, yes: [p.id] };
        this.say(this.P(p), ' proposed a tie');
        return this.tieCheck();
      case 'tieAccept':
        if (!this.tie || this.tie.yes.includes(p.id)) return;
        this.tie.yes.push(p.id);
        return this.tieCheck();
      case 'tieDecline':
        if (!this.tie) return;
        this.say(this.P(p), this.tie.from === p.id ? ' withdrew the tie' : ' declined the tie');
        this.tie = null;
        return this.broadcast();
      case 'trade': {
        const clean = (s) => ({
          money: Math.max(0, Math.floor(Number(s && s.money) || 0)),
          props: [...new Set(Array.isArray(s && s.props) ? s.props.filter((i) => Number.isInteger(i) && this.owned[i]) : [])],
        });
        const tr = { id: crypto.randomBytes(4).toString('hex'), from: p.id, to: String(m.to), give: clean(m.give), get: clean(m.get) };
        if (!tr.give.money && !tr.get.money && !tr.give.props.length && !tr.get.props.length) return this.err(client, 'The trade is empty');
        if (!this.validTrade(tr)) return this.err(client, 'That trade is not possible (check money and buildings)');
        this.trades.push(tr);
        this.say(this.P(p), ' offered a trade to ', this.P(this.byId(tr.to)));
        return this.broadcast();
      }
      case 'tradeAccept': case 'tradeDecline': case 'tradeCancel': {
        const tr = this.trades.find((t) => t.id === m.id);
        if (!tr) return;
        if (m.type === 'tradeCancel') {
          if (tr.from !== p.id) return;
          this.trades = this.trades.filter((t) => t !== tr);
        } else {
          if (tr.to !== p.id) return;
          if (m.type === 'tradeAccept') {
            if (!this.validTrade(tr)) { this.trades = this.trades.filter((t) => t !== tr); this.err(client, 'That trade is no longer possible'); }
            else this.acceptTrade(tr);
          } else {
            this.trades = this.trades.filter((t) => t !== tr);
            this.say(this.P(p), ' declined a trade from ', this.P(this.byId(tr.from)));
          }
        }
        return this.broadcast();
      }
    }
  }

  detach(client) {
    this.clients.delete(client);
    const p = client.player;
    if (!p || [...this.clients].some((c) => c.player === p)) return;
    p.connected = false;
    // A page refresh reconnects within moments, so only hand the host role on if they stay away.
    setTimeout(() => { if (!p.connected && this.players.includes(p)) { this.fixHost(); this.broadcast(); } }, 8000);
    if (this.phase === 'lobby') {
      // Give a refresh a moment to reconnect before dropping the seat.
      setTimeout(() => {
        if (!p.connected && this.phase === 'lobby' && this.players.includes(p)) { this.removePlayer(p); this.broadcast(); }
      }, 6000);
    }
    this.broadcast();
  }
}

// ---------- HTTP ----------
const rooms = new Map();
const CODE_CHARS = 'abcdefghjkmnpqrstuvwxyz23456789';
function newCode() {
  let code;
  do { code = Array.from({ length: 5 }, () => CODE_CHARS[rnd(CODE_CHARS.length)]).join(''); } while (rooms.has(code));
  return code;
}

function serveFile(res, file) {
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('Not found'); }
    const flag = file.startsWith(FLAGS);
    res.writeHead(200, {
      'Content-Type': MIME[path.extname(file)] || 'application/octet-stream',
      'Cache-Control': flag ? 'public, max-age=604800' : 'no-cache',
    });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://x');
  let p;
  try { p = decodeURIComponent(url.pathname); } catch { res.writeHead(400); return res.end(); }
  if (p === '/api/create') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify({ code: newCode() }));
  }
  if (p === '/api/stats') {
    res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    return res.end(JSON.stringify(statsList()));
  }
  if (p === '/api/sounds') {
    // Optional audio overrides: any <event>.mp3 dropped into public/sounds replaces the built-in synth cue.
    return fs.readdir(path.join(PUBLIC, 'sounds'), (err, files) => {
      res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-cache' });
      res.end(JSON.stringify(err ? [] : files.filter((f) => /^[\w-]+\.(mp3|ogg|wav)$/.test(f))));
    });
  }
  if (p === '/' || /^\/room\/[a-z0-9]{4,8}\/?$/.test(p)) return serveFile(res, path.join(PUBLIC, 'index.html'));
  const flag = p.match(/^\/flags\/([a-z]{2})\.svg$/);
  if (flag) return serveFile(res, path.join(FLAGS, `${flag[1]}.svg`));
  const file = path.normalize(path.join(PUBLIC, p));
  if (!file.startsWith(PUBLIC + path.sep)) { res.writeHead(403); return res.end(); }
  serveFile(res, file);
});

// ---------- WebSocket ----------
const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16 * 1024 });
wss.on('connection', (ws) => {
  const client = { ws, player: null, room: null };
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  ws.on('message', (raw) => {
    let m;
    try { m = JSON.parse(raw); } catch { return; }
    if (!m || typeof m.type !== 'string') return;
    try {
      if (m.type === 'hello') {
        if (client.room) return;
        const code = String(m.room || '').toLowerCase();
        if (!/^[a-z0-9]{4,8}$/.test(code)) return send(ws, { type: 'error', msg: 'Invalid room code' });
        let room = rooms.get(code);
        if (!room) {
          if (rooms.size >= 500) return send(ws, { type: 'error', msg: 'Server is full' });
          room = new Room(code);
          rooms.set(code, room);
        }
        client.room = room;
        room.clients.add(client);
        const p = m.token && room.players.find((x) => x.token === m.token && !x.bot);
        if (p) {
          client.player = p;
          p.connected = true;
          room.fixHost();
          send(ws, { type: 'joined', id: p.id, token: p.token });
        }
        return room.broadcast();
      }
      if (client.room) client.room.handle(client, m);
    } catch (e) { console.error(e); }
  });
  ws.on('close', () => { if (client.room) client.room.detach(client); });
  ws.on('error', () => {});
});

// Drop dead sockets (so "connected" stays honest) and clean up abandoned rooms.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
  for (const [code, room] of rooms) {
    if (room.clients.size === 0 && Date.now() - room.lastActive > 30 * 60 * 1000) {
      if (room.phase === 'playing') room.saveLog('abandoned', false);
      room.resetGame();
      clearTimeout(room.botTimer);
      rooms.delete(code);
    }
  }
}, 30000);

server.listen(PORT, () => console.log(`Cashup running on http://localhost:${PORT}`));
