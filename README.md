# Cashup

**A private, real-time property-trading board game you play in the browser with friends.**

Create a room, send the link, and play: roll 3D dice, buy cities, airports and companies, collect rent, build houses and hotels, trade, and bankrupt everyone else. There are no accounts, no ads, no store and no public lobby. A game is reachable only by its link, and every map and appearance is free.

It is a small, dependency-light project: one Node process (HTTP + WebSocket) holding all game rules, and a plain JavaScript client with no build step.

Inspired by [richup.io](https://richup.io/), with thanks to its creators. See [Credits](#credits).

## Features

- **Private multiplayer** for 2 to 8 players per room, with optional computer players to fill seats
- **Server-authoritative rules**: clients only send actions, so everyone always sees the same game
- **Eleven map options**
  - Classic, Mr. Worldwide (48 tiles), Death Valley, Lucky Wheel
  - Speed Run (28 tiles, quick games), Jet Set (eight airports), Power Grid (six companies), Tax Haven (taxes and refunds everywhere), High Roller (prices up to $800)
  - **Random** plays one of the above, chosen when the game starts; **Generated** deals a brand-new shuffled board each time you pick it
- **Full property game**: rent tables, houses and hotels, full-set bonuses, mortgages, auctions, trades between players, prison, Treasure and Surprise cards, taxes, a vacation cash pot, bankruptcy and a winner screen
- **3D dice** drawn by a small canvas renderer written for this project, hopping tokens, and a one-time celebration when a player completes a set
- **60 appearances**, all original characters: animals (lion, fox, panda, shark, dragon…), characters (pirate, astronaut, wizard, vampire, knight…) and a few oddities (pumpkin, cactus, snowman, sun). They are defined in `public/skins.js`
- **At-a-glance board**: current rent on every owned property, turns left on mortgages, the cash waiting on Vacation, and a highlight when you can afford to build
- **Stats and profiles**: games played, won and lost, win rate and best winning cash per player, shown on the home page and on the end-of-game screen. Stats are kept by name (case does not matter), so pick a profile button (`vk` and `Tony Wayne` come built in) or type the same name each time. They are saved to `data/stats.json` with a copy in `../cashup-stats-copy.json` (outside the repo folder); if the main file is lost or damaged, the copy is loaded instead. Games against bots count; bots get no stats
- **Chat**, a scrollable game log you can copy, sound cues with a volume slider, and seats that survive a page refresh
- Works on desktop and scales down for narrow screens

## Room settings

The host sets these before the game starts, and can hand the host role to another player at any time.

| Setting | Default | What it does |
| --- | --- | --- |
| Maximum players | 4 | 2 to 8 |
| Board map | Classic | Any of the eleven options above |
| Starting cash | $3000 | $500 to $10,000 |
| x2 rent on full sets | On | Base rent doubles when one player owns a whole set |
| Vacation cash | On | Taxes and bank payments collect on Vacation for whoever lands there |
| Fast game | Off | Properties are bought automatically when you land on them and can afford them, and houses and hotels are built automatically as soon as you can pay for them. If you cannot afford a property you land on but own something sellable, you get the normal buy prompt so you can sell and still buy it. A player in debt gets 10 seconds to sell something themselves, then their least useful holdings are sold automatically: loose properties first (blocked sets, then lowest rent), then buildings, then full-set properties. With Mortgage on, those properties are mortgaged instead of sold |
| Auction | Off | A property nobody buys goes to the highest bidder |
| No rent while in prison | On | Owners in prison collect nothing |
| Vacation skips a turn | On | Landing on Vacation ends your turn there (even on doubles) and you miss your next one |
| Move after paying out of prison | Off | When off, paying or using a pardon card ends your turn and you move on the next one. Rolling doubles always gets you out and moving, with no extra roll |
| Mortgage | Off | Mortgage for the sell value (50%); lift it within 5 of your turns or the bank takes the property |
| Hotels per property | 1 | Up to 3. Two hotels pay 1.5× the hotel rent, three pay 2× |
| Airport rent grows per landing | Off | Off: rent doubles with each airport the owner holds. On: rent starts at $25 and doubles with every paid landing |
| Airport rent maximum | $3200 | Where the per-landing rent stops growing: $200, $400, $800, $1600 or $3200 |
| Shared between airports | On | A landing on any of an owner's airports raises the rent at all of them. Off: each airport counts its own landings |
| Even build | Off | Houses must be built and sold evenly across a set |
| Randomize player order | On | Shuffle seats when the game starts |

To change the defaults, edit the `settings` object in `server.js`.

## Run it

Requires Node 18 or newer.

```bash
npm install
npm start
```

Open http://localhost:3000, enter a name, click **Create a private game**, and share the room link.

## Play with friends over the internet

The server has to be reachable from your friends' devices.

**Quick tunnel from your own machine** (nothing to deploy; the link works while both commands are running). Start the game:

```bash
npm start
```

Then, in a second terminal, run one of these:

```bash
cloudflared tunnel --url http://localhost:3000
```

```bash
ngrok http 3000
```

A quick tunnel gets a new address each time it starts, and the browser keeps names, sound settings and seats per address. To keep the same address, claim your free static domain on the ngrok dashboard (Domains page) and start the tunnel with it:

```bash
ngrok http 3000 --url=https://your-name.ngrok-free.dev
```

This copy is set up that way already: `npm run tunnel` serves the game at https://unelected-ludivina-aphyllous.ngrok-free.dev.

Open the `https://…` address the tunnel prints, create a game there, and send your friends the room link from the "Share this game" box. Anyone with that link can join, so share it only with the people you want in the game.

**Host it for a permanent address.** The game needs a running server, so a static host such as GitHub Pages cannot run it. Any Node host with WebSocket support works (Render, Railway, Fly.io, a VPS): it is a single process that listens on `$PORT`. Rooms live in memory, so restarting the server ends games in progress.

The repository includes a `render.yaml`, so on [Render](https://render.com) you can choose **New → Blueprint**, pick this repository, and get an address like `https://cashup.onrender.com` that redeploys on every push. Render's free plan puts an idle service to sleep, which ends any game in progress.

## How it works

| File | Role |
| --- | --- |
| `server.js` | HTTP and WebSocket server, rooms, and every game rule |
| `public/maps.js` | Board layouts, rent tables and the random board generator, shared by server and browser |
| `public/app.js` | The client: board, panels, popups, animations |
| `public/dice.js` | The 3D dice renderer (2D canvas, no CSS 3D) |
| `public/skins.js` | The sixty player appearances, shared by server and browser |
| `public/style.css`, `public/index.html` | Styles and page shell |
| `test/sim.js` | A scripted player for running whole games against the server |

Flags come from the `flag-icons` package. Closing or refreshing a tab keeps your seat (reopen the same link in the same browser). If the host stays away, the host role passes to the next player.

## Sounds

Most cues are generated in the browser. Nine ship as audio files from [notificationsounds.com](https://notificationsounds.com) under a Creative Commons Attribution license; see [`public/sounds/CREDITS.md`](public/sounds/CREDITS.md).

To use your own audio, drop a file named after the cue into `public/sounds/` (`.mp3`, `.ogg` or `.wav`) and it replaces the built-in one:

`roll`, `hop`, `buy`, `pay`, `gain`, `turn`, `card`, `jail`, `build`, `start`, `win`, `bankrupt`, `chat`, `trade`, `bid`, `mortgage`, `unmortgage`, `set`

Only add audio you have the rights to use.

## Testing

- Two players in one browser: open the room link in a second tab with `?seat=2` added to get a separate seat.
- Scripted game against bots (server must be running). The arguments are the map and the number of seconds to play:

  ```bash
  node test/sim.js classic 60
  ```

- Fast full games: start a second server with every delay shortened, then point the script at it. The script's arguments are the map, seconds to play, auction on (1) or off (0), the port, and the stall timeout in milliseconds:

  ```bash
  PORT=3111 SPEED=40 node server.js
  node test/sim.js worldwide 100 1 3111 4000
  ```

## Credits

- **Inspired by [richup.io](https://richup.io/).** Thank you to the richup.io team for making a great online board game; playing it with friends is what prompted this project. If you want the original, polished experience with public rooms and more, go and play it there.
- Cashup is an independent hobby project. It is not affiliated with or endorsed by richup.io. Its code, characters, icons, dice and card text were written for this project.
- Sound effects: nine files from [notificationsounds.com](https://notificationsounds.com), Creative Commons Attribution, listed in [`public/sounds/CREDITS.md`](public/sounds/CREDITS.md). The rest are generated in the browser.
- Flags: the [`flag-icons`](https://github.com/lipis/flag-icons) package.
- Fonts: Nunito, Poppins and Yanone Kaffeesatz, served by Google Fonts.
