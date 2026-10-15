// Terms of Service, Privacy Policy and Copyright & credits. Identity facts come from src/legal-config.js.
// The privacy text describes what the code actually does; keep the two in step (test/legal.test.js guards the numbers).
import { LEGAL } from '../../legal-config.js';

export type LegalDoc = 'terms' | 'privacy' | 'copyright';
export const LEGAL_DOCS: { id: LegalDoc; label: string }[] = [
  { id: 'terms', label: 'Terms' }, { id: 'privacy', label: 'Privacy' }, { id: 'copyright', label: 'Copyright' },
];

const mail = <a href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>;
const ext = (href: string, text: string) => <a href={href} target="_blank" rel="noopener noreferrer">{text}</a>;

function Terms() {
  return (
    <>
      <h2>Terms of Service</h2>
      <p className="legal-date">Effective {LEGAL.effective}</p>
      <p>These terms cover your use of {LEGAL.product} at {ext(LEGAL.siteUrl, LEGAL.siteUrl)} and the installed app ("the Game"), run by {LEGAL.operator} ("we"). By using the Game you agree to them. If you do not agree, please do not use it.</p>
      <h3>1. Using the Game</h3>
      <p>The Game is free to play for personal, non-commercial use. We give you a limited, revocable, non-exclusive licence to play it. You may not copy, resell or redistribute the Game, its art or its code except as the law or an open-source licence allows, and you may not try to break, overload or cheat the online service (for example by sending forged messages to the relay).</p>
      <h3>2. Online play and chat</h3>
      <p>Online rooms and chat connect you with other people. Be respectful: no harassment, hate, threats, spam, personal data of others or anything unlawful. We may remove a room, block a connection or limit chat to keep the service safe, without notice. You are responsible for what you write. Messages are visible to the other player in the room.</p>
      <h3>3. Availability</h3>
      <p>The Game is a prototype and changes often. Matches, rooms, scores and replays can be lost when we update or restart the service. We do not promise it will always be available or error-free.</p>
      <h3>4. No warranty</h3>
      <p>The Game is provided "as is" and "as available", without warranties of any kind, to the extent the law allows.</p>
      <h3>5. Limit of liability</h3>
      <p>To the extent the law allows, we are not liable for indirect or consequential loss, or for loss of data or progress, arising from your use of the Game. Nothing here limits liability that cannot be limited by law.</p>
      <h3>6. Intellectual property</h3>
      <p>The Game, its name, art, characters and code belong to us and our contributors, apart from third-party components listed under Copyright. See the Copyright page.</p>
      <h3>7. Changes and ending</h3>
      <p>We may update these terms; the effective date above shows the latest version, and continued use means you accept it. We may stop or change the Game at any time. You can stop using it at any time.</p>
      <h3>8. Governing law</h3>
      <p>These terms are governed by the laws of {LEGAL.country}. Disputes go to the competent courts of {LEGAL.country}, unless mandatory law says otherwise.</p>
      <h3>9. Contact</h3>
      <p>Questions about these terms: {mail}.</p>
    </>
  );
}

function Privacy() {
  return (
    <>
      <h2>Privacy Policy</h2>
      <p className="legal-date">Effective {LEGAL.effective}</p>
      <p>This explains what {LEGAL.product} stores and shares. We keep it small on purpose: there are no accounts, no cookies, no ads and no analytics.</p>
      <h3>On your device</h3>
      <p>Your browser stores your settings (such as chosen map, difficulty, cursor and time), your win tally and your last 15 match replays, in local storage. The online seat you hold is kept in session storage for that tab. This data never leaves your device, and you can delete it by clearing the site's data in your browser. The Game's service worker caches the app files so it can open offline.</p>
      <h3>Online play</h3>
      <p>When you create or join a room, our relay server receives and keeps in memory only for as long as the room exists: the room code, a random seat token, your hero picks, the match moves and your chat messages (the last {LEGAL.chatKept} per room). Nothing is written to a database. A room with nobody connected is deleted after {LEGAL.roomIdleMinutes} minutes, and all of this goes with it. The other player in the room can see your picks, moves and messages.</p>
      <h3>Server and network logs</h3>
      <p>Like any website, the web server and its proxy may log technical data such as your IP address, the time and the requested file, for security and troubleshooting. We do not use these logs to identify or profile players, and we keep them only as long as needed for that purpose.</p>
      <h3>Third parties</h3>
      <p>Fonts and images are served from our own site; we do not load third-party trackers or fonts. Links to Instagram or other sites are governed by those sites' own policies.</p>
      <h3>Children</h3>
      <p>The Game is not directed at young children, and we do not knowingly collect personal data from them. Because chat is open text, parents should supervise younger players, who can switch chat off with "Mute chat".</p>
      <h3>Your rights</h3>
      <p>We hold no account data about you. If you believe we hold personal data about you (for example in a log) and want it checked or deleted, write to {mail}. This policy is meant to be consistent with Indonesian data protection law (UU PDP); where other laws apply to you, their rights apply too.</p>
      <h3>Changes</h3>
      <p>If we change this policy, the effective date above changes. Contact: {mail}.</p>
    </>
  );
}

function Copyright() {
  return (
    <>
      <h2>Copyright &amp; credits</h2>
      <p className="legal-date">Effective {LEGAL.effective}</p>
      <p>&copy; {new Date().getFullYear()} {LEGAL.operator}. {LEGAL.product}, its name, characters, hero art, card art, rules and code are our work unless noted below. All rights reserved except as stated in the Terms.</p>
      <h3>Team</h3>
      <ul className="legal-list">
        {LEGAL.credits.map((c) => (
          <li key={c.name}><b>{ext(c.url, c.name)}</b><span>{c.roles.join(' · ')}</span></li>
        ))}
      </ul>
      <h3>Honorable mentions</h3>
      <p>{LEGAL.honorableNote}</p>
      <ul className="legal-list">
        {LEGAL.honorable.map((c) => <li key={c.name}><b>{ext(c.url, c.name)}</b></li>)}
      </ul>
      <h3>Third-party software</h3>
      <ul className="legal-list">
        {LEGAL.thirdParty.map((t) => <li key={t.name}><b>{t.name}</b><span>{t.license}</span></li>)}
      </ul>
      <p>These are used under their own licences; their copyright belongs to their authors.</p>
      <h3>Copyright concerns</h3>
      <p>If you believe something in the Game infringes your rights, write to {mail} with what it is and why, and we will look into it promptly.</p>
    </>
  );
}

export function LegalScreen({ doc, onDoc }: { doc: LegalDoc; onDoc: (d: LegalDoc) => void }) {
  return (
    <div className="legal">
      <nav className="legal-tabs" aria-label="Legal documents">
        {LEGAL_DOCS.map((d) => (
          <button key={d.id} type="button" className="btn" aria-pressed={doc === d.id} onClick={() => onDoc(d.id)}>{d.label}</button>
        ))}
      </nav>
      <article className="legal-doc">
        {doc === 'terms' ? <Terms /> : doc === 'privacy' ? <Privacy /> : <Copyright />}
        <p className="legal-note">This text is a plain-language summary written for this game and is not legal advice.</p>
      </article>
    </div>
  );
}
