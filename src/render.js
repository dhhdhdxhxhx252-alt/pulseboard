const UP = '#57d9a3';
const DOWN = '#ff6b6b';
const UNKNOWN = '#6b6570';
const ACCENT = '#a578ff';
const BG = '#0c0b0e';
const SURFACE = '#161419';
const TEXT = '#f4f1f7';
const MUTED = '#9a93a6';

export function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

export function escapeXml(value) {
  return escapeHtml(value);
}

function statusColor(status) {
  if (status === 'up') return UP;
  if (status === 'down') return DOWN;
  return UNKNOWN;
}

export function renderBadge({ name, status, uptimePct }) {
  const label = String(name);
  const value = uptimePct === null || uptimePct === undefined ? status : `${uptimePct}%`;
  const labelWidth = Math.round(label.length * 6.6) + 12;
  const valueWidth = Math.round(String(value).length * 6.6) + 12;
  const total = labelWidth + valueWidth;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${total}" height="20" role="img" aria-label="${escapeXml(label)}: ${escapeXml(value)}">
  <rect width="${total}" height="20" rx="3" fill="${SURFACE}"/>
  <rect x="${labelWidth}" width="${valueWidth}" height="20" rx="3" fill="${statusColor(status)}"/>
  <g font-family="Verdana,sans-serif" font-size="11" fill="${TEXT}">
    <text x="${labelWidth / 2}" y="14" text-anchor="middle">${escapeXml(label)}</text>
    <text x="${labelWidth + valueWidth / 2}" y="14" text-anchor="middle" fill="#0c0b0e">${escapeXml(value)}</text>
  </g>
</svg>
`;
}

function renderSparkline(recent) {
  if (recent.length === 0) return '<span class="muted">нет данных</span>';
  const bars = recent
    .map((entry) => `<i class="${entry.ok ? 'ok' : 'bad'}" title="${escapeHtml(new Date(entry.ts).toISOString())}"></i>`)
    .join('');
  return `<span class="spark">${bars}</span>`;
}

function formatLatency(summary) {
  if (summary.status === 'down') return escapeHtml(summary.lastError ?? 'недоступен');
  if (summary.avgMs === null) return '<span class="muted">—</span>';
  return `${summary.avgMs} мс <span class="muted">· p95 ${summary.p95Ms ?? '—'}</span>`;
}

export function renderPage({ title, summaries, overall, generatedAt }) {
  const rows = summaries.map((summary) => `
      <tr>
        <td class="name">${escapeHtml(summary.name)}</td>
        <td><span class="dot ${summary.status}"></span>${escapeHtml(summary.status)}</td>
        <td class="num">${summary.uptimePct === null ? '—' : `${summary.uptimePct}%`}</td>
        <td class="num">${formatLatency(summary)}</td>
        <td>${renderSparkline(summary.recent)}</td>
      </tr>`).join('');

  return `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  body { margin: 0; padding: 32px 20px 48px; background: ${BG}; color: ${TEXT};
         font: 15px/1.5 ui-sans-serif, system-ui, "Segoe UI", sans-serif; }
  .wrap { max-width: 900px; margin: 0 auto; }
  h1 { font-size: 22px; margin: 0 0 6px; letter-spacing: .2px; }
  .sub { color: ${MUTED}; font-size: 13px; margin-bottom: 22px; }
  .pill { display: inline-block; padding: 4px 12px; border-radius: 20px; background: ${SURFACE};
          color: ${statusColor(overall)}; font-size: 13px; border: 1px solid #2a2630; }
  table { width: 100%; border-collapse: collapse; background: ${SURFACE}; border-radius: 14px; overflow: hidden; }
  th, td { padding: 13px 14px; text-align: left; font-size: 14px; border-bottom: 1px solid #211d27; }
  th { color: ${ACCENT}; font-size: 11px; text-transform: uppercase; letter-spacing: .08em; font-weight: 600; }
  tr:last-child td { border-bottom: 0; }
  .name { font-weight: 600; }
  .num { font-variant-numeric: tabular-nums; }
  .muted { color: ${MUTED}; }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; vertical-align: middle; }
  .dot.up { background: ${UP}; } .dot.down { background: ${DOWN}; } .dot.unknown { background: ${UNKNOWN}; }
  .spark { display: inline-flex; gap: 2px; }
  .spark i { width: 5px; height: 16px; border-radius: 2px; display: inline-block; }
  .spark i.ok { background: ${UP}; opacity: .75; } .spark i.bad { background: ${DOWN}; }
  footer { margin-top: 18px; color: ${MUTED}; font-size: 12px; }
  a { color: ${ACCENT}; }
</style>
</head>
<body>
  <div class="wrap">
    <h1>${escapeHtml(title)}</h1>
    <div class="sub">
      <span class="pill">${escapeHtml(overall)}</span>
      &nbsp;проверка ${escapeHtml(new Date(generatedAt).toISOString())}
    </div>
    <table>
      <thead>
        <tr><th>Сервис</th><th>Состояние</th><th>Uptime (24ч)</th><th>Задержка</th><th>История</th></tr>
      </thead>
      <tbody>${rows}
      </tbody>
    </table>
    <footer>Сгенерировано <a href="https://github.com/dhhdhdxhxhx252-alt/pulseboard">pulseboard</a> ·
      <a href="summary.json">summary.json</a></footer>
  </div>
</body>
</html>
`;
}

export function buildSummaryJson({ title, summaries, overall, generatedAt }) {
  return {
    schema: 'pulseboard/v1',
    title,
    status: overall,
    generatedAt: new Date(generatedAt).toISOString(),
    services: summaries.map(({ recent, ...summary }) => summary),
  };
}
