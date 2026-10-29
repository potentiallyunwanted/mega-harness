// Folds runs/<night>.jsonl into one row per job (plan.md § 1). The only place a log line is
// parsed: past `parseLine` everything is a RunLine, so the page and the JSON can trust the
// types (docs/styleguide.md).

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import type { DigestRow, Night, ReadNight, RunLine, RunStatus } from './types.js';

const RUN_STATUSES: readonly string[] = ['ok', 'retry', 'fail'];

function isRunStatus(value: unknown): value is RunStatus {
  return typeof value === 'string' && RUN_STATUSES.includes(value);
}

// One line, or `null` for a line that does not parse. A bad line is counted by the caller and
// dropped; it is never thrown, so one truncated line still renders the night.
function parseLine(line: string): RunLine | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(line);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  if (!('at' in parsed) || typeof parsed.at !== 'string') return null;
  if (!('job' in parsed) || typeof parsed.job !== 'string') return null;
  if (!('status' in parsed) || !isRunStatus(parsed.status)) return null;

  // A machine job may leave `owner` out entirely; absent and null are the same thing, and
  // neither is a reason to drop the line.
  const owner: unknown = 'owner' in parsed ? parsed.owner : null;
  if (owner !== null && typeof owner !== 'string') return null;

  const error: unknown = 'error' in parsed ? parsed.error : null;
  if (error !== null && error !== undefined && typeof error !== 'string') return null;

  const run: RunLine = { at: parsed.at, job: parsed.job, status: parsed.status, owner };
  if (typeof error === 'string') run.error = error;
  return run;
}

// `null` for a night with no file; anything else is thrown, since a runs dir we cannot read is
// a real fault and not an empty night.
function readLog(path: string): string | null {
  try {
    return readFileSync(path, 'utf8');
  } catch (err: unknown) {
    const code: unknown = err instanceof Error && 'code' in err ? err.code : undefined;
    if (code === 'ENOENT' || code === 'ENOTDIR' || code === 'EISDIR') return null;
    throw err;
  }
}

export const readNight: ReadNight = (runsDir: string, night: string): Night | null => {
  // `night` arrives from a URL (plan.md § 2a). A name that could leave `runsDir` is not a
  // night: it reads as "no file", which the page answers with 404.
  if (night === '' || /[\\/\0]/.test(night) || night.includes('..')) return null;

  const text = readLog(join(runsDir, `${night}.jsonl`));
  if (text === null) return null;

  const rows = new Map<string, DigestRow>();
  let badLines = 0;

  for (const raw of text.split('\n')) {
    const line = raw.trim();
    if (line === '') continue; // blank lines, and the newline the file ends with, are not lines
    const run = parseLine(line);
    if (run === null) {
      badLines += 1;
      continue;
    }
    const row = rows.get(run.job);
    if (row === undefined) {
      rows.set(run.job, {
        job: run.job,
        owner: run.owner,
        runs: 1,
        retries: run.status === 'retry' ? 1 : 0,
        lastStatus: run.status,
        lastError: run.error ?? null,
        firstAt: run.at,
        lastAt: run.at,
      });
      continue;
    }
    row.runs += 1;
    if (run.status === 'retry') row.retries += 1;
    // Last line wins for the status, its error and the time: the fold follows the order the
    // lines appear for that job, and the times keep the offset they were logged with.
    row.lastStatus = run.status;
    row.lastError = run.error ?? null;
    row.lastAt = run.at;
    // The owner belongs to the job, not to its last line: the first owner a line names stays,
    // and a job no line ever named keeps `owner: null` rather than an invented one.
    row.owner = row.owner ?? run.owner;
  }

  // Sorted by job here, so the page and the JSON cannot disagree about the order (plan.md § 2b).
  const sorted = [...rows.values()].sort((a, b) => (a.job < b.job ? -1 : a.job > b.job ? 1 : 0));
  return { night, rows: sorted, badLines };
};
