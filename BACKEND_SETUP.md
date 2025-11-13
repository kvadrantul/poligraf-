# Настройка Backend для интеграции с v0.dev API

## Вариант 1: Vercel (Рекомендуется)

### Шаг 1: Подготовка

1. Убедитесь, что у вас есть аккаунт на [Vercel](https://vercel.com)
2. Получите API ключ v0.dev:
   - Войдите на [v0.dev](https://v0.dev)
   - Перейдите в настройки: `https://v0.dev/chat/settings/keys`
   - Создайте новый API ключ

### Шаг 2: Деплой на Vercel

1. Установите Vercel CLI (если еще не установлен):
   ```bash
   npm i -g vercel
   ```

2. Войдите в Vercel:
   ```bash
   vercel login
   ```

3. Задеплойте проект:
   ```bash
   cd poligraf-
   vercel
   ```

4. Добавьте переменную окружения:
   - Перейдите на [Vercel Dashboard](https://vercel.com/dashboard)
   - Выберите ваш проект
   - Settings → Environment Variables
   - Добавьте:
     - **Name**: `V0_API_KEY`
     - **Value**: ваш API ключ от v0.dev
   - Нажмите "Save"

5. Обновите `app.js`:
   - Замените `API_ENDPOINT` на URL вашего Vercel проекта:
   ```javascript
   const API_ENDPOINT = 'https://your-project.vercel.app/api/generate';
   ```

### Шаг 3: Обновите GitHub Pages

После настройки backend, обновите файлы в репозитории и они автоматически обновятся на GitHub Pages.

---

## Вариант 2: Netlify Functions

Если предпочитаете Netlify:

1. Создайте файл `netlify/functions/generate.js` (аналогично `api/generate.js`)
2. Добавьте переменную окружения `V0_API_KEY` в настройках Netlify
3. Обновите `API_ENDPOINT` в `app.js`

---

## Вариант 3: Локальный тест (для разработки)

Можно использовать локальный сервер с CORS proxy или напрямую тестировать через Postman/curl.

---

## Проверка работы

После настройки backend:

1. Откройте Mini App в Telegram
2. Введите промпт (например: "Создай кнопку с текстом Привет")
3. Нажмите "Отправить"
4. Результат должен отобразиться в поле результатов

---

## Важно

⚠️ **НИКОГДА не добавляйте API ключ в клиентский код!**
- API ключ должен быть только в переменных окружения на сервере
- Клиентский код (`app.js`) отправляет запросы только на ваш backend
- Backend использует API ключ для запросов к v0.dev

