# Cashup

**A private, real-time property-trading board game you play in the browser with friends.**

Create a room, send the link, and play: roll 3D dice, buy cities, airports and companies, collect rent, build houses and hotels, trade, and bankrupt everyone else. There are no accounts, no ads, no store and no public lobby. A game is reachable only by its link, and every map and appearance is free.

It is a small, dependency-light project: one Node process (HTTP + WebSocket) holding all game rules, and a plain JavaScript client with no build step.

## Features

- **Private multiplayer** for 2 to 8 players per room, with optional computer players to fill seats
- **Server-authoritative rules**: clients only send actions, so everyone always sees the same game
- **Eleven map options**
  - Classic, Mr. Worldwide (48 tiles), Death Valley, Lucky Wheel
  - Speed Run (28 tiles, quick games), Jet Set (eight airports), Power Grid (six companies), Tax Haven (taxes and refunds everywhere), High Roller (prices up to $800)
  - **Random** plays one of the above, chosen when the game starts; **Generated** deals a brand-new shuffled board each time you pick it
- **Full property game**: rent tables, houses and hotels, full-set bonuses, mortgages, auctions, trades between players, prison, Treasure and Surprise cards, taxes, a vacation cash pot, bankruptcy and a winner screen
- **3D dice** drawn by a small canvas renderer written for this project, hopping tokens, and a one-time celebration when a player completes a set
- **22 appearances**: twelve colours plus ten characters (tycoon, lion, king, pirate, robot, cat, alien, ninja, wizard, panda)
- **At-a-glance board**: current rent on every owned property, turns left on mortgages, the cash waiting on Vacation, and a highlight when you can afford to build
- **Chat**, a live game log, sound cues with a mute switch, and seats that survive a page refresh
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
| Auction | Off | A property nobody buys goes to the highest bidder |
| No rent while in prison | On | Owners in prison collect nothing |
| Vacation skips a turn | On | A player who lands on Vacation misses their next turn |
| Move after paying out of prison | Off | When off, paying or using a pardon card ends your turn and you move on the next one. Rolling doubles always gets you out and moving, with no extra roll |
| Mortgage | Off | Mortgage for the sell value (50%); lift it within 5 of your turns or the bank takes the property |
| Hotels per property | 1 | Up to 3. Two hotels pay 1.5× the hotel rent, three pay 2× |
| Airport rent grows per landing | Off | Off: rent doubles with each airport the owner holds. On: each airport starts at $25 and doubles every time someone lands on it, up to $3200 |
| Even build | Off | Houses must be built and sold evenly across a set |
| Randomize player order | On | Shuffle seats when the game starts |

To change the defaults, edit the `settings` object in `server.js`.

## Run it

Requires Node 18 or newer.

```bash
npm install
npm start          # http://localhost:3000
```

Open the page, enter a name, click **Create a private game**, and share the room link.

## Play with friends over the internet

The server has to be reachable from your friends' devices.

**Quick tunnel from your own machine** (nothing to deploy; the link works while both commands are running):

```bash
npm start
# in a second terminal, either of:
cloudflared tunnel --url http://localhost:3000
ngrok http 3000
```

Open the `https://…` address the tunnel prints, create a game there, and send your friends the room link from the "Share this game" box. Anyone with that link can join, so share it only with the people you want in the game.

**Host it** on any Node host (Render, Railway, Fly.io, a VPS). It is a single process that listens on `$PORT` and needs WebSocket support. Rooms live in memory, so restarting the server ends games in progress.

## How it works

| File | Role |
| --- | --- |
| `server.js` | HTTP and WebSocket server, rooms, and every game rule |
| `public/maps.js` | Board layouts, rent tables and the random board generator, shared by server and browser |
| `public/app.js` | The client: board, panels, popups, animations |
| `public/dice.js` | The 3D dice renderer (2D canvas, no CSS 3D) |
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
- Scripted game against bots (server must be running):

  ```bash
  node test/sim.js classic 60          # map, seconds
  ```

- Fast full games: start a second server with every delay shortened, then point the script at it:

  ```bash
  PORT=3111 SPEED=40 node server.js
  node test/sim.js worldwide 100 1 3111 4000   # map, seconds, auction on, port, stall timeout (ms)
  ```
