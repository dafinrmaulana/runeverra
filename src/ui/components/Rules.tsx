/** How to play: the rules in plain words. */
export function Rules() {
  return (
    <div className="rules-body">
      <h3>Goal</h3>
      <p>Eliminate all four enemy heroes. Beasts and creeps don't count.</p>
      <h3>Your turn</h3>
      <ul>
        <li>Do one thing: move one unit, or use an active skill. Moving onto an enemy eliminates it.</li>
        <li>Tap a unit, then a marked square. Dots are moves, red squares are captures, gold diamonds are Backstab jumps.</li>
        <li>Terrain (pillars, trees, ruins, rocks, ice) blocks movement. Only Backstab and Hexor's L jump go over it.</li>
        <li>Skill reach is shown as tinted squares. Plantae and Magumba's skills follow a fixed pattern, never blocked by what's in between; other ranges cover the whole square around the hero, diagonals counting as 1.</li>
      </ul>
      <h3>Roles</h3>
      <ul>
        <li><b>Roam</b> (Aqna, Hexor): up to 2 squares straight; Hexor's L jump counts as his 2 steps. Ge'nga steps 1 straight, and his beast moves up to 2 squares diagonally right after him.</li>
        <li><b>Assassin</b> (Hasim): 1 square any way, plus a free Backstab jump.</li>
        <li><b>Support</b> (Plantae, Magumba): steps 1 (Plantae straight, Magumba diagonally). Plantae's Aggressive Root reaches straight ahead to the far edge of the board; Magumba's Empty Grave reaches a fan ahead of him, 2 squares deep. Neither is blocked by what's in between.</li>
      </ul>
      <h3>Skill tokens</h3>
      <ul>
        <li>Each side starts with 4 tokens (the maximum). They don't refill each turn.</li>
        <li>+1 token for killing an enemy creep, +1 when your creep reaches the far side.</li>
        <li>Costs: ice 1 · Empty Grave 2 · Storm Hammer 2 · summon beast 3 · Aggressive Root 3 (interrupt 3). Backstab and beast moves are free.</li>
        <li>Aqna's kills store an ice charge instead of using it right away — never more than one at a time. Spend it whenever you like, on any later turn, for 1 token.</li>
      </ul>
      <h3>Interrupt</h3>
      <p>When an enemy unit straight ahead of your Plantae acts — anywhere along that line, nothing in between stopping it — you may cancel that action for 3 tokens. The skill then recharges for 3 turns.</p>
      <h3>Score (optional)</h3>
      <p>Counts wins for each side across rematches: against the bot per difficulty, face to face Ivory against Ember, online per room. Turn it on or off, or reset it, from the in-game menu.</p>
      <h3>Creeps</h3>
      <p>Four pawns per side on the flank lanes. Like chess pawns: 1 square forward (2 on its first move, if both squares are empty), capture diagonally forward. Moving one uses your turn.</p>
    </div>
  );
}
