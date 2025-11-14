# Быстрый старт Go Backend

## 🚀 Запуск

### 1. Установка зависимостей

```bash
cd backend
go mod download
```

### 2. Настройка .env

```bash
cp .env.example .env
# Отредактируйте .env и добавьте V0_API_KEY
```

### 3. Запуск

```bash
go run main.go
```

Сервер запустится на `http://localhost:8080`

## 🔗 Интеграция с Frontend

### Вариант 1: Временно изменить app.js

В `app.js` замените:
```javascript
const API_BASE = 'https://poligraf-black.vercel.app';
```

На:
```javascript
const API_BASE = 'http://localhost:8080';
```

### Вариант 2: Использовать app.local.js

В `index.html` замените:
```html
<script src="app.js"></script>
```

На:
```html
<script src="app.local.js"></script>
```

## ✅ Проверка

1. Backend запущен на `http://localhost:8080`
2. Frontend запущен на `http://localhost:8000`
3. Откройте `http://localhost:8000` в браузере
4. Отправьте тестовый запрос

## 📝 Логи

Логи backend видны в терминале, где запущен `go run main.go`
