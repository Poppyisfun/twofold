# Param & Nitya’s LDR Date Room 💞

This site lets two people on two different computers or phones play games together in one shared room. Each room has a 5-letter code and an invite link. No accounts are needed.

**16 activities**
- **Live** (you both need to be online): Online Photobooth (camera), Guess My Drawing, Draw Together
- **Take turns anytime:** Tic-Tac-Toe, Connect Four, Battleship, Hangman, Story Together
- **Play anytime:** Would You Rather, How Well Do You Know Me, Two Truths and a Lie, Never Have I Ever, Honest Cards, Love Match, Our Bucket List, Escape Room

**Play whenever:** rooms are saved for 30 days. You can take your turn while your partner is away, and they'll see it when they open the room. "Your rooms" on the home page lists your rooms and shows **Your turn!** when it's your move. The bucket list stays saved even when you switch games.

Every room has a chat panel with a typing indicator, and the chat is saved with the room.

## Run it on your computer

You need Node.js 18 or newer (https://nodejs.org).

```bash
cd twofold
npm install
npm start
```

Open http://localhost:3000. To test on your own, open a second browser window (or a private window), click **Invite** in one and paste the code into the other.

## Put it online so you can play from two places

Cameras and video only work on **HTTPS** (or `localhost`). That's a browser rule. Any of these hosts give you HTTPS automatically:

- **Render** (free tier): create a new Web Service from your GitHub repo. Build command: `npm install`. Start command: `npm start`.
- **Railway** or **Fly.io**: deploy the folder. Both detect Node and run `npm start`.
- **Your own VPS:** run `npm start` behind Caddy, which handles HTTPS automatically:
  ```
  yourdomain.com {
      reverse_proxy localhost:3000
  }
  ```

The app reads the `PORT` environment variable and defaults to 3000.

## Keep saved games safe on free hosting (recommended)

Free Render shuts the app down after 15 minutes with nobody on it, and that wipes the server's saved files. Each browser also keeps a backup copy of its rooms, so nothing is lost for good. But if the person who *didn't* make the last move opens the room first, they'll see the older board until the other person comes back.

To fix that completely, connect a free Upstash database. It's free and doesn't need a card:

1. Sign up at https://upstash.com and create a **Redis** database. Pick any region; the free plan is fine.
2. On the database page, find the **REST API** section and copy `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`.
3. In Render, open your service, go to **Environment**, and add both values with exactly those names. Then save. Render redeploys automatically.

When it's working, the Render log says `(saving rooms to Upstash)` at startup.

## Photobooth on strict networks

The Photobooth connects the two cameras directly (peer-to-peer WebRTC) and uses Google's free STUN servers. This works on most home networks. Some corporate or cellular networks block direct connections. If video won't connect on one of those, add a TURN server (Metered.ca and Twilio both have free tiers, or you can self-host coturn) to the `ICE` list near the top of the video section in `public/app.js`.

## Customize

- **Questions and prompts (Would You Rather, quiz, cards):** edit `public/content.js`
- **Colors and fonts:** edit `public/style.css` (see the `:root` variables at the top)
- **Name and logo:** search for "Param & Nitya’s LDR Date Room" in `public/index.html` and `public/app.js`

## How it works

- `server.js`: Express plus Socket.IO. Rooms live in memory and hold at most 2 people. Shared game state and chat are synced to both players. The server also relays the Photobooth's camera connection, drawing strokes and photos.
- `public/app.js`: the whole front end (hub, rooms, chat, Photobooth camera, all 7 games). It has no build step.
- Rooms are kept for 10 minutes after the last person leaves, so a page refresh doesn't lose the game.
