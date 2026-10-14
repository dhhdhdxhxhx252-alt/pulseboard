import https from 'node:https';
import http from 'node:http';
import net from 'node:net';

export function acceptStatus(target, status) {
  if (target.expectStatus?.length) return target.expectStatus.includes(status);
  return status >= 200 && status < 400;
}

export function probeTcp(target, { now = performance.now.bind(performance) } = {}) {
  return new Promise((resolve) => {
    const started = now();
    const socket = new net.Socket();
    let settled = false;

    const finish = (ok, error) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ok, ms: now() - started, status: null, error });
    };

    socket.setTimeout(target.timeoutMs);
    socket.once('connect', () => finish(true, null));
    socket.once('timeout', () => finish(false, 'timeout'));
    socket.once('error', (requestError) => finish(false, requestError.code ?? requestError.message));
    socket.connect(target.port, target.host);
  });
}

export function probeHttp(target, { now = performance.now.bind(performance) } = {}) {
  return new Promise((resolve) => {
    const url = new URL(target.url);
    const lib = url.protocol === 'https:' ? https : http;
    const started = now();
    let settled = false;

    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve({ ...result, ms: now() - started });
    };

    const request = lib.request(url, {
      method: target.method,
      timeout: target.timeoutMs,
      headers: { 'user-agent': 'pulseboard/1.0', accept: '*/*' },
    }, (response) => {
      const { statusCode } = response;
      response.resume();
      finish({
        ok: acceptStatus(target, statusCode),
        status: statusCode,
        error: acceptStatus(target, statusCode) ? null : `HTTP ${statusCode}`,
      });
    });

    request.setTimeout(target.timeoutMs, () => {
      request.destroy(Object.assign(new Error('timeout'), { code: 'ETIMEDOUT' }));
    });
    request.on('error', (requestError) => {
      finish({ ok: false, status: null, error: requestError.code ?? requestError.message });
    });
    request.end();
  });
}

export function probeTarget(target, options) {
  return target.kind === 'tcp' ? probeTcp(target, options) : probeHttp(target, options);
}

export async function probeAll(targets, options) {
  return Promise.all(targets.map(async (target) => ({ target, result: await probeTarget(target, options) })));
}
