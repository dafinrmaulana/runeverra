import { useState } from 'react';
import { sfx, sfxVolume, setSfxVolume } from '../audio';
import { musicVolume, setMusicVolume } from '../music';

/** Music and sound effects volumes, remembered between visits. All the way down is silence. */
export function SoundSetting() {
  const [vol, setVol] = useState(sfxVolume());
  const [mus, setMus] = useState(musicVolume());
  const pct = Math.round(vol * 100), mpct = Math.round(mus * 100);
  return (
    <div className="sound-setting">
      <label className="sound-vol">
        <span className="sound-title"><b>Music</b><small>{mpct === 0 ? 'Off' : `${mpct}%`}</small></span>
        <input type="range" min={0} max={100} value={mpct} aria-label="Music volume"
          onChange={(e) => { const v = Number(e.target.value) / 100; setMus(v); setMusicVolume(v); }} />
      </label>
      <label className="sound-vol">
        <span className="sound-title"><b>Sound effects</b><small>{pct === 0 ? 'Off' : `${pct}%`}</small></span>
        <input type="range" min={0} max={100} value={pct} aria-label="Sound effects volume"
          onChange={(e) => { const v = Number(e.target.value) / 100; setVol(v); setSfxVolume(v); }}
          onPointerUp={() => sfx('capture')} onKeyUp={() => sfx('capture')} />
      </label>
    </div>
  );
}
