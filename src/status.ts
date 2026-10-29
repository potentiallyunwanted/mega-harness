import { readdirSync } from 'node:fs';
import type { RigConfig } from './config.js';
import { lastBeat, type Beat } from './heartbeat.js';
import { readNight } from './digest/read-night.js';

export type Status = {
  adapter: string;
  installed: string;
  lastBeat: Beat | null;
  nights: NightSummary[];
};

// Counts are per job: each job's final state for the night (`lastStatus`), not per log line.
// `counts` is null when the night could not be read.
export type NightSummary = {
  night: string;
  counts: { ok: number; retry: number; fail: number } | null;
};

export function summariseNight(runsDir: string, night: string): NightSummary {
  try {
    const read = readNight(runsDir, night);
    if (read === null) return { night, counts: null };
    const counts = { ok: 0, retry: 0, fail: 0 };
    for (const row of read.rows) counts[row.lastStatus] += 1;
    return { night, counts };
  } catch {
    return { night, counts: null };
  }
}

// Nights on disk = runs/<YYYY-MM-DD>.jsonl, newest first.
export function nightsOnDisk(runsDir: string): string[] {
  try {
    return readdirSync(runsDir)
      .filter((f) => /^\d{4}-\d{2}-\d{2}\.jsonl$/.test(f))
      .map((f) => f.slice(0, 10))
      .sort()
      .reverse();
  } catch {
    return [];
  }
}

export function readStatus(config: RigConfig): Status {
  return {
    adapter: config.adapter,
    installed: config.installed,
    lastBeat: lastBeat(),
    nights: nightsOnDisk(config.runsDir).map((n) => summariseNight(config.runsDir, n)),
  };
}
