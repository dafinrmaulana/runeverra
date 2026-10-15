import { CHANGELOG, TAG_LABEL } from '../changelog';

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** One accordion per release; only the newest starts open. */
export function ChangelogScreen() {
  return (
    <div className="changelog">
      {CHANGELOG.map((p, i) => (
        <details key={p.version} className="patch" open={i === 0}>
          <summary className="patch-head">
            <span className="patch-ver">v{p.version}</span>
            {i === 0 && <span className="patch-latest">Latest</span>}
            <span className="patch-title">{p.title}</span>
            <span className="patch-date">{fmtDate(p.date)}</span>
            <span className="patch-chev" aria-hidden="true" />
          </summary>
          <ul>
            {p.entries.map((e, j) => (
              <li key={j}><span className={`ptag ${e.tag}`}>{TAG_LABEL[e.tag]}</span><span>{e.text}</span></li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
