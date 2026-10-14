import assert from 'node:assert/strict';
import { test } from 'node:test';

import { ConfigError, validateConfig } from '../src/config.js';

function config(raw) {
  return validateConfig({ targets: [raw] });
}

test('url-цель выводит kind=http и наследует дефолты', () => {
  const parsed = config({ name: 'Site', url: 'https://example.com' });
  assert.deepEqual(parsed.targets[0], {
    name: 'Site',
    kind: 'http',
    url: 'https://example.com',
    host: null,
    port: null,
    method: 'GET',
    timeoutMs: 5000,
    expectStatus: null,
    note: '',
  });
});

test('host+port выводит kind=tcp, метод приводится к верхнему регистру', () => {
  const [target] = config({ name: 'DB', host: '10.0.0.1', port: 5432, method: 'head' }).targets;
  assert.equal(target.kind, 'tcp');
  assert.equal(target.port, 5432);
  assert.equal(target.method, 'HEAD');
});

test('expectStatus принимает только целые коды', () => {
  const [target] = config({
    name: 'Api',
    url: 'http://127.0.0.1',
    expectStatus: [200, 204, 'x', 2.5],
  }).targets;
  assert.deepEqual(target.expectStatus, [200, 204]);
});

test('цель без url и host+port — ConfigError', () => {
  assert.throws(() => config({ name: 'Broken' }), ConfigError);
});

test('порт вне диапазона и нецелый порт отклоняются', () => {
  assert.throws(() => config({ name: 'A', host: 'h', port: 70000 }), /порт/i);
  assert.throws(() => config({ name: 'B', host: 'h', port: 80.5 }), /порт/i);
});

test('url без схемы отклоняется', () => {
  assert.throws(() => config({ name: 'A', url: 'example.com' }), /http/);
});

test('пустой targets и отсутствующее name отклоняются', () => {
  assert.throws(() => validateConfig({ targets: [] }), /ни одной цели/);
  assert.throws(() => validateConfig({ targets: [{ url: 'https://a.b' }] }), /name/);
  assert.throws(() => validateConfig({}), /targets/);
});

test('дублирующиеся имена целей отклоняются независимо от регистра', () => {
  assert.throws(
    () => validateConfig({
      targets: [
        { name: 'Api', url: 'https://a.b' },
        { name: 'api', url: 'https://c.d' },
      ],
    }),
    /дублиру/i,
  );
});
