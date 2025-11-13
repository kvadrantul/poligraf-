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
const API_ENDPOINT = 'https://poligraf-black.vercel.app/api/generate';

// История результатов (для отображения всех результатов в одном проекте)
let resultsHistory = [];

// Функция для рендеринга React компонента
function renderReactComponent(codeText, container) {
    try {
        // Очищаем контейнер
        container.innerHTML = '';

        // Извлекаем только код компонента (убираем file= и другие метаданные)
        let cleanCode = codeText;
        
        // Убираем строку file="..." если есть
        cleanCode = cleanCode.replace(/^file="[^"]*"\s*\n?/gm, '');
        
        // Если код содержит export default, оставляем как есть
        // Если нет, оборачиваем в функцию
        if (!cleanCode.includes('export default') && !cleanCode.includes('export')) {
            // Пытаемся найти функцию или компонент
            const functionMatch = cleanCode.match(/(function\s+\w+|const\s+\w+\s*=\s*\(|const\s+\w+\s*=\s*function)/);
            if (functionMatch) {
                // Добавляем export default если его нет
                cleanCode = cleanCode + '\n\nexport default ' + (cleanCode.match(/function\s+(\w+)/)?.[1] || 'Component');
            }
        }

        // Создаем модуль с компонентом
        const moduleCode = `
            const React = window.React;
            const ReactDOM = window.ReactDOM;
            ${cleanCode}
        `;

        // Трансформируем JSX в JavaScript с помощью Babel
        const transformedCode = Babel.transform(moduleCode, {
            presets: ['react'],
            plugins: []
        }).code;

        // Выполняем код в безопасном контексте
        const moduleExports = {};
        const module = { exports: moduleExports };
        
        // Создаем функцию для выполнения кода
        const executeCode = new Function(
            'React',
            'ReactDOM',
            'module',
            'exports',
            transformedCode
        );

        executeCode(window.React, window.ReactDOM, module, module.exports);

        // Получаем компонент
        const Component = module.exports.default || module.exports;

        if (!Component) {
            throw new Error('Компонент не найден. Убедитесь, что код содержит export default.');
        }

        // Рендерим компонент
        const root = ReactDOM.createRoot(container);
        root.render(React.createElement(Component));

        return true;
    } catch (error) {
        console.error('Ошибка рендеринга компонента:', error);
        container.innerHTML = `
            <div class="error-message">
                <strong>Ошибка рендеринга:</strong><br>
                ${error.message}
                <br><br>
                <details>
                    <summary>Исходный код</summary>
                    <pre style="font-size: 12px; margin-top: 8px;">${codeText.substring(0, 500)}...</pre>
                </details>
            </div>
        `;
        return false;
    }
}

// Функция для отображения результата
function displayResult(result) {
    // Убираем placeholder если есть
    const placeholder = resultContent.querySelector('.placeholder');
    if (placeholder) {
        placeholder.remove();
    }

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
        // Создаем контейнер для рендеринга React компонента
        const renderContainer = document.createElement('div');
        renderContainer.className = 'react-render-container';
        
        // Кнопка для показа/скрытия кода
        const codeToggle = document.createElement('button');
        codeToggle.className = 'code-toggle-button';
        codeToggle.textContent = '📄 Показать код';
        let codeVisible = false;
        
        const codeBlock = document.createElement('pre');
        codeBlock.className = 'code-block';
        codeBlock.style.display = 'none';
        codeBlock.textContent = codeText;
        
        codeToggle.onclick = () => {
            codeVisible = !codeVisible;
            codeBlock.style.display = codeVisible ? 'block' : 'none';
            codeToggle.textContent = codeVisible ? '👁️ Скрыть код' : '📄 Показать код';
        };
        
        resultItem.appendChild(codeToggle);
        resultItem.appendChild(renderContainer);
        resultItem.appendChild(codeBlock);
        
        // Пытаемся отрендерить компонент
        renderReactComponent(codeText, renderContainer);
    } else {
        // Обычный текст
        const textElement = document.createElement('div');
        textElement.className = 'result-text';
        textElement.textContent = codeText;
        resultItem.appendChild(textElement);
    }

    // Добавляем разделитель если уже есть результаты
    if (resultsHistory.length > 0) {
        const separator = document.createElement('hr');
        separator.className = 'result-separator';
        resultContent.appendChild(separator);
    }

    resultContent.appendChild(resultItem);
    resultsHistory.push(result);

    // Прокручиваем к последнему результату
    resultContent.scrollTop = resultContent.scrollHeight;
}

// Функция для отправки запроса к v0.dev API
async function sendToV0(prompt) {
    let loadingIndicator = null;
    let loadingTimeElement = null;
    let startTime = null;
    let timeInterval = null;

    try {
        // Показываем индикатор загрузки
        sendButton.disabled = true;
        sendButton.textContent = 'Генерация...';
        
        // Создаем красивый индикатор загрузки с анимацией
        loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        
        const spinner = document.createElement('div');
        spinner.className = 'spinner';
        
        const loadingText = document.createElement('div');
        loadingText.className = 'loading-text';
        loadingText.textContent = 'Генерирую компонент...';
        
        loadingTimeElement = document.createElement('div');
        loadingTimeElement.className = 'loading-time';
        loadingTimeElement.textContent = '0 сек';
        
        loadingIndicator.appendChild(spinner);
        loadingIndicator.appendChild(loadingText);
        loadingIndicator.appendChild(loadingTimeElement);
        
        resultContent.appendChild(loadingIndicator);
        resultContent.scrollTop = resultContent.scrollHeight;

        // Запускаем таймер
        startTime = Date.now();
        timeInterval = setInterval(() => {
            const elapsed = Math.floor((Date.now() - startTime) / 1000);
            if (loadingTimeElement) {
                loadingTimeElement.textContent = `${elapsed} сек`;
            }
        }, 1000);

        // Отправляем запрос к backend с увеличенным таймаутом
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 55000); // 55 секунд (чуть меньше 60)

        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: prompt
            }),
            signal: controller.signal
        });

        clearTimeout(timeoutId);

        // Убираем индикатор загрузки
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
        if (timeInterval) {
            clearInterval(timeInterval);
        }

        if (!response.ok) {
            throw new Error(`Ошибка: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        
        // Отображаем результат
        displayResult(data.result || data.code || data.markup || data);

        // Вибро-отклик успеха
        tg.HapticFeedback.notificationOccurred('success');

    } catch (error) {
        console.error('Ошибка при отправке запроса:', error);
        
        // Убираем индикатор загрузки если есть
        if (loadingIndicator) {
            loadingIndicator.remove();
        }
        if (timeInterval) {
            clearInterval(timeInterval);
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

// Обновляем стили в соответствии с темой Telegram
document.body.style.backgroundColor = tg.themeParams.bg_color || '#ffffff';
document.body.style.color = tg.themeParams.text_color || '#000000';

