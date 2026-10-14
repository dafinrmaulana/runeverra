// Small UI primitives with enter/exit transitions: Modal, Switch, Accordion, Steps.
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

/** Keep something mounted while it animates out. Returns [mounted, state]. */
function usePresence(open: boolean, ms = 200): [boolean, 'in' | 'out'] {
  const [mounted, setMounted] = useState(open);
  useEffect(() => {
    if (open) { setMounted(true); return; }
    const t = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(t);
  }, [open, ms]);
  return [mounted || open, open ? 'in' : 'out'];
}

type ModalProps = {
  open: boolean; onClose: () => void; label: string; children: ReactNode;
  className?: string; full?: boolean; mirrored?: boolean;
};
/** A dialog over the whole screen: fades in, card drops in from above. */
export function Modal({ open, onClose, label, children, className = '', full, mirrored }: ModalProps) {
  const [mounted, state] = usePresence(open);
  useEffect(() => {
    if (!open) return;
    const k = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', k);
    return () => window.removeEventListener('keydown', k);
  }, [open, onClose]);
  if (!mounted) return null;
  return createPortal(
    <div className={`modal ${state}${full ? ' full' : ''}${mirrored ? ' mirrored' : ''}`} role="dialog" aria-modal="true" aria-label={label} onClick={onClose}>
      <div className={`modal-card ${className}`} onClick={(e) => e.stopPropagation()}>{children}</div>
    </div>,
    document.body,
  );
}

/** An on/off switch with a label. */
export function Switch({ checked, onChange, label, disabled }: { checked: boolean; onChange: (v: boolean) => void; label: ReactNode; disabled?: boolean }) {
  return (
    <label className={`switch${disabled ? ' off' : ''}`}>
      <input type="checkbox" role="switch" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
      <span className="knob" />
      <span>{label}</span>
    </label>
  );
}

/** Expand/collapse with a smooth height transition. */
export function Accordion({ trigger, children, className = '', defaultOpen = false }: { trigger: ReactNode; children: ReactNode; className?: string; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();
  return (
    <div className={`acc ${className}${open ? ' open' : ''}`}>
      <button type="button" className="acc-trigger" aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
        <span className="acc-label">{trigger}</span>
        <span className="acc-chev" aria-hidden="true">▾</span>
      </button>
      <div className="acc-panel" id={id} role="region"><div className="acc-inner">{children}</div></div>
    </div>
  );
}

/** Numbered step timeline. `current` is 1-based. */
export function Steps({ steps, current }: { steps: string[]; current: number }) {
  // Kept mounted between screens: the line to the new step fills, then its marker lights up.
  const prev = useRef(current);
  const arriving = prev.current < current;
  useEffect(() => { prev.current = current; }, [current]);
  return (
    <ol className="steps" aria-label="Progress">
      {steps.map((s, i) => {
        const n = i + 1;
        const st = n < current ? 'done' : n === current ? 'now' : 'todo';
        return (
          <li key={s} className={`${st}${st === 'now' && arriving ? ' arriving' : ''}`} aria-current={st === 'now' ? 'step' : undefined}>
            {i > 0 && <span className="bar" aria-hidden="true"><i /></span>}
            <span className="num">{st === 'done' ? '✓' : n}</span>
            <span className="lbl">{s}</span>
          </li>
        );
      })}
    </ol>
  );
}
