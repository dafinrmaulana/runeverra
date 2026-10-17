// A short guided tour for new players: the goal, a first move on a real board, that every hero has a skill,
// and what runes are for. Each step is a sentence or two; nothing here replaces the full rules.
import { useEffect, useMemo, useRef, useState } from 'react';
import { HEROES } from '../../engine/index.ts';
import { matchFromConfig } from '../../online.ts';
import { GameController } from '../game/controller';
import { ICON, SHORT, type HeroId } from '../data';
import { Modal } from './ui';
import { Rune, CostChip } from './Rune';

const YOURS: HeroId[] = ['hasim', 'hexor', 'magumba', 'plantae'];
const THEIRS: HeroId[] = ['genga', 'aqna', 'plantae', 'hasim'];
const ALL = Object.keys(HEROES) as HeroId[];

function Row({ label, heroes, cls }: { label: string; heroes: HeroId[]; cls: string }) {
  return (
    <div className={`tour-row ${cls}`}>
      <span className="tour-who">{label}</span>
      <span className="tour-faces">
        {heroes.map((heroId, index) => (
          <img key={index} src={ICON(heroId)} alt={HEROES[heroId].name} />
        ))}
      </span>
    </div>
  );
}

function GoalVisual() {
  return (
    <div className="tour-goal">
      <Row label="You" heroes={YOURS} cls="p1" />
      <span className="tour-vs" aria-hidden="true">
        take down all four
      </span>
      <Row label="Enemy" heroes={THEIRS} cls="p2" />
    </div>
  );
}

/** A real board with Hasim already selected: the player makes one move. */
function MovePractice({ onDone }: { onDone: () => void }) {
  const host = useRef<HTMLDivElement>(null);
  const done = useRef(onDone);
  done.current = onDone;
  const ctrl = useMemo(
    () =>
      new GameController({ kind: 'local' }, matchFromConfig({ p1: YOURS, p2: THEIRS, map: 'field', creeps: false })),
    [],
  );
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    if (!host.current) return;
    ctrl.attach(host.current, false);
    ctrl.select('p1-hasim');
    const off = ctrl.subscribe(() => {
      if (ctrl.game.trail.length > 0) {
        setMoved(true);
        done.current();
      }
    });
    return () => {
      off();
      ctrl.destroy();
    };
  }, [ctrl]);
  return (
    <div className="tour-board">
      <div className="board-host-wrap">
        <div className="board-host" ref={host} />
      </div>
      <p className={`tour-hint${moved ? ' ok' : ''}`} role="status">
        {moved ? 'Nice! That was one turn. Now your opponent moves.' : 'Tap one of the dots.'}
      </p>
    </div>
  );
}

function HeroesVisual() {
  return (
    <ul className="tour-heroes">
      {ALL.map((id) => {
        const h = HEROES[id];
        return (
          <li key={id}>
            <img src={ICON(id)} alt="" />
            <span>
              <b>{h.name}</b> <CostChip sk={h.skill} />
              <small>{SHORT[id].move}</small>
            </span>
          </li>
        );
      })}
    </ul>
  );
}

function RunesVisual() {
  return (
    <div className="tour-runes">
      <span className="tokens p1">
        <span className="team-dot p1" />
        <span className="energy">
          {[0, 1, 2, 3].map((index) => (
            <i key={index} className="on" />
          ))}
        </span>
        <span className="tn">
          <Rune />
          4/4
        </span>
      </span>
      <p>
        <CostChip sk={HEROES.magumba.skill} /> Empty Grave &nbsp; <CostChip sk={HEROES.plantae.skill} /> Aggressive Root
        &nbsp; <CostChip sk={HEROES.aqna.skill} /> Icy Step
      </p>
    </div>
  );
}

type Step = { title: string; text: string; visual: () => JSX.Element };

export function Tour({
  open,
  onClose,
  onFullRules,
  onPlay,
}: {
  open: boolean;
  onClose: () => void;
  onFullRules: () => void;
  onPlay: () => void;
}) {
  const [i, setI] = useState(0);
  const [moved, setMoved] = useState(false);
  useEffect(() => {
    if (open) {
      setI(0);
      setMoved(false);
    }
  }, [open]);

  const steps: Step[] = [
    {
      title: 'Take down all four',
      text: 'You and your opponent each lead four heroes. Move one piece per turn. No dice, no luck: the better plan wins.',
      visual: GoalVisual,
    },
    {
      title: 'Make your first move',
      text: 'Hasim is selected. The dots are where he can go. Land on an enemy to take it down.',
      visual: () => <MovePractice onDone={() => setMoved(true)} />,
    },
    {
      title: 'Every hero has a skill',
      text: 'Each hero moves in its own way and has one special skill. Tap the ⓘ on a hero when you pick your team to watch it in action.',
      visual: HeroesVisual,
    },
    {
      title: 'Skills cost runes',
      text: 'You start with 4 runes and they do not refill. A skill spends runes (the cost is on its button). Take down enemy heroes and creeps (the small pawns) to earn more.',
      visual: RunesVisual,
    },
  ];
  const last = i === steps.length;
  const step = steps[i];

  return (
    <Modal open={open} onClose={onClose} label="Guided tour" className="tour-card">
      <div className="tour-top">
        <span className="tour-count">{last ? 'Ready' : `Step ${i + 1} of ${steps.length}`}</span>
        <button type="button" className="btn ghost tiny" onClick={onClose}>
          Skip tour
        </button>
      </div>
      <div className="tour-dots" aria-hidden="true">
        {[...steps, null].map((_, dot) => (
          <i key={dot} className={dot === i ? 'on' : dot < i ? 'past' : ''} />
        ))}
      </div>
      {last ? (
        <div className="tour-step" key="ready">
          <h3>You are ready</h3>
          <p>Pick four heroes, choose a battlefield and play. The full rules are always one tap away in How to play.</p>
          <div className="tour-actions stack">
            <button type="button" className="btn primary big" onClick={onPlay}>
              Play vs Bot
            </button>
            <button type="button" className="btn" onClick={onFullRules}>
              Read the full rules
            </button>
          </div>
        </div>
      ) : (
        <div className="tour-step" key={i}>
          <h3>{step.title}</h3>
          <p>{step.text}</p>
          <div className="tour-visual">{step.visual()}</div>
        </div>
      )}
      {!last && (
        <div className="tour-actions">
          <button
            type="button"
            className="btn"
            onClick={() => setI((current) => Math.max(0, current - 1))}
            disabled={i === 0}
          >
            Back
          </button>
          <button
            type="button"
            className={`btn primary${i === 1 && moved ? ' glow' : ''}`}
            onClick={() => setI((current) => current + 1)}
          >
            Next
          </button>
        </div>
      )}
    </Modal>
  );
}
