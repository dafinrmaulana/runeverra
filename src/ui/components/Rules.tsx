/** How to play: the rules in plain words. */
export function Rules({ onTour }: { onTour?: () => void }) {
  return (
    <div className="rules-body">
      {onTour && (
        <button type="button" className="btn primary tour-link" onClick={onTour}>
          Take the guided tour
        </button>
      )}
      <h3>Goal</h3>
      <p>
        Take down the enemy <b>commander</b> (marked with a banner), or all four enemy heroes. Every team needs Plantae
        or Magumba to command it; with both, you choose which one leads. If your commander falls, you lose at once.
        Beasts and creeps don't count.
      </p>
      <h3>Your turn</h3>
      <ul>
        <li>Do one thing: move one unit, or use an active skill. Moving onto an enemy eliminates it.</li>
        <li>In each side's first turn you may move two creeps instead of one.</li>
        <li>
          Tap a unit, then a marked square. Dots are moves, red squares are captures, gold diamonds are Backstab jumps.
        </li>
        <li>
          Terrain (pillars, trees, ruins, rocks, ice) blocks movement. Only Backstab and Hexor's L jump go over it.
        </li>
        <li>
          Skill reach is shown as tinted squares. Plantae and Magumba's skills follow a fixed pattern, never blocked by
          what's in between; other ranges cover the whole square around the hero, diagonals counting as 1.
        </li>
      </ul>
      <h3>Roles</h3>
      <ul>
        <li>
          <b>Roam</b> (Hexor): jumps in an L.
        </li>
        <li>
          <b>Mage</b> (Aqna): slides up to 2 squares straight; her ice does the damage.
        </li>
        <li>
          <b>Fighter</b> (Ge'nga): steps 1 square straight. His beast moves right after him. On its first move you pick
          how it moves for the whole match (a summon keeps it): 1 square any way, up to 2 straight, or up to 2
          diagonally. That first move may also be its own turn.
        </li>
        <li>
          <b>Assassin</b> (Hasim): 1 square any way, plus a free Backstab jump.
        </li>
        <li>
          <b>Support · Commander</b> (Plantae, Magumba): steps 1 square straight. Plantae's Aggressive Root reaches a
          3x3 block right in front of her; Magumba's Empty Grave reaches a fan ahead of him, 2 squares deep. Neither is
          blocked by what's in between.
        </li>
      </ul>
      <h3>Skill runes</h3>
      <ul>
        <li>Each side starts with 4 runes, with no limit on how many you can bank. They don't refill each turn.</li>
        <li>
          +1 rune for killing an enemy hero or creep, +1 when your creep reaches the far side (a new creep then joins on
          its starting square, or the nearest open square).
        </li>
        <li>
          Costs: ice 1 (on an enemy 2) · Empty Grave 2 · Storm Hammer 2 · summon beast 3 · Aggressive Root 3 (interrupt
          3). Backstab and beast moves are free.
        </li>
        <li>
          Aqna's kills store an ice charge instead of using it right away — never more than one at a time. Spend it
          whenever you like, on any later turn. An empty square within 3 of her gets an ice block (1 rune). An enemy up
          to 3 squares straight (2 runes) freezes and shatters: eliminated, no block left; a shielded enemy only loses
          its shield. Terrain and her own units hide the squares behind them; enemies don't. Cast as her action, she may
          still move afterwards.
        </li>
        <li>Ge'nga's summoned beast eliminates an enemy on the square it lands on.</li>
      </ul>
      <h3>Interrupt</h3>
      <p>
        When an enemy unit in the 3x3 block in front of your Plantae acts, or an enemy outside it tries to move or act
        into it — nothing in between stops it — you may cancel that action for 3 runes; the enemy stays where it was.
        The skill then recharges for 3 turns.
      </p>
      <h3>Empty Grave</h3>
      <p>
        A shielded unit still moves and attacks as usual. The first enemy attack on it breaks the shield instead: nobody
        falls, the attacker stays where it was, and the turn passes back to you. Unbroken, it lasts 3 of your turns.
      </p>
      <h3>Time (optional)</h3>
      <p>
        Classic has no clock. In a timed match each player gets the same time in total (3 or 5 minutes, or your own).
        The clock runs for whoever is deciding, and the player who runs out of time loses. Undo is off.
      </p>
      <h3>Score (optional)</h3>
      <p>
        Counts wins for each side across rematches: against the bot per difficulty, face to face Ivory against Ember,
        online per room. Turn it on or off, or reset it, from the in-game menu.
      </p>
      <h3>Creeps</h3>
      <p>
        Four pawns per side on the flank lanes. Like chess pawns: 1 square forward (2 on its first move, if both squares
        are empty), capture diagonally forward. Moving one uses your turn.
      </p>
    </div>
  );
}
