import type { DigestRow, Night } from '../digest/types.js';

// Retries of 3 or more, or a last status of fail, are marked (plan.md § 2a).
function isMarked(row: DigestRow): boolean {
  return row.retries >= 3 || row.lastStatus === 'fail';
}

// Missing data is `—`, never an empty cell (docs/styleguide.md). Times print as logged, offset kept.
function orDash(value: string | null): string {
  return value === null || value === '' ? '—' : value;
}

export function DigestPage({ night }: { night: Night }) {
  return (
    <>
      <h1>digest {night.night}</h1>
      {night.badLines > 0 && <p class="mute">{night.badLines} line(s) did not parse</p>}
      {night.rows.length === 0 ? (
        <p class="mute">nothing ran</p>
      ) : (
        <table>
          <thead>
            <tr>
              <th>job</th>
              <th>owner</th>
              <th>runs</th>
              <th>retries</th>
              <th>last status</th>
              <th>last error</th>
              <th>first at</th>
              <th>last at</th>
            </tr>
          </thead>
          <tbody>
            {night.rows.map((row) => (
              <tr class={isMarked(row) ? 'warn' : undefined}>
                <td>{row.job}</td>
                <td>{orDash(row.owner)}</td>
                <td>{row.runs}</td>
                <td>{row.retries}</td>
                <td>{row.lastStatus}</td>
                <td>{orDash(row.lastError)}</td>
                <td>{orDash(row.firstAt)}</td>
                <td>{orDash(row.lastAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
