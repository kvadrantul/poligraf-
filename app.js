// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;

// Инициализируем приложение
tg.ready();
tg.expand();

// Получаем элементы DOM
const resultContent = document.getElementById('resultContent');
const commentInput = document.getElementById('commentInput');
const sendButton = document.getElementById('sendButton');

// Конфигурация API (будет использоваться backend endpoint для безопасности)
// Backend развернут на Vercel
const API_BASE = 'https://poligraf-black.vercel.app';
const API_GENERATE = `${API_BASE}/api/generate`; // Model API - быстрая генерация
const API_CREATE_PROJECT = `${API_BASE}/api/v0/create-project`; // Platform API - создание проекта
const API_ITERATE = `${API_BASE}/api/v0/iterate`; // Platform API - итерация (медленно)
const API_SAVE_TO_PROJECT = `${API_BASE}/api/v0/save-to-project`; // Platform API - сохранение результата
const API_GET_PROJECT_CONTENT = `${API_BASE}/api/v0/get-project-content`; // Platform API - получение контента проекта

// Получаем Telegram User ID
const userId = tg.initDataUnsafe?.user?.id || `user_${Date.now()}`;

// Максимальное количество проектов (лимит для защиты)
// Согласно документации v0.dev: 100 проектов на аккаунт
// Устанавливаем меньший лимит для безопасности
const MAX_PROJECTS = 50;

// История результатов (для отображения всех результатов в одном проекте)
let resultsHistory = [];

// Функция для сохранения результата в localStorage
function saveToHistory(code) {
    try {
        const history = JSON.parse(localStorage.getItem('poligraf-history') || '[]');
        const historyItem = {
            id: Date.now(),
            code: code,
            timestamp: new Date().toISOString()
        };
        history.unshift(historyItem); // Добавляем в начало
        // Ограничиваем историю 50 последними элементами
        if (history.length > 50) {
            history = history.slice(0, 50);
        }
        localStorage.setItem('poligraf-history', JSON.stringify(history));
    } catch (error) {
        console.error('Ошибка сохранения истории:', error);
    }
}

// Функция для загрузки истории из localStorage
function loadHistory() {
    try {
        const history = JSON.parse(localStorage.getItem('poligraf-history') || '[]');
        return history;
    } catch (error) {
        console.error('Ошибка загрузки истории:', error);
        return [];
    }
}

// Функция для получения или создания проекта
async function getOrCreateProject() {
    try {
        // Проверяем localStorage
        const stored = localStorage.getItem(`v0-project-${userId}`);
        if (stored) {
            const { projectId, chatId } = JSON.parse(stored);
            if (projectId && chatId) {
                console.log('Using existing project:', projectId);
                return { projectId, chatId };
            }
        }

        // Проверяем количество созданных проектов
        const projectsCount = parseInt(localStorage.getItem('v0-projects-count') || '0');
        if (projectsCount >= MAX_PROJECTS) {
            throw new Error(`Достигнут лимит проектов (${MAX_PROJECTS}). Пожалуйста, используйте существующий проект или очистите localStorage.`);
        }

        // Создаем новый проект
        console.log('Creating new project for user:', userId);
        const response = await fetch(API_CREATE_PROJECT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ userId }),
        });

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to create project');
        }

        const data = await response.json();
        const { projectId, chatId } = data;

        if (!projectId || !chatId) {
            throw new Error('Project or chat ID not received');
        }

        // Сохраняем в localStorage
        localStorage.setItem(`v0-project-${userId}`, JSON.stringify({ projectId, chatId }));
        localStorage.setItem('v0-projects-count', String(projectsCount + 1));

        console.log('Project created:', projectId);
        return { projectId, chatId };

    } catch (error) {
        console.error('Error getting/creating project:', error);
        throw error;
    }
}

// Функция для обработки импортов в коде
function processImports(code) {
    let processedCode = code;
    
    // Заменяем импорты React на использование window.React
    processedCode = processedCode.replace(
        /import\s+React\s+from\s+['"]react['"];?/g,
        '// React доступен через window.React'
    );
    processedCode = processedCode.replace(
        /import\s+\*\s+as\s+React\s+from\s+['"]react['"];?/g,
        '// React доступен через window.React'
    );
    
    // Заменяем импорты из lucide-react
    const lucideImports = processedCode.match(/import\s+{([^}]+)}\s+from\s+['"]lucide-react['"];?/);
    if (lucideImports) {
        const icons = lucideImports[1].split(',').map(i => i.trim());
        const lucideReplace = icons.map(icon => {
            return `const ${icon} = window.lucideReact && window.lucideReact.${icon} ? window.lucideReact.${icon} : () => React.createElement('svg', { width: 24, height: 24 }, React.createElement('path'));`;
        }).join('\n');
        
        processedCode = processedCode.replace(
            /import\s+{([^}]+)}\s+from\s+['"]lucide-react['"];?/,
            lucideReplace
        );
    }
    
    // Убираем другие импорты (можно расширить при необходимости)
    processedCode = processedCode.replace(
        /import\s+.*?from\s+['"][^'"]+['"];?/g,
        '// Импорт обработан'
    );
    
    return processedCode;
}

// Функция для рендеринга React компонента в iframe (изоляция от основного приложения)
function renderReactComponent(codeText, container) {
    try {
        // Очищаем контейнер
        container.innerHTML = '';

        // Создаем iframe для изоляции React компонента (растягиваем на всю область)
        const iframe = document.createElement('iframe');
        iframe.className = 'react-iframe';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.margin = '0';
        iframe.style.padding = '0';
        iframe.style.backgroundColor = 'transparent';
        container.appendChild(iframe);

        // Ждем загрузки iframe
        iframe.onload = () => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                
                // Извлекаем только код компонента (убираем file= и другие метаданные)
                let cleanCode = codeText;
                cleanCode = cleanCode.replace(/^file="[^"]*"\s*\n?/gm, '');
                
                // Обрабатываем импорты
                cleanCode = processImports(cleanCode);
                
                // Если код содержит export default, оставляем как есть
                if (!cleanCode.includes('export default') && !cleanCode.includes('export')) {
                    const functionMatch = cleanCode.match(/(function\s+\w+|const\s+\w+\s*=\s*\(|const\s+\w+\s*=\s*function)/);
                    if (functionMatch) {
                        cleanCode = cleanCode + '\n\nexport default ' + (cleanCode.match(/function\s+(\w+)/)?.[1] || 'Component');
                    }
                }

                // Обрабатываем lucide-react импорты для iframe
                let iframeCode = cleanCode;
                const lucideImports = iframeCode.match(/import\s+{([^}]+)}\s+from\s+['"]lucide-react['"];?/);
                if (lucideImports) {
                    const icons = lucideImports[1].split(',').map(i => i.trim());
                    const lucideVars = icons.map(icon => `const ${icon} = window.lucideReact?.${icon} || (() => React.createElement('svg', { width: 24, height: 24 }));`).join('\n');
                    iframeCode = iframeCode.replace(
                        /import\s+{([^}]+)}\s+from\s+['"]lucide-react['"];?/,
                        lucideVars
                    );
                }
                
                // Убираем все остальные импорты
                iframeCode = iframeCode.replace(/import\s+.*?from\s+['"][^'"]+['"];?/g, '');
                
                // Извлекаем имя компонента из export default
                let componentName = 'Component';
                const exportMatch = iframeCode.match(/export\s+default\s+function\s+(\w+)/);
                if (exportMatch) {
                    componentName = exportMatch[1];
                }
                
                // Заменяем export default на обычное объявление
                iframeCode = iframeCode.replace(/export\s+default\s+/, '');

                // Создаем HTML страницу для iframe с React и Tailwind CSS
                const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <!-- Tailwind CSS для стилей компонентов -->
    <script src="https://cdn.tailwindcss.com"></script>
    <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
    <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
    <script src="https://unpkg.com/lucide-react@latest/dist/umd/lucide-react.js"></script>
    <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
    <style>
        * { box-sizing: border-box; }
        html, body { 
            margin: 0; 
            padding: 0; 
            width: 100%;
            height: 100%;
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; 
        }
        #root {
            width: 100%;
            min-height: 100%;
        }
    </style>
</head>
<body>
    <div id="root"></div>
    <script type="text/babel">
        const React = window.React;
        const ReactDOM = window.ReactDOM;
        
        ${iframeCode}
        
        const Component = ${componentName};
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(Component));
    </script>
</body>
</html>
                `;

                // Записываем HTML в iframe
                iframeDoc.open();
                iframeDoc.write(htmlContent);
                iframeDoc.close();
                
                // Автоматически подстраиваем высоту iframe под контент
                const adjustHeight = () => {
                    try {
                        const iframeBody = iframeDoc.body;
                        const iframeRoot = iframeDoc.getElementById('root');
                        if (iframeBody && iframeRoot) {
                            const height = Math.max(
                                iframeBody.scrollHeight,
                                iframeBody.offsetHeight,
                                iframeRoot.scrollHeight,
                                iframeRoot.offsetHeight
                            );
                            iframe.style.height = height + 'px';
                        }
                    } catch (e) {
                        // Игнорируем ошибки доступа к iframe
                    }
                };
                
                // Подстраиваем высоту после загрузки и периодически
                setTimeout(adjustHeight, 100);
                setTimeout(adjustHeight, 500);
                setTimeout(adjustHeight, 1000);
                
                // Наблюдаем за изменениями размера
                const observer = new MutationObserver(adjustHeight);
                if (iframeDoc.body) {
                    observer.observe(iframeDoc.body, {
                        childList: true,
                        subtree: true,
                        attributes: true
                    });
                }

            } catch (error) {
                console.error('Ошибка рендеринга в iframe:', error);
                container.innerHTML = `
                    <div class="error-message">
                        <strong>Ошибка рендеринга:</strong><br>
                        ${error.message}
                    </div>
                `;
            }
        };

        // Устанавливаем минимальную высоту и загружаем пустую страницу для инициализации
        iframe.src = 'about:blank';

        return true;
    } catch (error) {
        console.error('Ошибка создания iframe:', error);
        container.innerHTML = `
            <div class="error-message">
                <strong>Ошибка рендеринга:</strong><br>
                ${error.message}
            </div>
        `;
        return false;
    }
}

// Функция для отображения результата
function displayResult(result) {
    // Placeholder больше не нужен

    // Создаем элемент для нового результата
    const resultItem = document.createElement('div');
    resultItem.className = 'result-item';
    
    // Определяем, является ли результат кодом React компонента
    const codeText = typeof result === 'string' ? result : (result.code || result.markup || JSON.stringify(result, null, 2));
    const isReactCode = codeText.includes('import') || codeText.includes('export') || 
                        codeText.includes('function') || codeText.includes('className') || 
                        codeText.includes('return (') || codeText.includes('React') ||
                        codeText.includes('jsx') || codeText.includes('tsx');
    
    if (isReactCode) {
        // Создаем контейнер для рендеринга React компонента (без кнопок, только визуальный контент)
        const renderContainer = document.createElement('div');
        renderContainer.className = 'react-render-container';
        
        resultItem.appendChild(renderContainer);
        
        // Пытаемся отрендерить компонент
        renderReactComponent(codeText, renderContainer);
        
        // Сохраняем в историю localStorage
        saveToHistory(codeText);
    } else {
        // Обычный текст
        const textElement = document.createElement('div');
        textElement.className = 'result-text';
        textElement.textContent = codeText;
        resultItem.appendChild(textElement);
    }

    // Очищаем предыдущие результаты, показываем только последний
    resultContent.innerHTML = '';
    
    resultContent.appendChild(resultItem);
    resultsHistory.push(result);

    // Прокручиваем к последнему результату
    resultContent.scrollTop = resultContent.scrollHeight;
}

// Функция для отправки запроса к v0.dev Platform API (итерация)
async function sendToV0(prompt) {
    let loadingIndicator = null;

    try {
        // Показываем индикатор загрузки
        sendButton.disabled = true;
        sendButton.textContent = 'Генерация...';
        
        // Создаем красивый индикатор загрузки с анимацией
        loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        
        loadingIndicator.appendChild(spinner);
        
        resultContent.appendChild(loadingIndicator);
        resultContent.scrollTop = resultContent.scrollHeight;

        // Определяем, является ли запрос итерацией (правкой)
        // Для итераций используем Model API с контекстом предыдущего кода
        // Это быстрее чем Platform API и дает контекст для правок
        const history = loadHistory();
        const isIteration = history.length > 0 && (
            prompt.toLowerCase().includes('измени') ||
            prompt.toLowerCase().includes('прав') ||
            prompt.toLowerCase().includes('добавь') ||
            prompt.toLowerCase().includes('убери') ||
            prompt.toLowerCase().includes('сделай') ||
            prompt.toLowerCase().includes('переделай') ||
            prompt.toLowerCase().includes('change') ||
            prompt.toLowerCase().includes('modify') ||
            prompt.toLowerCase().includes('update') ||
            prompt.toLowerCase().includes('fix') ||
            prompt.toLowerCase().includes('edit')
        );
        
        let enhancedPrompt = prompt;
        
        // Если это итерация - добавляем контекст предыдущего кода
        if (isIteration && history.length > 0) {
            const lastCode = history[0].code; // Последний сгенерированный код
            if (lastCode && lastCode.length > 0) {
                console.log('Detected iteration, adding context from previous code');
                // Ограничиваем размер предыдущего кода (чтобы не превысить лимиты токенов)
                const maxCodeLength = 5000; // ~5000 символов
                const truncatedCode = lastCode.length > maxCodeLength 
                    ? lastCode.substring(0, maxCodeLength) + '\n// ... (code truncated)'
                    : lastCode;
                
                enhancedPrompt = `Here is the current code:\n\n\`\`\`tsx\n${truncatedCode}\n\`\`\`\n\nNow ${prompt}`;
            }
        }
        
        console.log('Using Model API for generation');
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 55000);

        const response = await fetch(API_GENERATE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ prompt: enhancedPrompt }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        // Убираем индикатор загрузки
        if (loadingIndicator) {
            loadingIndicator.remove();
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Ошибка: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const generatedCode = data.result || data.code || data.markup || data;
        
        // Отображаем результат
        displayResult(generatedCode);

        // Сохраняем в проект Platform API (асинхронно, не ждем)
        // Используем быструю генерацию Model API, но сохраняем в проект для истории
        // Автоматически создаем проект при первом использовании
        (async () => {
            try {
                let projectId, chatId;
                
                // Проверяем, есть ли уже проект
                const stored = localStorage.getItem(`v0-project-${userId}`);
                if (stored) {
                    const parsed = JSON.parse(stored);
                    projectId = parsed.projectId;
                    chatId = parsed.chatId;
                }
                
                // Если проекта нет - создаем
                if (!projectId || !chatId) {
                    console.log('Creating project for first-time user');
                    try {
                        const projectResponse = await fetch(API_CREATE_PROJECT, {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                            },
                            body: JSON.stringify({ userId }),
                        });
                        
                        if (projectResponse.ok) {
                            const projectData = await projectResponse.json();
                            projectId = projectData.projectId;
                            chatId = projectData.chatId;
                            
                            if (projectId && chatId) {
                                // Сохраняем в localStorage
                                localStorage.setItem(`v0-project-${userId}`, JSON.stringify({ projectId, chatId }));
                                const projectsCount = parseInt(localStorage.getItem('v0-projects-count') || '0');
                                localStorage.setItem('v0-projects-count', String(projectsCount + 1));
                                console.log('Project created and saved:', projectId);
                            }
                        } else {
                            console.warn('Failed to create project, skipping save');
                            return;
                        }
                    } catch (createError) {
                        console.warn('Error creating project, skipping save:', createError);
                        return;
                    }
                }
                
                // Сохраняем код в проект (в фоне, не ждем ответа)
                if (projectId && chatId) {
                    fetch(API_SAVE_TO_PROJECT, {
                        method: 'POST',
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: JSON.stringify({
                            projectId: projectId,
                            chatId: chatId,
                            code: typeof generatedCode === 'string' ? generatedCode : JSON.stringify(generatedCode)
                        }),
                    }).catch(err => {
                        console.warn('Failed to save to project (non-critical):', err);
                    });
                }
            } catch (saveError) {
                console.warn('Error saving to project (non-critical):', saveError);
            }
        })();

        // Вибро-отклик успеха
        tg.HapticFeedback.notificationOccurred('success');

    } catch (error) {
        console.error('Ошибка при отправке запроса:', error);
        
        // Убираем индикатор загрузки если есть
        if (loadingIndicator) {
            loadingIndicator.remove();
        }

        // Показываем ошибку
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
            errorElement.textContent = 'Время ожидания истекло. Генерация занимает слишком долго. Попробуйте более простой запрос.';
        } else {
            errorElement.textContent = `Ошибка: ${error.message}`;
        }
        
        resultContent.appendChild(errorElement);
        resultContent.scrollTop = resultContent.scrollHeight;

        // Вибро-отклик ошибки
        tg.HapticFeedback.notificationOccurred('error');
    } finally {
        // Восстанавливаем кнопку
        sendButton.disabled = false;
        sendButton.textContent = 'Отправить';
    }
}

// Обработчик отправки комментария
sendButton.addEventListener('click', async () => {
    const comment = commentInput.value.trim();
    
    if (comment) {
        // Отправляем промпт в v0.dev
        await sendToV0(comment);
        
        // Очищаем поле ввода
        commentInput.value = '';
    } else {
        // Показываем легкую вибрацию при пустом поле
        tg.HapticFeedback.impactOccurred('light');
    }
});

// Обработка Enter для отправки (Shift+Enter для новой строки)
commentInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendButton.click();
    }
});

// Функция для загрузки проекта при старте приложения
async function loadProjectOnStartup() {
    try {
        // Проверяем, есть ли сохраненный проект
        const stored = localStorage.getItem(`v0-project-${userId}`);
        if (!stored) {
            // Нет проекта - показываем приветственное сообщение
            resultContent.innerHTML = `
                <div style="padding: 20px; text-align: center; color: var(--tg-theme-hint-color, #999999);">
                    <p style="font-size: 16px; margin-bottom: 12px;">👋 Добро пожаловать!</p>
                    <p style="font-size: 14px;">Введите описание компонента, и я создам его для вас.</p>
                    <p style="font-size: 12px; margin-top: 12px; opacity: 0.8;">Например: "Создай красивую кнопку"</p>
                </div>
            `;
            return;
        }

        const { projectId, chatId } = JSON.parse(stored);
        if (!projectId || !chatId) {
            return;
        }

        // Загружаем контент проекта
        console.log('Loading project content on startup:', projectId);
        const response = await fetch(`${API_GET_PROJECT_CONTENT}?projectId=${projectId}&chatId=${chatId}`);
        
        if (response.ok) {
            const data = await response.json();
            if (data.hasContent && data.code && data.code.length > 0) {
                // Есть контент - отображаем его
                console.log('Project has content, displaying it');
                displayResult(data.code);
                
                // Сохраняем в историю для использования в итерациях
                saveToHistory(data.code);
            } else {
                // Нет контента - показываем приветствие
                resultContent.innerHTML = `
                    <div style="padding: 20px; text-align: center; color: var(--tg-theme-hint-color, #999999);">
                        <p style="font-size: 16px; margin-bottom: 12px;">👋 Ваш проект готов!</p>
                        <p style="font-size: 14px;">Введите описание компонента для генерации.</p>
                    </div>
                `;
            }
        } else {
            console.warn('Failed to load project content');
            // Показываем приветствие при ошибке
            resultContent.innerHTML = `
                <div style="padding: 20px; text-align: center; color: var(--tg-theme-hint-color, #999999);">
                    <p style="font-size: 16px; margin-bottom: 12px;">👋 Добро пожаловать!</p>
                    <p style="font-size: 14px;">Введите описание компонента для генерации.</p>
                </div>
            `;
        }
    } catch (error) {
        console.error('Error loading project on startup:', error);
        // Показываем приветствие при ошибке
        resultContent.innerHTML = `
            <div style="padding: 20px; text-align: center; color: var(--tg-theme-hint-color, #999999);">
                <p style="font-size: 16px; margin-bottom: 12px;">👋 Добро пожаловать!</p>
                <p style="font-size: 14px;">Введите описание компонента для генерации.</p>
            </div>
        `;
    }
}

// Загружаем проект при старте
loadProjectOnStartup();

// Обновляем стили в соответствии с темой Telegram
document.body.style.backgroundColor = tg.themeParams.bg_color || '#ffffff';
document.body.style.color = tg.themeParams.text_color || '#000000';

