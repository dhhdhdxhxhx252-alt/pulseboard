import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import { loadConfig } from './config.js';
import { buildSummaryJson, renderBadge, renderPage } from './render.js';
import { probeAll } from './probe.js';
import { emptyState, overallStatus, recordCheck, summarize } from './state.js';

function slug(name) {
  return String(name).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'target';
}

function readState(path, title, now) {
  if (!existsSync(path)) return emptyState({ now, title });
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8'));
    if (parsed?.version !== 1 || typeof parsed.checks !== 'object') throw new Error('неподдерживаемая версия');
    return parsed;
  } catch (error) {
    process.stderr.write(`state-файл ${path} перезаписан: ${error.message}\n`);
    return emptyState({ now, title });
  }
}

function writeFile(path, contents) {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, contents);
}

export async function runOnce({ configPath, stateOverride, outOverride, now = Date.now() } = {}) {
  const config = loadConfig(configPath);
  const statePath = stateOverride ?? config.stateFile;
  const outDir = outOverride ?? config.outputDir;

  const state = readState(statePath, config.title, now);
  const results = await probeAll(config.targets, {});

  for (const { target, result } of results) {
    recordCheck(state, target.name, result, { now, windowHours: config.windowHours, maxEntries: config.maxEntries });
  }
  state.title = config.title;
  writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`);

  const summaries = config.targets.map((target) =>
    summarize(state, target.name, { now, windowHours: config.windowHours }));
  const overall = overallStatus(summaries);

  writeFile(join(outDir, 'index.html'), renderPage({ title: config.title, summaries, overall, generatedAt: now }));
  writeFile(join(outDir, 'summary.json'), `${JSON.stringify(buildSummaryJson({ title: config.title, summaries, overall, generatedAt: now }), null, 2)}\n`);
  for (const summary of summaries) {
    writeFile(join(outDir, 'badges', `${slug(summary.name)}.svg`), renderBadge(summary));
  }

  return { config, summaries, overall, statePath, outDir };
}
