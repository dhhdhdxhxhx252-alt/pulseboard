import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';

import { acceptStatus, probeHttp, probeTcp } from '../src/probe.js';

function serve(handler) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('acceptStatus по умолчанию считает успешными 2xx и 3xx', () => {
  const target = { expectStatus: null };
  assert.equal(acceptStatus(target, 200), true);
  assert.equal(acceptStatus(target, 302), true);
  assert.equal(acceptStatus(target, 404), false);
});

test('expectStatus задаёт точный белый список', () => {
  const target = { expectStatus: [404] };
  assert.equal(acceptStatus(target, 404), true);
  assert.equal(acceptStatus(target, 200), false);
});

test('http-проверка фиксирует код и задержку', async (t) => {
  const server = await serve((request, response) => {
    response.writeHead(200, { 'content-type': 'text/plain' });
    response.end('ok');
  });
  t.after(() => server.close());

  const target = {
    kind: 'http',
    url: `http://127.0.0.1:${server.address().port}/health`,
    method: 'GET',
    timeoutMs: 2000,
    expectStatus: null,
  };
  const result = await probeHttp(target);
  assert.equal(result.ok, true);
  assert.equal(result.status, 200);
  assert.equal(result.error, null);
  assert.ok(result.ms >= 0);
});

test('http-проверка падает на 500 и пишет HTTP-код в ошибку', async (t) => {
  const server = await serve((request, response) => response.writeHead(503).end());
  t.after(() => server.close());

  const result = await probeHttp({
    kind: 'http',
    url: `http://127.0.0.1:${server.address().port}/`,
    method: 'GET',
    timeoutMs: 2000,
    expectStatus: null,
  });
  assert.equal(result.ok, false);
  assert.equal(result.status, 503);
  assert.equal(result.error, 'HTTP 503');
});

test('tcp-проверка успешна на открытом порту', async (t) => {
  const server = await serve((request, response) => response.end());
  t.after(() => server.close());

  const result = await probeTcp({
    kind: 'tcp',
    host: '127.0.0.1',
    port: server.address().port,
    timeoutMs: 2000,
  });
  assert.equal(result.ok, true);
  assert.equal(result.status, null);
  assert.equal(result.error, null);
});

test('tcp-проверка закрытого порта возвращает ошибку, не бросая', async () => {
  const taken = await serve((request, response) => response.end());
  const port = taken.address().port;
  await new Promise((resolve) => taken.close(resolve));

  const result = await probeTcp({ kind: 'tcp', host: '127.0.0.1', port, timeoutMs: 2000 });
  assert.equal(result.ok, false);
  assert.equal(typeof result.error, 'string');
  assert.ok(result.ms >= 0);
});
