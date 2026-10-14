import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';

import { main } from '../src/main.js';
import { runOnce } from '../src/run.js';

function tempDir() {
  return mkdtempSync(join(tmpdir(), 'pulseboard-'));
}

function serveUp(handler = (request, response) => response.writeHead(200).end('pong')) {
  return new Promise((resolve) => {
    const server = createServer(handler);
    server.listen(0, '127.0.0.1', () => resolve(server));
  });
}

test('runOnce пишет сайт, бейджи и state, повторный запуск накапливает историю', async (t) => {
  const server = await serveUp();
  t.after(() => server.close());
  const dir = tempDir();
  const configPath = join(dir, 'pulseboard.config.json');
  const now = Date.UTC(2026, 9, 14, 12);

  const config = {
    title: 'Home lab',
    targets: [
      { name: 'Api & Co', url: `http://127.0.0.1:${server.address().port}/health` },
      { name: 'Dead box', host: '127.0.0.1', port: 1 },
    ],
    output: { dir: join(dir, 'site'), stateFile: join(dir, 'state.json') },
  };
  writeJson(configPath, config);

  const first = await runOnce({ configPath, now });
  assert.equal(first.overall, 'down');
  assert.equal(first.summaries[0].status, 'up');
  assert.equal(first.summaries[1].status, 'down');

  const html = readFileSync(join(dir, 'site', 'index.html'), 'utf8');
  assert.match(html, /Home lab/);
  assert.match(html, /Api &amp; Co/);
  assert.ok(existsSync(join(dir, 'site', 'badges', 'api-co.svg')));
  assert.ok(existsSync(join(dir, 'site', 'badges', 'dead-box.svg')));

  const second = await runOnce({ configPath, now: now + 60_000 });
  assert.equal(second.summaries[0].checked, 2);
  assert.equal(second.summaries[0].uptimePct, 100);
  assert.equal(second.summaries[1].consecutiveFails, 2);

  const summary = JSON.parse(readFileSync(join(dir, 'site', 'summary.json'), 'utf8'));
  assert.equal(summary.schema, 'pulseboard/v1');
  assert.equal(summary.services.length, 2);
});

test('битый state-файл перезаписывается, а сайт всё равно генерируется', async (t) => {
  const server = await serveUp();
  t.after(() => server.close());
  const dir = tempDir();
  const configPath = join(dir, 'cfg.json');
  const statePath = join(dir, 'state.json');
  writeJson(configPath, {
    title: 'T',
    targets: [{ name: 'Api', url: `http://127.0.0.1:${server.address().port}/` }],
    output: { dir: join(dir, 'site'), stateFile: statePath },
  });
  writeJson(statePath, { version: 99, checks: 'not-an-object' });

  const { summaries } = await runOnce({ configPath });
  assert.equal(summaries[0].status, 'up');
  assert.equal(JSON.parse(readFileSync(statePath, 'utf8')).version, 1);
});

test('конфиг с недопустимой целью даёт понятную ошибку без стектрейса', async () => {
  const dir = tempDir();
  const configPath = join(dir, 'cfg.json');
  writeJson(configPath, { targets: [{ name: 'Bad' }] });

  const { code, out, err } = await capture(() => main(['--config', configPath]));
  assert.equal(code, 1);
  assert.match(out + err, /нужен url либо host\+port/);
});

test('--init создаёт конфиг, повторный вызов не перезаписывает его', async () => {
  const dir = tempDir();
  const configPath = join(dir, 'sub', 'pulseboard.config.json');

  assert.equal((await capture(() => main(['--config', configPath, '--init']))).code, 0);
  const created = readFileSync(configPath, 'utf8');
  assert.match(created, /My services/);

  const again = await capture(() => main(['--config', configPath, '--init']));
  assert.equal(again.code, 1);
  assert.equal(readFileSync(configPath, 'utf8'), created);
});

test('--help печатает справку и возвращает 0', async () => {
  const { code, out } = await capture(() => main(['--help']));
  assert.equal(code, 0);
  assert.match(out, /fail-on-down/);
});

test('--fail-on-down возвращает 1 только когда есть упавшая цель', async (t) => {
  const server = await serveUp();
  t.after(() => server.close());
  const dir = tempDir();
  const configPath = join(dir, 'cfg.json');
  writeJson(configPath, {
    title: 'T',
    targets: [{ name: 'Api', url: `http://127.0.0.1:${server.address().port}/` }],
    output: { dir: join(dir, 'site'), stateFile: join(dir, 'state.json') },
  });

  const ok = await capture(() => main(['--config', configPath, '--quiet', '--fail-on-down']));
  assert.equal(ok.code, 0);

  writeJson(configPath, {
    title: 'T',
    targets: [{ name: 'Api', host: '127.0.0.1', port: 1 }],
    output: { dir: join(dir, 'site'), stateFile: join(dir, 'state.json') },
  });
  const down = await capture(() => main(['--config', configPath, '--quiet', '--fail-on-down']));
  assert.equal(down.code, 1);
});

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2));
}

async function capture(body) {
  const lines = { out: [], err: [] };
  const streams = [process.stdout, process.stderr];
  const originals = streams.map((stream) => stream.write);
  streams[0].write = (chunk) => { lines.out.push(String(chunk)); return true; };
  streams[1].write = (chunk) => { lines.err.push(String(chunk)); return true; };
  try {
    const code = await body();
    return { code, out: lines.out.join(''), err: lines.err.join('') };
  } finally {
    streams.forEach((stream, index) => { stream.write = originals[index]; });
  }
}
