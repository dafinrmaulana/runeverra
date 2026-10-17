import { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { HEROES, MAPS, TEAM_NAMES, createMatch, questById } from '../engine/index.ts';
import { pickTeam, BOT_LEVELS } from '../engine/bot.ts';
import { matchFromConfig } from '../online.ts';
import { GameController, type Mode } from './game/controller';
import { room } from './online';
import { HeroPicker } from './components/HeroPicker';
import { MapPicker } from './components/MapPicker';
import { ClockPicker } from './components/ClockPicker';
import { Tour } from './components/Tour';
import { Portal } from './components/Portal';
import { SoundSetting } from './components/SoundSetting';
import { ChatButton } from './components/Chat';
import { LegalScreen, type LegalDoc } from './screens/LegalScreen';
import { Rules } from './components/Rules';
import { GameScreen } from './screens/GameScreen';
import { ReplaysScreen } from './screens/ReplaysScreen';
import { ChangelogScreen } from './screens/ChangelogScreen';
import { AdventureScreen } from './screens/AdventureScreen';
import { markCleared, nextQuest } from './quests';
import { LATEST } from './changelog';
import { HomeDemo } from './components/HomeDemo';
import { Floor } from './components/Floor';
import { resetTally } from './record';
import { useBack } from './back';
import { setMenuMusic } from './music';
import { useInstall } from './pwa';
import { Modal, Steps, Switch } from './components/ui';
import { CursorPicker } from './cursor';
import { ICON, pickProblem, pref, setPref, type HeroId, type Team } from './data';
import type { DescMode } from './components/HeroInfo';

type ModeKind = 'bot' | 'local' | 'online';
type Screen = 'home' | 'room' | 'heroes' | 'map' | 'game' | 'replays' | 'changelog' | 'legal' | 'adventure';
type Level = 'easy' | 'normal' | 'hard';
type BotTeam = 'hidden' | 'shuffle' | 'manual';

const LEVEL_TEXT: Record<Level, string> = {
  easy: 'Makes mistakes. Good for learning the heroes.',
  normal: 'Looks two turns ahead and punishes loose pieces.',
  hard: 'Thinks longer and deeper. Plan your trades.',
};

function useRoom() {
  useSyncExternalStore(room.subscribe, room.getVersion);
  return room;
}

export function App() {
  const hashDoc = (): LegalDoc | null => {
    const h = location.hash.slice(1);
    return h === 'terms' || h === 'privacy' || h === 'copyright' ? h : null;
  };
  const [legalDoc, setLegalDoc] = useState<LegalDoc>(hashDoc() || 'terms');
  const [screen, setScreen] = useState<Screen>(hashDoc() ? 'legal' : 'home');
  const openLegal = (doc: LegalDoc) => {
    setLegalDoc(doc);
    setScreen('legal');
    try {
      history.replaceState(null, '', `#${doc}`);
    } catch {
      /* ignore */
    }
  };
  const closeLegal = () => {
    setScreen('home');
    try {
      history.replaceState(null, '', location.pathname + location.search);
    } catch {
      /* ignore */
    }
  };
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
  const [tour, setTour] = useState(false);
  const [settings, setSettings] = useState(false);
  const [diffOpen, setDiffOpen] = useState(false);
  const [seenRules, setSeenRules] = useState<boolean>(pref('seenRules', false));
  const [seenVer, setSeenVer] = useState<string>(pref('seenVersion', ''));
  const r = useRoom();
  const pwa = useInstall();

  // The phone's back goes to the screen before, like each screen's own Back button. (The match handles its own.)
  useBack(
    screen !== 'home' && screen !== 'game',
    () => {
      if (screen === 'legal') closeLegal();
      else if (screen === 'room') {
        room.leave();
        setScreen('home');
      } else if (screen === 'map') setScreen('heroes');
      else if (screen === 'heroes') setScreen(kind === 'online' ? 'room' : 'home');
      else setScreen('home');
    },
    'screen',
  );

  // The soundtrack plays on the menus and fades out for a match.
  useEffect(() => {
    setMenuMusic(screen !== 'game');
  }, [screen]);

  // A new screen always opens at its top, not wherever the last one was scrolled to.
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [screen]);

  useEffect(() => {
    setPref('desc', desc);
  }, [desc]);
  useEffect(() => {
    setPref('level', level);
    setPref('botTeam', botTeam);
    setPref('side', side);
  }, [level, botTeam, side]);
  useEffect(() => {
    setPref('map', map);
    setPref('creeps', creeps);
  }, [map, creeps]);
  useEffect(() => {
    setPref('clockMin', clockMin);
  }, [clockMin]);
  useEffect(() => {
    setPref('seenRules', seenRules);
    setPref('seenVersion', seenVer);
  }, [seenRules, seenVer]);

  // Online: check the room capability once; a reloaded tab rejoins its room.
  useEffect(() => {
    room.onStart = (game, fresh, clock) => {
      setCtrl((old) => {
        old?.destroy();
        const c = new GameController(
          { kind: 'online', side: room.side!, onLocalMove: (index, action) => room.localMove(index, action) },
          game,
        );
        c.say(`Online match in room ${room.code}. You play ${TEAM_NAMES[room.side!]}; Ivory moves first.`, 'ok');
        c.series = `room-${room.code}`;
        c.setClock(clock ?? null);
        room.controller = c;
        if (!fresh) c.say('Back in the match.', 'ok');
        return c;
      });
      setKind('online');
      setScreen('game');
    };
    room.init().then((ok) => {
      if (ok && room.saved()) {
        setKind('online');
        setScreen('room');
        room.rejoin();
      }
    });
  }, []);

  const bot = useMemo(() => pickTeam(seed) as HeroId[], [seed]);
  // Against the bot the player may take either side; picks stay keyed by team.
  const youT: Team = kind === 'bot' ? side : 'p1';
  const botT: Team = youT === 'p1' ? 'p2' : 'p1';
  const botPicks = kind === 'bot' && botTeam !== 'manual' ? bot : picks[botT];
  const teamOf = (team: Team) => (kind === 'bot' && team === botT ? botPicks : picks[team]);
  const p2Picks = teamOf('p2');
  function chooseSide(team: Team) {
    if (team === side) return;
    setPicks({ p1: picks.p2, p2: picks.p1 }); // your team comes with you
    setSide(team);
  }

  function startLocal() {
    const game = matchFromConfig({ p1: teamOf('p1'), p2: teamOf('p2'), map, creeps, clockMs: clockMin * 60000 });
    const mode: Mode = kind === 'bot' ? { kind: 'bot', level, side } : { kind: 'local' };
    ctrl?.destroy();
    const c = new GameController(mode, game);
    c.series = kind === 'bot' ? `bot-${level}` : 'local';
    c.say(
      kind === 'bot'
        ? `You play ${TEAM_NAMES[side]} against the ${BOT_LEVELS[level].label} bot. ${side === 'p1' ? 'You move first: tap a hero to begin.' : 'Ivory (the bot) moves first.'}`
        : 'Ivory moves first. Tap a hero to begin.',
      'ok',
    );
    setCtrl(c);
    setScreen('game');
  }

  // ---------- Adventure ----------
  const [questId, setQuestId] = useState<string | null>(null);
  function startQuest(id: string) {
    const quest = questById(id);
    if (!quest) return;
    ctrl?.destroy();
    const c = new GameController({ kind: 'bot', level: 'normal', side: 'p1' }, createMatch({ quest: id }));
    c.onFinish = (winner) => {
      if (winner === 'p1') markCleared(id);
    };
    c.say(`${quest.name}: ${quest.story} ${quest.goalText}`, 'ok');
    setKind('bot');
    setQuestId(id);
    setCtrl(c);
    setScreen('game');
  }
  function leaveQuest() {
    ctrl?.destroy();
    setCtrl(null);
    setQuestId(null);
    setScreen('adventure');
  }

  function goHome() {
    ctrl?.destroy();
    setCtrl(null);
    room.controller = null;
    if (kind === 'online') room.leave();
    setScreen('home');
  }
  function choose(nextKind: ModeKind) {
    if (nextKind === 'bot') {
      setDiffOpen(true);
      return;
    } // difficulty first, in a dialog over home
    setKind(nextKind);
    if (nextKind === 'local') resetTally('local'); // a new game from home starts the score over
    setPicks({ p1: [], p2: [] });
    setScreen(nextKind === 'online' ? 'room' : 'heroes');
  }
  function startBot(nextLevel: Level) {
    setLevel(nextLevel);
    setDiffOpen(false);
    resetTally(`bot-${nextLevel}`); // a new game from home starts the score over
    setKind('bot');
    setPicks({ p1: [], p2: [] });
    setScreen('heroes');
  }

  // ---------- screens ----------
  if (screen === 'game' && ctrl && questId) {
    const next = nextQuest(questId);
    return (
      <>
        <Floor mode="game" />
        <div className="app page" key="game">
          <GameScreen
            ctrl={ctrl}
            rematch={{ label: 'Try again', disabled: false }}
            onRematch={() => startQuest(questId)}
            onChangeHeroes={leaveQuest}
            onHome={() => {
              setQuestId(null);
              goHome();
            }}
            onNextLevel={next ? () => startQuest(next) : null}
          />
        </div>
      </>
    );
  }
  if (screen === 'game' && ctrl) {
    const online = kind === 'online';
    const rematch = !online
      ? { label: 'Rematch', disabled: false }
      : r.ready && r.match > r.started
        ? { label: 'Waiting for opponent…', disabled: true }
        : { label: r.oppReadyForNext() ? 'Accept rematch' : 'Rematch', disabled: !r.opp };
    return (
      <>
        <Floor mode="game" />
        <div className="app page" key="game">
          <GameScreen
            ctrl={ctrl}
            roomCode={online ? r.code : null}
            rematch={rematch}
            onRematch={() => (online ? r.setReady(true) : startLocal())}
            onChangeHeroes={() => {
              ctrl.destroy();
              setCtrl(null);
              room.controller = null;
              if (online) r.setReady(false);
              setScreen('heroes');
            }}
            onHome={goHome}
            onReplays={() => {
              ctrl.destroy();
              setCtrl(null);
              room.controller = null;
              if (online) r.setReady(false);
              setScreen('replays');
            }}
          />
        </div>
      </>
    );
  }

  return (
    <>
      <Floor mode={screen === 'home' ? 'home' : screen === 'room' ? 'game' : 'dim'} />
      <div className="app">
        {screen === 'home' && (
          <div className="home page" key="home">
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
                    <b>Play vs Bot</b>
                    <small>Easy, Normal or Hard</small>
                  </button>
                  <button type="button" className="mode-card" onClick={() => setScreen('adventure')}>
                    <b>Adventure</b>
                    <small>Quests against monsters</small>
                  </button>
                  <button type="button" className="mode-card" onClick={() => choose('local')}>
                    <b>Face to face</b>
                    <small>Two players, one screen</small>
                  </button>
                  <button
                    type="button"
                    className="mode-card"
                    onClick={() => choose('online')}
                    disabled={r.available === false}
                  >
                    <b>Online room</b>
                    <small>
                      {r.available === false
                        ? 'Available on the published page only'
                        : 'Play a friend with a room code'}
                    </small>
                  </button>
                </div>
                <button
                  type="button"
                  className={`learn-card${seenRules ? '' : ' fresh'}`}
                  onClick={() => {
                    if (seenRules) setRules(true);
                    else setTour(true);
                    setSeenRules(true);
                  }}
                >
                  <span className="learn-ico" aria-hidden="true">
                    <svg viewBox="0 0 24 24">
                      <path d="M4 5h7a3 3 0 0 1 3 3v11a2 2 0 0 0-2-2H4zM20 5h-6" />
                      <path d="M20 5v12h-6" />
                    </svg>
                  </span>
                  <span>
                    <b>How to play</b>
                    <small>{seenRules ? 'Heroes, skills and runes' : 'New here? Learn the rules in a minute'}</small>
                  </span>
                  {!seenRules && (
                    <span className="new-dot" aria-label="New">
                      Start here
                    </span>
                  )}
                </button>
                <div className="home-grid">
                  <button type="button" className="util-card" onClick={() => setScreen('replays')}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <circle cx="12" cy="12" r="9" />
                      <path d="M10 8.5v7l5.5-3.5z" />
                    </svg>
                    <span>Match review</span>
                  </button>
                  <button
                    type="button"
                    className="util-card"
                    onClick={() => {
                      setScreen('changelog');
                      setSeenVer(LATEST.version);
                    }}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M6 3h9l4 4v14H6z" />
                      <path d="M9 11h7M9 15h7" />
                    </svg>
                    <span>Patch notes</span>
                    {seenVer !== LATEST.version && (
                      <span className="new-dot" aria-label="New">
                        New
                      </span>
                    )}
                  </button>
                  <button type="button" className="util-card" onClick={() => setSettings(true)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" />
                      <circle cx="16" cy="7" r="2" />
                      <circle cx="8" cy="17" r="2" />
                    </svg>
                    <span>Settings</span>
                  </button>
                </div>
              </div>
              <footer className="home-foot">
                <span className="legal-links">
                  <button type="button" className="linklike" onClick={() => openLegal('terms')}>
                    Terms
                  </button>{' '}
                  ·{' '}
                  <button type="button" className="linklike" onClick={() => openLegal('privacy')}>
                    Privacy
                  </button>{' '}
                  ·{' '}
                  <button type="button" className="linklike" onClick={() => openLegal('copyright')}>
                    Copyright
                  </button>{' '}
                  · v{LATEST.version}
                </span>
              </footer>
            </div>
          </div>
        )}

        {screen === 'replays' && (
          <Setup title="Match review" onBack={() => setScreen('home')}>
            <div className="setup-body page" key="replays">
              <ReplaysScreen />
            </div>
          </Setup>
        )}

        {screen === 'legal' && (
          <Setup title="Legal" onBack={closeLegal}>
            <div className="setup-body page" key="legal">
              <LegalScreen doc={legalDoc} onDoc={openLegal} />
            </div>
          </Setup>
        )}

        {screen === 'adventure' && (
          <Setup title="Adventure" onBack={() => setScreen('home')}>
            <div className="setup-body page" key="adventure">
              <AdventureScreen onPlay={startQuest} />
            </div>
          </Setup>
        )}

        {screen === 'changelog' && (
          <Setup title="Patch notes" onBack={() => setScreen('home')}>
            <div className="setup-body page" key="changelog">
              <ChangelogScreen />
            </div>
          </Setup>
        )}

        {screen === 'room' && (
          <Setup
            chat
            title="Online"
            onBack={() => {
              room.leave();
              setScreen('home');
            }}
          >
            <div className="setup-body page" key="room">
              <RoomPanel onContinue={() => setScreen('heroes')} />
            </div>
          </Setup>
        )}

        {(screen === 'heroes' || screen === 'map') && (
          <Setup
            chat={kind === 'online'}
            title={screen === 'heroes' ? 'Heroes' : 'Battlefield'}
            step={screen === 'heroes' ? 1 : 2}
            onBack={() => setScreen(screen === 'map' ? 'heroes' : kind === 'online' ? 'room' : 'home')}
            next={
              screen === 'heroes'
                ? {
                    label: 'Next: battlefield',
                    disabled:
                      kind === 'online'
                        ? !!pickProblem(r.picks)
                        : !!pickProblem(teamOf('p1')) || !!pickProblem(p2Picks),
                    hint: heroHint(
                      kind,
                      kind === 'bot' ? picks[youT] : picks.p1,
                      kind === 'bot' ? botPicks : p2Picks,
                      r,
                    ),
                    onClick: () => setScreen('map'),
                  }
                : kind === 'online'
                  ? {
                      label: r.ready ? 'Not ready' : 'Ready',
                      disabled: !r.room || !!pickProblem(r.picks),
                      hint: !r.opp
                        ? 'Waiting for your opponent to join.'
                        : r.ready
                          ? 'Ready. The match starts when your opponent is ready too.'
                          : r.oppReadyForNext()
                            ? 'Your opponent is ready.'
                            : 'Press Ready when you are set.',
                      onClick: () => r.setReady(!r.ready),
                    }
                  : {
                      label: 'Start match',
                      disabled: false,
                      hint: `${MAPS[map].name}${creeps ? ' · creeps on' : ''}`,
                      onClick: startLocal,
                    }
            }
          >
            {screen === 'heroes' && (
              <div className="setup-body page" key="heroes">
                {kind === 'bot' && (
                  <div className="pick-stack">
                    <div className="side-pick" role="radiogroup" aria-label="Play as">
                      <span className="side-pick-label">Play as</span>
                      {(['p1', 'p2'] as Team[]).map((team) => (
                        <button
                          key={team}
                          type="button"
                          role="radio"
                          aria-checked={side === team}
                          className={`side-opt ${team}`}
                          onClick={() => chooseSide(team)}
                        >
                          <span className={`team-badge ${team}`}>{TEAM_NAMES[team]}</span>
                          <small>{team === 'p1' ? 'Moves first' : 'Moves second'}</small>
                        </button>
                      ))}
                    </div>
                    <div className="diff-pick">
                      <span className="side-pick-label">Bot level</span>
                      <div className="seg" role="group" aria-label="Bot level">
                        {(['easy', 'normal', 'hard'] as Level[]).map((levelOption) => (
                          <button
                            key={levelOption}
                            type="button"
                            aria-pressed={level === levelOption}
                            onClick={() => setLevel(levelOption)}
                          >
                            {BOT_LEVELS[levelOption].label}
                          </button>
                        ))}
                      </div>
                      <span className="note">{LEVEL_TEXT[level]}</span>
                    </div>
                    <HeroPicker
                      team={youT}
                      title="Your team"
                      picks={picks[youT]}
                      onChange={(nextPicks) => setPicks({ ...picks, [youT]: nextPicks })}
                      mode={desc}
                      onMode={setDesc}
                    />
                    <div className={`bot-team ${botT}`}>
                      <div className="bot-team-head">
                        <span className={`team-badge ${botT}`}>{TEAM_NAMES[botT]}</span>
                        <h3>Bot team</h3>
                        <div className="seg" role="group" aria-label="Bot team">
                          <button
                            type="button"
                            aria-pressed={botTeam === 'hidden'}
                            onClick={() => setBotTeam('hidden')}
                          >
                            Blind
                          </button>
                          <button
                            type="button"
                            aria-pressed={botTeam === 'shuffle'}
                            onClick={() => setBotTeam('shuffle')}
                          >
                            Shuffle
                          </button>
                          <button
                            type="button"
                            aria-pressed={botTeam === 'manual'}
                            onClick={() => setBotTeam('manual')}
                          >
                            Pick manually
                          </button>
                        </div>
                      </div>
                      {botTeam === 'hidden' && (
                        <>
                          <div className={`slots-row ${botT}`}>
                            {[0, 1, 2, 3].map((slot) => (
                              <span key={slot} className="slot hidden-slot">
                                <span className="n">{slot + 1}</span>
                                <span className="q">?</span>
                              </span>
                            ))}
                          </div>
                          <p className="note">The bot picks in secret. You'll see its heroes when the match starts.</p>
                        </>
                      )}
                      {botTeam === 'shuffle' && (
                        <>
                          <div className={`slots-row ${botT}`}>
                            {bot.map((hero, index) => (
                              <span key={hero} className="slot filled">
                                <img src={ICON(hero)} alt="" />
                                <span className="n">{index + 1}</span>
                                <span className="nm">{HEROES[hero].name}</span>
                              </span>
                            ))}
                          </div>
                          <button type="button" className="btn ghost small-btn" onClick={() => setSeed(seed + 7)}>
                            ↻ Shuffle again
                          </button>
                        </>
                      )}
                      {botTeam === 'manual' && (
                        <HeroPicker
                          team={botT}
                          title="Bot's team"
                          picks={picks[botT]}
                          onChange={(nextPicks) => setPicks({ ...picks, [botT]: nextPicks })}
                          mode={desc}
                          onMode={setDesc}
                        />
                      )}
                    </div>
                  </div>
                )}
                {kind === 'local' && (
                  <div className="faceoff-pick">
                    <HeroPicker
                      team="p2"
                      title="Player 2"
                      picks={picks.p2}
                      onChange={(nextPicks) => setPicks({ ...picks, p2: nextPicks })}
                      mode={desc}
                      onMode={setDesc}
                      mirrored
                    />
                    <div className="faceoff-divider">
                      <span>Ember sits on this side ↑ · Ivory on this side ↓</span>
                    </div>
                    <HeroPicker
                      team="p1"
                      title="Player 1"
                      picks={picks.p1}
                      onChange={(nextPicks) => setPicks({ ...picks, p1: nextPicks })}
                      mode={desc}
                      onMode={setDesc}
                    />
                  </div>
                )}
                {kind === 'online' && (
                  <div className="pick-stack">
                    <OppCard />
                    <HeroPicker
                      team={r.side || 'p1'}
                      title="Your team"
                      picks={r.picks}
                      onChange={(nextPicks) => r.setPicks(nextPicks)}
                      mode={desc}
                      onMode={setDesc}
                    />
                  </div>
                )}
              </div>
            )}
            {screen === 'map' && (
              <div className="setup-body page" key="map">
                {kind === 'online' && r.side === 'p2' && (
                  <p className="note">
                    The host (Ivory) picks the battlefield and the time. You see their choice here.
                  </p>
                )}
                {kind === 'online' && <OppCard compact />}
                <section className="match-options" aria-label="Match options">
                  <h3>Match options</h3>
                  {(kind !== 'online' || r.canTime) && (
                    <ClockPicker
                      minutes={kind === 'online' ? r.clockMin : clockMin}
                      readOnly={kind === 'online' && r.side === 'p2'}
                      onChange={(minutes) => (kind === 'online' ? r.setClock(minutes) : setClockMin(minutes))}
                    />
                  )}
                  <Switch
                    checked={kind === 'online' ? r.creeps : creeps}
                    disabled={kind === 'online' && r.side === 'p2'}
                    onChange={(enabled) => (kind === 'online' ? r.setMap(r.map, enabled) : setCreeps(enabled))}
                    label={
                      <>
                        <b>Creeps</b>
                        <small>Pawns that earn runes</small>
                      </>
                    }
                  />
                </section>
                <h3 className="section-h">Battlefield</h3>
                <MapPicker
                  map={kind === 'online' ? r.map : map}
                  creeps={kind === 'online' ? r.creeps : creeps}
                  readOnly={kind === 'online' && r.side === 'p2'}
                  onMap={(nextMap) => (kind === 'online' ? r.setMap(nextMap, r.creeps) : setMap(nextMap))}
                />
              </div>
            )}
          </Setup>
        )}

        <Modal open={diffOpen} onClose={() => setDiffOpen(false)} label="Choose difficulty">
          <h3>Choose difficulty</h3>
          <div className="level-list in-modal">
            {(['easy', 'normal', 'hard'] as Level[]).map((levelOption, index) => (
              <button
                key={levelOption}
                type="button"
                className="level-card"
                aria-pressed={level === levelOption}
                onClick={() => startBot(levelOption)}
              >
                <b>
                  {BOT_LEVELS[levelOption].label}
                  <span className="lv-pips" aria-hidden="true">
                    {[0, 1, 2].map((pip) => (
                      <i key={pip} className={pip <= index ? 'on' : ''} />
                    ))}
                  </span>
                </b>
                <span>{LEVEL_TEXT[levelOption]}</span>
              </button>
            ))}
          </div>
          <button className="btn ghost" type="button" onClick={() => setDiffOpen(false)}>
            Cancel
          </button>
        </Modal>

        <Modal open={settings} onClose={() => setSettings(false)} label="Settings">
          <div className="settings">
            <h3>Mouse cursor</h3>
            <CursorPicker />
            <SoundSetting />
            {pwa.kind === 'prompt' && (
              <div className="install-row">
                <h3>Install app</h3>
                <p className="note">Add Runeverra to your home screen. Bot and face to face games also work offline.</p>
                <button className="btn" type="button" onClick={() => pwa.install()}>
                  Install Runeverra
                </button>
              </div>
            )}
            {pwa.kind === 'ios' && (
              <div className="install-row">
                <h3>Install app</h3>
                <p className="note">In Safari, tap Share, then Add to Home Screen.</p>
              </div>
            )}
            <button className="btn primary" type="button" onClick={() => setSettings(false)}>
              Done
            </button>
          </div>
        </Modal>

        <Tour
          open={tour}
          onClose={() => setTour(false)}
          onFullRules={() => {
            setTour(false);
            setRules(true);
          }}
          onPlay={() => {
            setTour(false);
            choose('bot');
          }}
        />

        <Modal open={rules} onClose={() => setRules(false)} label="How to play" className="wide">
          <Rules
            onTour={() => {
              setRules(false);
              setTour(true);
            }}
          />
          <button className="btn primary" type="button" onClick={() => setRules(false)}>
            Close
          </button>
        </Modal>
      </div>
    </>
  );
}

function heroHint(kind: ModeKind, first: HeroId[], p2: HeroId[], onlineRoom: typeof room) {
  if (kind === 'online') return pickProblem(onlineRoom.picks) || 'Team set.';
  const firstProblem = pickProblem(first);
  if (firstProblem) return `${kind === 'bot' ? 'You' : 'Player 1'}: ${firstProblem}`;
  const secondProblem = pickProblem(p2);
  if (secondProblem) return `${kind === 'bot' ? 'The bot' : 'Player 2'}: ${secondProblem}`;
  return 'Both teams set.';
}

type SetupProps = {
  title: string;
  step?: number;
  onBack: () => void;
  children: React.ReactNode;
  chat?: boolean;
  next?: { label: string; disabled: boolean; hint?: string; onClick: () => void };
};
/** The frame around the setup screens. It stays mounted while the screens inside change,
 *  so the header, the timeline and the footer hold still; only the body fades in. */
function Setup({ title, step, onBack, children, next, chat }: SetupProps) {
  // The header only gets a backdrop once the page has scrolled under it.
  const [stuck, setStuck] = useState(false);
  useEffect(() => {
    const on = () => setStuck(window.scrollY > 6);
    on();
    window.addEventListener('scroll', on, { passive: true });
    return () => window.removeEventListener('scroll', on);
  }, []);
  return (
    <div className="setup">
      <div className={`setup-top${stuck ? ' stuck' : ''}`}>
        <header className="step-head">
          <button type="button" className="back-btn" onClick={onBack} aria-label="Back">
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M15 5l-7 7 7 7"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </button>
          <h2>{title}</h2>
          {chat && <span className="grow" />}
          {chat && <ChatButton />}
        </header>
        {step && <Steps steps={['Heroes', 'Battlefield', 'Fight']} current={step} />}
      </div>
      {children}
      {next && (
        <footer className="step-foot">
          <span className="hint">{next.hint}</span>
          <button type="button" className="btn primary big" disabled={next.disabled} onClick={next.onClick}>
            {next.label}
          </button>
        </footer>
      )}
    </div>
  );
}

const SIGIL_HOST = (
  <svg
    className="sigil"
    viewBox="0 0 48 48"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinejoin="round"
    strokeLinecap="round"
  >
    <path d="M24 4 L40 14 V30 L24 44 L8 30 V14 Z" />
    <path d="M16 27 L24 18 L32 27" />
    <path d="M24 18 V35" />
  </svg>
);
const SIGIL_JOIN = (
  <svg
    className="sigil"
    viewBox="0 0 48 48"
    aria-hidden="true"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinejoin="round"
    strokeLinecap="round"
  >
    <path d="M10 42 V22 a14 14 0 0 1 28 0 V42 Z" />
    <path d="M24 22 L29 29 L24 36 L19 29 Z" />
  </svg>
);

function PortalHead({ title, text }: { title: string; text: string }) {
  return (
    <div className="portal-head">
      <h3>{title}</h3>
      <p>{text}</p>
    </div>
  );
}

function RoomPanel({ onContinue }: { onContinue: () => void }) {
  const r = useRoom();
  const [code, setCode] = useState('');
  if (r.joining) {
    return (
      <div className="hall portal-page">
        <PortalHead title="Opening the gates" text="Connecting to the room…" />
        <Portal state="connecting" />
      </div>
    );
  }
  if (!r.room) {
    return (
      <div className="hall portal-page">
        <PortalHead title="The Teleport Altar" text="Open a portal and send its code, or step through a friend's." />
        <Portal state="idle" />
        <div className="gates">
          <div className="gate host">
            {SIGIL_HOST}
            <h4>Open a portal</h4>
            <p>You play Ivory, move first and choose the battlefield.</p>
            <button type="button" className="btn primary big" onClick={() => r.create()}>
              Create room
            </button>
          </div>
          <div className="gate join">
            {SIGIL_JOIN}
            <h4>Step through</h4>
            <p>Type the 5-letter code your friend sent you.</p>
            <form
              className="join-form"
              onSubmit={(event) => {
                event.preventDefault();
                r.join(code);
              }}
            >
              <input
                value={code}
                onChange={(event) => setCode(event.target.value.toUpperCase())}
                maxLength={5}
                placeholder="•••••"
                aria-label="Room code"
                autoComplete="off"
                spellCheck={false}
              />
              <button type="submit" className="btn primary big" disabled={code.trim().length < 5}>
                Join room
              </button>
            </form>
          </div>
        </div>
        {r.error && <p className="err">{r.error}</p>}
        <p className="hall-note">
          {import.meta.env.VITE_WS_URL
            ? 'Send the link to this page plus the room code. Two tabs on one device also work.'
            : 'Both players need to be signed in with access to this page: invite your friend by email from the Share menu. Two tabs on one device also work.'}
        </p>
      </div>
    );
  }
  const opp: Team = r.side === 'p1' ? 'p2' : 'p1';
  return (
    <div className="hall portal-page">
      <PortalHead
        title={r.opp ? 'Portal linked' : 'Portal open'}
        text={
          r.opp
            ? 'Your opponent has stepped through. Choose your heroes.'
            : 'Send the code below and wait for your opponent to step through.'
        }
      />
      <Portal state={r.opp ? 'linked' : 'open'} />
      <div className="table">
        <div className="plaque">
          <small>Portal code</small>
          <div className="bigcode" aria-label={`Room code ${r.code}`}>
            {(r.code || '').split('').map((letter, index) => (
              <span key={index}>{letter}</span>
            ))}
          </div>
          <button
            type="button"
            className="btn ghost"
            onClick={() => {
              try {
                navigator.clipboard.writeText(r.code!);
              } catch {
                /* none */
              }
            }}
          >
            Copy code
          </button>
        </div>
        <div className="seats">
          <div className={`seat-card ${r.side}`}>
            <span className="crest">{TEAM_NAMES[r.side!][0]}</span>
            <b>You</b>
            <small>{TEAM_NAMES[r.side!]}</small>
          </div>
          <span className="vs">vs</span>
          <div className={`seat-card ${opp}${r.opp ? '' : ' empty'}`}>
            <span className="crest">{r.opp ? TEAM_NAMES[opp][0] : '?'}</span>
            <b>{r.opp ? 'Opponent' : 'Awaiting'}</b>
            <small>{r.opp ? TEAM_NAMES[opp] : 'Seat open'}</small>
          </div>
        </div>
        {r.via !== 'room' && <p className="hall-note">Connected through the shared lobby ({r.via}).</p>}
        {r.error && <p className="err">{r.error}</p>}
        <div className="row">
          <button type="button" className="btn primary big" onClick={onContinue}>
            Choose heroes
          </button>
          <button type="button" className="btn big" onClick={() => r.leave()}>
            Leave room
          </button>
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
      <span className="note">
        {!r.opp
          ? 'not here yet'
          : r.oppReadyForNext()
            ? 'ready'
            : picks.length < 4
              ? `picking (${picks.length}/4)`
              : 'team set'}
      </span>
      <span className="grow" />
      <span className="mini-team">
        {[0, 1, 2, 3].map((slot) =>
          picks[slot] ? <img key={slot} src={ICON(picks[slot])} alt={HEROES[picks[slot]].name} /> : <i key={slot} />,
        )}
      </span>
      {r.code && <span className="note">room {r.code}</span>}
    </div>
  );
}
