// Chess.com-style review: step through any finished match, move by move, or play it back.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createMatch, applyAction, TEAM_NAMES as TN } from '../../arena.js';
import { createBoard } from '../game/board.js';
import { listReplays, deleteReplay, type Replay } from '../replays';
import { type Team } from '../data';

const TEAM_NAMES = TN as Record<string, string>;

/** Every position in the match, from the opening setup through the final move. */
function buildStates(replay: Replay) {
  const states: any[] = [createMatch(replay.setup)];
  for (const a of replay.trail) {
    const res = applyAction(states[states.length - 1], a);
    states.push(res.ok ? res.state : states[states.length - 1]); // a saved trail is always legal; stay put if not
  }
  return states;
}

type Move = { team: Team; turn: number; text: string };
/** One entry per ply: whatever the match log said happened on that step. */
function buildMoves(states: any[]): Move[] {
  const moves: Move[] = [];
  for (let i = 1; i < states.length; i++) {
    const added = states[i].log.slice(states[i - 1].log.length);
    if (!added.length) continue;
    moves.push({ team: added[0].team, turn: added[0].turn, text: added.map((l: any) => l.text).join(' ') });
  }
  return moves;
}

function fmtDate(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return (sameDay ? 'Today' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }))
    + ' · ' + d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

function ReplayRow({ r, onPick, onDelete }: { r: Replay; onPick: () => void; onDelete: () => void }) {
  const won = r.winner === r.viewer;
  return (
    <li className="replay-item">
      <button type="button" className="replay-item-main" onClick={onPick}>
        <span className={`replay-result ${won ? 'won' : 'lost'}`}>{won ? 'Won' : 'Lost'}</span>
        <span className="ri-body">
          <b>{r.label}</b>
          <small>{r.trail.length} moves · {fmtDate(r.at)}</small>
        </span>
        <span className="ri-go" aria-hidden="true">›</span>
      </button>
      <button type="button" className="btn ghost tiny ri-del" aria-label="Delete this replay" onClick={onDelete}>✕</button>
    </li>
  );
}

function ReplayList({ onPick }: { onPick: (r: Replay) => void }) {
  const [list, setList] = useState(() => listReplays());
  if (list.length === 0) {
    return <p className="note">No finished matches yet. Every match you finish is kept here automatically so you can review or screen-record it later.</p>;
  }
  return (
    <ul className="replay-items">
      {list.map((r) => (
        <ReplayRow key={r.id} r={r} onPick={() => onPick(r)} onDelete={() => setList((l) => { deleteReplay(r.id); return l.filter((x) => x.id !== r.id); })} />
      ))}
    </ul>
  );
}

function ReplayViewer({ replay, onBack }: { replay: Replay; onBack: () => void }) {
  const states = useMemo(() => buildStates(replay), [replay]);
  const moves = useMemo(() => buildMoves(states), [states]);
  const [step, setStep] = useState(states.length - 1); // open on the final position
  const [playing, setPlaying] = useState(false);
  const host = useRef<HTMLDivElement>(null);
  const board = useRef<ReturnType<typeof createBoard> | null>(null);
  const logRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    if (!host.current) return;
    const b = createBoard(host.current, { onCell: () => {}, flip: replay.viewer === 'p2', facing: replay.kind === 'local' });
    board.current = b;
    b.render(states[step], { acts: [], live: null, armed: false, threats: new Set() });
    return () => { b.destroy(); board.current = null; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay]);

  useEffect(() => {
    board.current?.reset();
    board.current?.render(states[step], { acts: [], live: null, armed: false, threats: new Set() });
    logRef.current?.querySelector('.now')?.scrollIntoView({ block: 'nearest' });
  }, [step, states]);

  useEffect(() => {
    if (!playing) return;
    if (step >= states.length - 1) { setPlaying(false); return; }
    const t = setTimeout(() => setStep((s) => Math.min(s + 1, states.length - 1)), 1100);
    return () => clearTimeout(t);
  }, [playing, step, states.length]);

  const atStart = step === 0, atEnd = step === states.length - 1;
  const go = (n: number) => { setPlaying(false); setStep(Math.max(0, Math.min(states.length - 1, n))); };
  return (
    <div className="replay-viewer">
      <div className="replay-stage">
        <div className="board-host-wrap"><div className="board-host" ref={host} /></div>
        <div className="replay-controls">
          <button type="button" className="btn ghost" onClick={() => go(0)} disabled={atStart} aria-label="Start of match">⏮</button>
          <button type="button" className="btn ghost" onClick={() => go(step - 1)} disabled={atStart} aria-label="Previous move">◂</button>
          <button type="button" className="btn primary play" onClick={() => setPlaying((p) => !p)} disabled={states.length < 2} aria-label={playing ? 'Pause' : 'Play'}>
            {playing ? '❚❚' : '▶'}
          </button>
          <button type="button" className="btn ghost" onClick={() => go(step + 1)} disabled={atEnd} aria-label="Next move">▸</button>
          <button type="button" className="btn ghost" onClick={() => go(states.length - 1)} disabled={atEnd} aria-label="End of match">⏭</button>
          <input className="replay-scrub" type="range" min={0} max={states.length - 1} value={step}
            onChange={(e) => go(Number(e.target.value))} aria-label="Move in the match" />
          <span className="replay-step">{step} / {states.length - 1}</span>
        </div>
      </div>
      <aside className="replay-log">
        <p className="eyebrow">{replay.label} · {replay.winner ? `${TEAM_NAMES[replay.winner]} won` : ''}</p>
        <ol ref={logRef}>
          {moves.map((m, i) => (
            <li key={i} className={`${i === step - 1 ? 'now' : ''} ${m.team}`}>
              <button type="button" onClick={() => go(i + 1)}>
                <span className="mv-n">{i + 1}</span><span className="mv-txt">{m.text}</span>
              </button>
            </li>
          ))}
        </ol>
      </aside>
      <button type="button" className="btn ghost replay-back" onClick={onBack}>‹ All matches</button>
    </div>
  );
}

export function ReplaysScreen() {
  const [sel, setSel] = useState<Replay | null>(null);
  return sel ? <ReplayViewer replay={sel} onBack={() => setSel(null)} /> : <ReplayList onPick={setSel} />;
}
