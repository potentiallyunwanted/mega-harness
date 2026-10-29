import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

// runs/ is read-only (AGENTS.md): every fixture goes to a temp dir.
let tmpRuns: string;

function app() {
  return createApp({
    adapter: 'shim',
    installed: '2026-10-29T14:06:00+01:00',
    beatEverySeconds: 60,
    runsDir: tmpRuns,
  });
}

function write(night: string, text: string): void {
  writeFileSync(join(tmpRuns, `${night}.jsonl`), text);
}

const good = [
  '{"at":"2026-10-28T02:00:00+01:00","job":"backup","status":"ok","owner":"ana"}',
  '{"at":"2026-10-28T03:00:00+01:00","job":"sync","status":"fail","error":"timeout"}',
].join('\n');

beforeAll(() => {
  tmpRuns = mkdtempSync(join(tmpdir(), 'rig-routes-'));
  write('2026-01-01', `${good}\n`);
  write('2026-01-02', '');
  write('2026-01-03', `${good}\nthis is {not json\n`);
});

afterAll(() => {
  rmSync(tmpRuns, { recursive: true, force: true });
});

describe('digest page', () => {
  it('200 for a night that exists', async () => {
    const res = await app().request('/digest/2026-01-01');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('digest 2026-01-01');
    expect(html).toContain('backup');
    expect(html).toContain('timeout');
  });

  it('404 for a night with no file', async () => {
    const res = await app().request('/digest/2026-12-31');
    expect(res.status).toBe(404);
  });

  it('empty night renders "nothing ran"', async () => {
    const res = await app().request('/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await res.text()).toContain('nothing ran');
  });

  it('a bad line still renders and is counted', async () => {
    const res = await app().request('/digest/2026-01-03');
    const html = await res.text();
    expect(res.status).toBe(200);
    expect(html).toContain('backup');
    expect(html).toContain('1 line(s) did not parse');
  });
});

describe('digest json', () => {
  it('200 with one row per job, sorted', async () => {
    const res = await app().request('/api/digest/2026-01-01');
    expect(res.status).toBe(200);
    const rows: unknown = await res.json();
    expect(Array.isArray(rows)).toBe(true);
    expect(rows).toMatchObject([
      { job: 'backup', owner: 'ana', runs: 1, lastStatus: 'ok' },
      { job: 'sync', owner: null, lastStatus: 'fail', lastError: 'timeout' },
    ]);
  });

  it('404 for a night with no file', async () => {
    const res = await app().request('/api/digest/2026-12-31');
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: 'no such night' });
  });

  it('empty night is an empty list', async () => {
    const res = await app().request('/api/digest/2026-01-02');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('a bad line does not throw and the good rows remain', async () => {
    const res = await app().request('/api/digest/2026-01-03');
    expect(res.status).toBe(200);
    const rows: unknown = await res.json();
    expect(Array.isArray(rows) ? rows.length : -1).toBe(2);
  });
});
