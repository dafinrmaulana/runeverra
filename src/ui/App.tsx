import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { HEROES, MAPS, TEAM_NAMES } from '../arena.js';
import { pickTeam, BOT_LEVELS } from '../arena-bot.js';
import { matchFromConfig } from '../online.js';
import { GameController, type Mode } from './game/controller';
import { room } from './online/room';
import { HeroPicker } from './components/HeroPicker';
import { MapPicker } from './components/MapPicker';
import { Rules } from './components/Rules';
import { GameScreen } from './screens/GameScreen';
import { Modal, Steps } from './components/ui';
import { ICON, pref, setPref, type HeroId, type Team } from './data';
import type { DescMode } from './components/HeroInfo';

type ModeKind = 'bot' | 'local' | 'online';
type Screen = 'home' | 'level' | 'room' | 'heroes' | 'map' | 'game';
type Level = 'easy' | 'normal' | 'hard';
type BotTeam = 'hidden' | 'shuffle' | 'manual';

const LEVEL_TEXT: Record<Level, string> = {
  easy: 'Makes mistakes. Good for learning the heroes.',
  normal: 'Looks two turns ahead and punishes loose pieces.',
  hard: 'Thinks longer and deeper. Plan your trades.',
};

function useRoom() { useSyncExternalStore(room.subscribe, room.getVersion); return room; }

export function App() {
  const [screen, setScreen] = useState<Screen>('home');
  const [kind, setKind] = useState<ModeKind>('bot');
  const [level, setLevel] = useState<Level>(pref('level', 'normal'));
  const [botTeam, setBotTeam] = useState<BotTeam>(pref('botTeam', 'hidden'));
  const [seed, setSeed] = useState(() => 1 + (Date.now() % 997));
  const [picks, setPicks] = useState<Record<Team, HeroId[]>>({ p1: [], p2: [] });
  const [map, setMap] = useState<string>(pref('map', 'oasis'));
  const [creeps, setCreeps] = useState<boolean>(pref('creeps', true));
  const [desc, setDesc] = useState<DescMode>(pref('desc', 'short'));
  const [ctrl, setCtrl] = useState<GameController | null>(null);
  const [rules, setRules] = useState(false);
  const r = useRoom();

  useEffect(() => { setPref('desc', desc); }, [desc]);
  useEffect(() => { setPref('level', level); setPref('botTeam', botTeam); }, [level, botTeam]);
  useEffect(() => { setPref('map', map); setPref('creeps', creeps); }, [map, creeps]);

  // Online: check the room capability once; a reloaded tab rejoins its room.
  useEffect(() => {
    room.onStart = (game, fresh) => {
      setCtrl((old) => {
        old?.destroy();
        const c = new GameController({ kind: 'online', side: room.side!, onLocalMove: (i) => room.localMove(i) }, game);
        c.say(`Online match in room ${room.code}. You play ${TEAM_NAMES[room.side!]}; Ivory moves first.`, 'ok');
        room.controller = c;
        if (!fresh) c.say('Back in the match.', 'ok');
        return c;
      });
      setKind('online'); setScreen('game');
    };
    room.init().then((ok) => { if (ok && room.saved()) { setKind('online'); setScreen('room'); room.rejoin(); } });
  }, []);

  const bot = useMemo(() => pickTeam(seed) as HeroId[], [seed]);
  const p2Picks = kind === 'bot' && botTeam !== 'manual' ? bot : picks.p2;

  function startLocal() {
    const game = matchFromConfig({ p1: picks.p1, p2: p2Picks, map, creeps });
    const mode: Mode = kind === 'bot' ? { kind: 'bot', level } : { kind: 'local' };
    ctrl?.destroy();
    const c = new GameController(mode, game);
    c.say(kind === 'bot' ? `You play Ivory against the ${BOT_LEVELS[level].label} bot. Tap a hero to begin.` : 'Ivory moves first. Tap a hero to begin.', 'ok');
    setCtrl(c);
    setScreen('game');
  }

  function goHome() {
    ctrl?.destroy(); setCtrl(null); room.controller = null;
    if (kind === 'online') room.leave();
    setScreen('home');
  }
  function choose(k: ModeKind) {
    setKind(k);
    setPicks({ p1: [], p2: [] });
    setScreen(k === 'bot' ? 'level' : k === 'online' ? 'room' : 'heroes');
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
          onHome={goHome} />
      </div>
    );
  }

  return (
    <div className="app" key={screen}>
      {screen === 'home' && (
        <div className="home page">
          <div className="home-hero">
            <div className="home-faces">{['hasim', 'genga', 'magumba', 'plantae', 'hexor', 'aqna'].map((h) => <img key={h} src={ICON(h)} alt="" />)}</div>
            <h1 className="logo">Hero Gambit</h1>
            <p className="tagline">Pick four heroes. Outthink one opponent. No dice, no luck.</p>
          </div>
          <div className="mode-list">
            <button type="button" className="mode-card" onClick={() => choose('bot')}>
              <span className="mi">⚔</span><span><b>Play vs Bot</b><small>Pick a difficulty and fight the computer.</small></span>
            </button>
            <button type="button" className="mode-card" onClick={() => choose('local')}>
              <span className="mi">⇅</span><span><b>Offline · face to face</b><small>Two players on one screen, seated across from each other.</small></span>
            </button>
            <button type="button" className="mode-card" onClick={() => choose('online')} disabled={r.available === false}>
              <span className="mi">⌁</span><span><b>Online · room code</b>
                <small>{r.available === false ? 'Available on the published page only.' : 'Create a room or join a friend with a 5-letter code.'}</small></span>
            </button>
          </div>
          <div className="home-foot">
            <button type="button" className="btn ghost" onClick={() => setRules(true)}>How to play</button>
            <a className="btn ghost" href="classic.html">Classic mode</a>
          </div>
        </div>
      )}

      {screen === 'level' && (
        <Step title="Choose difficulty" onBack={() => setScreen('home')}>
          <div className="level-list">
            {(['easy', 'normal', 'hard'] as Level[]).map((l) => (
              <button key={l} type="button" className="level-card" aria-pressed={level === l} onClick={() => { setLevel(l); setScreen('heroes'); }}>
                <b>{BOT_LEVELS[l].label}</b><span>{LEVEL_TEXT[l]}</span>
              </button>
            ))}
          </div>
        </Step>
      )}

      {screen === 'room' && (
        <Step title="Online room" onBack={() => { room.leave(); setScreen('home'); }}>
          <RoomPanel onContinue={() => setScreen('heroes')} />
        </Step>
      )}

      {screen === 'heroes' && (
        <Step title="Choose heroes" step={1} onBack={() => setScreen(kind === 'bot' ? 'level' : kind === 'online' ? 'room' : 'home')}
          next={{
            label: 'Next: battlefield',
            disabled: kind === 'online' ? r.picks.length !== 4 : picks.p1.length !== 4 || p2Picks.length !== 4,
            hint: heroHint(kind, picks, p2Picks, r),
            onClick: () => setScreen('map'),
          }}>
          {kind === 'bot' && (
            <div className="pick-stack">
              <HeroPicker team="p1" title="Your team" picks={picks.p1} onChange={(p) => setPicks({ ...picks, p1: p })} mode={desc} onMode={setDesc} />
              <div className="bot-team">
                <div className="bot-team-head">
                  <span className="swatch p2" /><h3>Bot team</h3>
                  <div className="seg" role="group" aria-label="Bot team">
                    <button type="button" aria-pressed={botTeam === 'hidden'} onClick={() => setBotTeam('hidden')}>Blind</button>
                    <button type="button" aria-pressed={botTeam === 'shuffle'} onClick={() => setBotTeam('shuffle')}>Shuffle</button>
                    <button type="button" aria-pressed={botTeam === 'manual'} onClick={() => setBotTeam('manual')}>Pick manually</button>
                  </div>
                </div>
                {botTeam === 'hidden' && (
                  <div className="slots-row">{[0, 1, 2, 3].map((i) => <span key={i} className="slot hidden-slot"><span className="n">{i + 1}</span>?</span>)}
                    <p className="note">The bot picks in secret. You'll see its heroes when the match starts.</p></div>
                )}
                {botTeam === 'shuffle' && (
                  <div className="slots-row">
                    {bot.map((h, i) => <span key={h} className="slot filled"><img src={ICON(h)} alt="" /><span className="n">{i + 1}</span><span className="nm">{(HEROES as any)[h].name}</span></span>)}
                    <div className="slot-actions"><button type="button" className="btn ghost" onClick={() => setSeed(seed + 7)}>Shuffle again</button></div>
                  </div>
                )}
                {botTeam === 'manual' && (
                  <HeroPicker team="p2" title="Bot's team" picks={picks.p2} onChange={(p) => setPicks({ ...picks, p2: p })} mode={desc} onMode={setDesc} />
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
        </Step>
      )}

      {screen === 'map' && (
        <Step title="Choose battlefield" step={2} onBack={() => setScreen('heroes')}
          next={kind === 'online' ? {
            label: r.ready ? 'Not ready' : 'Ready',
            disabled: !r.room || r.picks.length !== 4,
            hint: !r.opp ? 'Waiting for your opponent to join.' : r.ready ? 'Ready. The match starts when your opponent is ready too.'
              : r.oppReadyForNext() ? 'Your opponent is ready.' : 'Press Ready when you are set.',
            onClick: () => r.setReady(!r.ready),
          } : { label: 'Start match', disabled: false, hint: `${(MAPS as any)[map].name}${creeps ? ' · creeps on' : ''}`, onClick: startLocal }}>
          {kind === 'online' && r.side === 'p2' && <p className="note">The host (Ivory) picks the battlefield. You see their choice here.</p>}
          {kind === 'online' && <OppCard compact />}
          <MapPicker
            map={kind === 'online' ? r.map : map} creeps={kind === 'online' ? r.creeps : creeps}
            readOnly={kind === 'online' && r.side === 'p2'}
            onMap={(m) => (kind === 'online' ? r.setMap(m, r.creeps) : setMap(m))}
            onCreeps={(v) => (kind === 'online' ? r.setMap(r.map, v) : setCreeps(v))} />
        </Step>
      )}

      <Modal open={rules} onClose={() => setRules(false)} label="How to play" className="wide">
        <Rules />
        <button className="btn primary" type="button" onClick={() => setRules(false)}>Close</button>
      </Modal>
    </div>
  );
}

function heroHint(kind: ModeKind, picks: Record<Team, HeroId[]>, p2: HeroId[], r: typeof room) {
  if (kind === 'online') return r.picks.length < 4 ? `Pick ${4 - r.picks.length} more.` : 'Team set.';
  if (picks.p1.length < 4) return `${kind === 'bot' ? 'You need' : 'Player 1 needs'} ${4 - picks.p1.length} more.`;
  if (p2.length < 4) return `${kind === 'bot' ? 'The bot needs' : 'Player 2 needs'} ${4 - p2.length} more.`;
  return 'Both teams set.';
}

type StepProps = {
  title: string; step?: number; onBack: () => void; children: React.ReactNode;
  next?: { label: string; disabled: boolean; hint?: string; onClick: () => void };
};
function Step({ title, step, onBack, children, next }: StepProps) {
  return (
    <div className="step page">
      <header className="step-head">
        <button type="button" className="btn ghost" onClick={onBack}>← Back</button>
        <h2>{title}</h2>
        {step && <Steps steps={['Heroes', 'Battlefield', 'Fight']} current={step} />}
      </header>
      <div className="step-body">{children}</div>
      {next && (
        <footer className="step-foot">
          <span className="hint">{next.hint}</span>
          <button type="button" className="btn primary big" disabled={next.disabled} onClick={next.onClick}>{next.label}</button>
        </footer>
      )}
    </div>
  );
}

function RoomPanel({ onContinue }: { onContinue: () => void }) {
  const r = useRoom();
  const [code, setCode] = useState('');
  if (r.joining) return <div className="room-card"><p className="note">Connecting to the room…</p></div>;
  if (!r.room) {
    return (
      <div className="room-grid">
        <div className="room-card">
          <h3>Create a room</h3>
          <p className="note">You play Ivory and choose the battlefield. Send the code to your friend.</p>
          <button type="button" className="btn primary big" onClick={() => r.create()}>Create room</button>
        </div>
        <div className="room-card">
          <h3>Join a room</h3>
          <p className="note">Type the 5-letter code your friend sent you.</p>
          <form className="join" onSubmit={(e) => { e.preventDefault(); r.join(code); }}>
            <input value={code} onChange={(e) => setCode(e.target.value)} maxLength={7} placeholder="CODE" aria-label="Room code" autoComplete="off" spellCheck={false} />
            <button type="submit" className="btn primary big">Join</button>
          </form>
        </div>
        {r.error && <p className="err">{r.error}</p>}
        <p className="note full">Both players need to be signed in with access to this page: invite your friend by email from the Share menu. Two tabs on one device also work.</p>
      </div>
    );
  }
  return (
    <div className="room-card lobby">
      <p className="note">Room code</p>
      <div className="bigcode">{r.code}</div>
      <button type="button" className="btn" onClick={() => { try { navigator.clipboard.writeText(r.code!); } catch { /* none */ } }}>Copy code</button>
      <p className="lobby-status"><span className={`dot ${r.opp ? 'on' : ''}`} />{r.opp ? 'Your opponent is here.' : 'Waiting for your opponent to join…'}</p>
      <p className="note">You play {TEAM_NAMES[r.side!]}.{r.via !== 'room' ? ` Connected through the shared lobby (${r.via}).` : ''}</p>
      {r.error && <p className="err">{r.error}</p>}
      <div className="row">
        <button type="button" className="btn primary big" onClick={onContinue}>Choose heroes</button>
        <button type="button" className="btn" onClick={() => r.leave()}>Leave room</button>
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

