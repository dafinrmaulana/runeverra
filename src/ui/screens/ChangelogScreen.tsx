import { CHANGELOG, TAG_LABEL } from '../changelog';

function fmtDate(iso: string) {
  return new Date(iso + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

export function ChangelogScreen() {
  return (
    <div className="changelog">
      {CHANGELOG.map((p, i) => (
        <section key={p.version} className="patch">
          <header className="patch-head">
            <span className="patch-ver">v{p.version}</span>
            {i === 0 && <span className="patch-latest">Latest</span>}
            <span className="patch-date">{fmtDate(p.date)}</span>
          </header>
          <h3>{p.title}</h3>
          <ul>
            {p.entries.map((e, j) => (
              <li key={j}><span className={`ptag ${e.tag}`}>{TAG_LABEL[e.tag]}</span><span>{e.text}</span></li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
