# Cashup

A private, online property-trading board game for you and your friends. Rooms are reachable by link only: there is no public room list, no accounts and no store. Every map is free: Classic, Mr. Worldwide, Death Valley, Lucky Wheel, Speed Run (28 tiles), Jet Set (eight airports), Power Grid (six companies), Tax Haven, High Roller (prices up to $800), plus **Random** (plays one of those, chosen when the game starts) and **Generated** (a new shuffled board each time you pick it).

## Run it

```bash
npm install
npm start          # http://localhost:3000
```

Open the page, enter a name, click **Create a private game**, and share the room link.

## Play with friends over the internet

The server has to be reachable from your friends' devices. Two ways:

**Quick tunnel from your own machine** (nothing to deploy; the link works while the command is running):

```bash
npm start
# in a second terminal, either of:
cloudflared tunnel --url http://localhost:3000
ngrok http 3000
```

Open the `https://…` address the tunnel prints, create a game there, and send your friends the room link from the "Share this game" box. Anyone with that link can join, so only share it with the people you want in the game.

**Host it** on any Node host (Render, Railway, Fly.io, a VPS). It is a single process that listens on `$PORT` and needs WebSocket support. Rooms live in memory, so a restart ends games in progress.

## How it works

- `server.js`: HTTP + WebSocket server and all game rules. The server is authoritative; clients only send actions.
- `public/maps.js`: board layouts and rent tables, shared by server and browser.
- `public/app.js`, `public/style.css`, `public/index.html`: the client (no build step).
- Flags are served from the `flag-icons` package.

Room settings (host only, before the game starts): maximum players (2–8), map, bots, x2 rent on full sets, vacation cash, auctions, no rent while in prison, mortgages, even building, starting cash ($500 to $10,000), random player order. Defaults: x2 rent on, vacation cash on, auction off, no rent in prison on, mortgage off, even build off, $3000 starting cash; change them in the `settings` object in `server.js`.

In a game: closing or refreshing a tab keeps your seat (reopen the same link in the same browser). The host can remove a player who has left. If the host stays away, the host role passes to the next player.

## Sounds

Sound cues are generated in the browser. To use your own audio instead, drop a file named after the cue into `public/sounds/` (`.mp3`, `.ogg` or `.wav`) and it replaces the built-in one:

`roll`, `hop`, `buy`, `pay`, `gain`, `turn`, `card`, `jail`, `build`, `start`, `win`, `bankrupt`, `chat`, `trade`, `bid`, `mortgage`, `unmortgage`

Nine cues already ship as audio files from notificationsounds.com (Creative Commons Attribution); see `public/sounds/CREDITS.md`. To swap which sound plays for an event, rename the files.

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
