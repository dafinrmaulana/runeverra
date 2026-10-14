import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { CursorPicker } from '../cursor';
import { sideA } from '../record';
import { HeroDemo } from '../components/HeroDemo';
import {
  HEROES, MAPS, TEAM_NAMES as TN, ENERGY, CREEPS, ROLES, label, heroDef, livingHeroes, moveOptions, samePos,
  squareName, skillCooldown, skillActions, getThreats, beastOf,
} from '../../arena.js';
import { type GameController } from '../game/controller';
import { ICON, ART, MAP_ART, SHORT, costLabel, costChip, other, tk, type Team } from '../data';
import { BEAST_SVG, CREEP_SVG } from '../game/board.js';
import { Rules } from '../components/Rules';
import { MoveDiagram, RangeDiagram } from '../components/HeroInfo';
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
  onReplays?: () => void;
};

function useCtrl(ctrl: GameController) {
  useSyncExternalStore(ctrl.subscribe, ctrl.getVersion);
  return ctrl;
}

function statusFor(c: GameController, team?: Team) {
  const g = c.game;
  if (g.status !== 'playing') {
    if (c.mode.kind === 'online') return g.status === c.mode.side ? 'You win' : 'You lose';
    if (c.mode.kind === 'bot') return g.status === c.botTeam() ? 'The bot wins' : 'You win';
    return team ? (g.status === team ? 'You win' : 'You lose') : `${TEAM_NAMES[g.status]} wins`;
  }
  const d = c.decider()!;
  if (c.mode.kind === 'online') {
    if (!c.peerHere) return 'Opponent disconnected · waiting';
    if (c.peerLeft) return 'Opponent left the match';
    return c.deciderIsHuman() ? 'Your turn' : 'Opponent\'s turn';
  }
  if (g.phase === 'react' && c.deciderIsHuman() && (!team || d === team)) return 'Interrupt?';
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
function Toast({ c, only, flow }: { c: GameController; only?: Team; flow?: boolean }) {
  const g = c.game;
  if (g.status !== 'playing' || !c.deciderIsHuman()) return null;
  const side: Team = c.decider()!;
  if (only && side !== only) return null;
  const pos = flow ? 'flow' : 'docked';
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

/** Who's who for the score: ['You', 'Bot'] or ['Ivory', 'Ember'], in a's-then-b's order. */
function sideNames(c: GameController) {
  const k = c.mode.kind;
  return k === 'local' ? [TEAM_NAMES.p1, TEAM_NAMES.p2] : ['You', k === 'bot' ? 'Bot' : 'Opponent'];
}
/** "You 3 – 1 Bot", "Ivory 2 – 2 Ember", "You 1 – 0 Opponent". */
function seriesLine(c: GameController) {
  const t = c.tally(); const [a, b] = sideNames(c);
  return `${a} ${t.a} – ${t.b} ${b}`;
}

const TROPHY = <svg viewBox="0 0 16 16" aria-hidden="true"><path d="M4.5 2h7v3.2a3.5 3.5 0 0 1-7 0zM4.5 3.2H2.4v1.1a2.4 2.4 0 0 0 2.3 2.4M11.5 3.2h2.1v1.1a2.4 2.4 0 0 1-2.3 2.4M8 8.7v2.6M5.4 13.8h5.2l-.6-2.5H6z" /></svg>;

/** A clear, standalone readout of the series score: both sides' wins, side by side. */
function ScoreStrip({ c }: { c: GameController }) {
  const t = c.tally(); const [a, b] = sideNames(c);
  const aTeam = sideA(c.mode.kind, c.viewer()); const bTeam = other(aTeam);
  return (
    <div className="score-strip" role="status" aria-label={`Series score: ${seriesLine(c)}`}>
      <span className={`score-side ${aTeam}`}><span className="who">{a}</span><b key={t.a}>{t.a}</b></span>
      <span className="score-glyph" aria-hidden="true">{TROPHY}</span>
      <span className={`score-side ${bTeam}`}><b key={t.b}>{t.b}</b><span className="who">{b}</span></span>
    </div>
  );
}

/** A seat's own score badge: wins it has – wins the other side has, in its own seat's orientation. */
function SeatScore({ c, team }: { c: GameController; team: Team }) {
  const t = c.tally(); const aTeam = sideA(c.mode.kind, c.viewer());
  const mine = team === aTeam ? t.a : t.b; const theirs = team === aTeam ? t.b : t.a;
  return (
    <span className="seat-score" title={`${mine} win${mine === 1 ? '' : 's'} – ${theirs} win${theirs === 1 ? '' : 's'} this series`}>
      {TROPHY}<b key={mine}>{mine}</b><span className="dash">–</span>{theirs}
    </span>
  );
}

/** A side's skill tokens, labelled. */
function Tokens({ c, team, who, active }: { c: GameController; team: Team; who: string; active?: boolean }) {
  const n = c.game.energy[team];
  return (
    <span className={`tokens ${team}${active ? ' active' : ''}`}>
      <span className={`team-dot ${team}`} /><span className="who">{who}</span>
      <Pips n={n} /><span className="tn">{n}/{ENERGY.max}</span>
    </span>
  );
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
    <span className="team-head"><span className={`team-dot ${team}`} />{TEAM_NAMES[team]}<Pips n={g.energy[team]} />
      <span className="count">{heroes.filter((u) => u.alive).length}/{heroes.length}</span></span>
  );
}

/** One line that says what a unit is about: shown as the accordion trigger. */
function shortLine(u: any) {
  if (u.kind === 'creep') return 'Pawn: 1 forward, captures diagonally forward.';
  if (u.kind === 'beast') return 'Moves free right after Ge\'nga. Captures like any unit.';
  return SHORT[u.hero]?.skill || '';
}

/** Active effects on a unit, in plain words. */
function effectsOf(c: GameController, u: any, threats: Set<string>) {
  const g = c.game;
  const out: { k: string; label: string; text: string }[] = [];
  if (u.warded) out.push({ k: 'wd', label: 'Shielded', text: `Empty Grave: can't be captured, rooted or pushed until ${TEAM_NAMES[u.team]}'s next turn.` });
  if (u.rooted > 0) out.push({ k: 'rt', label: 'Rooted', text: u.team === g.current ? 'Held by roots: can\'t act this turn.' : 'Held by roots: can\'t act on its next turn.' });
  const cd = u.kind === 'hero' ? skillCooldown(u) : 0;
  if (cd > 0) out.push({ k: 'cdn', label: `Recharging ${cd}`, text: `Skill ready in ${cd} turn${cd > 1 ? 's' : ''}.` });
  if (threats.has(u.id)) out.push({ k: 'th', label: 'In danger', text: 'An enemy can capture it on their next turn.' });
  return out;
}

function SelTrigger({ c, u, threats }: { c: GameController; u: any; threats: Set<string> }) {
  const d = heroDef(u);
  const hero = u.kind === 'hero';
  const sk = hero ? d.skill : null;
  const fx = effectsOf(c, u, threats);
  return (
    <span className="sel-trigger">
      {hero ? <img src={ICON(u.hero)} alt="" className={fx.length ? 'has-fx' : ''} /> : <span className="bk" dangerouslySetInnerHTML={{ __html: u.kind === 'beast' ? BEAST_SVG : CREEP_SVG }} />}
      <span className="sel-text">
        <span className="sel-name"><span className={`team-dot ${u.team}`} />{d.name}
          <span className="sub">{hero && d.role ? (ROLES as any)[d.role] : d.title} · {squareName(u.pos)}</span>
          {sk && <span className="cost">{costChip(sk)}</span>}
          {fx.map((f) => <span key={f.k} className={`fx-pill ${f.k}`} title={f.text}>{f.label}</span>)}</span>
        <span className="sel-short">{hero ? <><b>{sk.name}:</b> {shortLine(u)}</> : shortLine(u)}</span>
        {fx.length > 0 && <span className="sel-fx">{fx.map((f) => f.text).join(' ')}</span>}
      </span>
    </span>
  );
}

function SelDetail({ c, u }: { c: GameController; u: any }) {
  const g = c.game;
  const d = heroDef(u);
  const hero = u.kind === 'hero';
  const sk = hero ? d.skill : null;
  const cd = hero ? skillCooldown(u) : 0;
  const art = u.kind === 'beast' ? ART('genga') : u.kind === 'creep' ? ART(MAP_ART[(MAPS as any)[g.map].theme] || 'hexor') : ART(u.hero);
  return (
    <div className="sel-detail" style={{ ['--art' as any]: `url(${art})` }}>
      <div className="sel-move">{hero ? <MoveDiagram hero={u.hero} size={8} /> : null}<span>{d.moveText}</span></div>
      {hero && (
        <div className="sel-skill">
          {sk.range ? <RangeDiagram hero={u.hero} size={7} /> : null}
          <b>{sk.name}</b> <span className="meta">{costLabel(sk)}{sk.range ? ` · range ${sk.range}` : ''}{sk.cooldown ? ` · cooldown ${sk.cooldown}` : ''}</span>
          <p>{sk.text}</p>
          {cd > 0 && <p className="cdn-note">Recharging: ready in {cd} turn{cd > 1 ? 's' : ''}.</p>}
        </div>
      )}
      {hero && <HeroDemo hero={u.hero} compact />}
      {u.kind === 'creep' && <p>Moving a creep uses your turn. Killing an enemy creep gives +{tk(CREEPS.lastHit)}; reaching the far side gives +{tk(CREEPS.breach)}.</p>}
    </div>
  );
}

/** The selected unit, right under the board: a short line, expandable to full details. */
function SelectedAccordion({ c, threats }: { c: GameController; threats: Set<string> }) {
  const u = c.selectedId ? c.game.units[c.selectedId] : null;
  if (!u || !u.alive) return <div className="sel-empty">Tap a unit to see what it does. Tap an enemy to see its reach.</div>;
  return (
    <Accordion key={u.id} className={`sel-acc ${u.team}`} trigger={<SelTrigger c={c} u={u} threats={threats} />}>
      <SelDetail c={c} u={u} />
    </Accordion>
  );
}

/** A glyph per skill for the skill button (no character portraits). */
const SKILL_ICON: Record<string, string> = {
  none: '<svg viewBox="0 0 24 24"><path d="M12 2l2.6 6.6L21 9.3l-5 4.4 1.5 6.8L12 17l-5.5 3.5L8 13.7 3 9.3l6.4-.7z" fill="currentColor"/></svg>',
  backstab: '<svg viewBox="0 0 24 24"><path d="M4 20l3-1 11-11 1-4-4 1L4 16z" fill="currentColor"/><path d="M3 21l3-3M8 14l2 2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  summon: '<svg viewBox="0 0 24 24" fill="currentColor"><ellipse cx="12" cy="15.5" rx="5" ry="4.2"/><circle cx="6.2" cy="10" r="2.1"/><circle cx="9.6" cy="6.4" r="2.1"/><circle cx="14.4" cy="6.4" r="2.1"/><circle cx="17.8" cy="10" r="2.1"/></svg>',
  grave: '<svg viewBox="0 0 24 24"><path d="M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z" fill="currentColor"/><path d="M12 7v9M8.5 10.5h7" stroke="rgba(0,0,0,.45)" stroke-width="2" stroke-linecap="round"/></svg>',
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
  cooldown: '<svg viewBox="0 0 16 16"><path d="M4 2h8M4 14h8M5 2c0 4 6 4 6 6s-6 2-6 6M11 2c0 4-6 4-6 6s6 2 6 6" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  tokens: '<svg viewBox="0 0 16 16"><rect x="3" y="7" width="10" height="7" rx="1.5" fill="currentColor"/><path d="M5.5 7V5a2.5 2.5 0 0 1 5 0v2" fill="none" stroke="currentColor" stroke-width="1.6"/></svg>',
  target: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M4 12L12 4" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  passive: '<svg viewBox="0 0 16 16"><path d="M4.5 8a2.2 2.2 0 1 1 3.5 1.8L8 8l0 0a2.2 2.2 0 1 1 3.5 0 2.2 2.2 0 0 1-3.5 1.8 2.2 2.2 0 0 1-3.5-1.8z" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>',
  wait: '<svg viewBox="0 0 16 16"><circle cx="8" cy="8" r="5.5" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="M8 5v3.2l2 1.3" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"/></svg>',
  charge: '<svg viewBox="0 0 16 16"><path d="M8 2v12M3.5 4.5l9 7M12.5 4.5l-9 7" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/></svg>',
};

function skillStatus(c: GameController) {
  const g = c.game;
  const u = c.selectedId ? g.units[c.selectedId] : null;
  const hero = !!u && u.alive && u.kind === 'hero';
  const own = hero && u.team === g.current && g.status === 'playing' && c.deciderIsHuman() && g.phase === 'main';
  const sk = hero ? (HEROES as any)[u.hero].skill : null;
  const active = own && sk && sk.type === 'active';
  const cd = active ? skillCooldown(u) : 0;
  const can = !!active && skillActions(g, u).length > 0;
  const tokens = hero ? g.energy[u.team] : 0;
  let state = ''; let block = '';
  if (!hero) state = 'Select one of your heroes to see its skill.';
  else if (!own) { state = u.team !== g.current ? 'That is an enemy hero: its skill is shown for reference.' : 'Wait for your turn to use a skill.'; block = 'wait'; }
  else if (sk.type !== 'active') {
    block = 'passive';
    state = sk.type === 'move' ? `${sk.name} is part of ${(HEROES as any)[u.hero].name}'s moves: tap a square past an adjacent piece.`
      : `${sk.name} triggers by itself after ${(HEROES as any)[u.hero].name} eliminates an enemy (${tk(sk.cost)}).`;
  }
  else if (c.armed) state = 'Tap a highlighted target. Tap the button again to cancel.';
  else if (cd) { block = 'cooldown'; state = `${sk.name} is recharging: ready in ${cd} of your turn${cd > 1 ? 's' : ''}.`; }
  else if (tokens < sk.cost) { block = 'tokens'; state = `${sk.name} needs ${tk(sk.cost)}; you have ${tokens}. Kill a creep or break through to earn more.`; }
  else if (!can) {
    block = sk.key === 'icy' && !u.iceCharge ? 'charge' : 'target';
    state = sk.key === 'icy' ? (u.iceCharge ? `No empty square within ${sk.range} squares for the ice block.` : 'No ice charge yet: eliminate an enemy with her to store one (it keeps until spent, and never stacks).')
      : sk.key === 'summon' ? (beastOf(g, u) ? 'The beast is still alive: Wild Company only works once it has fallen.' : 'No empty square next to Ge\'nga to summon the beast.')
        : sk.key === 'grave' ? `No ally within ${sk.range} squares can take Empty Grave.`
          : sk.key === 'root' ? `No enemy within ${sk.range} squares can be rooted (protected or already rooted ones don't count).`
            : 'No valid target in range.';
  }
  else if (sk.key === 'icy') state = 'Ice charge ready. Press to choose where to raise it (or Q) — or save it for a later turn.';
  else state = 'Ready. Press to choose a target (or Q).';
  return { u, hero, sk, active, cd, can, state, block };
}

function SkillButton({ c, inline }: { c: GameController; inline?: boolean }) {
  const { u, sk, active, cd, can, state, block } = skillStatus(c);
  const usable = can || c.armed;
  return (
    <div className={`skill-wrap${c.armed ? ' armed' : ''}${inline ? ' inline' : ''}`}>
      <button className={`skill-sq${c.armed ? ' armed' : ''}${can ? ' ready' : ''}${usable ? '' : ' blocked'}`} type="button" aria-disabled={!usable}
        onClick={() => (usable ? c.armSkill() : sk && c.say(state, 'err'))}
        aria-label={sk ? `${sk.name}${active ? `, ${tk(sk.cost)}` : ''}. ${state}` : 'Skill'}>
        <span className="glyph" dangerouslySetInnerHTML={{ __html: SKILL_ICON[sk?.key] || SKILL_ICON.none }} />
        {sk && <span className="sq-cost">{costChip(sk)}</span>}
        {block && sk && <span className={`sq-block ${block}`} dangerouslySetInnerHTML={{ __html: BLOCK_ICON[block] + (block === 'cooldown' ? `<b>${cd}</b>` : '') }} />}
      </button>
      <div className="skill-pop" role="note">
        {sk ? (
          <>
            <b>{sk.name}</b>
            <span className="meta">{costLabel(sk)}{sk.range ? ` · range ${sk.range}` : ''}{sk.cooldown ? ` · cooldown ${sk.cooldown}` : ''}</span>
            <span className="impact">{SHORT[u.hero]?.skill}</span>
          </>
        ) : <b>Skill</b>}
        <span className={`state${can && !c.armed ? ' ok' : ''}${block && block !== 'passive' && block !== 'wait' ? ' no' : ''}`}>
          {block && <span className="state-ico" dangerouslySetInnerHTML={{ __html: BLOCK_ICON[block] }} />}{state}
        </span>
      </div>
    </div>
  );
}

function Controls({ c, onMenu, roomCode, local }: { c: GameController; onMenu: () => void; roomCode?: string | null; local?: boolean }) {
  return (
    <div className="controls">
      <div className="controls-row">
        {!local && <SkillButton c={c} />}
        {local && <button className="btn icon-btn" type="button" onClick={onMenu}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>Menu</button>}
        <span className="grow" />
        {c.mode.kind !== 'online' && (
          <span className="undo-redo">
            <button className="btn icon" type="button" disabled={!c.canUndo()} onClick={() => c.undo()} title="Undo (Ctrl+Z)">
              <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M9 14L4 9l5-5" /><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" /></svg>Undo</button>
            <button className="btn icon" type="button" disabled={!c.canRedo()} onClick={() => c.redo()} title="Redo (Ctrl+Shift+Z)">
              Redo<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 14l5-5-5-5" /><path d="M20 9H9.5a5.5 5.5 0 0 0 0 11H13" /></svg></button>
          </span>
        )}
        {!local && <button className="btn icon-btn" type="button" onClick={onMenu}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" /></svg>Menu</button>}
      </div>
      <div className="turnline"><span className="turn-num">Turn {c.game.turn}{roomCode ? ` · room ${roomCode}` : ''}</span>
        {!local && <span className={`msg ${c.msgKind}`} role="status" aria-live="polite">{c.msg}</span>}</div>
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
  const [sheet, setSheet] = useState<'roster' | 'unit' | null>(null);
  const heroes = livingHeroes(g, team).length;
  useEffect(() => { if (sheet === 'unit' && (!sel || !sel.alive)) setSheet(null); }, [sel, sheet]);
  return (
    <div className={`seat ${team}${team === 'p2' ? ' mirrored' : ''}${mine ? ' active' : ''}`}>
      <div className="seat-top">
        <span className={`team-badge ${team}`}>{TEAM_NAMES[team]}</span>
        {c.showScore && <SeatScore c={c} team={team} />}
        <Tokens c={c} team={team} who="Tokens" />
        <span className="count">{heroes} heroes</span>
        <span className="grow" />
        <span className={`seat-status${mine ? ' go' : ''}`}>{statusFor(c, team)}</span>
        <button type="button" className="btn ghost tiny" onClick={() => setSheet('roster')}>Team</button>
      </div>
      <div className="seat-body">
        {mine && sel && sel.alive ? (
          <div className="seat-sel">
            <button type="button" className={`seat-sel-btn ${sel.team}`} onClick={() => setSheet('unit')} aria-label="Unit details">
              <SelTrigger c={c} u={sel} threats={threats} /><span className="acc-chev">›</span>
            </button>
            <SkillButton c={c} inline />
          </div>
        ) : <p className={`seat-msg ${mine ? c.msgKind : ''}`}>{mine && c.msg ? c.msg : last?.text}</p>}
      </div>
      {team === 'p2' && <Toast c={c} only="p2" />}
      {sheet && (
        <div className="seat-sheet" onClick={() => setSheet(null)}>
          <div className="seat-sheet-card" onClick={(e) => e.stopPropagation()}>
            {/* the header stays put while the details scroll; tapping it collapses the sheet */}
            <button type="button" className="seat-sheet-head" onClick={() => setSheet(null)} aria-expanded="true" aria-label="Collapse">
              {sheet === 'roster' ? <TeamHead c={c} team={team} /> : sel && sel.alive ? <SelTrigger c={c} u={sel} threats={threats} /> : null}
              <span className="sheet-close" aria-hidden="true">✕</span>
            </button>
            <div className="seat-sheet-body">
              {sheet === 'roster' ? <TeamRoster c={c} team={team} threats={threats} /> : sel && sel.alive ? <SelDetail c={c} u={sel} /> : null}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function GameScreen({ ctrl, roomCode, rematch, onRematch, onChangeHeroes, onHome, onReplays }: Props) {
  const c = useCtrl(ctrl);
  useEffect(() => { (window as any).__hgCtrl = ctrl; }, [ctrl]); // test hook: inspect/drive the match from devtools
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

  const me: Team = c.viewer();
  const them = other(me);
  const topbar = !local && (
    <>
      <div className="statusbar">
        <span className="sb-side left"><Tokens c={c} team={me} who="You" active={!over && c.decider() === me} /></span>
        <span key={`${over ? g.status : c.decider()}-${over}`}
          className={`turn-banner ${over ? g.status : c.decider()}${waiting ? ' waiting' : ''}${over ? ' over' : ''}${!over && g.phase === 'react' && c.deciderIsHuman() ? ' react-ask' : ''}`}>
          {!over && <span className={`turn-arrow ${c.decider() === me ? 'to-left' : 'to-right'}`} aria-hidden="true">{c.decider() === me ? '◂' : '▸'}</span>}
          <span className={`turn-text${waiting ? ' thinking' : ''}`}>{status}</span>
        </span>
        <span className="sb-side right"><Tokens c={c} team={them} who={c.mode.kind === 'bot' ? 'Bot' : 'Opponent'} active={!over && c.decider() === them} /></span>
      </div>
      {c.showScore && <ScoreStrip c={c} />}
    </>
  );

  const overlay = over && (
    <div className="overlay win">
      <div>
        <h2>{local ? `${TEAM_NAMES[g.status]} wins` : status}</h2>
        <p>{TEAM_NAMES[loser!]} has no heroes left · {livingHeroes(g, g.status).map((u: any) => (HEROES as any)[u.hero].name).join(', ')} still standing</p>
        {c.showScore && <p className="final-score">{seriesLine(c)}</p>}
        <div className="row">
          <button className="btn primary" type="button" disabled={rematch.disabled} onClick={onRematch}>{rematch.label}</button>
          <button className="btn" type="button" onClick={onChangeHeroes}>Change heroes</button>
          {onReplays && <button className="btn" type="button" onClick={onReplays}>Watch replay</button>}
          <button className="btn" type="button" onClick={onHome}>Home</button>
        </div>
      </div>
    </div>
  );

  const board = (
    <div className="board-host-wrap">
      <div className="board-host" ref={host} />
      {overlay}
    </div>
  );

  return (
    <div className="game-screen">
      {local ? (
        <div className="faceoff">
          {/* the top seat grows away from the board, so the board stays put */}
          <div className="seat-slot top"><SeatPanel c={c} team="p2" threats={threats} /></div>
          {board}
          <Toast c={c} only="p1" flow />
          <Controls c={c} onMenu={() => setMenu(true)} local />
          <SeatPanel c={c} team="p1" threats={threats} />
        </div>
      ) : (
        <div className="stage">
          <section aria-label="Board" className="board-col">
            {topbar}
            {board}
            <Toast c={c} flow />
            <Controls c={c} onMenu={() => setMenu(true)} roomCode={roomCode} />
            <SelectedAccordion c={c} threats={threats} />
          </section>
          <aside className="ledger">
            <Accordion className="panel-acc" trigger={<span className="acc-title">Teams</span>} defaultOpen={false}>
              <div className="roster">
                <div><TeamHead c={c} team="p1" /><TeamRoster c={c} team="p1" threats={threats} /></div>
                <div><TeamHead c={c} team="p2" /><TeamRoster c={c} team="p2" threats={threats} /></div>
              </div>
            </Accordion>
            <div><p className="eyebrow">Battle log</p><Log c={c} /></div>
          </aside>
        </div>
      )}

      <Modal open={menu} onClose={() => setMenu(false)} label="Menu" className="menu-card">
        <h2>Paused</h2>
        <button className="btn primary big" type="button" onClick={() => setMenu(false)}>Resume</button>
        <div className="menu-setting"><Switch checked={c.showThreats} onChange={(v) => c.setThreats(v)} label={<><b>Show threats</b><small>Mark units an enemy can capture next turn</small></>} /></div>
        <div className="menu-setting score-setting">
          <Switch checked={c.showScore} onChange={(v) => c.setScore(v)} label={<><b>Show score</b><small>Wins for each side across rematches: {seriesLine(c)}</small></>} />
          <button className="btn ghost" type="button" onClick={() => c.resetScore()} disabled={!c.tally().a && !c.tally().b}>Reset</button>
        </div>
        <div className="menu-setting cursor-setting"><b>Mouse cursor</b><CursorPicker /></div>
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
