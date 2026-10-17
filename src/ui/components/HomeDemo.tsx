// A short curated match that plays itself on the real board, with the same effects as a live game.
// Quiet moves are fast-forwarded, skills and takedowns get their moment, and a caption names them.
// It pauses off-screen and in a hidden tab, and is replaced by a still picture under reduced motion.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createMatch, applyAction, TEAM_NAMES } from '../../engine/index.ts';
import { DEMO_MATCH } from '../../demo-match.ts';
import { createBoard, type BoardView } from '../game/board.ts';
import type { State } from '../../engine/index.ts';

const CAPTION: Record<string, string> = {
  capture: 'Takedown',
  storm: 'Storm Hammer',
  grave: 'Empty Grave',
  summon: 'The beast awakens',
  ice: 'Icy Step',
  root: 'Aggressive Root',
  interrupt: 'Interrupted!',
  backstab: 'Backstab',
};
const QUIET_MS = 330,
  SHOW_MS = 1500,
  END_HOLD_MS = 3200,
  START_HOLD_MS = 900;
const EMPTY: BoardView = { acts: [], live: null, armed: false, threats: new Set<string>() };

function buildStates() {
  const states: State[] = [createMatch(DEMO_MATCH.setup)];
  for (const a of DEMO_MATCH.trail) states.push(applyAction(states[states.length - 1], a).state);
  return states;
}

export const reducedMotion = () =>
  typeof window !== 'undefined' && !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

export function HomeDemo() {
  const states = useMemo(buildStates, []);
  const host = useRef<HTMLDivElement>(null);
  const [caption, setCaption] = useState('');
  const [winner, setWinner] = useState('');

  useEffect(() => {
    if (!host.current || reducedMotion()) return;
    const el = host.current;
    const board = createBoard(el, { onCell: () => {}, flip: false, facing: false });
    let i = 0,
      timer: ReturnType<typeof setTimeout> | null = null,
      visible = true;
    const tabVisible = () => document.visibilityState === 'visible';

    const draw = (index: number) => {
      const before = states[index - 1],
        after = states[index];
      const plan = board.plan(before, after);
      const hits = after.lastAction && after.lastAction !== before.lastAction ? after.lastAction.hits || [] : [];
      board.render(after, { ...EMPTY, deathDelay: plan.deathDelay, hits });
      if (plan.hop) board.hop(plan.hop);
      board.run(plan);
      if (after.status !== 'playing') board.victory(after, after.status);
    };
    const restart = () => {
      i = 0;
      setCaption('');
      setWinner('');
      board.clearFx();
      board.reset();
      board.render(states[0], EMPTY);
    };
    const step = () => {
      timer = null;
      if (!visible || !tabVisible()) return; // resumed by the observers below
      if (i >= states.length - 1) {
        restart();
        timer = setTimeout(step, START_HOLD_MS);
        return;
      }
      i++;
      draw(i);
      const kind = states[i].lastAction?.kind as string | undefined;
      const text = kind && CAPTION[kind] ? CAPTION[kind] : '';
      setCaption(text);
      const over = states[i].status !== 'playing';
      if (over) setWinner(`${TEAM_NAMES[states[i].status as 'p1' | 'p2']} wins`);
      timer = setTimeout(step, over ? END_HOLD_MS : text ? SHOW_MS : QUIET_MS);
    };
    const resume = () => {
      if (!timer && visible && tabVisible()) timer = setTimeout(step, 250);
    };

    restart();
    timer = setTimeout(step, START_HOLD_MS);
    const io = new IntersectionObserver(
      (es) => {
        visible = es[0].isIntersecting;
        if (visible) resume();
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    document.addEventListener('visibilitychange', resume);
    return () => {
      if (timer) clearTimeout(timer);
      io.disconnect();
      document.removeEventListener('visibilitychange', resume);
      board.destroy();
    };
  }, [states]);

  if (reducedMotion()) return null;
  return (
    <div className="home-demo" aria-hidden="true">
      <div className="board-host-wrap">
        <div className="board-host" ref={host} />
      </div>
      <div className={`demo-caption${caption ? ' on' : ''}${winner ? ' win' : ''}`} key={`${caption}-${winner}`}>
        {winner || caption}
      </div>
    </div>
  );
}
