// The rune glyph, so a cost reads as "2 runes" at a glance instead of a bare number.
import { costChip } from '../data';

export function Rune({ className = '' }: { className?: string }) {
  return (
    <svg className={`rune-ico ${className}`} viewBox="0 0 16 16" aria-hidden="true">
      <path d="M8 1.5 L13 8 L8 14.5 L3 8 Z" />
      <path d="M8 4.5 V11.5 M8 7 L10.4 5 M8 9.6 L10.4 7.6" />
    </svg>
  );
}

type Skill = Parameters<typeof costChip>[0];

/** A skill's price: the rune glyph and the number ("free" for a free signature move). */
export function CostChip({ sk, className = 'cost' }: { sk: Skill; className?: string }) {
  const text = costChip(sk);
  const free = text === 'free';
  return (
    <span className={className} title={free ? 'Free' : `${text} ${text === '1' ? 'rune' : 'runes'}`}>
      {!free && <Rune />}
      {text}
    </span>
  );
}
