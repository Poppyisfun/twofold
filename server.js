// Twofold — games for two. Rooms that persist (play anytime), shared state sync, chat,
// and WebRTC signaling for the photobooth.
const express = require('express');
const http = require('http');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');

const PORT = process.env.PORT || 3000;
const MAX_PLAYERS = 2;
const KEEP_DAYS = 30;
const DATA = path.join(__dirname, 'data');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { maxHttpBufferSize: 4e6 });

// ---- persistence (JSON files; browsers also keep a backup copy of each room) ----
function load(file, fallback) { try { return JSON.parse(fs.readFileSync(path.join(DATA, file), 'utf8')); } catch { return fallback; } }
const timers = {};
function save(file, getData) {
  clearTimeout(timers[file]);
  timers[file] = setTimeout(() => {
    fs.mkdirSync(DATA, { recursive: true });
    fs.writeFile(path.join(DATA, file), JSON.stringify(getData()), () => {});
  }, 1500);
}

// ---- optional free cloud storage (Upstash Redis) so rooms survive restarts on free hosts ----
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL, REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;
async function redis(body, pipeline) {
  if (!REDIS_URL) return null;
  try {
    const r = await fetch(REDIS_URL + (pipeline ? '/pipeline' : ''), { method: 'POST', headers: { Authorization: `Bearer ${REDIS_TOKEN}` }, body: JSON.stringify(body) });
    return await r.json();
  } catch (e) { console.warn('redis error', e.message); return null; }
}
const dirty = new Set();
let flushTimer;
function flushRedis() {
  clearTimeout(flushTimer);
  flushTimer = setTimeout(() => {
    const cmds = [...dirty].map((c) => {
      const r = rooms.get(c); if (!r) return null;
      const { online, ...rest } = r;
      return ['SET', `room:${c}`, JSON.stringify(rest), 'EX', String(KEEP_DAYS * 86400)];
    }).filter(Boolean);
    dirty.clear();
    if (cmds.length) redis(cmds, true);
  }, 1500);
}
async function fetchRoom(code) {
  const res = await redis(['GET', `room:${code}`]);
  if (!res?.result) return null;
  try { const r = { ...JSON.parse(res.result), online: {} }; rooms.set(code, r); return r; } catch { return null; }
}

let stats = load('stats.json', {});
redis(['GET', 'stats']).then((res) => { if (res?.result) try { stats = { ...JSON.parse(res.result), ...stats }; } catch {} });
const rooms = new Map(); // code -> { members:{cid:{name,joined}}, online:{cid:n}, state, chat:[], v, updated }
for (const [code, r] of Object.entries(load('rooms.json', {}))) rooms.set(code, { ...r, online: {} });
const saveRooms = (code) => { if (code && REDIS_URL) { dirty.add(code); flushRedis(); } saveRoomsFile(); };
const saveRoomsFile = () => save('rooms.json', () => {
  const out = {};
  for (const [c, r] of rooms) { const { online, ...rest } = r; out[c] = rest; }
  return out;
});
setInterval(() => {
  const cutoff = Date.now() - KEEP_DAYS * 864e5;
  for (const [c, r] of rooms) if ((r.updated || 0) < cutoff && !Object.keys(r.online).length) rooms.delete(c);
  saveRoomsFile();
}, 3600e3);

app.use(express.static(path.join(__dirname, 'public')));
app.get('/api/stats', (req, res) => res.json(stats));
app.get('/health', (req, res) => res.send('ok'));

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
function touch(r, code) { r.v = (r.v || 0) + 1; r.state._v = r.v; r.updated = Date.now(); saveRooms(code); }
function playersView(r) {
  const out = {};
  for (const [cid, m] of Object.entries(r.members)) out[cid] = { name: m.name, joined: m.joined, online: !!r.online[cid] };
  return out;
}
function broadcastRoom(code) {
  const r = rooms.get(code);
  if (r) io.to(code).emit('room', { code, players: playersView(r), state: r.state });
}
const swapId = (obj, from, to) => JSON.parse(JSON.stringify(obj).split(from).join(to));
const validSnap = (s, cid) => s && typeof s === 'object' && s.members && typeof s.members === 'object' && s.members[cid]
  && Object.keys(s.members).length <= MAX_PLAYERS && JSON.stringify(s).length < 1.5e6;

io.on('connection', (socket) => {
  let code = null, cid = null;

  function joinRoom(c, info) {
    const r = rooms.get(c);
    code = c;
    cid = String(info?.cid || socket.id).slice(0, 40);
    const name = String(info?.name || 'Guest').slice(0, 24);
    r.members[cid] = { name, joined: r.members[cid]?.joined || Date.now() };
    r.online[cid] = (r.online[cid] || 0) + 1;
    r.updated = Date.now();
    socket.join(c);
    socket.emit('chatlog', r.chat);
    broadcastRoom(c);
    saveRooms(c);
  }

  function leave() {
    if (!code) return;
    const c = code, r = rooms.get(c);
    socket.leave(c);
    code = null;
    if (!r) return;
    if (--r.online[cid] <= 0) delete r.online[cid];
    broadcastRoom(c);
  }

  socket.on('create', (info, cb) => {
    if (typeof cb !== 'function') return;
    leave();
    const c = newCode();
    rooms.set(c, { members: {}, online: {}, state: { game: null, _v: 0 }, chat: [], v: 0, updated: Date.now() });
    joinRoom(c, info);
    cb({ code: c });
  });

  socket.on('join', async (data, cb) => {
    if (typeof cb !== 'function') return;
    const c = String(data?.code || '').toUpperCase().trim();
    const myCid = String(data?.cid || '').slice(0, 40);
    const snap = data?.snapshot;
    let r = rooms.get(c) || (REDIS_URL && /^[A-Z0-9]{5}$/.test(c) ? await fetchRoom(c) : null);
    // room lost (e.g. server restarted on a free host)? rebuild it from the browser's saved copy
    if (!r && /^[A-Z0-9]{5}$/.test(c) && validSnap(snap, myCid)) {
      r = { members: {}, online: {}, state: snap.state || { game: null }, chat: Array.isArray(snap.chat) ? snap.chat.slice(-200) : [], v: snap.state?._v || 0, updated: Date.now() };
      for (const [k, m] of Object.entries(snap.members)) r.members[String(k).slice(0, 40)] = { name: String(m?.name || 'Guest').slice(0, 24), joined: +m?.joined || Date.now() };
      rooms.set(c, r);
    } else if (r && validSnap(snap, myCid) && r.members[myCid] && (snap.state?._v || 0) > (r.v || 0)) {
      r.state = snap.state; r.v = snap.state._v; // browser has a newer copy than the server
    }
    if (!r) return cb({ error: 'No room with that code.' });
    if (code === c) return cb({ code: c });
    if (!r.members[myCid] && Object.keys(r.members).length >= MAX_PLAYERS) {
      // same person on a new device: take over their seat if the name matches and they're offline
      const name = String(data?.name || '').trim().toLowerCase();
      const seat = Object.keys(r.members).find((k) => !r.online[k] && r.members[k].name.trim().toLowerCase() === name);
      if (!seat) return cb({ error: 'That room already has two people.' });
      r.members[myCid] = r.members[seat]; delete r.members[seat];
      r.state = swapId(r.state, seat, myCid);
      r.chat = swapId(r.chat, seat, myCid);
    }
    leave();
    joinRoom(c, { name: data?.name, cid: myCid });
    cb({ code: c });
  });

  socket.on('leave', leave);

  socket.on('state', (patch) => {
    const r = code && rooms.get(code);
    if (!r || !patch || typeof patch !== 'object') return;
    merge(r.state, patch);
    touch(r, code);
    io.to(code).emit('state', r.state);
  });

  socket.on('reset', (st) => {
    const r = code && rooms.get(code);
    if (!r || !st || typeof st !== 'object') return;
    r.state = { game: st.game || null, run: st.run || Date.now(), g: st.g || {}, keep: r.state.keep }; // keep = bucket list etc.
    touch(r, code);
    if (st.game) { stats[st.game] = (stats[st.game] || 0) + 1; save('stats.json', () => stats); redis(['SET', 'stats', JSON.stringify(stats)]); }
    io.to(code).emit('state', r.state);
  });

  // WebRTC signaling (photobooth) + ephemeral messages (drawing strokes, typing) go to the other person
  socket.on('signal', (data) => { if (code) socket.to(code).emit('signal', { from: cid, data }); });
  socket.on('msg', (d) => {
    if (!code || !d || typeof d !== 'object') return;
    socket.to(code).emit('msg', { ...d, from: cid });
  });

  socket.on('chat', (text) => {
    const r = code && rooms.get(code);
    text = String(text || '').trim().slice(0, 1000);
    if (!r || !text) return;
    const m = { cid, name: r.members[cid]?.name || 'Guest', text, ts: Date.now() };
    r.chat.push(m);
    if (r.chat.length > 200) r.chat.shift();
    r.updated = Date.now();
    saveRooms(code);
    io.to(code).emit('chat', m);
  });

  socket.on('disconnect', leave);
});

server.listen(PORT, () => console.log(`Twofold running on http://localhost:${PORT}${REDIS_URL ? ' (saving rooms to Upstash)' : ''}`));
