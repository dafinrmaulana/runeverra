import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  HEROES, MAPS, TEAM_NAMES as TN, ENERGY, CREEPS, ROLES, label, heroDef, livingHeroes, moveOptions, samePos,
  squareName, skillCooldown, skillActions, getThreats,
} from '../../arena.js';
import { BOT_TEAM, type GameController } from '../game/controller';
import { ICON, ART, MAP_ART, SHORT, costLabel, costChip, other, tk, type Team } from '../data';
import { BEAST_SVG, CREEP_SVG } from '../game/board.js';
import { Rules } from '../components/Rules';
import { MoveDiagram } from '../components/HeroInfo';
import { Modal, Switch, Accordion } from '../components/ui';

const TEAM_NAMES = TN as Record<string, string>;

type Props = {
  ctrl: GameController;
  roomCode?: string | null;
  /** Online: what the rematch button should say / whether it is waiting. */
  rematch: { label: string; disabled: boolean };
  onRematch: () => void;
  onChangeHeroes: () => void;
  onHome: () => void;
};

function useCtrl(ctrl: GameController) {
  useSyncExternalStore(ctrl.subscribe, ctrl.getVersion);
  return ctrl;
}

function statusFor(c: GameController, team?: Team) {
  const g = c.game;
  if (g.status !== 'playing') {
    if (c.mode.kind === 'online') return g.status === c.mode.side ? 'You win' : 'You lose';
    if (c.mode.kind === 'bot') return g.status === BOT_TEAM ? 'The bot wins' : 'You win';
    return team ? (g.status === team ? 'You win' : 'You lose') : `${TEAM_NAMES[g.status]} wins`;
  }
  const d = c.decider()!;
  if (c.mode.kind === 'online') {
    if (!c.peerHere) return 'Opponent disconnected · waiting';
    if (c.peerLeft) return 'Opponent left the match';
    return c.deciderIsHuman() ? 'Your turn' : 'Opponent\'s turn';
  }
  if (c.mode.kind === 'bot') return c.deciderIsBot() ? (g.phase === 'react' ? 'Bot is deciding whether to root' : 'Bot is thinking') : 'Your turn';
  if (team) return d === team ? 'Your turn' : `${TEAM_NAMES[d]}'s turn`;
  return `${TEAM_NAMES[d]} to act`;
}

function describe(s: any, a: any) {
  const u = s.units[a.unitId];
  if (a.type === 'skill') return a.skill === 'summon' ? `summon the beast on ${squareName(a.to)}` : `cast ${(HEROES as any)[u.hero].skill.name} on ${label(s.units[a.targetId])}`;
  const o = moveOptions(s, u).find((x: any) => samePos(x.to, a.to));
  if (o?.backstab) return `Backstab to ${squareName(a.to)}${o.kills.length ? `, eliminating ${o.kills.map((id: string) => label(s.units[id])).join(' and ')}` : ''}`;
  if (o?.kills.length) return `strike ${label(s.units[o.kills[0]])} on ${squareName(a.to)}`;
  return `move to ${squareName(a.to)}`;
}

/**
 * Decision prompts (interrupt, beast/ice/storm follow-ups) as a toast floating over the
 * board, so the board itself never moves. Face to face, it sits at the deciding player's edge.
 */
function Toast({ c, local }: { c: GameController; local: boolean }) {
  const g = c.game;
  if (g.status !== 'playing' || !c.deciderIsHuman()) return null;
  const side: Team = c.decider()!;
  const pos = local && side === 'p2' ? 'top mirrored' : local ? 'bottom' : 'top';
  let body = null;
  if (g.phase === 'react') {
    const pend = g.pending.action; const actor = g.units[pend.unitId]; const plant = g.units[g.pending.plantId];
    const cost = HEROES.plantae.skill.reactionCost ?? HEROES.plantae.skill.cost;
    body = (
      <>
        <img src={ICON('plantae')} alt="" />
        <span className="pt"><b>Interrupt?</b> {label(actor)} is about to {describe(g, pend)}.
          <small>Cancel it for {tk(cost)} (you have {g.energy[plant.team]}). Plantae is then rooted on your next turn.</small></span>
        <span className="row"><button className="btn vine" type="button" onClick={() => c.react(true)}>Root it</button>
          <button className="btn" type="button" onClick={() => c.react(false)}>Let it happen</button></span>
      </>
    );
  } else if (g.phase === 'beast' || g.phase === 'ice' || g.phase === 'storm') {
    const have = `you have ${g.energy[g.current]}`;
    const text = g.phase === 'beast' ? 'Wild Company: move the beast now (free), or skip.'
      : g.phase === 'ice' ? `Icy Step: tap a dashed square to raise ice for ${tk(HEROES.aqna.skill.cost)} (${have}), or skip.`
        : `Storm Hammer: slam for ${tk(HEROES.hexor.skill.cost)} (${have}) and push everything around Hexor, or skip.`;
    body = (
      <>
        <span className="pt">{text}</span>
        <span className="row">
          {g.phase === 'storm' && <button className="btn primary" type="button" onClick={() => c.slam()}>Slam</button>}
          <button className="btn" type="button" onClick={() => c.skip()}>Skip</button>
        </span>
      </>
    );
  }
  if (!body) return null;
  return <div key={`${g.turn}-${g.phase}`} className={`toast ${g.phase === 'react' ? 'react' : 'phase'} ${pos}`} role="alertdialog">{body}</div>;
}

function Pips({ n }: { n: number }) {
  return <span className="energy" title={`${n} of ${ENERGY.max} skill tokens`}>{Array.from({ length: ENERGY.max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>;
}

function TeamRoster({ c, team, threats }: { c: GameController; team: Team; threats: Set<string> }) {
  const g = c.game;
  const all = Object.values(g.units).filter((u: any) => u.team === team) as any[];
  const units = all.filter((u) => u.kind !== 'creep');
  const creeps = all.filter((u) => u.kind === 'creep');
  return (
    <div className="troster">
      <ul>
        {units.map((u) => (
          <li key={u.id} className={u.alive ? '' : 'dead'}>
            <button type="button" disabled={!u.alive} onClick={() => g.status === 'playing' && c.select(u.id)} aria-pressed={c.selectedId === u.id}>
              {u.kind === 'beast' ? <span className="bk" dangerouslySetInnerHTML={{ __html: BEAST_SVG }} /> : <img src={ICON(u.hero)} alt="" />}
              <span>{u.kind === 'beast' ? 'Beast' : (HEROES as any)[u.hero].name}</span>
              {u.warded && <span className="chip wd">grave</span>}
              {u.rooted > 0 && <span className="chip rt">rooted</span>}
              {skillCooldown(u) > 0 && <span className="chip cdn" title="Skill recharging">cd {skillCooldown(u)}</span>}
              {threats.has(u.id) && <span className="chip th">threat</span>}
            </button>
          </li>
        ))}
      </ul>
      {creeps.length > 0 && <div className="creeps"><span className="bk" dangerouslySetInnerHTML={{ __html: CREEP_SVG }} />Creeps {creeps.filter((x) => x.alive).length}/{creeps.length}</div>}
    </div>
  );
}

function TeamHead({ c, team }: { c: GameController; team: Team }) {
  const g = c.game;
  const heroes = Object.values(g.units).filter((u: any) => u.team === team && u.kind === 'hero') as any[];
  return (
    <span className="team-head"><span className={`swatch ${team}`} />{TEAM_NAMES[team]}<Pips n={g.energy[team]} />
      <span className="count">{heroes.filter((u) => u.alive).length}/{heroes.length}</span></span>
  );
}

/** One line that says what a unit is about: shown as the accordion trigger. */
function shortLine(u: any) {
  if (u.kind === 'creep') return 'Pawn: 1 forward, captures diagonally forward.';
  if (u.kind === 'beast') return 'Moves free right after Ge\'nga. Captures like any unit.';
  return SHORT[u.hero]?.skill || '';
}

/** The selected unit, right under the board: a short line, expandable to full details. */
function SelectedAccordion({ c, compact }: { c: GameController; compact?: boolean }) {
  const g = c.game;
  const u = c.selectedId ? g.units[c.selectedId] : null;
  if (!u || !u.alive) {
    return compact ? null : <div className="sel-empty">Tap a unit to see what it does. Tap an enemy to see its reach.</div>;
  }
  const d = heroDef(u);
  const hero = u.kind === 'hero';
  const sk = hero ? d.skill : null;
  const cd = hero ? skillCooldown(u) : 0;
  const art = u.kind === 'beast' ? ART('genga') : u.kind === 'creep' ? ART(MAP_ART[(MAPS as any)[g.map].theme] || 'hexor') : ART(u.hero);
  const trigger = (
    <span className="sel-trigger">
      {u.kind === 'hero' ? <img src={ICON(u.hero)} alt="" /> : <span className="bk" dangerouslySetInnerHTML={{ __html: u.kind === 'beast' ? BEAST_SVG : CREEP_SVG }} />}
      <span className="sel-text">
        <span className="sel-name"><span className={`swatch ${u.team}`} />{d.name}
          <span className="sub">{hero && d.role ? (ROLES as any)[d.role] : d.title} · {squareName(u.pos)}</span>
          {sk && <span className="cost">{costChip(sk)}</span>}
          {u.warded && <span className="chip wd">grave</span>}{u.rooted > 0 && <span className="chip rt">rooted</span>}
          {cd > 0 && <span className="chip cdn">cd {cd}</span>}</span>
        <span className="sel-short">{hero ? <><b>{sk.name}:</b> {shortLine(u)}</> : shortLine(u)}</span>
      </span>
    </span>
  );
  return (
    <Accordion key={u.id} className={`sel-acc ${u.team}`} trigger={trigger}>
      <div className="sel-detail" style={{ ['--art' as any]: `url(${art})` }}>
        <div className="sel-move">{hero ? <MoveDiagram hero={u.hero} size={8} /> : null}<span>{d.moveText}</span></div>
        {hero && (
          <div className="sel-skill">
            <b>{sk.name}</b> <span className="meta">{costLabel(sk)}{sk.range ? ` · range ${sk.range}` : ''}{sk.cooldown ? ` · cooldown ${sk.cooldown}` : ''}</span>
            <p>{sk.text}</p>
            {cd > 0 && <p className="cdn-note">Recharging: ready in {cd} turn{cd > 1 ? 's' : ''}.</p>}
          </div>
        )}
        {u.kind === 'creep' && <p>Moving a creep uses your turn. Killing an enemy creep gives +{tk(CREEPS.lastHit)}; reaching the far side gives +{tk(CREEPS.breach)}.</p>}
      </div>
    </Accordion>
  );
}

/** Use-skill button for the selected unit, when it is this human's call. */
function SkillButton({ c }: { c: GameController }) {
  const g = c.game;
  const u = c.selectedId ? g.units[c.selectedId] : null;
  const own = !!u && u.alive && u.kind === 'hero' && u.team === g.current && g.status === 'playing' && c.deciderIsHuman() && g.phase === 'main';
  const sk = u && u.kind === 'hero' ? (HEROES as any)[u.hero].skill : null;
  if (!own || !sk || sk.type !== 'active') {
    return <button className="btn skill-btn" type="button" disabled>{sk && own ? `${sk.name} is passive` : 'Select your hero to use its skill'}</button>;
  }
  const cd = skillCooldown(u);
  const can = skillActions(g, u).length > 0;
  return (
    <button className={`btn skill-btn${c.armed ? ' armed' : ' primary'}`} type="button" disabled={!can && !c.armed} onClick={() => c.armSkill()}>
      {c.armed ? 'Cancel skill' : cd ? `${sk.name} · ready in ${cd}` : `Use ${sk.name} · ${tk(sk.cost)}`}<kbd>Q</kbd>
    </button>
  );
}

function Controls({ c }: { c: GameController }) {
  return (
    <div className="controls-row">
      <SkillButton c={c} />
      <span className="grow" />
      {c.mode.kind !== 'online' && (
        <span className="undo-redo">
          <button className="btn icon" type="button" disabled={!c.canUndo()} onClick={() => c.undo()} aria-label="Undo" title="Undo">↶ Undo</button>
          <button className="btn icon" type="button" disabled={!c.canRedo()} onClick={() => c.redo()} aria-label="Redo" title="Redo">Redo ↷</button>
        </span>
      )}
      <Switch checked={c.showThreats} onChange={(v) => c.setThreats(v)} label="Threats" />
    </div>
  );
}

function Log({ c, limit = 40 }: { c: GameController; limit?: number }) {
  const items = c.game.log.slice(-limit).reverse();
  return (
    <ol className="log">
      {items.map((l: any, i: number) => (
        <li key={c.game.log.length - i}><span className="t">{l.turn || ''}</span><span className={`swatch ${l.team || ''}`} style={l.team ? undefined : { background: 'var(--muted)' }} /><span>{l.text}</span></li>
      ))}
    </ol>
  );
}

/** One player's side in face-to-face play; the top one faces the player across. Fixed height. */
function SeatPanel({ c, team, threats }: { c: GameController; team: Team; threats: Set<string> }) {
  const g = c.game;
  const mine = g.status === 'playing' && c.decider() === team;
  const last = g.log[g.log.length - 1];
  const sel = c.selectedId ? g.units[c.selectedId] : null;
  const [roster, setRoster] = useState(false);
  return (
    <div className={`seat ${team}${team === 'p2' ? ' mirrored' : ''}${mine ? ' active' : ''}`}>
      <div className="seat-top">
        <TeamHead c={c} team={team} />
        <span className="grow" />
        <span className={`seat-status${mine ? ' go' : ''}`}>{statusFor(c, team)}</span>
        <button type="button" className="btn ghost tiny" onClick={() => setRoster(true)}>Team</button>
      </div>
      <div className="seat-body">
        {mine && sel && sel.alive ? <><SelectedAccordion c={c} compact /><SkillButton c={c} /></>
          : <p className={`seat-msg ${mine ? c.msgKind : ''}`}>{mine && c.msg ? c.msg : last?.text}</p>}
      </div>
      {roster && (
        <div className="seat-sheet" onClick={() => setRoster(false)}>
          <div className="seat-sheet-card" onClick={(e) => e.stopPropagation()}>
            <TeamRoster c={c} team={team} threats={threats} />
            <button type="button" className="btn" onClick={() => setRoster(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

export function GameScreen({ ctrl, roomCode, rematch, onRematch, onChangeHeroes, onHome }: Props) {
  const c = useCtrl(ctrl);
  const host = useRef<HTMLDivElement>(null);
  const [menu, setMenu] = useState(false);
  const [rules, setRules] = useState(false);
  const local = c.mode.kind === 'local';
  const g = c.game;

  useEffect(() => {
    if (!host.current) return;
    ctrl.attach(host.current, g.turn === 1);
    return () => ctrl.detach();
  }, [ctrl]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === 'Escape') { if (menu) setMenu(false); else ctrl.escape(); }
      if (e.key.toLowerCase() === 'q') ctrl.armSkill();
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) ctrl.redo(); else ctrl.undo(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [ctrl, menu]);

  const threats: Set<string> = c.showThreats && g.status === 'playing' ? getThreats(g, g.current) : new Set();
  const over = g.status !== 'playing';
  const loser = over ? other(g.status) : null;
  const status = statusFor(c);
  const waiting = g.status === 'playing' && !c.deciderIsHuman();

  const topbar = (
    <div className="gamebar">
      <button className="btn" type="button" onClick={() => setMenu(true)} aria-label="Menu">☰ Menu</button>
      {!local && <span className={`turn${waiting ? ' thinking' : ''}`}><span className={`swatch ${over ? g.status : c.decider()}`} />{status}</span>}
      {local && <span className="turn small">Face to face</span>}
      <span className="turn-num">turn {g.turn}{roomCode ? ` · room ${roomCode}` : ''}</span>
    </div>
  );

  const overlay = over && (
    <div className="overlay win">
      <div>
        <h2>{local ? `${TEAM_NAMES[g.status]} wins` : status}</h2>
        <p>{TEAM_NAMES[loser!]} has no heroes left · {livingHeroes(g, g.status).map((u: any) => (HEROES as any)[u.hero].name).join(', ')} still standing</p>
        <div className="row">
          <button className="btn primary" type="button" disabled={rematch.disabled} onClick={onRematch}>{rematch.label}</button>
          <button className="btn" type="button" onClick={onChangeHeroes}>Change heroes</button>
          <button className="btn" type="button" onClick={onHome}>Home</button>
        </div>
      </div>
    </div>
  );

  const board = (
    <div className="board-host-wrap">
      <div className="board-host" ref={host} />
      <Toast c={c} local={local} />
      {overlay}
    </div>
  );

  return (
    <div className="game-screen">
      {topbar}
      {local ? (
        <div className="faceoff">
          <SeatPanel c={c} team="p2" threats={threats} />
          {board}
          <Controls c={c} />
          <SeatPanel c={c} team="p1" threats={threats} />
        </div>
      ) : (
        <div className="stage">
          <section aria-label="Board" className="board-col">
            {board}
            <Controls c={c} />
            <p className={`msg below ${c.msgKind}`} role="status" aria-live="polite">{c.msg}</p>
            <SelectedAccordion c={c} />
          </section>
          <aside className="ledger">
            <Accordion className="panel-acc" trigger={<span className="acc-title">Teams</span>} defaultOpen={false}>
              <div className="roster">
                <div><TeamHead c={c} team="p1" /><TeamRoster c={c} team="p1" threats={threats} /></div>
                <div><TeamHead c={c} team="p2" /><TeamRoster c={c} team="p2" threats={threats} /></div>
              </div>
            </Accordion>
            <div className="tokens-mini"><TeamHead c={c} team="p1" /><TeamHead c={c} team="p2" /></div>
            <div><p className="eyebrow">Battle log</p><Log c={c} /></div>
          </aside>
        </div>
      )}

      <Modal open={menu} onClose={() => setMenu(false)} label="Menu" className="menu-card">
        <h2>Paused</h2>
        <button className="btn primary big" type="button" onClick={() => setMenu(false)}>Resume</button>
        <button className="btn big" type="button" onClick={() => { setMenu(false); setRules(true); }}>How to play</button>
        {c.mode.kind !== 'online' && <button className="btn big" type="button" onClick={() => { setMenu(false); onRematch(); }}>Restart match</button>}
        <button className="btn big" type="button" onClick={() => { setMenu(false); onChangeHeroes(); }}>Change heroes</button>
        <button className="btn big" type="button" onClick={() => { setMenu(false); onHome(); }}>{c.mode.kind === 'online' ? 'Leave room' : 'Quit to home'}</button>
      </Modal>
      <Modal open={rules} onClose={() => setRules(false)} label="How to play" className="wide">
        <Rules />
        <button className="btn primary" type="button" onClick={() => setRules(false)}>Close</button>
      </Modal>
    </div>
  );
}
