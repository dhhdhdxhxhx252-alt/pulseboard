#!/usr/bin/env node
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { pathToFileURL } from 'node:url';
import { parseArgs } from 'node:util';

import { ConfigError, EXAMPLE_CONFIG } from './config.js';
import { runOnce } from './run.js';

const OPTIONS = {
  config: { type: 'string', default: 'pulseboard.config.json' },
  state: { type: 'string' },
  out: { type: 'string' },
  init: { type: 'boolean', default: false },
  quiet: { type: 'boolean', default: false },
  'fail-on-down': { type: 'boolean', default: false },
  help: { type: 'boolean', default: false },
};

const HELP = `pulseboard — статичная status-страница по результатам проверок.

Использование:
  pulseboard --init                 создать pulseboard.config.json с примером
  pulseboard [--config ФАЙЛ]        проверить цели, обновить state и сгенерировать сайт

Флаги:
  --out DIR                         каталог сайта (по умолчанию из конфига)
  --state ФАЙЛ                      файл истории (по умолчанию из конфига)
  --quiet                           не печатать сводку
  --fail-on-down                    код возврата 1, если хоть одна цель недоступна
`;

export function formatTable(summaries) {
  return summaries.map((summary) => {
    const uptime = summary.uptimePct === null ? '—' : `${summary.uptimePct}%`;
    const latency = summary.avgMs === null ? (summary.lastError ?? '—') : `${summary.avgMs} мс`;
    return `${summary.status.toUpperCase().padEnd(7)} ${summary.name.padEnd(26)} uptime ${uptime.padStart(7)}  ${latency}`;
  }).join('\n');
}

export async function main(argv) {
  const { values } = parseArgs({ args: argv, options: OPTIONS, allowPositionals: false });

  if (values.help) {
    process.stdout.write(HELP);
    return 0;
  }

  if (values.init) {
    if (existsSync(values.config)) {
      process.stderr.write(`${values.config} уже существует — не перезаписываю.\n`);
      return 1;
    }
    const parent = dirname(values.config);
    if (parent !== '') mkdirSync(parent, { recursive: true });
    writeFileSync(values.config, `${JSON.stringify(EXAMPLE_CONFIG, null, 2)}\n`);
    if (!values.quiet) process.stdout.write(`Создан ${values.config}.\n`);
    return 0;
  }

  try {
    const { summaries, overall } = await runOnce({
      configPath: values.config,
      stateOverride: values.state,
      outOverride: values.out,
    });
    if (!values.quiet) {
      process.stdout.write(`${formatTable(summaries)}\nИтог: ${overall}\n`);
    }
    return values['fail-on-down'] && overall === 'down' ? 1 : 0;
  } catch (error) {
    process.stderr.write(error instanceof ConfigError ? `${error.message}\n` : `${error.name}: ${error.message}\n`);
    return 1;
  }
}

const invokedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (invokedDirectly) {
  process.exitCode = await main(process.argv.slice(2));
}
