// The board stage: cells, terrain, pieces, ambient particles and action effects.
// Imperative DOM + canvas for smooth animation; React owns everything around it.
// Cosmetic only: it reads game states and never changes them.
import {
  BOARD_SIZE, HEROES, MAPS, CREEPS, unitAt, blockAt, squareName, samePos, label, heroDef, livingHeroes,
  moveOptions, chebyshev,
} from '../../arena.js';
import { ICON, ART, MAP_ART, tk } from '../data';

export const TERRAIN_SVG = {
  pillar: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="35" rx="13" ry="3.5" fill="rgba(0,0,0,.25)"/><rect x="11" y="7" width="18" height="27" rx="2" fill="#c99a62"/><rect x="11" y="7" width="6" height="27" fill="#e2b980"/><rect x="8" y="4" width="24" height="5" rx="1.5" fill="#b0824e"/><rect x="8" y="31" width="24" height="5" rx="1.5" fill="#b0824e"/><path d="M14 14 V28 M20 14 V28 M26 14 V28" stroke="#a87a45" stroke-width="1.2"/></svg>',
  tree: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="36" rx="12" ry="3" fill="rgba(0,0,0,.25)"/><path d="M19 36 L19 22 L14 16 M20 24 L26 17 M19 28 L13 24" stroke="#3a2210" stroke-width="2.6" fill="none" stroke-linecap="round"/><ellipse cx="20" cy="13" rx="17" ry="6" fill="#3d2a17"/><ellipse cx="11" cy="15" rx="7" ry="4" fill="#4a3320"/><ellipse cx="28" cy="14" rx="8" ry="4.2" fill="#4a3320"/></svg>',
  ruin: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="35" rx="14" ry="3.5" fill="rgba(0,0,0,.3)"/><path d="M7 34 L9 12 L18 9 L19 34 Z" fill="#7d8a76"/><path d="M19 34 L20 15 L31 13 L33 34 Z" fill="#6b7865"/><path d="M9 12 L18 9 L20 15 L31 13" stroke="#55614f" stroke-width="1.5" fill="none"/><path d="M6 30 C10 24 8 18 12 14 M30 34 C28 26 33 22 31 16 M16 34 C18 28 22 30 24 24" stroke="#4fae45" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="12" cy="14" r="2.4" fill="#5fc152"/><circle cx="31" cy="16" r="2.2" fill="#5fc152"/><circle cx="24" cy="24" r="2" fill="#5fc152"/></svg>',
  rock: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="35" rx="15" ry="3.5" fill="rgba(0,0,0,.25)"/><path d="M5 33 L9 17 L18 9 L29 12 L35 24 L33 33 Z" fill="#7b8899"/><path d="M18 9 L22 20 L35 24 M22 20 L14 33 M9 17 L22 20" stroke="#5c6878" stroke-width="1.4" fill="none"/><path d="M9 17 L18 9 L29 12 L23 13 L14 16 Z" fill="#f4f8fb"/></svg>',
  ice: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="35" rx="14" ry="3" fill="rgba(0,40,80,.25)"/><path d="M8 33 L6 18 L14 6 L22 14 L28 5 L35 17 L32 33 Z" fill="rgba(190,232,255,.88)" stroke="#e9f8ff" stroke-width="1.5"/><path d="M14 6 L16 33 M22 14 L22 33 M28 5 L26 33" stroke="rgba(255,255,255,.7)" stroke-width="1.2"/><path d="M8 33 L6 18 L14 6 L12 20 Z" fill="rgba(255,255,255,.55)"/></svg>',
};
export const CREEP_SVG = '<svg viewBox="0 0 24 24"><g fill="currentColor"><circle cx="12" cy="6.5" r="3.4"/><path d="M8.6 11.2 h6.8 l1.6 6.3 h-10 z"/><rect x="5.2" y="18" width="13.6" height="3.4" rx="1.2"/></g></svg>';
export const BEAST_SVG = '<svg viewBox="0 0 24 24"><g fill="currentColor"><ellipse cx="12" cy="15.5" rx="5" ry="4.2"/><circle cx="6.2" cy="10" r="2.1"/><circle cx="9.6" cy="6.6" r="2.1"/><circle cx="14.4" cy="6.6" r="2.1"/><circle cx="17.8" cy="10" r="2.1"/></g></svg>';


/**
 * Mount a board into `host`. `onCell(pos)` fires for clicks on squares.
 * Call `render(game, view)` after every change; `animate(before, after)` for effects.
 */
/**
 * @param {HTMLElement} host
 * @param {{ onCell: (p: any) => void, onPress?: ((p: any) => ({ id: string, fresh: boolean } | null)) | null,
 *   onDrop?: ((id: string, p: any) => boolean) | null, flip?: boolean }} opts
 */
export function createBoard(host, { onCell, onPress = null, onDrop = null, flip = false }) {
  /** Display position of a board square: turned 180° when this player sits on Ember's side. */
  const V = (p) => (flip ? { r: BOARD_SIZE - 1 - p.r, c: BOARD_SIZE - 1 - p.c } : p);
  host.innerHTML = `<div class="arena"><div class="backdrop"></div><div class="board-wrap"><div class="board">
    <canvas class="layer ambient" aria-hidden="true"></canvas><div class="layer terrain"></div><div class="layer pieces"></div><svg class="layer marks" viewBox="0 0 800 800" preserveAspectRatio="none" aria-hidden="true"></svg>
    <canvas class="fx" aria-hidden="true"></canvas></div></div></div>`;
  const q = (s) => host.querySelector(s);
  const boardEl = q('.board'), terrainEl = q('.terrain'), piecesEl = q('.pieces'), backdrop = q('.backdrop'), marksEl = q('.marks');
  const cells = new Array(BOARD_SIZE * BOARD_SIZE);
  // Cells are laid out in display order; `cells` stays indexed by the real square.
  for (let dr = 0; dr < BOARD_SIZE; dr++) {
    for (let dc = 0; dc < BOARD_SIZE; dc++) {
      const { r, c } = V({ r: dr, c: dc });
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cell' + ((r + c) % 2 ? ' dark' : '');
      b.dataset.r = r; b.dataset.c = c;
      if (dc === 0) b.insertAdjacentHTML('beforeend', `<span class="coord rank">${BOARD_SIZE - r}</span>`);
      if (dr === BOARD_SIZE - 1) b.insertAdjacentHTML('beforeend', `<span class="coord file">${'abcdefgh'[c]}</span>`);
      b.addEventListener('click', () => {
        if (swallowClick) { swallowClick = false; return; }
        onCell({ r, c });
      });
      boardEl.insertBefore(b, q('.ambient'));
      cells[r * BOARD_SIZE + c] = b;
    }
  }
  const cellAt = (p) => cells[p.r * BOARD_SIZE + p.c];
  const pieceEls = new Map();

  // ---------- hold and drag, like lifting a chess piece ----------
  // Pressing a piece that can move lifts it and shows its squares at once; dragging carries it;
  // releasing on a square moves there. A plain tap still works as before.
  let swallowClick = false;
  let drag = null; // { id, from, x0, y0, el, base, moved, over }
  const DRAG_START = 6;
  const posFromPoint = (x, y) => {
    const r = boardEl.getBoundingClientRect();
    const dc = Math.floor(((x - r.left) / r.width) * BOARD_SIZE), dr = Math.floor(((y - r.top) / r.height) * BOARD_SIZE);
    if (dr < 0 || dc < 0 || dr >= BOARD_SIZE || dc >= BOARD_SIZE) return null;
    return V({ r: dr, c: dc });
  };
  const setOver = (p) => {
    if (drag.over) cellAt(drag.over).classList.remove('drop-over');
    drag.over = p && !samePos(p, drag.from) ? p : null;
    if (drag.over) cellAt(drag.over).classList.add('drop-over');
  };
  function endDrag(commit) {
    const d = drag; drag = null;
    if (!d) return;
    if (d.over) cellAt(d.over).classList.remove('drop-over');
    boardEl.classList.remove('dragging');
    if (!d.el) return;
    d.el.classList.remove('lifted', 'carried');
    if (commit && d.moved && d.over && onDrop && onDrop(d.id, d.over)) return; // the move re-renders the piece
    if (d.el.style.transform !== d.base) d.el.style.transform = d.base; // glide back
  }
  boardEl.addEventListener('pointerdown', (e) => {
    if (e.button !== 0 || drag || !onPress) return;
    const cell = e.target.closest && e.target.closest('.cell');
    if (!cell) return;
    const from = { r: +cell.dataset.r, c: +cell.dataset.c };
    const res = onPress(from);
    if (!res) return;
    if (res.fresh) swallowClick = true; // the press already selected it
    const el = pieceEls.get(res.id) || null;
    drag = { id: res.id, from, x0: e.clientX, y0: e.clientY, el, base: el ? el.style.transform : '', moved: false, over: null };
    if (el) el.classList.add('lifted');
  });
  boardEl.addEventListener('pointermove', (e) => {
    if (!drag) return;
    const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
    if (!drag.moved && Math.hypot(dx, dy) < DRAG_START) return;
    if (!drag.moved) {
      drag.moved = true; swallowClick = true; boardEl.classList.add('dragging'); drag.el?.classList.add('carried');
      try { boardEl.setPointerCapture(e.pointerId); } catch { /* keeps working without capture */ }
    }
    if (drag.el) drag.el.style.transform = `${drag.base} translate(${dx}px, ${dy}px)`;
    setOver(posFromPoint(e.clientX, e.clientY));
  });
  const onUp = () => {
    if (!drag) return;
    endDrag(true);
    // The click (if any) follows this event at once; never let a stale swallow eat a later tap.
    setTimeout(() => { swallowClick = false; }, 0);
  };
  window.addEventListener('pointerup', onUp);
  const onCancel = () => endDrag(false);
  window.addEventListener('pointercancel', onCancel);
  boardEl.addEventListener('lostpointercapture', () => { if (drag) endDrag(drag.moved); });
  const blockEls = new Map();
  let lastMap = null;
  const ambient = createAmbient(q('.ambient'));
  const fx = createFX(q('.fx'), q('.board-wrap'), { pieceEl: (id) => pieceEls.get(id), V });

  function setMap(map) {
    if (map === lastMap) return;
    lastMap = map;
    const m = MAPS[map];
    boardEl.className = `board theme-${m.theme}`;
    const art = MAP_ART[m.theme];
    backdrop.style.backgroundImage = art ? `url(${ART(art)})` : 'none';
    ambient.start(m.theme);
  }

  /** Remove every piece and block (a new match). */
  function reset() {
    for (const el of pieceEls.values()) el.remove();
    pieceEls.clear();
    for (const el of blockEls.values()) el.remove();
    blockEls.clear();
    fx.clear();
  }

  /**
   * view: { acts, live, armed, threats:Set, deathDelay, hits:[] }
   * acts are the legal actions for the human deciding now ([] when it is not their call).
   */
  function render(game, view) {
    setMap(game.map);
    const { acts, live, armed, threats } = view;
    const moveActs = live ? acts.filter((a) => a.type === 'move' && a.unitId === live.id) : [];
    const opts = live ? moveOptions(game, live) : [];
    const ghosts = live && live.team !== game.current ? opts : [];
    const skillActs = live && armed ? acts.filter((a) => a.type === 'skill' && a.unitId === live.id) : [];
    const skKey = live && live.kind === 'hero' ? HEROES[live.hero].skill.key : '';
    const iceActs = game.phase === 'ice' ? acts.filter((a) => a.type === 'ice') : [];
    const pend = game.phase === 'react' ? game.pending.action : null;
    const pendActor = pend && game.units[pend.unitId];
    const pendTo = pend ? (pend.to || game.units[pend.targetId]?.pos) : null;
    const rangeOf = game.phase === 'react' ? game.units[game.pending.plantId]
      : live && live.kind === 'hero' && live.hero === 'plantae' ? live : null;
    const rootRange = HEROES.plantae.skill.range;
    const la = game.lastAction;
    const movers = new Set(acts.filter((a) => a.type === 'move').map((a) => a.unitId));
    for (const el of cells) {
      const p = { r: +el.dataset.r, c: +el.dataset.c };
      const ma = moveActs.find((a) => samePos(a.to, p));
      const opt = ma && opts.find((o) => samePos(o.to, p));
      el.classList.toggle('sel', !!live && samePos(live.pos, p));
      el.classList.toggle('move', !!opt && !opt.backstab && !opt.kills.length);
      const gh = ghosts.find((o) => samePos(o.to, p));
      el.classList.toggle('capture', (!!opt && opt.kills.length > 0) || (!!gh && gh.kills.length > 0));
      el.classList.toggle('stab', !!opt && !!opt.backstab);
      el.classList.toggle('ghost', !!gh && !gh.kills.length);
      const tgt = skillActs.some((a) => samePos(a.to || game.units[a.targetId].pos, p));
      el.classList.toggle('target', tgt);
      el.classList.toggle('grave', tgt && skKey === 'grave');
      el.classList.toggle('root', tgt && skKey === 'root');
      el.classList.toggle('icespot', iceActs.some((a) => samePos(a.to, p)));
      el.classList.toggle('range', !!rangeOf && chebyshev(rangeOf.pos, p) <= rootRange && !samePos(rangeOf.pos, p));
      el.classList.toggle('pending', !!pendActor && samePos(pendActor.pos, p));
      el.classList.toggle('pending-to', !!pendTo && samePos(pendTo, p));
      el.classList.toggle('last', !!la && [la.from, la.to].some((x) => x && samePos(x, p)));
      el.classList.remove('hit');
      const u = unitAt(game, p), b = blockAt(game, p);
      el.classList.toggle('grab', !!onPress && !!u && movers.has(u.id));
      el.setAttribute('aria-label', `${squareName(p)}${u ? `, ${label(u)}` : b ? `, ${b.kind}` : ''}`);
    }
    for (const h of view.hits || []) {
      if (h.r < 0 || h.r > 7 || h.c < 0 || h.c > 7) continue;
      const el = cellAt(h); void el.offsetWidth; el.classList.add('hit');
    }
    renderTerrain(game);
    renderPieces(game, live, threats, view.deathDelay || 0);
    renderMarks(game, pendActor, pendTo, pend);
  }

  /**
   * Marks drawn above the pieces: while an interrupt is being decided, an arrow from the
   * acting unit to its destination and a pulsing reticle on any unit it would eliminate.
   */
  function renderMarks(game, actor, to, pend) {
    const k = actor && to ? `${actor.id}>${to.r},${to.c}` : '';
    if (marksEl.dataset.k === k) return;
    marksEl.dataset.k = k;
    if (!k) { marksEl.innerHTML = ''; return; }
    const ctr = (p) => { const d = V(p); return { x: d.c * 100 + 50, y: d.r * 100 + 50 }; };
    const a = ctr(actor.pos), b = ctr(to);
    const len = Math.hypot(b.x - a.x, b.y - a.y) || 1, ux = (b.x - a.x) / len, uy = (b.y - a.y) / len;
    const sx = a.x + ux * 38, sy = a.y + uy * 38, ex = b.x - ux * 46, ey = b.y - uy * 46;
    const opt = pend.type === 'move' ? moveOptions(game, actor).find((o) => samePos(o.to, to)) : null;
    const victims = (opt ? opt.kills : pend.type === 'skill' && pend.targetId ? [pend.targetId] : []).map((id) => game.units[id]).filter(Boolean);
    const hostile = opt ? opt.kills.length > 0 : pend.type === 'skill';
    const col = hostile ? '#ff5a3c' : '#6fcf55';
    const reticle = (p) => {
      const c = ctr(p);
      return `<g class="reticle" style="transform-origin:${c.x}px ${c.y}px">
        <circle cx="${c.x}" cy="${c.y}" r="44" fill="rgba(255,90,60,.16)" stroke="${col}" stroke-width="5" stroke-dasharray="14 10"/>
        <path d="M${c.x - 50} ${c.y}h16M${c.x + 34} ${c.y}h16M${c.x} ${c.y - 50}v16M${c.x} ${c.y + 34}v16" stroke="${col}" stroke-width="6" stroke-linecap="round"/></g>`;
    };
    marksEl.innerHTML = `<defs><marker id="mk-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill="${col}"/></marker></defs>
      <rect x="${V(actor.pos).c * 100 + 4}" y="${V(actor.pos).r * 100 + 4}" width="92" height="92" rx="14" fill="none" stroke="${col}" stroke-width="5" class="actor-box"/>
      <line x1="${sx}" y1="${sy}" x2="${ex}" y2="${ey}" stroke="${col}" stroke-width="9" stroke-linecap="round" marker-end="url(#mk-arrow)" class="flow" />
      ${victims.length ? victims.map((v) => reticle(v.pos)).join('') : `<circle cx="${b.x}" cy="${b.y}" r="30" fill="none" stroke="${col}" stroke-width="5" stroke-dasharray="10 8" class="spin"/>`}`;
  }

  function renderTerrain(game) {
    const seen = new Set();
    for (const [k, b] of Object.entries(game.blocks)) {
      seen.add(k);
      let el = blockEls.get(k);
      if (el && el.dataset.kind !== b.kind) { el.remove(); el = null; }
      if (!el) {
        const [r, c] = k.split(',').map(Number);
        el = document.createElement('div');
        el.className = `block ${b.kind}`;
        el.dataset.kind = b.kind;
        const d = V({ r, c });
        el.style.transform = `translate(${d.c * 100}%, ${d.r * 100}%)`;
        el.innerHTML = TERRAIN_SVG[b.kind] || TERRAIN_SVG.rock;
        if (b.kind === 'ice' && game.lastAction?.kind === 'ice') el.classList.add('grow');
        terrainEl.appendChild(el);
        blockEls.set(k, el);
      }
    }
    for (const [k, el] of blockEls) if (!seen.has(k)) { el.remove(); blockEls.delete(k); }
  }

  function renderPieces(game, live, threats, deathDelay) {
    for (const u of Object.values(game.units)) {
      let el = pieceEls.get(u.id);
      if (!u.alive) {
        if (el && !el.dataset.dying) {
          el.dataset.dying = '1';
          setTimeout(() => {
            el.classList.add('dying');
            setTimeout(() => { el.remove(); if (pieceEls.get(u.id) === el) pieceEls.delete(u.id); }, 220);
          }, deathDelay);
        }
        continue;
      }
      if (el && el.dataset.dying) { el.remove(); pieceEls.delete(u.id); el = null; } // summoned back
      if (!el) {
        el = document.createElement('div');
        el.className = `piece ${u.team} ${u.kind}`;
        const name = heroDef(u).name;
        if (u.kind === 'beast') el.innerHTML = `<div class="token" style="color:${u.team === 'p1' ? '#5a3a1a' : '#f3d9a8'}">${BEAST_SVG}</div><span class="tag">${name}</span>`;
        else if (u.kind === 'creep') el.innerHTML = `<div class="token">${CREEP_SVG}</div>`;
        else el.innerHTML = `<div class="token"><img src="${ICON(u.hero)}" alt=""></div><span class="tag">${name}</span>`;
        piecesEl.appendChild(el);
        pieceEls.set(u.id, el);
      }
      const d = V(u.pos);
      el.style.transform = `translate(${d.c * 100}%, ${d.r * 100}%)`;
      el.classList.toggle('warded', u.warded);
      el.classList.toggle('rooted', u.rooted > 0);
      el.classList.toggle('selected', !!live && live.id === u.id);
      let badge = el.querySelector('.threat');
      if (threats.has(u.id)) {
        if (!badge) { badge = document.createElement('div'); badge.className = 'threat'; badge.textContent = '!'; badge.title = 'Can be eliminated next enemy turn'; el.appendChild(badge); }
      } else if (badge) badge.remove();
    }
  }

  function hop(id) {
    const el = pieceEls.get(id);
    if (el) { el.classList.remove('hop'); void el.offsetWidth; el.classList.add('hop'); }
  }

  function destroy() { drag = null; window.removeEventListener('pointerup', onUp); window.removeEventListener('pointercancel', onCancel); ambient.stop(); fx.destroy(); host.innerHTML = ''; }

  return {
    render, reset, hop, destroy,
    plan: fx.plan, run: fx.run, intro: (game) => fx.intro(game), victory: (game, w) => fx.victory(game, w), clearFx: fx.clear,
  };
}

function createAmbient(canvas) {
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let theme = null, parts = [], raf = 0, W = 0, H = 0, dpr = 1, last = 0;
  const STYLE = {
    desert: { n: 26, color: [250, 232, 190], vx: [0.5, 1.4], vy: [-0.1, 0.15], size: [0.8, 1.8], shape: 'dot' },
    savanna: { n: 16, color: [255, 220, 150], vx: [0.25, 0.7], vy: [-0.25, 0.05], size: [1, 2.2], shape: 'mote' },
    jungle: { n: 12, color: [150, 210, 110], vx: [-0.25, 0.25], vy: [0.3, 0.7], size: [3, 5], shape: 'leaf' },
    winter: { n: 40, color: [255, 255, 255], vx: [-0.3, 0.3], vy: [0.35, 0.9], size: [1, 2.4], shape: 'dot' },
  };
  const rnd = (a, b) => a + Math.random() * (b - a); // cosmetic only
  function resize() { const r = canvas.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  function spawn(st, anywhere) {
    return { x: anywhere ? rnd(0, W) : st.vx[0] > 0 ? -5 : rnd(0, W), y: anywhere ? rnd(0, H) : st.vy[0] > 0 ? -5 : rnd(0, H),
      vx: rnd(...st.vx), vy: rnd(...st.vy), s: rnd(...st.size), rot: rnd(0, 6), a: rnd(0.35, 0.85), ph: rnd(0, 6) };
  }
  function start(t) {
    stop(); theme = t;
    const st = STYLE[t];
    if (!st || reduce) return;
    resize();
    parts = Array.from({ length: st.n }, () => spawn(st, true));
    last = performance.now();
    raf = requestAnimationFrame(frame);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = 0; parts = []; ctx.clearRect(0, 0, canvas.width, canvas.height); }
  function frame(now) {
    const st = STYLE[theme];
    if (!st) return;
    const k = Math.min(3, (now - last) / 16.7); last = now;
    if (document.hidden) { raf = requestAnimationFrame(frame); return; }
    if (Math.abs(canvas.width - Math.round(canvas.getBoundingClientRect().width * dpr)) > 1) resize();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    const [r, g, b] = st.color;
    for (const p of parts) {
      p.ph += 0.03 * k;
      p.x += (p.vx + (st.shape === 'leaf' ? Math.sin(p.ph) * 0.5 : 0)) * k; p.y += p.vy * k; p.rot += 0.02 * k;
      if (p.x > W + 8 || p.x < -8 || p.y > H + 8 || p.y < -8) Object.assign(p, spawn(st, false));
      ctx.fillStyle = `rgba(${r},${g},${b},${p.a})`;
      if (st.shape === 'leaf') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.ellipse(0, 0, p.s, p.s * 0.45, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      } else if (st.shape === 'mote') {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(p.ph * 2); ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1;
      } else {
        ctx.beginPath(); ctx.arc(p.x, p.y, p.s, 0, Math.PI * 2); ctx.fill();
      }
    }
    raf = requestAnimationFrame(frame);
  }
  return { start, stop };
}


function createFX(canvas, wrap, view) {
  const ctx = canvas.getContext('2d');
  const reduce = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  const COL = {
    p1: '#f3ead2', p2: '#ff6a45', spirit: '#a996ff', spirit2: '#5f7dff', frost: '#c4e6fa', brass: '#f0bf5e',
    blood: '#ff5a3c', dust: '#c9b28a', sand: '#e7c27d', vine: '#6fcf55', leaf: '#3f9a3a', steel: '#d7e3f0', bolt: '#cfe6ff', white: '#ffffff', mane: '#e0a050',
  };
  let W = 0, H = 0, dpr = 1, raf = 0, last = 0;
  let parts = [], rings = [], lines = [], flashes = [], bolts = [], texts = [], timers = [];
  const rnd = (a, b) => a + Math.random() * (b - a); // cosmetic only
  const at = (ms, fn) => { timers.push(setTimeout(fn, ms)); };
  function resize() { const r = canvas.getBoundingClientRect(); dpr = Math.min(devicePixelRatio || 1, 2); W = r.width; H = r.height; canvas.width = Math.round(W * dpr); canvas.height = Math.round(H * dpr); }
  const C = (q) => { const p = view.V ? view.V(q) : q; return { x: (p.c + 0.5) * W / 8, y: (p.r + 0.5) * H / 8 }; };
  const S = () => W / 8;

  function burst(p, color, n, o = {}) {
    const c = C(p), s = S();
    for (let i = 0; i < n; i++) {
      const ang = o.dir != null ? o.dir + rnd(-o.spread, o.spread) : rnd(0, Math.PI * 2);
      const sp = rnd(o.min ?? 0.6, o.max ?? 2.2) * s / 16;
      const life = rnd(o.life?.[0] ?? 380, o.life?.[1] ?? 700);
      parts.push({ x: c.x + rnd(-s * 0.12, s * 0.12), y: c.y + rnd(-s * 0.12, s * 0.12), vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        g: (o.g ?? 0) * s / 900, drag: o.drag ?? 0.94, life, max: life, size: rnd(o.size?.[0] ?? 1.5, o.size?.[1] ?? 3.2) * s / 60,
        color: Array.isArray(color) ? color[i % color.length] : color, shape: o.shape || 'dot', rot: rnd(0, 6), vr: rnd(-0.25, 0.25), rise: o.rise || 0 });
    }
    kick();
  }
  const ring = (p, color, o = {}) => { rings.push({ c: C(p), color, r0: (o.from ?? 0.1) * S(), r1: (o.to ?? 0.8) * S(), w: o.w ?? 3, t: 0, life: o.life ?? 420, dots: o.dots }); kick(); };
  const flash = (p, color, size = 1, life = 260) => { flashes.push({ c: C(p), color, r: size * S(), t: 0, life }); kick(); };
  const line = (a, b, color, o = {}) => { lines.push({ a: C(a), b: C(b), color, t: 0, life: o.life ?? 360, w: o.w ?? 3, arc: o.arc ?? 0, wave: o.wave ?? 0, grow: o.grow ?? 3 }); kick(); };
  const text = (p, str, color) => { texts.push({ c: C(p), str, color, t: 0, life: 900 }); kick(); };
  function shake(k = 1) {
    if (reduce || !wrap.animate) return;
    const d = 4 * k;
    wrap.animate([{ transform: 'translate(0,0)' }, { transform: `translate(${-d}px,${d / 2}px)` }, { transform: `translate(${d}px,${-d / 2}px)` }, { transform: `translate(${-d / 2}px,0)` }, { transform: 'translate(0,0)' }], { duration: 260, easing: 'ease-out' });
  }
  function slashes(p, color, n = 1, tilt = 1) {
    const c = C(p), s = S() * 0.42;
    for (let i = 0; i < n; i++) {
      const off = (i - (n - 1) / 2) * S() * 0.2;
      at(i * 50, () => { lines.push({ a: { x: c.x - s + off, y: c.y - s * tilt }, b: { x: c.x + s + off, y: c.y + s * tilt }, color, t: 0, life: 300, w: 3.2, arc: 0, wave: 0, grow: 5 }); kick(); });
    }
  }
  function lightning(p) {
    const c = C(p);
    let x = c.x + rnd(-S() * 0.5, S() * 0.5), y = -10;
    const pts = [{ x, y }];
    while (y < c.y) { y += rnd(S() * 0.3, S() * 0.6); x += rnd(-S() * 0.35, S() * 0.35); pts.push({ x, y: Math.min(y, c.y) }); }
    pts[pts.length - 1] = { x: c.x, y: c.y };
    bolts.push({ zig: pts, color: COL.bolt, t: 0, life: 340 });
    kick();
  }

  function frame(now) {
    const dt = Math.min(48, now - last); last = now; const k = dt / 16.7;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); ctx.clearRect(0, 0, W, H);
    ctx.globalCompositeOperation = 'lighter';
    flashes = flashes.filter((f) => (f.t += dt) < f.life);
    for (const f of flashes) {
      const a = 1 - f.t / f.life; const g = ctx.createRadialGradient(f.c.x, f.c.y, 0, f.c.x, f.c.y, f.r);
      g.addColorStop(0, rgba(f.color, 0.75 * a)); g.addColorStop(1, rgba(f.color, 0));
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(f.c.x, f.c.y, f.r, 0, Math.PI * 2); ctx.fill();
    }
    rings = rings.filter((r) => (r.t += dt) < r.life);
    for (const r of rings) {
      const q = 1 - Math.pow(1 - r.t / r.life, 3); const rad = r.r0 + (r.r1 - r.r0) * q;
      ctx.strokeStyle = rgba(r.color, 1 - q); ctx.lineWidth = r.w * (1 - q * 0.6);
      ctx.beginPath(); ctx.arc(r.c.x, r.c.y, Math.max(0, rad), 0, Math.PI * 2); ctx.stroke();
      if (r.dots) { ctx.fillStyle = rgba(r.dots, 1 - q); for (let i = 0; i < 10; i++) { const a = i * Math.PI / 5 + q; ctx.beginPath(); ctx.arc(r.c.x + Math.cos(a) * rad, r.c.y + Math.sin(a) * rad, 2.2, 0, Math.PI * 2); ctx.fill(); } }
    }
    lines = lines.filter((l) => (l.t += dt) < l.life);
    for (const l of lines) {
      const q = l.t / l.life, grow = Math.min(1, q * l.grow);
      ctx.strokeStyle = rgba(l.color, 1 - q); ctx.lineWidth = l.w * (1 - q * 0.5); ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(l.a.x, l.a.y);
      if (l.wave) {
        const dx = l.b.x - l.a.x, dy = l.b.y - l.a.y, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
        for (let i = 1; i <= 24; i++) { const t = (i / 24) * grow; const w = Math.sin(t * Math.PI * 4 + l.t / 60) * l.wave * S() * Math.sin(t * Math.PI); ctx.lineTo(l.a.x + dx * t + nx * w, l.a.y + dy * t + ny * w); }
      } else {
        const ex = l.a.x + (l.b.x - l.a.x) * grow, ey = l.a.y + (l.b.y - l.a.y) * grow;
        if (l.arc) ctx.quadraticCurveTo((l.a.x + ex) / 2, (l.a.y + ey) / 2 - l.arc * S(), ex, ey); else ctx.lineTo(ex, ey);
      }
      ctx.stroke();
    }
    bolts = bolts.filter((b) => {
      b.t += dt;
      const a = 1 - b.t / b.life;
      for (const [w, col] of [[8, rgba('#6fa8ff', a * 0.5)], [2.6, rgba(b.color, a)]]) {
        ctx.strokeStyle = col; ctx.lineWidth = w; ctx.lineJoin = 'round'; ctx.beginPath();
        b.zig.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.stroke();
      }
      return b.t < b.life;
    });
    parts = parts.filter((p) => (p.life -= dt) > 0);
    for (const p of parts) {
      p.vx *= Math.pow(p.drag, k); p.vy = p.vy * Math.pow(p.drag, k) + p.g * k - p.rise * k;
      p.x += p.vx * k; p.y += p.vy * k; p.rot += p.vr * k;
      const a = p.life / p.max;
      ctx.fillStyle = rgba(p.color, a); ctx.strokeStyle = rgba(p.color, a);
      if (p.shape === 'shard') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.moveTo(0, -p.size * 1.6); ctx.lineTo(p.size, p.size); ctx.lineTo(-p.size, p.size * 0.8); ctx.closePath(); ctx.fill(); ctx.restore();
      } else if (p.shape === 'spark') {
        ctx.lineWidth = p.size * 0.7; ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(p.x - p.vx * 3, p.y - p.vy * 3); ctx.stroke();
      } else if (p.shape === 'leaf') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.beginPath(); ctx.ellipse(0, 0, p.size * 1.8, p.size * 0.8, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
      } else if (p.shape === 'crystal') {
        ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rot); ctx.lineWidth = 1.4; ctx.beginPath();
        for (let i = 0; i < 3; i++) { const t = i * Math.PI / 3; ctx.moveTo(-Math.cos(t) * p.size * 1.5, -Math.sin(t) * p.size * 1.5); ctx.lineTo(Math.cos(t) * p.size * 1.5, Math.sin(t) * p.size * 1.5); }
        ctx.stroke(); ctx.restore();
      } else if (p.shape === 'smoke' || p.shape === 'wisp') {
        const r = p.size * (2.5 - a * 1.2); const g = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, r);
        g.addColorStop(0, rgba(p.color, a * (p.shape === 'wisp' ? 0.6 : 0.35))); g.addColorStop(1, rgba(p.color, 0));
        ctx.fillStyle = g; ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, Math.PI * 2); ctx.fill();
      } else { ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill(); }
    }
    ctx.globalCompositeOperation = 'source-over';
    texts = texts.filter((t) => (t.t += dt) < t.life);
    for (const t of texts) {
      const q = t.t / t.life, a = q < 0.7 ? 1 : 1 - (q - 0.7) / 0.3, sc = 0.8 + Math.min(1, q * 5) * 0.25;
      ctx.save(); ctx.translate(t.c.x, t.c.y - q * S() * 0.5); ctx.scale(sc, sc);
      ctx.font = `700 ${Math.round(S() * 0.3)}px "IBM Plex Mono", ui-monospace, monospace`;
      ctx.textAlign = 'center'; ctx.lineWidth = 4; ctx.strokeStyle = `rgba(10,12,16,${a})`; ctx.strokeText(t.str, 0, 0);
      ctx.fillStyle = rgba(t.color, a); ctx.fillText(t.str, 0, 0); ctx.restore();
    }
    if (parts.length || rings.length || lines.length || flashes.length || bolts.length || texts.length) raf = requestAnimationFrame(frame);
    else { raf = 0; ctx.clearRect(0, 0, W, H); }
  }
  function kick() { if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } }
  function rgba(hex, a) { const n = parseInt(hex.slice(1), 16); return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, a)).toFixed(3)})`; }

  function kill(u, big) {
    flash(u.pos, COL.blood, 1.1, 300);
    ring(u.pos, COL.blood, { to: 1.1, w: 4, life: 460 });
    const team = COL[u.team];
    burst(u.pos, [team, team, COL.blood], 24, { shape: 'shard', min: 1, max: 2.8, g: 0.9, drag: 0.93, life: [450, 800], size: [2, 4.5] });
    if (u.hero === 'plantae') burst(u.pos, [COL.leaf, COL.vine], 14, { shape: 'leaf', min: 0.8, max: 2.4, g: 0.4, life: [600, 1000], size: [2, 3.4] });
    if (u.hero === 'aqna') burst(u.pos, COL.frost, 12, { shape: 'crystal', min: 1, max: 3, life: [500, 800], size: [2, 3.5] });
    if (u.hero === 'magumba') burst(u.pos, [COL.spirit, COL.spirit2], 10, { shape: 'wisp', min: 0.1, max: 0.5, rise: 0.06, life: [700, 1100], size: [3, 5] });
    shake(big ? 1.6 : 1.1);
  }

  /** Timing decisions that must be known before render. */
  function plan(before, after) {
    const la = after.lastAction;
    const p = { before, after, la, deathDelay: 0, hop: null };
    if (reduce || !la || la === before.lastAction) return p;
    const actor = after.units[la.unitId];
    if (la.kind === 'capture') p.deathDelay = 240;
    if (la.kind === 'backstab') { p.deathDelay = 200; p.hop = actor.id; }
    if (actor && actor.hero === 'hexor' && (la.kind === 'move' || la.kind === 'capture')) p.hop = actor.id;
    if (la.kind === 'storm') p.deathDelay = 420;
    if (la.breach) p.deathDelay = 520;
    return p;
  }

  function run(p) {
    if (reduce || !p.la || p.la === p.before.lastAction) return;
    resize();
    const { la, before, after } = p;
    const actor = after.units[la.unitId] || before.units[la.unitId];
    const deaths = Object.values(before.units).filter((u) => u.alive && !after.units[u.id].alive && !(la.breach && u.id === la.unitId));
    for (const u of deaths) if (u.kind === 'creep' && actor && actor.team !== u.team) at(420, () => text(u.pos, `+${CREEPS.lastHit}`, COL.brass));
    const killAll = (ms, big) => at(ms, () => deaths.forEach((u) => kill(before.units[u.id], big)));
    const tgt = la.hits?.[0];

    if (la.kind === 'storm') {
      const at2 = la.to;
      lightning(at2);
      flash(at2, COL.bolt, 1.6, 360);
      ring(at2, COL.steel, { to: 1.7, w: 5, life: 520 });
      ring(at2, COL.bolt, { to: 2.2, w: 2, life: 620 });
      shake(1.6);
      for (const pu of la.storm || []) {
        const a = C(pu.from), b = C(pu.to); const dir = Math.atan2(b.y - a.y, b.x - a.x);
        burst(pu.from, COL.dust, 8, { shape: 'smoke', dir, spread: 0.6, min: 0.6, max: 1.8, life: [300, 520], size: [4, 7] });
        if (pu.blocked) text(pu.from, 'HELD', COL.spirit);
      }
      killAll(420, true);
      return;
    }
    if (la.kind === 'interrupt') {
      flash(la.from, COL.vine, 0.9, 300);
      line(la.from, tgt, COL.vine, { wave: 0.18, life: 640, w: 3.5, grow: 2.5 });
      line(la.from, tgt, COL.leaf, { wave: -0.14, life: 640, w: 2.5, grow: 2.2 });
      at(260, () => {
        ring(tgt, COL.vine, { from: 0.9, to: 0.35, life: 500, w: 4 });
        burst(tgt, [COL.vine, COL.leaf], 18, { shape: 'leaf', min: 1, max: 2.8, life: [500, 900], size: [2, 3.2] });
        text(tgt, 'INTERRUPTED', COL.vine);
        shake(0.6);
      });
      return;
    }
    if (la.kind === 'summon') {
      line(la.from, la.to, COL.mane, { arc: 0.3, life: 380, w: 2.5 });
      at(160, () => {
        flash(la.to, COL.mane, 1, 320);
        ring(la.to, COL.mane, { from: 0.2, to: 0.9, life: 520, w: 3 });
        burst(la.to, [COL.mane, COL.dust], 14, { shape: 'smoke', min: 0.4, max: 1.4, life: [400, 700], size: [4, 7] });
        text(la.to, 'SUMMONED', COL.mane);
      });
      return;
    }
    if (la.kind === 'root') {
      line(la.from, tgt, COL.vine, { wave: 0.15, life: 540, w: 3, grow: 2.5 });
      at(220, () => { ring(tgt, COL.vine, { from: 0.85, to: 0.4, life: 460, w: 3.5 }); burst(tgt, [COL.vine, COL.leaf], 14, { shape: 'leaf', min: 0.8, max: 2.2, life: [500, 800], size: [2, 3] }); text(tgt, 'ROOTED', COL.vine); });
      return;
    }
    if (la.kind === 'grave') {
      line(la.from, tgt, COL.spirit, { arc: 0.4, life: 420, w: 2 });
      at(180, () => {
        ring(tgt, COL.spirit, { from: 0.2, to: 0.75, life: 700, w: 3, dots: '#ff8a3d' });
        ring(tgt, COL.spirit2, { from: 0.9, to: 0.45, life: 700, w: 2 });
        burst(tgt, [COL.spirit, COL.spirit2, COL.white], 18, { shape: 'wisp', min: 0.1, max: 0.6, rise: 0.06, drag: 0.97, life: [700, 1200], size: [3, 6] });
      });
      return;
    }
    if (la.kind === 'ice') {
      burst(la.to, [COL.frost, COL.white], 20, { shape: 'crystal', min: 2, max: 4, life: [380, 620], size: [2.5, 4.5] });
      flash(la.to, COL.frost, 0.9, 340);
      ring(la.to, COL.frost, { from: 0.9, to: 0.25, life: 420, w: 3 });
      return;
    }
    if (la.kind === 'backstab') {
      line(la.from, la.to, COL.sand, { arc: 0.9, life: 420, w: 2.5 });
      burst(la.from, COL.sand, 14, { shape: 'smoke', min: 0.3, max: 1.2, life: [400, 700], size: [5, 8] });
      const mid = { r: (la.from.r + la.to.r) / 2, c: (la.from.c + la.to.c) / 2 };
      at(130, () => { slashes(mid, COL.white, 1); burst(la.to, COL.sand, 16, { shape: 'smoke', min: 0.3, max: 1.4, life: [400, 700], size: [5, 9] }); });
      killAll(200);
      return;
    }
    if (la.kind === 'capture') {
      const at2 = la.to;
      if (actor && actor.kind === 'beast') {
        at(160, () => { slashes(at2, '#ffd6a0', 3, 1.2); burst(at2, COL.dust, 10, { shape: 'smoke', min: 0.4, max: 1.2, life: [300, 500], size: [5, 8] }); });
      } else if (actor && actor.hero === 'hexor') {
        at(200, () => { ring(at2, COL.steel, { to: 1, w: 4, life: 380 }); burst(at2, COL.dust, 10, { shape: 'smoke', min: 0.4, max: 1.4, life: [300, 520], size: [4, 7] }); shake(0.6); });
      } else if (actor && actor.hero === 'aqna') {
        line(la.from, la.to, COL.frost, { life: 320, w: 2.5 });
        at(220, () => burst(at2, COL.frost, 14, { shape: 'crystal', min: 1.5, max: 3.5, life: [400, 700], size: [2, 4] }));
      } else if (actor && actor.hero === 'hasim') {
        at(180, () => slashes(at2, COL.white, 1));
      } else if (actor && actor.hero === 'genga') {
        at(160, () => { slashes(at2, COL.mane, 3, 1.2); ring(at2, COL.mane, { to: 0.9, life: 360 }); });
      } else {
        line(la.from, la.to, actor ? COL[actor.team] : COL.white, { life: 280, w: 2.5 });
      }
      killAll(240);
      return;
    }
    if (la.breach) {
      at(300, () => {
        flash(la.to, COL.brass, 1.2, 420);
        ring(la.to, COL.brass, { to: 1.3, w: 4, life: 560 });
        burst(la.to, [COL.brass, COL.white], 16, { shape: 'spark', dir: -Math.PI / 2, spread: 1.2, min: 2, max: 4.5, life: [300, 600] });
        text(la.to, `+${tk(CREEPS.breach).toUpperCase()}`, COL.brass);
      });
    }
    if (la.kind === 'move') {
      const th = MAPS[after.map].theme;
      const dust = th === 'winter' ? COL.white : th === 'jungle' ? COL.leaf : COL.dust;
      at(260, () => burst(la.to, dust, 8, { shape: th === 'jungle' ? 'leaf' : 'smoke', min: 0.3, max: 0.9, life: [300, 520], size: th === 'jungle' ? [1.5, 2.5] : [5, 8] }));
      if (actor && actor.hero === 'genga') at(80, () => ring(la.to, COL.mane, { to: 0.6, life: 300, w: 2 }));
    }
  }

  function intro(game) {
    if (reduce || !game) return;
    resize();
    for (const u of Object.values(game.units)) {
      if (u.kind !== 'beast') continue;
      const el = view.pieceEl(u.id); if (el) el.classList.add('summon');
      at(300, () => { ring(u.pos, COL.mane, { to: 0.9, w: 3, life: 520 }); burst(u.pos, [COL.mane, COL.dust], 14, { shape: 'smoke', min: 0.4, max: 1.4, life: [400, 700], size: [5, 8] }); text(u.pos, 'ROAR', '#f2b35e'); });
    }
  }

  function victory(game, winner) {
    if (reduce) return;
    resize();
    const heroes = livingHeroes(game, winner);
    for (let i = 0; i < 5; i++) at(250 + i * 260, () => heroes.forEach((u) => burst(u.pos, [COL[winner], COL.brass, COL.white], 14, { shape: 'dot', dir: -Math.PI / 2, spread: 0.9, min: 2.5, max: 5.5, g: 0.6, drag: 0.97, life: [700, 1200], size: [1.4, 2.8] })));
  }
  function clear() { timers.forEach(clearTimeout); timers = []; parts = []; rings = []; lines = []; flashes = []; bolts = []; texts = []; }
  const onResize = () => { if (raf) resize(); };
  window.addEventListener('resize', onResize);
  function destroy() { clear(); if (raf) cancelAnimationFrame(raf); raf = 0; window.removeEventListener('resize', onResize); }
  return { plan, run, intro, victory, clear, destroy };
}

