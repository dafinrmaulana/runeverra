import { useMemo } from 'react';
import { MAPS, SLOTS, CREEPS, createMatch } from '../../arena.js';
import { MAP_IDS } from '../data';
import { Switch } from './ui';

function MiniMap({ id, creeps }: { id: string; creeps: boolean }) {
  const blocks = useMemo(() => createMatch({ map: id }).blocks as Record<string, unknown>, [id]);
  const cells = [];
  for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) {
    const cls = [(r + c) % 2 ? '' : 'l'];
    const name = `${'abcdefgh'[c]}${8 - r}`;
    if (blocks[`${r},${c}`]) cls.push('b');
    if ((SLOTS.p1 as string[]).includes(name)) cls.push('u1');
    if ((SLOTS.p2 as string[]).includes(name)) cls.push('u2');
    if (creeps && r === 6 && (CREEPS.files as string[]).includes('abcdefgh'[c])) cls.push('c1');
    if (creeps && r === 1 && (CREEPS.files as string[]).includes('abcdefgh'[c])) cls.push('c2');
    cells.push(<i key={`${r}${c}`} className={cls.join(' ')} />);
  }
  return <span className={`mini theme-${(MAPS as any)[id].theme}`}>{cells}</span>;
}

type Props = { map: string; creeps: boolean; onMap?: (m: string) => void; onCreeps?: (c: boolean) => void; readOnly?: boolean };

export function MapPicker({ map, creeps, onMap, onCreeps, readOnly }: Props) {
  return (
    <div className="mappicker">
      <div className="maps">
        {MAP_IDS.map((id) => {
          const m = (MAPS as any)[id];
          return (
            <button key={id} type="button" className="maptile" aria-pressed={map === id} disabled={readOnly && map !== id}
              onClick={() => !readOnly && onMap?.(id)}>
              <MiniMap id={id} creeps={creeps} />
              <b>{m.name}</b><span>{m.blurb}</span>
            </button>
          );
        })}
      </div>
      <Switch checked={creeps} disabled={readOnly} onChange={(v) => onCreeps?.(v)}
        label={<><b>Creeps</b> · four pawns per side on the flank lanes; killing one or breaking through gives a token</>} />
    </div>
  );
}
