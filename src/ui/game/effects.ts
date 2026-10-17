// Action effects drawn on a canvas over the board: bursts, rings, lines, flashes, lightning and
// floating text. Cosmetic only: it reads game states, never changes them, and uses Math.random freely.
//
// What plays when:
//   SKILL_FX[lastAction.kind]  the effect for a skill or capture (keyed like the engine's lastAction.kind)
//   HERO_FX[hero id]           per-hero flourishes: death particles, capture strike, move touch
// A new hero with a new skill adds one entry to each (see docs/heroes.md).
import { CREEPS, MAPS, bountyFor, heroDef, livingHeroes } from '../../engine/index.ts';
import type { LastAction, Pos, State, Team, Unit } from '../../engine/index.ts';
import { tk } from '../data';
import { lungeBack } from './motion';

export const COLORS = {
  p1: '#f3ead2',
  p2: '#ff6a45',
  spirit: '#a996ff',
  spirit2: '#5f7dff',
  frost: '#c4e6fa',
  brass: '#f0bf5e',
  blood: '#ff5a3c',
  dust: '#c9b28a',
  sand: '#e7c27d',
  vine: '#6fcf55',
  leaf: '#3f9a3a',
  steel: '#d7e3f0',
  bolt: '#cfe6ff',
  white: '#ffffff',
  mane: '#e0a050',
};

type ParticleShape = 'dot' | 'shard' | 'spark' | 'leaf' | 'crystal' | 'smoke' | 'wisp';
type Range = [number, number];
type BurstOptions = {
  shape?: ParticleShape;
  direction?: number; // radians; omit to scatter all around
  spread?: number; // radians either side of `direction`
  minSpeed?: number;
  maxSpeed?: number; // in 1/16ths of a square per frame
  life?: Range; // ms
  size?: Range; // in 1/60ths of a square
  gravity?: number;
  drag?: number;
  rise?: number;
};
type RingOptions = { from?: number; to?: number; width?: number; life?: number; dots?: string }; // radii in squares
type LineOptions = { life?: number; width?: number; arc?: number; wave?: number; grow?: number };

type Point = { x: number; y: number };
type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  gravity: number;
  drag: number;
  life: number;
  maxLife: number;
  size: number;
  color: string;
  shape: ParticleShape;
  rotation: number;
  spin: number;
  rise: number;
};
type Ring = {
  center: Point;
  color: string;
  startRadius: number;
  endRadius: number;
  width: number;
  age: number;
  life: number;
  dots?: string;
};
type Line = {
  a: Point;
  b: Point;
  color: string;
  age: number;
  life: number;
  width: number;
  arc: number;
  wave: number;
  grow: number;
};
type Flash = { center: Point; color: string; radius: number; age: number; life: number };
type Bolt = { points: Point[]; color: string; age: number; life: number };
type FloatingText = { center: Point; text: string; color: string; age: number; life: number };

/** What createEffects needs from the board: piece elements, and the display flip for the viewer's side. */
export type EffectsView = { pieceEl: (unitId: string) => HTMLElement | undefined; toDisplay: (pos: Pos) => Pos };
/** Decided before the board renders, so pieces wait for the effect: when victims vanish, and who hops. */
export type EffectPlan = {
  before: State;
  after: State;
  lastAction: LastAction | null;
  deathDelay: number;
  hop: string | null;
};

export function createEffects(canvas: HTMLCanvasElement, wrap: HTMLElement, view: EffectsView) {
  const ctx = canvas.getContext('2d')!;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let frameId = 0;
  let lastFrame = 0;
  let particles: Particle[] = [];
  let rings: Ring[] = [];
  let lines: Line[] = [];
  let flashes: Flash[] = [];
  let bolts: Bolt[] = [];
  let texts: FloatingText[] = [];
  let timers: ReturnType<typeof setTimeout>[] = [];

  const between = (min: number, max: number) => min + Math.random() * (max - min);
  /** Run `fn` after `ms`; cancelled by clear(). */
  const after = (ms: number, fn: () => void) => {
    timers.push(setTimeout(fn, ms));
  };
  function resize() {
    const rect = canvas.getBoundingClientRect();
    pixelRatio = Math.min(devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
  }
  /** Canvas pixel at the centre of a board square (fractional squares allowed). */
  const centerOf = (square: Pos): Point => {
    const shown = view.toDisplay(square);
    return { x: ((shown.c + 0.5) * width) / 8, y: ((shown.r + 0.5) * height) / 8 };
  };
  const squareSize = () => width / 8;

  // ---------- primitives ----------
  function burst(pos: Pos, color: string | string[], count: number, options: BurstOptions = {}) {
    const center = centerOf(pos);
    const square = squareSize();
    for (let i = 0; i < count; i++) {
      const angle =
        options.direction != null
          ? options.direction + between(-(options.spread ?? 0), options.spread ?? 0)
          : between(0, Math.PI * 2);
      const speed = (between(options.minSpeed ?? 0.6, options.maxSpeed ?? 2.2) * square) / 16;
      const life = between(options.life?.[0] ?? 380, options.life?.[1] ?? 700);
      particles.push({
        x: center.x + between(-square * 0.12, square * 0.12),
        y: center.y + between(-square * 0.12, square * 0.12),
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        gravity: ((options.gravity ?? 0) * square) / 900,
        drag: options.drag ?? 0.94,
        life,
        maxLife: life,
        size: (between(options.size?.[0] ?? 1.5, options.size?.[1] ?? 3.2) * square) / 60,
        color: Array.isArray(color) ? color[i % color.length] : color,
        shape: options.shape || 'dot',
        rotation: between(0, 6),
        spin: between(-0.25, 0.25),
        rise: options.rise || 0,
      });
    }
    kick();
  }
  function ring(pos: Pos, color: string, options: RingOptions = {}) {
    rings.push({
      center: centerOf(pos),
      color,
      startRadius: (options.from ?? 0.1) * squareSize(),
      endRadius: (options.to ?? 0.8) * squareSize(),
      width: options.width ?? 3,
      age: 0,
      life: options.life ?? 420,
      dots: options.dots,
    });
    kick();
  }
  function flash(pos: Pos, color: string, { size = 1, life = 260 } = {}) {
    flashes.push({ center: centerOf(pos), color, radius: size * squareSize(), age: 0, life });
    kick();
  }
  function line(from: Pos, to: Pos, color: string, options: LineOptions = {}) {
    lines.push({
      a: centerOf(from),
      b: centerOf(to),
      color,
      age: 0,
      life: options.life ?? 360,
      width: options.width ?? 3,
      arc: options.arc ?? 0,
      wave: options.wave ?? 0,
      grow: options.grow ?? 3,
    });
    kick();
  }
  function text(pos: Pos, message: string, color: string) {
    texts.push({ center: centerOf(pos), text: message, color, age: 0, life: 900 });
    kick();
  }
  function shake(strength = 1) {
    if (reduceMotion || !wrap.animate) return;
    const d = 4 * strength;
    wrap.animate(
      [
        { transform: 'translate(0,0)' },
        { transform: `translate(${-d}px,${d / 2}px)` },
        { transform: `translate(${d}px,${-d / 2}px)` },
        { transform: `translate(${-d / 2}px,0)` },
        { transform: 'translate(0,0)' },
      ],
      { duration: 260, easing: 'ease-out' },
    );
  }
  function slashes(pos: Pos, color: string, { count = 1, tilt = 1 } = {}) {
    const center = centerOf(pos);
    const half = squareSize() * 0.42;
    for (let i = 0; i < count; i++) {
      const offset = (i - (count - 1) / 2) * squareSize() * 0.2;
      after(i * 50, () => {
        lines.push({
          a: { x: center.x - half + offset, y: center.y - half * tilt },
          b: { x: center.x + half + offset, y: center.y + half * tilt },
          color,
          age: 0,
          life: 300,
          width: 3.2,
          arc: 0,
          wave: 0,
          grow: 5,
        });
        kick();
      });
    }
  }
  function lightning(pos: Pos) {
    const target = centerOf(pos);
    const square = squareSize();
    let x = target.x + between(-square * 0.5, square * 0.5);
    let y = -10;
    const points = [{ x, y }];
    while (y < target.y) {
      y += between(square * 0.3, square * 0.6);
      x += between(-square * 0.35, square * 0.35);
      points.push({ x, y: Math.min(y, target.y) });
    }
    points[points.length - 1] = { x: target.x, y: target.y };
    bolts.push({ points, color: COLORS.bolt, age: 0, life: 340 });
    kick();
  }

  // ---------- drawing ----------
  function frame(now: number) {
    const elapsed = Math.min(48, now - lastFrame);
    lastFrame = now;
    const frames = elapsed / 16.7; // elapsed time in 60 fps frames
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.globalCompositeOperation = 'lighter';
    flashes = flashes.filter((flashEntry) => (flashEntry.age += elapsed) < flashEntry.life);
    for (const flashEntry of flashes) drawFlash(flashEntry);
    rings = rings.filter((ringEntry) => (ringEntry.age += elapsed) < ringEntry.life);
    for (const ringEntry of rings) drawRing(ringEntry);
    lines = lines.filter((lineEntry) => (lineEntry.age += elapsed) < lineEntry.life);
    for (const lineEntry of lines) drawLine(lineEntry);
    bolts = bolts.filter((boltEntry) => {
      boltEntry.age += elapsed;
      drawBolt(boltEntry);
      return boltEntry.age < boltEntry.life;
    });
    particles = particles.filter((particle) => (particle.life -= elapsed) > 0);
    for (const particle of particles) drawParticle(particle, frames);
    ctx.globalCompositeOperation = 'source-over';
    texts = texts.filter((textEntry) => (textEntry.age += elapsed) < textEntry.life);
    for (const textEntry of texts) drawText(textEntry);
    if (particles.length || rings.length || lines.length || flashes.length || bolts.length || texts.length) {
      frameId = requestAnimationFrame(frame);
    } else {
      frameId = 0;
      ctx.clearRect(0, 0, width, height);
    }
  }
  function drawFlash(flashEntry: Flash) {
    const fade = 1 - flashEntry.age / flashEntry.life;
    const gradient = ctx.createRadialGradient(
      flashEntry.center.x,
      flashEntry.center.y,
      0,
      flashEntry.center.x,
      flashEntry.center.y,
      flashEntry.radius,
    );
    gradient.addColorStop(0, rgba(flashEntry.color, 0.75 * fade));
    gradient.addColorStop(1, rgba(flashEntry.color, 0));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(flashEntry.center.x, flashEntry.center.y, flashEntry.radius, 0, Math.PI * 2);
    ctx.fill();
  }
  function drawRing(ringEntry: Ring) {
    const progress = 1 - Math.pow(1 - ringEntry.age / ringEntry.life, 3); // ease-out
    const radius = ringEntry.startRadius + (ringEntry.endRadius - ringEntry.startRadius) * progress;
    ctx.strokeStyle = rgba(ringEntry.color, 1 - progress);
    ctx.lineWidth = ringEntry.width * (1 - progress * 0.6);
    ctx.beginPath();
    ctx.arc(ringEntry.center.x, ringEntry.center.y, Math.max(0, radius), 0, Math.PI * 2);
    ctx.stroke();
    if (!ringEntry.dots) return;
    ctx.fillStyle = rgba(ringEntry.dots, 1 - progress);
    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5 + progress;
      ctx.beginPath();
      ctx.arc(
        ringEntry.center.x + Math.cos(angle) * radius,
        ringEntry.center.y + Math.sin(angle) * radius,
        2.2,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
  }
  function drawLine(lineEntry: Line) {
    const progress = lineEntry.age / lineEntry.life;
    const drawn = Math.min(1, progress * lineEntry.grow); // how much of the line has extended so far
    ctx.strokeStyle = rgba(lineEntry.color, 1 - progress);
    ctx.lineWidth = lineEntry.width * (1 - progress * 0.5);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(lineEntry.a.x, lineEntry.a.y);
    if (lineEntry.wave) {
      const dx = lineEntry.b.x - lineEntry.a.x;
      const dy = lineEntry.b.y - lineEntry.a.y;
      const length = Math.hypot(dx, dy) || 1;
      const normalX = -dy / length;
      const normalY = dx / length;
      for (let i = 1; i <= 24; i++) {
        const t = (i / 24) * drawn;
        const offset =
          Math.sin(t * Math.PI * 4 + lineEntry.age / 60) * lineEntry.wave * squareSize() * Math.sin(t * Math.PI);
        ctx.lineTo(lineEntry.a.x + dx * t + normalX * offset, lineEntry.a.y + dy * t + normalY * offset);
      }
    } else {
      const endX = lineEntry.a.x + (lineEntry.b.x - lineEntry.a.x) * drawn;
      const endY = lineEntry.a.y + (lineEntry.b.y - lineEntry.a.y) * drawn;
      if (lineEntry.arc)
        ctx.quadraticCurveTo(
          (lineEntry.a.x + endX) / 2,
          (lineEntry.a.y + endY) / 2 - lineEntry.arc * squareSize(),
          endX,
          endY,
        );
      else ctx.lineTo(endX, endY);
    }
    ctx.stroke();
  }
  function drawBolt(boltEntry: Bolt) {
    const fade = 1 - boltEntry.age / boltEntry.life;
    const strokes: [number, string][] = [
      [8, rgba('#6fa8ff', fade * 0.5)],
      [2.6, rgba(boltEntry.color, fade)],
    ]; // glow, then core
    for (const [lineWidth, color] of strokes) {
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineJoin = 'round';
      ctx.beginPath();
      boltEntry.points.forEach((point, index) => (index ? ctx.lineTo(point.x, point.y) : ctx.moveTo(point.x, point.y)));
      ctx.stroke();
    }
  }
  function drawParticle(particle: Particle, frames: number) {
    particle.vx *= Math.pow(particle.drag, frames);
    particle.vy = particle.vy * Math.pow(particle.drag, frames) + particle.gravity * frames - particle.rise * frames;
    particle.x += particle.vx * frames;
    particle.y += particle.vy * frames;
    particle.rotation += particle.spin * frames;
    const fade = particle.life / particle.maxLife;
    ctx.fillStyle = rgba(particle.color, fade);
    ctx.strokeStyle = rgba(particle.color, fade);
    if (particle.shape === 'shard') {
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.beginPath();
      ctx.moveTo(0, -particle.size * 1.6);
      ctx.lineTo(particle.size, particle.size);
      ctx.lineTo(-particle.size, particle.size * 0.8);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    } else if (particle.shape === 'spark') {
      ctx.lineWidth = particle.size * 0.7;
      ctx.beginPath();
      ctx.moveTo(particle.x, particle.y);
      ctx.lineTo(particle.x - particle.vx * 3, particle.y - particle.vy * 3);
      ctx.stroke();
    } else if (particle.shape === 'leaf') {
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.beginPath();
      ctx.ellipse(0, 0, particle.size * 1.8, particle.size * 0.8, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (particle.shape === 'crystal') {
      ctx.save();
      ctx.translate(particle.x, particle.y);
      ctx.rotate(particle.rotation);
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const angle = (i * Math.PI) / 3;
        ctx.moveTo(-Math.cos(angle) * particle.size * 1.5, -Math.sin(angle) * particle.size * 1.5);
        ctx.lineTo(Math.cos(angle) * particle.size * 1.5, Math.sin(angle) * particle.size * 1.5);
      }
      ctx.stroke();
      ctx.restore();
    } else if (particle.shape === 'smoke' || particle.shape === 'wisp') {
      const radius = particle.size * (2.5 - fade * 1.2);
      const gradient = ctx.createRadialGradient(particle.x, particle.y, 0, particle.x, particle.y, radius);
      gradient.addColorStop(0, rgba(particle.color, fade * (particle.shape === 'wisp' ? 0.6 : 0.35)));
      gradient.addColorStop(1, rgba(particle.color, 0));
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, radius, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, particle.size, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  function drawText(textEntry: FloatingText) {
    const progress = textEntry.age / textEntry.life;
    const fade = progress < 0.7 ? 1 : 1 - (progress - 0.7) / 0.3;
    const scale = 0.8 + Math.min(1, progress * 5) * 0.25;
    ctx.save();
    ctx.translate(textEntry.center.x, textEntry.center.y - progress * squareSize() * 0.5); // floats up
    ctx.scale(scale, scale);
    ctx.font = `700 ${Math.round(squareSize() * 0.3)}px "IBM Plex Mono", ui-monospace, monospace`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = `rgba(10,12,16,${fade})`;
    ctx.strokeText(textEntry.text, 0, 0);
    ctx.fillStyle = rgba(textEntry.color, fade);
    ctx.fillText(textEntry.text, 0, 0);
    ctx.restore();
  }
  function kick() {
    if (frameId) return;
    lastFrame = performance.now();
    frameId = requestAnimationFrame(frame);
  }

  // ---------- per hero ----------
  /** The burst every eliminated unit gets, plus its hero's own `death` flourish. */
  function eliminated(unit: Unit, big: boolean) {
    flash(unit.pos, COLORS.blood, { size: 1.1, life: 300 });
    ring(unit.pos, COLORS.blood, { to: 1.1, width: 4, life: 460 });
    const team = COLORS[unit.team];
    burst(unit.pos, [team, team, COLORS.blood], 24, {
      shape: 'shard',
      minSpeed: 1,
      maxSpeed: 2.8,
      gravity: 0.9,
      drag: 0.93,
      life: [450, 800],
      size: [2, 4.5],
    });
    HERO_FX[unit.hero]?.death?.(unit.pos);
    shake(big ? 1.6 : 1.1);
  }

  type HeroFx = {
    /** Extra particles when it falls. */
    death?: (pos: Pos) => void;
    /** Its strike when it captures (default: a team-coloured line). */
    capture?: (lastAction: LastAction, square: Pos) => void;
    /** A touch on plain moves. */
    move?: (lastAction: LastAction) => void;
  };
  // Keyed by hero id (a beast's is 'beast').
  const HERO_FX: Record<string, HeroFx> = {
    plantae: {
      death: (pos) =>
        burst(pos, [COLORS.leaf, COLORS.vine], 14, {
          shape: 'leaf',
          minSpeed: 0.8,
          maxSpeed: 2.4,
          gravity: 0.4,
          life: [600, 1000],
          size: [2, 3.4],
        }),
    },
    aqna: {
      death: (pos) =>
        burst(pos, COLORS.frost, 12, { shape: 'crystal', minSpeed: 1, maxSpeed: 3, life: [500, 800], size: [2, 3.5] }),
      capture: (lastAction, square) => {
        line(lastAction.from!, lastAction.to!, COLORS.frost, { life: 320, width: 2.5 });
        after(220, () =>
          burst(square, COLORS.frost, 14, {
            shape: 'crystal',
            minSpeed: 1.5,
            maxSpeed: 3.5,
            life: [400, 700],
            size: [2, 4],
          }),
        );
      },
    },
    magumba: {
      death: (pos) =>
        burst(pos, [COLORS.spirit, COLORS.spirit2], 10, {
          shape: 'wisp',
          minSpeed: 0.1,
          maxSpeed: 0.5,
          rise: 0.06,
          life: [700, 1100],
          size: [3, 5],
        }),
    },
    beast: {
      capture: (_lastAction, square) =>
        after(160, () => {
          slashes(square, '#ffd6a0', { count: 3, tilt: 1.2 });
          burst(square, COLORS.dust, 10, {
            shape: 'smoke',
            minSpeed: 0.4,
            maxSpeed: 1.2,
            life: [300, 500],
            size: [5, 8],
          });
        }),
    },
    hexor: {
      capture: (_lastAction, square) =>
        after(200, () => {
          ring(square, COLORS.steel, { to: 1, width: 4, life: 380 });
          burst(square, COLORS.dust, 10, {
            shape: 'smoke',
            minSpeed: 0.4,
            maxSpeed: 1.4,
            life: [300, 520],
            size: [4, 7],
          });
          shake(0.6);
        }),
    },
    hasim: {
      capture: (_lastAction, square) => after(180, () => slashes(square, COLORS.white)),
    },
    genga: {
      capture: (_lastAction, square) =>
        after(160, () => {
          slashes(square, COLORS.mane, { count: 3, tilt: 1.2 });
          ring(square, COLORS.mane, { to: 0.9, life: 360 });
        }),
      move: (lastAction) => after(80, () => ring(lastAction.to!, COLORS.mane, { to: 0.6, life: 300, width: 2 })),
    },
  };

  // ---------- per action kind ----------
  /** What a SKILL_FX entry gets: the action, who did it, and helpers for its victims. */
  type Scene = {
    lastAction: LastAction;
    actor: Unit | undefined;
    before: State;
    after: State;
    /** The first square hit (a skill's target). */
    target: Pos;
    /** Play every victim's elimination after `delayMs`. */
    eliminateAll: (delayMs: number, big?: boolean) => void;
  };
  // Keyed by the engine's lastAction.kind: 'capture', 'backstab' and each skill's key.
  const SKILL_FX: Record<string, (scene: Scene) => void> = {
    storm({ lastAction, eliminateAll }) {
      const center = lastAction.to!;
      lightning(center);
      flash(center, COLORS.bolt, { size: 1.6, life: 360 });
      ring(center, COLORS.steel, { to: 1.7, width: 5, life: 520 });
      ring(center, COLORS.bolt, { to: 2.2, width: 2, life: 620 });
      shake(1.6);
      for (const push of lastAction.storm || []) {
        const from = centerOf(push.from);
        const to = centerOf(push.to);
        const direction = Math.atan2(to.y - from.y, to.x - from.x);
        burst(push.from, COLORS.dust, 8, {
          shape: 'smoke',
          direction,
          spread: 0.6,
          minSpeed: 0.6,
          maxSpeed: 1.8,
          life: [300, 520],
          size: [4, 7],
        });
        if (push.blocked) text(push.from, 'HELD', COLORS.spirit);
      }
      eliminateAll(420, true);
    },
    interrupt({ lastAction, target }) {
      if (lastAction.toward) {
        const pieceEl = view.pieceEl(lastAction.targetId!);
        const impact = lungeBack(pieceEl, view.toDisplay(target), view.toDisplay(lastAction.toward), {
          reach: 0.6,
          duration: 820,
          hold: 0.34,
          back: 0.12,
        });
        rootTug(target, lastAction.toward, { impactMs: impact, label: '' }); // the INTERRUPTED label below says it
      }
      flash(lastAction.from!, COLORS.vine, { size: 0.9, life: 300 });
      line(lastAction.from!, target, COLORS.vine, { wave: 0.18, life: 640, width: 3.5, grow: 2.5 });
      line(lastAction.from!, target, COLORS.leaf, { wave: -0.14, life: 640, width: 2.5, grow: 2.2 });
      after(260, () => {
        ring(target, COLORS.vine, { from: 0.9, to: 0.35, life: 500, width: 4 });
        burst(target, [COLORS.vine, COLORS.leaf], 18, {
          shape: 'leaf',
          minSpeed: 1,
          maxSpeed: 2.8,
          life: [500, 900],
          size: [2, 3.2],
        });
        text(target, 'INTERRUPTED', COLORS.vine);
        shake(0.6);
      });
    },
    summon({ lastAction }) {
      const to = lastAction.to!;
      line(lastAction.from!, to, COLORS.mane, { arc: 0.3, life: 380, width: 2.5 });
      after(160, () => {
        flash(to, COLORS.mane, { size: 1, life: 320 });
        ring(to, COLORS.mane, { from: 0.2, to: 0.9, life: 520, width: 3 });
        burst(to, [COLORS.mane, COLORS.dust], 14, {
          shape: 'smoke',
          minSpeed: 0.4,
          maxSpeed: 1.4,
          life: [400, 700],
          size: [4, 7],
        });
        text(to, 'SUMMONED', COLORS.mane);
      });
    },
    root({ lastAction, target }) {
      line(lastAction.from!, target, COLORS.vine, { wave: 0.15, life: 540, width: 3, grow: 2.5 });
      after(220, () => {
        ring(target, COLORS.vine, { from: 0.85, to: 0.4, life: 460, width: 3.5 });
        burst(target, [COLORS.vine, COLORS.leaf], 14, {
          shape: 'leaf',
          minSpeed: 0.8,
          maxSpeed: 2.2,
          life: [500, 800],
          size: [2, 3],
        });
        text(target, 'ROOTED', COLORS.vine);
      });
    },
    grave({ lastAction, target }) {
      line(lastAction.from!, target, COLORS.spirit, { arc: 0.4, life: 420, width: 2 });
      after(180, () => {
        ring(target, COLORS.spirit, { from: 0.2, to: 0.75, life: 700, width: 3, dots: '#ff8a3d' });
        ring(target, COLORS.spirit2, { from: 0.9, to: 0.45, life: 700, width: 2 });
        burst(target, [COLORS.spirit, COLORS.spirit2, COLORS.white], 18, {
          shape: 'wisp',
          minSpeed: 0.1,
          maxSpeed: 0.6,
          rise: 0.06,
          drag: 0.97,
          life: [700, 1200],
          size: [3, 6],
        });
      });
    },
    ice({ lastAction }) {
      const to = lastAction.to!;
      burst(to, [COLORS.frost, COLORS.white], 20, {
        shape: 'crystal',
        minSpeed: 2,
        maxSpeed: 4,
        life: [380, 620],
        size: [2.5, 4.5],
      });
      flash(to, COLORS.frost, { size: 0.9, life: 340 });
      ring(to, COLORS.frost, { from: 0.9, to: 0.25, life: 420, width: 3 });
    },
    backstab({ lastAction, eliminateAll }) {
      const from = lastAction.from!;
      const to = lastAction.to!;
      line(from, to, COLORS.sand, { arc: 0.9, life: 420, width: 2.5 });
      burst(from, COLORS.sand, 14, { shape: 'smoke', minSpeed: 0.3, maxSpeed: 1.2, life: [400, 700], size: [5, 8] });
      const jumped = { r: (from.r + to.r) / 2, c: (from.c + to.c) / 2 };
      after(130, () => {
        slashes(jumped, COLORS.white);
        burst(to, COLORS.sand, 16, { shape: 'smoke', minSpeed: 0.3, maxSpeed: 1.4, life: [400, 700], size: [5, 9] });
      });
      eliminateAll(200);
    },
    capture({ lastAction, actor, eliminateAll }) {
      const strike = actor && HERO_FX[actor.hero]?.capture;
      if (strike) strike(lastAction, lastAction.to!);
      else line(lastAction.from!, lastAction.to!, actor ? COLORS[actor.team] : COLORS.white, { life: 280, width: 2.5 });
      eliminateAll(240);
    },
  };

  // ---------- what the board calls ----------
  /** Timing decisions that must be known before render. */
  function plan(before: State, afterState: State): EffectPlan {
    const lastAction = afterState.lastAction;
    const result: EffectPlan = { before, after: afterState, lastAction, deathDelay: 0, hop: null };
    if (reduceMotion || !lastAction || lastAction === before.lastAction) return result;
    const actor = afterState.units[lastAction.unitId!];
    if (lastAction.kind === 'capture') result.deathDelay = 240;
    if (lastAction.kind === 'backstab') {
      result.deathDelay = 200;
      result.hop = actor.id;
    }
    // leapers (Hexor's L) hop over what's in between instead of sliding
    const isStep = lastAction.kind === 'move' || lastAction.kind === 'capture';
    if (actor && isStep && heroDef(actor).move.some((rule) => rule.kind === 'leap')) result.hop = actor.id;
    if (lastAction.kind === 'storm') result.deathDelay = 420;
    if (lastAction.breach) result.deathDelay = 520;
    return result;
  }

  /** Play the effect for what `planned` says just happened. */
  function run(planned: EffectPlan) {
    const { lastAction, before, after: afterState } = planned;
    if (reduceMotion || !lastAction || lastAction === before.lastAction) return;
    resize();
    const actor = afterState.units[lastAction.unitId!] || before.units[lastAction.unitId!];
    const victims = Object.values(before.units).filter(
      (unit) => unit.alive && !afterState.units[unit.id].alive && !(lastAction.breach && unit.id === lastAction.unitId),
    );
    for (const victim of victims) {
      const bounty = actor ? bountyFor(victim, actor.team) : 0;
      if (bounty) after(420, () => text(victim.pos, `+${bounty}`, COLORS.brass));
    }
    const eliminateAll = (delayMs: number, big = false) =>
      after(delayMs, () => victims.forEach((victim) => eliminated(before.units[victim.id], big)));

    const skillEffect = SKILL_FX[lastAction.kind];
    if (skillEffect) {
      skillEffect({ lastAction, actor, before, after: afterState, target: lastAction.hits?.[0], eliminateAll });
      return;
    }
    if (lastAction.breach) {
      const to = lastAction.to!;
      after(300, () => {
        flash(to, COLORS.brass, { size: 1.2, life: 420 });
        ring(to, COLORS.brass, { to: 1.3, width: 4, life: 560 });
        burst(to, [COLORS.brass, COLORS.white], 16, {
          shape: 'spark',
          direction: -Math.PI / 2,
          spread: 1.2,
          minSpeed: 2,
          maxSpeed: 4.5,
          life: [300, 600],
        });
        text(to, `+${tk(CREEPS.breach).toUpperCase()}`, COLORS.brass);
      });
    }
    if (lastAction.kind === 'move') {
      const theme = MAPS[afterState.map].theme;
      const dust = theme === 'winter' ? COLORS.white : theme === 'jungle' ? COLORS.leaf : COLORS.dust;
      const jungle = theme === 'jungle';
      after(260, () =>
        burst(lastAction.to!, dust, 8, {
          shape: jungle ? 'leaf' : 'smoke',
          minSpeed: 0.3,
          maxSpeed: 0.9,
          life: [300, 520],
          size: jungle ? [1.5, 2.5] : [5, 8],
        }),
      );
      if (actor) HERO_FX[actor.hero]?.move?.(lastAction);
    }
  }

  /** Match start: each beast roars onto the board. */
  function intro(game: State) {
    if (reduceMotion || !game) return;
    resize();
    for (const unit of Object.values(game.units)) {
      if (unit.kind !== 'beast') continue;
      view.pieceEl(unit.id)?.classList.add('summon');
      after(300, () => {
        ring(unit.pos, COLORS.mane, { to: 0.9, width: 3, life: 520 });
        burst(unit.pos, [COLORS.mane, COLORS.dust], 14, {
          shape: 'smoke',
          minSpeed: 0.4,
          maxSpeed: 1.4,
          life: [400, 700],
          size: [5, 8],
        });
        text(unit.pos, 'ROAR', '#f2b35e');
      });
    }
  }

  /** Fireworks over the winner's surviving heroes. */
  function victory(game: State, winner: Team) {
    if (reduceMotion) return;
    resize();
    const heroes = livingHeroes(game, winner);
    for (let i = 0; i < 5; i++) {
      after(250 + i * 260, () =>
        heroes.forEach((hero) =>
          burst(hero.pos, [COLORS[winner], COLORS.brass, COLORS.white], 14, {
            shape: 'dot',
            direction: -Math.PI / 2,
            spread: 0.9,
            minSpeed: 2.5,
            maxSpeed: 5.5,
            gravity: 0.6,
            drag: 0.97,
            life: [700, 1200],
            size: [1.4, 2.8],
          }),
        ),
      );
    }
  }

  /** Floating text over a square after `delayMs` (score popups). */
  function popText(pos: Pos, message: string, color: string, delayMs = 0) {
    if (reduceMotion) return;
    after(delayMs, () => {
      resize();
      text(pos, message, color);
    });
  }

  /** Roots burst from the square under `from` and haul back a unit straining toward `to`. */
  function rootTug(from: Pos, to: Pos, { impactMs = 0, label = 'ROOTED' } = {}) {
    if (reduceMotion) return;
    resize();
    const halfway = { r: from.r + (to.r - from.r) * 0.5, c: from.c + (to.c - from.c) * 0.5 };
    after(Math.max(0, impactMs - 120), () => {
      burst(from, [COLORS.leaf, COLORS.vine, COLORS.dust], 12, {
        shape: 'leaf',
        minSpeed: 0.6,
        maxSpeed: 1.8,
        life: [400, 800],
        size: [2, 3],
      });
      line(from, halfway, COLORS.vine, { wave: 0.22, life: 520, width: 4, grow: 3 });
      line(from, halfway, COLORS.leaf, { wave: -0.18, life: 520, width: 2.6, grow: 2.6 });
    });
    after(impactMs + 60, () => {
      ring(from, COLORS.vine, { from: 0.85, to: 0.3, life: 460, width: 4 });
      if (label) text(from, label, COLORS.vine);
      shake(0.4);
    });
  }

  /** An attack meeting Empty Grave: the shield on `pos` flares and throws the attacker back toward `from`. */
  function shieldHit(pos: Pos, from: Pos) {
    if (reduceMotion) return;
    resize();
    const center = centerOf(pos);
    const attacker = centerOf(from);
    const away = Math.atan2(attacker.y - center.y, attacker.x - center.x);
    flash(pos, COLORS.spirit, { size: 1, life: 300 });
    ring(pos, COLORS.spirit, { from: 0.35, to: 1.25, width: 5, life: 560 });
    ring(pos, COLORS.spirit2, { from: 0.25, to: 0.85, width: 2.5, life: 420, dots: COLORS.white });
    burst(pos, [COLORS.spirit, COLORS.white, COLORS.spirit2], 22, {
      shape: 'spark',
      direction: away,
      spread: 0.9,
      minSpeed: 2,
      maxSpeed: 5,
      life: [300, 620],
      size: [1.6, 3],
    });
    burst(pos, [COLORS.spirit, COLORS.spirit2], 10, {
      shape: 'shard',
      minSpeed: 0.8,
      maxSpeed: 2.4,
      life: [380, 700],
      size: [2, 3.6],
    });
    text(pos, 'SHIELDED', '#cdbfff');
    shake(0.7);
  }

  function clear() {
    timers.forEach(clearTimeout);
    timers = [];
    particles = [];
    rings = [];
    lines = [];
    flashes = [];
    bolts = [];
    texts = [];
  }
  const onResize = () => {
    if (frameId) resize();
  };
  window.addEventListener('resize', onResize);
  function destroy() {
    clear();
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    window.removeEventListener('resize', onResize);
  }
  return { plan, run, intro, victory, clear, destroy, shieldHit, rootTug, popText };
}

/** "#rrggbb" plus an alpha, as a canvas colour string. */
function rgba(hex: string, alpha: number) {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${n >> 16},${(n >> 8) & 255},${n & 255},${Math.max(0, Math.min(1, alpha)).toFixed(3)})`;
}
