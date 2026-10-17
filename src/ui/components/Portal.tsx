import { cssVars } from '../data';
// The online room as a teleportation altar: a rune circle on a stone platform with four glowing pylons.
// It idles in sand while you choose, opens in sand-and-jade while you wait, and flares jade once your
// opponent has stepped through. Purely visual; the room logic stays in App.tsx.
import { Rings } from './Floor';

export type PortalState = 'idle' | 'connecting' | 'open' | 'linked';

const MOTES = Array.from({ length: 14 }, (_, index) => {
  const a = (index / 14) * Math.PI * 2 + (index % 2) * 0.2,
    r = 38 + (index % 3) * 8;
  return { dx: Math.round(Math.cos(a) * r), dy: Math.round(Math.sin(a) * r), d: (index * 0.55).toFixed(2) };
});

export function Portal({ state }: { state: PortalState }) {
  return (
    <div className={`portal ${state}`} aria-hidden="true">
      <div className="portal-disc" />
      <div className="portal-glow" />
      <div className="portal-rings">
        <Rings />
      </div>
      <i className="pylon n" />
      <i className="pylon e" />
      <i className="pylon s" />
      <i className="pylon w" />
      {MOTES.map((mote, index) => (
        <i
          key={index}
          className="mote"
          style={cssVars({ '--dx': `${mote.dx}%`, '--dy': `${mote.dy}%` }, { animationDelay: `${mote.d}s` })}
        />
      ))}
      <i className="portal-pulse" />
    </div>
  );
}
