// Checks the bots' set-blocking choices on hand-built boards. Loads Room from server.js without listening.
const fs = require('fs');
const path = require('path');
const Module = require('module');
const assert = require('assert');
const { rentTable, airportVisitRent, houseCost, AIRPORT_RENT } = require('../public/maps.js');

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
{ // team game: lobby teams, no rent between teammates, last team standing wins
  const { r, human, bot, other, A } = setup();
  const as = (p, m) => r.handle({ player: p, ws: {} }, m);
  as(human, { type: 'setting', key: 'teams', value: 2 });
  check(human.team === 1 && bot.team === 2 && other.team === 1, 'new players join the smaller team');
  as(bot, { type: 'team', id: human.id, team: 2 });
  check(human.team === 1, 'only the host moves someone else');
  as(human, { type: 'team', id: human.id, team: 3 });
  check(human.team === 1, 'no team 3 in a two-team game');
  as(human, { type: 'team', id: other.id, team: 2 });
  as(human, { type: 'team', id: human.id, team: 2 });
  as(human, { type: 'start' });
  check(r.phase === 'lobby', 'cannot start with everyone on one team');
  as(human, { type: 'team', id: human.id, team: 1 });
  r.settings.randomOrder = false;
  as(human, { type: 'start' });
  check(r.phase === 'playing', 'starts with two teams in use');
  r.after = (ms, fn) => fn();
  own(r, A[0], human);
  for (const [p, team, paid] of [[bot, 'teammate', false], [other, 'opponent', true]]) {   // human and bot vs other
    if (p === bot) bot.team = 1;
    const before = p.money; p.pos = A[0]; r.turnIdx = r.players.indexOf(p); r.land(p);
    check((p.money < before) === paid, `${team} ${paid ? 'pays' : 'pays no'} rent`);
  }
  r.settings.teamNoRent = false;
  const before = bot.money; bot.pos = A[0]; r.turnIdx = r.players.indexOf(bot); r.land(bot);
  check(bot.money < before, 'teammates pay rent when that option is off');
  r.bankrupt(human);
  check(r.phase === 'playing', 'the game goes on while both teams have players');
  r.bankrupt(other);
  check(r.phase === 'over' && r.winTeam === 1 && r.winner === bot.id, 'last team standing wins');
}
{ // three teams: count change moves players, the game runs until one team is left
  const { r, human, bot, other } = setup();
  const fourth = r.addPlayer('Fourth', null, true);
  const as = (p, m) => r.handle({ player: p, ws: {} }, m);
  as(human, { type: 'setting', key: 'teams', value: 3 });
  as(human, { type: 'team', id: human.id, team: 3 });
  check(human.team === 3, 'team 3 exists in a three-team game');
  as(human, { type: 'setting', key: 'teams', value: 2 });
  check(r.players.every((p) => p.team <= 2), 'shrinking the team count moves players off removed teams');
  as(human, { type: 'setting', key: 'teams', value: 3 });
  [human.team, bot.team, other.team, fourth.team] = [1, 2, 3, 3];
  r.settings.randomOrder = false;
  as(human, { type: 'start' });
  r.after = (ms, fn) => fn();
  r.bankrupt(human);
  check(r.phase === 'playing', 'two teams left: the game goes on');
  r.bankrupt(bot);
  check(r.phase === 'over' && r.winTeam === 3, 'team 3 wins when it is the last one left');
}
{ // teammates share sets: a set split between them is full for each, and the rent doubles
  const { r, human, bot, other, A } = setup();
  r.settings.teams = 2; [human.team, bot.team, other.team] = [1, 1, 2];
  own(r, A[0], human); own(r, A[1], human); own(r, A[2], bot);
  const base = rentTable(r.tiles[A[0]].price)[0];
  check(r.ownsSet(human.id, A[0]) && r.ownsSet(bot.id, A[2]) && !r.ownsSet(other.id, A[0]), 'a split team set counts as full');
  check(r.rent(A[0], 7) === base * 2, 'full-set rent doubles on a team set');
  r.phase = 'playing'; r.turnIdx = r.players.indexOf(bot); r.tp = 'roll'; bot.money = 10000;
  r.handle({ player: bot, ws: {} }, { type: 'build', tile: A[2] });
  check(r.owned[A[2]].houses === 1, 'a teammate builds on their own city of the shared set');
  r.handle({ player: bot, ws: {} }, { type: 'build', tile: A[0] });
  check(r.owned[A[0]].houses === 0, "a teammate cannot build on the other's city");
  r.owned[A[2]].houses = 0;
  check(r.stake(other.id, A[0]) === 2.5, 'a bot sees a team set as one to block');
  const four = r.addPlayer('Four', null, true); four.team = 2;
  own(r, A[0], other); own(r, A[1], four);   // team 2 holds two thirds, the bot (team 1) the last
  other.money = 100000;
  const ans = r.botWantsTrade(trade(other, bot, { money: 50000 }, { props: [A[2]] }));
  check(!ans.ok && /complete/.test(ans.why), 'a bot will not complete an opposing team set');
  r.settings.teamSets = false;
  own(r, A[0], human); own(r, A[1], human);
  check(!r.ownsSet(human.id, A[0]) && r.rent(A[0], 7) === base, 'no sharing when that option is off');
  r.settings.teamSets = true; r.settings.teams = 0;
  check(!r.ownsSet(human.id, A[0]), 'no sharing outside a team game');
}
{ // airports count together for a team
  const { r, human, bot, other } = setup();
  r.settings.teams = 2; [human.team, bot.team, other.team] = [1, 1, 2];
  const ports = r.tiles.filter((t) => t.type === 'airport').map((t) => t.i);
  own(r, ports[0], human); own(r, ports[1], bot);
  check(r.rent(ports[0], 7) === AIRPORT_RENT[1], 'two airports across a team charge the two-airport rent');
}
{ // a bot builds as much as it can afford in one turn
  const { r, bot, A } = setup();
  for (const i of A) own(r, i, bot);
  bot.money = 100000;
  r.botBuild(bot);
  check(A.every((i) => r.owned[i].houses === 4 + r.settings.maxHotels), 'bot builds every set to the top');
}
{ // the nth hotel costs n times the base build price; selling refunds half of that level
  const { r, human, A } = setup();
  const as = (m) => r.handle({ player: human, ws: {} }, m);
  for (const i of A) own(r, i, human);
  r.settings.maxHotels = 3; r.phase = 'playing'; r.turnIdx = r.players.indexOf(human); r.tp = 'roll';
  const base = houseCost(r.tiles[A[0]].price), paid = [];
  for (let n = 0; n < 7; n++) { const before = human.money = 100000; as({ type: 'build', tile: A[0] }); paid.push(before - human.money); }
  check(paid.join() === [1, 1, 1, 1, 1, 2, 3].map((k) => k * base).join(), `build costs ${paid}`);
  human.money = 0; as({ type: 'sellHouse', tile: A[0] });
  check(human.money === 3 * base / 2, 'selling the 3rd hotel refunds half its cost');
}
{ // trades weigh rent: an airport whose landing counter has climbed is worth far more than its price
  const { r, human, bot, other } = setup();
  const ports = r.tiles.filter((t) => t.type === 'airport').map((t) => t.i), price = r.tiles[ports[0]].price;
  own(r, ports[0], bot);
  human.money = 100000;
  const offer = trade(human, bot, { money: price * 3 }, { props: [ports[0]] });
  check(r.botWantsTrade(offer).ok, 'three times the price buys a plain airport');
  r.settings.airportRepeat = true; r.settings.airportShared = false; r.owned[ports[0]].visits = 5;
  check(!r.botWantsTrade(offer).ok, 'not an airport whose own counter is high');
  r.settings.airportShared = true; r.owned[ports[0]].visits = 0; own(r, ports[1], human); human.airportVisits = 6;
  check(!r.botWantsTrade(offer).ok, "not one that joins the rival's high shared counter");
  r.settings.airportRepeat = false; own(r, ports[1], other); own(r, ports[2], bot);
  check(!r.botWantsTrade(offer).ok, 'not one that halves the rent of its other airport');
  r.settings.teams = 2; [human.team, bot.team] = [1, 1];
  check(r.botWantsTrade(trade(human, bot, {}, { props: [ports[0]] })).ok, "a teammate's offer is taken");
}
{ // team help: a bot covers a teammate's debt and hands over the last city of their set
  const { r, human, bot, other, A, B } = setup();
  r.phase = 'playing';
  human.money = -300; bot.money = 1000; other.money = -500;
  check(!r.botHelpTeam(), 'no help outside a team game');
  r.settings.teams = 2; [human.team, bot.team, other.team] = [1, 1, 2];
  check(r.botHelpTeam() && human.money === 0 && bot.money === 700 && other.money === -500, 'the bot pays off its teammate, not the opponent');
  human.money = -300; bot.money = 250;
  r.botHelpTeam();
  check(human.money === -250 && bot.money === 200, 'it keeps $200 for itself');
  human.money = 100;
  own(r, A[0], human); own(r, A[1], human); own(r, A[2], bot); own(r, B[0], other); own(r, B[1], other); own(r, B[2], bot);
  check(r.botHelpTeam() && r.owned[A[2]].owner === human.id, 'it gives a teammate the last city of their set');
  check(!r.botHelpTeam() && r.owned[B[2]].owner === bot.id, 'never to an opponent');
}
{ // a bot offers a person cash for the last city of its set, once
  const { r, human, bot, other, A, B } = setup();
  own(r, A[0], bot); own(r, A[1], bot); own(r, A[2], human);
  own(r, B[0], bot); own(r, B[1], bot); own(r, B[2], other);
  bot.money = 5000;
  check(r.botOffer(bot), 'the bot makes an offer');
  const tr = r.trades[0];
  check(r.trades.length === 1 && tr.to === human.id && tr.get.props[0] === A[2] && tr.give.money === r.tiles[A[2]].price * 2, 'twice the price for the missing city, to the person');
  check(!r.botOffer(bot), 'one open offer at a time');
  r.trades = [];
  check(!r.botOffer(bot), 'never asks the same owner for the same city twice');
  bot.asked = []; bot.money = r.tiles[A[2]].price * 2 + 100;
  check(!r.botOffer(bot), 'not when it would leave less than $200');
}
console.log(`bot checks passed: ${checks}`);
process.exit(0);
