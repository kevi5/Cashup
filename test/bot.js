// Checks the bots' set-blocking choices on hand-built boards. Loads Room from server.js without listening.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const assert = require('assert');

const file = path.join(__dirname, '..', 'server.js');
const src = fs.readFileSync(file, 'utf8').replace(/^server\.listen\(.*$/m, 'module.exports = { Room };');
const m = new Module(file, module);
m.filename = file; m.paths = Module._nodeModulePaths(path.dirname(file));
m._compile(src, file);
const { Room } = m.exports;

function setup() {
  const r = new Room('test');
  r.broadcast = () => {};
  const human = r.addPlayer('Human', null, false), bot = r.addPlayer('Bot', null, true), other = r.addPlayer('Other', null, true);
  const sets = {};
  for (const t of r.tiles) if (t.type === 'city') (sets[t.cc] = sets[t.cc] || []).push(t.i);
  const three = Object.values(sets).filter((s) => s.length === 3);
  return { r, human, bot, other, A: three[0], B: three[1] };
}
const own = (r, i, p) => { r.owned[i] = { owner: p.id, houses: 0, mortgaged: false }; };
const trade = (from, to, give, get) => ({ id: 'x', from: from.id, to: to.id, give: { money: 0, props: [], ...give }, get: { money: 0, props: [], ...get } });
let checks = 0;
const check = (cond, msg) => { assert.ok(cond, msg); checks++; };

{ // never hands over the last tile of a set, even for a fortune
  const { r, human, bot, A } = setup();
  own(r, A[0], human); own(r, A[1], human); own(r, A[2], bot);
  human.money = 100000;
  const ans = r.botWantsTrade(trade(human, bot, { money: 50000 }, { props: [A[2]] }));
  check(!ans.ok && /complete/.test(ans.why), 'bot must refuse to complete an opponent set');
}
{ // a fair cash offer for a tile nobody is collecting is fine
  const { r, human, bot, A } = setup();
  own(r, A[0], bot);
  human.money = 5000;
  const price = r.tiles[A[0]].price;
  check(r.botWantsTrade(trade(human, bot, { money: price * 2 }, { props: [A[0]] })).ok, 'bot should take double price for a loose tile');
  check(!r.botWantsTrade(trade(human, bot, { money: price }, { props: [A[0]] })).ok, 'bot should want a margin over price');
}
{ // blocking an opponent outranks completing its own set
  const { r, human, bot, A, B } = setup();
  own(r, A[0], human); own(r, A[1], human);   // A[2] would block the human
  own(r, B[0], bot); own(r, B[1], bot);       // B[2] would complete the bot
  check(r.stake(bot.id, A[2]) > r.stake(bot.id, B[2]), 'blocking stake must beat own-set stake');
  const loose = r.tiles.find((t) => t.type === 'city' && !A.includes(t.i) && !B.includes(t.i)).i;
  check(r.stake(bot.id, B[2]) > r.stake(bot.id, loose), 'own-set stake beats a loose tile');
}
{ // bot buys a blocking tile down to its last dollar but keeps a reserve for a loose one
  const { r, human, bot, A } = setup();
  own(r, A[0], human); own(r, A[1], human);
  r.phase = 'playing'; r.turnIdx = r.players.indexOf(bot); r.tp = 'buy'; bot.pos = A[2];
  bot.money = r.tiles[A[2]].price + 5;
  let bought = false;
  r.buy = () => { bought = true; }; r.startAuction = () => {}; r.finish = () => {};
  r.botTick();
  check(bought, 'bot should buy the tile that blocks an opponent set');
  delete r.owned[A[0]]; delete r.owned[A[1]];
  bought = false; r.botTick();
  check(!bought, 'bot should keep its reserve for a loose tile');
}
{ // when raising cash without mortgages, the blocking tile is kept
  const { r, human, bot, A, B } = setup();
  own(r, A[0], human); own(r, A[1], human); own(r, A[2], bot);   // A[2] blocks the human
  own(r, B[0], bot);                                              // loose
  bot.money = -1;
  r.raiseFunds(bot);
  check(r.owned[A[2]] && r.owned[A[2]].owner === bot.id, 'blocking tile must survive a forced sale');
  check(!r.owned[B[0]], 'loose tile goes first');
}
{ // fast game with mortgage on: debt is covered by mortgaging, not selling
  const { r, human, A } = setup();
  r.settings.mortgage = true;
  own(r, A[0], human);
  human.money = -10;
  r.autoSell(human);
  check(r.owned[A[0]] && r.owned[A[0]].mortgaged && r.owned[A[0]].owner === human.id, 'property should be mortgaged and kept');
  check(human.money === -10 + r.tiles[A[0]].price / 2, 'mortgage pays half the price');
  r.settings.mortgage = false;
  own(r, A[1], human);
  human.money = -10;
  r.autoSell(human);
  check(!r.owned[A[1]], 'without the mortgage rule the property is sold');
}
console.log(`bot checks passed: ${checks}`);
process.exit(0);
