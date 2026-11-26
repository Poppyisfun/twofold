# Twofold — realtime games for two

Twofold lets two people on two different computers or phones play games together in one shared room. Each room has a 5-letter code and an invite link. No accounts are needed.

**12 activities:** Online Photobooth · How Well Do You Know Me · Draw Together · Arcade (reaction duel on camera) · Truth or Dare · Honest Cards · Love Match · Color Match · IQ Duel · Escape Room (co-op, each player sees different clues) · Couples Debate (video call) · Couples Court (video call)

Rooms also have a built-in chat. "Most played" badges come from real play counts, and each browser tracks which games it has tried.

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

## Video on strict networks

Video connects the two browsers directly (peer-to-peer WebRTC) and uses Google's free STUN servers. This works on most home networks. Some corporate or cellular networks block direct connections. If video won't connect on one of those, add a TURN server (Metered.ca and Twilio both have free tiers, or you can self-host coturn) to the `ICE` list near the top of the video section in `public/app.js`.

## Customize

- **Questions, dares, debate topics, court sentences:** edit `public/content.js`
- **Colors and fonts:** edit `public/style.css` (see the `:root` variables at the top)
- **Name and logo:** search for "Twofold" in `public/index.html` and `public/app.js`

## How it works

- `server.js`: Express plus Socket.IO. Rooms live in memory and hold at most 2 people. Shared game state is synced to both players. The server also relays WebRTC signaling, drawing strokes, photos and chat.
- `public/app.js`: the whole front end (hub, rooms, video, all 12 games). It has no build step.
- Rooms are kept for 10 minutes after the last person leaves, so a page refresh doesn't lose the game.
