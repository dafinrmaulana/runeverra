import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CursorPicker } from '../cursor';
import { sideA } from '../record';
import { formatClock } from '../../clock.ts';
import { HeroDemo } from '../components/HeroDemo';
import {
  HEROES,
  PHASES,
  MAPS,
  TEAM_NAMES as TN,
  CREEPS,
  ROLES,
  ENERGY,
  isCommander,
  label,
  heroDef,
  livingHeroes,
  moveOptions,
  samePos,
  squareName,
  skillCooldown,
  skillActions,
  skillOf,
  getThreats,
} from '../../engine/index.ts';
import type { BeastPattern, GameController } from '../game/controller';
import type { Action, State, Unit } from '../../engine/index.ts';
import { ICON, ART, MAP_ART, SHORT, costLabel, other, tk, type Team, cssVars } from '../data';
import { BEAST_SVG, CREEP_SVG } from '../game/board.ts';
import { Rules } from '../components/Rules';
import { MoveDiagram, RangeDiagram } from '../components/HeroInfo';
import { Modal, Switch, Accordion } from '../components/ui';
import { useBack } from '../back';
import { ChatButton, ChatBubble } from '../components/Chat';
import { Rune, CostChip } from '../components/Rune';
import { SoundSetting } from '../components/SoundSetting';

const TEAM_NAMES = TN as Record<string, string>;

/** Storm Hammer pattern icon: Hexor in the middle, four arrows pushing outward (straight or diagonal). */
function SlamIcon({ pattern }: { pattern: 'plus' | 'x' }) {
  const angles = pattern === 'x' ? [45, 135, 225, 315] : [0, 90, 180, 270];
  return (
    <svg className="slam-ico" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <circle cx="12" cy="12" r="2.4" fill="currentColor" />
      {angles.map((angle) => (
        <path
          key={angle}
          transform={`rotate(${angle} 12 12)`}
          d="M12 8.2V2.6M9.3 5.3 12 2.6l2.7 2.7"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      ))}
    </svg>
  );
}

/** The beast's three ways to move, as buttons: the board then marks only that pattern's squares. */
function BeastPatternButtons({ controller }: { controller: GameController }) {
  const choices: { pattern: BeastPattern; label: string; title: string; icon: React.ReactNode }[] = [
    { pattern: 'any', label: '1 any way', title: '1 square in any direction', icon: <AnyStepIcon /> },
    {
      pattern: 'plus',
      label: '2 straight',
      title: 'Up to 2 squares straight (plus)',
      icon: <SlamIcon pattern="plus" />,
    },
    {
      pattern: 'cross',
      label: '2 diagonal',
      title: 'Up to 2 squares diagonally (cross)',
      icon: <SlamIcon pattern="x" />,
    },
  ];
  return (
    <>
      {choices.map((choice) => (
        <button
          key={choice.pattern}
          className={`btn${controller.beastPattern === choice.pattern ? ' primary' : ''} slam-btn`}
          type="button"
          title={choice.title}
          aria-pressed={controller.beastPattern === choice.pattern}
          onClick={() => {
            const g = controller.game;
            const beastId = g.phase === 'beast' ? g.pending?.unitId : controller.selectedId;
            if (beastId && controller.selectedId !== beastId) controller.select(beastId);
            controller.pickBeastPattern(choice.pattern);
          }}
        >
          {choice.icon}
          {choice.label}
        </button>
      ))}
    </>
  );
}
function AnyStepIcon() {
  return (
    <svg className="slam-ico" viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <rect x="9" y="9" width="6" height="6" rx="1.5" fill="currentColor" />
      <rect x="3.5" y="3.5" width="17" height="17" rx="3" fill="none" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

type Props = {
  ctrl: GameController;
  roomCode?: string | null;
  /** Online: what the rematch button should say / whether it is waiting. */
  rematch: { label: string; disabled: boolean };
  onRematch: () => void;
  onChangeHeroes: () => void;
  onHome: () => void;
  onReplays?: () => void;
};

function useCtrl(ctrl: GameController) {
  useSyncExternalStore(ctrl.subscribe, ctrl.getVersion);
  return ctrl;
}

function statusFor(controller: GameController, team?: Team) {
  const g = controller.game;
  if (g.status !== 'playing') {
    const on = controller.timedOut() ? ' on time' : '';
    if (controller.mode.kind === 'online') return (g.status === controller.mode.side ? 'You win' : 'You lose') + on;
    if (controller.mode.kind === 'bot') return (g.status === controller.botTeam() ? 'The bot wins' : 'You win') + on;
    return (team ? (g.status === team ? 'You win' : 'You lose') : `${TEAM_NAMES[g.status]} wins`) + on;
  }
  const d = controller.decider()!;
  if (controller.mode.kind === 'online') {
    return controller.deciderIsHuman() ? 'Your turn' : "Opponent's turn";
  }
  if (g.phase === 'react' && controller.deciderIsHuman() && (!team || d === team)) return 'Interrupt?';
  if (controller.mode.kind === 'bot')
    return controller.deciderIsBot()
      ? g.phase === 'react'
        ? 'Bot is deciding whether to root'
        : 'Bot is thinking'
      : 'Your turn';
  if (team) return d === team ? 'Your turn' : `${TEAM_NAMES[d]}'s turn`;
  return `${TEAM_NAMES[d]} to act`;
}

/** "move to e4", "strike Ember Aqna on d5"…: what a pending action is about to do, for the interrupt prompt. */
function describe(state: State, action: Action) {
  const actor = state.units[action.unitId!];
  if (action.type === 'skill')
    return `cast ${skillOf(actor)!.name} on ${action.to ? squareName(action.to) : label(state.units[action.targetId!])}`;
  const to = action.to!;
  const option = moveOptions(state, actor).find((candidate) => samePos(candidate.to, to));
  const victims = option ? option.kills.map((id) => label(state.units[id])) : [];
  if (option?.backstab)
    return `Backstab to ${squareName(to)}${victims.length ? `, eliminating ${victims.join(' and ')}` : ''}`;
  if (victims.length) return `strike ${victims[0]} on ${squareName(to)}`;
  return `move to ${squareName(to)}`;
}

/**
 * A toast floating directly over the board (so it's impossible to miss) for decision prompts
 * (interrupt, beast/ice/storm follow-ups); the board itself never moves underneath it. It can
 * be dragged anywhere so the player can slide it aside to see the board, and it re-centers for
 * the next prompt. Face to face, it's mirrored for the far seat so that player reads it upright.
 */
function Toast({ controller, mirror }: { controller: GameController; mirror?: boolean }) {
  const g = controller.game;
  const dragRef = useRef<{ x: number; y: number; ox: number; oy: number } | null>(null);
  const [off, setOff] = useState({ x: 0, y: 0 });
  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if ((event.target as HTMLElement).closest('button')) return;
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
    dragRef.current = { x: event.clientX, y: event.clientY, ox: off.x, oy: off.y };
  };
  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const d = dragRef.current;
    if (!d) return;
    setOff({ x: d.ox + (event.clientX - d.x), y: d.oy + (event.clientY - d.y) });
  };
  const onPointerUp = () => {
    dragRef.current = null;
  };
  if (g.status !== 'playing' || !controller.deciderIsHuman()) return null;
  let body = null;
  if (g.phase === 'react') {
    const pend = g.pending!.action!;
    const actor = g.units[pend.unitId!];
    const reactor = g.units[g.pending!.reactorId!];
    const sk = skillOf(reactor)!;
    const ui = HEROES[reactor.hero].ui;
    const cost = sk.reactionCost ?? sk.cost;
    body = (
      <>
        <img src={ICON(reactor.hero)} alt="" />
        <span className="pt">
          <b>Interrupt?</b> {label(actor)} is about to {describe(g, pend)}.
          <small>
            Cancel it for {tk(cost)} (you have {g.energy[reactor.team]}).{ui?.reactNote ? ` ${ui.reactNote}` : ''}
          </small>
        </span>
        <span className="row">
          <button className="btn vine" type="button" onClick={() => controller.react(true)}>
            {ui?.reactLabel || `Use ${sk.name}`}
          </button>
          <button className="btn" type="button" onClick={() => controller.react(false)}>
            Let it happen
          </button>
        </span>
      </>
    );
  } else if (PHASES[g.phase]) {
    const text = PHASES[g.phase].prompt?.(g) ?? 'Decide, or skip.';
    body = (
      <>
        <span className="pt">{text}</span>
        <span className="row">
          {g.phase === 'beast' && !g.units[g.pending!.unitId!]?.stride && (
            <BeastPatternButtons controller={controller} />
          )}
          {g.phase === 'storm' && (
            <button
              className="btn primary slam-btn"
              type="button"
              onClick={() => controller.slam('plus')}
              title="Slam straight: push up, down, left and right"
              aria-label="Slam straight: push up, down, left and right"
            >
              <SlamIcon pattern="plus" />
              Slam
            </button>
          )}
          {g.phase === 'storm' && (
            <button
              className="btn primary slam-btn"
              type="button"
              onClick={() => controller.slam('x')}
              title="Slam diagonally: push the four corners"
              aria-label="Slam diagonally: push the four corners"
            >
              <SlamIcon pattern="x" />
              Slam
            </button>
          )}
          <button className="btn" type="button" onClick={() => controller.skip()}>
            Skip
          </button>
        </span>
      </>
    );
  } else if (controller.needsBeastPattern()) {
    // the beast's one solo move: how does it move?
    body = (
      <>
        <span className="pt">How does the beast move? You pick once: it keeps this move all match.</span>
        <span className="row">
          <BeastPatternButtons controller={controller} />
          <button className="btn" type="button" onClick={() => controller.escape()}>
            Cancel
          </button>
        </span>
      </>
    );
  }
  if (!body) return null;
  return (
    <div
      key={`${g.turn}-${g.phase}`}
      className="toast-pos"
      style={{ transform: `translate(calc(-50% + ${off.x}px), calc(-50% + ${off.y}px))` }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerUp}
    >
      <div
        className={`toast over-map ${g.phase === 'react' ? 'react' : 'phase'}${mirror ? ' mirrored' : ''}`}
        role="alertdialog"
      >
        {body}
      </div>
    </div>
  );
}

/** Runes as pips: the 4 a side starts with, plus one more for every rune banked past that (no cap). */
function Pips({ count }: { count: number }) {
  return (
    <span className="energy" title={`${count} rune${count === 1 ? '' : 's'}`}>
      {Array.from({ length: Math.min(Math.max(ENERGY.start, count), 8) }, (_, index) => (
        <i key={index} className={index < count ? 'on' : ''} />
      ))}
    </span>
  );
}

/** Who's who for the score: ['You', 'Bot'] or ['Ivory', 'Ember'], in a's-then-b's order. */
function sideNames(controller: GameController) {
  const k = controller.mode.kind;
  return k === 'local' ? [TEAM_NAMES.p1, TEAM_NAMES.p2] : ['You', k === 'bot' ? 'Bot' : 'Opponent'];
}
/** "You 3 – 1 Bot", "Ivory 2 – 2 Ember", "You 1 – 0 Opponent". */
function seriesLine(controller: GameController) {
  const t = controller.tally();
  const [a, b] = sideNames(controller);
  return `${a} ${t.a} – ${t.b} ${b}`;
}

const TROPHY = (
  <svg viewBox="0 0 16 16" aria-hidden="true">
    <path d="M4.5 2h7v3.2a3.5 3.5 0 0 1-7 0zM4.5 3.2H2.4v1.1a2.4 2.4 0 0 0 2.3 2.4M11.5 3.2h2.1v1.1a2.4 2.4 0 0 1-2.3 2.4M8 8.7v2.6M5.4 13.8h5.2l-.6-2.5H6z" />
  </svg>
);

/** A clear, standalone readout of the series score: both sides' wins, side by side. */
function ScoreStrip({ controller }: { controller: GameController }) {
  const t = controller.tally();
  const [a, b] = sideNames(controller);
  const aTeam = sideA(controller.mode.kind, controller.viewer());
  const bTeam = other(aTeam);
  return (
    <div className="score-strip" role="status" aria-label={`Series score: ${seriesLine(controller)}`}>
      <span className={`score-side ${aTeam}`}>
        <span className="who">{a}</span>
        <b key={t.a}>{t.a}</b>
      </span>
      <span className="score-glyph" aria-hidden="true">
        {TROPHY}
      </span>
      <span className={`score-side ${bTeam}`}>
        <b key={t.b}>{t.b}</b>
        <span className="who">{b}</span>
      </span>
    </div>
  );
}

/** A seat's own score badge: wins it has – wins the other side has, in its own seat's orientation. */
function SeatScore({ controller, team }: { controller: GameController; team: Team }) {
  const t = controller.tally();
  const aTeam = sideA(controller.mode.kind, controller.viewer());
  const mine = team === aTeam ? t.a : t.b;
  const theirs = team === aTeam ? t.b : t.a;
  return (
    <span
      className="seat-score"
      title={`${mine} win${mine === 1 ? '' : 's'} – ${theirs} win${theirs === 1 ? '' : 's'} this series`}
    >
      {TROPHY}
      <b key={mine}>{mine}</b>
      <span className="dash">–</span>
      {theirs}
    </span>
  );
}

/** A side's skill runes, labelled. */
function Clock({ controller, team }: { controller: GameController; team: Team }) {
  if (!controller.timed() || !controller.clock) return null;
  const ms = controller.timeLeft(team);
  const running = controller.clock.running === team && controller.game.status === 'playing';
  return (
    <span
      className={`clock${running ? ' running' : ''}${ms < 30000 ? ' low' : ''}`}
      aria-label={`${TEAM_NAMES[team]} time left`}
    >
      {formatClock(ms)}
    </span>
  );
}

function Tokens({
  controller,
  team,
  who,
  active,
}: {
  controller: GameController;
  team: Team;
  who: string;
  active?: boolean;
}) {
  const n = controller.game.energy[team];
  return (
    <span className={`tokens ${team}${active ? ' active' : ''}`}>
      <span className={`team-dot ${team}`} />
      <span className="who">{who}</span>
      <Pips count={n} />
      <span className="tn">
        <Rune />
        {n}
      </span>
      <Clock controller={controller} team={team} />
    </span>
  );
}

function TeamRoster({ controller, team, threats }: { controller: GameController; team: Team; threats: Set<string> }) {
  const g = controller.game;
  const all = Object.values(g.units).filter((unit) => unit.team === team);
  const units = all.filter((unit) => unit.kind !== 'creep');
  const creeps = all.filter((unit) => unit.kind === 'creep');
  return (
    <div className="troster">
      <ul>
        {units.map((unit) => (
          <li key={unit.id} className={unit.alive ? '' : 'dead'}>
            <button
              type="button"
              disabled={!unit.alive}
              onClick={() => g.status === 'playing' && controller.select(unit.id)}
              aria-pressed={controller.selectedId === unit.id}
            >
              {unit.kind === 'beast' ? (
                <span className="bk" dangerouslySetInnerHTML={{ __html: BEAST_SVG }} />
              ) : (
                <img src={ICON(unit.hero)} alt="" />
              )}
              <span>{unit.kind === 'beast' ? 'Beast' : HEROES[unit.hero].name}</span>
              {unit.warded && <span className="chip wd">grave</span>}
              {unit.rooted > 0 && <span className="chip rt">rooted</span>}
              {skillCooldown(unit) > 0 && (
                <span className="chip cdn" title="Skill recharging">
                  cd {skillCooldown(unit)}
                </span>
              )}
              {threats.has(unit.id) && <span className="chip th">threat</span>}
            </button>
          </li>
        ))}
      </ul>
      {creeps.length > 0 && (
        <div className="creeps">
          <span className="bk" dangerouslySetInnerHTML={{ __html: CREEP_SVG }} />
          Creeps {creeps.filter((creep) => creep.alive).length}/{creeps.length}
        </div>
      )}
    </div>
  );
}

function TeamHead({ controller, team }: { controller: GameController; team: Team }) {
  const g = controller.game;
  const heroes = Object.values(g.units).filter((unit) => unit.team === team && unit.kind === 'hero');
  return (
    <span className="team-head">
      <span className={`team-dot ${team}`} />
      {TEAM_NAMES[team]}
      <Pips count={g.energy[team]} />
      <span className="count">
        {heroes.filter((unit) => unit.alive).length}/{heroes.length}
      </span>
    </span>
  );
}

const STRIDE_TEXT: Record<string, string> = {
  any: '1 square any way',
  plus: 'up to 2 squares straight',
  cross: 'up to 2 squares diagonally',
};

/** One line that says what a unit is about: shown as the accordion trigger. */
function shortLine(unit: Unit) {
  if (unit.kind === 'creep') return 'Pawn: 1 forward, captures diagonally forward.';
  if (unit.kind === 'beast')
    return unit.stride
      ? `Moves free right after Ge'nga: ${STRIDE_TEXT[unit.stride] ?? '1 square any way'}, all match.`
      : 'First move: pick 1 any way, 2 straight or 2 diagonal; it keeps that move all match. May be its own turn.';
  return SHORT[unit.hero]?.skill || '';
}

/** Active effects on a unit, in plain words. */
function effectsOf(controller: GameController, unit: Unit, threats: Set<string>) {
  const g = controller.game;
  const out: { k: string; label: string; text: string }[] = [];
  if (unit.warded)
    out.push({
      k: 'wd',
      label: 'Shielded',
      text: `Empty Grave: the next attack on it breaks the shield instead (the attacker is thrown back). Aqna's ice breaks it too; other skills and pushes can't touch it. Lasts ${(unit.wardTurns ?? 0) + 1} more of ${TEAM_NAMES[unit.team]}'s turns if unbroken.`,
    });
  if (isCommander(unit))
    out.push({ k: 'cmd', label: 'Commander', text: 'If this hero falls, its side loses the match.' });
  if (unit.rooted > 0)
    out.push({
      k: 'rt',
      label: 'Rooted',
      text:
        unit.team === g.current ? "Held by roots: can't act this turn." : "Held by roots: can't act on its next turn.",
    });
  const cd = unit.kind === 'hero' ? skillCooldown(unit) : 0;
  if (cd > 0) out.push({ k: 'cdn', label: `Recharging ${cd}`, text: `Skill ready in ${cd} turn${cd > 1 ? 's' : ''}.` });
  if (threats.has(unit.id))
    out.push({ k: 'th', label: 'In danger', text: 'An enemy can capture it on their next turn.' });
  return out;
}

function SelTrigger({ controller, unit, threats }: { controller: GameController; unit: Unit; threats: Set<string> }) {
  const d = heroDef(unit);
  const hero = unit.kind === 'hero';
  const sk = hero ? d.skill : null;
  const fx = effectsOf(controller, unit, threats);
  return (
    <span className="sel-trigger">
      {hero ? (
        <img src={ICON(unit.hero)} alt="" className={fx.length ? 'has-fx' : ''} />
      ) : (
        <span className="bk" dangerouslySetInnerHTML={{ __html: unit.kind === 'beast' ? BEAST_SVG : CREEP_SVG }} />
      )}
      <span className="sel-text">
        <span className="sel-name">
          <span className={`team-dot ${unit.team}`} />
          {d.name}
          <span className="sub">
            {hero && d.role ? `${ROLES[d.role]}${unit.commander ? ` · ${ROLES.commander}` : ''}` : d.title} ·{' '}
            {squareName(unit.pos)}
          </span>
          {sk && <CostChip sk={sk} />}
          {fx.map((effect) => (
            <span key={effect.k} className={`fx-pill ${effect.k}`} title={effect.text}>
              {effect.label}
            </span>
          ))}
        </span>
        <span className="sel-short">
          {sk ? (
            <>
              <b>{sk.name}:</b> {shortLine(unit)}
            </>
          ) : (
            shortLine(unit)
          )}
        </span>
        {fx.length > 0 && <span className="sel-fx">{fx.map((effect) => effect.text).join(' ')}</span>}
      </span>
    </span>
  );
}

function SelDetail({ controller, unit }: { controller: GameController; unit: Unit }) {
  const g = controller.game;
  const d = heroDef(unit);
  const hero = unit.kind === 'hero';
  const sk = hero ? d.skill : null;
  const cd = hero ? skillCooldown(unit) : 0;
  const art =
    unit.kind === 'beast'
      ? ART('genga')
      : unit.kind === 'creep'
        ? ART(MAP_ART[MAPS[g.map].theme] || 'hexor')
        : ART(unit.hero);
  return (
    <div className="sel-detail" style={cssVars({ '--art': `url(${art})` })}>
      <div className="sel-move">
        {hero ? <MoveDiagram hero={unit.hero} size={8} /> : null}
        <span>{d.moveText}</span>
      </div>
      {sk && (
        <div className="sel-skill">
          {sk.range ? <RangeDiagram hero={unit.hero} size={7} /> : null}
          <b>{sk.name}</b>{' '}
          <span className="meta">
            {costLabel(sk)}
            {sk.range ? ` · range ${sk.range}` : ''}
            {sk.cooldown ? ` · cooldown ${sk.cooldown}` : ''}
          </span>
          <p>{sk.text}</p>
          {cd > 0 && (
            <p className="cdn-note">
              Recharging: ready in {cd} turn{cd > 1 ? 's' : ''}.
            </p>
          )}
        </div>
      )}
      {hero && <HeroDemo hero={unit.hero} compact />}
      {unit.kind === 'creep' && (
        <p>
          Moving a creep uses your turn. Killing an enemy creep gives +{tk(CREEPS.lastHit)}; reaching the far side gives
          +{tk(CREEPS.breach)}.
        </p>
      )}
    </div>
  );
}

/** The selected unit, right under the board: a short line, expandable to full details. */
function SelectedAccordion({ controller, threats }: { controller: GameController; threats: Set<string> }) {
  const u = controller.selectedId ? controller.game.units[controller.selectedId] : null;
  if (!u || !u.alive)
    return <div className="sel-empty">Tap a unit to see what it does. Tap an enemy to see its reach.</div>;
  return (
    <Accordion
      key={u.id}
      className={`sel-acc ${u.team}`}
      trigger={<SelTrigger controller={controller} unit={u} threats={threats} />}
    >
      <SelDetail controller={controller} unit={u} />
    </Accordion>
  );
}

/** A glyph per skill for the skill button (no character portraits). */
const SKILL_ICON: Record<string, string> = {
  none: '<svg viewBox="0 0 24 24"><path d="M12 2l2.6 6.6L21 9.3l-5 4.4 1.5 6.8L12 17l-5.5 3.5L8 13.7 3 9.3l6.4-.7z" fill="currentColor"/></svg>',
  backstab:
    '<svg viewBox="0 0 24 24"><path d="M4 20l3-1 11-11 1-4-4 1L4 16z" fill="currentColor"/><path d="M3 21l3-3M8 14l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  summon:
    '<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="12" cy="15.5" rx="5" ry="4.2"/><circle cx="6.2" cy="10" r="2.1"/><circle cx="9.6" cy="6.4" r="2.1"/><circle cx="14.4" cy="6.4" r="2.1"/><circle cx="17.8" cy="10" r="2.1"/></svg>',
  grave:
    '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="currentColor"/><path d="M12 7v9M8.5 10.5h7" stroke="rgba(0,0,0,.45)" stroke-width="2" stroke-linecap="round"/></svg>',
  root: '<svg viewBox="0 0 24 24"><path d="M12 22V11" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/><path d="M12 13c-5 0-7-4-7-8 4 0 7 2 7 8zM12 11c4.5 0 6.5-3.5 6.5-7-3.8 0-6.5 2-6.5 7z" fill="currentColor"/><path d="M12 22c-2-1-4-1-6 0M12 22c2-1 4-1 6 0" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
  storm: '<svg viewBox="0 0 24 24"><path d="M13 2L5 13h6l-2 9 9-12h-6z" fill="currentColor"/></svg>',
  icy: '<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" fill="none"><path d="M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7"/><path d="M9.5 3.5L12 6l2.5-2.5M9.5 20.5L12 18l2.5 2.5"/></svg>',
};

/**
 * Square skill button for the selected unit. Its cost and effect show in an animated
 * card under it (on hover, focus, or while the skill is armed).
 */
// Small marks on the skill button saying why it can't be used right now.
const BLOCK_ICON: Record<string, string> = {
  cooldown:
    '<svg viewBox="0 0 16 16"><path d="M4 2h8M4 14h8M5 2c0 4 6 4 6 6s-6 2-6 6M11 2c0 4-6 4-6 6s6 2 6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  tokens:
    '<svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  target:
    '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 12L12 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  passive:
    '<svg viewBox="0 0 16 16"><path d="M4.5 8a2.2 2.2 0 1 1 3.5 1.8L8 8l0 0a2.2 2.2 0 1 1 3.5 0 2.2 2.2 0 0 1-3.5 1.8 2.2 2.2 0 0 1-3.5-1.8z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  wait: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 5v3.2l2 1.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  charge:
    '<svg viewBox="0 0 16 16"><path d="M8 2v12M3.5 4.5l9 7M12.5 4.5l-9 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};

function skillStatus(controller: GameController) {
  const g = controller.game;
  const u = controller.selectedId ? g.units[controller.selectedId] : null;
  const hero = !!u && u.alive && u.kind === 'hero';
  const own =
    hero && u.team === g.current && g.status === 'playing' && controller.deciderIsHuman() && g.phase === 'main';
  const sk = hero ? skillOf(u)! : null;
  const ui = hero ? HEROES[u.hero].ui : undefined;
  const active = own && sk && sk.type === 'active';
  const cd = active ? skillCooldown(u) : 0;
  const can = !!active && skillActions(g, u).length > 0;
  const tokens = hero ? g.energy[u.team] : 0;
  let state = '';
  let block = '';
  if (!hero) state = 'Select one of your heroes to see its skill.';
  else if (!own) {
    state =
      u.team !== g.current
        ? 'That is an enemy hero: its skill is shown for reference.'
        : 'Wait for your turn to use a skill.';
    block = 'wait';
  } else if (sk!.type !== 'active') {
    block = 'passive';
    state =
      sk!.type === 'move'
        ? `${sk!.name} is part of ${HEROES[u.hero].name}'s moves: tap a square past an adjacent piece.`
        : `${sk!.name} triggers by itself after ${HEROES[u.hero].name} eliminates an enemy (${tk(sk!.cost)}).`;
  } else if (controller.armed) state = 'Tap a highlighted target. Tap the button again to cancel.';
  else if (cd) {
    block = 'cooldown';
    state = `${sk!.name} is recharging: ready in ${cd} of your turn${cd > 1 ? 's' : ''}.`;
  } else if (tokens < sk!.cost) {
    block = 'tokens';
    state = `${sk!.name} needs ${tk(sk!.cost)}; you have ${tokens}. Kill an enemy hero or creep, or break through, to earn more.`;
  } else if (!can) {
    const why = ui?.unavailable?.(g, u);
    block = why?.charge ? 'charge' : 'target';
    state = why?.text ?? 'No valid target in range.';
  } else state = ui?.ready ?? 'Ready. Press to choose a target (or Q).';
  return { u, hero, sk, active, cd, can, state, block };
}

function SkillButton({ controller, inline }: { controller: GameController; inline?: boolean }) {
  const { u, sk, active, cd, can, state, block } = skillStatus(controller);
  const usable = can || controller.armed;
  return (
    <div className={`skill-wrap${controller.armed ? ' armed' : ''}${inline ? ' inline' : ''}`}>
      <button
        className={`skill-sq${controller.armed ? ' armed' : ''}${can ? ' ready' : ''}${usable ? '' : ' blocked'}`}
        type="button"
        aria-disabled={!usable}
        onClick={() => (usable ? controller.armSkill() : sk && controller.say(state, 'err'))}
        aria-label={sk ? `${sk.name}${active ? `, ${tk(sk.cost)}` : ''}. ${state}` : 'Skill'}
      >
        <span
          className="glyph"
          dangerouslySetInnerHTML={{ __html: SKILL_ICON[sk?.key ?? 'none'] || SKILL_ICON.none }}
        />
        {sk && <CostChip sk={sk} className="sq-cost" />}
        {block && sk && (
          <span
            className={`sq-block ${block}`}
            dangerouslySetInnerHTML={{ __html: BLOCK_ICON[block] + (block === 'cooldown' ? `<b>${cd}</b>` : '') }}
          />
        )}
      </button>
      <div className="skill-pop" role="note">
        {sk ? (
          <>
            <b>{sk.name}</b>
            <span className="meta">
              {costLabel(sk)}
              {sk.range ? ` · range ${sk.range}` : ''}
              {sk.cooldown ? ` · cooldown ${sk.cooldown}` : ''}
            </span>
            <span className="impact">{u && SHORT[u.hero]?.skill}</span>
          </>
        ) : (
          <b>Skill</b>
        )}
        <span
          className={`state${can && !controller.armed ? ' ok' : ''}${block && block !== 'passive' && block !== 'wait' ? ' no' : ''}`}
        >
          {block && <span className="state-ico" dangerouslySetInnerHTML={{ __html: BLOCK_ICON[block] }} />}
          {state}
        </span>
      </div>
    </div>
  );
}

function Controls({
  controller,
  onMenu,
  roomCode,
  local,
  focus,
  onFocus,
}: {
  controller: GameController;
  onMenu: () => void;
  roomCode?: string | null;
  local?: boolean;
  focus?: boolean;
  onFocus?: () => void;
}) {
  return (
    <div className="controls">
      <div className="controls-row">
        {!local && <SkillButton controller={controller} />}
        {local && (
          <button className="btn icon-btn" type="button" onClick={onMenu}>
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            Menu
          </button>
        )}
        <span className="grow" />
        {controller.mode.kind !== 'online' && (
          <span className="undo-redo">
            <button
              className="btn icon"
              type="button"
              disabled={!controller.canUndo()}
              onClick={() => controller.undo()}
              title="Undo (Ctrl+Z)"
            >
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M9 14L4 9l5-5" />
                <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
              </svg>
              <span className="btn-txt">Undo</span>
            </button>
            <button
              className="btn icon"
              type="button"
              disabled={!controller.canRedo()}
              onClick={() => controller.redo()}
              title="Redo (Ctrl+Shift+Z)"
            >
              <span className="btn-txt">Redo</span>
              <svg viewBox="0 0 24 24" aria-hidden="true">
                <path d="M15 14l5-5-5-5" />
                <path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" />
              </svg>
            </button>
          </span>
        )}
        {onFocus && (
          <button
            className="btn icon-btn only-icon focus-btn"
            type="button"
            onClick={onFocus}
            aria-pressed={!!focus}
            aria-label={focus ? 'Exit full screen board' : 'Full screen board'}
            title={focus ? 'Exit full screen' : 'Full screen board'}
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              {focus ? (
                <path d="M9 4v5H4M15 4v5h5M9 20v-5H4M15 20v-5h5" />
              ) : (
                <path d="M4 9V4h5M20 9V4h-5M4 15v5h5M20 15v5h-5" />
              )}
            </svg>
          </button>
        )}
        {controller.mode.kind === 'online' && <ChatButton />}
        {!local && (
          <button className="btn icon-btn only-icon" type="button" onClick={onMenu} aria-label="Menu" title="Menu">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h16M4 12h16M4 17h16" />
            </svg>
          </button>
        )}
      </div>
      <div className="turnline">
        <span className="turn-num">
          Turn {controller.game.turn}
          {roomCode ? ` · room ${roomCode}` : ''}
        </span>
        {!local && (
          <span className={`msg ${controller.msgKind}`} role="status" aria-live="polite">
            {controller.msg}
          </span>
        )}
      </div>
    </div>
  );
}

function Log({ controller, limit = 40 }: { controller: GameController; limit?: number }) {
  const items = controller.game.log.slice(-limit).reverse();
  return (
    <ol className="log">
      {items.map((entry, index) => (
        <li key={controller.game.log.length - index}>
          <span className="t">{entry.turn || ''}</span>
          <span
            className={`swatch ${entry.team || ''}`}
            style={entry.team ? undefined : { background: 'var(--muted)' }}
          />
          <span>{entry.text}</span>
        </li>
      ))}
    </ol>
  );
}

/** One player's side in face-to-face play; the top one faces the player across. Fixed height. */
function SeatPanel({ controller, team, threats }: { controller: GameController; team: Team; threats: Set<string> }) {
  const g = controller.game;
  const mine = g.status === 'playing' && controller.decider() === team;
  const last = g.log[g.log.length - 1];
  const sel = controller.selectedId ? g.units[controller.selectedId] : null;
  const [sheet, setSheet] = useState<'roster' | 'unit' | null>(null);
  useBack(!!sheet, () => setSheet(null), 'dialog');
  const heroes = livingHeroes(g, team).length;
  useEffect(() => {
    if (sheet === 'unit' && (!sel || !sel.alive)) setSheet(null);
  }, [sel, sheet]);
  return (
    <div className={`seat ${team}${team === 'p2' ? ' mirrored' : ''}${mine ? ' active' : ''}`}>
      <div className="seat-top">
        <span className={`team-badge ${team}`}>{TEAM_NAMES[team]}</span>
        {controller.showScore && <SeatScore controller={controller} team={team} />}
        <Tokens controller={controller} team={team} who="Runes" />
        <span className="count">{heroes} heroes</span>
        <span className="grow" />
        <span className={`seat-status${mine ? ' go' : ''}`}>{statusFor(controller, team)}</span>
        <button type="button" className="btn ghost tiny" onClick={() => setSheet('roster')}>
          Team
        </button>
      </div>
      <div className="seat-body">
        {mine && sel && sel.alive ? (
          <div className="seat-sel">
            <button
              type="button"
              className={`seat-sel-btn ${sel.team}`}
              onClick={() => setSheet('unit')}
              aria-label="Unit details"
            >
              <SelTrigger controller={controller} unit={sel} threats={threats} />
              <span className="acc-chev">›</span>
            </button>
            <SkillButton controller={controller} inline />
          </div>
        ) : (
          <p className={`seat-msg ${mine ? controller.msgKind : ''}`}>
            {mine && controller.msg ? controller.msg : last?.text}
          </p>
        )}
      </div>
      {sheet && (
        <div className="seat-sheet" onClick={() => setSheet(null)}>
          <div className="seat-sheet-card" onClick={(event) => event.stopPropagation()}>
            {/* the header stays put while the details scroll; tapping it collapses the sheet */}
            <button
              type="button"
              className="seat-sheet-head"
              onClick={() => setSheet(null)}
              aria-expanded="true"
              aria-label="Collapse"
            >
              {sheet === 'roster' ? (
                <TeamHead controller={controller} team={team} />
              ) : sel && sel.alive ? (
                <SelTrigger controller={controller} unit={sel} threats={threats} />
              ) : null}
              <span className="sheet-close" aria-hidden="true">
                ✕
              </span>
            </button>
            <div className="seat-sheet-body">
              {sheet === 'roster' ? (
                <TeamRoster controller={controller} team={team} threats={threats} />
              ) : sel && sel.alive ? (
                <SelDetail controller={controller} unit={sel} />
              ) : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function GameScreen({ ctrl, roomCode, rematch, onRematch, onChangeHeroes, onHome, onReplays }: Props) {
  const c = useCtrl(ctrl);
  useEffect(() => {
    (window as unknown as { __hgCtrl?: GameController }).__hgCtrl = ctrl;
  }, [ctrl]); // test hook: inspect/drive the match from devtools
  const host = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [inSettings, setInSettings] = useState(false); // the pause menu's Settings page
  const closeMenu = () => {
    setMenu(false);
    setInSettings(false);
  };
  const [focus, setFocus] = useState(false); // full screen board (bot / online): panels hide, the board grows
  useEffect(() => {
    // Also ask the browser for real full screen where it exists (not iPhone Safari); the layout works without it.
    const el = document.documentElement;
    const standalone = window.matchMedia?.('(display-mode: standalone)').matches;
    if (focus && !standalone && !document.fullscreenElement && el.requestFullscreen)
      el.requestFullscreen().catch(() => {});
    if (!focus && document.fullscreenElement && document.exitFullscreen) document.exitFullscreen().catch(() => {});
  }, [focus]);
  useEffect(
    () => () => {
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    },
    [],
  );
  const [rules, setRules] = useState(false);
  // The phone's back: leave full screen, else open the menu (never drop out of a match by accident).
  useBack(true, () => (focus ? setFocus(false) : setMenu(true)), 'panel');
  useBack(menu && inSettings, () => setInSettings(false), 'dialog');
  const local = c.mode.kind === 'local';
  const g = c.game;

  useEffect(() => {
    if (!host.current) return;
    ctrl.attach(host.current, g.turn === 1);
    return () => ctrl.detach();
  }, [ctrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.target instanceof HTMLInputElement) return;
      if (event.key === 'Escape') {
        if (menu) {
          if (inSettings) setInSettings(false);
          else closeMenu();
        } else ctrl.escape();
      }
      if (event.key.toLowerCase() === 'q') ctrl.armSkill();
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
        event.preventDefault();
        if (event.shiftKey) ctrl.redo();
        else ctrl.undo();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctrl, menu, inSettings]);

  const threats: Set<string> = c.showThreats && g.status === 'playing' ? getThreats(g, g.current) : new Set();
  const over = g.status !== 'playing';
  const winner = over ? (g.status as Team) : null;
  const loser = winner ? other(winner) : null;
  const status = statusFor(c);
  const waiting = g.status === 'playing' && !c.deciderIsHuman();

  const me: Team = c.viewer();
  const them = other(me);
  const topbar = !local && (
    <>
      <div className="statusbar">
        <span className="sb-side left">
          <Tokens controller={c} team={me} who="You" active={!over && c.decider() === me} />
        </span>
        <span
          key={`${over ? g.status : c.decider()}-${over}`}
          className={`turn-banner ${over ? g.status : c.decider()}${waiting ? ' waiting' : ''}${over ? ' over' : ''}${!over && g.phase === 'react' && c.deciderIsHuman() ? ' react-ask' : ''}`}
        >
          {!over && (
            <span className={`turn-arrow ${c.decider() === me ? 'to-left' : 'to-right'}`} aria-hidden="true">
              {c.decider() === me ? '◂' : '▸'}
            </span>
          )}
          <span className={`turn-text${waiting ? ' thinking' : ''}`}>{status}</span>
        </span>
        <span className="sb-side right">
          <Tokens
            controller={c}
            team={them}
            who={c.mode.kind === 'bot' ? 'Bot' : 'Opponent'}
            active={!over && c.decider() === them}
          />
        </span>
      </div>
      {c.showScore && <ScoreStrip controller={c} />}
    </>
  );

  const overlay = over && (
    <div className="overlay win">
      <div>
        <h2>{local ? `${TEAM_NAMES[g.status]} wins` : status}</h2>
        {c.timedOut() ? (
          <p>{TEAM_NAMES[loser!]} ran out of time</p>
        ) : (
          <p>
            {TEAM_NAMES[loser!]} has no heroes left ·{' '}
            {livingHeroes(g, winner!)
              .map((unit) => HEROES[unit.hero].name)
              .join(', ')}{' '}
            still standing
          </p>
        )}
        {c.showScore && <p className="final-score">{seriesLine(c)}</p>}
        <div className="over-actions">
          <button className="btn primary big" type="button" disabled={rematch.disabled} onClick={onRematch}>
            {rematch.label}
          </button>
          <div className="over-sub">
            <button className="btn" type="button" onClick={onChangeHeroes}>
              Change heroes
            </button>
            {onReplays && (
              <button className="btn" type="button" onClick={onReplays}>
                Watch replay
              </button>
            )}
            <button className="btn" type="button" onClick={onHome}>
              Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  // Online: a lost connection blocks the board with its own notice instead of crowding the status bar.
  const offline = c.mode.kind === 'online' && !over && (c.selfOffline || !c.peerHere || c.peerLeft);
  const offlineNotice = offline && (
    <div className="conn-block" role="alert">
      <div>
        <b>{c.selfOffline ? 'Connection lost' : c.peerLeft ? 'Opponent left' : 'Opponent disconnected'}</b>
        <span>{c.selfOffline ? 'Reconnecting… the match is paused.' : 'The match is paused until they return.'}</span>
      </div>
    </div>
  );

  const board = (
    <div className="board-host-wrap">
      <div className="board-host" ref={host} />
      {overlay}
      {offlineNotice}
      {c.mode.kind === 'online' && <ChatBubble />}
      <Toast controller={c} mirror={local && g.status === 'playing' && c.decider() === 'p2'} />
    </div>
  );

  return (
    <div className={`game-screen${focus ? ' focus' : ''}`}>
      {local ? (
        <div className="faceoff">
          {/* the top seat grows away from the board, so the board stays put */}
          <div className="seat-slot top">
            <SeatPanel controller={c} team="p2" threats={threats} />
          </div>
          {board}
          <Controls controller={c} onMenu={() => setMenu(true)} local />
          <SeatPanel controller={c} team="p1" threats={threats} />
        </div>
      ) : (
        <div className="stage">
          <section aria-label="Board" className="board-col">
            {topbar}
            {board}
            <Controls
              controller={c}
              onMenu={() => setMenu(true)}
              roomCode={roomCode}
              focus={focus}
              onFocus={() => setFocus((current) => !current)}
            />
            <SelectedAccordion controller={c} threats={threats} />
          </section>
          <aside className="ledger">
            <Accordion className="panel-acc" trigger={<span className="acc-title">Teams</span>} defaultOpen={false}>
              <div className="roster">
                <div>
                  <TeamHead controller={c} team="p1" />
                  <TeamRoster controller={c} team="p1" threats={threats} />
                </div>
                <div>
                  <TeamHead controller={c} team="p2" />
                  <TeamRoster controller={c} team="p2" threats={threats} />
                </div>
              </div>
            </Accordion>
            <div>
              <p className="eyebrow">Battle log</p>
              <Log controller={c} />
            </div>
          </aside>
        </div>
      )}

      <Modal open={menu} onClose={closeMenu} label={inSettings ? 'Settings' : 'Menu'} className="menu-card">
        {inSettings ? (
          <>
            <h2>Settings</h2>
            <div className="menu-setting">
              <Switch
                checked={c.showThreats}
                onChange={(enabled) => c.setThreats(enabled)}
                label={
                  <>
                    <b>Show threats</b>
                    <small>Mark units an enemy can capture next turn</small>
                  </>
                }
              />
            </div>
            <div className="menu-setting score-setting">
              <Switch
                checked={c.showScore}
                onChange={(enabled) => c.setScore(enabled)}
                label={
                  <>
                    <b>Show score</b>
                    <small>Wins for each side across rematches: {seriesLine(c)}</small>
                  </>
                }
              />
              <button
                className="btn ghost"
                type="button"
                onClick={() => c.resetScore()}
                disabled={!c.tally().a && !c.tally().b}
              >
                Reset
              </button>
            </div>
            <div className="menu-setting">
              <SoundSetting />
            </div>
            <div className="menu-setting cursor-setting">
              <b>Mouse cursor</b>
              <CursorPicker />
            </div>
            <button className="btn primary big" type="button" onClick={() => setInSettings(false)}>
              Back
            </button>
          </>
        ) : (
          <>
            <h2>Paused</h2>
            <button className="btn primary big" type="button" onClick={closeMenu}>
              Resume
            </button>
            <button className="btn big" type="button" onClick={() => setInSettings(true)}>
              Settings
            </button>
            <button
              className="btn big"
              type="button"
              onClick={() => {
                closeMenu();
                setRules(true);
              }}
            >
              How to play
            </button>
            {c.mode.kind !== 'online' && (
              <button
                className="btn big"
                type="button"
                onClick={() => {
                  closeMenu();
                  onRematch();
                }}
              >
                Restart match
              </button>
            )}
            <button
              className="btn big"
              type="button"
              onClick={() => {
                closeMenu();
                onChangeHeroes();
              }}
            >
              Change heroes
            </button>
            <button
              className="btn big"
              type="button"
              onClick={() => {
                closeMenu();
                onHome();
              }}
            >
              {c.mode.kind === 'online' ? 'Leave room' : 'Quit to home'}
            </button>
          </>
        )}
      </Modal>
      <Modal open={rules} onClose={() => setRules(false)} label="How to play" className="wide">
        <Rules />
        <button className="btn primary" type="button" onClick={() => setRules(false)}>
          Close
        </button>
      </Modal>
    </div>
  );
}
