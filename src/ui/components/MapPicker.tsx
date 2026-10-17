import { useMemo } from 'react';
import { MAPS, SLOTS, CREEPS, createMatch } from '../../engine/index.ts';
import { MAP_IDS } from '../data';

/** CSS classes for each square of a map preview: light square, terrain, hero slots, creeps. */
function miniMapClasses(blocks: Record<string, unknown>, creeps: boolean) {
  const squares: string[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const classes = [(r + c) % 2 ? '' : 'l'];
      const file = 'abcdefgh'[c];
      const name = `${file}${8 - r}`;
      if (blocks[`${r},${c}`]) classes.push('b');
      if (SLOTS.p1.includes(name)) classes.push('u1');
      if (SLOTS.p2.includes(name)) classes.push('u2');
      if (creeps && r === 6 && CREEPS.files.includes(file)) classes.push('c1');
      if (creeps && r === 1 && CREEPS.files.includes(file)) classes.push('c2');
      squares.push(classes.join(' '));
    }
  }
  return squares;
}

function MiniMap({ id, creeps }: { id: string; creeps: boolean }) {
  const blocks = useMemo(() => createMatch({ map: id }).blocks, [id]);
  const squares = miniMapClasses(blocks, creeps);
  return (
    <span className={`mini theme-${MAPS[id].theme}`}>
      {squares.map((classes, index) => (
        <i key={index} className={classes} />
      ))}
    </span>
  );
}

type Props = { map: string; creeps: boolean; onMap?: (m: string) => void; readOnly?: boolean };

export function MapPicker({ map, creeps, onMap, readOnly }: Props) {
  return (
    <div className="mappicker">
      <div className="maps">
        {MAP_IDS.map((id) => {
          const m = MAPS[id];
          return (
            <button
              key={id}
              type="button"
              className="maptile"
              aria-pressed={map === id}
              disabled={readOnly && map !== id}
              onClick={() => !readOnly && onMap?.(id)}
            >
              <MiniMap id={id} creeps={creeps} />
              <b>{m.name}</b>
              <span>{m.blurb}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
