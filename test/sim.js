// Joins a room as one scripted human plus bots and plays automatically; reports stalls and errors.
const WebSocket = require('ws');
const [, , map = 'classic', seconds = '60', auction = '1', port = '3000', stall = '12000'] = process.argv;
const code = 't' + Math.random().toString(36).slice(2, 6);
const ws = new WebSocket(`ws://localhost:${port}/ws`);
const send = (o) => ws.send(JSON.stringify(o));
const built = new Set();
let me = null, S = null, lastSeq = 0, lastChange = Date.now(), started = false, errors = [];
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
    send({ type: 'addBot' }); send({ type: 'addBot' }); send({ type: 'addBot' });
    setTimeout(() => send({ type: 'start' }), 300);
    return;
  }
  if (S.phase !== 'playing') return;
  const p = S.players.find((x) => x.id === me);
  if (S.tp === 'auction' && S.auction && S.auction.bidder !== me && p.money > S.auction.bid + 200 && S.auction.bid < 60) return send({ type: 'bid', add: 10 });
  if (S.turn !== me || p.bankrupt) return;
  if (S.tp === 'roll') {
    if (p.money < 0) return send({ type: 'bankrupt' });
    return send({ type: 'roll' });
  }
  if (S.tp === 'buy') return send({ type: p.money > 300 ? 'buy' : 'skip' });
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
  console.log(`map=${map} phase=${S.phase} seq=${S.seq} owned=${Object.keys(S.owned).length} pot=${S.pot}`);
  console.log(S.players.map((p) => `${p.name}:${p.bankrupt ? 'OUT' : '$' + p.money}${p.inJail ? '(jail)' : ''}`).join('  '));
  console.log('houses:', Object.values(S.owned).reduce((a, o) => a + o.houses, 0), 'mortgaged:', Object.values(S.owned).filter((o) => o.mortgaged).length);
  console.log('log kinds:', [...new Set(S.log.map((e) => e.parts.filter((x) => typeof x === 'string').join('|').replace(/\$\d+/g, '$N').replace(/card: .*/, 'card')))].slice(0, 30).join(' ;; '));
  if (errors.length) console.log('client errors:', [...new Set(errors)].join(' | '));
  process.exit(rc);
}
setTimeout(() => done(0), +seconds * 1000);
