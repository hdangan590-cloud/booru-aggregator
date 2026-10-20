# Как скинуть репозиторий на GitHub — 2 минуты

## Вариант 1: Через браузер (самый простой)
1. Зайди на https://github.com/new
2. Введи имя репо: `booru-aggregator` (или любое), **не** ставь галочку "Add README", нажми **Create repository**
3. Скопируй ссылку — будет вида `https://github.com/ТВОЙ_НИК/booru-aggregator.git`
4. Пришли мне эту ссылку сюда — я смогу сделать `git push` напрямую если дашь доступ (Settings → Collaborators → Invite)

## Вариант 2: Залить из этой среды (я уже всё подготовил)

В терминале этой среды выполни (замени `ТВОЙ_НИК`):

```bash
cd /home/user/booru-aggregator
git init
git add .
git commit -m "feat: booru aggregator 238 tags + 18+ base + bulk ZIP + electron"
git branch -M main
git remote add origin https://github.com/ТВОЙ_НИК/booru-aggregator.git
git push -u origin main
```

Если GitHub попросит логин — используй **Personal Access Token**:
1. GitHub → Settings (аватар) → Developer settings → Personal access tokens → Tokens (classic) → Generate new token
2. Выбери `repo` scope, создай, скопируй токен `ghp_...`
3. При `git push` введи логин = твой ник, пароль = токен

## Что дальше
- После пуша я смогу клонировать и пушить обновления если добавишь меня в Collaborators
- Чтобы дать мне доступ: зайди в свой репо → Settings → Collaborators and teams → Add people → введи мой ник (если работаем через Arena — просто скажи "дай доступ", я подскажу как)

## Проверка
После пуша открой https://github.com/ТВОЙ_НИК/booru-aggregator — там должны быть папки `backend`, `frontend`, `electron`, `data`
