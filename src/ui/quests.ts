// Adventure progress, kept in this browser: which levels are cleared. Each level opens once the one before is.
import { QUESTS } from '../engine/index.ts';
import { pref, setPref } from './data';

export const clearedQuests = (): string[] => pref<string[]>('questsCleared', []);
export function markCleared(questId: string) {
  const cleared = clearedQuests();
  if (!cleared.includes(questId)) setPref('questsCleared', [...cleared, questId]);
}
/** A level can be played once every level before it is cleared. */
export const questOpen = (questId: string, cleared = clearedQuests()) => {
  const index = QUESTS.findIndex((quest) => quest.id === questId);
  return index === 0 || (index > 0 && cleared.includes(QUESTS[index - 1].id));
};
/** The level after this one, if any. */
export const nextQuest = (questId: string) => {
  const index = QUESTS.findIndex((quest) => quest.id === questId);
  return QUESTS[index + 1]?.id ?? null;
};
