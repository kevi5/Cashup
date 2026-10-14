// Checks the bots' set-blocking choices on hand-built boards. Loads Room from server.js without listening.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const assert = require('assert');
const { rentTable, airportVisitRent } = require('../public/maps.js');

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
{ // per-landing airports: the owner's own landing raises the rent only with airportSelf on, and costs nothing
  for (const self of [false, true]) {
    const { r, human, other } = setup();
    Object.assign(r.settings, { airportRepeat: true, airportShared: true, airportSelf: self });
    const ap = r.tiles.findIndex((t) => t.type === 'airport');
    own(r, ap, human);
    human.pos = ap; human.money = 1000;
    r.land(human, 7);
    check(human.money === 1000 && (human.airportVisits || 0) === (self ? 1 : 0), `own landing with airportSelf=${self}`);
    other.pos = ap; other.money = 1000;
    r.land(other, 7);
    check(other.money === 1000 - airportVisitRent(self ? 1 : 0, r.settings.airportCap) && human.airportVisits === (self ? 2 : 1), 'paid landing pays the raised rent and raises it again');
  }
}
{ // five hotels pay 3x the hotel rent; six companies charge 100x the dice
  const { r, human, A } = setup();
  r.settings.maxHotels = 5;
  for (const i of A) own(r, i, human);
  r.owned[A[0]].houses = 9;
  const price = r.tiles[A[0]].price;
  check(r.rent(A[0], 7) === Math.round((rentTable(price)[5] * 3) / 5) * 5, 'five hotels pay 3x');
  r.settings.map = 'powergrid';
  const cos = r.tiles.map((t, i) => (t.type === 'company' ? i : -1)).filter((i) => i >= 0);
  check(cos.length === 6, 'Power Grid has six companies');
  for (const i of cos) own(r, i, human);
  check(r.rent(cos[0], 7) === 700, 'six companies charge 100x the dice');
}
{ // a card that moves you to a company charges the multiplier times the dice you rolled, not the steps the card moved you
  const { r, human, other } = setup();
  r.after = (ms, fn) => fn();   // run the token walk instantly
  const co = r.tiles.findIndex((t) => t.type === 'company');
  own(r, co, human);
  r.dice = [2, 3];
  other.pos = co - 3; other.money = 1000; human.money = 1000;   // three steps away: the old bug charged 4 x 3, the dice say 4 x 5
  r.applyCard(other, { fx: ['nearest', 'company'] });
  check(other.pos === co && other.money === 1000 - 4 * 5, `company rent after a card move uses the dice (paid ${1000 - other.money})`);
}
{ // highest-rent card counts houses and unbought cities; the priciest card still goes by price
  const { r, human, other, A } = setup();
  r.after = (ms, fn) => fn();
  for (const i of A) own(r, i, human);
  r.owned[A[0]].houses = 5;   // a hotel on the cheapest set beats any unbought city's base rent
  other.pos = 0; other.money = 100000;
  r.applyCard(other, { fx: ['topRent'] });
  check(other.pos === A[0], 'topRent goes to the hotel');
  other.pos = 0;
  r.applyCard(other, { fx: ['priciest'] });
  const top = r.tiles.filter((t) => t.type === 'city').sort((x, y) => y.price - x.price)[0].i;
  check(other.pos === top, 'priciest goes to the highest price');
}
{ // choose: a person picks a city by clicking it; a bot picks on its own
  const { r, human, bot, A } = setup();
  r.after = (ms, fn) => fn();
  r.phase = 'playing'; r.turnIdx = r.players.indexOf(human); human.pos = 0; human.money = 3000;
  r.applyCard(human, { fx: ['choose'] });
  check(r.tp === 'pickCity', 'a person is asked to pick');
  r.handle({ player: human, ws: {} }, { type: 'goto', tile: A[1] });
  check(human.pos === A[1] && r.tp === 'buy', 'goto moves to the clicked city and offers it');
  bot.pos = 0; bot.money = 3000;
  r.turnIdx = r.players.indexOf(bot); r.tp = 'busy';
  r.applyCard(bot, { fx: ['choose'] });
  check(r.tiles[bot.pos].type === 'city' && r.tp !== 'pickCity', 'a bot picks a city itself');
}
{ // per-property and richest-player rewards
  const { r, human, bot, other, A } = setup();
  own(r, A[0], human); own(r, A[1], human);
  human.money = 100; bot.money = 900; other.money = 500;
  r.applyCard(human, { fx: ['perProp', 25] });
  check(human.money === 150, 'perProp pays per property');
  r.applyCard(human, { fx: ['fromRichest', 100] });
  check(human.money === 250 && bot.money === 800, 'the richest other player pays');
}
console.log(`bot checks passed: ${checks}`);
process.exit(0);
