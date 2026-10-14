export const STATE_VERSION = 1;

export function emptyState({ now = Date.now(), title = '' } = {}) {
  return { version: STATE_VERSION, title, createdAt: now, updatedAt: null, checks: {} };
}

/** Отбрасывает записи старше окна и лишние по количеству (старые — первыми). */
export function trimEntries(entries, { now, windowHours, maxEntries }) {
  const cutoff = now - windowHours * 3600_000;
  const withinWindow = entries.filter((entry) => entry.ts >= cutoff);
  return withinWindow.length > maxEntries ? withinWindow.slice(-maxEntries) : withinWindow;
}

export function recordCheck(state, name, result, { now = Date.now(), windowHours = 24, maxEntries = 400 } = {}) {
  const entry = {
    ts: now,
    ok: Boolean(result.ok),
    ms: Number.isFinite(result.ms) ? Math.round(result.ms) : null,
    status: result.status ?? null,
    error: result.error ?? null,
  };
  const previous = state.checks[name]?.entries ?? [];
  state.checks[name] = { entries: trimEntries([...previous, entry], { now, windowHours, maxEntries }) };
  state.updatedAt = now;
  return state;
}

function percentile(sortedValues, fraction) {
  if (sortedValues.length === 0) return null;
  const index = Math.min(sortedValues.length - 1, Math.ceil(fraction * sortedValues.length) - 1);
  return sortedValues[Math.max(0, index)];
}

export function summarize(state, name, { now = Date.now(), windowHours = 24 } = {}) {
  const entries = state.checks[name]?.entries ?? [];
  const cutoff = now - windowHours * 3600_000;
  const window = entries.filter((entry) => entry.ts >= cutoff);
  const latest = entries.at(-1) ?? null;

  const okCount = window.filter((entry) => entry.ok).length;
  const latencies = window.filter((entry) => entry.ok && entry.ms !== null).map((entry) => entry.ms).sort((a, b) => a - b);

  let consecutiveFails = 0;
  for (let i = entries.length - 1; i >= 0 && !entries[i].ok; i -= 1) consecutiveFails += 1;

  return {
    name,
    status: latest === null ? 'unknown' : latest.ok ? 'up' : 'down',
    checked: window.length,
    ok: okCount,
    uptimePct: window.length === 0 ? null : Math.round((okCount / window.length) * 10000) / 100,
    avgMs: latencies.length === 0 ? null : Math.round(latencies.reduce((a, b) => a + b, 0) / latencies.length),
    p95Ms: percentile(latencies, 0.95),
    lastMs: latest?.ms ?? null,
    lastCheckedAt: latest?.ts ?? null,
    lastError: latest?.ok ? null : (latest?.error ?? null),
    consecutiveFails,
    recent: entries.slice(-40),
  };
}

export function overallStatus(summaries) {
  if (summaries.some((summary) => summary.status === 'down')) return 'down';
  if (summaries.length === 0 || summaries.every((summary) => summary.status === 'unknown')) return 'unknown';
  return 'up';
}
