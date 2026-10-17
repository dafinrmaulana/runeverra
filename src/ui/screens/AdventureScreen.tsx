import { HEROES, QUESTS, UNITS } from '../../engine/index.ts';
import { ICON } from '../data';
import { UNIT_SVG } from '../game/board.ts';
import { clearedQuests, questOpen } from '../quests';

/** The Adventure levels in order: cleared, open or locked; a tap on an open one plays it. */
export function AdventureScreen({ onPlay }: { onPlay: (questId: string) => void }) {
  const cleared = clearedQuests();
  return (
    <div className="quest-list">
      <p className="note">
        Hand-made levels against monsters, each with its own goal. Clear a level to open the next. Your commander still
        has to survive.
      </p>
      {QUESTS.map((quest, index) => {
        const open = questOpen(quest.id, cleared);
        const done = cleared.includes(quest.id);
        const monsters = Object.entries(
          quest.monsters.reduce<Record<string, number>>(
            (count, [type]) => ({ ...count, [type]: (count[type] || 0) + 1 }),
            {},
          ),
        );
        return (
          <button
            key={quest.id}
            type="button"
            className={`quest-card${done ? ' done' : ''}${open ? '' : ' locked'}`}
            disabled={!open}
            onClick={() => onPlay(quest.id)}
          >
            <span className="quest-no">{done ? '✓' : open ? index + 1 : '🔒'}</span>
            <span className="quest-body">
              <b>{quest.name}</b>
              <span className="quest-story">{quest.story}</span>
              <span className="quest-goal">{quest.goalText}</span>
              <span className="quest-sides">
                <span className="quest-heroes">
                  {quest.heroes.map(([heroId]) => (
                    <img key={heroId} src={ICON(heroId)} alt={HEROES[heroId].name} title={HEROES[heroId].name} />
                  ))}
                </span>
                <span className="quest-vs">vs</span>
                <span className="quest-monsters">
                  {monsters.map(([type, count]) => (
                    <span key={type} className="quest-monster" title={UNITS[type].name}>
                      <span dangerouslySetInnerHTML={{ __html: UNIT_SVG[type] ?? '' }} />×{count}
                    </span>
                  ))}
                </span>
              </span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
