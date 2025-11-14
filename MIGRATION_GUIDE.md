# Руководство по миграции на других провайдеров

## 📊 Текущая ситуация

Ваш код написан в формате **Vercel Serverless Functions**:
```javascript
export default async function handler(req, res) {
  // req - стандартный Node.js request
  // res - стандартный Node.js response
}
```

## ✅ Хорошие новости

**Ваш код почти полностью портируемый!** Он использует только стандартные Node.js API:
- ✅ `req.method`, `req.body`, `req.query` - стандартные
- ✅ `res.status()`, `res.json()`, `res.setHeader()` - стандартные
- ✅ `process.env` - стандартные переменные окружения
- ✅ `fetch()` - стандартный (Node 18+)
- ✅ Нет Vercel-специфичных API

## 🔄 Варианты миграции

### 1. Netlify Functions (самый простой)

**Формат идентичен Vercel!** Просто переименуйте папку:

```
Vercel:  /api/generate.js
Netlify: /netlify/functions/generate.js
```

**Что нужно:**
- Создать `netlify.toml` вместо `vercel.json`
- Переместить файлы из `/api` в `/netlify/functions`
- Код менять НЕ нужно!

**netlify.toml:**
```toml
[build]
  functions = "netlify/functions"

[[redirects]]
  from = "/api/*"
  to = "/.netlify/functions/:splat"
  status = 200
```

---

### 2. AWS Lambda (через API Gateway)

**Нужна небольшая обертка:**

**lambda/generate.js:**
```javascript
// Обертка для AWS Lambda
exports.handler = async (event) => {
  // Преобразуем Lambda event в req/res формат
  const req = {
    method: event.httpMethod,
    body: event.body ? JSON.parse(event.body) : {},
    query: event.queryStringParameters || {},
    headers: event.headers || {}
  };
  
  const res = {
    statusCode: 200,
    headers: {},
    body: '',
    status: (code) => {
      res.statusCode = code;
      return res;
    },
    json: (data) => {
      res.body = JSON.stringify(data);
      return res;
    },
    setHeader: (key, value) => {
      res.headers[key] = value;
    }
  };
  
  // Импортируем вашу функцию
  const handler = (await import('../api/generate.js')).default;
  await handler(req, res);
  
  return {
    statusCode: res.statusCode,
    headers: res.headers,
    body: res.body
  };
};
```

---

### 3. Cloudflare Workers

**Нужна адаптация (другой runtime):**

```javascript
// workers/generate.js
export default {
  async fetch(request) {
    // Преобразуем Cloudflare Request в req/res
    const url = new URL(request.url);
    const body = await request.json();
    
    const req = {
      method: request.method,
      body: body,
      query: Object.fromEntries(url.searchParams)
    };
    
    const res = {
      statusCode: 200,
      headers: {},
      body: '',
      status: (code) => {
        res.statusCode = code;
        return res;
      },
      json: (data) => {
        res.body = JSON.stringify(data);
        return res;
      },
      setHeader: (key, value) => {
        res.headers[key] = value;
      }
    };
    
    // Импортируем вашу функцию
    const handler = await import('../api/generate.js');
    await handler.default(req, res);
    
    return new Response(res.body, {
      status: res.statusCode,
      headers: res.headers
    });
  }
};
```

---

### 4. Railway / Render / Fly.io (Express/Fastify сервер)

**Создайте обычный Node.js сервер:**

**server.js:**
```javascript
import express from 'express';
import generateHandler from './api/generate.js';
import createProjectHandler from './api/v0/create-project.js';
// ... другие handlers

const app = express();
app.use(express.json());

// Адаптер для Vercel формата
function adaptHandler(handler) {
  return async (req, res) => {
    // Express req/res уже совместимы!
    await handler(req, res);
  };
}

app.post('/api/generate', adaptHandler(generateHandler));
app.post('/api/v0/create-project', adaptHandler(createProjectHandler));
// ... другие routes

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

**package.json:**
```json
{
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
  "dependencies": {
    "express": "^4.18.0"
  }
}
```

---

### 5. Docker + любой хостинг

**Dockerfile:**
```dockerfile
FROM node:18-alpine

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Используйте Express сервер (вариант 4)
CMD ["node", "server.js"]
```

Затем деплойте на:
- Railway
- Render
- Fly.io
- DigitalOcean App Platform
- Heroku
- И любой другой Docker-хостинг

---

## 🎯 Рекомендация: Абстракция

Чтобы сделать код полностью независимым от провайдера, создайте адаптер:

**adapters/serverless.js:**
```javascript
// Универсальный адаптер для Serverless Functions
export function createHandler(handler) {
  return async (event, context) => {
    // Определяем провайдера
    const provider = detectProvider(event);
    
    // Преобразуем event в req/res формат
    const { req, res } = adaptRequest(provider, event);
    
    // Вызываем ваш handler
    await handler(req, res);
    
    // Преобразуем res обратно в формат провайдера
    return adaptResponse(provider, res);
  };
}

function detectProvider(event) {
  if (event.httpMethod) return 'aws'; // AWS Lambda
  if (event.request) return 'cloudflare'; // Cloudflare
  return 'vercel'; // Vercel/Netlify
}

function adaptRequest(provider, event) {
  // Преобразование зависит от провайдера
  // ...
}

function adaptResponse(provider, res) {
  // Преобразование зависит от провайдера
  // ...
}
```

---

## 📋 Чеклист миграции

### Для Netlify:
- [ ] Переместить `/api` → `/netlify/functions`
- [ ] Создать `netlify.toml`
- [ ] Обновить переменные окружения в Netlify Dashboard
- [ ] Код менять НЕ нужно!

### Для AWS Lambda:
- [ ] Создать обертки для каждого handler
- [ ] Настроить API Gateway
- [ ] Обновить переменные окружения в Lambda
- [ ] Обновить `API_BASE` в frontend

### Для Express сервера:
- [ ] Создать `server.js` с Express
- [ ] Добавить `express` в `package.json`
- [ ] Обновить `API_BASE` в frontend
- [ ] Деплойте на Railway/Render/etc

### Для Docker:
- [ ] Создать `Dockerfile`
- [ ] Создать `server.js` (Express)
- [ ] Создать `.dockerignore`
- [ ] Деплойте на любой Docker-хостинг

---

## 🔍 Что нужно изменить в коде

**Минимум изменений:**
- Только обертка/адаптер для формата провайдера
- Обновление `API_BASE` в `app.js`
- Обновление переменных окружения

**Логика функций НЕ меняется!**

---

## 💡 Рекомендация

**Самый простой вариант для портируемости:**

1. Создайте Express сервер (`server.js`)
2. Используйте его для локальной разработки
3. Деплойте на любой хостинг (Railway, Render, Fly.io)
4. Или используйте Docker для максимальной портируемости

**Преимущества:**
- ✅ Работает везде
- ✅ Легко тестировать локально
- ✅ Нет vendor lock-in
- ✅ Можно деплоить на любой хостинг

Хотите, чтобы я создал Express сервер для вашего проекта?

