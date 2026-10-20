# Booru Aggregator 1.1 — 238 тегов (18+), дедупликация, ZIP

![Electron](https://img.shields.io/badge/Electron-28-blue) ![Tags](https://img.shields.io/badge/tags-238%20%2B%20139%20NSFW-pink)

Приложение берёт фото с `rule34.xxx / gelbooru.com / danbooru` (и любых booru-совместимых), убирает дубли, оставляет лучшее качество, переводит русские фразы в реальные теги, качает всё одной кнопкой.

## Что внутри (по твоему ТЗ)

- **Дедупликация** — по `md5` + имени файла → оставляет max `width×height`
- **Перевод фраз** — принцип *вся база → твои слова*: `data/tags-db.json` (238) + `data/synonyms.json` скан всех тегов, не наоборот
- **Отрицательные теги** — ты сам решаешь `-3d -lowres` и т.д., жёстких блоков нет (кроме юридического минимума `loli/shota/childporn`)
- **Массовое скачивание** — чекбоксы на карточках → `📦 Скачать ZIP` (бэкенд `/api/zip` + `/api/image-proxy` обходит CORS)

## Быстрый старт (веб-версия, как сейчас)

```bash
# в двух терминалах
npm start --prefix backend   # http://localhost:3001/health → 238 тегов
npm run dev --prefix frontend # http://localhost:5173
# или одним
npm run dev:all
```

## Сборка десктопа (Electron) — как собрал я

Я собрал так (тебе повторить 1 в 1):

**1. Структура:**
```
electron/main.js    — запускает backend/server.js как дочерний процесс, открывает http://localhost:3001
electron/preload.js — пустой (contextIsolation)
electron/icon.png   — иконка
backend/.env        — твои API-ключи (не коммитится)
frontend/dist       — билд Vite (npm run build)
```

**2. Логика запуска:**
- `electron/main.js` → `spawn(process.execPath, [backend/server.js])` на порту 3001
- Через 1.5с `BrowserWindow.loadURL('http://localhost:3001')` — бэкенд уже раздаёт `frontend/dist` как статику
- Внешние ссылки (`source_url`) → `shell.openExternal` в браузер

**3. Команды сборки:**
```bash
# 1. Установи зависимости (один раз)
npm install
cd backend && npm install && cd ..
cd frontend && npm install && cd ..

# 2. Пропиши ключи (см. API_SETUP.md)
cp backend/.env.example backend/.env
nano backend/.env

# 3. Собери фронт
npm run build

# 4. Запуск в режиме приложения (окно)
npm run electron:dev
# 5. Сборка инсталляторов
npm run electron:build
# → создаст dist/Booru Aggregator-1.1.0.AppImage, .deb, .exe (nsis)
```

В этой песочнице Electron не стартует из-за отсутствия `libgtk-3.so.0` — это нормально. У тебя на Windows/Linux всё соберётся без этого.

## Подключение API/URL — через что

**Через `backend/.env` + `backend/server.js`:**

- **Rule34** — https://rule34.xxx/index.php?page=account → возьми `User ID` + `API Key` → в `.env`:
  ```
  RULE34_API_KEY=...
  RULE34_USER_ID=...
  ```
  В `server.js` функция `fetchRule34` уже добавляет `&api_key=...&user_id=...` к URL.

- **Gelbooru** — https://gelbooru.com/index.php?page=account&s=options → `API Key` + `User ID` → аналогично `GELBOORU_API_KEY`.

- **Свой сайт** — скопируй `fetchDanbooru` в `server.js`, поменяй URL на `https://my.site/api/posts?tags=...`, добавь в `tasks` в `/api/search`, и в `frontend/src/App.jsx` в `sources`.

Подробно с примерами → смотри `API_SETUP.md`.

## GitHub

Коротко:
```bash
cd /home/user/booru-aggregator
git init
git add .
git commit -m "feat: 1.1 electron + 238 tags + bulk zip"
git branch -M main
git remote add origin https://github.com/ТВОЙ_НИК/booru-aggregator.git
git push -u origin main
```
Токен: GitHub → Settings → Developer settings → PAT (classic) → `repo` → скопируй `ghp_...` → введи как пароль при push.

Полная инструкция → `GITHUB_SETUP.md`

## Структура
```
backend/server.js      — Express, дедупликация, перевод, /api/zip, /api/image-proxy
frontend/src/App.jsx   — React, Masonry, перевод, bulk ZIP (JSZip fallback)
data/tags-db.json      — 238 тегов (139 NSFW) с count
data/synonyms.json     — RU→EN фразы+слова для всей базы
electron/main.js       — Electron main
```
