// Twofold — realtime games for two. Rooms, shared state sync, and WebRTC signaling.
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 2;

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 4e6 });

// ---- play-count stats (used for "most played" badges) ----
const STATS_FILE = path.join(__dirname, 'data', 'stats.json');
let stats = {};
try { stats = JSON.parse(fs.readFileSync(STATS_FILE, 'utf8')); } catch { stats = {}; }
let saveTimer;
function saveStats() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    fs.mkdirSync(path.dirname(STATS_FILE), { recursive: true });
    fs.writeFile(STATS_FILE, JSON.stringify(stats), () => {});
  }, 1000);
}

app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/stats', (req, res) => res.json(stats));
app.get('/health', (req, res) => res.send('ok'));

// ---- rooms ----
const rooms = new Map(); // code -> { players: {id:{name,joined}}, state: {}, deleteTimer }
const ALPHA = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function newCode() {
  let c;
  do { c = Array.from({ length: 5 }, () => ALPHA[Math.floor(Math.random() * ALPHA.length)]).join(''); }
  while (rooms.has(c));
  return c;
}

// deep merge; null deletes a key; arrays are replaced
function merge(target, patch) {
  for (const k of Object.keys(patch)) {
    if (k === '__proto__' || k === 'constructor' || k === 'prototype') continue;
    const v = patch[k];
    if (v === null) delete target[k];
    else if (v && typeof v === 'object' && !Array.isArray(v)) {
      if (!target[k] || typeof target[k] !== 'object' || Array.isArray(target[k])) target[k] = {};
      merge(target[k], v);
    } else target[k] = v;
  }
}

function broadcastRoom(code) {
  const r = rooms.get(code);
  if (r) io.to(code).emit('room', { code, players: r.players, state: r.state });
}

io.on('connection', (socket) => {
  let code = null;

  function joinRoom(c, name) {
    const r = rooms.get(c);
    clearTimeout(r.deleteTimer);
    code = c;
    socket.join(c);
    r.players[socket.id] = { name: String(name || 'Guest').slice(0, 24), joined: Date.now() };
    broadcastRoom(c);
  }

  function leave() {
    if (!code) return;
    const c = code;
    const r = rooms.get(c);
    socket.leave(c);
    code = null;
    if (!r) return;
    delete r.players[socket.id];
    if (Object.keys(r.players).length === 0) {
      r.deleteTimer = setTimeout(() => rooms.delete(c), 10 * 60 * 1000); // keep 10 min for refreshes
    } else broadcastRoom(c);
  }

  socket.on('create', (name, cb) => {
    if (typeof cb !== 'function') return;
    leave();
    const c = newCode();
    rooms.set(c, { players: {}, state: { game: null } });
    joinRoom(c, name);
    cb({ code: c });
  });

  socket.on('join', (data, cb) => {
    if (typeof cb !== 'function') return;
    const c = String(data?.code || '').toUpperCase().trim();
    const r = rooms.get(c);
    if (!r) return cb({ error: 'No room with that code.' });
    if (code === c) return cb({ code: c });
    if (Object.keys(r.players).length >= MAX_PLAYERS) return cb({ error: 'That room already has two people.' });
    leave();
    joinRoom(c, data?.name);
    cb({ code: c });
  });

  socket.on('leave', leave);

  socket.on('state', (patch) => {
    const r = code && rooms.get(code);
    if (!r || !patch || typeof patch !== 'object') return;
    merge(r.state, patch);
    io.to(code).emit('state', r.state);
  });

  socket.on('reset', (st) => {
    const r = code && rooms.get(code);
    if (!r || !st || typeof st !== 'object') return;
    r.state = { game: st.game || null, run: st.run || Date.now(), g: st.g || {} };
    if (st.game) { stats[st.game] = (stats[st.game] || 0) + 1; saveStats(); }
    io.to(code).emit('state', r.state);
  });

  // WebRTC signaling + ephemeral messages (drawing strokes, photos, chat) go to the other person
  socket.on('signal', (data) => { if (code) socket.to(code).emit('signal', { from: socket.id, data }); });
  socket.on('msg', (d) => {
    if (!code || !d || typeof d !== 'object') return;
    if (d.t === 'chat') d.text = String(d.text || '').slice(0, 500);
    socket.to(code).emit('msg', { ...d, from: socket.id });
  });

  socket.on('disconnect', leave);
});

server.listen(PORT, () => console.log(`Twofold running on http://localhost:${PORT}`));
