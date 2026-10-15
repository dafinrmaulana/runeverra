import { useState } from 'react';
import { MAX_MIN } from '../../clock.js';

const PRESETS = [3, 5];

/** Classic (no clock) or a shared time bank per player, in whole minutes. */
export function ClockPicker({ minutes, onChange, readOnly }: { minutes: number; onChange: (m: number) => void; readOnly?: boolean }) {
  const custom = minutes > 0 && !PRESETS.includes(minutes);
  const [text, setText] = useState(custom ? String(minutes) : '');
  const commit = (v: string) => {
    setText(v);
    const n = Math.round(Number(v));
    if (Number.isFinite(n) && n >= 1 && n <= MAX_MIN) onChange(n);
  };
  return (
    <div className="clockpicker">
      <h3>Time</h3>
      <div className="clock-opts" role="group" aria-label="Time per player">
        <button type="button" className="btn" aria-pressed={minutes === 0} disabled={readOnly} onClick={() => { setText(''); onChange(0); }}>Classic</button>
        {PRESETS.map((m) => (
          <button key={m} type="button" className="btn" aria-pressed={minutes === m} disabled={readOnly} onClick={() => { setText(''); onChange(m); }}>{m} min</button>
        ))}
        <label className={`clock-custom${custom ? ' on' : ''}`}>
          <input type="number" inputMode="numeric" min={1} max={MAX_MIN} placeholder="Other" value={readOnly && custom ? String(minutes) : text}
            disabled={readOnly} onChange={(e) => commit(e.target.value)} aria-label={`Custom minutes, 1 to ${MAX_MIN}`} />
          <span className="unit">min</span>
        </label>
      </div>
      <p className="note">{minutes ? `Each player gets ${minutes} min in total. Run out of time and you lose; undo is off.` : 'Classic has no clock. A match can run as long as the players like.'}</p>
    </div>
  );
}
