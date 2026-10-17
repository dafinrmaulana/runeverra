// Chess.com-style review: step through any finished match, move by move, or play it back.
import { useEffect, useMemo, useRef, useState } from 'react';
import { createMatch, applyAction, TEAM_NAMES as TN } from '../../engine/index.ts';
import type { State } from '../../engine/index.ts';
import { createBoard } from '../game/board.ts';
import { listReplays, deleteReplay, type Replay } from '../replays';
import { type Team } from '../data';

const TEAM_NAMES = TN as Record<string, string>;

/** Every position in the match, from the opening setup through the final move. */
function buildStates(replay: Replay): State[] {
  const states: State[] = [createMatch(replay.setup)];
  for (const a of replay.trail) {
    const res = applyAction(states[states.length - 1], a, { trusted: a.type === 'timeout' });
    states.push(res.ok ? res.state : states[states.length - 1]); // a saved trail is always legal; stay put if not
  }
  return states;
}

type Move = { team: Team; turn: number; text: string };
/** One entry per ply: whatever the match log said happened on that step. */
function buildMoves(states: State[]): Move[] {
  const moves: Move[] = [];
  for (let i = 1; i < states.length; i++) {
    const added = states[i].log.slice(states[i - 1].log.length);
    if (!added.length) continue;
    moves.push({ team: added[0].team!, turn: added[0].turn, text: added.map((line) => line.text).join(' ') });
  }
  return moves;
}

function fmtDate(ts: number) {
  const d = new Date(ts);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return (
    (sameDay ? 'Today' : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })) +
    ' · ' +
    d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
  );
}

function ReplayRow({ replay, onPick, onDelete }: { replay: Replay; onPick: () => void; onDelete: () => void }) {
  const won = replay.winner === replay.viewer;
  return (
    <li className="replay-item">
      <button type="button" className="replay-item-main" onClick={onPick}>
        <span className={`replay-result ${won ? 'won' : 'lost'}`}>{won ? 'Won' : 'Lost'}</span>
        <span className="ri-body">
          <b>{replay.label}</b>
          <small>
            {replay.trail.length} moves · {fmtDate(replay.at)}
          </small>
        </span>
        <span className="ri-go" aria-hidden="true">
          ›
        </span>
      </button>
      <button type="button" className="btn ghost tiny ri-del" aria-label="Delete this replay" onClick={onDelete}>
        ✕
      </button>
    </li>
  );
}

function ReplayList({ onPick }: { onPick: (replay: Replay) => void }) {
  const [list, setList] = useState(() => listReplays());
  if (list.length === 0) {
    return (
      <p className="note">
        No finished matches yet. Every match you finish is kept here automatically so you can review or screen-record it
        later.
      </p>
    );
  }
  return (
    <ul className="replay-items">
      {list.map((replay) => (
        <ReplayRow
          key={replay.id}
          replay={replay}
          onPick={() => onPick(replay)}
          onDelete={() =>
            setList((current) => {
              deleteReplay(replay.id);
              return current.filter((other) => other.id !== replay.id);
            })
          }
        />
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
    const b = createBoard(host.current, {
      onCell: () => {},
      flip: replay.viewer === 'p2',
      facing: replay.kind === 'local',
    });
    board.current = b;
    b.render(states[step], { acts: [], live: null, armed: false, threats: new Set() });
    return () => {
      b.destroy();
      board.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [replay]);

  useEffect(() => {
    board.current?.reset();
    board.current?.render(states[step], { acts: [], live: null, armed: false, threats: new Set() });
    logRef.current?.querySelector('.now')?.scrollIntoView({ block: 'nearest' });
  }, [step, states]);

  useEffect(() => {
    if (!playing) return;
    if (step >= states.length - 1) {
      setPlaying(false);
      return;
    }
    const t = setTimeout(() => setStep((current) => Math.min(current + 1, states.length - 1)), 1100);
    return () => clearTimeout(t);
  }, [playing, step, states.length]);

  const atStart = step === 0,
    atEnd = step === states.length - 1;
  const go = (target: number) => {
    setPlaying(false);
    setStep(Math.max(0, Math.min(states.length - 1, target)));
  };
  return (
    <div className="replay-viewer">
      <div className="replay-stage">
        <div className="board-host-wrap">
          <div className="board-host" ref={host} />
        </div>
        <div className="replay-controls">
          <button
            type="button"
            className="btn ghost"
            onClick={() => go(0)}
            disabled={atStart}
            aria-label="Start of match"
          >
            ⏮
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => go(step - 1)}
            disabled={atStart}
            aria-label="Previous move"
          >
            ◂
          </button>
          <button
            type="button"
            className="btn primary play"
            onClick={() => setPlaying((current) => !current)}
            disabled={states.length < 2}
            aria-label={playing ? 'Pause' : 'Play'}
          >
            {playing ? '❚❚' : '▶'}
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => go(step + 1)}
            disabled={atEnd}
            aria-label="Next move"
          >
            ▸
          </button>
          <button
            type="button"
            className="btn ghost"
            onClick={() => go(states.length - 1)}
            disabled={atEnd}
            aria-label="End of match"
          >
            ⏭
          </button>
          <input
            className="replay-scrub"
            type="range"
            min={0}
            max={states.length - 1}
            value={step}
            onChange={(event) => go(Number(event.target.value))}
            aria-label="Move in the match"
          />
          <span className="replay-step">
            {step} / {states.length - 1}
          </span>
        </div>
      </div>
      <aside className="replay-log">
        <p className="eyebrow">
          {replay.label} · {replay.winner ? `${TEAM_NAMES[replay.winner]} won` : ''}
        </p>
        <ol ref={logRef}>
          {moves.map((move, index) => (
            <li key={index} className={`${index === step - 1 ? 'now' : ''} ${move.team}`}>
              <button type="button" onClick={() => go(index + 1)}>
                <span className="mv-n">{index + 1}</span>
                <span className="mv-txt">{move.text}</span>
              </button>
            </li>
          ))}
        </ol>
      </aside>
      <button type="button" className="btn ghost replay-back" onClick={onBack}>
        ‹ All matches
      </button>
    </div>
  );
}

export function ReplaysScreen() {
  const [sel, setSel] = useState<Replay | null>(null);
  return sel ? <ReplayViewer replay={sel} onBack={() => setSel(null)} /> : <ReplayList onPick={setSel} />;
}
