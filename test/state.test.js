import assert from 'node:assert/strict';
import { test } from 'node:test';

import { emptyState, overallStatus, recordCheck, summarize, trimEntries } from '../src/state.js';

const HOUR = 3600_000;

function stateWith(entries) {
  const state = emptyState({ now: 0 });
  state.checks.Api = { entries };
  return state;
}

test('первая проверка формирует запись и updatedAt', () => {
  const state = emptyState({ now: 1000 });
  recordCheck(state, 'Api', { ok: true, ms: 41.7, status: 200 }, { now: 1000 });
  assert.deepEqual(state.checks.Api.entries, [
    { ts: 1000, ok: true, ms: 42, status: 200, error: null },
  ]);
  assert.equal(state.updatedAt, 1000);
});

test('uptime считается по окну, а status — по последней проверке', () => {
  const now = 10 * HOUR;
  const state = stateWith([
    { ts: now - 5 * HOUR, ok: true, ms: 10, status: 200, error: null },
    { ts: now - 4 * HOUR, ok: false, ms: null, status: null, error: 'ECONNREFUSED' },
    { ts: now - 3 * HOUR, ok: true, ms: 30, status: 200, error: null },
    { ts: now - 2 * HOUR, ok: true, ms: 50, status: 200, error: null },
  ]);
  const summary = summarize(state, 'Api', { now, windowHours: 24 });
  assert.equal(summary.status, 'up');
  assert.equal(summary.checked, 4);
  assert.equal(summary.uptimePct, 75);
  assert.equal(summary.avgMs, 30);
  assert.equal(summary.lastError, null);
});

test('записи старше окна не влияют на uptime', () => {
  const now = 100 * HOUR;
  const state = stateWith([
    { ts: now - 50 * HOUR, ok: false, ms: null, status: null, error: 'timeout' },
    { ts: now - HOUR, ok: true, ms: 12, status: 200, error: null },
  ]);
  const summary = summarize(state, 'Api', { now, windowHours: 24 });
  assert.equal(summary.checked, 1);
  assert.equal(summary.uptimePct, 100);
});

test('серия падений считается с конца, даже после успешных проверок', () => {
  const now = 10 * HOUR;
  const state = stateWith([
    { ts: now - 4 * HOUR, ok: true, ms: 5, status: 200, error: null },
    { ts: now - 3 * HOUR, ok: false, ms: null, status: null, error: 'a' },
    { ts: now - 2 * HOUR, ok: false, ms: null, status: null, error: 'b' },
    { ts: now - HOUR, ok: false, ms: null, status: null, error: 'c' },
  ]);
  const summary = summarize(state, 'Api', { now });
  assert.equal(summary.status, 'down');
  assert.equal(summary.consecutiveFails, 3);
  assert.equal(summary.lastError, 'c');
});

test('неизвестная цель даёт status=unknown и uptime=null', () => {
  const summary = summarize(emptyState(), 'Ghost', { now: Date.now() });
  assert.equal(summary.status, 'unknown');
  assert.equal(summary.uptimePct, null);
  assert.equal(summary.avgMs, null);
});

test('p95选取 из отсортированных задержек успешных проверок', () => {
  const now = 10 * HOUR;
  const entries = [10, 90, 20, 80, 30].map((ms, index) => ({
    ts: now - (10 - index) * HOUR, ok: true, ms, status: 200, error: null,
  }));
  const summary = summarize(stateWith(entries), 'Api', { now });
  assert.equal(summary.p95Ms, 90);
});

test('trimEntries отбрасывает старые и усекает по maxEntries, оставляя новые', () => {
  const now = 100 * HOUR;
  const entries = Array.from({ length: 50 }, (_, index) => ({
    ts: now - (50 - index) * HOUR,
    ok: true,
  }));
  const trimmed = trimEntries(entries, { now, windowHours: 10, maxEntries: 5 });
  assert.equal(trimmed.length, 5);
  assert.equal(trimmed.at(-1).ts, now - HOUR);
  assert.equal(trimmed[0].ts, now - 5 * HOUR);
});

test('overallStatus: падения перевешивают, пустой список — unknown', () => {
  assert.equal(overallStatus([{ status: 'up' }, { status: 'down' }]), 'down');
  assert.equal(overallStatus([{ status: 'up' }, { status: 'unknown' }]), 'up');
  assert.equal(overallStatus([]), 'unknown');
  assert.equal(overallStatus([{ status: 'unknown' }]), 'unknown');
});

test('recent ограничен последними сорока записями в хронологическом порядке', () => {
  const now = 1000;
  const state = stateWith(
    Array.from({ length: 60 }, (_, index) => ({ ts: index + 1, ok: true, ms: 1, status: 200, error: null })),
  );
  const summary = summarize(state, 'Api', { now: 100_000, windowHours: 24 });
  assert.equal(summary.recent.length, 40);
  assert.equal(summary.recent[0].ts, 21);
  assert.equal(summary.recent.at(-1).ts, 60);
});
