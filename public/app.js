/* Param & Nitya’s LDR Date Room — hub, rooms, chat, photobooth camera and games */
const socket = io();
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const shuffle = (a) => { a = [...a]; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
const range = (n) => [...Array(n).keys()];
const rand = (n) => Math.floor(Math.random() * n);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fmt = (s) => { s = Math.ceil(s); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

// ---------------- shared session state ----------------
const CID = localStorage.cid || (localStorage.cid = Math.random().toString(36).slice(2));
const S = { me: CID, code: null, players: {}, state: {}, chat: [] };
const ids = () => Object.entries(S.players).sort((a, b) => a[1].joined - b[1].joined).map((e) => e[0]);
const partner = () => ids().find((id) => id !== S.me);
const online = (id) => !!S.players[id]?.online;
// the first person currently online does bookkeeping (reveals, scoring) — works even if the other is away
const isHost = () => ids().filter(online)[0] === S.me;
const pname = (id) => (id === S.me ? 'You' : S.players[id]?.name || 'Partner');
const patch = (p) => socket.emit('state', p);
const gpatch = (p) => patch({ g: p });
const both = (o) => !!o && ids().length === 2 && ids().every((id) => o[id] !== undefined && o[id] !== null);
const selectGame = (id) => socket.emit('reset', { game: id, run: Date.now(), g: id ? GAMES[id].init() : {} });

function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.tm); toast.tm = setTimeout(() => t.classList.remove('show'), 2600);
}

// ---------------- catalog ----------------
// live: both people need to be online at the same time. Everything else can be played anytime.
const META = [
  { id: 'photobooth', t: 'Online Photobooth', m: 5, req: 'cam', live: true, e: '📸', c: '#ffd0dd' },
  { id: 'wyr', t: 'Would You Rather', m: 10, e: '🤔', c: '#ffe0c7' },
  { id: 'quiz', t: 'How Well Do You Know Me', m: 10, e: '💭', c: '#e5dbff' },
  { id: 'pictionary', t: 'Guess My Drawing', m: 15, live: true, e: '✏️', c: '#fff1b8' },
  { id: 'ttl', t: 'Two Truths and a Lie', m: 10, e: '🤥', c: '#d8f3e6' },
  { id: 'story', t: 'Story Together', m: 15, turn: true, e: '📖', c: '#e3e9ff' },
  { id: 'nhie', t: 'Never Have I Ever', m: 10, e: '🙊', c: '#ffdcd2' },
  { id: 'draw', t: 'Draw Together', m: 10, live: true, e: '🎨', c: '#ffe8c2' },
  { id: 'honest', t: 'Honest Cards', m: 20, e: '🃏', c: '#d6e4ff' },
  { id: 'lovematch', t: 'Love Match', m: 10, e: '💘', c: '#ffd0e8' },
  { id: 'hangman', t: 'Hangman', m: 10, turn: true, e: '🔤', c: '#ece3ff' },
  { id: 'tictactoe', t: 'Tic-Tac-Toe', m: 5, turn: true, e: '⭕', c: '#d9f0ff' },
  { id: 'connect4', t: 'Connect Four', m: 10, turn: true, e: '🔴', c: '#ffe3e3' },
  { id: 'battleship', t: 'Battleship', m: 20, turn: true, e: '🚢', c: '#d4ecf7' },
  { id: 'bucket', t: 'Our Bucket List', m: 10, e: '🌍', c: '#dff5d8' },
  { id: 'escape', t: 'Escape Room', m: 20, e: '🗝️', c: '#e6e1d6' },
];
const metaLabel = (m) => m.req === 'cam' ? '📷 Live, camera' : m.live ? '⚡ Live' : m.turn ? '🕓 Take turns' : '🕓 Anytime';
const metaOf = (id) => META.find((m) => m.id === id);
const tried = () => { try { return JSON.parse(localStorage.tried || '[]'); } catch { return []; } };
const markTried = (id) => { const t = new Set(tried()); t.add(id); localStorage.tried = JSON.stringify([...t]); };

let STATS = {};
function cardsHTML(withBadges) {
  const ranks = Object.entries(STATS).filter((e) => metaOf(e[0])).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
  const tr = tried();
  return META.map((m) => {
    const r = ranks.indexOf(m.id);
    return `<button class="card" data-game="${m.id}">
      ${withBadges && r >= 0 && STATS[m.id] > 0 ? `<span class="badge">#${r + 1} most played</span>` : ''}
      <div class="coin" style="background:${m.c}">${m.e}</div>
      <div><h3>${m.t}</h3><div class="meta">${m.m} min · ${metaLabel(m)}${tr.includes(m.id) ? ' · <span style="color:var(--green)">✓ tried</span>' : ''}</div></div></button>`;
  }).join('');
}
function renderHome() {
  $('#thumbs').innerHTML = META.map((m) => `<button class="thumb" data-game="${m.id}"><div class="coin" style="background:${m.c}">${m.e}</div><span>${m.t}</span></button>`).join('');
  $('#cards').innerHTML = cardsHTML(true);
  $('#tried').textContent = `${tried().filter((t) => metaOf(t)).length} of ${META.length} tried`;
  renderMyRooms();
}
// ---- saved rooms (play anytime) ----
const snapKey = (code) => `room:${code}`;
function loadSnap(code) { try { return JSON.parse(localStorage[snapKey(code)] || 'null'); } catch { return null; } }
function saveSnap() {
  if (!S.code || !S.players[CID]) return;
  const members = {};
  for (const [k, v] of Object.entries(S.players)) members[k] = { name: v.name, joined: v.joined };
  try { localStorage[snapKey(S.code)] = JSON.stringify({ code: S.code, members, state: S.state, chat: S.chat.slice(-200), saved: Date.now() }); } catch {}
}
function mySnaps() {
  return Object.keys(localStorage).filter((k) => k.startsWith('room:')).map((k) => { try { return JSON.parse(localStorage[k]); } catch { return null; } })
    .filter((x) => x && x.members && Object.keys(x.members).length === 2).sort((a, b) => b.saved - a.saved);
}
function renderMyRooms() {
  const list = mySnaps().slice(0, 8);
  $('#myRooms').hidden = !list.length;
  $('#myRoomsList').innerHTML = list.map((r) => {
    const other = Object.entries(r.members).find(([k]) => k !== CID)?.[1]?.name || 'Partner';
    const m = metaOf(r.state?.game);
    const turn = m && GAMES[m.id]?.turnOf ? GAMES[m.id].turnOf(r.state.g || {}, Object.keys(r.members).sort((a, b) => r.members[a].joined - r.members[b].joined)) : null;
    return `<div class="room-card" data-room="${esc(r.code)}">
      <div class="coin" style="background:${m?.c || '#eee'}">${m?.e || '💞'}</div>
      <div class="rc-body"><b>With ${esc(other)}</b><div class="meta">${m ? esc(m.t) : 'Choosing a game'} · ${new Date(r.saved).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
      ${turn === CID ? '<span class="your-turn">Your turn!</span>' : ''}</div>
      <button class="rc-x" data-forget="${esc(r.code)}" title="Forget this room">✕</button></div>`;
  }).join('');
}
$('#myRoomsList').addEventListener('click', (e) => {
  const f = e.target.closest('[data-forget]');
  if (f) { e.stopPropagation(); delete localStorage[snapKey(f.dataset.forget)]; renderMyRooms(); return; }
  const r = e.target.closest('[data-room]'); if (r) joinRoom(r.dataset.room);
});
fetch('/api/stats').then((r) => r.json()).then((s) => { STATS = s; if (!S.code) renderHome(); }).catch(() => {});

// ---------------- name ----------------
function askName() {
  return new Promise((resolve) => {
    const d = $('#nameDlg'), inp = $('#nameInput');
    inp.value = localStorage.name || '';
    d.showModal(); inp.focus();
    d.onclose = () => { const n = inp.value.trim() || localStorage.name || 'Guest'; localStorage.name = n; updateNameBtn(); resolve(n); };
  });
}
async function ensureName() { return localStorage.name || askName(); }
function updateNameBtn() { $('#nameBtn').textContent = localStorage.name ? `👤 ${localStorage.name}` : 'Set your name'; }

// ---------------- room flow ----------------
async function createRoom(game, thenInvite) {
  const name = await ensureName();
  socket.emit('create', { name, cid: CID }, (res) => {
    enterRoom(res.code);
    if (game) selectGame(game);
    if (thenInvite) invite();
  });
}
async function joinRoom(code, silent) {
  code = String(code || '').trim().toUpperCase();
  if (!code) return toast('Enter a room code');
  const name = await ensureName();
  socket.emit('join', { code, name, cid: CID, snapshot: loadSnap(code) }, (res) => {
    if (res.error) { toast(res.error); if (silent) leaveRoom(); return; }
    enterRoom(res.code);
  });
}
function enterRoom(code) {
  S.code = code;
  history.replaceState(null, '', `/?room=${code}`);
  $('#home').hidden = true; $('#room').hidden = false;
  $('#roomCode').textContent = code;
  saveSnap();
  renderRoom();
}
function leaveRoom() {
  socket.emit('leave');
  unmount(); S.code = null; S.players = {}; S.state = {}; S.chat = [];
  history.replaceState(null, '', '/');
  $('#home').hidden = false; $('#room').hidden = true;
  $('#chatLog').innerHTML = '<div class="chat-empty">Say hi 👋 — messages stay here while you play.</div>';
  renderHome();
}
const inviteLink = () => `${location.origin}/?room=${S.code}`;
async function invite() {
  const url = inviteLink();
  if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
    try { await navigator.share({ title: 'Param & Nitya’s LDR Date Room', text: `Join my room: ${S.code}`, url }); return; } catch {}
  }
  try { await navigator.clipboard.writeText(url); toast('Invite link copied!'); }
  catch { prompt('Send this link to your partner:', url); }
}

socket.on('connect', () => {
  if (S.code) joinRoom(S.code, true); // reconnect after a drop
});
socket.on('room', (d) => { S.players = d.players; S.state = d.state; saveSnap(); renderRoom(); });
socket.on('state', (st) => { S.state = st; saveSnap(); renderRoom(); });
socket.on('signal', (d) => RTC.onSignal(d));
socket.on('msg', (d) => {
  if (d.t === 'typing') return showTyping();
  current?.onMsg?.(d);
});

// ---------------- room rendering & game lifecycle ----------------
let current = null, stageKey = null;
const stage = $('#stage');

function renderRoom() {
  if (!S.code) return;
  const p = partner();
  const pr = $('#presence');
  pr.className = 'presence' + (p && online(p) ? ' on' : '');
  pr.innerHTML = `<i></i>${!p ? 'Waiting for your partner' : online(p) ? `${esc(S.players[p].name)} is here` : `${esc(S.players[p].name)} is away`}`;
  $('#backBtn').hidden = !S.state.game;

  const g = S.state.game;
  const two = ids().length >= 2;
  const liveBlocked = g && two && metaOf(g)?.live && !online(p);
  const key = !g ? 'picker' : !two ? `wait:${g}` : liveBlocked ? `away:${g}` : `${g}:${S.state.run}`;
  if (key !== stageKey) {
    unmount();
    stageKey = key;
    stage.innerHTML = '';
    if (!g) mountPicker();
    else if (!two) mountWaiting(g);
    else if (liveBlocked) mountAway(g);
    else mountGame(g);
  } else if (current?.update) current.update(S.state.g || {});
}

function unmount() {
  if (current?.destroy) current.destroy();
  current = null; stageKey = null;
  RTC.stop();
}

function mountPicker() {
  const p = partner();
  stage.innerHTML = `<div class="panel wide" style="text-align:left">
    <div class="kicker">${p ? `You & ${esc(S.players[p].name)}` : 'Your room'}</div>
    <h2>Pick something to play</h2>
    <p class="muted">${p ? `Whatever you pick opens on both screens. 🕓 games can be played even when ${esc(S.players[p].name)} is away: they'll see your move when they're back.` : `Share code <b>${S.code}</b> or the invite link — you can pick a game now and it'll start when they arrive.`}</p>
    <div class="cards">${cardsHTML(false)}</div></div>`;
}

function mountWaiting(g) {
  const m = metaOf(g);
  stage.innerHTML = `<div class="panel">
    <div class="big-emoji">${m.e}</div><div class="kicker">${m.t}</div>
    <h2>Waiting for your partner…</h2>
    <p class="muted">Send them this code, or the invite link. They can open it on any device.</p>
    <div class="invite-code">${S.code}</div>
    <div class="row"><button class="btn primary" data-a="invite">Copy invite link</button></div>
    <p class="waiting">The game starts as soon as they join.</p></div>`;
}

function mountAway(g) {
  const m = metaOf(g), p = partner();
  stage.innerHTML = `<div class="panel">
    <div class="big-emoji">${m.e}</div><div class="kicker">${m.t}</div>
    <h2>${esc(S.players[p].name)} is away right now</h2>
    <p class="muted">${m.t} is a live game, so you both need to be here. Send them the link, or pick a game you can play anytime and take your turn now.</p>
    <div class="row"><button class="btn primary" data-a="invite">Copy invite link</button><button class="btn" data-a="home">Pick another game</button></div></div>`;
}

function mountGame(id) {
  const m = metaOf(id);
  const el = document.createElement('div');
  stage.appendChild(el);
  markTried(id);
  if (m.req === 'cam') RTC.start();
  current = GAMES[id].create(el);
  current.update?.(S.state.g || {});
}

stage.addEventListener('click', (e) => {
  const card = e.target.closest('[data-game]');
  if (card) return selectGame(card.dataset.game);
  const a = e.target.closest('[data-a]')?.dataset.a;
  if (a === 'invite') invite();
  if (a === 'again') selectGame(S.state.game);
  if (a === 'home') selectGame(null);
});

// ---------------- chat ----------------
socket.on('chatlog', (list) => { S.chat = list.slice(); $('#chatLog').innerHTML = list.length ? '' : '<div class="chat-empty">Say hi 👋 — messages stay here while you play.</div>'; list.forEach(renderChat); saveSnap(); });
socket.on('chat', (m) => { S.chat.push(m); saveSnap(); renderChat(m); });
function renderChat(m) {
  const log = $('#chatLog'), mine = m.cid === CID;
  $('.chat-empty', log)?.remove();
  const d = document.createElement('div');
  d.className = 'msg' + (mine ? ' mine' : '');
  const time = new Date(m.ts).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  d.innerHTML = `<div class="msg-meta">${mine ? 'You' : esc(m.name)} · ${time}</div>`;
  d.appendChild(document.createTextNode(m.text));
  log.appendChild(d);
  log.scrollTop = 1e9;
  if (!mine) { $('#typing').textContent = ''; if (document.hidden) document.title = '💬 New message — Param & Nitya’s LDR Date Room'; }
}
document.addEventListener('visibilitychange', () => { if (!document.hidden) document.title = 'Param & Nitya’s LDR Date Room 💞'; });
let typingTm;
function showTyping() {
  const p = partner(); if (!p) return;
  $('#typing').textContent = `${S.players[p].name} is typing…`;
  clearTimeout(typingTm); typingTm = setTimeout(() => ($('#typing').textContent = ''), 2500);
}
let lastTyping = 0;
$('#chatInput').addEventListener('input', () => { if (Date.now() - lastTyping > 1500) { lastTyping = Date.now(); socket.emit('msg', { t: 'typing' }); } });
$('#chatForm').onsubmit = (e) => {
  e.preventDefault();
  const v = $('#chatInput').value.trim(); if (!v) return;
  socket.emit('chat', v); $('#chatInput').value = '';
};

// ---------------- video (WebRTC, perfect negotiation) ----------------
const ICE = { iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }] };
// To support strict networks, add a TURN server here, e.g.
// { urls: 'turn:your.turn.server:3478', username: 'user', credential: 'pass' }
const RTC = {
  active: false, stream: null, pc: null, remote: null, queue: [], makingOffer: false, ignoreOffer: false,
  async start() {
    this.active = true;
    const q = this.queue; this.queue = [];
    if (!this.stream) {
      try { this.stream = await navigator.mediaDevices.getUserMedia({ video: { width: 640, height: 480 }, audio: true }); }
      catch (e) {
        try { this.stream = await navigator.mediaDevices.getUserMedia({ video: true }); }
        catch (e2) { toast(location.protocol === 'https:' || location.hostname === 'localhost' ? 'Camera blocked or unavailable' : 'Cameras need HTTPS — see README'); }
      }
    }
    if (!this.active) { this.stopTracks(); return; }
    this.ensurePc();
    this.addTracks();
    updateVideos();
    for (const d of q) await this.onSignal(d);
  },
  ensurePc() {
    const p = partner();
    if (!p || this.pc) return this.pc;
    const pc = (this.pc = new RTCPeerConnection(ICE));
    this.polite = S.me > p;
    pc.ontrack = (e) => { this.remote = e.streams[0] || new MediaStream([e.track]); updateVideos(); };
    pc.onicecandidate = (e) => e.candidate && socket.emit('signal', { candidate: e.candidate });
    pc.onnegotiationneeded = async () => {
      try { this.makingOffer = true; await pc.setLocalDescription(); socket.emit('signal', { description: pc.localDescription }); }
      catch (err) { console.warn(err); } finally { this.makingOffer = false; }
    };
    return pc;
  },
  addTracks() {
    if (this.pc && this.stream && this.pc.getSenders().every((s) => !s.track)) {
      this.stream.getTracks().forEach((t) => this.pc.addTrack(t, this.stream));
    }
  },
  async onSignal({ data }) {
    if (!this.active) { this.queue.push({ data }); return; }
    const pc = this.ensurePc(); if (!pc) return;
    try {
      if (data.description) {
        const d = data.description;
        const collision = d.type === 'offer' && (this.makingOffer || pc.signalingState !== 'stable');
        this.ignoreOffer = !this.polite && collision;
        if (this.ignoreOffer) return;
        await pc.setRemoteDescription(d);
        if (d.type === 'offer') { await pc.setLocalDescription(); socket.emit('signal', { description: pc.localDescription }); }
      } else if (data.candidate) {
        try { await pc.addIceCandidate(data.candidate); } catch (e) { if (!this.ignoreOffer) console.warn(e); }
      }
    } catch (e) { console.warn('signal error', e); }
  },
  stopTracks() { this.stream?.getTracks().forEach((t) => t.stop()); this.stream = null; },
  stop() {
    this.active = false; this.queue = [];
    try { this.pc?.close(); } catch {}
    this.pc = null; this.remote = null; this.stopTracks();
  },
};
function updateVideos() {
  $$('video.local').forEach((v) => { if (v.srcObject !== RTC.stream) v.srcObject = RTC.stream; v.parentElement.querySelector('.novid').hidden = !!RTC.stream; });
  $$('video.remote').forEach((v) => { if (v.srcObject !== RTC.remote) v.srcObject = RTC.remote; v.parentElement.querySelector('.novid').hidden = !!RTC.remote; });
}
const videoHTML = () => `<div class="vids">
  <div class="vid me"><video class="local" autoplay playsinline muted></video><div class="novid">Starting camera…</div><span>You</span></div>
  <div class="vid them"><video class="remote" autoplay playsinline></video><div class="novid">Connecting to ${esc(pname(partner()))}…</div><span>${esc(pname(partner()))}</span></div></div>`;

// ---------------- UI helpers ----------------
const scoresHTML = (score = {}) => `<div class="scores">${ids().map((id) => `<span class="score ${id === S.me ? 'me' : 'them'}">${esc(pname(id))}: ${score[id] || 0}</span>`).join('')}</div>`;
const endButtons = () => `<div class="row"><button class="btn primary" data-a="again">Play again</button><button class="btn" data-a="home">Pick another game</button></div>`;
const progressHTML = (i, n) => `<div class="progress"><i style="width:${(i / n) * 100}%"></i></div>`;
function keepInputs(el, fn) { // re-render without losing what the user is typing
  const saved = $$('textarea, input.text', el).map((i) => [i.id, i.value, i === document.activeElement]);
  fn();
  saved.forEach(([id, v, f]) => { const i = id && el.querySelector('#' + id); if (i) { i.value = v; if (f) i.focus(); } });
}
// ---------------- GAMES ----------------
const GAMES = {};

/* Online Photobooth */
GAMES.photobooth = {
  init: () => ({ run: 0 }),
  create(el) {
    el.innerHTML = `<div class="panel wide">${videoHTML()}
      <div class="count" id="count"></div>
      <div class="row" style="margin-top:0"><button class="btn primary big" data-a="shoot" id="shootBtn">📸 Start photo strip</button></div>
      <p class="muted" id="hint">4 photos, 3-second countdown each. Get close and strike a pose!</p>
      <div class="strip-out" id="strip"></div></div>`;
    updateVideos();
    let lastRun = S.state.g?.run || 0, busy = false;
    const shots = {};
    el.onclick = (e) => { if (e.target.closest('[data-a="shoot"]') && !busy) gpatch({ run: (S.state.g.run || 0) + 1 }); };
    function capture() {
      const v = $('video.local', el); if (!RTC.stream || !v.videoWidth) return null;
      const c = document.createElement('canvas'); c.width = 480; c.height = 360; const x = c.getContext('2d');
      const r = Math.max(480 / v.videoWidth, 360 / v.videoHeight), w = v.videoWidth * r, h = v.videoHeight * r;
      x.translate(480, 0); x.scale(-1, 1); x.drawImage(v, (480 - w) / 2, (360 - h) / 2, w, h);
      return c.toDataURL('image/jpeg', 0.85);
    }
    async function sequence(run) {
      busy = true; $('#shootBtn', el).disabled = true; $('#strip', el).innerHTML = '';
      const mine = ((shots[run] ||= {})[S.me] ||= []);
      for (let i = 0; i < 4; i++) {
        for (let n = 3; n > 0; n--) { $('#count', el).textContent = n; await sleep(800); }
        $('#count', el).textContent = '✨';
        $$('.vid', el).forEach((v) => { v.classList.remove('flash'); void v.offsetWidth; v.classList.add('flash'); });
        const img = capture(); mine[i] = img;
        socket.emit('msg', { t: 'shot', run, i, img });
        await sleep(600);
      }
      $('#count', el).textContent = ''; $('#hint', el).textContent = 'Developing your strip…';
      busy = false; $('#shootBtn', el).disabled = false;
      compose(run);
    }
    const full = (a) => a && a.filter(() => true).length === 4;
    async function compose(run) {
      const a = shots[run]?.[S.me], b = shots[run]?.[partner()];
      if (!full(a) || !full(b) || busy) return;
      const W = 360, H = 270, pad = 18, c = document.createElement('canvas');
      c.width = pad * 3 + W * 2; c.height = pad * 5 + H * 4 + 70;
      const x = c.getContext('2d');
      x.fillStyle = '#fffaf7'; x.fillRect(0, 0, c.width, c.height);
      const load = (src) => new Promise((res) => { if (!src) return res(null); const im = new Image(); im.onload = () => res(im); im.onerror = () => res(null); im.src = src; });
      for (let i = 0; i < 4; i++) {
        for (const [k, src, col] of [[0, a[i], '#ff5c8a'], [1, b[i], '#4d7cff']]) {
          const px = pad + k * (W + pad), py = pad + i * (H + pad);
          x.fillStyle = col; x.fillRect(px - 4, py - 4, W + 8, H + 8);
          const im = await load(src);
          if (im) x.drawImage(im, px, py, W, H); else { x.fillStyle = '#ddd'; x.fillRect(px, py, W, H); }
        }
      }
      x.fillStyle = '#1d1f27'; x.textAlign = 'center'; x.font = 'bold 26px system-ui, sans-serif';
      x.fillText(`${S.players[S.me]?.name || 'Me'} 💞 ${S.players[partner()]?.name || 'You'}`, c.width / 2, c.height - 42);
      x.fillStyle = '#6b7080'; x.font = '16px system-ui, sans-serif';
      x.fillText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) + ' · Param & Nitya’s LDR Date Room', c.width / 2, c.height - 16);
      const url = c.toDataURL('image/jpeg', 0.92);
      $('#hint', el).textContent = 'Here you go! Want another?';
      $('#strip', el).innerHTML = `<img src="${url}" alt="Photo strip"><div class="row"><a class="btn primary" download="param-nitya-photostrip.jpg" href="${url}">Download strip</a></div>`;
    }
    return {
      update(g) { if ((g.run || 0) > lastRun) { lastRun = g.run; sequence(g.run); } },
      onMsg(d) { if (d.t === 'shot') { (((shots[d.run] ||= {})[d.from] ||= []))[d.i] = d.img; compose(d.run); } },
    };
  },
};

/* How Well Do You Know Me */
GAMES.quiz = {
  init: () => ({ q: 0, order: shuffle(range(CONTENT.quiz.length)).slice(0, 10), ans: {}, score: {}, reveal: false }),
  create(el) {
    let scored = -1;
    el.onclick = (e) => {
      const b = e.target.closest('[data-p]'); const g = S.state.g;
      if (b && !g.ans?.[S.me] && g.ans?.[S.me] !== 0) gpatch({ ans: { [S.me]: +b.dataset.p } });
      if (e.target.closest('[data-a="next"]')) gpatch({ q: g.q + 1, ans: null, reveal: false });
    };
    return {
      update(g) {
        const P = ids(), N = g.order.length;
        if (g.q >= N) {
          const best = P.slice().sort((a, b) => (g.score[b] || 0) - (g.score[a] || 0));
          const tie = (g.score[P[0]] || 0) === (g.score[P[1]] || 0);
          el.innerHTML = `<div class="panel"><div class="big-emoji">🏆</div><h2>${tie ? "It's a tie — you know each other equally well!" : `${esc(pname(best[0]))} ${best[0] === S.me ? 'know' : 'knows'} their partner best`}</h2>
            <p class="muted">Each correct guess about your partner = 1 point.</p>${scoresHTML(g.score)}${endButtons()}</div>`;
          return;
        }
        const subj = P[g.q % 2], guesser = P[(g.q + 1) % 2], Q = CONTENT.quiz[g.order[g.q]], ans = g.ans || {};
        if (!g.reveal && both(ans) && isHost() && scored !== g.q) {
          scored = g.q;
          gpatch({ reveal: true, score: ans[subj] === ans[guesser] ? { [guesser]: (g.score?.[guesser] || 0) + 1 } : {} });
        }
        const iAmSubj = S.me === subj, mine = ans[S.me];
        let body;
        if (g.reveal) {
          const hit = ans[subj] === ans[guesser];
          body = `<div class="big-emoji">${hit ? '🎯' : '🙈'}</div><h2>${hit ? 'Nailed it!' : 'Not quite!'}</h2>
            <div class="reveal"><div><div class="who">${esc(pname(subj))} answered</div><b>${esc(Q.o[ans[subj]])}</b></div>
            <div><div class="who">${esc(pname(guesser))} guessed</div><b>${esc(Q.o[ans[guesser]])}</b></div></div>
            <div class="row"><button class="btn primary" data-a="next">Next question →</button></div>`;
        } else {
          const label = iAmSubj ? 'Answer about yourself' : `Guess what ${esc(pname(subj))} will say`;
          body = `<div class="kicker">${label}</div><div class="q">${esc(Q.q)}</div>
            <div class="opts">${Q.o.map((o, i) => `<button class="opt ${mine === i ? 'sel' : ''}" data-p="${i}">${esc(o)}</button>`).join('')}</div>
            ${mine !== undefined ? `<p class="waiting">Locked in. Waiting for ${esc(pname(partner()))}…</p>` : ''}`;
        }
        el.innerHTML = `<div class="panel"><div class="kicker">Question ${g.q + 1} of ${N}</div>${progressHTML(g.q, N)}${body}${scoresHTML(g.score)}</div>`;
      },
    };
  },
};

/* 3. Draw Together */
GAMES.draw = {
  init: () => ({ prompt: '' }),
  create(el) {
    const COLORS = ['#1d1f27', '#ff5c8a', '#4d7cff', '#19b37a', '#f59e0b', '#8b5cf6', '#ef4444', '#8b5a2b'];
    el.innerHTML = `<div class="panel wide">
      <div class="prompt" id="prompt"></div>
      <div class="toolbar">${COLORS.map((c, i) => `<span class="swatch ${i ? '' : 'on'}" data-c="${c}" style="background:${c}"></span>`).join('')}
        <input type="range" id="size" min="2" max="40" value="6" title="Brush size">
        <button class="btn small" data-a="eraser" id="eraser">Eraser</button>
        <button class="btn small" data-a="clear">Clear</button>
        <button class="btn small" data-a="prompt">🎲 Prompt</button>
        <button class="btn small primary" data-a="save">Save</button></div>
      <canvas class="board" width="1200" height="760"></canvas>
      <p class="muted" style="margin-bottom:0">You're both drawing on the same canvas, live.</p></div>`;
    const cv = $('canvas', el), ctx = cv.getContext('2d');
    let hist = [], color = COLORS[0], erasing = false, last = null;
    const wipe = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); };
    const seg = ([x0, y0, x1, y1, c, w]) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0 * cv.width, y0 * cv.height); ctx.lineTo(x1 * cv.width, y1 * cv.height); ctx.stroke(); };
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    const add = (a, b) => {
      const size = +$('#size', el).value;
      const s = [a[0], a[1], b[0], b[1], erasing ? '#ffffff' : color, erasing ? size * 3 : size];
      hist.push(s); seg(s); socket.emit('msg', { t: 'seg', s });
    };
    wipe();
    cv.onpointerdown = (e) => { cv.setPointerCapture(e.pointerId); last = pos(e); add(last, last); };
    cv.onpointermove = (e) => { if (!last) return; const p = pos(e); add(last, p); last = p; };
    cv.onpointerup = cv.onpointercancel = () => { last = null; };
    el.onclick = (e) => {
      const sw = e.target.closest('[data-c]');
      if (sw) { color = sw.dataset.c; erasing = false; $$('.swatch', el).forEach((s) => s.classList.toggle('on', s === sw)); $('#eraser', el).classList.remove('primary'); }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'eraser') { erasing = !erasing; e.target.classList.toggle('primary', erasing); }
      if (a === 'clear') { hist = []; wipe(); socket.emit('msg', { t: 'clear' }); }
      if (a === 'prompt') gpatch({ prompt: CONTENT.drawPrompts[rand(CONTENT.drawPrompts.length)] });
      if (a === 'save') { const l = document.createElement('a'); l.download = 'param-nitya-drawing.png'; l.href = cv.toDataURL('image/png'); l.click(); }
    };
    socket.emit('msg', { t: 'syncreq' });
    return {
      update(g) { $('#prompt', el).textContent = g.prompt ? `Prompt: ${g.prompt}` : 'Free draw — or roll a prompt 🎲'; },
      onMsg(d) {
        if (d.t === 'seg') { hist.push(d.s); seg(d.s); }
        if (d.t === 'clear') { hist = []; wipe(); }
        if (d.t === 'syncreq' && hist.length) socket.emit('msg', { t: 'sync', hist });
        if (d.t === 'sync' && Array.isArray(d.hist) && d.hist.length > hist.length) { hist = d.hist; wipe(); hist.forEach(seg); }
      },
    };
  },
};

/* 6. Honest Cards */
GAMES.honest = {
  init: () => ({ level: 1, idx: { 1: 0, 2: 0, 3: 0 }, order: { 1: shuffle(range(CONTENT.honest[1].length)), 2: shuffle(range(CONTENT.honest[2].length)), 3: shuffle(range(CONTENT.honest[3].length)) }, ans: {} }),
  create(el) {
    const LV = { 1: 'Warm up', 2: 'Closer', 3: 'Deep' };
    el.onclick = (e) => {
      const g = S.state.g; const a = e.target.closest('[data-a]')?.dataset.a;
      const lv = e.target.closest('[data-lv]')?.dataset.lv;
      if (lv) gpatch({ level: +lv, ans: null });
      if (a === 'lock') { const v = $('#mine', el).value.trim() || '(answered out loud)'; gpatch({ ans: { [S.me]: v } }); }
      if (a === 'next') gpatch({ idx: { [g.level]: (g.idx[g.level] || 0) + 1 }, ans: null });
    };
    return {
      update(g) {
        const lvl = g.level, list = CONTENT.honest[lvl], ord = g.order[lvl], i = g.idx[lvl] || 0;
        const card = list[ord[i % ord.length]], ans = g.ans || {};
        keepInputs(el, () => {
          el.innerHTML = `<div class="panel">
            <div class="tabs">${[1, 2, 3].map((n) => `<button data-lv="${n}" class="${n === lvl ? 'on' : ''}">${LV[n]}</button>`).join('')}</div>
            <div class="kicker" style="margin-top:16px">Card ${i + 1} · ${LV[lvl]}</div>
            <div class="q">${esc(card)}</div>
            ${both(ans)
              ? `<div class="reveal" style="text-align:left">${ids().map((id) => `<div><div class="who">${esc(pname(id))}</div>${esc(ans[id])}</div>`).join('')}</div>
                 <div class="row"><button class="btn primary" data-a="next">Next card →</button></div>`
              : ans[S.me]
                ? `<p class="waiting">Locked in. Waiting for ${esc(pname(partner()))}… (answers reveal together)</p>`
                : `<textarea id="mine" placeholder="Type your answer — or talk it through and just lock in"></textarea>
                   <div class="row"><button class="btn primary" data-a="lock">Lock in answer</button>${ans[partner()] ? `<span class="muted">${esc(pname(partner()))} has answered</span>` : ''}</div>`}
          </div>`;
        });
      },
    };
  },
};

/* 7. Love Match — this or that */
GAMES.lovematch = {
  init: () => ({ i: 0, order: shuffle(range(CONTENT.loveMatch.length)).slice(0, 12), ans: {}, hits: 0, reveal: false }),
  create(el) {
    let scored = -1;
    el.onclick = (e) => {
      const g = S.state.g; const b = e.target.closest('[data-p]');
      if (b && g.ans?.[S.me] === undefined) gpatch({ ans: { [S.me]: +b.dataset.p } });
      if (e.target.closest('[data-a="next"]')) gpatch({ i: g.i + 1, ans: null, reveal: false });
    };
    return {
      update(g) {
        const N = g.order.length;
        if (g.i >= N) {
          const pct = Math.round((g.hits / N) * 100);
          const msg = pct >= 80 ? 'Basically the same person 💞' : pct >= 60 ? 'A great match!' : pct >= 40 ? 'Opposites attract 😄' : 'You keep each other interesting!';
          el.innerHTML = `<div class="panel"><div class="big-emoji">💘</div><div class="kicker">Love Match</div><h2 style="font-size:3rem">${pct}%</h2><p>${msg}</p><p class="muted">You matched on ${g.hits} of ${N}.</p>${endButtons()}</div>`;
          return;
        }
        const pair = CONTENT.loveMatch[g.order[g.i]], ans = g.ans || {};
        if (!g.reveal && both(ans) && isHost() && scored !== g.i) {
          scored = g.i; const [a, b] = ids();
          gpatch({ reveal: true, hits: g.hits + (ans[a] === ans[b] ? 1 : 0) });
        }
        let body;
        if (g.reveal) {
          const [a, b] = ids(), m = ans[a] === ans[b];
          body = `<div class="big-emoji">${m ? '💞' : '🤷'}</div><h2>${m ? "It's a match!" : 'Different picks'}</h2>
            <div class="reveal">${ids().map((id) => `<div><div class="who">${esc(pname(id))}</div><b>${esc(pair[ans[id]])}</b></div>`).join('')}</div>
            <div class="row"><button class="btn primary" data-a="next">Next →</button></div>`;
        } else {
          body = `<div class="q">This or that?</div><div class="opts">${pair.map((o, i) => `<button class="opt ${ans[S.me] === i ? 'sel' : ''}" data-p="${i}" style="font-size:1.2rem;padding:28px">${esc(o)}</button>`).join('')}</div>
            ${ans[S.me] !== undefined ? `<p class="waiting">Waiting for ${esc(pname(partner()))}…</p>` : ''}`;
        }
        el.innerHTML = `<div class="panel"><div class="kicker">${g.i + 1} of ${N} · ${g.hits} matches</div>${progressHTML(g.i, N)}${body}</div>`;
      },
    };
  },
};

/* 10. Escape Room — cooperative, each player sees different clues */
const LOCKS = [
  { name: 'The Painted Safe', answer: '5792', input: '4-digit code',
    A: `<div class="lbl">On the wall you see four painted numbers</div><div style="font-size:1.5rem">🟥 7 &nbsp; 🟦 2 &nbsp; 🟩 9 &nbsp; 🟨 5</div>`,
    B: `<div class="lbl">A sticky note on the safe reads</div>"Yellow, then red, then green, then blue."`,
    hint: 'One of you has the numbers, the other has the order. Read them to each other.' },
  { name: 'The Letter Grid', answer: 'LOVE', input: '4-letter word',
    A: `<div class="lbl">A scrap of paper in a book</div><div style="font-size:1.4rem;font-family:ui-monospace,monospace">B2 → B1 → C3 → A3</div>`,
    B: `<div class="lbl">Carved into the desk</div><div class="grid3"><div class="h"></div><div class="h">A</div><div class="h">B</div><div class="h">C</div>
        <div class="h">1</div><div>K</div><div>O</div><div>T</div><div class="h">2</div><div>R</div><div>L</div><div>M</div><div class="h">3</div><div>E</div><div>S</div><div>V</div></div>`,
    hint: 'Letter = column, number = row. B2 is column B, row 2.' },
  { name: 'The Torn Calendar', answer: 'MARCH', input: 'a month',
    A: `<div class="lbl">A torn calendar page</div>"The month you need has exactly five letters."`,
    B: `<div class="lbl">Scratched into the doorframe</div>"It begins with the 13th letter of the alphabet."`,
    hint: 'The 13th letter is M. Which month starting with M has 5 letters?' },
  { name: 'The Final Door', answer: '31', input: 'a number',
    A: `<div class="lbl">Left half of the door panel</div>"Take the legs of a spider, times three…"`,
    B: `<div class="lbl">Right half of the door panel</div>"…then add the days of one week."`,
    hint: 'A spider has 8 legs.' },
];
GAMES.escape = {
  init: () => ({ stage: 0, hints: {} }),
  create(el) {
    const t0 = performance.now(); let doneAt = null;
    const iv = setInterval(() => { const t = $('#timer', el); if (t && !doneAt) t.textContent = fmt((performance.now() - t0) / 1000); }, 500);
    el.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; const g = S.state.g;
      if (a === 'try') {
        const v = $('#code', el).value.trim().toUpperCase().replace(/\s+/g, '');
        if (v === LOCKS[g.stage].answer) { gpatch({ stage: g.stage + 1 }); toast('🔓 Unlocked!'); }
        else { const p = $('.panel', el); p.classList.remove('shake'); void p.offsetWidth; p.classList.add('shake'); toast('Wrong — talk it through!'); }
      }
      if (a === 'hint') gpatch({ hints: { [g.stage]: true } });
    };
    el.onkeydown = (e) => { if (e.key === 'Enter' && e.target.id === 'code') $('[data-a="try"]', el)?.click(); };
    return {
      update(g) {
        const role = ids()[0] === S.me ? 'A' : 'B';
        const locks = `<div class="locks">${LOCKS.map((_, i) => (i < g.stage ? '🔓' : '🔒')).join('')}</div>`;
        if (g.stage >= LOCKS.length) {
          doneAt ||= performance.now();
          el.innerHTML = `<div class="panel"><div class="big-emoji">🚪✨</div><h2>You escaped together!</h2>${locks}<p class="muted">Your time: <b>${fmt((doneAt - t0) / 1000)}</b></p>${endButtons()}</div>`;
          return;
        }
        const L = LOCKS[g.stage];
        keepInputs(el, () => {
          el.innerHTML = `<div class="panel"><div class="kicker">Lock ${g.stage + 1} of ${LOCKS.length} · You are Agent ${role}</div>
            <h2>${L.name}</h2>${locks}<div class="timer" id="timer">0:00</div>
            <p class="muted">Your partner sees different clues than you. Describe what you see to each other — use the chat or talk on the phone.</p>
            <div class="clue">${L[role]}</div>
            <div class="row"><input class="text" id="code" placeholder="Enter ${L.input}" autocomplete="off"><button class="btn primary" data-a="try">Try it</button></div>
            ${g.hints?.[g.stage] ? `<p><b>Hint:</b> ${L.hint}</p>` : `<div class="row"><button class="btn small ghost" data-a="hint">Need a hint?</button></div>`}</div>`;
        });
      },
      destroy() { clearInterval(iv); },
    };
  },
};

/* Would You Rather */
const WYR_CATS = { fun: 'Fun', romantic: 'Romantic', deep: 'Deep', spicy: 'Spicy 🌶️' };
GAMES.wyr = {
  init: () => {
    const order = {}, idx = {};
    for (const c of Object.keys(WYR_CATS)) { order[c] = shuffle(range(CONTENT.wyr[c].length)); idx[c] = 0; }
    return { cat: 'fun', order, idx, ans: {}, custom: null, asked: 0, matches: 0, reveal: false };
  },
  create(el) {
    let scored = null, writing = false;
    const qKey = (g) => (g.custom ? 'c' + g.custom.ts : g.cat + (g.idx[g.cat] || 0));
    el.onclick = (e) => {
      const g = S.state.g; const a = e.target.closest('[data-a]')?.dataset.a;
      const p = e.target.closest('[data-p]'); const cat = e.target.closest('[data-cat]')?.dataset.cat;
      if (p && g.ans?.[S.me] === undefined && !g.reveal) gpatch({ ans: { [S.me]: +p.dataset.p } });
      if (cat) gpatch({ cat, custom: null, ans: null, reveal: false });
      if (a === 'next') gpatch(g.custom ? { custom: null, ans: null, reveal: false } : { idx: { [g.cat]: (g.idx[g.cat] || 0) + 1 }, ans: null, reveal: false });
      if (a === 'write') { writing = !writing; this_update(); }
      if (a === 'ask') {
        const A = $('#customA', el).value.trim(), B = $('#customB', el).value.trim();
        if (!A || !B) return toast('Fill in both options');
        writing = false; $('#customA', el).value = ''; $('#customB', el).value = '';
        gpatch({ custom: { a: A.slice(0, 140), b: B.slice(0, 140), by: S.me, ts: Date.now() }, ans: null, reveal: false });
      }
    };
    el.onkeydown = (e) => { if (e.key === 'Enter' && e.target.id === 'customB') $('[data-a="ask"]', el)?.click(); };
    const this_update = () => api.update(S.state.g);
    const api = {
      update(g) {
        const list = CONTENT.wyr[g.cat], ord = g.order[g.cat];
        const pair = g.custom ? [g.custom.a, g.custom.b] : list[ord[(g.idx[g.cat] || 0) % ord.length]];
        const ans = g.ans || {};
        if (!g.reveal && both(ans) && isHost() && scored !== qKey(g)) {
          scored = qKey(g); const [a, b] = ids();
          gpatch({ reveal: true, asked: g.asked + 1, matches: g.matches + (ans[a] === ans[b] ? 1 : 0) });
        }
        let body;
        if (g.reveal) {
          const [a, b] = ids(), m = ans[a] === ans[b];
          body = `<div class="big-emoji">${m ? '💞' : '😮'}</div><h2>${m ? 'Same pick!' : 'You picked differently!'}</h2>
            <div class="reveal">${ids().map((id) => `<div><div class="who">${esc(pname(id))} would rather</div><b>${esc(pair[ans[id]])}</b></div>`).join('')}</div>
            <p class="muted">${m ? 'Great minds…' : 'Tell each other why in the chat 💬'}</p>
            <div class="row"><button class="btn primary" data-a="next">Next question →</button></div>`;
        } else {
          body = `${g.custom ? `<div class="kicker">✍️ Written by ${esc(pname(g.custom.by))}</div>` : ''}
            <div class="q">Would you rather…</div>
            <div class="opts">${pair.map((o, i) => `<button class="opt wyr ${ans[S.me] === i ? 'sel' : ''}" data-p="${i}">${esc(o)}</button>`).join('')}</div>
            ${ans[S.me] !== undefined ? `<p class="waiting">Locked in. Waiting for ${esc(pname(partner()))}…</p>` : ans[partner()] !== undefined ? `<p class="muted">${esc(pname(partner()))} has picked</p>` : ''}`;
        }
        keepInputs(el, () => {
          el.innerHTML = `<div class="panel">
            <div class="tabs">${Object.entries(WYR_CATS).map(([k, v]) => `<button data-cat="${k}" class="${k === g.cat && !g.custom ? 'on' : ''}">${v}</button>`).join('')}</div>
            <div style="margin-top:18px">${body}</div>
            <div class="scores"><span class="score">You've matched on ${g.matches} of ${g.asked}</span></div>
            <div class="row"><button class="btn small ghost" data-a="write">${writing ? 'Cancel' : '✍️ Write your own question'}</button></div>
            ${writing ? `<div class="custom-q"><input class="text" id="customA" placeholder="Option 1 — e.g. live by the beach" maxlength="140"><span class="muted">or</span><input class="text" id="customB" placeholder="Option 2 — e.g. live in the mountains" maxlength="140"><button class="btn primary" data-a="ask">Ask</button></div>` : ''}
          </div>`;
        });
      },
    };
    return api;
  },
};

// ---------------- home wiring ----------------
$('#home').addEventListener('click', (e) => { const c = e.target.closest('[data-game]'); if (c) createRoom(c.dataset.game); });
$('#openFeatured').onclick = () => createRoom('wyr');
$('#inviteBtn').onclick = () => createRoom(null, true);
$('#joinBtn').onclick = () => joinRoom($('#joinCode').value);
$('#joinCode').onkeydown = (e) => { if (e.key === 'Enter') joinRoom(e.target.value); };
$('#copyInvite').onclick = invite;
$('#leaveBtn').onclick = leaveRoom;
$('#backBtn').onclick = () => selectGame(null);
$('#nameBtn').onclick = () => askName();
$('#brandLink').onclick = (e) => { if (S.code) { e.preventDefault(); if (confirm('Leave this room?')) leaveRoom(); } };

updateNameBtn();
renderHome();
const urlRoom = new URLSearchParams(location.search).get('room');
if (urlRoom) { S.code = urlRoom.toUpperCase(); if (socket.connected) joinRoom(S.code, true); }
