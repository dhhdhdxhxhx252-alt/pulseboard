import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildSummaryJson, escapeHtml, renderBadge, renderPage } from '../src/render.js';

test('escapeHtml нейтрализует разметку в именах целей', () => {
  assert.equal(
    escapeHtml('<img src=x onerror="alert(1)">'),
    '&lt;img src=x onerror=&quot;alert(1)&quot;&gt;',
  );
});

test('бейдж содержит имя, uptime и цвет статуса', () => {
  const svg = renderBadge({ name: 'Api', status: 'up', uptimePct: 99.81 });
  assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/);
  assert.match(svg, />Api</);
  assert.match(svg, />99\.81%</);
  assert.match(svg, /#57d9a3/);
});

test('бейдж без истории показывает статус, а не процент', () => {
  const svg = renderBadge({ name: 'Ghost', status: 'unknown', uptimePct: null });
  assert.match(svg, />unknown</);
  assert.doesNotMatch(svg, /%/);
  assert.match(svg, /#6b6570/);
});

test('экранирование в бейдже: имя с & не ломает XML', () => {
  const svg = renderBadge({ name: 'A & B', status: 'down', uptimePct: null });
  assert.match(svg, />A &amp; B</);
  assert.doesNotMatch(svg, /A & B/);
});

test('страница экранирует имя цели в таблице', () => {
  const html = renderPage({
    title: 'My <b>status</b>',
    overall: 'up',
    generatedAt: Date.UTC(2026, 0, 1),
    summaries: [{
      name: '<script>alert(1)</script>',
      status: 'down',
      uptimePct: 50,
      avgMs: null,
      p95Ms: null,
      lastError: 'ETIMEDOUT',
      recent: [],
    }],
  });
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert/);
  assert.match(html, /My &lt;b&gt;status&lt;\/b&gt;/);
  assert.match(html, /ETIMEDOUT/);
  assert.match(html, /нет данных/);
});

test('sparkline рисует по одному столбику на проверку', () => {
  const html = renderPage({
    title: 'T',
    overall: 'up',
    generatedAt: 0,
    summaries: [{
      name: 'Api',
      status: 'up',
      uptimePct: 100,
      avgMs: 10,
      p95Ms: 12,
      lastError: null,
      recent: [
        { ts: 0, ok: true, ms: 9, status: 200, error: null },
        { ts: 1000, ok: false, ms: null, status: null, error: 'x' },
      ],
    }],
  });
  assert.equal(html.split('class="ok"').length - 1, 1);
  assert.equal(html.split('class="bad"').length - 1, 1);
});

test('summary.json снимает recent и содержит схему', () => {
  const payload = buildSummaryJson({
    title: 'T',
    overall: 'down',
    generatedAt: Date.UTC(2026, 0, 2),
    summaries: [{ name: 'Api', status: 'down', uptimePct: null, recent: [{ ts: 1 }] }],
  });
  assert.equal(payload.schema, 'pulseboard/v1');
  assert.equal(payload.status, 'down');
  assert.equal(payload.generatedAt, '2026-01-02T00:00:00.000Z');
  assert.equal('recent' in payload.services[0], false);
});
