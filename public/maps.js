// Board definitions, shared by the server (require) and the browser (<script>).
(function (root) {
  const C = (name, price, cc) => ({ type: 'city', name, price, cc });
  const A = (name) => ({ type: 'airport', name, price: 200 });
  const U = (name, icon) => ({ type: 'company', name, price: 150, icon });
  const T = () => ({ type: 'treasure', name: 'Treasure' });
  const S = () => ({ type: 'surprise', name: 'Surprise' });
  const ET = () => ({ type: 'taxpct', name: 'Earnings Tax', pct: 10 });
  const PT = () => ({ type: 'tax', name: 'Premium Tax', amount: 75 });
  const RF = () => ({ type: 'refund', name: 'Tax Refund', amount: 50 });
  const START = () => ({ type: 'start', name: 'Start' });
  const PRISON = () => ({ type: 'prison', name: 'In Prison' });
  const VAC = () => ({ type: 'vacation', name: 'Vacation' });
  const GTP = () => ({ type: 'gotoprison', name: 'Go to prison' });
  const POWER = () => U('Power Company', '⚡');
  const WATER = () => U('Water Company', '🚰');
  const GAS = () => U('Gas Company', '🔥');

  // Tiles are listed clockwise starting from Start (top-left corner).
  const MAPS = {
    classic: {
      name: 'Classic', icon: '🌍',
      tiles: [
        START(), C('Salvador', 60, 'br'), T(), C('Rio', 60, 'br'), ET(), A('TLV Airport'), C('Tel Aviv', 100, 'il'), C('Haifa', 110, 'il'), S(), C('Jerusalem', 120, 'il'),
        PRISON(), C('Venice', 130, 'it'), POWER(), C('Milan', 140, 'it'), C('Rome', 160, 'it'), A('MUC Airport'), C('Frankfurt', 180, 'de'), T(), C('Munich', 190, 'de'), C('Berlin', 200, 'de'),
        VAC(), C('Shenzhen', 210, 'cn'), S(), C('Beijing', 220, 'cn'), C('Shanghai', 240, 'cn'), A('CDG Airport'), C('Lyon', 260, 'fr'), WATER(), C('Toulouse', 270, 'fr'), C('Paris', 280, 'fr'),
        GTP(), C('Liverpool', 290, 'gb'), C('Manchester', 300, 'gb'), T(), C('London', 320, 'gb'), A('JFK Airport'), S(), C('San Francisco', 360, 'us'), PT(), C('New York', 400, 'us'),
      ],
    },
    worldwide: {
      name: 'Mr. Worldwide', icon: '🌐',
      tiles: [
        START(), C('Salvador', 60, 'br'), T(), C('Rio', 60, 'br'), ET(), C('Tel Aviv', 100, 'il'), A('TLV Airport'), C('Haifa', 100, 'il'), C('Jerusalem', 110, 'il'), S(), C('Mumbai', 120, 'in'), C('New Delhi', 130, 'in'),
        PRISON(), C('Venice', 140, 'it'), C('Bologna', 140, 'it'), POWER(), C('Milan', 160, 'it'), C('Rome', 160, 'it'), A('MUC Airport'), C('Frankfurt', 180, 'de'), T(), C('Munich', 180, 'de'), GAS(), C('Berlin', 200, 'de'),
        VAC(), C('Shenzhen', 220, 'cn'), S(), C('Beijing', 220, 'cn'), T(), C('Shanghai', 240, 'cn'), A('CDG Airport'), C('Toulouse', 260, 'fr'), C('Paris', 260, 'fr'), WATER(), C('Yokohama', 280, 'jp'), C('Tokyo', 280, 'jp'),
        GTP(), C('Liverpool', 300, 'gb'), C('Manchester', 300, 'gb'), T(), C('Birmingham', 320, 'gb'), C('London', 320, 'gb'), A('JFK Airport'), C('Los Angeles', 350, 'us'), S(), C('San Francisco', 360, 'us'), PT(), C('New York', 400, 'us'),
      ],
    },
    deathvalley: {
      name: 'Death Valley', icon: '☠️',
      tiles: [
        START(), C('Ottawa', 60, 'ca'), T(), C('Quebec City', 60, 'ca'), ET(), A('YYZ Airport'), C('Montreal', 100, 'ca'), S(), C('Vancouver', 100, 'ca'), C('Toronto', 120, 'ca'),
        PRISON(), C('Wolfsburg', 140, 'de'), POWER(), C('Cologne', 140, 'de'), C('Hamburg', 160, 'de'), A('MUC Airport'), C('Frankfurt', 180, 'de'), T(), C('Munich', 180, 'de'), C('Berlin', 200, 'de'),
        VAC(), C('Glasgow', 220, 'gb'), S(), C('Cambridge', 220, 'gb'), C('Liverpool', 240, 'gb'), A('LHR Airport'), C('Birmingham', 260, 'gb'), C('Manchester', 260, 'gb'), WATER(), C('London', 280, 'gb'),
        GTP(), C('Boston', 300, 'us'), C('Seattle', 300, 'us'), T(), C('Chicago', 320, 'us'), A('JFK Airport'), S(), C('San Francisco', 350, 'us'), PT(), C('New York', 400, 'us'),
      ],
    },
    luckywheel: {
      name: 'Lucky Wheel', icon: '🍀',
      tiles: [
        START(), C('Antalya', 60, 'tr'), C('Istanbul', 80, 'tr'), C('Brasov', 100, 'ro'), C('Bucharest', 120, 'ro'), A('TLV Airport'), C('Milan', 140, 'it'), C('Rome', 160, 'it'), C('Munich', 180, 'de'), C('Berlin', 200, 'de'),
        PRISON(), T(), ET(), S(), T(), A('MUC Airport'), S(), T(), PT(), S(),
        VAC(), C('Beijing', 220, 'cn'), C('Shanghai', 240, 'cn'), C('Belfast', 260, 'ie'), C('Dublin', 280, 'ie'), A('CDG Airport'), C('Manchester', 300, 'gb'), C('London', 320, 'gb'), C('San Francisco', 350, 'us'), C('New York', 400, 'us'),
        GTP(), T(), S(), PT(), T(), A('JFK Airport'), S(), RF(), T(), S(),
      ],
    },
    // Short game: 28 tiles, six pairs of cities.
    speedrun: {
      name: 'Speed Run', icon: '⏱️', blurb: 'Small 28-tile board for quick games',
      tiles: [
        START(), C('Porto', 60, 'pt'), C('Lisbon', 70, 'pt'), T(), A('LIS Airport'), C('Santorini', 100, 'gr'), C('Athens', 120, 'gr'),
        PRISON(), C('Salzburg', 140, 'at'), S(), C('Vienna', 160, 'at'), POWER(), C('Bergen', 180, 'no'), C('Oslo', 200, 'no'),
        VAC(), C('Busan', 220, 'kr'), T(), C('Seoul', 240, 'kr'), A('ICN Airport'), C('Melbourne', 260, 'au'), C('Sydney', 280, 'au'),
        GTP(), C('Geneva', 300, 'ch'), S(), C('Zurich', 320, 'ch'), PT(), C('Abu Dhabi', 350, 'ae'), C('Dubai', 400, 'ae'),
      ],
    },
    // Eight airports: rent keeps climbing with every airport you hold.
    jetset: {
      name: 'Jet Set', icon: '✈️', blurb: 'Eight airports with rent that keeps climbing',
      tiles: [
        START(), C('Barcelona', 60, 'es'), A('MAD Airport'), C('Madrid', 80, 'es'), T(), C('Luxor', 100, 'eg'), A('CAI Airport'), C('Giza', 120, 'eg'), S(), C('Cairo', 120, 'eg'),
        PRISON(), C('Rotterdam', 140, 'nl'), A('AMS Airport'), C('Amsterdam', 160, 'nl'), ET(), C('Izmir', 180, 'tr'), A('IST Airport'), C('Ankara', 180, 'tr'), T(), C('Istanbul', 200, 'tr'),
        VAC(), C('Phuket', 220, 'th'), A('BKK Airport'), C('Bangkok', 240, 'th'), S(), C('Sentosa', 260, 'sg'), A('SIN Airport'), T(), C('Singapore', 280, 'sg'), PT(),
        GTP(), C('Abu Dhabi', 300, 'ae'), A('DXB Airport'), C('Dubai', 320, 'ae'), S(), C('Los Angeles', 350, 'us'), A('LAX Airport'), T(), C('Miami', 360, 'us'), C('New York', 400, 'us'),
      ],
    },
    // Six companies: dice-driven rent that scales up to 50x.
    powergrid: {
      name: 'Power Grid', icon: '🔌', blurb: 'Six companies, rent up to 50× the dice',
      tiles: [
        START(), C('Bergen', 60, 'no'), POWER(), C('Oslo', 60, 'no'), ET(), A('OSL Airport'), C('Akureyri', 100, 'is'), T(), C('Reykjavik', 120, 'is'), U('Wind Farm', '🌬️'),
        PRISON(), C('Jeddah', 140, 'sa'), U('Oil Company', '🛢️'), C('Riyadh', 160, 'sa'), S(), A('RUH Airport'), C('Al Wakrah', 180, 'qa'), T(), C('Doha', 200, 'qa'), GAS(),
        VAC(), C('Edmonton', 220, 'ca'), S(), C('Calgary', 240, 'ca'), A('YYC Airport'), C('Dallas', 260, 'us'), WATER(), C('Austin', 260, 'us'), T(), C('Houston', 280, 'us'),
        GTP(), C('Brisbane', 300, 'au'), U('Solar Farm', '☀️'), C('Perth', 320, 'au'), T(), A('PER Airport'), S(), C('Shenzhen', 350, 'cn'), PT(), C('Shanghai', 400, 'cn'),
      ],
    },
    // Taxes and refunds everywhere: cash swings on almost every roll.
    taxhaven: {
      name: 'Tax Haven', icon: '🏦', blurb: 'Taxes and refunds on every side',
      tiles: [
        START(), C('Colon', 60, 'pa'), RF(), C('Panama City', 80, 'pa'), ET(), A('PTY Airport'), C('Freeport', 100, 'bs'), PT(), C('Nassau', 120, 'bs'), RF(),
        PRISON(), C('Sliema', 140, 'mt'), ET(), C('Valletta', 160, 'mt'), T(), A('MLA Airport'), C('Esch', 180, 'lu'), RF(), C('Luxembourg', 200, 'lu'), PT(),
        VAC(), C('Cork', 220, 'ie'), S(), C('Dublin', 240, 'ie'), A('DUB Airport'), RF(), C('Jurong', 260, 'sg'), ET(), C('Singapore', 280, 'sg'), T(),
        GTP(), C('Geneva', 300, 'ch'), PT(), C('Zurich', 320, 'ch'), RF(), A('ZRH Airport'), S(), C('Monaco', 350, 'mc'), ET(), C('Monte Carlo', 400, 'mc'),
      ],
    },
    // Luxury prices from $200 to $800: few purchases, big rents.
    highroller: {
      name: 'High Roller', icon: '💎', blurb: 'Luxury prices up to $800; try $2500+ starting cash',
      tiles: [
        START(), C('Cannes', 200, 'fr'), T(), C('Nice', 220, 'fr'), ET(), A('NCE Airport'), C('Milan', 260, 'it'), S(), C('Portofino', 280, 'it'), C('Capri', 300, 'it'),
        PRISON(), C('Mykonos', 320, 'gr'), POWER(), C('Santorini', 340, 'gr'), T(), A('JTR Airport'), C('Ibiza', 380, 'es'), S(), C('Marbella', 400, 'es'), C('Mallorca', 420, 'es'),
        VAC(), C('Kowloon', 450, 'hk'), S(), C('Hong Kong', 480, 'hk'), A('HKG Airport'), C('Kyoto', 500, 'jp'), WATER(), C('Osaka', 520, 'jp'), T(), C('Tokyo', 550, 'jp'),
        GTP(), C('Las Vegas', 600, 'us'), C('Beverly Hills', 620, 'us'), T(), C('Manhattan', 650, 'us'), A('LAS Airport'), S(), C('Dubai', 700, 'ae'), PT(), C('Palm Island', 800, 'ae'),
      ],
    },
  };

  // Random map: eight random countries laid out in rising price order, specials scattered between them.
  const POOL = [
    ['br', 'Salvador', 'Rio', 'Sao Paulo'], ['it', 'Venice', 'Milan', 'Rome'], ['de', 'Frankfurt', 'Munich', 'Berlin'],
    ['cn', 'Shenzhen', 'Beijing', 'Shanghai'], ['fr', 'Lyon', 'Toulouse', 'Paris'], ['gb', 'Liverpool', 'Manchester', 'London'],
    ['us', 'Chicago', 'San Francisco', 'New York'], ['jp', 'Osaka', 'Kyoto', 'Tokyo'], ['es', 'Seville', 'Barcelona', 'Madrid'],
    ['in', 'Jaipur', 'Mumbai', 'New Delhi'], ['au', 'Perth', 'Melbourne', 'Sydney'], ['ca', 'Ottawa', 'Vancouver', 'Toronto'],
    ['mx', 'Cancun', 'Guadalajara', 'Mexico City'], ['kr', 'Incheon', 'Busan', 'Seoul'], ['eg', 'Luxor', 'Giza', 'Cairo'],
    ['tr', 'Izmir', 'Ankara', 'Istanbul'], ['nl', 'Utrecht', 'Rotterdam', 'Amsterdam'], ['se', 'Malmo', 'Gothenburg', 'Stockholm'],
    ['ar', 'Mendoza', 'Cordoba', 'Buenos Aires'], ['th', 'Chiang Mai', 'Phuket', 'Bangkok'], ['za', 'Durban', 'Cape Town', 'Johannesburg'],
    ['pt', 'Faro', 'Porto', 'Lisbon'], ['gr', 'Corfu', 'Santorini', 'Athens'], ['ie', 'Galway', 'Cork', 'Dublin'],
  ];
  const CODES = ['JFK', 'LHR', 'CDG', 'HND', 'DXB', 'SIN', 'FRA', 'AMS', 'SYD', 'GRU', 'YYZ', 'ICN'];
  const PRICES = [60, 60, 100, 110, 120, 130, 140, 160, 180, 190, 200, 210, 220, 240, 260, 270, 280, 290, 300, 320, 360, 400];
  function randomMap() {
    const pick = (arr) => arr.slice().sort(() => Math.random() - 0.5);
    const tiles = new Array(40).fill(null);
    [START(), PRISON(), VAC(), GTP()].forEach((t, k) => { tiles[k * 10] = t; });
    pick(CODES).slice(0, 4).forEach((code, k) => { tiles[k * 10 + 5] = A(`${code} Airport`); });
    const free = pick(tiles.map((t, i) => (t ? -1 : i)).filter((i) => i >= 0));
    const specials = [POWER(), WATER(), T(), T(), T(), S(), S(), S(), ET(), PT()];
    specials.forEach((t, k) => { tiles[free[k]] = t; });
    const sizes = [2, 3, 3, 3, 3, 3, 3, 2];
    const cities = [];
    pick(POOL).slice(0, 8).forEach((c, k) => { for (const name of c.slice(1).slice(-sizes[k])) cities.push([name, c[0]]); });
    let n = 0;
    for (let i = 0; i < 40; i++) if (!tiles[i]) { tiles[i] = C(cities[n][0], PRICES[n], cities[n][1]); n++; }
    tiles.forEach((t, i) => { t.i = i; });
    return tiles;
  }
  // "Random" plays one of the fixed maps, chosen when the game starts; "Generated" deals a brand-new board.
  MAPS.random = { name: 'Random', icon: '🎲', blurb: 'Picks one of the maps by chance when the game starts', pick: true, tiles: MAPS.classic.tiles };
  MAPS.generated = { name: 'Generated', icon: '✨', blurb: 'A brand-new shuffled board every time you pick it', random: true, tiles: randomMap() };

  for (const m of Object.values(MAPS)) m.tiles.forEach((t, i) => { t.i = i; });

  // Rent schedule [base, 1 house, 2, 3, 4, hotel], interpolated by price.
  const ANCHORS = [
    [60, [2, 10, 30, 90, 160, 250]], [80, [4, 20, 60, 180, 320, 450]], [100, [6, 30, 90, 270, 400, 550]],
    [120, [8, 40, 100, 300, 450, 600]], [140, [10, 50, 150, 450, 625, 750]], [160, [12, 60, 180, 500, 700, 900]],
    [180, [14, 70, 200, 550, 750, 950]], [200, [16, 80, 220, 600, 800, 1000]], [220, [18, 90, 250, 700, 875, 1050]],
    [240, [20, 100, 300, 750, 925, 1100]], [260, [22, 110, 330, 800, 975, 1150]], [280, [24, 120, 360, 850, 1025, 1200]],
    [300, [26, 130, 390, 900, 1100, 1275]], [320, [28, 150, 450, 1000, 1200, 1400]], [350, [35, 175, 500, 1100, 1300, 1500]],
    [400, [50, 200, 600, 1400, 1700, 2000]], [450, [60, 250, 700, 1550, 1850, 2200]], [500, [70, 300, 800, 1700, 2000, 2400]],
    [600, [90, 400, 1000, 2000, 2400, 2800]], [700, [110, 480, 1150, 2250, 2700, 3150]], [800, [130, 550, 1300, 2500, 3000, 3500]],
  ];
  function rentTable(price) {
    let lo = ANCHORS[0], hi = ANCHORS[ANCHORS.length - 1];
    for (let i = 0; i < ANCHORS.length - 1; i++) {
      if (price >= ANCHORS[i][0] && price <= ANCHORS[i + 1][0]) { lo = ANCHORS[i]; hi = ANCHORS[i + 1]; break; }
    }
    const f = hi[0] === lo[0] ? 0 : Math.min(1, Math.max(0, (price - lo[0]) / (hi[0] - lo[0])));
    return lo[1].map((v, i) => {
      const x = v + (hi[1][i] - v) * f;
      return i === 0 ? Math.round(x) : Math.round(x / 5) * 5;
    });
  }
  function houseCost(price) { return price < 130 ? 50 : price < 210 ? 100 : price < 290 ? 150 : price < 450 ? 200 : 300; }
  const AIRPORT_RENT = [25, 50, 100, 200, 300, 400, 500, 600];
  const COMPANY_MULT = [4, 10, 20, 30, 40, 50];

  const api = { MAPS, rentTable, houseCost, AIRPORT_RENT, COMPANY_MULT, randomMap };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else Object.assign(root, api);
})(typeof self !== 'undefined' ? self : this);
