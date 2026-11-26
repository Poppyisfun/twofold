/* Twofold client — hub, rooms, video calls and all 12 games */
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
const S = { me: null, code: null, players: {}, state: {} };
const ids = () => Object.entries(S.players).sort((a, b) => a[1].joined - b[1].joined).map((e) => e[0]);
const partner = () => ids().find((id) => id !== S.me);
const isHost = () => ids()[0] === S.me;
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
const META = [
  { id: 'photobooth', t: 'Online Photobooth', m: 5, req: 'cam', e: '📸', c: '#ffd0dd' },
  { id: 'quiz', t: 'How Well Do You Know Me', m: 10, req: 'none', e: '💭', c: '#e5dbff' },
  { id: 'draw', t: 'Draw Together', m: 10, req: 'none', e: '🎨', c: '#ffe8c2' },
  { id: 'arcade', t: 'Arcade', m: 5, req: 'cam', e: '🕹️', c: '#c9f5e2' },
  { id: 'tod', t: 'Truth or Dare', m: 15, req: 'none', e: '🔥', c: '#ffd6c9' },
  { id: 'honest', t: 'Honest Cards', m: 20, req: 'none', e: '🃏', c: '#d6e4ff' },
  { id: 'lovematch', t: 'Love Match', m: 10, req: 'none', e: '💘', c: '#ffd0e8' },
  { id: 'color', t: 'Color Match', m: 5, req: 'none', e: '🌈', c: '#fff3b8' },
  { id: 'iq', t: 'IQ Duel', m: 10, req: 'none', e: '🧠', c: '#d9f0ff' },
  { id: 'escape', t: 'Escape Room', m: 20, req: 'none', e: '🗝️', c: '#e6e1d6' },
  { id: 'debate', t: 'Couples Debate', m: 15, req: 'video', e: '🎤', c: '#e0f7d4' },
  { id: 'court', t: 'Couples Court', m: 15, req: 'video', e: '⚖️', c: '#ece0ff' },
];
const metaOf = (id) => META.find((m) => m.id === id);
const REQ = { cam: '📷 Camera on', none: 'No camera', video: '🎥 Video call' };
const tried = () => { try { return JSON.parse(localStorage.tried || '[]'); } catch { return []; } };
const markTried = (id) => { const t = new Set(tried()); t.add(id); localStorage.tried = JSON.stringify([...t]); };

let STATS = {};
function cardsHTML(withBadges) {
  const ranks = Object.entries(STATS).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
  const tr = tried();
  return META.map((m) => {
    const r = ranks.indexOf(m.id);
    return `<button class="card" data-game="${m.id}">
      ${withBadges && r >= 0 && STATS[m.id] > 0 ? `<span class="badge">#${r + 1} most played</span>` : ''}
      ${tr.includes(m.id) ? '<span class="tried-dot">✓ tried</span>' : ''}
      <div class="coin" style="background:${m.c}">${m.e}</div>
      <div><h3>${m.t}</h3><div class="meta">${m.m} min · ${REQ[m.req]}</div></div></button>`;
  }).join('');
}
function renderHome() {
  $('#thumbs').innerHTML = META.map((m) => `<button class="thumb" data-game="${m.id}"><div class="coin" style="background:${m.c}">${m.e}</div><span>${m.t}</span></button>`).join('');
  $('#cards').innerHTML = cardsHTML(true);
  $('#tried').textContent = `${tried().filter((t) => metaOf(t)).length} of ${META.length} tried`;
}
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
  socket.emit('create', name, (res) => {
    enterRoom(res.code);
    if (game) selectGame(game);
    if (thenInvite) invite();
  });
}
async function joinRoom(code, silent) {
  code = String(code || '').trim().toUpperCase();
  if (!code) return toast('Enter a room code');
  const name = await ensureName();
  socket.emit('join', { code, name }, (res) => {
    if (res.error) { toast(res.error); if (silent) leaveRoom(); return; }
    enterRoom(res.code);
  });
}
function enterRoom(code) {
  S.code = code;
  history.replaceState(null, '', `/?room=${code}`);
  $('#home').hidden = true; $('#room').hidden = false; $('#chat').hidden = false;
  $('#roomCode').textContent = code;
}
function leaveRoom() {
  socket.emit('leave');
  unmount(); S.code = null; S.players = {}; S.state = {};
  history.replaceState(null, '', '/');
  $('#home').hidden = false; $('#room').hidden = true; $('#chat').hidden = true;
  $('#chatLog').innerHTML = '';
  renderHome();
}
const inviteLink = () => `${location.origin}/?room=${S.code}`;
async function invite() {
  const url = inviteLink();
  if (navigator.share && /Mobi|Android|iPhone/i.test(navigator.userAgent)) {
    try { await navigator.share({ title: 'Play with me on Twofold', text: `Join my room: ${S.code}`, url }); return; } catch {}
  }
  try { await navigator.clipboard.writeText(url); toast('Invite link copied!'); }
  catch { prompt('Send this link to your partner:', url); }
}

socket.on('connect', () => {
  S.me = socket.id;
  if (S.code) joinRoom(S.code, true); // reconnect after a drop
});
socket.on('room', (d) => { S.players = d.players; S.state = d.state; renderRoom(); });
socket.on('state', (st) => { S.state = st; renderRoom(); });
socket.on('signal', (d) => RTC.onSignal(d));
socket.on('msg', (d) => {
  if (d.t === 'chat') return addChat(d.text, false);
  current?.onMsg?.(d);
});

// ---------------- room rendering & game lifecycle ----------------
let current = null, stageKey = null;
const stage = $('#stage');

function renderRoom() {
  if (!S.code) return;
  const p = partner();
  const pr = $('#presence');
  pr.className = 'presence' + (p ? ' on' : '');
  pr.innerHTML = `<i></i>${p ? `${esc(S.players[p].name)} is here` : 'Waiting for your partner'}`;
  $('#backBtn').hidden = !S.state.game;

  const g = S.state.game;
  const two = ids().length >= 2;
  const key = !g ? 'picker' : two ? `${g}:${S.state.run}` : `wait:${g}`;
  if (key !== stageKey) {
    unmount();
    stageKey = key;
    stage.innerHTML = '';
    if (!g) mountPicker();
    else if (!two) mountWaiting(g);
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
    <p class="muted">${p ? 'Whatever you pick opens on both screens.' : `Share code <b>${S.code}</b> or the invite link — you can pick a game now and it'll start when they arrive.`}</p>
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

function mountGame(id) {
  const m = metaOf(id);
  const el = document.createElement('div');
  stage.appendChild(el);
  markTried(id);
  if (m.req !== 'none') RTC.start();
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
function addChat(text, mine) {
  const d = document.createElement('div');
  d.className = 'msg' + (mine ? ' mine' : '');
  d.textContent = text;
  $('#chatLog').appendChild(d);
  $('#chatLog').scrollTop = 1e9;
  if (!mine && $('#chatPanel').hidden) $('#chatBadge').hidden = false;
}
$('#chatToggle').onclick = () => { const p = $('#chatPanel'); p.hidden = !p.hidden; $('#chatBadge').hidden = true; if (!p.hidden) $('#chatInput').focus(); };
$('#chatForm').onsubmit = (e) => {
  e.preventDefault();
  const v = $('#chatInput').value.trim(); if (!v) return;
  socket.emit('msg', { t: 'chat', text: v }); addChat(v, true); $('#chatInput').value = '';
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
function stepClock(stepsFor) {
  let step = null, t0 = 0, fired = null;
  const iv = setInterval(() => {
    const g = S.state.g || {}; const steps = stepsFor(g); const st = steps[step];
    if (step == null || !st) return;
    const left = Math.max(0, st.sec - (performance.now() - t0) / 1000);
    const t = document.getElementById('timer'); if (t) t.textContent = fmt(left);
    const bar = document.getElementById('tbar'); if (bar) bar.style.width = `${(left / st.sec) * 100}%`;
    if (left <= 0 && isHost() && fired !== step) { fired = step; gpatch({ step: step + 1 }); }
  }, 200);
  return { sync(g) { if (g.step !== step) { step = g.step; t0 = performance.now(); } }, stop() { clearInterval(iv); } };
}

// ---------------- GAMES ----------------
const GAMES = {};

/* 1. Online Photobooth */
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
      x.fillText(new Date().toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' }) + ' · Twofold', c.width / 2, c.height - 16);
      const url = c.toDataURL('image/jpeg', 0.92);
      $('#hint', el).textContent = 'Here you go! Want another?';
      $('#strip', el).innerHTML = `<img src="${url}" alt="Photo strip"><div class="row"><a class="btn primary" download="twofold-photostrip.jpg" href="${url}">Download strip</a></div>`;
    }
    return {
      update(g) { if ((g.run || 0) > lastRun) { lastRun = g.run; sequence(g.run); } },
      onMsg(d) { if (d.t === 'shot') { (((shots[d.run] ||= {})[d.from] ||= []))[d.i] = d.img; compose(d.run); } },
    };
  },
};

/* 2. How Well Do You Know Me */
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
      if (a === 'save') { const l = document.createElement('a'); l.download = 'twofold-drawing.png'; l.href = cv.toDataURL('image/png'); l.click(); }
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

/* 4. Arcade — Reaction Duel on camera */
GAMES.arcade = {
  init: () => ({ round: 0, phase: 'idle', taps: {}, wins: {}, last: null }),
  create(el) {
    const WIN = 3;
    el.innerHTML = `<div class="panel wide">${videoHTML()}<div class="pad idle" id="pad"></div><div id="info"></div></div>`;
    updateVideos();
    let lastRound = -1, judged = -1, local = 'idle', goAt = null, timer = null, myTime = null;
    const pad = $('#pad', el);
    function draw() {
      const g = S.state.g || {};
      const over = ids().some((id) => (g.wins?.[id] || 0) >= WIN);
      if (local === 'wait') { pad.className = 'pad wait'; pad.textContent = myTime === -1 ? '😬 False start!' : 'Wait for green…'; }
      else if (local === 'go') { pad.className = 'pad go'; pad.textContent = 'TAP!'; }
      else if (local === 'tapped') { pad.className = 'pad idle'; pad.textContent = myTime === -1 ? '😬 False start!' : `${myTime} ms`; }
      else { pad.className = 'pad idle'; pad.textContent = g.phase === 'result' ? (g.last?.winner ? (g.last.winner === S.me ? '🏆 You win the round!' : `${pname(g.last.winner)} wins the round`) : 'No winner this round') : 'Reaction Duel'; }
      let info = '';
      if (g.phase === 'result' && g.last) info += `<div class="reveal">${ids().map((id) => `<div><div class="who">${esc(pname(id))}</div><b>${g.last.t[id] === -1 ? 'False start' : g.last.t[id] >= 3000 ? 'Too slow' : g.last.t[id] + ' ms'}</b></div>`).join('')}</div>`;
      if (local === 'idle') info += over
        ? `<h2 style="margin-top:16px">${esc(pname(ids().find((id) => (g.wins[id] || 0) >= WIN)))} ${ids().find((id) => (g.wins[id] || 0) >= WIN) === S.me ? 'win' : 'wins'} the match! 🏆</h2>${endButtons()}`
        : `<p class="muted">When the pad turns green, tap it (or press Space) faster than your partner. Tap early and you lose the round. First to ${WIN} wins.</p><div class="row"><button class="btn primary big" data-a="go">${g.round ? 'Next round' : 'Start'}</button></div>`;
      if (local === 'tapped') info += `<p class="waiting">Waiting for ${esc(pname(partner()))}…</p>`;
      $('#info', el).innerHTML = info + scoresHTML(g.wins);
    }
    function startRound(g) {
      clearTimeout(timer); goAt = null; myTime = null; local = 'wait'; draw();
      timer = setTimeout(() => { goAt = performance.now(); local = 'go'; draw(); timer = setTimeout(() => tap(true), 3000); }, g.delay);
    }
    function tap(timeout) {
      if (local !== 'wait' && local !== 'go') return;
      clearTimeout(timer);
      myTime = goAt ? (timeout ? 3000 : Math.round(performance.now() - goAt)) : -1;
      local = 'tapped'; draw();
      gpatch({ taps: { [S.me]: myTime } });
    }
    pad.onpointerdown = () => tap();
    const key = (e) => { if (e.code === 'Space' && e.target.tagName !== 'INPUT') { e.preventDefault(); tap(); } };
    window.addEventListener('keydown', key);
    el.onclick = (e) => { if (e.target.closest('[data-a="go"]')) { const g = S.state.g; gpatch({ phase: 'wait', round: g.round + 1, delay: 1500 + rand(3500), taps: null }); } };
    return {
      update(g) {
        if (g.phase === 'wait' && g.round !== lastRound) { lastRound = g.round; startRound(g); }
        if (g.phase === 'wait' && both(g.taps) && isHost() && judged !== g.round) {
          judged = g.round;
          const [a, b] = ids(), ta = g.taps[a], tb = g.taps[b];
          const ok = (t) => t >= 0 && t < 3000;
          let w = null;
          if (ok(ta) && ok(tb)) w = ta < tb ? a : tb < ta ? b : null;
          else if (ok(ta) || (ta >= 0 && tb === -1)) w = a;
          else if (ok(tb) || (tb >= 0 && ta === -1)) w = b;
          gpatch({ phase: 'result', last: { winner: w, t: g.taps }, wins: w ? { [w]: (g.wins?.[w] || 0) + 1 } : {} });
        }
        if (g.phase !== 'wait') { local = 'idle'; clearTimeout(timer); }
        draw();
      },
      destroy() { clearTimeout(timer); window.removeEventListener('keydown', key); },
    };
  },
};

/* 5. Truth or Dare */
GAMES.tod = {
  init: () => ({ turn: 0, card: null, done: {}, chicken: {} }),
  create(el) {
    el.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; const g = S.state.g;
      const cur = ids()[g.turn % 2];
      if (a === 'truth' || a === 'dare' || a === 'random') {
        const type = a === 'random' ? (Math.random() < 0.5 ? 'truth' : 'dare') : a;
        const list = type === 'truth' ? CONTENT.truths : CONTENT.dares;
        gpatch({ card: { type, i: rand(list.length) } });
      }
      if (a === 'done') gpatch({ turn: g.turn + 1, card: null, done: { [cur]: (g.done?.[cur] || 0) + 1 } });
      if (a === 'skip') gpatch({ turn: g.turn + 1, card: null, chicken: { [cur]: (g.chicken?.[cur] || 0) + 1 } });
    };
    return {
      update(g) {
        const cur = ids()[g.turn % 2], mine = cur === S.me;
        let body;
        if (!g.card) {
          body = mine
            ? `<div class="kicker">Your turn</div><h2>Truth or dare?</h2><div class="row"><button class="btn blue big" data-a="truth">Truth</button><button class="btn pink big" data-a="dare">Dare</button><button class="btn big" data-a="random">🎲 Surprise me</button></div>`
            : `<div class="big-emoji">🤔</div><h2>${esc(pname(cur))} is choosing…</h2><p class="waiting">Truth or dare?</p>`;
        } else {
          const text = (g.card.type === 'truth' ? CONTENT.truths : CONTENT.dares)[g.card.i];
          body = `<div class="kicker">${esc(pname(cur))} ${mine ? 'picked' : 'picked'} ${g.card.type}</div>
            <div class="big-emoji">${g.card.type === 'truth' ? '🗣️' : '🔥'}</div><div class="q">${esc(text)}</div>
            <div class="row"><button class="btn primary" data-a="done">✅ ${mine ? 'I did it' : 'They did it'}</button><button class="btn" data-a="skip">🐔 Chicken out</button></div>`;
        }
        const stats = ids().map((id) => `<span class="score ${id === S.me ? 'me' : 'them'}">${esc(pname(id))}: ${g.done?.[id] || 0} done · ${g.chicken?.[id] || 0} 🐔</span>`).join('');
        el.innerHTML = `<div class="panel"><div class="kicker">Round ${Math.floor(g.turn / 2) + 1}</div>${body}<div class="scores">${stats}</div>
          <div class="row"><button class="btn small ghost" data-a="home">End game</button></div></div>`;
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

/* 8. Color Match */
const hsl = (c) => `hsl(${c[0]} ${c[1]}% ${c[2]}%)`;
function hslToRgb([h, s, l]) {
  s /= 100; l /= 100; const k = (n) => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}
const colorScore = (a, b) => { const x = hslToRgb(a), y = hslToRgb(b); const d = Math.hypot(x[0] - y[0], x[1] - y[1], x[2] - y[2]); return Math.max(0, Math.round(100 - (d / 441.7) * 180)); };
GAMES.color = {
  init: () => ({ r: 0, targets: range(5).map(() => [rand(360), 45 + rand(50), 35 + rand(35)]), ans: {}, score: {}, reveal: false }),
  create(el) {
    const R = 5; let shown = -1, phase = 'memo', val = [180, 60, 50], scored = -1, tm;
    el.oninput = (e) => {
      const i = e.target.dataset.s; if (i === undefined) return;
      val[+i] = +e.target.value; $('#preview', el).style.background = hsl(val);
    };
    el.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; const g = S.state.g;
      if (a === 'submit') gpatch({ ans: { [S.me]: [...val] } });
      if (a === 'next') gpatch({ r: g.r + 1, ans: null, reveal: false });
    };
    function render(g) {
      if (g.r >= R) {
        const [a, b] = ids(); const sa = g.score[a] || 0, sb = g.score[b] || 0;
        el.innerHTML = `<div class="panel"><div class="big-emoji">🌈</div><h2>${sa === sb ? "It's a tie!" : `${esc(pname(sa > sb ? a : b))} ${(sa > sb ? a : b) === S.me ? 'have' : 'has'} the better color memory`}</h2>${scoresHTML(g.score)}${endButtons()}</div>`;
        return;
      }
      const t = g.targets[g.r], ans = g.ans || {};
      let body;
      if (g.reveal) {
        body = `<div class="cmp"><div style="background:${hsl(t)}">Target</div>${ids().map((id) => `<div style="background:${hsl(ans[id])}">${esc(pname(id))}: ${colorScore(t, ans[id])}</div>`).join('')}</div>
          <div class="row"><button class="btn primary" data-a="next">${g.r + 1 < R ? 'Next color →' : 'See results'}</button></div>`;
      } else if (phase === 'memo') {
        body = `<h2>Memorize this color!</h2><div class="swatch-big" style="background:${hsl(t)}"></div><p class="muted">It disappears in 3 seconds…</p>`;
      } else if (ans[S.me]) {
        body = `<div class="swatch-big" style="background:${hsl(ans[S.me])}"></div><p class="waiting">Locked in. Waiting for ${esc(pname(partner()))}…</p>`;
      } else {
        body = `<h2>Recreate it from memory</h2><div class="swatch-big" id="preview" style="background:${hsl(val)}"></div>
          <div class="sliders"><label>Hue</label><input type="range" data-s="0" min="0" max="359" value="${val[0]}">
          <label>Saturation</label><input type="range" data-s="1" min="0" max="100" value="${val[1]}">
          <label>Lightness</label><input type="range" data-s="2" min="0" max="100" value="${val[2]}"></div>
          <div class="row"><button class="btn primary" data-a="submit">Lock in</button></div>`;
      }
      el.innerHTML = `<div class="panel"><div class="kicker">Color ${g.r + 1} of ${R}</div>${body}${scoresHTML(g.score)}</div>`;
    }
    return {
      update(g) {
        if (g.r !== shown && g.r < R) {
          shown = g.r; phase = 'memo'; val = [rand(360), 50, 50]; clearTimeout(tm);
          tm = setTimeout(() => { phase = 'guess'; render(S.state.g); }, 3000);
        }
        if (!g.reveal && both(g.ans) && isHost() && scored !== g.r) {
          scored = g.r; const add = {};
          ids().forEach((id) => (add[id] = (g.score?.[id] || 0) + colorScore(g.targets[g.r], g.ans[id])));
          gpatch({ reveal: true, score: add });
        }
        render(g);
      },
      destroy() { clearTimeout(tm); },
    };
  },
};

/* 9. IQ Duel */
GAMES.iq = {
  init: () => ({ q: 0, order: shuffle(range(CONTENT.iq.length)).slice(0, 8), ans: {}, score: {}, reveal: false }),
  create(el) {
    const LIMIT = 30; let shown = -1, t0 = 0, scored = -1;
    const iv = setInterval(() => {
      const g = S.state.g; if (!g || g.reveal || g.q >= g.order.length || g.ans?.[S.me]) return;
      const left = Math.max(0, LIMIT - (performance.now() - t0) / 1000);
      const b = $('#tbar', el); if (b) b.style.width = `${(left / LIMIT) * 100}%`;
      if (left <= 0) gpatch({ ans: { [S.me]: { c: -1, t: LIMIT * 1000 } } });
    }, 200);
    el.onclick = (e) => {
      const g = S.state.g; const b = e.target.closest('[data-p]');
      if (b && !g.ans?.[S.me]) gpatch({ ans: { [S.me]: { c: +b.dataset.p, t: Math.round(performance.now() - t0) } } });
      if (e.target.closest('[data-a="next"]')) gpatch({ q: g.q + 1, ans: null, reveal: false });
    };
    return {
      update(g) {
        const N = g.order.length;
        if (g.q >= N) {
          const [a, b] = ids(); const sa = g.score[a] || 0, sb = g.score[b] || 0;
          el.innerHTML = `<div class="panel"><div class="big-emoji">🧠</div><h2>${sa === sb ? 'Evenly matched big brains!' : `${esc(pname(sa > sb ? a : b))} ${(sa > sb ? a : b) === S.me ? 'win' : 'wins'} the duel`}</h2><p class="muted">1 point per correct answer, +1 for being fastest.</p>${scoresHTML(g.score)}${endButtons()}</div>`;
          return;
        }
        if (g.q !== shown) { shown = g.q; t0 = performance.now(); }
        const Q = CONTENT.iq[g.order[g.q]], ans = g.ans || {};
        if (!g.reveal && both(ans) && isHost() && scored !== g.q) {
          scored = g.q; const add = {};
          const right = ids().filter((id) => ans[id].c === Q.a);
          const fastest = right.sort((x, y) => ans[x].t - ans[y].t)[0];
          right.forEach((id) => (add[id] = (g.score?.[id] || 0) + 1 + (id === fastest && right.length === 2 ? 1 : 0) + (right.length === 1 ? 1 : 0)));
          gpatch({ reveal: true, score: add });
        }
        const mine = ans[S.me];
        const cls = (i) => g.reveal ? (i === Q.a ? 'right' : ids().some((id) => ans[id].c === i) ? 'wrong' : '') : mine?.c === i ? 'sel' : '';
        el.innerHTML = `<div class="panel"><div class="kicker">Question ${g.q + 1} of ${N}</div>
          ${g.reveal ? '' : `<div class="progress"><i id="tbar" style="width:100%"></i></div>`}
          <div class="q">${esc(Q.q)}</div>
          <div class="opts">${Q.o.map((o, i) => `<button class="opt ${cls(i)}" data-p="${i}">${esc(o)}</button>`).join('')}</div>
          ${g.reveal ? `<div class="reveal">${ids().map((id) => `<div><div class="who">${esc(pname(id))}</div><b>${ans[id].c === Q.a ? '✅' : '❌'} ${ans[id].c === -1 ? 'Out of time' : (ans[id].t / 1000).toFixed(1) + 's'}</b></div>`).join('')}</div>
            <div class="row"><button class="btn primary" data-a="next">Next →</button></div>`
            : mine ? `<p class="waiting">Answer locked. Waiting for ${esc(pname(partner()))}…</p>` : ''}
          ${scoresHTML(g.score)}</div>`;
      },
      destroy() { clearInterval(iv); },
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

/* 11. Couples Debate — video call */
const DEBATE_STEPS = [{ w: 0, l: 'Opening argument', sec: 60 }, { w: 1, l: 'Opening argument', sec: 60 }, { w: 0, l: 'Rebuttal', sec: 30 }, { w: 1, l: 'Rebuttal', sec: 30 }];
GAMES.debate = {
  init: () => { const P = shuffle(Object.keys(S.players)); return { topic: rand(CONTENT.debates.length), forId: P[0], againstId: P[1], step: -1, votes: {} }; },
  create(el) {
    el.innerHTML = `<div class="panel wide">${videoHTML()}<div id="pnl"></div></div>`;
    updateVideos();
    const clock = stepClock(() => DEBATE_STEPS);
    const pnl = $('#pnl', el);
    el.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; const g = S.state.g;
      if (a === 'begin' || a === 'skip') gpatch({ step: g.step + 1 });
      if (a === 'swap') gpatch({ forId: g.againstId, againstId: g.forId });
      if (a === 'topic') gpatch({ topic: rand(CONTENT.debates.length) });
      const v = e.target.closest('[data-v]')?.dataset.v; if (v) gpatch({ votes: { [S.me]: v } });
    };
    return {
      update(g) {
        if (!S.players[g.forId] || !S.players[g.againstId]) { if (isHost()) { const P = shuffle(ids()); gpatch({ forId: P[0], againstId: P[1] }); } return; }
        clock.sync(g);
        const topic = CONTENT.debates[g.topic], side = (id) => (id === g.forId ? 'FOR' : 'AGAINST');
        const sides = `<div class="reveal"><div><div class="who">FOR</div><b>${esc(pname(g.forId))}</b></div><div><div class="who">AGAINST</div><b>${esc(pname(g.againstId))}</b></div></div>`;
        let body;
        if (g.step < 0) {
          body = `<div class="kicker">Tonight's motion</div><div class="q">"${esc(topic)}"</div>${sides}
            <div class="row"><button class="btn small" data-a="topic">🎲 New topic</button><button class="btn small" data-a="swap">⇄ Swap sides</button></div>
            <div class="row"><button class="btn primary big" data-a="begin">Start debate</button></div>`;
        } else if (g.step < DEBATE_STEPS.length) {
          const st = DEBATE_STEPS[g.step], spk = st.w === 0 ? g.forId : g.againstId;
          body = `<div class="kicker">"${esc(topic)}"</div><h2>${esc(pname(spk))} — ${st.l} (${side(spk)})</h2>
            <div class="timer" id="timer">${fmt(st.sec)}</div><div class="progress"><i id="tbar" style="width:100%"></i></div>
            ${spk === S.me ? `<p>🎤 You have the floor!</p>` : `<p class="muted">No interrupting 🤐</p>`}
            <div class="row"><button class="btn small" data-a="skip">${spk === S.me ? "I'm done" : 'Skip'} →</button></div>`;
        } else {
          const votes = g.votes || {};
          if (both(votes)) {
            const [a, b] = ids(); const agree = votes[a] === votes[b];
            body = `<div class="big-emoji">🏅</div><h2>${agree ? `${esc(pname(votes[a]))} won the debate!` : 'You each think you won. Classic.'}</h2>
              <div class="reveal">${ids().map((id) => `<div><div class="who">${esc(pname(id))} voted for</div><b>${esc(pname(votes[id]))}</b></div>`).join('')}</div>${endButtons()}`;
          } else {
            body = `<h2>Who argued better?</h2><p class="muted">Be honest…</p>
              ${votes[S.me] ? `<p class="waiting">Vote in. Waiting for ${esc(pname(partner()))}…</p>` : `<div class="row">${ids().map((id) => `<button class="btn big ${id === S.me ? 'pink' : 'blue'}" data-v="${id}">${esc(pname(id))}</button>`).join('')}</div>`}`;
          }
        }
        pnl.innerHTML = body;
      },
      destroy() { clock.stop(); },
    };
  },
};

/* 12. Couples Court — video call */
const COURT_STEPS = [{ w: 'p', l: 'Plaintiff opening statement', sec: 60 }, { w: 'd', l: 'Defense', sec: 60 }, { w: 'p', l: 'Plaintiff rebuttal', sec: 30 }, { w: 'd', l: 'Closing statement', sec: 30 }];
GAMES.court = {
  init: () => { const P = Object.keys(S.players); return { plaintiff: P[rand(P.length)], case: '', step: -1, votes: {}, sentence: rand(CONTENT.sentences.length) }; },
  create(el) {
    el.innerHTML = `<div class="panel wide">${videoHTML()}<div id="pnl"></div></div>`;
    updateVideos();
    const clock = stepClock(() => COURT_STEPS);
    const pnl = $('#pnl', el);
    el.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a; const g = S.state.g;
      const sug = e.target.closest('[data-case]'); if (sug) $('#caseIn', el).value = sug.dataset.case;
      if (a === 'file') { const v = $('#caseIn', el).value.trim(); if (!v) return toast('State the charges first!'); gpatch({ case: v.slice(0, 200), step: 0 }); }
      if (a === 'swapc') gpatch({ plaintiff: ids().find((id) => id !== g.plaintiff) });
      if (a === 'skip') gpatch({ step: g.step + 1 });
      const v = e.target.closest('[data-v]')?.dataset.v; if (v) gpatch({ votes: { [S.me]: v } });
    };
    return {
      update(g) {
        if (!S.players[g.plaintiff]) { if (isHost()) gpatch({ plaintiff: ids()[rand(2)] }); return; }
        clock.sync(g);
        const p = g.plaintiff, d = ids().find((id) => id !== p);
        let body;
        if (g.step < 0) {
          body = p === S.me
            ? `<div class="kicker">⚖️ Order in the court</div><h2>You're the plaintiff. What's the charge against ${esc(pname(d))}?</h2>
               <input class="text" id="caseIn" placeholder="e.g. Fell asleep on our call. Again." maxlength="200" style="max-width:520px">
               <div class="row">${shuffle(CONTENT.courtCases).slice(0, 4).map((c) => `<button class="btn small ghost" data-case="${esc(c)}">${esc(c)}</button>`).join('')}</div>
               <div class="row"><button class="btn primary big" data-a="file">File the case</button><button class="btn small" data-a="swapc">Actually, I'm the defendant</button></div>`
            : `<div class="big-emoji">⚖️</div><h2>${esc(pname(p))} is filing charges against you…</h2><p class="waiting">Prepare your defense.</p>
               <div class="row"><button class="btn small" data-a="swapc">No — I'm the one suing!</button></div>`;
          if (p === S.me) keepInputs(pnl, () => (pnl.innerHTML = body)); else pnl.innerHTML = body;
          return;
        }
        const charge = `<div class="kicker">${esc(pname(p))} v. ${esc(pname(d))}</div><div class="q">"${esc(g.case)}"</div>`;
        if (g.step < COURT_STEPS.length) {
          const st = COURT_STEPS[g.step], spk = st.w === 'p' ? p : d;
          body = `${charge}<h2>${esc(pname(spk))}: ${st.l}</h2><div class="timer" id="timer">${fmt(st.sec)}</div><div class="progress"><i id="tbar" style="width:100%"></i></div>
            <div class="row"><button class="btn small" data-a="skip">${spk === S.me ? 'I rest my case' : 'Skip'} →</button></div>`;
        } else {
          const votes = g.votes || {};
          if (both(votes)) {
            const [a, b] = ids(); const gv = [votes[a], votes[b]];
            const out = gv.every((v) => v === 'guilty') ? 'guilty' : gv.every((v) => v === 'innocent') ? 'innocent' : 'hung';
            body = `${charge}<div class="big-emoji">${out === 'guilty' ? '🔨' : out === 'innocent' ? '🕊️' : '🤝'}</div>
              <h2>${out === 'guilty' ? 'GUILTY!' : out === 'innocent' ? 'Case dismissed!' : 'Hung jury!'}</h2>
              <p>${out === 'guilty' ? `<b>Sentence:</b> ${esc(CONTENT.sentences[g.sentence])}` : out === 'innocent' ? `${esc(pname(d))} walks free.` : 'Settle it with rock-paper-scissors on camera — best of three.'}</p>${endButtons()}`;
          } else {
            body = `${charge}<h2>The verdict — be honest!</h2>
              ${votes[S.me] ? `<p class="waiting">Verdict sealed. Waiting for ${esc(pname(partner()))}…</p>` : `<div class="row"><button class="btn big pink" data-v="guilty">Guilty</button><button class="btn big blue" data-v="innocent">Not guilty</button></div>`}`;
          }
        }
        pnl.innerHTML = body;
      },
      destroy() { clock.stop(); },
    };
  },
};

// ---------------- home wiring ----------------
$('#home').addEventListener('click', (e) => { const c = e.target.closest('[data-game]'); if (c) createRoom(c.dataset.game); });
$('#openBooth').onclick = () => createRoom('photobooth');
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
