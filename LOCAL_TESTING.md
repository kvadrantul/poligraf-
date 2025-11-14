# Локальное тестирование

## Вариант 1: Vercel CLI (Рекомендуется для полного тестирования)

Этот вариант позволяет тестировать и frontend, и backend API локально.

### Шаг 1: Установка Vercel CLI

```bash
npm i -g vercel
```

### Шаг 2: Вход в Vercel

```bash
vercel login
```

### Шаг 3: Создание файла `.env.local`

Создайте файл `.env.local` в корне проекта:

```bash
V0_API_KEY=ваш_ключ_v0_dev
```

⚠️ **Важно**: Добавьте `.env.local` в `.gitignore`, чтобы не коммитить ключи!

### Шаг 4: Запуск локального сервера

```bash
cd poligraf-
vercel dev
```

Сервер запустится на `http://localhost:3000`

### Шаг 5: Обновление app.js для локального тестирования

Временно измените в `app.js`:

```javascript
// Для локального тестирования
const API_BASE = 'http://localhost:3000';
const API_GENERATE = `${API_BASE}/api/generate`;
```

### Шаг 6: Открытие в браузере

Откройте: `http://localhost:3000`

⚠️ **Ограничение**: Telegram Mini App требует HTTPS, поэтому в Telegram не откроется. Но можно тестировать UI и функциональность в браузере.

---

## Вариант 2: Простой HTTP сервер (только для UI тестирования)

Для быстрого тестирования UI без backend:

### Python 3:

```bash
cd poligraf-
python3 -m http.server 8000
```

Откройте: `http://localhost:8000`

### Node.js (http-server):

```bash
npm i -g http-server
cd poligraf-
http-server -p 8000
```

Откройте: `http://localhost:8000`

⚠️ **Ограничение**: Backend API не будет работать, только UI.

---

## Вариант 3: ngrok для тестирования в Telegram

Если нужно протестировать именно в Telegram Mini App:

### Шаг 1: Установка ngrok

```bash
# macOS
brew install ngrok

# Или скачайте с https://ngrok.com/download
```

### Шаг 2: Запуск локального сервера

```bash
# Вариант A: Vercel CLI
vercel dev

# Вариант B: Простой HTTP сервер
python3 -m http.server 8000
```

### Шаг 3: Создание туннеля

```bash
# Если используете Vercel (порт 3000)
ngrok http 3000

# Если используете Python (порт 8000)
ngrok http 8000
```

### Шаг 4: Использование HTTPS URL

ngrok даст вам URL вида: `https://xxxx-xx-xx-xx-xx.ngrok-free.app`

Используйте этот URL в настройках Telegram бота через @BotFather.

⚠️ **Важно**: 
- Бесплатный ngrok меняет URL при каждом перезапуске
- Для стабильного URL нужен платный план ngrok

---

## Вариант 4: Использование GitHub Pages (уже задеплоено)

Самый простой вариант - использовать уже задеплоенный сайт:

**URL**: `https://kvadrantul.github.io/poligraf-/`

Этот URL уже работает и можно использовать для тестирования в Telegram.

---

## Быстрый старт (рекомендуется)

1. **Для быстрого тестирования UI**: используйте GitHub Pages
   ```
   https://kvadrantul.github.io/poligraf-/
   ```

2. **Для полного локального тестирования**: используйте Vercel CLI
   ```bash
   vercel dev
   ```
   Затем откройте `http://localhost:3000`

3. **Для тестирования в Telegram**: используйте ngrok с Vercel CLI
   ```bash
   vercel dev
   # В другом терминале:
   ngrok http 3000
   ```

---

## Переменные окружения для локального тестирования

Создайте `.env.local`:

```bash
V0_API_KEY=ваш_ключ_v0_dev
LOVABLE_API_KEY=ваш_ключ_lovable  # опционально
OPENAI_API_KEY=ваш_ключ_openai   # опционально, для fallback
```

⚠️ **Не коммитьте `.env.local` в git!**



