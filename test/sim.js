// Joins a room as one scripted human plus bots and plays automatically; reports stalls and errors.
const WebSocket = require('ws');
const { MAPS } = require('../public/maps.js');
const [, , map = 'classic', seconds = '60', auction = '1', port = '3000', stall = '12000'] = process.argv;
const code = 't' + Math.random().toString(36).slice(2, 6);
const ws = new WebSocket(`ws://localhost:${port}/ws`);
const send = (o) => ws.send(JSON.stringify(o));
const built = new Set();
const TEAMS = +process.env.TEAMS || 0;   // number of teams: checks no rent between teammates and shared sets
const seen = new Set(), team = { free: 0, shared: new Set(), bad: [], gifts: 0, offers: 0 };
let picks = 0, me = null, S = null, lastSeq = 0, lastChange = Date.now(), started = false, errors = [];
ws.on('open', () => send({ type: 'hello', room: code }));
ws.on('message', (raw) => {
  const m = JSON.parse(raw);
  if (m.type === 'joined') me = m.id;
  if (m.type === 'error') errors.push(m.msg);
  if (m.type !== 'state') return;
  S = m.state; lastChange = Date.now();
  if (!me && !S.players.length) return send({ type: 'join', name: 'Tester', color: '#ff7ca0' });
  if (S.phase === 'lobby' && me && !started) {
    started = true;
    send({ type: 'setting', key: 'map', value: map });
    send({ type: 'setting', key: 'auction', value: auction === '1' });
    send({ type: 'setting', key: 'vacationCash', value: true });
    if (TEAMS) send({ type: 'setting', key: 'teams', value: TEAMS });
    if (process.env.TEAMRENT === '0') send({ type: 'setting', key: 'teamNoRent', value: false });   // the rent check must then fail
    send({ type: 'addBot' }); send({ type: 'addBot' }); send({ type: 'addBot' });
    setTimeout(() => send({ type: 'start' }), 300);
    return;
  }
  if (TEAMS) {
    const tm = (id) => (S.players.find((x) => x.id === id) || {}).team;
    for (const e of S.log) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      const [a, txt, b] = e.parts;
      // rent only: the player on turn stands on a property the payee owns ("collect from every player" cards are fine)
      const payer = S.players.find((x) => x.id === (a && a.p)), o = payer && S.owned[payer.pos];
      if (b && b.p && / paid \$\d+ to $/.test(txt) && a.p === S.turn && o && o.owner === b.p && tm(a.p) === tm(b.p)) team.bad.push(`${a.n} paid rent to teammate ${b.n} ${txt.trim()} after "${(S.log.find((x) => x.id === e.id - 1) || { parts: [] }).parts.map((x) => (typeof x === "string" ? x : x.n)).join("")}"`);
      if (/no rent to teammate/.test(txt)) team.free++;
      if (/^ gave /.test(txt)) team.gifts++;
      if (/offered a trade/.test(txt) && S.players.some((x) => x.id === a.p && x.bot)) team.offers++;
    }
    // a built city whose set is held by more than one player can only be a team-shared set
    const tiles = S.tiles || MAPS[S.mapId].tiles;
    for (const [i, o] of Object.entries(S.owned)) {
      if (!o.houses) continue;
      const owners = new Set(tiles.filter((t) => t.type === 'city' && t.cc === tiles[i].cc).map((t) => S.owned[t.i] && S.owned[t.i].owner));
      if (owners.size > 1) team.shared.add(tiles[i].cc);
    }
  }
  if (S.phase !== 'playing') return;
  const p = S.players.find((x) => x.id === me);
  if (S.tp === 'auction' && S.auction && S.auction.bidder !== me && p.money > S.auction.bid + 200 && S.auction.bid < 60) return send({ type: 'bid', add: 10 });
  if (S.turn !== me || p.bankrupt) return;
  if (S.tp === 'pickCity') { picks++; const t = (S.tiles || MAPS[S.mapId].tiles).filter((x) => x.type === 'city'); return send({ type: 'goto', tile: t[Math.floor(Math.random() * t.length)].i }); }
  if (S.tp === 'roll') {
    if (p.money < 0) return send({ type: 'bankrupt' });
    return send({ type: 'roll' });
  }
  if (S.tp === 'buy') return send({ type: p.money > (S.tiles || MAPS[S.mapId].tiles)[p.pos].price + 100 ? 'buy' : 'skip' });
  if (S.tp === 'end' && p.money > 500) {
    // try to build wherever a full set is owned (server rejects the rest)
    for (const i of Object.keys(S.owned)) if (S.owned[i].owner === me && S.owned[i].houses < 5 && !built.has(i + ':' + S.seq)) { built.add(i + ':' + S.seq); send({ type: 'build', tile: +i }); }
  }
  if (S.tp === 'end') return send({ type: p.money < 0 ? 'bankrupt' : 'endTurn' });
});
const iv = setInterval(() => {
  if (S && S.phase === 'playing' && Date.now() - lastChange > +stall) { console.log('STALL', S.tp, S.turn, JSON.stringify(S.log.slice(-3))); done(1); }
  if (S && S.phase === 'over') done(0);
}, 500);
function done(rc) {
  clearInterval(iv);
  const sum = S.players.reduce((a, p) => a + p.money, 0);
  console.log(`map=${map} phase=${S.phase} picks=${picks} seq=${S.seq} owned=${Object.keys(S.owned).length} pot=${S.pot}`);
  console.log(S.players.map((p) => `${p.name}:${p.bankrupt ? 'OUT' : '$' + p.money}${p.inJail ? '(jail)' : ''}`).join('  '));
  console.log('houses:', Object.values(S.owned).reduce((a, o) => a + o.houses, 0), 'mortgaged:', Object.values(S.owned).filter((o) => o.mortgaged).length);
  console.log('log kinds:', [...new Set(S.log.map((e) => e.parts.filter((x) => typeof x === 'string').join('|').replace(/\$\d+/g, '$N').replace(/card: .*/, 'card')))].slice(0, 30).join(' ;; '));
  if (TEAMS) {
    const left = new Set(S.players.filter((p) => !p.bankrupt).map((p) => p.team));
    if (S.phase === 'over' && !(left.size === 1 && left.has(S.winTeam))) team.bad.push(`winTeam ${S.winTeam} but teams left: ${[...left]}`);
    console.log(`teams: ${S.players.map((p) => `${p.name}=T${p.team}`).join(' ')} winTeam=${S.winTeam}`);
    console.log(`bot help: gifts to teammates=${team.gifts} bot trade offers=${team.offers}`);
    console.log(`team samples: no-rent landings=${team.free} built shared sets=${team.shared.size} (${[...team.shared]})${team.free && team.shared.size ? '' : ' INCONCLUSIVE'}`);
    if (team.bad.length) { console.log('TEAM ERRORS:', team.bad.join(' | ')); rc = 1; }
  }
  if (errors.length) console.log('client errors:', [...new Set(errors)].join(' | '));
  process.exit(rc);
}
setTimeout(() => done(0), +seconds * 1000);
