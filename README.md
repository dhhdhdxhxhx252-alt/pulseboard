# pulseboard

Uptime-монитор, у которого нет ни сервера, ни базы данных, ни зависимостей. Он просто опрашивает цели, дописывает историю в JSON и выдаёт **статичную status-страницу с SVG-бейджами** — её можно публиковать на GitHub Pages из cron-воркфлоу.

```text
cron (GitHub Actions) ──▶ pulseboard ──▶ state.json (история)
                                      └─▶ site/index.html + summary.json + badges/*.svg ──▶ GitHub Pages
```

- **Нулевые зависимости.** Только `node:http`, `node:https`, `node:net`, `node:util`. Node.js 20+.
- **Два типа проверок.** `tcp` — открыть сокет на хост:порт; `http` — запрос с проверкой кода ответа (можно задать свой белый список `expectStatus`).
- **Окно истории.** Uptime, средняя задержка и p95 считаются за `windowHours` (по умолчанию 24 ч); старые записи и лишние по количеству отбрасываются автоматически.
- **Бейджи.** `badges/<имя>.svg` в той же палитре, что и страница — работают как картинка в любом README.
- **summary.json.** Машиночитаемая сводка по сервисам — её могут читать другие скрипты.
- **Экранирование.** Имена целей и сообщения ошибок проходят через HTML/XML-экран: в конфигурации нет способа внедрить разметку в страницу.

## Быстрый старт

```bash
npm install -g pulseboard         # или: git clone + npm link

pulseboard --init                 # создаёт pulseboard.config.json с примером
$EDITOR pulseboard.config.json
pulseboard                        # опрос → state.json + site/
```

В репозитории этого проекта всё это можно сделать без установки:

```bash
node src/main.js
```

## Конфиг

`pulseboard.config.json`:

```json
{
  "title": "Home lab",
  "targets": [
    { "name": "GitHub API", "url": "https://api.github.com/zen" },
    { "name": "Postgres", "host": "db.internal", "port": 5432 },
    { "name": "Health", "url": "https://example.com/healthz", "method": "HEAD", "expectStatus": [200, 204], "timeoutMs": 3000 }
  ],
  "history": { "maxEntries": 400, "windowHours": 24 },
  "output": { "dir": "site", "stateFile": "state.json" }
}
```

| Поле | Значение |
|---|---|
| `url` | HTTP/HTTPS-цель; код 2xx–3xx считается успехом |
| `host` + `port` | TCP-цель: важен сам факт соединения |
| `method` | HTTP-метод, по умолчанию `GET` |
| `expectStatus` | точный список «успешных» кодов вместо 2xx–3xx |
| `timeoutMs` | таймаут одной проверки, по умолчанию 5000 |
| `history.windowHours` | окно, за которое считается uptime |
| `history.maxEntries` | потолок записей на цель (старые обрезаются) |

Имена целей не должны повторяться (регистронезависимо) — иначе конфиг не пройдёт валидацию.

## Флаги

```
pulseboard [--config ФАЙЛ]      опросить цели и перегенерировать сайт
pulseboard --init               создать конфиг с примером
  --out DIR                     каталог сайта (переопределяет конфиг)
  --state ФАЙЛ                  файл истории (переопределяет конфиг)
  --quiet                       не печатать таблицу
  --fail-on-down                код возврата 1, если хоть одна цель недоступна
```

`--fail-on-down` удобно в CI: пайплайн падает ровно тогда, когда сервис лёг.

## Публикация на GitHub Pages

В репозитории лежит [`./.github/workflows/pages.yml`](.github/workflows/pages.yml): каждые 10 минут он опрашивает цели, публикует `site/` как Pages и коммитит обновлённый `state.json` обратно в ветку. Что включить:

1. Settings → Pages → **Source: GitHub Actions**.
2. Запустить workflow вручную (`Run workflow`), чтобы появилась первая история.

История живёт в `state.json` в репозитории — именно поэтому она переживает перезапуски раннера. Битый или чужой `state.json` не роняет запуск: файл перезаписывается с предупреждением в stderr.

## Печать результата

```text
UP      GitHub API                 uptime    100%  551 мс
DOWN    Postgres                   uptime   87.5%  ECONNREFUSED
Итог: down
```

## Разработка

```bash
npm test          # node --test: 32 теста — конфиг, опрос на локальном http-сервере,
                  # агрегация истории, рендер, CLI целиком (run → files → exit code)
```

CI гоняет тесты на Node 20 и 22, Linux и Windows.

## Ограничения

- Проверки идут параллельно, но это **не** распределённый мониторинг: если раннер недоступен, страница не обновляется, а «uptime» просто молчит — stale-детектора нет.
- Никаких алертов: pulseboard только рисует страницу.
- TCP-проверка констатирует открытый порт, а не то, что сервис внутри здоров.

## Лицензия

MIT — см. [LICENSE](LICENSE).
