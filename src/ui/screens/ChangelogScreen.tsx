import { CHANGELOG, TAG_LABEL } from '../changelog';

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

/** One accordion per release; only the newest starts open. */
export function ChangelogScreen() {
  return (
    <div className="changelog">
      {CHANGELOG.map((patch, index) => (
        <details key={patch.version} className="patch" open={index === 0}>
          <summary className="patch-head">
            <span className="patch-ver">v{patch.version}</span>
            {index === 0 && <span className="patch-latest">Latest</span>}
            <span className="patch-title">{patch.title}</span>
            <span className="patch-date">{fmtDate(patch.date)}</span>
            <span className="patch-chev" aria-hidden="true" />
          </summary>
          <ul>
            {patch.entries.map((entry, entryIndex) => (
              <li key={entryIndex}>
                <span className={`ptag ${entry.tag}`}>{TAG_LABEL[entry.tag]}</span>
                <span>{entry.text}</span>
              </li>
            ))}
          </ul>
        </details>
      ))}
    </div>
  );
}
