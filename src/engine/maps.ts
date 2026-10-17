// Battlefields: obstacles are listed for Ivory's half; the other half is the 180° mirror.
// Terrain only goes in the four centre files (c-f): the flank files are creep lanes.
export type MapDef = { name: string; theme: string; blurb: string; blocks: Record<string, string[]> };

export const MAPS: Record<string, MapDef> = {
  oasis: {
    name: 'Oasis Bazaar',
    theme: 'desert',
    blurb: 'Sandstone pillars guard the market square; the flanks are open lanes.',
    blocks: { pillar: ['c4', 'e3'] },
  },
  savanna: {
    name: 'Savanna Crossing',
    theme: 'savanna',
    blurb: 'Acacia trees split the centre into two crossings.',
    blocks: { tree: ['d4', 'f3'] },
  },
  jungle: {
    name: 'Jungle Ruins',
    theme: 'jungle',
    blurb: 'An overgrown fort fills the middle. Great for Backstab.',
    blocks: { ruin: ['c3', 'e4', 'f3'] },
  },
  keep: {
    name: 'Winter Keep',
    theme: 'winter',
    blurb: 'Frozen rocks form a keep in the centre.',
    blocks: { rock: ['d3', 'f4'] },
  },
  field: { name: 'Open Field', theme: 'field', blurb: 'No terrain. Pure positioning.', blocks: {} },
};
