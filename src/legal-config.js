// Who is behind Runeverra and how to reach them. Every legal page reads these values; change them here only.
export const LEGAL = {
  product: 'Runeverra',
  operator: 'Runeverra, by Agung Nugroho and Dafi Nurrohman Maulana',
  contactEmail: 'dafinamulana18@gmail.com',
  country: 'Indonesia',
  siteUrl: 'https://runeverra.daffi.my.id',
  effective: '2026-10-15',
  // Retention facts the Privacy Policy states; keep them equal to the server (server/ws-server.mjs ROOM_TTL_MS, CHAT_KEEP).
  roomIdleMinutes: 5,
  chatKept: 50,
  credits: [
    { name: 'Agung Nugroho', url: 'https://www.instagram.com/heavysmokerashtray/', roles: ['Founder', 'Director', 'Designer (concept, game, hero and rules design)'] },
    { name: 'Dafi Nurrohman Maulana', url: 'https://daffi.my.id', roles: ['Developer'] },
  ],
  honorable: [
    { name: 'Petra Emmanuello Saerang', url: 'https://www.instagram.com/petra._.q/' },
    { name: 'Santo Gunawan (a.k.a. SATAN)', url: 'https://www.instagram.com/blvccrainbow6/' },
  ],
  honorableNote: 'For their input, testing, and ideas on balancing and characters.',
  thirdParty: [
    { name: 'React', license: 'MIT' }, { name: 'Vite', license: 'MIT' }, { name: 'ws', license: 'MIT' },
    { name: 'Cinzel, Barlow and Barlow Condensed fonts (via Fontsource)', license: 'SIL Open Font License 1.1' },
  ],
};
