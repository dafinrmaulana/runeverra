import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { HEROES, MAPS, TEAM_NAMES } from '../arena.js';
import { pickTeam, BOT_LEVELS } from '../arena-bot.js';
import { matchFromConfig } from '../online.js';
import { GameController, type Mode } from './game/controller';
import { room } from './online';
import { HeroPicker } from './components/HeroPicker';
import { MapPicker } from './components/MapPicker';
import { ClockPicker } from './components/ClockPicker';
import { ChatButton } from './components/Chat';
import { LegalScreen, type LegalDoc } from './screens/LegalScreen';
import { Rules } from './components/Rules';
import { GameScreen } from './screens/GameScreen';
import { ReplaysScreen } from './screens/ReplaysScreen';
import { ChangelogScreen } from './screens/ChangelogScreen';
import { LATEST } from './changelog';
import { HomeDemo } from './components/HomeDemo';
import { resetTally } from './record';
import { useInstall } from './pwa';
import { Modal, Steps } from './components/ui';
import { CursorPicker } from './cursor';
import { ART, ICON, pref, setPref, type HeroId, type Team } from './data';
import type { DescMode } from './components/HeroInfo';

const HOME_WALL: HeroId[] = ['hasim', 'genga', 'magumba', 'plantae', 'hexor', 'aqna'];

type ModeKind = 'bot' | 'local' | 'online';
type Screen = 'home' | 'room' | 'heroes' | 'map' | 'game' | 'replays' | 'changelog' | 'legal';
type Level = 'easy' | 'normal' | 'hard';
type BotTeam = 'hidden' | 'shuffle' | 'manual';

const LEVEL_TEXT: Record<Level, string> = {
  easy: 'Makes mistakes. Good for learning the heroes.',
  normal: 'Looks two turns ahead and punishes loose pieces.',
  hard: 'Thinks longer and deeper. Plan your trades.',
};

function useRoom() { useSyncExternalStore(room.subscribe, room.getVersion); return room; }

export function App() {
  const hashDoc = (): LegalDoc | null => { const h = location.hash.slice(1); return h === 'terms' || h === 'privacy' || h === 'copyright' ? h : null; };
  const [legalDoc, setLegalDoc] = useState<LegalDoc>(hashDoc() || 'terms');
  const [screen, setScreen] = useState<Screen>(hashDoc() ? 'legal' : 'home');
  const openLegal = (d: LegalDoc) => { setLegalDoc(d); setScreen('legal'); try { history.replaceState(null, '', `#${d}`); } catch { /* ignore */ } };
  const closeLegal = () => { setScreen('home'); try { history.replaceState(null, '', location.pathname + location.search); } catch { /* ignore */ } };
  const [kind, setKind] = useState<ModeKind>('bot');
  const [level, setLevel] = useState<Level>(pref('level', 'normal'));
  const [botTeam, setBotTeam] = useState<BotTeam>(pref('botTeam', 'hidden'));
  const [side, setSide] = useState<Team>(pref('side', 'p1'));
  const [seed, setSeed] = useState(() => 1 + (Date.now() % 997));
  const [picks, setPicks] = useState<Record<Team, HeroId[]>>({ p1: [], p2: [] });
  const [map, setMap] = useState<string>(pref('map', 'oasis'));
  const [creeps, setCreeps] = useState<boolean>(pref('creeps', true));
  const [clockMin, setClockMin] = useState<number>(pref('clockMin', 0));
  const [desc, setDesc] = useState<DescMode>(pref('desc', 'short'));
  const [ctrl, setCtrl] = useState<GameController | null>(null);
  const [rules, setRules] = useState(false);
  const [settings, setSettings] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [seenRules, setSeenRules] = useState<boolean>(pref('seenRules', false));
  const [seenVer, setSeenVer] = useState<string>(pref('seenVersion', ''));
  const r = useRoom();
  const pwa = useInstall();

  useEffect(() => { setPref('desc', desc); }, [desc]);
  useEffect(() => { setPref('level', level); setPref('botTeam', botTeam); setPref('side', side); }, [level, botTeam, side]);
  useEffect(() => { setPref('map', map); setPref('creeps', creeps); }, [map, creeps]);
  useEffect(() => { setPref('clockMin', clockMin); }, [clockMin]);
  useEffect(() => { setPref('seenRules', seenRules); setPref('seenVersion', seenVer); }, [seenRules, seenVer]);

  // Online: check the room capability once; a reloaded tab rejoins its room.
  useEffect(() => {
    room.onStart = (game, fresh, clock) => {
      setCtrl((old) => {
        old?.destroy();
        const c = new GameController({ kind: 'online', side: room.side!, onLocalMove: (i, a) => room.localMove(i, a) }, game);
        c.say(`Online match in room ${room.code}. You play ${TEAM_NAMES[room.side!]}; Ivory moves first.`, 'ok');
        c.series = `room-${room.code}`;
        c.setClock(clock ?? null);
        room.controller = c;
        if (!fresh) c.say('Back in the match.', 'ok');
        return c;
      });
      setKind('online'); setScreen('game');
    };
    room.init().then((ok) => { if (ok && room.saved()) { setKind('online'); setScreen('room'); room.rejoin(); } });
  }, []);

  const bot = useMemo(() => pickTeam(seed) as HeroId[], [seed]);
  // Against the bot the player may take either side; picks stay keyed by team.
  const youT: Team = kind === 'bot' ? side : 'p1';
  const botT: Team = youT === 'p1' ? 'p2' : 'p1';
  const botPicks = kind === 'bot' && botTeam !== 'manual' ? bot : picks[botT];
  const teamOf = (t: Team) => (kind === 'bot' && t === botT ? botPicks : picks[t]);
  const p2Picks = teamOf('p2');
  function chooseSide(t: Team) {
    if (t === side) return;
    setPicks({ p1: picks.p2, p2: picks.p1 }); // your team comes with you
    setSide(t);
  }

  function startLocal() {
    const game = matchFromConfig({ p1: teamOf('p1'), p2: teamOf('p2'), map, creeps, clockMs: clockMin * 60000 });
    const mode: Mode = kind === 'bot' ? { kind: 'bot', level, side } : { kind: 'local' };
    ctrl?.destroy();
    const c = new GameController(mode, game);
    c.series = kind === 'bot' ? `bot-${level}` : 'local';
    c.say(kind === 'bot' ? `You play ${TEAM_NAMES[side]} against the ${BOT_LEVELS[level].label} bot. ${side === 'p1' ? 'You move first: tap a hero to begin.' : 'Ivory (the bot) moves first.'}` : 'Ivory moves first. Tap a hero to begin.', 'ok');
    setCtrl(c);
    setScreen('game');
  }

  function goHome() {
    ctrl?.destroy(); setCtrl(null); room.controller = null;
    if (kind === 'online') room.leave();
    setScreen('home');
  }
  function choose(k: ModeKind) {
    if (k === 'bot') { setDiffOpen(true); return; } // difficulty first, in a dialog over home
    setKind(k);
    if (k === 'local') resetTally('local'); // a new game from home starts the score over
    setPicks({ p1: [], p2: [] });
    setScreen(k === 'online' ? 'room' : 'heroes');
  }
  function startBot(l: Level) {
    setLevel(l); setDiffOpen(false);
    resetTally(`bot-${l}`); // a new game from home starts the score over
    setKind('bot'); setPicks({ p1: [], p2: [] }); setScreen('heroes');
  }

  // ---------- screens ----------
  if (screen === 'game' && ctrl) {
    const online = kind === 'online';
    const rematch = !online ? { label: 'Rematch', disabled: false }
      : r.ready && r.match > r.started ? { label: 'Waiting for opponent…', disabled: true }
        : { label: r.oppReadyForNext() ? 'Accept rematch' : 'Rematch', disabled: !r.opp };
    return (
      <div className="app page" key="game">
        <GameScreen ctrl={ctrl} roomCode={online ? r.code : null} rematch={rematch}
          onRematch={() => (online ? r.setReady(true) : startLocal())}
          onChangeHeroes={() => { ctrl.destroy(); setCtrl(null); room.controller = null; if (online) r.setReady(false); setScreen('heroes'); }}
          onHome={goHome}
          onReplays={() => { ctrl.destroy(); setCtrl(null); room.controller = null; if (online) r.setReady(false); setScreen('replays'); }} />
      </div>
    );
  }

  return (
    <div className="app">
      {screen === 'home' && (
        <div className="home page" key="home">
          <div className="home-wall" aria-hidden="true">
            {HOME_WALL.map((h) => <div key={h} className="wall-col" style={{ backgroundImage: `url(${ART(h)})` }} />)}
          </div>
          <div className="home-front">
            <div className="home-hero">
              <h1 className="logo">Runeverra</h1>
              <span className="rune-rule" aria-hidden="true" />
              <p className="tagline">Pick four heroes. Outsmart one opponent. No dice, no luck.</p>
            </div>
            <HomeDemo />
            <div className="home-menu">
              <div className="mode-list">
                <button type="button" className="mode-card primary" onClick={() => choose('bot')}>
                  <b>Play vs Bot</b><small>Easy, Normal or Hard</small>
                </button>
                <button type="button" className="mode-card" onClick={() => choose('local')}>
                  <b>Face to face</b><small>Two players, one screen</small>
                </button>
                <button type="button" className="mode-card" onClick={() => choose('online')} disabled={r.available === false}>
                  <b>Online room</b>
                  <small>{r.available === false ? 'Available on the published page only' : 'Play a friend with a room code'}</small>
                </button>
              </div>
              <button type="button" className={`learn-card${seenRules ? '' : ' fresh'}`} onClick={() => { setRules(true); setSeenRules(true); }}>
                <span className="learn-ico" aria-hidden="true"><svg viewBox="0 0 24 24"><path d="M4 5h7a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H4zM20 5h-6" /><path d="M20 5v12h-6" /></svg></span>
                <span><b>How to play</b><small>{seenRules ? 'Heroes, skills and tokens' : 'New here? Learn the rules in a minute'}</small></span>
                {!seenRules && <span className="new-dot" aria-label="New">Start here</span>}
              </button>
              <div className="home-grid">
                <button type="button" className="util-card" onClick={() => setScreen('replays')}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" /><path d="M10 8.5v7l5.5-3.5z" /></svg><span>Match review</span>
                </button>
                <button type="button" className="util-card" onClick={() => { setScreen('changelog'); setSeenVer(LATEST.version); }}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 3h9l4 4v14H6z" /><path d="M9 11h7M9 15h7" /></svg><span>Patch notes</span>
                  {seenVer !== LATEST.version && <span className="new-dot" aria-label="New">New</span>}
                </button>
                <button type="button" className="util-card" onClick={() => setSettings(true)}>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h10M18 7h2M4 17h2M10 17h10" /><circle cx="16" cy="7" r="2" /><circle cx="8" cy="17" r="2" /></svg><span>Settings</span>
                </button>
              </div>
            </div>
            <footer className="home-foot">
              <span className="legal-links"><button type="button" className="linklike" onClick={() => openLegal('terms')}>Terms</button> · <button type="button" className="linklike" onClick={() => openLegal('privacy')}>Privacy</button> · <button type="button" className="linklike" onClick={() => openLegal('copyright')}>Copyright</button> · v{LATEST.version}</span>
            </footer>
          </div>
        </div>
      )}

      {screen === 'replays' && (
        <Setup title="Match review" onBack={() => setScreen('home')}>
          <div className="setup-body page" key="replays"><ReplaysScreen /></div>
        </Setup>
      )}

      {screen === 'legal' && (
        <Setup title="Legal" onBack={closeLegal}>
          <div className="setup-body page" key="legal"><LegalScreen doc={legalDoc} onDoc={openLegal} /></div>
        </Setup>
      )}

      {screen === 'changelog' && (
        <Setup title="Patch notes" onBack={() => setScreen('home')}>
          <div className="setup-body page" key="changelog"><ChangelogScreen /></div>
        </Setup>
      )}

      {screen === 'room' && (
        <Setup chat title="Online" onBack={() => { room.leave(); setScreen('home'); }}>
          <div className="setup-body page" key="room"><RoomPanel onContinue={() => setScreen('heroes')} /></div>
        </Setup>
      )}

      {(screen === 'heroes' || screen === 'map') && (
        <Setup chat={kind === 'online'} title={screen === 'heroes' ? 'Choose heroes' : 'Choose battlefield'} step={screen === 'heroes' ? 1 : 2}
          onBack={() => setScreen(screen === 'map' ? 'heroes' : kind === 'online' ? 'room' : 'home')}
          next={screen === 'heroes' ? {
            label: 'Next: battlefield',
            disabled: kind === 'online' ? r.picks.length !== 4 : teamOf('p1').length !== 4 || p2Picks.length !== 4,
            hint: heroHint(kind, kind === 'bot' ? picks[youT] : picks.p1, kind === 'bot' ? botPicks : p2Picks, r),
            onClick: () => setScreen('map'),
          } : kind === 'online' ? {
            label: r.ready ? 'Not ready' : 'Ready',
            disabled: !r.room || r.picks.length !== 4,
            hint: !r.opp ? 'Waiting for your opponent to join.' : r.ready ? 'Ready. The match starts when your opponent is ready too.'
              : r.oppReadyForNext() ? 'Your opponent is ready.' : 'Press Ready when you are set.',
            onClick: () => r.setReady(!r.ready),
          } : { label: 'Start match', disabled: false, hint: `${(MAPS as any)[map].name}${creeps ? ' · creeps on' : ''}`, onClick: startLocal }}>
          {screen === 'heroes' && <div className="setup-body page" key="heroes">
          {kind === 'bot' && (
            <div className="pick-stack">
              <div className="side-pick" role="radiogroup" aria-label="Play as">
                <span className="side-pick-label">Play as</span>
                {(['p1', 'p2'] as Team[]).map((t) => (
                  <button key={t} type="button" role="radio" aria-checked={side === t} className={`side-opt ${t}`} onClick={() => chooseSide(t)}>
                    <span className={`team-badge ${t}`}>{TEAM_NAMES[t]}</span>
                    <small>{t === 'p1' ? 'Moves first' : 'Moves second'}</small>
                  </button>
                ))}
              </div>
              <div className="diff-pick">
                <span className="side-pick-label">Bot level</span>
                <div className="seg" role="group" aria-label="Bot level">
                  {(['easy', 'normal', 'hard'] as Level[]).map((l) => (
                    <button key={l} type="button" aria-pressed={level === l} onClick={() => setLevel(l)}>{BOT_LEVELS[l].label}</button>
                  ))}
                </div>
                <span className="note">{LEVEL_TEXT[level]}</span>
              </div>
              <HeroPicker team={youT} title="Your team" picks={picks[youT]} onChange={(p) => setPicks({ ...picks, [youT]: p })} mode={desc} onMode={setDesc} />
              <div className={`bot-team ${botT}`}>
                <div className="bot-team-head">
                  <span className={`team-badge ${botT}`}>{TEAM_NAMES[botT]}</span><h3>Bot team</h3>
                  <div className="seg" role="group" aria-label="Bot team">
                    <button type="button" aria-pressed={botTeam === 'hidden'} onClick={() => setBotTeam('hidden')}>Blind</button>
                    <button type="button" aria-pressed={botTeam === 'shuffle'} onClick={() => setBotTeam('shuffle')}>Shuffle</button>
                    <button type="button" aria-pressed={botTeam === 'manual'} onClick={() => setBotTeam('manual')}>Pick manually</button>
                  </div>
                </div>
                {botTeam === 'hidden' && (
                  <>
                    <div className={`slots-row ${botT}`}>{[0, 1, 2, 3].map((i) => <span key={i} className="slot hidden-slot"><span className="n">{i + 1}</span><span className="q">?</span></span>)}</div>
                    <p className="note">The bot picks in secret. You'll see its heroes when the match starts.</p>
                  </>
                )}
                {botTeam === 'shuffle' && (
                  <>
                    <div className={`slots-row ${botT}`}>
                      {bot.map((h, i) => <span key={h} className="slot filled"><img src={ICON(h)} alt="" /><span className="n">{i + 1}</span><span className="nm">{(HEROES as any)[h].name}</span></span>)}
                    </div>
                    <button type="button" className="btn ghost small-btn" onClick={() => setSeed(seed + 7)}>↻ Shuffle again</button>
                  </>
                )}
                {botTeam === 'manual' && (
                  <HeroPicker team={botT} title="Bot's team" picks={picks[botT]} onChange={(p) => setPicks({ ...picks, [botT]: p })} mode={desc} onMode={setDesc} />
                )}
              </div>
            </div>
          )}
          {kind === 'local' && (
            <div className="faceoff-pick">
              <HeroPicker team="p2" title="Player 2" picks={picks.p2} onChange={(p) => setPicks({ ...picks, p2: p })} mode={desc} onMode={setDesc} mirrored />
              <div className="faceoff-divider"><span>Ember sits on this side ↑ · Ivory on this side ↓</span></div>
              <HeroPicker team="p1" title="Player 1" picks={picks.p1} onChange={(p) => setPicks({ ...picks, p1: p })} mode={desc} onMode={setDesc} />
            </div>
          )}
          {kind === 'online' && (
            <div className="pick-stack">
              <OppCard />
              <HeroPicker team={r.side || 'p1'} title="Your team" picks={r.picks} onChange={(p) => r.setPicks(p)} mode={desc} onMode={setDesc} />
            </div>
          )}
          </div>}
          {screen === 'map' && <div className="setup-body page" key="map">
          {kind === 'online' && r.side === 'p2' && <p className="note">The host (Ivory) picks the battlefield and the time. You see their choice here.</p>}
          {kind === 'online' && <OppCard compact />}
          <MapPicker
            map={kind === 'online' ? r.map : map} creeps={kind === 'online' ? r.creeps : creeps}
            readOnly={kind === 'online' && r.side === 'p2'}
            onMap={(m) => (kind === 'online' ? r.setMap(m, r.creeps) : setMap(m))}
            onCreeps={(v) => (kind === 'online' ? r.setMap(r.map, v) : setCreeps(v))} />
          {(kind !== 'online' || r.canTime) && (
            <ClockPicker minutes={kind === 'online' ? r.clockMin : clockMin}
              readOnly={kind === 'online' && r.side === 'p2'}
              onChange={(m) => (kind === 'online' ? r.setClock(m) : setClockMin(m))} />
          )}
          </div>}
        </Setup>
      )}

      <Modal open={diffOpen} onClose={() => setDiffOpen(false)} label="Choose difficulty">
        <h3>Choose difficulty</h3>
        <div className="level-list in-modal">
          {(['easy', 'normal', 'hard'] as Level[]).map((l, i) => (
            <button key={l} type="button" className="level-card" aria-pressed={level === l} onClick={() => startBot(l)}>
              <b>{BOT_LEVELS[l].label}<span className="lv-pips" aria-hidden="true">{[0, 1, 2].map((k) => <i key={k} className={k <= i ? 'on' : ''} />)}</span></b>
              <span>{LEVEL_TEXT[l]}</span>
            </button>
          ))}
        </div>
        <button className="btn ghost" type="button" onClick={() => setDiffOpen(false)}>Cancel</button>
      </Modal>

      <Modal open={settings} onClose={() => setSettings(false)} label="Settings">
        <div className="settings">
          <h3>Mouse cursor</h3>
          <CursorPicker />
          {pwa.kind === 'prompt' && (
            <div className="install-row"><h3>Install app</h3><p className="note">Add Runeverra to your home screen. Bot and face to face games also work offline.</p>
              <button className="btn" type="button" onClick={() => pwa.install()}>Install Runeverra</button></div>
          )}
          {pwa.kind === 'ios' && (
            <div className="install-row"><h3>Install app</h3><p className="note">In Safari, tap Share, then Add to Home Screen.</p></div>
          )}
          <p className="legal-links"><button type="button" className="linklike" onClick={() => { setSettings(false); openLegal('terms'); }}>Terms</button> · <button type="button" className="linklike" onClick={() => { setSettings(false); openLegal('privacy'); }}>Privacy</button> · <button type="button" className="linklike" onClick={() => { setSettings(false); openLegal('copyright'); }}>Copyright</button></p>
          <button className="btn primary" type="button" onClick={() => setSettings(false)}>Done</button>
        </div>
      </Modal>

      <Modal open={rules} onClose={() => setRules(false)} label="How to play" className="wide">
        <Rules />
        <button className="btn primary" type="button" onClick={() => setRules(false)}>Close</button>
      </Modal>
    </div>
  );
}

function heroHint(kind: ModeKind, first: HeroId[], p2: HeroId[], r: typeof room) {
  if (kind === 'online') return r.picks.length < 4 ? `Pick ${4 - r.picks.length} more.` : 'Team set.';
  if (first.length < 4) return `${kind === 'bot' ? 'You need' : 'Player 1 needs'} ${4 - first.length} more.`;
  if (p2.length < 4) return `${kind === 'bot' ? 'The bot needs' : 'Player 2 needs'} ${4 - p2.length} more.`;
  return 'Both teams set.';
}

type SetupProps = {
  title: string; step?: number; onBack: () => void; children: React.ReactNode; chat?: boolean;
  next?: { label: string; disabled: boolean; hint?: string; onClick: () => void };
};
/** The frame around the setup screens. It stays mounted while the screens inside change,
 *  so the header, the timeline and the footer hold still; only the body fades in. */
function Setup({ title, step, onBack, children, next, chat }: SetupProps) {
  return (
    <div className="setup">
      <header className="step-head">
        <button type="button" className="back-btn" onClick={onBack} aria-label="Back">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" /></svg>
        </button>
        <h2>{title}</h2>
        {chat && <span className="grow" />}
        {chat && <ChatButton />}
      </header>
      {step && <Steps steps={['Heroes', 'Battlefield', 'Fight']} current={step} />}
      {children}
      {next && (
        <footer className="step-foot">
          <span className="hint">{next.hint}</span>
          <button type="button" className="btn primary big" disabled={next.disabled} onClick={next.onClick}>{next.label}</button>
        </footer>
      )}
    </div>
  );
}

const SIGIL_HOST = <svg className="sigil" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><path d="M24 4 L40 14 V30 L24 44 L8 30 V14 Z" /><path d="M24 14 V34 M16 20 H32" /></svg>;
const SIGIL_JOIN = <svg className="sigil" viewBox="0 0 48 48" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"><circle cx="24" cy="24" r="18" /><path d="M24 6 V16 M24 32 V42 M6 24 H16 M32 24 H42" /><circle cx="24" cy="24" r="5" /></svg>;

function HallBanner({ title, text }: { title: string; text: string }) {
  return (
    <div className="hall-banner">
      <div className="hall-art" aria-hidden="true">{HOME_WALL.map((h) => <span key={h} style={{ backgroundImage: `url(${ART(h)})` }} />)}</div>
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function RoomPanel({ onContinue }: { onContinue: () => void }) {
  const r = useRoom();
  const [code, setCode] = useState('');
  if (r.joining) {
    return <div className="hall"><HallBanner title="Opening the gates" text="Connecting to the room…" /></div>;
  }
  if (!r.room) {
    return (
      <div className="hall">
        <HallBanner title="The Gathering Hall" text="Raise a room and send its code, or answer a friend's call." />
        <div className="gates">
          <div className="gate host">
            {SIGIL_HOST}
            <h4>Raise a room</h4>
            <p>You play Ivory, move first and choose the battlefield.</p>
            <button type="button" className="btn primary big" onClick={() => r.create()}>Create room</button>
          </div>
          <div className="gate join">
            {SIGIL_JOIN}
            <h4>Answer a call</h4>
            <p>Type the 5-letter code your friend sent you.</p>
            <form className="join-form" onSubmit={(e) => { e.preventDefault(); r.join(code); }}>
              <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={5} placeholder="•••••" aria-label="Room code" autoComplete="off" spellCheck={false} />
              <button type="submit" className="btn primary big" disabled={code.trim().length < 5}>Join room</button>
            </form>
          </div>
        </div>
        {r.error && <p className="err">{r.error}</p>}
        <p className="hall-note">{(import.meta as any).env?.VITE_WS_URL
          ? 'Send the link to this page plus the room code. Two tabs on one device also work.'
          : 'Both players need to be signed in with access to this page: invite your friend by email from the Share menu. Two tabs on one device also work.'}</p>
      </div>
    );
  }
  const opp: Team = r.side === 'p1' ? 'p2' : 'p1';
  return (
    <div className="hall">
      <HallBanner title="The Gathering Hall" text={r.opp ? 'Your opponent has arrived. Choose your heroes.' : 'Send the code below. The hall waits for your opponent.'} />
      <div className="table">
        <div className="plaque">
          <small>Room code</small>
          <div className="bigcode">{r.code}</div>
          <button type="button" className="btn ghost" onClick={() => { try { navigator.clipboard.writeText(r.code!); } catch { /* none */ } }}>Copy code</button>
        </div>
        <div className="seats">
          <div className={`seat-card ${r.side}`}>
            <span className="crest">{TEAM_NAMES[r.side!][0]}</span>
            <b>You</b><small>{TEAM_NAMES[r.side!]}</small>
          </div>
          <span className="vs">vs</span>
          <div className={`seat-card ${opp}${r.opp ? '' : ' empty'}`}>
            <span className="crest">{r.opp ? TEAM_NAMES[opp][0] : '?'}</span>
            <b>{r.opp ? 'Opponent' : 'Awaiting'}</b><small>{r.opp ? TEAM_NAMES[opp] : 'Seat open'}</small>
          </div>
        </div>
        {r.via !== 'room' && <p className="hall-note">Connected through the shared lobby ({r.via}).</p>}
        {r.error && <p className="err">{r.error}</p>}
        <div className="row">
          <button type="button" className="btn primary big" onClick={onContinue}>Choose heroes</button>
          <button type="button" className="btn big" onClick={() => r.leave()}>Leave room</button>
        </div>
      </div>
    </div>
  );
}

function OppCard({ compact }: { compact?: boolean }) {
  const r = useRoom();
  const picks = r.oppPicks();
  const side = r.side ? (r.side === 'p1' ? 'p2' : 'p1') : 'p2';
  return (
    <div className={`opp-card${compact ? ' compact' : ''}`}>
      <span className={`swatch ${side}`} />
      <b>Opponent</b>
      <span className="note">{!r.opp ? 'not here yet' : r.oppReadyForNext() ? 'ready' : picks.length < 4 ? `picking (${picks.length}/4)` : 'team set'}</span>
      <span className="grow" />
      <span className="mini-team">{[0, 1, 2, 3].map((i) => picks[i] ? <img key={i} src={ICON(picks[i])} alt={(HEROES as any)[picks[i]].name} /> : <i key={i} />)}</span>
      {r.code && <span className="note">room {r.code}</span>}
    </div>
  );
}

