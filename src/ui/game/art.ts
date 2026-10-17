// Piece and terrain art drawn inline (SVG strings), so the board needs no image requests for them.

/** Terrain by block kind; unknown kinds fall back to rock. A new map obstacle adds its drawing here. */
export const TERRAIN_SVG: Record<string, string> = {
  pillar:
    '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="35" rx="13" ry="3.5" fill="rgba(0,0,0,.25)"/><rect x="11" y="7" width="18" height="27" rx="2" fill="#c99a62"/><rect x="11" y="7" width="6" height="27" fill="#e2b980"/><rect x="8" y="4" width="24" height="5" rx="1.5" fill="#b0824e"/><rect x="8" y="31" width="24" height="5" rx="1.5" fill="#b0824e"/><path d="M14 14 V28 M20 14 V28 M26 14 V28" stroke="#a87a45" stroke-width="1.2"/></svg>',
  tree: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="36" rx="12" ry="3" fill="rgba(0,0,0,.25)"/><path d="M19 36 L19 22 L14 16 M20 24 L26 17 M19 28 L13 24" stroke="#3a2210" stroke-width="2.6" fill="none" stroke-linecap="round"/><ellipse cx="20" cy="13" rx="17" ry="6" fill="#3d2a17"/><ellipse cx="11" cy="15" rx="7" ry="4" fill="#4a3320"/><ellipse cx="28" cy="14" rx="8" ry="4.2" fill="#4a3320"/></svg>',
  ruin: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="35" rx="14" ry="3.5" fill="rgba(0,0,0,.3)"/><path d="M7 34 L9 12 L18 9 L19 34 Z" fill="#7d8a76"/><path d="M19 34 L20 15 L31 13 L33 34 Z" fill="#6b7865"/><path d="M9 12 L18 9 L20 15 L31 13" stroke="#55614f" stroke-width="1.5" fill="none"/><path d="M6 30 C10 24 8 18 12 14 M30 34 C28 26 33 22 31 16 M16 34 C18 28 22 30 24 24" stroke="#4fae45" stroke-width="2.2" fill="none" stroke-linecap="round"/><circle cx="12" cy="14" r="2.4" fill="#5fc152"/><circle cx="31" cy="16" r="2.2" fill="#5fc152"/><circle cx="24" cy="24" r="2" fill="#5fc152"/></svg>',
  rock: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="35" rx="15" ry="3.5" fill="rgba(0,0,0,.25)"/><path d="M5 33 L9 17 L18 9 L29 12 L35 24 L33 33 Z" fill="#7b8899"/><path d="M18 9 L22 20 L35 24 M22 20 L14 33 M9 17 L22 20" stroke="#5c6878" stroke-width="1.4" fill="none"/><path d="M9 17 L18 9 L29 12 L23 13 L14 16 Z" fill="#f4f8fb"/></svg>',
  ice: '<svg viewBox="0 0 40 40"><ellipse cx="20" cy="35" rx="14" ry="3" fill="rgba(0,40,80,.25)"/><path d="M8 33 L6 18 L14 6 L22 14 L28 5 L35 17 L32 33 Z" fill="rgba(190,232,255,.88)" stroke="#e9f8ff" stroke-width="1.5"/><path d="M14 6 L16 33 M22 14 L22 33 M28 5 L26 33" stroke="rgba(255,255,255,.7)" stroke-width="1.2"/><path d="M8 33 L6 18 L14 6 L12 20 Z" fill="rgba(255,255,255,.55)"/></svg>',
};
export const CREEP_SVG =
  '<svg viewBox="0 0 24 24"><g fill="currentColor"><circle cx="12" cy="6.5" r="3.4"/><path d="M8.6 11.2 h6.8 l1.6 6.3 h-10 z"/><rect x="5.2" y="18" width="13.6" height="3.4" rx="1.2"/></g></svg>';
export const BEAST_SVG =
  '<svg viewBox="0 0 24 24"><g fill="currentColor"><ellipse cx="12" cy="15.5" rx="5" ry="4.2"/><circle cx="6.2" cy="10" r="2.1"/><circle cx="9.6" cy="6.6" r="2.1"/><circle cx="14.4" cy="6.6" r="2.1"/><circle cx="17.8" cy="10" r="2.1"/></g></svg>';
