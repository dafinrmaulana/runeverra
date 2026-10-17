// Ambient particles drifting over the board (sand, motes, leaves, snow), one style per map theme.
// Cosmetic only: uses Math.random freely and never touches the game.

type AmbientStyle = {
  count: number;
  color: [number, number, number];
  speedX: [number, number]; // px per frame at 60 fps, min..max
  speedY: [number, number];
  size: [number, number];
  shape: 'dot' | 'mote' | 'leaf';
};
type Mote = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  rotation: number;
  alpha: number;
  phase: number;
};

/** Map theme -> its particles. Themes missing here (field) stay still. */
const STYLES: Record<string, AmbientStyle> = {
  desert: {
    count: 26,
    color: [250, 232, 190],
    speedX: [0.5, 1.4],
    speedY: [-0.1, 0.15],
    size: [0.8, 1.8],
    shape: 'dot',
  },
  savanna: {
    count: 16,
    color: [255, 220, 150],
    speedX: [0.25, 0.7],
    speedY: [-0.25, 0.05],
    size: [1, 2.2],
    shape: 'mote',
  },
  jungle: { count: 12, color: [150, 210, 110], speedX: [-0.25, 0.25], speedY: [0.3, 0.7], size: [3, 5], shape: 'leaf' },
  winter: { count: 40, color: [255, 255, 255], speedX: [-0.3, 0.3], speedY: [0.35, 0.9], size: [1, 2.4], shape: 'dot' },
};

const between = ([min, max]: [number, number]) => min + Math.random() * (max - min);

export function createAmbient(canvas: HTMLCanvasElement) {
  const ctx = canvas.getContext('2d')!;
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  let theme: string | null = null;
  let motes: Mote[] = [];
  let frameId = 0;
  let width = 0;
  let height = 0;
  let pixelRatio = 1;
  let lastFrame = 0;

  function resize() {
    const rect = canvas.getBoundingClientRect();
    pixelRatio = Math.min(devicePixelRatio || 1, 2);
    width = rect.width;
    height = rect.height;
    canvas.width = Math.round(width * pixelRatio);
    canvas.height = Math.round(height * pixelRatio);
  }

  /** A new particle: anywhere on the board at start, otherwise entering from the edge it drifts away from. */
  function spawn(style: AmbientStyle, anywhere: boolean): Mote {
    const fromLeft = style.speedX[0] > 0;
    const fromTop = style.speedY[0] > 0;
    return {
      x: anywhere ? between([0, width]) : fromLeft ? -5 : between([0, width]),
      y: anywhere ? between([0, height]) : fromTop ? -5 : between([0, height]),
      vx: between(style.speedX),
      vy: between(style.speedY),
      size: between(style.size),
      rotation: between([0, 6]),
      alpha: between([0.35, 0.85]),
      phase: between([0, 6]),
    };
  }

  function start(mapTheme: string) {
    stop();
    theme = mapTheme;
    const style = STYLES[mapTheme];
    if (!style || reduceMotion) return;
    resize();
    motes = Array.from({ length: style.count }, () => spawn(style, true));
    lastFrame = performance.now();
    frameId = requestAnimationFrame(frame);
  }

  function stop() {
    if (frameId) cancelAnimationFrame(frameId);
    frameId = 0;
    motes = [];
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  function frame(now: number) {
    const style = theme ? STYLES[theme] : undefined;
    if (!style) return;
    const frames = Math.min(3, (now - lastFrame) / 16.7); // elapsed time in 60 fps frames
    lastFrame = now;
    if (document.hidden) {
      frameId = requestAnimationFrame(frame);
      return;
    }
    if (Math.abs(canvas.width - Math.round(canvas.getBoundingClientRect().width * pixelRatio)) > 1) resize();
    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const [red, green, blue] = style.color;
    for (const mote of motes) {
      mote.phase += 0.03 * frames;
      const sway = style.shape === 'leaf' ? Math.sin(mote.phase) * 0.5 : 0;
      mote.x += (mote.vx + sway) * frames;
      mote.y += mote.vy * frames;
      mote.rotation += 0.02 * frames;
      if (mote.x > width + 8 || mote.x < -8 || mote.y > height + 8 || mote.y < -8)
        Object.assign(mote, spawn(style, false));
      ctx.fillStyle = `rgba(${red},${green},${blue},${mote.alpha})`;
      if (style.shape === 'leaf') {
        ctx.save();
        ctx.translate(mote.x, mote.y);
        ctx.rotate(mote.rotation);
        ctx.beginPath();
        ctx.ellipse(0, 0, mote.size, mote.size * 0.45, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (style.shape === 'mote') {
        ctx.globalAlpha = 0.6 + 0.4 * Math.sin(mote.phase * 2); // twinkle
        ctx.beginPath();
        ctx.arc(mote.x, mote.y, mote.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      } else {
        ctx.beginPath();
        ctx.arc(mote.x, mote.y, mote.size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    frameId = requestAnimationFrame(frame);
  }

  return { start, stop };
}
