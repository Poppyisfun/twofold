/* Param & Nitya’s LDR Date Room — more games: Guess My Drawing, Two Truths and a Lie, Story Together, Never Have I Ever,
   Hangman, Tic-Tac-Toe, Connect Four, Battleship, Our Bucket List */

const other = (id) => ids().find((i) => i !== id);
function turnBanner(turnId) {
  if (!turnId) return '';
  const mine = turnId === S.me, p = partner();
  return `<div class="turn-banner ${mine ? 'mine' : ''}">${mine ? '👉 Your turn' : `Waiting for ${esc(pname(turnId))}…${p && !online(p) ? " They're away, so they'll see it when they're back." : ''}`}</div>`;
}
function lineWinner(b, w, h, n) {
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const c = b[y * w + x]; if (c === '.') continue;
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      const cells = [y * w + x];
      for (let k = 1; k < n; k++) {
        const nx = x + dx * k, ny = y + dy * k;
        if (nx < 0 || ny < 0 || nx >= w || ny >= h || b[ny * w + nx] !== c) break;
        cells.push(ny * w + nx);
      }
      if (cells.length === n) return { mark: c, cells };
    }
  }
  return null;
}
const winsHTML = (g) => `${scoresHTML(g.wins)}${g.draws ? `<p class="muted" style="margin:6px 0 0">Draws: ${g.draws}</p>` : ''}`;
const boardEnd = (g, label) => `<div class="row"><button class="btn primary" data-a="rematch">${label || 'Rematch'}</button><button class="btn" data-a="home">Pick another game</button></div>`;

/* ---------- Tic-Tac-Toe ---------- */
GAMES.tictactoe = {
  init: () => ({ b: '.........', x: S.me, wins: {}, draws: 0 }),
  turnOf(g, P) { if (!g.b || g.over || !P || P.length < 2) return null; const n = g.b.replace(/\./g, '').length; return n % 2 === 0 ? g.x : P.find((i) => i !== g.x); },
  create(el) {
    el.onclick = (e) => {
      const g = S.state.g, c = e.target.closest('[data-c]');
      if (c && !g.over && GAMES.tictactoe.turnOf(g, ids()) === S.me) {
        const i = +c.dataset.c; if (g.b[i] !== '.') return;
        const b = g.b.slice(0, i) + (S.me === g.x ? 'X' : 'O') + g.b.slice(i + 1);
        const w = lineWinner(b, 3, 3, 3), p = { b };
        if (w) { const wid = w.mark === 'X' ? g.x : other(g.x); p.over = { winner: wid, cells: w.cells }; p.wins = { [wid]: (g.wins?.[wid] || 0) + 1 }; }
        else if (!b.includes('.')) { p.over = { winner: '', cells: [] }; p.draws = (g.draws || 0) + 1; }
        gpatch(p);
      }
      if (e.target.closest('[data-a="rematch"]')) gpatch({ b: '.........', x: other(g.x), over: null });
    };
    return {
      update(g) {
        const cells = g.over?.cells || [];
        const head = g.over ? `<h2>${g.over.winner ? (g.over.winner === S.me ? 'You win! 🎉' : `${esc(pname(g.over.winner))} wins!`) : "It's a draw 🤝"}</h2>` : turnBanner(GAMES.tictactoe.turnOf(g, ids()));
        el.innerHTML = `<div class="panel"><div class="kicker">Tic-Tac-Toe · You're ${S.me === g.x ? '<b style="color:var(--pink)">X</b>' : '<b style="color:var(--blue)">O</b>'}</div>${head}
          <div class="ttt">${[...g.b].map((c, i) => `<button data-c="${i}" class="${c === 'X' ? 'x' : c === 'O' ? 'o' : ''} ${cells.includes(i) ? 'win' : ''}">${c === '.' ? '' : c}</button>`).join('')}</div>
          ${winsHTML(g)}${g.over ? boardEnd(g) : ''}</div>`;
      },
    };
  },
};

/* ---------- Connect Four ---------- */
GAMES.connect4 = {
  init: () => ({ b: '.'.repeat(42), first: S.me, wins: {}, draws: 0 }),
  turnOf(g, P) { if (!g.b || g.over || !P || P.length < 2) return null; const n = g.b.replace(/\./g, '').length; return n % 2 === 0 ? g.first : P.find((i) => i !== g.first); },
  create(el) {
    el.onclick = (e) => {
      const g = S.state.g, c = e.target.closest('[data-col]');
      if (c && !g.over && GAMES.connect4.turnOf(g, ids()) === S.me) {
        const col = +c.dataset.col;
        let row = -1; for (let r = 5; r >= 0; r--) if (g.b[r * 7 + col] === '.') { row = r; break; }
        if (row < 0) return toast('That column is full');
        const i = row * 7 + col, b = g.b.slice(0, i) + (S.me === g.first ? 'R' : 'Y') + g.b.slice(i + 1);
        const w = lineWinner(b, 7, 6, 4), p = { b };
        if (w) { const wid = w.mark === 'R' ? g.first : other(g.first); p.over = { winner: wid, cells: w.cells }; p.wins = { [wid]: (g.wins?.[wid] || 0) + 1 }; }
        else if (!b.includes('.')) { p.over = { winner: '', cells: [] }; p.draws = (g.draws || 0) + 1; }
        gpatch(p);
      }
      if (e.target.closest('[data-a="rematch"]')) gpatch({ b: '.'.repeat(42), first: other(g.first), over: null });
    };
    return {
      update(g) {
        const cells = g.over?.cells || [], myTurn = GAMES.connect4.turnOf(g, ids()) === S.me;
        const head = g.over ? `<h2>${g.over.winner ? (g.over.winner === S.me ? 'Four in a row, you win! 🎉' : `${esc(pname(g.over.winner))} wins!`) : "Board's full, it's a draw"}</h2>` : turnBanner(GAMES.connect4.turnOf(g, ids()));
        el.innerHTML = `<div class="panel"><div class="kicker">Connect Four · You're ${S.me === g.first ? '🔴 red' : '🟡 yellow'}</div>${head}
          <div><div class="c4 ${myTurn ? 'mine' : ''}">${[...g.b].map((c, i) => `<button data-col="${i % 7}" class="${c === 'R' ? 'r' : c === 'Y' ? 'y' : ''} ${cells.includes(i) ? 'win' : ''}" aria-label="column ${i % 7 + 1}"></button>`).join('')}</div></div>
          <p class="muted" style="margin:4px 0 0">Tap a column to drop your piece.</p>${winsHTML(g)}${g.over ? boardEnd(g) : ''}</div>`;
      },
    };
  },
};

/* ---------- Battleship ---------- */
const BS = 8, FLEET = [4, 3, 3, 2, 2];
function randomFleet() {
  const occ = new Set(), fleet = [];
  for (const len of FLEET) {
    for (;;) {
      const hor = Math.random() < 0.5, x = rand(hor ? BS - len + 1 : BS), y = rand(hor ? BS : BS - len + 1);
      const cells = range(len).map((k) => (hor ? y * BS + x + k : (y + k) * BS + x));
      if (cells.every((c) => !occ.has(c))) { cells.forEach((c) => occ.add(c)); fleet.push(cells); break; }
    }
  }
  return fleet;
}
const shotsCount = (s) => (s ? s.replace(/\./g, '').length : 0);
GAMES.battleship = {
  init: () => ({ fleets: {}, shots: {}, first: S.me, wins: {} }),
  turnOf(g, P) {
    if (!P || P.length < 2 || g.over) return null;
    const f = g.fleets || {};
    const missing = P.filter((id) => !f[id]);
    if (missing.length === 1) return missing[0];
    if (missing.length) return null;
    const sec = P.find((i) => i !== g.first);
    return shotsCount(g.shots?.[g.first]) <= shotsCount(g.shots?.[sec]) ? g.first : sec;
  },
  create(el) {
    let draft = null;
    el.onclick = (e) => {
      const g = S.state.g, a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'shuffle') { draft = randomFleet(); api.update(g); }
      if (a === 'ready') gpatch({ fleets: { [S.me]: draft } });
      if (a === 'rematch') { draft = null; gpatch({ fleets: null, shots: null, over: null, first: other(g.first) }); }
      const t = e.target.closest('[data-t]');
      if (t && !g.over && GAMES.battleship.turnOf(g, ids()) === S.me && Object.keys(g.fleets || {}).length === 2) {
        const i = +t.dataset.t, mine = g.shots?.[S.me] || '.'.repeat(64);
        if (mine[i] !== '.') return;
        const enemy = g.fleets[partner()], flat = enemy.flat(), hit = flat.includes(i);
        const s = mine.slice(0, i) + (hit ? 'h' : 'm') + mine.slice(i + 1);
        const p = { shots: { [S.me]: s } };
        if (hit) {
          const ship = enemy.find((sh) => sh.includes(i));
          toast(ship.every((c) => s[c] === 'h') ? `💥 You sunk a ${ship.length}-long ship!` : '🔥 Hit!');
          if (flat.every((c) => s[c] === 'h')) { p.over = { winner: S.me }; p.wins = { [S.me]: (g.wins?.[S.me] || 0) + 1 }; }
        } else toast('🌊 Miss');
        gpatch(p);
      }
    };
    const grid = (cls, cellFn, attr) => `<div class="bs ${cls}">${range(64).map((i) => { const [c, t] = cellFn(i); return `<button ${attr ? `${attr}="${i}"` : ''} class="${c}">${t || ''}</button>`; }).join('')}</div>`;
    const api = {
      update(g) {
        const fleets = g.fleets || {}, mine = fleets[S.me], theirs = fleets[partner()];
        if (!mine) {
          draft ||= randomFleet();
          const set = new Set(draft.flat());
          el.innerHTML = `<div class="panel"><div class="kicker">Battleship · Place your fleet</div><h2>Arrange your ships</h2>
            <p class="muted">5 ships: lengths 4, 3, 3, 2, 2. Shuffle until you like the layout, then lock it in.</p>
            <div class="bs-wrap">${grid('', (i) => [set.has(i) ? 'ship' : ''])}</div>
            <div class="row"><button class="btn" data-a="shuffle">🔀 Shuffle</button><button class="btn primary" data-a="ready">Lock in fleet</button></div></div>`;
          return;
        }
        if (!theirs) {
          el.innerHTML = `<div class="panel"><div class="big-emoji">🚢</div><h2>Fleet locked in</h2><p class="waiting">Waiting for ${esc(pname(partner()))} to place their ships…</p></div>`;
          return;
        }
        const myShots = g.shots?.[S.me] || '.'.repeat(64), theirShots = g.shots?.[partner()] || '.'.repeat(64);
        const mySet = new Set(mine.flat());
        const sunkCells = new Set(theirs.filter((sh) => sh.every((c) => myShots[c] === 'h')).flat());
        const head = g.over ? `<h2>${g.over.winner === S.me ? 'Victory! You sank the whole fleet 🎉' : `${esc(pname(g.over.winner))} sank your fleet!`}</h2>` : turnBanner(GAMES.battleship.turnOf(g, ids()));
        const left = (fl, shots) => fl.filter((sh) => !sh.every((c) => shots[c] === 'h')).length;
        el.innerHTML = `<div class="panel wide"><div class="kicker">Battleship</div>${head}
          <div class="bs-wrap">
            <div><h3>🎯 ${esc(pname(partner()))}'s waters · ${left(theirs, myShots)} ships left</h3>${grid('target', (i) => [sunkCells.has(i) ? 'sunk' : myShots[i] === 'h' ? 'hit' : myShots[i] === 'm' ? 'miss' : '', myShots[i] === 'h' ? '✕' : myShots[i] === 'm' ? '•' : ''], 'data-t')}</div>
            <div><h3>🛡️ Your fleet · ${left(mine, theirShots)} ships left</h3>${grid('', (i) => [theirShots[i] === 'h' ? 'hit' : theirShots[i] === 'm' ? 'miss' : mySet.has(i) ? 'ship' : '', theirShots[i] === 'h' ? '✕' : theirShots[i] === 'm' ? '•' : ''])}</div>
          </div>${scoresHTML(g.wins)}${g.over ? boardEnd(g, 'New battle') : ''}</div>`;
      },
    };
    return api;
  },
};

/* ---------- Hangman ---------- */
const HANG_MAX = 6;
const hangSVG = (n) => `<svg viewBox="0 0 120 130" width="130" height="140" stroke="#1d1f27" stroke-width="4" fill="none" stroke-linecap="round">
  <path d="M10 125h70M30 125V8h50v14" />${n > 0 ? '<circle cx="80" cy="33" r="11"/>' : ''}${n > 1 ? '<path d="M80 44v36"/>' : ''}${n > 2 ? '<path d="M80 54l-16 14"/>' : ''}${n > 3 ? '<path d="M80 54l16 14"/>' : ''}${n > 4 ? '<path d="M80 80l-14 22"/>' : ''}${n > 5 ? '<path d="M80 80l14 22"/>' : ''}</svg>`;
GAMES.hangman = {
  init: () => ({ setter: S.me, word: null, hint: '', guessed: '', score: {} }),
  turnOf(g, P) { if (!P || P.length < 2 || g.result) return null; return !g.word ? g.setter : P.find((i) => i !== g.setter); },
  create(el) {
    el.onclick = (e) => {
      const g = S.state.g, a = e.target.closest('[data-a]')?.dataset.a;
      const setWord = (w, h) => {
        w = String(w).toUpperCase().replace(/[^A-Z ]/g, '').replace(/\s+/g, ' ').trim();
        if (w.replace(/ /g, '').length < 3) return toast('Pick a word with at least 3 letters');
        gpatch({ word: w.slice(0, 24), hint: String(h || '').slice(0, 60), guessed: '', result: null });
      };
      if (a === 'set') setWord($('#hw', el).value, $('#hh', el).value);
      if (a === 'random') { const r = CONTENT.hangman[rand(CONTENT.hangman.length)]; setWord(r.w, r.h); }
      if (a === 'next') gpatch({ setter: other(g.setter), word: null, hint: '', guessed: '', result: null });
      const k = e.target.closest('[data-k]');
      if (k && g.word && !g.result && S.me !== g.setter && !g.guessed.includes(k.dataset.k)) {
        const guessed = g.guessed + k.dataset.k;
        const letters = new Set(g.word.replace(/ /g, ''));
        const wrong = [...guessed].filter((c) => !letters.has(c)).length;
        const solved = [...letters].every((c) => guessed.includes(c));
        const p = { guessed };
        if (solved) { p.result = 'solved'; p.score = { [S.me]: (g.score?.[S.me] || 0) + 1 }; }
        else if (wrong >= HANG_MAX) { p.result = 'lost'; p.score = { [g.setter]: (g.score?.[g.setter] || 0) + 1 }; }
        gpatch(p);
      }
    };
    el.onkeydown = (e) => { if (e.key === 'Enter' && (e.target.id === 'hw' || e.target.id === 'hh')) $('[data-a="set"]', el)?.click(); };
    return {
      update(g) {
        const setter = g.setter, guesser = other(setter), iSet = S.me === setter;
        let body;
        if (!g.word) {
          body = iSet
            ? `<h2>Pick a word for ${esc(pname(guesser))} to guess</h2>
               <div class="row"><input class="text" id="hw" placeholder="Secret word or short phrase" maxlength="24" autocomplete="off"></div>
               <div class="row" style="margin-top:8px"><input class="text" id="hh" placeholder="Hint (optional), e.g. a place we went" maxlength="60" autocomplete="off"></div>
               <div class="row"><button class="btn primary" data-a="set">Set word</button><button class="btn" data-a="random">🎲 Random word</button></div>`
            : `<div class="big-emoji">🤫</div>${turnBanner(setter)}<p class="muted">${esc(pname(setter))} is choosing a secret word for you.</p>`;
        } else {
          const letters = new Set(g.word.replace(/ /g, ''));
          const wrong = [...g.guessed].filter((c) => !letters.has(c)).length;
          const shown = g.word.split('').map((c) => (c === ' ' ? '&nbsp;' : g.guessed.includes(c) || g.result ? c : '_')).join('');
          const res = g.result === 'solved' ? `<h2>${S.me === guesser ? 'You got it! 🎉' : `${esc(pname(guesser))} got it!`}</h2>`
            : g.result === 'lost' ? `<h2>${S.me === guesser ? 'Out of guesses!' : `${esc(pname(guesser))} didn't get it 😈`}</h2>` : '';
          body = `${res || (iSet ? `<p class="muted">Your word: <b>${esc(g.word)}</b>. Watch ${esc(pname(guesser))} guess.</p>` : turnBanner(guesser))}
            ${hangSVG(wrong)}<div class="word">${shown}</div>
            ${g.hint ? `<p><b>Hint:</b> ${esc(g.hint)}</p>` : ''}<p class="muted">${HANG_MAX - wrong} wrong guesses left</p>
            ${!g.result && !iSet ? `<div class="keys">${'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('').map((L) => `<button data-k="${L}" ${g.guessed.includes(L) ? 'disabled' : ''} class="${g.guessed.includes(L) ? (letters.has(L) ? 'hitk' : 'missk') : ''}">${L}</button>`).join('')}</div>` : ''}
            ${g.result ? `<div class="row"><button class="btn primary" data-a="next">Next round: ${S.me === guesser ? 'your turn to pick' : 'your turn to guess'}</button></div>` : ''}`;
        }
        keepInputs(el, () => { el.innerHTML = `<div class="panel"><div class="kicker">Hangman</div>${body}${scoresHTML(g.score)}</div>`; });
      },
    };
  },
};

/* ---------- Story Together ---------- */
GAMES.story = {
  init: () => ({ starter: rand(CONTENT.storyStarters.length), lines: [], first: S.me, done: false }),
  turnOf(g, P) { if (!P || P.length < 2 || g.done) return null; return (g.lines?.length || 0) % 2 === 0 ? g.first : P.find((i) => i !== g.first); },
  create(el) {
    const storyText = (g) => [CONTENT.storyStarters[g.starter], ...g.lines.map((l) => l.t)].join(' ');
    el.onclick = async (e) => {
      const g = S.state.g, a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'add') {
        const t = $('#line', el).value.trim(); if (!t) return toast('Write a sentence first');
        $('#line', el).value = '';
        gpatch({ lines: [...g.lines, { by: S.me, t: t.slice(0, 300) }] });
      }
      if (a === 'end') gpatch({ done: true });
      if (a === 'starter') gpatch({ starter: rand(CONTENT.storyStarters.length) });
      if (a === 'copy') { try { await navigator.clipboard.writeText(storyText(g)); toast('Story copied!'); } catch { toast("Couldn't copy"); } }
      if (a === 'reopen') gpatch({ done: false });
    };
    el.onkeydown = (e) => { if (e.key === 'Enter' && !e.shiftKey && e.target.id === 'line') { e.preventDefault(); $('[data-a="add"]', el)?.click(); } };
    return {
      update(g) {
        const turn = GAMES.story.turnOf(g, ids()), mine = turn === S.me;
        const text = `<span class="muted"><i>${esc(CONTENT.storyStarters[g.starter])}</i></span> ${g.lines.map((l) => `<span class="${l.by === S.me ? 'me' : 'them'}" title="${esc(pname(l.by))}">${esc(l.t)}</span>`).join(' ')}`;
        let ctl;
        if (g.done) ctl = `<h2>The End ✨</h2><p class="muted">${g.lines.length} lines written together.</p>
          <div class="row"><button class="btn primary" data-a="copy">📋 Copy story</button><button class="btn" data-a="reopen">Keep writing</button><button class="btn" data-a="again">New story</button></div>`;
        else if (mine) ctl = `${turnBanner(turn)}<textarea id="line" placeholder="Add the next sentence or two… (Enter to add)" maxlength="300"></textarea>
          <div class="row"><button class="btn primary" data-a="add">Add to story</button>${g.lines.length >= 4 ? '<button class="btn" data-a="end">End the story</button>' : ''}${!g.lines.length ? '<button class="btn small ghost" data-a="starter">🎲 Different opening</button>' : ''}</div>`;
        else ctl = `${turnBanner(turn)}${g.lines.length >= 4 ? '<div class="row"><button class="btn small" data-a="end">End the story</button></div>' : ''}`;
        keepInputs(el, () => {
          el.innerHTML = `<div class="panel"><div class="kicker">Story Together · take turns adding a line</div>
            <div class="story" id="storybox">${text}</div><div style="margin-top:14px">${ctl}</div>
            <p class="muted" style="font-size:.8rem;margin-bottom:0"><span style="color:#b8264f">■</span> your lines · <span style="color:#2d4fbf">■</span> ${esc(pname(partner()))}'s lines</p></div>`;
        });
        const sb = $('#storybox', el); if (sb) sb.scrollTop = 1e9;
      },
    };
  },
};

/* ---------- Two Truths and a Lie ---------- */
GAMES.ttl = {
  init: () => ({ round: 1, sets: {}, guesses: {}, score: {}, revealed: false }),
  create(el) {
    let lie = null, scored = -1;
    el.onclick = (e) => {
      const g = S.state.g, a = e.target.closest('[data-a]')?.dataset.a;
      const l = e.target.closest('[data-lie]'); if (l) { lie = +l.dataset.lie; $$('[data-lie]', el).forEach((x) => x.classList.toggle('primary', x === l)); }
      if (a === 'submit') {
        const s = [0, 1, 2].map((i) => $('#s' + i, el).value.trim());
        if (s.some((x) => !x)) return toast('Write all three statements');
        if (lie === null) return toast('Mark which one is the lie');
        gpatch({ sets: { [S.me]: { s: s.map((x) => x.slice(0, 160)), lie } } });
        lie = null;
      }
      const gu = e.target.closest('[data-g]');
      if (gu && g.guesses?.[S.me] === undefined) gpatch({ guesses: { [S.me]: +gu.dataset.g } });
      if (a === 'next') gpatch({ round: g.round + 1, sets: null, guesses: null, revealed: false });
    };
    return {
      update(g) {
        const sets = g.sets || {}, guesses = g.guesses || {}, p = partner();
        if (both(sets) && both(guesses) && !g.revealed && isHost() && scored !== g.round) {
          scored = g.round; const add = {};
          for (const id of ids()) {
            const o = other(id), right = guesses[id] === sets[o].lie;
            add[id] = (g.score?.[id] || 0) + (right ? 1 : 0) + (guesses[o] !== sets[id].lie ? 1 : 0);
          }
          gpatch({ revealed: true, score: add });
        }
        let body;
        if (!sets[S.me]) {
          body = `<h2>Write two truths and one lie about yourself</h2><p class="muted">Then tap "Lie" next to the fake one. ${esc(pname(p))} has to spot it.</p>
            <div class="stmts">${[0, 1, 2].map((i) => `<div class="stmt-row"><input class="text" id="s${i}" placeholder="Statement ${i + 1}" maxlength="160" autocomplete="off"><button class="btn small ${lie === i ? 'primary' : ''}" data-lie="${i}">Lie</button></div>`).join('')}</div>
            <div class="row"><button class="btn primary" data-a="submit">Lock in</button></div>
            ${sets[p] ? `<p class="muted">${esc(pname(p))} has written theirs.</p>` : ''}`;
        } else if (!sets[p]) {
          body = `<div class="big-emoji">✍️</div><h2>Yours is locked in</h2>${turnBanner(p)}`;
        } else if (!both(guesses) || !g.revealed) {
          body = guesses[S.me] === undefined
            ? `<h2>Which one is ${esc(pname(p))}'s lie?</h2><div class="opts" style="grid-template-columns:1fr">${sets[p].s.map((x, i) => `<button class="opt" data-g="${i}">${esc(x)}</button>`).join('')}</div>`
            : `<div class="big-emoji">🕵️</div><h2>Guess locked in</h2>${guesses[p] === undefined ? turnBanner(p) : '<p class="waiting">Revealing…</p>'}`;
        } else {
          body = `<h2>The truth comes out…</h2><div class="reveal" style="text-align:left">${ids().map((id) => {
            const o = other(id), right = guesses[o] === sets[id].lie;
            return `<div><div class="who">${esc(pname(id))}'s statements · ${esc(pname(o))} ${right ? 'caught the lie ✅' : 'got fooled 😈'}</div>
              ${sets[id].s.map((x, i) => `<div style="margin:6px 0">${i === sets[id].lie ? '🤥 <b>LIE:</b> ' : '✔️ '}${esc(x)}${guesses[o] === i ? ' <span class="muted">← guess</span>' : ''}</div>`).join('')}</div>`;
          }).join('')}</div><div class="row"><button class="btn primary" data-a="next">Next round</button></div>`;
        }
        keepInputs(el, () => { el.innerHTML = `<div class="panel"><div class="kicker">Two Truths and a Lie · Round ${g.round}</div>${body}${scoresHTML(g.score)}
          <p class="muted" style="font-size:.8rem;margin-bottom:0">+1 for spotting the lie, +1 for fooling your partner</p></div>`; });
      },
    };
  },
};

/* ---------- Never Have I Ever ---------- */
GAMES.nhie = {
  init: () => ({ i: 0, order: shuffle(range(CONTENT.nhie.length)), ans: {}, reveal: false, have: {} }),
  create(el) {
    let scored = -1;
    el.onclick = (e) => {
      const g = S.state.g, b = e.target.closest('[data-p]');
      if (b && g.ans?.[S.me] === undefined && !g.reveal) gpatch({ ans: { [S.me]: +b.dataset.p } });
      if (e.target.closest('[data-a="next"]')) gpatch({ i: g.i + 1, ans: null, reveal: false });
    };
    return {
      update(g) {
        const text = CONTENT.nhie[g.order[g.i % g.order.length]], ans = g.ans || {}, p = partner();
        if (!g.reveal && both(ans) && isHost() && scored !== g.i) {
          scored = g.i; const have = {};
          ids().forEach((id) => (have[id] = (g.have?.[id] || 0) + (ans[id] === 0 ? 1 : 0)));
          gpatch({ reveal: true, have });
        }
        let body;
        if (g.reveal) {
          const [a, b] = ids(), same = ans[a] === ans[b];
          body = `<div class="big-emoji">${ans[a] === 0 && ans[b] === 0 ? '🙌' : same ? '😇' : '👀'}</div>
            <h2>${ans[a] === 0 && ans[b] === 0 ? 'You both have!' : same ? 'Neither of you has!' : 'Only one of you has…'}</h2>
            <div class="reveal">${ids().map((id) => `<div><div class="who">${esc(pname(id))}</div><b>${ans[id] === 0 ? '🙋 I have' : '🙅 Never'}</b></div>`).join('')}</div>
            ${!same ? '<p class="muted">Story time: spill the details in the chat 💬</p>' : ''}
            <div class="row"><button class="btn primary" data-a="next">Next →</button></div>`;
        } else {
          body = `<div class="opts"><button class="opt wyr ${ans[S.me] === 0 ? 'sel' : ''}" data-p="0">🙋 I have</button><button class="opt wyr ${ans[S.me] === 1 ? 'sel' : ''}" data-p="1">🙅 Never</button></div>
            ${ans[S.me] !== undefined ? (ans[p] === undefined ? turnBanner(p) : '') : ans[p] !== undefined ? `<p class="muted">${esc(pname(p))} has answered</p>` : ''}`;
        }
        el.innerHTML = `<div class="panel"><div class="kicker">Never have I ever…</div><div class="q">${esc(text)}</div>${body}
          <div class="scores">${ids().map((id) => `<span class="score ${id === S.me ? 'me' : 'them'}">${esc(pname(id))} has done ${g.have?.[id] || 0}</span>`).join('')}</div></div>`;
      },
    };
  },
};

/* ---------- Guess My Drawing (live) ---------- */
GAMES.pictionary = {
  init: () => ({ round: 1, drawer: S.me, order: shuffle(range(CONTENT.pictionary.length)), score: {}, guessed: false, timeUp: false, log: [] }),
  create(el) {
    const SECS = 80, COLORS = ['#1d1f27', '#ff5c8a', '#4d7cff', '#19b37a', '#f59e0b', '#8b5cf6', '#8b5a2b'];
    el.innerHTML = `<div class="panel wide"><div id="ph"></div>
      <div class="toolbar" id="ptools">${COLORS.map((c, i) => `<span class="swatch ${i ? '' : 'on'}" data-c="${c}" style="background:${c}"></span>`).join('')}
        <input type="range" id="psize" min="2" max="30" value="6"><button class="btn small" data-a="eraser" id="peraser">Eraser</button><button class="btn small" data-a="pclear">Clear</button></div>
      <canvas class="board" width="1100" height="620"></canvas><div id="pbelow"></div></div>`;
    const cv = $('canvas', el), ctx = cv.getContext('2d');
    let color = COLORS[0], erasing = false, last = null, round = null, t0 = 0, hist = [];
    const wipe = () => { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, cv.width, cv.height); };
    const seg = ([x0, y0, x1, y1, c, w]) => { ctx.strokeStyle = c; ctx.lineWidth = w; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(x0 * cv.width, y0 * cv.height); ctx.lineTo(x1 * cv.width, y1 * cv.height); ctx.stroke(); };
    const pos = (e) => { const r = cv.getBoundingClientRect(); return [(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]; };
    const canDraw = () => { const g = S.state.g; return g.drawer === S.me && !g.guessed && !g.timeUp; };
    const word = (g) => CONTENT.pictionary[g.order[(g.round - 1) % g.order.length]];
    const add = (a, b) => { const sz = +$('#psize', el).value; const s = [a[0], a[1], b[0], b[1], erasing ? '#ffffff' : color, erasing ? sz * 3 : sz]; hist.push(s); seg(s); socket.emit('msg', { t: 'pseg', r: round, s }); };
    wipe();
    cv.onpointerdown = (e) => { if (!canDraw()) return; cv.setPointerCapture(e.pointerId); last = pos(e); add(last, last); };
    cv.onpointermove = (e) => { if (!last) return; const p = pos(e); add(last, p); last = p; };
    cv.onpointerup = cv.onpointercancel = () => { last = null; };
    const iv = setInterval(() => {
      const g = S.state.g; if (!g || g.guessed || g.timeUp) return;
      const left = Math.max(0, SECS - (performance.now() - t0) / 1000);
      const t = $('#ptimer', el); if (t) t.textContent = fmt(left);
      const h = $('#phint', el); if (h && g.drawer !== S.me) h.textContent = hint(g, left);
      if (left <= 0 && isHost()) gpatch({ timeUp: true });
    }, 250);
    const hint = (g, left) => { const w = word(g); return w.split('').map((c, i) => (c === ' ' ? '  ' : i === 0 && left < SECS / 2 ? c.toUpperCase() : '_')).join(' '); };
    const norm = (s) => s.toLowerCase().replace(/[^a-z]/g, '');
    el.onclick = (e) => {
      const g = S.state.g;
      const sw = e.target.closest('[data-c]');
      if (sw) { color = sw.dataset.c; erasing = false; $$('.swatch', el).forEach((s) => s.classList.toggle('on', s === sw)); $('#peraser', el).classList.remove('primary'); }
      const a = e.target.closest('[data-a]')?.dataset.a;
      if (a === 'eraser') { erasing = !erasing; $('#peraser', el).classList.toggle('primary', erasing); }
      if (a === 'pclear' && canDraw()) { hist = []; wipe(); socket.emit('msg', { t: 'pclear', r: round }); }
      if (a === 'guess') {
        const inp = $('#pguess', el), v = inp.value.trim(); if (!v) return; inp.value = ''; inp.focus();
        const ok = norm(v) === norm(word(g));
        const log = [...(g.log || []).slice(-7), { t: ok ? '✅ (correct!)' : v.slice(0, 40) }];
        if (ok) gpatch({ guessed: true, log, score: { [S.me]: (g.score?.[S.me] || 0) + 1, [g.drawer]: (g.score?.[g.drawer] || 0) + 1 } });
        else gpatch({ log });
      }
      if (a === 'pnext') gpatch({ round: g.round + 1, drawer: other(g.drawer), guessed: false, timeUp: false, log: [] });
    };
    el.onkeydown = (e) => { if (e.key === 'Enter' && e.target.id === 'pguess') $('[data-a="guess"]', el)?.click(); };
    socket.emit('msg', { t: 'psync-req' });
    return {
      update(g) {
        if (g.round !== round) { round = g.round; t0 = performance.now(); hist = []; wipe(); }
        const drawing = g.drawer === S.me, w = word(g), over = g.guessed || g.timeUp;
        $('#ptools', el).style.visibility = drawing && !over ? 'visible' : 'hidden';
        cv.style.cursor = drawing && !over ? 'crosshair' : 'default';
        $('#ph', el).innerHTML = `<div class="kicker">Guess My Drawing · Round ${g.round}</div>
          ${over ? `<h2>${g.guessed ? `${drawing ? `${esc(pname(partner()))} guessed it` : 'You got it'}! 🎉` : "⏰ Time's up!"} The word was <u>${esc(w)}</u></h2>`
          : drawing ? `<h2>Draw: <span style="color:var(--pink)">${esc(w)}</span></h2><p class="muted" style="margin:0 0 8px">No letters or numbers! <span class="timer" id="ptimer" style="font-size:1.2rem">${fmt(SECS)}</span></p>`
          : `<h2>What is ${esc(pname(g.drawer))} drawing?</h2><div class="word" id="phint" style="font-size:1.4rem">${hint(g, SECS)}</div><span class="timer" id="ptimer" style="font-size:1.2rem">${fmt(SECS)}</span>`}`;
        keepInputs(el, () => {
          $('#pbelow', el).innerHTML = `${!drawing && !over ? `<div class="row"><input class="text" id="pguess" placeholder="Type your guess and press Enter" autocomplete="off" maxlength="40"><button class="btn primary" data-a="guess">Guess</button></div>` : ''}
            ${(g.log || []).length ? `<div class="guess-log">Guesses: ${g.log.map((l) => esc(l.t)).join(' · ')}</div>` : ''}
            ${over ? `<div class="row"><button class="btn primary" data-a="pnext">Next round: ${g.drawer === S.me ? 'you guess' : 'you draw'}</button></div>` : ''}${scoresHTML(g.score)}`;
        });
      },
      onMsg(d) {
        if (d.t === 'pseg' && d.r === round) { hist.push(d.s); seg(d.s); }
        if (d.t === 'pclear' && d.r === round) { hist = []; wipe(); }
        if (d.t === 'psync-req' && hist.length) socket.emit('msg', { t: 'psync', r: round, hist });
        if (d.t === 'psync' && d.r === round && Array.isArray(d.hist) && d.hist.length > hist.length) { hist = d.hist; wipe(); hist.forEach(seg); }
      },
      destroy() { clearInterval(iv); },
    };
  },
};

/* ---------- Our Bucket List (kept even if you leave and come back) ---------- */
GAMES.bucket = {
  init: () => ({}),
  create(el) {
    const IDEAS = ['Watch the sunrise together', 'Take a trip to Japan', 'Cook a fancy dinner from scratch', 'Go to a concert', 'Road trip with no plan', 'Learn to dance together', 'See the northern lights', 'Have a picnic in the park', 'Go stargazing somewhere dark', 'Visit each other\'s hometowns'];
    const list = () => S.state.keep?.bucket || {};
    const addItem = (t) => {
      t = String(t).trim().slice(0, 140); if (!t) return;
      if (Object.values(list()).some((x) => x.t.toLowerCase() === t.toLowerCase())) return toast('Already on the list!');
      const id = Date.now().toString(36) + rand(1e6).toString(36);
      patch({ keep: { bucket: { [id]: { t, by: S.me, ts: Date.now(), votes: { [S.me]: true }, done: false } } } });
    };
    el.onclick = (e) => {
      const a = e.target.closest('[data-a]')?.dataset.a, id = e.target.closest('[data-id]')?.dataset.id;
      if (a === 'add') { addItem($('#bAdd', el).value); $('#bAdd', el).value = ''; }
      if (a === 'idea') addItem(e.target.closest('[data-idea]').dataset.idea);
      if (!id) return;
      const it = list()[id];
      if (a === 'vote') patch({ keep: { bucket: { [id]: { votes: { [S.me]: it.votes?.[S.me] ? null : true } } } } });
      if (a === 'done') patch({ keep: { bucket: { [id]: { done: !it.done, doneAt: it.done ? null : Date.now() } } } });
      if (a === 'del' && confirm(`Remove "${it.t}"?`)) patch({ keep: { bucket: { [id]: null } } });
    };
    el.onkeydown = (e) => { if (e.key === 'Enter' && e.target.id === 'bAdd') $('[data-a="add"]', el).click(); };
    return {
      update() {
        const items = Object.entries(list()).map(([id, x]) => ({ id, ...x, n: Object.keys(x.votes || {}).length }));
        items.sort((a, b) => a.done - b.done || b.n - a.n || a.ts - b.ts);
        const todo = items.filter((x) => !x.done), done = items.filter((x) => x.done);
        const row = (x) => `<div class="b-item ${x.done ? 'done' : ''}" data-id="${x.id}">
          <div class="txt">${esc(x.t)}<div class="by">added by ${esc(pname(x.by))}${x.n === 2 && !x.done ? ' · 💞 you both want this' : ''}</div></div>
          <button data-a="vote" class="${x.votes?.[S.me] ? 'on' : ''}" title="I want this">${x.votes?.[S.me] ? '💖' : '🤍'} ${x.n}</button>
          <button data-a="done" title="${x.done ? 'Not done yet' : 'We did it!'}">${x.done ? '↩️' : '✅'}</button>
          <button data-a="del" title="Remove">🗑</button></div>`;
        const unused = IDEAS.filter((i) => !items.some((x) => x.t.toLowerCase() === i.toLowerCase())).slice(0, 4);
        keepInputs(el, () => {
          el.innerHTML = `<div class="panel"><div class="kicker">Our Bucket List · saved in this room</div><h2>Things we want to do together</h2>
            <div class="bucket-add"><input class="text" id="bAdd" placeholder="Add something… e.g. Go skydiving" maxlength="140" autocomplete="off"><button class="btn primary" data-a="add">Add</button></div>
            ${unused.length ? `<div class="row" style="margin:-6px 0 16px">${unused.map((i) => `<button class="btn small ghost" data-a="idea" data-idea="${esc(i)}">+ ${esc(i)}</button>`).join('')}</div>` : ''}
            ${todo.length ? todo.map(row).join('') : '<p class="muted">Nothing here yet: add the first dream!</p>'}
            ${done.length ? `<h3 style="text-align:left;margin:18px 0 8px">🎉 Done together (${done.length})</h3>${done.map(row).join('')}` : ''}
            <p class="muted" style="font-size:.85rem">Tap 🤍 on the things you want too. Items you both want float to the top.</p></div>`;
        });
      },
    };
  },
};

// re-render home now that every game (and its "your turn" logic) is loaded
if (!S.code) renderHome();
