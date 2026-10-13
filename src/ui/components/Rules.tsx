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
        <li>Distances count diagonals as 1: "within 3" is the 7×7 square around the hero.</li>
      </ul>
      <h3>Roles</h3>
      <ul>
        <li><b>Roam</b> (Ge'nga, Aqna, Hexor): up to 2 squares straight; Hexor's L jump counts as his 2 steps.</li>
        <li><b>Assassin</b> (Hasim): 1 square any way, plus a free Backstab jump.</li>
        <li><b>Support</b> (Plantae): steps 1, but its skill reaches 3 squares.</li>
        <li>Magumba slides up to 2 diagonally.</li>
      </ul>
      <h3>Skill tokens</h3>
      <ul>
        <li>Each side starts with 4 tokens (the maximum). They don't refill each turn.</li>
        <li>+1 token for killing an enemy creep, +1 when your creep reaches the far side.</li>
        <li>Costs: ice 1 · Empty Grave 2 · Storm Hammer 2 · summon beast 3 · Aggressive Root 3 (interrupt 3). Backstab and beast moves are free.</li>
      </ul>
      <h3>Interrupt</h3>
      <p>When an enemy unit within 3 of your Plantae acts, you may cancel that action for 3 tokens. The catch: Plantae is rooted on your next turn, and the skill recharges for 3 turns.</p>
      <h3>Creeps</h3>
      <p>Four pawns per side on the flank lanes. Like chess pawns: 1 square forward, capture diagonally forward. Moving one uses your turn.</p>
    </div>
  );
}
