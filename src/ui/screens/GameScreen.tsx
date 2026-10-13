import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import {
  HEROES, MAPS, TEAM_NAMES as TN, ENERGY, CREEPS, ROLES, label, heroDef, livingHeroes, moveOptions, samePos,
  squareName, skillCooldown, skillActions, getThreats,
} from '../../arena.js';
import { BOT_TEAM, type GameController } from '../game/controller';
const TEAM_NAMES = TN as Record<string, string>;
import { ICON, ART, MAP_ART, costLabel, other, tk, type Team } from '../data';
import { BEAST_SVG, CREEP_SVG } from '../game/board.js';
import { Rules } from '../components/Rules';

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

/** The decision prompts: interrupt, beast/ice/storm follow-ups. Rendered for the deciding human. */
function Prompt({ c }: { c: GameController }) {
  const g = c.game;
  if (g.status !== 'playing' || !c.deciderIsHuman()) return null;
  if (g.phase === 'react') {
    const pend = g.pending.action; const actor = g.units[pend.unitId]; const plant = g.units[g.pending.plantId];
    const cost = HEROES.plantae.skill.reactionCost ?? HEROES.plantae.skill.cost;
    return (
      <div className="prompt react">
        <img src={ICON('plantae')} alt="" />
        <span className="pt"><b>Interrupt?</b> {label(actor)} is about to {describe(g, pend)}.
          <small>Cancel it for {tk(cost)} (you have {g.energy[plant.team]}). Plantae is then rooted on your next turn.</small></span>
        <span className="row"><button className="btn vine" type="button" onClick={() => c.react(true)}>Root it</button>
          <button className="btn" type="button" onClick={() => c.react(false)}>Let it happen</button></span>
      </div>
    );
  }
  if (g.phase === 'beast' || g.phase === 'ice' || g.phase === 'storm') {
    const have = `you have ${g.energy[g.current]}`;
    const text = g.phase === 'beast' ? 'Wild Company: move the beast now (free), or skip.'
      : g.phase === 'ice' ? `Icy Step: tap a dashed square to raise ice for ${tk(HEROES.aqna.skill.cost)} (${have}), or skip.`
        : `Storm Hammer: slam for ${tk(HEROES.hexor.skill.cost)} (${have}) and push everything around Hexor, or skip.`;
    return (
      <div className="prompt phase">
        <span className="pt">{text}</span>
        <span className="row">
          {g.phase === 'storm' && <button className="btn primary" type="button" onClick={() => c.slam()}>Slam</button>}
          <button className="btn" type="button" onClick={() => c.skip()}>Skip</button>
        </span>
      </div>
    );
  }
  return null;
}

function Pips({ n }: { n: number }) {
  return <span className="energy" title={`${n} of ${ENERGY.max} skill tokens`}>{Array.from({ length: ENERGY.max }, (_, i) => <i key={i} className={i < n ? 'on' : ''} />)}</span>;
}

function TeamRoster({ c, team, threats }: { c: GameController; team: Team; threats: Set<string> }) {
  const g = c.game;
  const all = Object.values(g.units).filter((u: any) => u.team === team) as any[];
  const units = all.filter((u) => u.kind !== 'creep');
  const heroes = units.filter((u) => u.kind === 'hero');
  const creeps = all.filter((u) => u.kind === 'creep');
  return (
    <div className="troster">
      <div className="team"><span className={`swatch ${team}`} />{TEAM_NAMES[team]}<Pips n={g.energy[team]} /><span className="count">{heroes.filter((u) => u.alive).length}/{heroes.length}</span></div>
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

/** The selected unit: moves, skill, and the button to use it. */
function Selected({ c, compact }: { c: GameController; compact?: boolean }) {
  const g = c.game;
  const u = c.selectedId ? g.units[c.selectedId] : null;
  if (!u || !u.alive) return compact ? null : <p className="empty">Tap a unit to see its moves and skill. Tap an enemy to see its reach.</p>;
  const d = heroDef(u);
  const own = u.team === g.current && g.status === 'playing' && c.deciderIsHuman() && g.phase === 'main';
  let skill = null;
  if (u.kind === 'hero') {
    const sk = d.skill;
    const cd = skillCooldown(u);
    const can = skillActions(g, u).length > 0;
    skill = (
      <div className="skill">
        <b>{sk.name}<em>{costLabel(sk).toLowerCase()}{sk.range ? ` · range ${sk.range}` : ''}{sk.cooldown ? ` · cooldown ${sk.cooldown}` : ''}</em></b>
        {!compact && <span>{sk.text}</span>}
        {cd > 0 && <span className="cdn-note">Recharging: ready in {cd} turn{cd > 1 ? 's' : ''}.</span>}
        {sk.type === 'active' && own && (
          <button className={`btn use${c.armed ? ' primary' : ''}`} type="button" disabled={!can && !c.armed} onClick={() => c.armSkill()}>
            {c.armed ? 'Cancel' : cd ? `Ready in ${cd}` : `Use ${sk.name}`}
          </button>
        )}
      </div>
    );
  } else if (u.kind === 'creep') {
    skill = <div className="skill"><b>Minion</b><span>Moving a creep uses your turn. Killing an enemy creep gives +{tk(CREEPS.lastHit)}; reaching the far side gives +{tk(CREEPS.breach)}.</span></div>;
  } else {
    skill = <div className="skill"><b>Companion</b><span>Moves free right after Ge'nga acts. It can capture like any unit.</span></div>;
  }
  const art = u.kind === 'beast' ? ART('genga') : u.kind === 'creep' ? ART(MAP_ART[(MAPS as any)[g.map].theme] || 'hexor') : ART(u.hero);
  return (
    <div className={`hpanel${compact ? ' compact' : ''}`}>
      {!compact && <div className="hart" style={{ backgroundImage: `url(${art})` }} />}
      <div className="hbody">
        <div className="head"><span className={`swatch ${u.team}`} /><span className="name">{d.name}</span>
          <span className="sub">{u.kind === 'hero' && d.role ? (ROLES as any)[d.role] : d.title} · {squareName(u.pos)}</span>
          {u.warded && <span className="chip wd">Empty Grave</span>}{u.rooted > 0 && <span className="chip rt">rooted</span>}</div>
        <div className="sub">{d.moveText}</div>
        {skill}
      </div>
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

/** One player's side in face-to-face play; the top one is turned to face the player across. */
function SeatPanel({ c, team, threats }: { c: GameController; team: Team; threats: Set<string> }) {
  const g = c.game;
  const mine = g.status === 'playing' && c.decider() === team;
  const lastLines = g.log.slice(-2).reverse();
  return (
    <div className={`seat ${team}${team === 'p2' ? ' mirrored' : ''}${mine ? ' active' : ''}`}>
      <div className="seat-top">
        <span className={`swatch ${team}`} />
        <b className="seat-name">{TEAM_NAMES[team]}</b>
        <Pips n={g.energy[team]} />
        <span className="count">{livingHeroes(g, team).length} heroes</span>
        <span className="grow" />
        <span className={`seat-status${mine ? ' go' : ''}`}>{statusFor(c, team)}</span>
      </div>
      {mine && <Prompt c={c} />}
      {mine && c.msg && <p className={`msg ${c.msgKind}`}>{c.msg}</p>}
      {mine && <Selected c={c} compact />}
      {!mine && <ul className="seat-log">{lastLines.map((l: any, i: number) => <li key={i}><span className={`swatch ${l.team || ''}`} />{l.text}</li>)}</ul>}
      <details className="seat-roster"><summary>Team</summary><TeamRoster c={c} team={team} threats={threats} /></details>
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
      <span className="grow" />
      <label className="toggle"><input type="checkbox" checked={c.showThreats} onChange={(e) => c.setThreats(e.target.checked)} /> Threats</label>
      {c.mode.kind !== 'online' && <button className="btn" type="button" disabled={!c.canUndo()} onClick={() => c.undo()}>Undo</button>}
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

  return (
    <div className={`game-screen${local ? ' local' : ''}`}>
      {topbar}
      {local ? (
        <div className="faceoff">
          <SeatPanel c={c} team="p2" threats={threats} />
          <div className="board-host-wrap"><div className="board-host" ref={host} />{overlay}</div>
          <SeatPanel c={c} team="p1" threats={threats} />
        </div>
      ) : (
        <div className="stage">
          <section aria-label="Board">
            <Prompt c={c} />
            <div className="board-host-wrap"><div className="board-host" ref={host} />{overlay}</div>
            <p className={`msg below ${c.msgKind}`} role="status" aria-live="polite">{c.msg}</p>
          </section>
          <aside className="ledger">
            <div className="roster">
              <TeamRoster c={c} team="p1" threats={threats} />
              <TeamRoster c={c} team="p2" threats={threats} />
            </div>
            <div><p className="eyebrow">Selected</p><Selected c={c} /></div>
            <div><p className="eyebrow">Battle log</p><Log c={c} /></div>
          </aside>
        </div>
      )}

      {menu && (
        <div className="modal" role="dialog" aria-label="Menu" onClick={() => setMenu(false)}>
          <div className="modal-card menu-card" onClick={(e) => e.stopPropagation()}>
            <h2>Paused</h2>
            <button className="btn primary big" type="button" onClick={() => setMenu(false)}>Resume</button>
            <button className="btn big" type="button" onClick={() => { setMenu(false); setRules(true); }}>How to play</button>
            {c.mode.kind !== 'online' && <button className="btn big" type="button" onClick={() => { setMenu(false); onRematch(); }}>Restart match</button>}
            <button className="btn big" type="button" onClick={() => { setMenu(false); onChangeHeroes(); }}>Change heroes</button>
            <button className="btn big" type="button" onClick={() => { setMenu(false); onHome(); }}>{c.mode.kind === 'online' ? 'Leave room' : 'Quit to home'}</button>
          </div>
        </div>
      )}
      {rules && (
        <div className="modal" role="dialog" aria-label="How to play" onClick={() => setRules(false)}>
          <div className="modal-card wide" onClick={(e) => e.stopPropagation()}>
            <Rules />
            <button className="btn primary" type="button" onClick={() => setRules(false)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}
