# Mobile polish, PWA, chat, new home and legal — design

Six independent parts, built in order. Each is its own commit group (caveman-commit, no push). Changelog entry v0.6.0 at the end.

## A1. Fullscreen map (bot and online; not face to face)
- A button in the game controls row toggles `focus` on `.game-screen`. In focus the side `ledger`, the selected-unit accordion and the score strip are hidden; the status bar (tokens, clocks, turn), the board and the controls row (skill, undo, menu, message) stay.
- The board takes the full width and `100dvh` minus the bars. Entering also asks the browser for Fullscreen API when supported and not already `display-mode: standalone`; iPhone Safari lacks it, so the layout alone applies there.
- Leaving fullscreen with Esc/back keeps the focus layout; the button toggles it. Not persisted.

## A2. PWA (self-hosted HTTPS site only)
- Icons (PIL-generated, rune sigil in sand on umber): 192, 512, maskable 512, apple-touch 180 in `public/icons/`.
- `public/manifest.webmanifest` (standalone, portrait, theme `#221c18`, relative paths for `base: './'`); `index.html` links it plus `theme-color` and apple tags; `build.mjs` strips those from `artifact.html`.
- `public/sw.js`: navigations network-first with cache fallback; same-origin GET assets (`_/*`, `assets/*`) cache as used (stale-while-revalidate); never touches WebSocket or cross-origin requests. Registered from `main.tsx` in production over HTTPS/localhost only, inside try/catch.
- Install button in Settings (`beforeinstallprompt`; iPhone shows the Share → Add to Home Screen hint); hidden when already installed or unsupported.
- Ops note for the owner: nginx should serve `.webmanifest` as `application/manifest+json` and `sw.js` with `Cache-Control: no-cache`.

## A3. Chat (online, WebSocket relay only)
- Protocol: client `{t:'chat', text}`; server validates (string, control chars stripped, trimmed, ≤200 chars, ≤5 messages per 5 s per seat), keeps the last 50 per room in memory, sends `{t:'chat', side, text, ts}` to both seats (sender included) and `{t:'chatlog', log}` to a seat on (re)join.
- Client (`ws-room.ts`): `chat[]` (cap 100), `unread`, `sendChat(text)`, `chatMuted` (local). `room.ts` has `canChat = false`.
- UI: a Chat button with unread badge in the game controls row and the online setup header; a bottom sheet with the message list, quick phrases (GG, Good luck!, Nice move!, Rematch?, Hurry up?) and a text input; incoming messages also appear as a short bubble (~4 s) over the board that never blocks taps; a Mute chat switch. Rendered as plain text, no auto-linking. A line under the input: "By chatting you agree to the Terms."

## B1. Home screen
- Order: demo stage with logo/tagline → three mode cards (Play vs Bot full width; Face to face and Online half each) → a "Learn" card for How to play (highlighted with "New here? Learn the rules in a minute" until opened once; pref `seenRules`) → utility grid (Match review, Patch notes with a "New" dot when `lastSeenVersion` differs, Settings) → footer (Terms · Privacy · Copyright · version).
- Desktop: demo on the right, cards on the left.

## B2. Live demo
- `src/ui/demo-match.ts`: a curated `{ setup, trail }` from a bot-vs-bot game chosen for variety (several different skills) and ending with a winner, plus caption cues keyed by trail index.
- `HomeDemo` plays it on the real board (`createBoard`, full effects) over the hero art wall, loops, shows captions, pauses when off-screen or the tab is hidden, and shows the static wall under `prefers-reduced-motion`.
- A test replays the trail legally to a winner so rule changes cannot silently break it.

## B3. Legal
- Screen `legal` with Terms of Service, Privacy Policy, Copyright & credits; opened from the home footer and Settings; deep links `#terms`, `#privacy`, `#copyright`.
- All identity facts live in `src/ui/legal-config.ts`: operator "Runeverra, by Agung Nugroho and Dafi Nurrohman Maulana", contact `dafinmaulana18@gmail.com`, country Indonesia, site `https://runeverra.daffi.my.id`.
- Credits: Agung Nugroho (https://www.instagram.com/heavysmokerashtray/) — Founder, Director, Designer (concept, game and hero design, rules). Dafi Nurrohman Maulana (https://daffi.my.id) — Developer. Honorable mentions (input, testing, balancing and character ideas): Petra Emmanuello Saerang (https://www.instagram.com/petra._.q/) and Santo Gunawan a.k.a. SATAN (https://www.instagram.com/blvccrainbow6/). Hero art: made by the team (© Runeverra). Third party: React, Vite, ws (MIT); Cinzel, Barlow, Barlow Condensed (SIL OFL 1.1).
- Privacy facts (must stay true to the code): preferences, scores and replays live in the browser; the relay keeps room code, seat token, picks, moves and chat in memory only while the room lives (dropped ~5 min after empty); no accounts, cookies, ads or analytics; server/proxy logs may hold IP and time. Indonesian law (incl. UU PDP) referenced for governing law. Drafts are not legal advice; the page footer of the PR notes say to have them reviewed before monetising.

## Testing
Unit/smoke tests where logic exists (chat relay, manifest/icon integrity, demo trail legality, legal config completeness); typecheck and build every part; the UI is checked manually because the browser tool is unavailable in this environment.

## Out of scope
Chat sounds/emoji, chat for bot/face to face, offline online play, push notifications, store listing.
