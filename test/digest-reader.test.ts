import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { readNight } from '../src/digest/read-night.js';
import type { Night } from '../src/digest/types.js';

// The real nights are read-only fixtures (AGENTS.md), so every written log goes to a temp dir.
const realRuns = fileURLToPath(new URL('../runs', import.meta.url));
let tmpRuns: string;

function write(night: string, lines: string): void {
  writeFileSync(join(tmpRuns, `${night}.jsonl`), lines);
}

function night(value: Night | null): Night {
  if (value === null) throw new Error('expected a night, got null');
  return value;
}

beforeAll(() => {
  tmpRuns = mkdtempSync(join(tmpdir(), 'rig-digest-'));
});

afterAll(() => {
  rmSync(tmpRuns, { recursive: true, force: true });
});

describe('readNight on runs/2026-10-28.jsonl', () => {
  it('finds 5 jobs and exactly 1 bad line', () => {
    const got = night(readNight(realRuns, '2026-10-28'));
    expect(got.rows.map((row) => row.job)).toEqual([
      'digest/render',
      'fixtures/refresh',
      'lane/sync',
      'notes/backup',
      'rig/rotate-logs',
    ]);
    expect(got.rows).toHaveLength(5);
    expect(got.badLines).toBe(1);
  });

  it('counts the runs and the retries of each job', () => {
    const rows = night(readNight(realRuns, '2026-10-28')).rows;
    const byJob = new Map(rows.map((row) => [row.job, row]));
    expect(byJob.get('lane/sync')).toMatchObject({ runs: 8, retries: 1, lastStatus: 'ok', lastError: null });
    expect(byJob.get('fixtures/refresh')).toMatchObject({ runs: 4, retries: 3, lastStatus: 'ok' });
    expect(byJob.get('notes/backup')).toMatchObject({
      runs: 1,
      retries: 0,
      lastStatus: 'fail',
      lastError: 'quota exceeded',
      owner: 'lane-07',
    });
  });

  it('keeps the row of a job with no owner', () => {
    const rows = night(readNight(realRuns, '2026-10-28')).rows;
    const row = rows.find((candidate) => candidate.job === 'digest/render');
    expect(row).toMatchObject({ job: 'digest/render', owner: null, runs: 1, lastStatus: 'ok' });
  });

  it('keeps the offset the times were logged with', () => {
    const rows = night(readNight(realRuns, '2026-10-28')).rows;
    const row = rows.find((candidate) => candidate.job === 'lane/sync');
    expect(row?.firstAt).toBe('2026-10-28T23:00:06+01:00');
    expect(row?.lastAt).toBe('2026-10-29T05:00:04+01:00');
  });

  it('reads the other night on disk too', () => {
    const got = night(readNight(realRuns, '2026-10-27'));
    expect(got.night).toBe('2026-10-27');
    expect(got.rows.map((row) => row.job)).toEqual(['fixtures/refresh', 'lane/sync', 'notes/backup', 'rig/rotate-logs']);
    expect(got.badLines).toBe(0);
  });
});

describe('readNight folds the lines in the order they appear', () => {
  it('takes the last status, its error and the first and last time from that order', () => {
    write(
      '2026-01-02',
      [
        '{"at":"2026-01-02T23:00:00+02:00","job":"a","status":"ok","owner":"rook"}',
        '{"at":"2026-01-02T23:30:00+02:00","job":"a","status":"retry","owner":"rook","error":"first"}',
        '{"at":"2026-01-03T00:10:00+02:00","job":"a","status":"fail","owner":"rook","error":"last"}',
        '',
      ].join('\n'),
    );
    const rows = night(readNight(tmpRuns, '2026-01-02')).rows;
    expect(rows).toEqual([
      {
        job: 'a',
        owner: 'rook',
        runs: 3,
        retries: 1,
        lastStatus: 'fail',
        lastError: 'last',
        firstAt: '2026-01-02T23:00:00+02:00',
        lastAt: '2026-01-03T00:10:00+02:00',
      },
    ]);
  });

  it('clears the last error when the job ended without one', () => {
    write(
      '2026-01-03',
      '{"at":"2026-01-03T01:00:00+02:00","job":"a","status":"fail","owner":null,"error":"boom"}\n' +
        '{"at":"2026-01-03T01:01:00+02:00","job":"a","status":"ok","owner":null}\n',
    );
    const rows = night(readNight(tmpRuns, '2026-01-03')).rows;
    expect(rows[0]).toMatchObject({ lastStatus: 'ok', lastError: null, retries: 0, runs: 2 });
  });
});

describe('readNight on a log that is not clean', () => {
  it('counts a line that does not parse and still renders the night', () => {
    write(
      '2026-01-04',
      [
        '{"at":"2026-01-04T23:00:00+02:00","job":"a","status":"ok","owner":"rook"}',
        '{"at":"2026-01-04T23:01:00+02:00","job":"a","stat',
        'not json at all',
        '{"at":"2026-01-04T23:02:00+02:00","job":"b","status":"fail","owner":null,"error":"boom"}',
        '',
      ].join('\n'),
    );
    const got = night(readNight(tmpRuns, '2026-01-04'));
    expect(got.badLines).toBe(2);
    expect(got.rows.map((row) => row.job)).toEqual(['a', 'b']);
    expect(got.rows[0]).toMatchObject({ runs: 1, lastStatus: 'ok' });
  });

  it('counts a line that parses but is not a run line', () => {
    write(
      '2026-01-05',
      [
        '{"at":"2026-01-05T23:00:00+02:00","job":"a","status":"nope","owner":"rook"}',
        '{"at":"2026-01-05T23:01:00+02:00","job":"a","owner":"rook"}',
        '{"job":"a","status":"ok","owner":"rook"}',
        '[]',
        '42',
        '{"at":"2026-01-05T23:02:00+02:00","job":"a","status":"ok","owner":"rook"}',
      ].join('\n'),
    );
    const got = night(readNight(tmpRuns, '2026-01-05'));
    expect(got.badLines).toBe(5);
    expect(got.rows).toHaveLength(1);
    expect(got.rows[0]).toMatchObject({ job: 'a', runs: 1 });
  });

  it('reads a line that leaves the owner out as a row with no owner', () => {
    write('2026-01-06', '{"at":"2026-01-06T23:00:00+02:00","job":"a","status":"ok"}\n');
    const got = night(readNight(tmpRuns, '2026-01-06'));
    expect(got.badLines).toBe(0);
    expect(got.rows[0]).toMatchObject({ job: 'a', owner: null });
  });

  it('does not invent an owner, and keeps the first one a line names', () => {
    write(
      '2026-01-07',
      '{"at":"2026-01-07T23:00:00+02:00","job":"a","status":"ok","owner":null}\n' +
        '{"at":"2026-01-07T23:01:00+02:00","job":"a","status":"ok","owner":"rook"}\n' +
        '{"at":"2026-01-07T23:02:00+02:00","job":"a","status":"ok","owner":null}\n',
    );
    const rows = night(readNight(tmpRuns, '2026-01-07')).rows;
    expect(rows[0]?.owner).toBe('rook');
  });

  it('ignores blank lines between the runs', () => {
    write(
      '2026-01-08',
      '\n{"at":"2026-01-08T23:00:00+02:00","job":"a","status":"retry","owner":"rook","error":"x"}\n\n  \n',
    );
    const got = night(readNight(tmpRuns, '2026-01-08'));
    expect(got.badLines).toBe(0);
    expect(got.rows[0]).toMatchObject({ runs: 1, retries: 1, lastError: 'x' });
  });
});

describe('readNight on a night that is not there', () => {
  it('answers null for a night with no file', () => {
    expect(readNight(tmpRuns, '2026-01-09')).toBeNull();
    expect(readNight(realRuns, '1999-01-01')).toBeNull();
  });

  it('answers null for a runs dir that is not there', () => {
    expect(readNight(join(tmpRuns, 'nope'), '2026-01-02')).toBeNull();
  });

  it('answers null for a night that could leave the runs dir', () => {
    expect(readNight(tmpRuns, '../../etc/passwd')).toBeNull();
    expect(readNight(tmpRuns, '')).toBeNull();
  });

  it('answers a night with no rows for a file that is empty', () => {
    write('2026-01-10', '');
    expect(readNight(tmpRuns, '2026-01-10')).toEqual({ night: '2026-01-10', rows: [], badLines: 0 });
    write('2026-01-11', '\n\n');
    expect(readNight(tmpRuns, '2026-01-11')).toEqual({ night: '2026-01-11', rows: [], badLines: 0 });
  });
});
