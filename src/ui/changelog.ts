// Patch notes shown on the Patch notes screen. Newest first; add a new entry at the top for each release.
export type Tag = 'new' | 'balance' | 'fix' | 'ui';

export interface PatchEntry {
  tag: Tag;
  text: string;
}
export interface Patch {
  version: string;
  date: string;
  title: string;
  entries: PatchEntry[];
}

export const TAG_LABEL: Record<Tag, string> = { new: 'New', balance: 'Balance', fix: 'Fix', ui: 'Polish' };

export const CHANGELOG: Patch[] = [
  {
    version: '0.9.0',
    date: '2026-10-17',
    title: 'Adventure',
    entries: [
      {
        tag: 'new',
        text: 'Adventure: 5 hand-made levels against monsters (goblins, dire wolves, a brute), each with its own goal: escort a caravan, clear the monsters, hold out, slay the brute. Clear a level to open the next.',
      },
      { tag: 'ui', text: 'The end-of-match title and text are centred.' },
    ],
  },
  {
    version: '0.8.0',
    date: '2026-10-17',
    title: 'Commanders',
    entries: [
      {
        tag: 'new',
        text: 'Commanders: every team is led by Plantae or Magumba (with both, you choose which), marked with a banner on the board. If yours falls, you lose at once. Taking down all four heroes still wins too.',
      },
      { tag: 'new', text: "In each side's first turn you may move two creeps." },
      {
        tag: 'new',
        text: 'A creep that breaks through now comes back as a new creep on its starting square (or the nearest open one), in a pillar of light.',
      },
      { tag: 'balance', text: 'No limit on runes any more: bank as many as you earn.' },
      {
        tag: 'balance',
        text: "Ge'nga is now a Fighter. On his beast's first move you pick how it moves for the whole match, summons included: 1 square any way, up to 2 straight, or up to 2 diagonally. That first move can be its own turn. A summoned beast eliminates an enemy on its square.",
      },
      { tag: 'balance', text: 'Aqna is now a Mage.' },
      {
        tag: 'balance',
        text: "Icy Step: an ice block on an empty square within 3 (1 rune), or up to 3 straight an enemy frozen until it shatters, eliminated with no block left, or a shield broken (2 runes). Terrain and her own units in the way hide what's behind them. It no longer ends her turn: she may still move.",
      },
      { tag: 'ui', text: "Tapping an enemy no longer shows its skill's reach." },
      {
        tag: 'ui',
        text: "Aqna's ice reach has two colours: rose where it can strike an enemy, blue where it only raises a block.",
      },
      {
        tag: 'balance',
        text: 'Magumba now steps 1 square straight instead of diagonally. Empty Grave: the shielded unit still acts; the first attack on it breaks the shield instead, the attacker is thrown back and loses the turn. Unbroken, it lasts 3 of your turns.',
      },
      {
        tag: 'balance',
        text: "Plantae's interrupt also fires when an enemy tries to move or act into the block in front of her. It stays outside.",
      },
      { tag: 'ui', text: 'Every takedown now sounds like a sword. Ice that freezes an enemy shatters.' },
    ],
  },
  {
    version: '0.7.0',
    date: '2026-10-17',
    title: 'Music, new sounds and back button',
    entries: [
      { tag: 'new', text: 'Menu music, with its own volume in Settings. It fades out when a match starts.' },
      {
        tag: 'new',
        text: 'New sounds for moves and skills: Backstab, Empty Grave, Aggressive Root, Storm Hammer and Icy Step. A blow that hits Empty Grave has its own sound.',
      },
      { tag: 'balance', text: 'Eliminating an enemy hero now gives +1 rune, like a creep.' },
      {
        tag: 'ui',
        text: "Your phone's back button or back swipe now goes back one screen or closes the open window, instead of closing the game. In a match it opens the menu.",
      },
      { tag: 'ui', text: 'Tapping an enemy unit no longer shows where it can move.' },
      {
        tag: 'fix',
        text: 'Tapping the selected unit again now always puts it down, also while waiting for your opponent.',
      },
      { tag: 'fix', text: 'Hovering on desktop is smooth again: the light under the mouse no longer slows the page.' },
    ],
  },
  {
    version: '0.6.0',
    date: '2026-10-15',
    title: 'Home, chat and install',
    entries: [
      {
        tag: 'new',
        text: 'A guided tour for new players in How to play: the goal, your first move on a real board, the skill every hero has, and what runes are for. Each step is a sentence or two.',
      },
      {
        tag: 'ui',
        text: 'Time options are now Classic, 3 min and 5 min (fill the row), plus a full-width box for your own number of minutes.',
      },
      {
        tag: 'new',
        text: 'A new home screen with a live demo match, a clear "How to play" card for new players, and quick access to match review, patch notes and settings.',
      },
      {
        tag: 'new',
        text: 'Online chat: type a message or tap a quick phrase. New messages pop up over the board, and you can mute chat any time.',
      },
      { tag: 'new', text: 'Full screen board for bot and online games, so the board is bigger on your phone.' },
      {
        tag: 'new',
        text: 'Install Runeverra as an app from Settings. Games against the bot and face to face also work offline.',
      },
      {
        tag: 'fix',
        text: "The home screen now fits phone screens, and the demo's skill names no longer hide behind the characters.",
      },
      {
        tag: 'balance',
        text: 'Oasis Bazaar and Savanna Crossing have new obstacle spots, so obstacles now sit on both square colours. Heroes that only move on one colour (like Magumba) are no longer walled off.',
      },
      {
        tag: 'ui',
        text: 'Game controls fit on one line on phones: skill, undo and redo, full screen and menu (the last two are icon buttons).',
      },
      {
        tag: 'new',
        text: 'Sound effects with weight: steel scrapes and rings on a takedown, wind rushes past when Hasim leaps, thunder rolls for Storm Hammer, a heavy parry clang for interrupts, groaning roots, a deep growl, war horns and drums. Set the volume in Settings or the game menu; all the way down is silent.',
      },
      {
        tag: 'new',
        text: 'Sharing the Runeverra link now shows a preview card, and the installed app and browser tab have a proper rune icon.',
      },
      {
        tag: 'new',
        text: 'The online room is now a teleport altar: a rune circle that glows sand while you wait, turns jade when your opponent steps through, and shows the room code in rune slots.',
      },
      {
        tag: 'ui',
        text: 'Setup screens keep their title and steps pinned to the top while you scroll, and the titles are shorter so they never wrap on small phones.',
      },
      {
        tag: 'fix',
        text: 'Smoother scrolling on phones: the moving background pauses while you scroll, and the heaviest effects are lighter on touch screens.',
      },
      {
        tag: 'fix',
        text: 'On phones, the background no longer shakes when the browser address bar slides in and out while you scroll.',
      },
      {
        tag: 'fix',
        text: 'On small phone screens the turn banner no longer overlaps the rune bars: it gets its own row above them.',
      },
      { tag: 'ui', text: 'Skill costs now show a rune symbol next to the number, so it is clear the number is runes.' },
      {
        tag: 'ui',
        text: 'Battlefield screen: time and creeps are now at the top in one "Match options" box, and the maps show in two columns on phones.',
      },
      { tag: 'ui', text: 'Skill tokens are now called runes, everywhere in the game.' },
      {
        tag: 'ui',
        text: 'A new home screen: a mossy medieval stone floor with a great rune circle that turns forever. Move your finger or mouse and the runes glow under it. A fainter circle turns behind the other screens too.',
      },
      {
        tag: 'new',
        text: 'Terms of Service, Privacy Policy and Copyright pages, with credits for the team and honorable mentions.',
      },
    ],
  },
  {
    version: '0.5.0',
    date: '2026-10-15',
    title: 'Timed mode',
    entries: [
      {
        tag: 'new',
        text: 'Timed mode: pick a time for each player (3, 5, 10 minutes or your own number). Whoever runs out of time loses, so a match can no longer stall forever.',
      },
      {
        tag: 'new',
        text: 'Online: the server keeps the clock for both players, and it waits while your opponent is disconnected.',
      },
      { tag: 'balance', text: 'Undo and redo are off in Timed matches. Classic matches are unchanged.' },
    ],
  },
  {
    version: '0.4.0',
    date: '2026-10-15',
    title: 'Patch notes & online fixes',
    entries: [
      {
        tag: 'new',
        text: 'Patch notes are now in the game. Open them from the home screen to see what changed in every update.',
      },
      {
        tag: 'balance',
        text: 'The score now resets whenever you start a new game from the home screen. Rematch and Change heroes keep it.',
      },
      {
        tag: 'fix',
        text: 'Online: fixed matches where both players suddenly saw "Opponent\'s turn". Several decisions in a row (like a move and then a follow-up choice) no longer get out of step.',
      },
      {
        tag: 'fix',
        text: 'Online: fewer random disconnects. The game now keeps the connection alive and reconnects on its own, including when you switch back to the tab.',
      },
      {
        tag: 'ui',
        text: 'Online: when someone disconnects, a notice now pauses the board instead of a long message covering the runes on mobile. It also tells you whether it is you or your opponent.',
      },
      {
        tag: 'fix',
        text: 'Mobile: a tap that wobbles a little no longer counts as a drag, so selecting and deselecting a hero works reliably.',
      },
      { tag: 'ui', text: 'The home tagline now reads "Outsmart one opponent".' },
    ],
  },
  {
    version: '0.3.0',
    date: '2026-10-14',
    title: 'Skill reworks & match review',
    entries: [
      {
        tag: 'new',
        text: 'Match review: every finished match is saved. Replay it move by move with play/pause, a slider and a clickable log.',
      },
      {
        tag: 'new',
        text: 'Optional score: earn points for takedowns, roots, interrupts and breakthroughs. The score is a win tally for each series.',
      },
      { tag: 'new', text: 'Empty Grave now shows an orbiting rune shield. Attacks into it lunge and get thrown back.' },
      {
        tag: 'balance',
        text: 'Storm Hammer pushes 2 squares. A unit that is blocked slips into an empty square beside it.',
      },
      { tag: 'balance', text: "Plantae's root now covers a 3×3 block." },
      {
        tag: 'balance',
        text: 'Plantae, Magumba and Hexor have new skill patterns. Hexor now chooses which way to knock back.',
      },
      { tag: 'balance', text: 'The Beast steps 1 square in any direction, like Hasim.' },
      { tag: 'balance', text: 'Pawns get a double step on their first move.' },
      {
        tag: 'balance',
        text: "Aqna's Icy Step is now a stored charge. A takedown stores one (it never stacks). Spend it on any later turn.",
      },
      {
        tag: 'balance',
        text: "Supports step 1 square, and their skills reach 3 squares along their lines (blocked by units). Ge'nga steps 1 square.",
      },
      { tag: 'balance', text: 'Interrupt no longer roots Plantae. Roots drag units back.' },
      { tag: 'ui', text: 'The series score has its own clear readout under the status bar.' },
      {
        tag: 'ui',
        text: 'Storm Hammer buttons show the push pattern instead of letters. Decision prompts float over the board.',
      },
    ],
  },
  {
    version: '0.2.0',
    date: '2026-10-14',
    title: 'Runeverra',
    entries: [
      {
        tag: 'new',
        text: 'The game is now called Runeverra, with a new gold-and-navy look and a hero wall on the home screen.',
      },
      { tag: 'new', text: 'Online rooms: play a friend with a room code.' },
      { tag: 'new', text: 'Pick Ivory or Ember against the bot. The board turns around when you play Ember.' },
      { tag: 'new', text: "Animated demos of every hero's movement and skill, in hero info and in the game." },
      { tag: 'new', text: 'Drag a piece to move it. You can also choose your cursor in Settings.' },
      { tag: 'new', text: 'Choose heroes, then a battlefield, then fight, in simple steps.' },
      { tag: 'balance', text: 'Classic mode was removed.' },
      {
        tag: 'ui',
        text: 'Face to face is easier to play: pieces face their player, both sides get equal controls and no sideways scrolling.',
      },
      { tag: 'ui', text: 'All four rune pips always show, and spent ones are dimmed.' },
      { tag: 'fix', text: 'Fixed touch dragging and name tags on the rotated side.' },
    ],
  },
  {
    version: '0.1.0',
    date: '2026-10-13',
    title: 'First playable',
    entries: [
      { tag: 'new', text: 'The first playable version: 8×8 board, teams of 4 heroes with roles, and no dice or luck.' },
      { tag: 'new', text: 'Every skill costs runes. You start with 4, and creeps are the only way to earn more.' },
      { tag: 'new', text: 'Creeps are pawn-like minions that you move yourself.' },
      { tag: 'balance', text: 'Aggressive Root has a cooldown of 3 and can interrupt once per match.' },
      { tag: 'balance', text: "Summoning Ge'nga's fallen beast costs 3 runes. Beast moves are free." },
      { tag: 'balance', text: 'Hasim steps 1 square in any direction. Backstab stays free.' },
      { tag: 'fix', text: "Storm Hammer no longer kills Hexor's own allies." },
      { tag: 'fix', text: 'Terrain no longer blocks creep lanes.' },
    ],
  },
];

export const LATEST = CHANGELOG[0];
