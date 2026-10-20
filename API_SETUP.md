# Как подключить API/URL — подробно

Приложение работает через **бэкенд-прокси** — фронтенд никогда не ходит напрямую на борды (иначе CORS). Бэкенд (`backend/server.js`) делает запросы к API борд.

## 1. Где лежат URL

Открой `backend/server.js` — функции:
```js
fetchRule34()  -> https://api.rule34.xxx/index.php?page=dapi&...
fetchGelbooru() -> https://gelbooru.com/index.php?page=dapi&...
fetchDanbooru() -> https://danbooru.donmai.us/posts.json?...
```
Можешь добавить свою борду: скопируй одну из функций, поменяй URL и парсинг ответа, добавь вызов в `app.get("/api/search")` в массив `tasks`.

## 2. Как подключить ключи (обязательно для Rule34/Gelbooru с 2024)

**Почему демо?** Rule34.xxx и Gelbooru теперь отвечают `Missing authentication` без ключа — поэтому сейчас показывается `picsum` заглушки. С ключом бэкенд вернёт реальные фото.

**Шаги:**

1. Зарегистрируйся:
   - Rule34.xxx: https://rule34.xxx/index.php?page=account&s=register
   - Gelbooru: https://gelbooru.com/index.php?page=account&s=register

2. Получи API данные:
   - Rule34: войди → https://rule34.xxx/index.php?page=account → увидишь `User ID` и `API Key`
   - Gelbooru: войди → https://gelbooru.com/index.php?page=account&s=options → внизу `API Access` → скопируй `User ID` и `API Key`

3. Создай файл `backend/.env` (скопируй из `.env.example`):
```bash
cd backend
cp .env.example .env
nano .env   # вставь ключи
```

Пример `.env`:
```
RULE34_API_KEY=abc123...
RULE34_USER_ID=123456
GELBOORU_API_KEY=def456...
GELBOORU_USER_ID=654321
```

4. Перезапусти бэкенд:
```bash
npm start
# или в Electron — он сам подхватит .env при старте
```

Проверь: `curl "http://localhost:3001/api/search?tags=1girl&sources=rule34"` — должен вернуть не `demo`, а реальные `file_url` с `rule34.xxx`.

## 3. Как добавить свой сайт (любую Booru-совместимую)

1. Найди API документацию сайта — обычно это `.../index.php?page=dapi&s=post&q=index&json=1`
2. В `server.js` добавь:
```js
async function fetchMySite(tags, pid=0){
  const url = `https://my.site/api/posts?tags=${encodeURIComponent(tags)}`;
  const r = await fetch(url);
  const data = await r.json();
  return data.map(p=>({
    id: `mys_${p.id}`,
    source: "my.site",
    file_url: p.file_url,
    preview_url: p.preview_url,
    width: p.width, height: p.height,
    md5: p.md5,
    tags: p.tags.split(" "),
    source_url: `https://my.site/post/${p.id}`,
    pixels: p.width*p.height
  }))
}
```
3. В `/api/search` добавь в `tasks`:
```js
if(sources.includes("my.site")) tasks.push(fetchMySite(fullTags, pidNum));
```
4. В `frontend/src/App.jsx` добавь в `sources` state:
```js
{ 'my.site': true }
```

## 4. Проверка
- `http://localhost:3001/health` → покажет `tags:238`
- `http://localhost:3001/api/tags?q=breasts` → вернёт все теги с подстрокой
- Фронт автоматически проксирует `/api` → `localhost:3001` (см. `frontend/vite.config.js`)

## 5. Безопасность
- `.env` никогда не коммить в GitHub (он в `.gitignore`)
- Ключи хранятся только локально, не уходят в фронт
