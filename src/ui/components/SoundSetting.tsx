import { useState } from 'react';
import { Switch } from './ui';
import { sfx, type SfxName, sfxEnabled, sfxVolume, setSfxEnabled, setSfxVolume } from '../audio';

const PREVIEW: [SfxName, string][] = [['move', 'Step'], ['capture', 'Takedown'], ['backstab', 'Backstab'], ['grave', 'Shield'], ['root', 'Roots'], ['interrupt', 'Interrupt'], ['storm', 'Storm'], ['ice', 'Ice'], ['summon', 'Summon'], ['victory', 'Win'], ['defeat', 'Lose']];

/** Sound effects on/off and volume; remembered between visits. */
export function SoundSetting() {
  const [on, setOn] = useState(sfxEnabled());
  const [vol, setVol] = useState(sfxVolume());
  return (
    <div className="sound-setting">
      <Switch checked={on} onChange={(v) => { setOn(v); setSfxEnabled(v); }} label={<><b>Sound effects</b><small>Moves, takedowns and every skill</small></>} />
      <label className={`sound-vol${on ? '' : ' off'}`}>
        <span>Volume</span>
        <input type="range" min={0} max={100} value={Math.round(vol * 100)} disabled={!on} aria-label="Sound effects volume"
          onChange={(e) => { const v = Number(e.target.value) / 100; setVol(v); setSfxVolume(v); }}
          onPointerUp={() => sfx('capture')} onKeyUp={() => sfx('capture')} />
      </label>
      <details className="sound-preview">
        <summary>Preview sounds</summary>
        <div className="sound-preview-grid">
          {PREVIEW.map(([id, label]) => <button key={id} type="button" className="btn tiny" disabled={!on} onClick={() => sfx(id)}>{label}</button>)}
        </div>
      </details>
    </div>
  );
}
