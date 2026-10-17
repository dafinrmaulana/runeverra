import { useState } from 'react';
import { sfx, sfxVolume, setSfxVolume } from '../audio';

/** Sound effects volume, remembered between visits. All the way down is silence. */
export function SoundSetting() {
  const [vol, setVol] = useState(sfxVolume());
  const pct = Math.round(vol * 100);
  return (
    <div className="sound-setting">
      <label className="sound-vol">
        <span className="sound-title">
          <b>Sound effects</b>
          <small>{pct === 0 ? 'Off' : `${pct}%`}</small>
        </span>
        <input
          type="range"
          min={0}
          max={100}
          value={pct}
          aria-label="Sound effects volume"
          onChange={(event) => {
            const v = Number(event.target.value) / 100;
            setVol(v);
            setSfxVolume(v);
          }}
          onPointerUp={() => sfx('capture')}
          onKeyUp={() => sfx('capture')}
        />
      </label>
    </div>
  );
}
