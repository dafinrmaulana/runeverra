import { useRef, useState } from 'react';
import { HEROES, TEAM_NAMES, canCommand, commanderOf } from '../../engine/index.ts';
import { CostChip } from './Rune';
import { HERO_IDS, ICON, ART, randomTeam, type HeroId, type Team, cssVars } from '../data';
import { CommanderMark, HeroInfo, RoleTags, type DescMode } from './HeroInfo';
import { Modal } from './ui';

const SIZE = 4;

type Props = {
  team: Team;
  title: string;
  picks: HeroId[];
  onChange: (p: HeroId[]) => void;
  mode: DescMode;
  onMode: (m: DescMode) => void;
  /** Rotated 180° for the player across the table (offline face to face). */
  mirrored?: boolean;
  readOnly?: boolean;
};

/** Pick a team of four: a two-column hero list, numbered slots, tooltip/modal descriptions. */
export function HeroPicker({ team, title, picks, onChange, mode, onMode, mirrored, readOnly }: Props) {
  const box = useRef<HTMLDivElement>(null);
  const [modal, setModal] = useState<string | null>(null);
  const [note, setNote] = useState('');

  // The commander is the first hero in pick order that can command: choosing one swaps the two in the team.
  const leaders = HERO_IDS.filter((heroId) => picks.includes(heroId) && canCommand(heroId)); // a stable order, like a switch
  const chooseCommander = (id: HeroId) => {
    const current = commanderOf(picks);
    if (readOnly || !current || current === id) return;
    const next = [...picks];
    const [from, to] = [picks.indexOf(current as HeroId), picks.indexOf(id)];
    [next[from], next[to]] = [next[to], next[from]];
    onChange(next);
    setNote(`${HEROES[id].name} commands your team: if they fall, you lose.`);
  };

  const toggle = (id: HeroId) => {
    if (readOnly) return;
    const i = picks.indexOf(id);
    if (i >= 0) {
      onChange(picks.filter((heroId) => heroId !== id));
      setNote('');
      return;
    }
    if (picks.length >= SIZE) {
      setNote('Team is full. Tap a hero in your team to remove it first.');
      return;
    }
    const next = [...picks, id];
    onChange(next);
    setNote(
      next.length === SIZE && !commanderOf(next)
        ? 'Every team needs a commander (Plantae or Magumba). If it falls, you lose.'
        : canCommand(id) && next.filter(canCommand).length > 1
          ? `Two heroes can command: choose your commander above. ${HEROES[commanderOf(next)!].name} leads for now.`
          : '',
    );
  };

  return (
    <div className={`picker ${team}${mirrored ? ' mirrored' : ''}`} ref={box}>
      <div className="picker-head">
        <span className={`team-badge ${team}`}>{TEAM_NAMES[team]}</span>
        <h3>{title}</h3>
        <span className="count">
          {picks.length}/{SIZE}
        </span>
        <span className="grow" />
        {!readOnly && (
          <span className="head-actions">
            <button
              type="button"
              className="btn ghost small-btn"
              onClick={() => {
                onChange(randomTeam(Date.now() % 9973));
                setNote('');
              }}
            >
              ↻ Random
            </button>
            <button
              type="button"
              className="btn ghost small-btn"
              onClick={() => {
                onChange([]);
                setNote('');
              }}
              disabled={!picks.length}
            >
              Clear
            </button>
          </span>
        )}
      </div>

      <div className="slots-row">
        {Array.from({ length: SIZE }, (_, index) => {
          const id = picks[index];
          return id ? (
            <button
              key={index}
              type="button"
              className="slot filled"
              onClick={() => toggle(id)}
              disabled={readOnly}
              title={`Remove ${HEROES[id].name}`}
            >
              <img src={ICON(id)} alt="" />
              <span className="n">{index + 1}</span>
              <span className="nm">{HEROES[id].name}</span>
            </button>
          ) : (
            <span key={index} className="slot empty">
              <span className="n">{index + 1}</span>
              <span className="nm">Empty</span>
            </span>
          );
        })}
      </div>
      {leaders.length > 1 && (
        <div className="commander-pick">
          <span className="commander-pick-label">
            <b>
              <CommanderMark /> Choose your commander
            </b>
            <small>Both can lead. Tap the one who leads: if your commander falls, you lose.</small>
          </span>
          <span className="cmd-switch" role="radiogroup" aria-label="Choose your commander">
            {leaders.map((heroId) => (
              <button
                key={heroId}
                type="button"
                role="radio"
                aria-checked={commanderOf(picks) === heroId}
                className="cmd-opt"
                disabled={readOnly}
                onClick={() => chooseCommander(heroId)}
              >
                <img src={ICON(heroId)} alt="" />
                {HEROES[heroId].name}
              </button>
            ))}
          </span>
        </div>
      )}
      {note && <p className="picker-note">{note}</p>}

      <div className="hero-grid">
        {HERO_IDS.map((id) => {
          const h = HEROES[id];
          const idx = picks.indexOf(id);
          const full = idx < 0 && picks.length >= SIZE;
          return (
            <div key={id} className={`htile ${h.cls}${idx >= 0 ? ' picked' : ''}${full ? ' dim' : ''}`}>
              <button
                type="button"
                className="htile-main"
                onClick={() => toggle(id)}
                aria-pressed={idx >= 0}
                disabled={readOnly}
              >
                <span className="portrait">
                  <img src={ICON(id)} alt="" />
                  {idx >= 0 && <span className="order">{idx + 1}</span>}
                </span>
                <span className="htile-text">
                  <b>{h.name}</b>
                  <RoleTags id={id} />
                  <span className="sk">
                    {h.skill.name} <CostChip sk={h.skill} />
                  </span>
                </span>
              </button>
              <button
                type="button"
                className="info-btn"
                aria-label={`About ${h.name}`}
                onClick={() => setModal(id)}
                title="Hero details"
              >
                i
              </button>
            </div>
          );
        })}
      </div>

      <Modal
        open={!!modal}
        onClose={() => setModal(null)}
        label="Hero details"
        full
        mirrored={mirrored}
        className="hero-modal"
      >
        {modal && (
          <>
            <div className="hero-modal-art" style={cssVars({ '--art': `url(${ART(modal)})` })}>
              <img src={ICON(modal)} alt="" />
              <button type="button" className="modal-x" aria-label="Close" onClick={() => setModal(null)}>
                ✕
              </button>
            </div>
            <div className="hero-modal-body">
              <div className="seg small" role="group" aria-label="Description length">
                <button type="button" aria-pressed={mode === 'short'} onClick={() => onMode('short')}>
                  Short
                </button>
                <button type="button" aria-pressed={mode === 'detail'} onClick={() => onMode('detail')}>
                  Detail
                </button>
              </div>
              <HeroInfo id={modal} mode={mode} />
              <div className="row">
                {!readOnly && (
                  <button
                    type="button"
                    className="btn primary big"
                    disabled={!picks.includes(modal as HeroId) && picks.length >= SIZE}
                    onClick={() => {
                      toggle(modal as HeroId);
                      setModal(null);
                    }}
                  >
                    {picks.includes(modal as HeroId)
                      ? 'Remove from team'
                      : picks.length >= SIZE
                        ? 'Team is full'
                        : 'Add to team'}
                  </button>
                )}
                <button type="button" className="btn big" onClick={() => setModal(null)}>
                  Close
                </button>
              </div>
            </div>
          </>
        )}
      </Modal>
    </div>
  );
}
