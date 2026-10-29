// The shape of a night, and the one function that produces it. Committed before the reader so
// every part of the digest page can start against the contract instead of waiting (plan.md § 1).

export type RunStatus = 'ok' | 'retry' | 'fail';

// One line of runs/<night>.jsonl, as a job wrote it. `owner` is often absent on machine jobs.
export type RunLine = {
  at: string;
  job: string;
  status: RunStatus;
  owner: string | null;
  error?: string;
};

// One job's whole night, folded into a row. Times keep the offset they were logged with; the
// digest never converts to UTC (docs/styleguide.md).
export type DigestRow = {
  job: string;
  owner: string | null;
  runs: number;
  retries: number;
  lastStatus: RunStatus;
  lastError: string | null;
  firstAt: string;
  lastAt: string;
};

// A night that exists on disk. `badLines` counts lines that did not parse: they are counted,
// never thrown, so one bad line still renders the night (plan.md § 1).
export type Night = {
  night: string;
  rows: DigestRow[];
  badLines: number;
};

// `null` means no file for that night, which the page answers with 404. A file that exists but
// holds nothing is a Night with no rows, which the page renders as "nothing ran" (plan.md § 2a).
export type ReadNight = (runsDir: string, night: string) => Night | null;
