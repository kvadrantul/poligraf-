# Сценарий работы приложения Poligraf

## 🚀 Запуск приложения (Startup)

### 1. Инициализация
```
1. Инициализация Telegram Web App API
2. Получение userId:
   - Если есть Telegram User ID → `tg_{telegramUserId}`
   - Если нет Telegram → создается `test_{timestamp}_{random}` или берется из localStorage
   - userId сохраняется в localStorage как `poligraf-user-id`
3. Загрузка проекта при старте (loadProjectOnStartup)
```

### 2. Загрузка проекта при старте
```
┌─────────────────────────────────────────────────┐
│ loadProjectOnStartup()                          │
├─────────────────────────────────────────────────┤
│ 1. Проверка localStorage: `v0-project-${userId}`│
│    ├─ НЕТ → Показываем пустой экран             │
│    └─ ЕСТЬ → Продолжаем                         │
│                                                 │
│ 2. Парсинг projectData: { projectId, chatId }  │
│    ├─ Ошибка парсинга → Пустой экран            │
│    └─ Успешно → Продолжаем                      │
│                                                 │
│ 3. GET /api/v0/get-project-content              │
│    ├─ Получение сообщений из чата               │
│    ├─ Поиск последнего кода:                   │
│    │  ├─ Сначала ищем в сообщениях assistant    │
│    │  └─ Если нет → ищем в сообщениях user     │
│    │     (код в markdown блоках или как текст)  │
│    └─ Возврат: { code, hasContent, messagesCount }│
│                                                 │
│ 4. Если hasContent && code.length > 0:          │
│    ├─ displayResult(code) - отображение         │
│    └─ saveToHistory(code) - сохранение в историю│
│    Иначе: Пустой экран                          │
└─────────────────────────────────────────────────┘
```

---

## 📝 Пользователь отправляет запрос

### Сценарий A: Новая генерация (не итерация)

```
┌─────────────────────────────────────────────────┐
│ Пользователь вводит промпт и нажимает "Отправить"│
├─────────────────────────────────────────────────┤
│ 1. sendToV0(prompt)                             │
│    ├─ Показ индикатора загрузки (spinner)       │
│    ├─ loadHistory() - проверка истории          │
│    └─ Проверка: isIteration?                    │
│       ├─ НЕТ → Сценарий A (новая генерация)     │
│       └─ ДА → Сценарий B (итерация)             │
│                                                 │
│ 2. Определение типа запроса:                    │
│    isIteration = history.length > 0 &&         │
│    (prompt содержит: "измени", "прав", "добавь",│
│     "убери", "сделай", "переделай", "change",   │
│     "modify", "update", "fix", "edit")          │
│                                                 │
│ 3. НОВАЯ ГЕНЕРАЦИЯ:                             │
│    └─ POST /api/generate (Model API)           │
│       ├─ Backend: v0.dev Model API              │
│       │  ├─ System message: инструкции для AI  │
│       │  ├─ User message: промпт (улучшенный)  │
│       │  └─ model: 'v0-1.5-md'                 │
│       ├─ Ответ: { result, code, provider }      │
│       └─ extractCodeFromResponse() - извлечение│
│          кода из ответа (убирает thinking)      │
│                                                 │
│ 4. displayResult(generatedCode)                 │
│    ├─ Определение типа: React код?              │
│    ├─ Если React код:                           │
│    │  └─ renderReactComponent() в iframe        │
│    │     ├─ Создание iframe                     │
│     │     ├─ Загрузка React, ReactDOM, Babel   │
│     │     ├─ Трансформация JSX через Babel      │
│     │     ├─ Рендеринг компонента              │
│     │     └─ Автоподстройка высоты iframe      │
│    └─ Иначе: обычный текст                      │
│                                                 │
│ 5. Сохранение в проект (асинхронно):             │
│    ┌─────────────────────────────────────────┐  │
│    │ Асинхронная функция (не блокирует UI)  │  │
│    ├─────────────────────────────────────────┤  │
│    │ 1. Проверка localStorage:               │  │
│    │    `v0-project-${userId}`                │  │
│    │    ├─ ЕСТЬ → используем projectId, chatId│
│    │    └─ НЕТ → создаем проект:              │
│    │       POST /api/v0/create-project        │
│    │       ├─ Backend: v0 Platform API        │
│    │       │  ├─ POST /v1/projects            │
│    │       │  └─ POST /v1/chats               │
│    │       └─ Сохранение в localStorage       │
│    │                                          │
│    │ 2. Сохранение кода в проект:              │
│    │    POST /api/v0/save-to-project         │
│    │    ├─ Backend: v0 Platform API          │
│    │    │  └─ POST /v1/chats/{chatId}/messages│
│    │    │     └─ message: "```tsx\n{code}\n```"│
│    │    └─ Код сохраняется как сообщение user │
│    │                                          │
│    │ 3. saveToHistory(code) - localStorage     │
│    │    └─ `poligraf-history` - массив кодов   │
│    └─────────────────────────────────────────┘  │
│                                                 │
│ 6. Виброотклик успеха                           │
└─────────────────────────────────────────────────┘
```

### Сценарий B: Итерация (правка существующего компонента)

```
┌─────────────────────────────────────────────────┐
│ Пользователь вводит промпт с правкой             │
│ (содержит: "измени", "прав", "добавь", и т.д.)  │
├─────────────────────────────────────────────────┤
│ 1. sendToV0(prompt)                             │
│    ├─ Показ индикатора загрузки                 │
│    ├─ loadHistory() - проверка истории         │
│    └─ isIteration = true                        │
│                                                 │
│ 2. ИТЕРАЦИЯ:                                    │
│    ┌─────────────────────────────────────────┐  │
│    │ Попытка использовать Platform API       │  │
│    ├─────────────────────────────────────────┤  │
│    │ 1. Получение проекта из localStorage:    │  │
│    │    `v0-project-${userId}`                │  │
│    │    ├─ ЕСТЬ → используем                 │  │
│    │    └─ НЕТ → создаем проект              │  │
│    │                                          │  │
│    │ 2. POST /api/v0/iterate                  │  │
│    │    ├─ Backend: v0 Platform API          │  │
│    │    │  ├─ POST /v1/chats/{chatId}/messages│
│    │    │  │  └─ message: prompt             │  │
│    │    │  └─ Polling (до 30 попыток, 1 сек):│
│    │    │     └─ GET /v1/chats/{chatId}/messages│
│    │    │       └─ Ожидание ответа assistant │
│    │    └─ Возврат: { result, code }          │  │
│    └─────────────────────────────────────────┘  │
│                                                 │
│ 3. Если Platform API не сработал:              │
│    ┌─────────────────────────────────────────┐  │
│    │ Fallback на Model API с контекстом       │  │
│    ├─────────────────────────────────────────┤  │
│    │ 1. Получение последнего кода из истории │  │
│    │ 2. Создание enhancedPrompt:              │  │
│    │    "Update this React component:         │  │
│    │     ```tsx                               │  │
│    │     {lastCode}                           │  │
│    │     ```                                   │  │
│    │     User request: {prompt}               │  │
│    │     Please update..."                    │  │
│    │ 3. POST /api/generate (Model API)       │  │
│    └─────────────────────────────────────────┘  │
│                                                 │
│ 4. displayResult(generatedCode)                 │
│    └─ Аналогично Сценарию A                    │
│                                                 │
│ 5. Сохранение в проект (асинхронно):            │
│    └─ Аналогично Сценарию A                    │
│    └─ НО: если использовался Platform API,     │
│       код уже сохранен в проекте автоматически │
│                                                 │
│ 6. Виброотклик успеха                           │
└─────────────────────────────────────────────────┘
```

---

## 🔄 Последовательность запросов (Sequence Diagram)

### Новая генерация:
```
User → Frontend → POST /api/generate (Model API)
                ↓
              Backend → v0.dev Model API
                ↓
              Response: { result, code }
                ↓
              Frontend → displayResult()
                ↓
              Frontend → (async) POST /api/v0/create-project (если нет)
                ↓
              Frontend → (async) POST /api/v0/save-to-project
```

### Итерация:
```
User → Frontend → POST /api/v0/iterate (Platform API)
                ↓
              Backend → v0.dev Platform API
                ↓
              Backend → Polling (до 30 попыток)
                ↓
              Response: { result, code }
                ↓
              Frontend → displayResult()
```

---

## 💾 Хранение данных

### localStorage:
```
poligraf-user-id: "tg_123456" или "test_..."
v0-project-{userId}: { projectId: "...", chatId: "..." }
poligraf-history: [{ id, code, timestamp }, ...]
v0-projects-count: "1"
```

### v0.dev Platform API:
```
Проект: { id: projectId, name: "Poligraf Project - User {userId}" }
Чат: { id: chatId, projectId: projectId }
Сообщения: [
  { role: "user", content: "```tsx\n{code}\n```" },
  { role: "assistant", content: "{generatedCode}" }
]
```

---

## 🎯 Ключевые моменты

1. **Два API для генерации:**
   - **Model API** (`/api/generate`) - быстрый, для новых генераций
   - **Platform API** (`/api/v0/iterate`) - медленный, но сохраняет в проект

2. **Определение итерации:**
   - Проверка истории (есть ли предыдущий код)
   - Проверка ключевых слов в промпте

3. **Сохранение:**
   - Код сохраняется в проект асинхронно (не блокирует UI)
   - Сохранение происходит после отображения результата
   - Код сохраняется как сообщение пользователя в markdown блоке

4. **Загрузка при старте:**
   - Проверка localStorage на наличие проекта
   - Загрузка последнего кода из чата
   - Поиск кода в сообщениях assistant или user

5. **Рендеринг:**
   - React компоненты рендерятся в изолированном iframe
   - Используется Babel Standalone для трансформации JSX
   - Tailwind CSS доступен в iframe

---

## ⚠️ Обработка ошибок

1. **Platform API не работает:**
   - Fallback на Model API с контекстом предыдущего кода

2. **Проект не найден:**
   - Создание нового проекта автоматически

3. **Ошибка сохранения:**
   - Не критично - код уже отображен
   - Логирование предупреждения

4. **Таймаут:**
   - Model API: 55 секунд
   - Platform API: 280 секунд
   - Polling: до 30 попыток по 1 секунде

