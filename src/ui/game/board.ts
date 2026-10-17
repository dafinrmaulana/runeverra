// The board stage: cells, terrain, pieces, and input (tap, or hold and drag like a chess piece).
// Imperative DOM for smooth animation; React owns everything around it. Cosmetic only: it reads
// game states and never changes them. Effects live in effects.ts, ambient particles in ambient.ts.
import {
  BOARD_SIZE,
  HEROES,
  PHASES,
  MAPS,
  unitAt,
  blockAt,
  squareName,
  samePos,
  label,
  heroDef,
  moveOptions,
  skillReach,
  skillOf,
  inInnerReach,
  isCommander,
} from '../../engine/index.ts';
import type { Action, Pos, State, Team, Unit } from '../../engine/index.ts';
import { ICON, ART, MAP_ART } from '../data';
import { TERRAIN_SVG, CREEP_SVG, BEAST_SVG } from './art';
import { createAmbient } from './ambient';
import { createEffects, type EffectPlan } from './effects';
import { lungeBack } from './motion';

export { TERRAIN_SVG, CREEP_SVG, BEAST_SVG } from './art';
export { lungeBack } from './motion';

/** The commander's mark on its piece: a war banner on its pole (the same as the picker's). */
const COMMANDER_SVG =
  '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3.5 1.5v13" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/><path d="M4.3 2.3h8.4l-2.2 2.8 2.2 2.8H4.3z" fill="currentColor"/></svg>';

/** Squares tinted with the reach of the skill in play, and that skill's key (for its colour). */
export type SkillZone = { cells: Set<string>; key: string; inner: Set<string> };

/**
 * Where the skill in play reaches. The shape comes from the engine (`skillReach`), so a new hero's
 * area shows up without extra code: an armed skill, a follow-up phase (ice, storm), a reaction prompt,
 * or a selected hero whose reaction can fire on the enemy's turn.
 */
export function skillZone(
  game: State,
  selected: Unit | null | undefined,
  armed: boolean | undefined,
  ownReach = true,
): SkillZone | null {
  const zoneOf = (caster: Unit | null): SkillZone | null => {
    if (!caster) return null;
    const skill = skillOf(caster)!;
    const squares = skillReach(game, caster);
    return {
      cells: new Set(squares.map((pos) => `${pos.r},${pos.c}`)),
      key: skill.key,
      // its stronger inner area (Aqna's strike range) gets its own colour
      inner: new Set(squares.filter((pos) => inInnerReach(caster, pos, skill)).map((pos) => `${pos.r},${pos.c}`)),
    };
  };
  const pendingHero = (id: string | undefined) => {
    const unit = id ? game.units[id] : undefined;
    return unit && unit.kind === 'hero' ? unit : null;
  };
  if (game.phase === 'react') return zoneOf(pendingHero(game.pending?.reactorId));
  if (PHASES[game.phase]) {
    const caster = pendingHero(game.pending?.unitId); // Aqna's ice, Hexor's storm
    if (caster) return zoneOf(caster);
  }
  if (!selected || selected.kind !== 'hero') return null;
  const skill = skillOf(selected)!;
  if (armed && skill.range) return zoneOf(selected);
  // a reaction's reach shows only for the player's own hero: an enemy's is theirs to know
  if (ownReach && HEROES[selected.hero].hooks?.reaction) return zoneOf(selected);
  return null;
}

export type BoardOptions = {
  /** A tap on a square. */
  onCell: (pos: Pos) => void;
  /** A press on a square: return the piece to lift (and whether the press just selected it), or null. */
  onPress?: ((pos: Pos) => { id: string; fresh: boolean } | null) | null;
  /** A lifted piece dropped on a square: return true when that made a move. */
  onDrop?: ((unitId: string, pos: Pos) => boolean) | null;
  /** Turn the board 180° (this player sits on Ember's side). */
  flip?: boolean;
  /** Two players sit across one screen, so Ember's pieces are turned to face the top seat. */
  facing?: boolean;
};

/** What to highlight on a render. */
export type BoardView = {
  acts: Action[]; // legal actions for the human deciding now ([] when it is not their call)
  live: Unit | null; // the selected unit
  armed?: boolean; // its skill is armed: show targets
  threats: Set<string>; // units to badge as capturable next turn
  deathDelay?: number; // ms to wait before eliminated pieces fade (so the effect lands first)
  hits?: Pos[]; // squares to flash as hit
  ownReach?: boolean; // the selected unit is the viewer's own: show its reaction's reach (default true)
};

type Drag = {
  id: string;
  from: Pos;
  fresh: boolean;
  threshold: number; // px the pointer must travel before the press becomes a drag
  startX: number;
  startY: number;
  piece: HTMLElement | null;
  baseTransform: string;
  moved: boolean;
  over: Pos | null;
};

/** Mount a board into `host`. Call `render(game, view)` after every change; `plan` and `run` for effects. */
export function createBoard(
  host: HTMLElement,
  { onCell, onPress = null, onDrop = null, flip = false, facing = false }: BoardOptions,
) {
  /** Display position of a board square: turned 180° when this player sits on Ember's side. */
  const toDisplay = (pos: Pos): Pos => (flip ? { r: BOARD_SIZE - 1 - pos.r, c: BOARD_SIZE - 1 - pos.c } : pos);
  host.innerHTML = `<div class="arena"><div class="backdrop"></div><div class="board-wrap"><div class="board">
    <canvas class="layer ambient" aria-hidden="true"></canvas><div class="layer terrain"></div><div class="layer pieces"></div><svg class="layer marks" viewBox="0 0 800 800" preserveAspectRatio="none" aria-hidden="true"></svg>
    <canvas class="fx" aria-hidden="true"></canvas></div></div></div>`;
  const find = <T extends Element = HTMLElement>(selector: string) => host.querySelector(selector) as T;
  const boardEl = find('.board');
  const terrainEl = find('.terrain');
  const piecesEl = find('.pieces');
  const backdrop = find('.backdrop');
  const marksEl = find<SVGSVGElement>('.marks');
  const cells: HTMLButtonElement[] = new Array(BOARD_SIZE * BOARD_SIZE);
  const pieceEls = new Map<string, HTMLElement>();
  const blockEls = new Map<string, HTMLElement>();
  let swallowClick = false; // a press or drag already handled this tap
  let drag: Drag | null = null;
  let lastMap: string | null = null;

  // Cells are laid out in display order; `cells` stays indexed by the real square.
  for (let displayRow = 0; displayRow < BOARD_SIZE; displayRow++) {
    for (let displayCol = 0; displayCol < BOARD_SIZE; displayCol++) {
      const { r, c } = toDisplay({ r: displayRow, c: displayCol });
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell' + ((r + c) % 2 ? ' dark' : '');
      cell.dataset.r = String(r);
      cell.dataset.c = String(c);
      if (displayCol === 0) cell.insertAdjacentHTML('beforeend', `<span class="coord rank">${BOARD_SIZE - r}</span>`);
      if (displayRow === BOARD_SIZE - 1)
        cell.insertAdjacentHTML('beforeend', `<span class="coord file">${'abcdefgh'[c]}</span>`);
      cell.addEventListener('click', () => {
        if (swallowClick) {
          swallowClick = false;
          return;
        }
        onCell({ r, c });
      });
      boardEl.insertBefore(cell, find('.ambient'));
      cells[r * BOARD_SIZE + c] = cell;
    }
  }
  const cellAt = (pos: Pos) => cells[pos.r * BOARD_SIZE + pos.c];
  const posOf = (cell: HTMLElement): Pos => ({ r: Number(cell.dataset.r), c: Number(cell.dataset.c) });

  // ---------- hold and drag, like lifting a chess piece ----------
  // Pressing a piece that can move lifts it and shows its squares at once; dragging carries it;
  // releasing on a square moves there. A plain tap still works as before.
  // A finger wobbles far more than a mouse: a touch only becomes a drag after a real swipe.
  const DRAG_START_MOUSE = 6;
  const DRAG_START_TOUCH = 16;
  const posFromPoint = (clientX: number, clientY: number) => {
    const rect = boardEl.getBoundingClientRect();
    const displayCol = Math.floor(((clientX - rect.left) / rect.width) * BOARD_SIZE);
    const displayRow = Math.floor(((clientY - rect.top) / rect.height) * BOARD_SIZE);
    if (displayRow < 0 || displayCol < 0 || displayRow >= BOARD_SIZE || displayCol >= BOARD_SIZE) return null;
    return toDisplay({ r: displayRow, c: displayCol });
  };
  const setDropTarget = (pos: Pos | null) => {
    if (!drag) return;
    if (drag.over) cellAt(drag.over).classList.remove('drop-over');
    drag.over = pos && !samePos(pos, drag.from) ? pos : null;
    if (drag.over) cellAt(drag.over).classList.add('drop-over');
  };
  function endDrag(commit: boolean) {
    const ended = drag;
    drag = null;
    if (!ended) return;
    if (ended.over) cellAt(ended.over).classList.remove('drop-over');
    boardEl.classList.remove('dragging');
    if (!ended.piece) return;
    ended.piece.classList.remove('lifted', 'carried');
    if (commit && ended.moved && ended.over && onDrop && onDrop(ended.id, ended.over)) return; // the move re-renders the piece
    if (ended.piece.style.transform !== ended.baseTransform) ended.piece.style.transform = ended.baseTransform; // glide back
  }
  boardEl.addEventListener('pointerdown', (event) => {
    if (event.button !== 0 || drag || !onPress) return;
    const cell = (event.target as HTMLElement).closest?.('.cell') as HTMLElement | null;
    if (!cell) return;
    const from = posOf(cell);
    const lifted = onPress(from);
    if (!lifted) return;
    if (lifted.fresh) swallowClick = true; // the press already selected it
    const piece = pieceEls.get(lifted.id) || null;
    drag = {
      id: lifted.id,
      from,
      fresh: !!lifted.fresh,
      threshold: event.pointerType === 'mouse' ? DRAG_START_MOUSE : DRAG_START_TOUCH,
      startX: event.clientX,
      startY: event.clientY,
      piece,
      baseTransform: piece ? piece.style.transform : '',
      moved: false,
      over: null,
    };
    piece?.classList.add('lifted');
  });
  boardEl.addEventListener('pointermove', (event) => {
    if (!drag) return;
    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < drag.threshold) return;
    if (!drag.moved) {
      drag.moved = true;
      swallowClick = true;
      boardEl.classList.add('dragging');
      drag.piece?.classList.add('carried');
      try {
        boardEl.setPointerCapture(event.pointerId);
      } catch {
        /* keeps working without capture */
      }
    }
    if (drag.piece) drag.piece.style.transform = `${drag.baseTransform} translate(${dx}px, ${dy}px)`;
    setDropTarget(posFromPoint(event.clientX, event.clientY));
  });
  const onPointerUp = (event: PointerEvent) => {
    if (!drag) return;
    // Let go back on the square it was lifted from: that was a tap that wobbled, not a move.
    // (The pointer is captured by now, so no click will reach the square: do what the tap would have.)
    const releasedOn = posFromPoint(event.clientX, event.clientY);
    const wobbledTap = drag.moved && !!releasedOn && samePos(releasedOn, drag.from);
    const { from, fresh } = drag;
    endDrag(!wobbledTap);
    if (wobbledTap && !fresh) {
      swallowClick = false;
      onCell(from);
      return;
    }
    // The click (if any) follows this event at once; never let a stale swallow eat a later tap.
    setTimeout(() => {
      swallowClick = false;
    }, 0);
  };
  window.addEventListener('pointerup', onPointerUp);
  const onPointerCancel = () => endDrag(false);
  window.addEventListener('pointercancel', onPointerCancel);
  // Only the board's own capture ending matters. On touch the browser first captures the pointer to the
  // pressed square; handing it to the board fires that square's lostpointercapture, which must not drop the piece.
  boardEl.addEventListener('lostpointercapture', (event) => {
    if (drag && event.target === boardEl) endDrag(drag.moved);
  });

  const ambient = createAmbient(find<HTMLCanvasElement>('.ambient'));
  const effects = createEffects(find<HTMLCanvasElement>('.fx'), find('.board-wrap'), {
    pieceEl: (id) => pieceEls.get(id),
    toDisplay,
  });

  function setMap(mapId: string) {
    if (mapId === lastMap) return;
    lastMap = mapId;
    const map = MAPS[mapId];
    boardEl.className = `board theme-${map.theme}${facing ? ' facing' : ''}`;
    const art = MAP_ART[map.theme];
    backdrop.style.backgroundImage = art ? `url(${ART(art)})` : 'none';
    ambient.start(map.theme);
  }

  /** Remove every piece and block (a new match). */
  function reset() {
    for (const el of pieceEls.values()) el.remove();
    pieceEls.clear();
    for (const el of blockEls.values()) el.remove();
    blockEls.clear();
    effects.clear();
  }

  function render(game: State, view: BoardView) {
    setMap(game.map);
    const { acts, live, armed, threats } = view;
    const moveActs = live ? acts.filter((action) => action.type === 'move' && action.unitId === live.id) : [];
    const options = live ? moveOptions(game, live) : [];
    const skillActs =
      live && armed ? acts.filter((action) => action.type === 'skill' && action.unitId === live.id) : [];
    const skillKey = live && live.kind === 'hero' ? HEROES[live.hero].skill.key : '';
    const iceActs = game.phase === 'ice' ? acts.filter((action) => action.type === 'ice') : [];
    const pending = game.phase === 'react' ? game.pending!.action! : null; // the action a reaction may negate
    const pendingActor = pending ? game.units[pending.unitId!] : null;
    const pendingTo = pending
      ? pending.to || (pending.targetId ? game.units[pending.targetId]?.pos : null) || null
      : null;
    let zone = skillZone(game, live, armed, view.ownReach ?? true);
    // A skill aimed at squares (Aqna's ice, the summon): tint only the squares it can really take now,
    // never ones hidden, held by an ally, under terrain, out of strike range or too dear.
    const castSquares = [...skillActs, ...iceActs]
      .filter((action) => action.to)
      .map((action) => `${action.to!.r},${action.to!.c}`);
    if (zone && castSquares.length) {
      const open = new Set(castSquares);
      zone = {
        ...zone,
        cells: new Set([...zone.cells].filter((square) => open.has(square))),
        inner: new Set([...zone.inner].filter((square) => open.has(square))),
      };
    }
    const lastAction = game.lastAction;
    const movers = new Set(acts.filter((action) => action.type === 'move').map((action) => action.unitId));
    for (const cell of cells) {
      const pos = posOf(cell);
      const legalMove = moveActs.find((action) => samePos(action.to!, pos));
      const option = legalMove && options.find((candidate) => samePos(candidate.to, pos));
      const isTarget = skillActs.some((action) => samePos(action.to || game.units[action.targetId!].pos, pos));
      const inZone = !!zone && zone.cells.has(`${pos.r},${pos.c}`);
      cell.classList.toggle('sel', !!live && samePos(live.pos, pos));
      const attack = !!option && (option.kills.length > 0 || !!option.breaks?.length); // a kill, or a blow on a shield
      cell.classList.toggle('move', !!option && !option.backstab && !attack);
      cell.classList.toggle('capture', attack);
      cell.classList.toggle('stab', !!option && !!option.backstab);
      cell.classList.toggle('target', isTarget);
      cell.classList.toggle('grave', isTarget && skillKey === 'grave');
      cell.classList.toggle('root', isTarget && skillKey === 'root');
      cell.classList.toggle(
        'icespot',
        iceActs.some((action) => samePos(action.to!, pos)),
      );
      cell.classList.toggle('range', inZone);
      if (inZone) cell.dataset.zone = zone!.inner.has(`${pos.r},${pos.c}`) ? `${zone!.key}-inner` : zone!.key;
      else delete cell.dataset.zone;
      cell.classList.toggle('pending', !!pendingActor && samePos(pendingActor.pos, pos));
      cell.classList.toggle('pending-to', !!pendingTo && samePos(pendingTo, pos));
      cell.classList.toggle(
        'last',
        !!lastAction && [lastAction.from, lastAction.to].some((square) => square && samePos(square, pos)),
      );
      cell.classList.remove('hit');
      const unit = unitAt(game, pos);
      const block = blockAt(game, pos);
      cell.classList.toggle('grab', !!onPress && !!unit && movers.has(unit.id));
      cell.setAttribute(
        'aria-label',
        `${squareName(pos)}${unit ? `, ${label(unit)}` : block ? `, ${block.kind}` : ''}`,
      );
    }
    for (const hit of view.hits || []) {
      if (hit.r < 0 || hit.r > 7 || hit.c < 0 || hit.c > 7) continue;
      const cell = cellAt(hit);
      void cell.offsetWidth; // restart the CSS animation
      cell.classList.add('hit');
    }
    renderTerrain(game);
    renderPieces(game, live, threats, view.deathDelay || 0);
    renderMarks(game, pendingActor, pendingTo, pending);
  }

  /**
   * Marks drawn above the pieces: while an interrupt is being decided, an arrow from the
   * acting unit to its destination and a pulsing reticle on any unit it would eliminate.
   */
  function renderMarks(game: State, actor: Unit | null, to: Pos | null, pending: Action | null) {
    const signature = actor && to ? `${actor.id}>${to.r},${to.c}` : '';
    if (marksEl.dataset.k === signature) return;
    marksEl.dataset.k = signature;
    if (!actor || !to || !pending) {
      marksEl.innerHTML = '';
      return;
    }
    const centerOf = (pos: Pos) => {
      const shown = toDisplay(pos);
      return { x: shown.c * 100 + 50, y: shown.r * 100 + 50 };
    };
    const from = centerOf(actor.pos);
    const dest = centerOf(to);
    const length = Math.hypot(dest.x - from.x, dest.y - from.y) || 1;
    const ux = (dest.x - from.x) / length;
    const uy = (dest.y - from.y) / length;
    const [startX, startY, endX, endY] = [from.x + ux * 38, from.y + uy * 38, dest.x - ux * 46, dest.y - uy * 46];
    const option =
      pending.type === 'move' ? moveOptions(game, actor).find((candidate) => samePos(candidate.to, to)) : null;
    const victimIds = option
      ? [...option.kills, ...(option.breaks || [])]
      : pending.type === 'skill' && pending.targetId
        ? [pending.targetId]
        : [];
    const victims = victimIds.map((id) => game.units[id]).filter(Boolean);
    const hostile = option ? victimIds.length > 0 : pending.type === 'skill';
    const color = hostile ? '#ff5a3c' : '#6fcf55';
    const reticle = (pos: Pos) => {
      const c = centerOf(pos);
      return `<g class="reticle" style="transform-origin:${c.x}px ${c.y}px">
        <circle cx="${c.x}" cy="${c.y}" r="44" fill="rgba(255,90,60,.16)" stroke="${color}" stroke-width="5" stroke-dasharray="14 10"/>
        <path d="M${c.x - 50} ${c.y}h16M${c.x + 34} ${c.y}h16M${c.x} ${c.y - 50}v16M${c.x} ${c.y + 34}v16" stroke="${color}" stroke-width="6" stroke-linecap="round"/></g>`;
    };
    const actorSquare = toDisplay(actor.pos);
    marksEl.innerHTML = `<defs><marker id="mk-arrow" viewBox="0 0 10 10" refX="5" refY="5" markerWidth="4" markerHeight="4" orient="auto-start-reverse">
        <path d="M0 0 L10 5 L0 10 z" fill="${color}"/></marker></defs>
      <rect x="${actorSquare.c * 100 + 4}" y="${actorSquare.r * 100 + 4}" width="92" height="92" rx="14" fill="none" stroke="${color}" stroke-width="5" class="actor-box"/>
      <line x1="${startX}" y1="${startY}" x2="${endX}" y2="${endY}" stroke="${color}" stroke-width="9" stroke-linecap="round" marker-end="url(#mk-arrow)" class="flow" />
      ${victims.length ? victims.map((victim) => reticle(victim.pos)).join('') : `<circle cx="${dest.x}" cy="${dest.y}" r="30" fill="none" stroke="${color}" stroke-width="5" stroke-dasharray="10 8" class="spin"/>`}`;
  }

  function renderTerrain(game: State) {
    const present = new Set<string>();
    for (const [squareKey, block] of Object.entries(game.blocks)) {
      present.add(squareKey);
      let el = blockEls.get(squareKey);
      if (el && el.dataset.kind !== block.kind) {
        el.remove();
        el = undefined;
      }
      if (el) continue;
      const [r, c] = squareKey.split(',').map(Number);
      el = document.createElement('div');
      el.className = `block ${block.kind}`;
      el.dataset.kind = block.kind;
      const shown = toDisplay({ r, c });
      el.style.transform = `translate(${shown.c * 100}%, ${shown.r * 100}%)`;
      el.innerHTML = TERRAIN_SVG[block.kind] || TERRAIN_SVG.rock;
      if (block.kind === 'ice' && game.lastAction?.kind === 'ice') el.classList.add('grow');
      terrainEl.appendChild(el);
      blockEls.set(squareKey, el);
    }
    for (const [squareKey, el] of blockEls) {
      if (present.has(squareKey)) continue;
      el.remove();
      blockEls.delete(squareKey);
    }
  }

  function renderPieces(game: State, selected: Unit | null, threats: Set<string>, deathDelay: number) {
    for (const unit of Object.values(game.units)) {
      let el = pieceEls.get(unit.id);
      if (!unit.alive) {
        if (el && !el.dataset.dying) fadeOut(unit.id, el, deathDelay);
        continue;
      }
      if (el && el.dataset.dying) {
        // summoned back
        el.remove();
        pieceEls.delete(unit.id);
        el = undefined;
      }
      if (!el) {
        el = createPiece(unit);
        piecesEl.appendChild(el);
        pieceEls.set(unit.id, el);
      }
      const shown = toDisplay(unit.pos);
      el.style.transform = `translate(${shown.c * 100}%, ${shown.r * 100}%)`;
      el.classList.toggle('warded', unit.warded);
      el.classList.toggle('rooted', unit.rooted > 0);
      el.classList.toggle('selected', !!selected && selected.id === unit.id);
      let badge = el.querySelector('.threat');
      if (threats.has(unit.id)) {
        if (!badge) {
          badge = document.createElement('div');
          badge.className = 'threat';
          badge.textContent = '!';
          (badge as HTMLElement).title = 'Can be eliminated next enemy turn';
          el.appendChild(badge);
        }
      } else if (badge) badge.remove();
    }
  }
  function createPiece(unit: Unit) {
    const el = document.createElement('div');
    el.className = `piece ${unit.team} ${unit.kind}`;
    const name = heroDef(unit).name;
    if (unit.kind === 'beast')
      el.innerHTML = `<div class="token" style="color:${unit.team === 'p1' ? '#5a3a1a' : '#f3d9a8'}">${BEAST_SVG}</div><span class="tag">${name}</span>`;
    else if (unit.kind === 'creep') el.innerHTML = `<div class="token">${CREEP_SVG}</div>`;
    else
      el.innerHTML = `<div class="token"><img src="${ICON(unit.hero)}" alt=""></div><span class="tag">${name}</span>${
        isCommander(unit)
          ? `<span class="cmd-mark" title="Commander: if it falls, its side loses">${COMMANDER_SVG}</span>`
          : ''
      }`;
    return el;
  }
  function fadeOut(unitId: string, el: HTMLElement, delayMs: number) {
    el.dataset.dying = '1';
    setTimeout(() => {
      el.classList.add('dying');
      setTimeout(() => {
        el.remove();
        if (pieceEls.get(unitId) === el) pieceEls.delete(unitId);
      }, 220);
    }, delayMs);
  }

  /** A little jump, for pieces that leap rather than slide. */
  function hop(unitId: string) {
    const el = pieceEls.get(unitId);
    if (!el) return;
    el.classList.remove('hop');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('hop');
  }

  /**
   * A move into a shielded unit: the attacker lunges, the shield flares, the attacker is knocked
   * back to its square. Nothing changes in the game. `lunge` false when the piece was dragged there
   * (it glides back by itself).
   */
  function shieldBounce({
    attackerId,
    from,
    targetId,
    to,
    lunge = true,
  }: {
    attackerId: string;
    from: Pos;
    targetId: string;
    to: Pos;
    lunge?: boolean;
  }) {
    const attacker = pieceEls.get(attackerId);
    const target = pieceEls.get(targetId);
    const impactMs = lunge ? lungeBack(attacker, toDisplay(from), toDisplay(to)) || 0 : 0;
    setTimeout(() => {
      effects.shieldHit(to, from);
      if (!target) return;
      target.classList.remove('ward-hit');
      void target.offsetWidth; // restart the CSS animation
      target.classList.add('ward-hit');
    }, impactMs);
  }
  /** A rooted unit tries to move: it strains toward the square and the roots drag it back. */
  function rootTug({ unitId, from, to, lunge = true }: { unitId: string; from: Pos; to: Pos; lunge?: boolean }) {
    const impactMs = lunge
      ? lungeBack(pieceEls.get(unitId), toDisplay(from), toDisplay(to), {
          reach: 0.55,
          duration: 760,
          hold: 0.32,
          back: 0.12,
        })
      : 0;
    effects.rootTug(from, to, { impactMs });
  }

  function destroy() {
    drag = null;
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    ambient.stop();
    effects.destroy();
    host.innerHTML = '';
  }

  return {
    render,
    reset,
    hop,
    destroy,
    shieldBounce,
    rootTug,
    popText: effects.popText,
    plan: (before: State, after: State): EffectPlan => effects.plan(before, after),
    run: (planned: EffectPlan) => effects.run(planned),
    intro: (game: State) => effects.intro(game),
    victory: (game: State, winner: Team) => effects.victory(game, winner),
    clearFx: effects.clear,
  };
}
export type Board = ReturnType<typeof createBoard>;
