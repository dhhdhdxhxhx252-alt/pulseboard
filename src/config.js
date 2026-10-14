import { readFileSync } from 'node:fs';

export class ConfigError extends Error {}

const DEFAULTS = {
  title: 'Service status',
  timeoutMs: 5000,
  maxEntries: 400,
  windowHours: 24,
  stateFile: 'state.json',
  outputDir: 'site',
};

function inferKind(target) {
  if (target.kind) return String(target.kind).toLowerCase();
  if (target.url) return 'http';
  if (target.host && target.port) return 'tcp';
  throw new ConfigError(`Цель «${target.name ?? '?'}»: нужен url либо host+port.`);
}

function validateTarget(raw, index) {
  if (typeof raw !== 'object' || raw === null) throw new ConfigError(`Цель #${index} — не объект.`);
  const name = typeof raw.name === 'string' && raw.name.trim() ? raw.name.trim() : null;
  if (!name) throw new ConfigError(`Цель #${index}: поле name обязательно.`);

  const kind = inferKind(raw);
  if (kind !== 'http' && kind !== 'tcp') throw new ConfigError(`Цель «${name}»: kind может быть http или tcp.`);

  if (kind === 'http') {
    if (typeof raw.url !== 'string' || !/^https?:\/\//i.test(raw.url)) {
      throw new ConfigError(`Цель «${name}»: url должен начинаться с http:// или https://.`);
    }
  } else {
    if (typeof raw.host !== 'string' || !raw.host) throw new ConfigError(`Цель «${name}»: нужен host.`);
    const port = Number(raw.port);
    if (!Number.isInteger(port) || port < 1 || port > 65535) throw new ConfigError(`Цель «${name}»: порт должен быть 1–65535.`);
  }

  const expectStatus = Array.isArray(raw.expectStatus)
    ? raw.expectStatus.map(Number).filter(Number.isInteger)
    : null;

  return {
    name,
    kind,
    url: raw.url ?? null,
    host: raw.host ?? null,
    port: raw.port ? Number(raw.port) : null,
    method: (raw.method ?? 'GET').toUpperCase(),
    timeoutMs: Number(raw.timeoutMs ?? DEFAULTS.timeoutMs),
    expectStatus,
    note: typeof raw.note === 'string' ? raw.note : '',
  };
}

export function validateConfig(raw) {
  if (typeof raw !== 'object' || raw === null) throw new ConfigError('Конфиг должен быть объектом JSON.');
  if (!Array.isArray(raw.targets) || raw.targets.length === 0) throw new ConfigError('В конфиге нет ни одной цели (targets).');

  const names = new Set();
  const targets = raw.targets.map((target, index) => {
    const parsed = validateTarget(target, index);
    const key = parsed.name.toLowerCase();
    if (names.has(key)) throw new ConfigError(`Дублирующееся имя цели: ${parsed.name}`);
    names.add(key);
    return parsed;
  });

  return {
    title: raw.title ?? DEFAULTS.title,
    targets,
    maxEntries: Number(raw.history?.maxEntries ?? DEFAULTS.maxEntries),
    windowHours: Number(raw.history?.windowHours ?? DEFAULTS.windowHours),
    stateFile: raw.output?.stateFile ?? DEFAULTS.stateFile,
    outputDir: raw.output?.dir ?? DEFAULTS.outputDir,
  };
}

export function loadConfig(path) {
  let text;
  try {
    text = readFileSync(path, 'utf8');
  } catch (error) {
    throw new ConfigError(`Не удалось прочитать конфиг ${path}: ${error.message}`);
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new ConfigError(`Конфиг ${path} — некорректный JSON: ${error.message}`);
  }
  return validateConfig(parsed);
}

export const EXAMPLE_CONFIG = {
  title: 'My services',
  targets: [
    { name: 'Cloudflare DNS', url: 'https://1.1.1.1/head' },
    { name: 'Google DNS (tcp)', host: '8.8.8.8', port: 53 },
  ],
  history: { maxEntries: 400, windowHours: 24 },
  output: { dir: 'site', stateFile: 'state.json' },
};
