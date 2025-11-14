// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;

// Инициализируем приложение
tg.ready();
tg.expand();

// Получаем элементы DOM
const resultContent = document.getElementById('resultContent');
const commentInput = document.getElementById('commentInput');
const sendButton = document.getElementById('sendButton');
const newButton = document.getElementById('newButton');
const imageGenerationButton = document.getElementById('imageGenerationButton');
// Кнопки полиграфии и провайдера удалены - они всегда включены
const imageUploadButton = document.getElementById('imageUploadButton');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const previewImage = document.getElementById('previewImage');
const removeImageButton = document.getElementById('removeImageButton');
const resultArea = document.querySelector('.result-area');

// Переменная для хранения загруженного изображения (base64)
let uploadedImageBase64 = null;

// Состояние генерации изображения (по умолчанию включено)
let imageGenerationEnabled = true;

// Проверяем, что элементы найдены
if (!commentInput) {
    console.error('commentInput not found!');
}
if (!resultContent) {
    console.error('resultContent not found!');
}

// Конфигурация API
// Автоматически определяем окружение: если на localhost, используем локальный backend
const hostname = window.location.hostname;
const port = window.location.port;
const isLocalhost = hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '';
const API_BASE = isLocalhost ? 'http://localhost:8080' : 'https://poligraf-black.vercel.app';
const API_GENERATE = `${API_BASE}/api/generate`; // Model API - быстрая генерация
const API_GENERATE_IMAGE = `${API_BASE}/api/generate-image`; // Image generation API

console.log('🌍 Environment Detection:');
console.log('  - hostname:', hostname);
console.log('  - port:', port);
console.log('  - full URL:', window.location.href);
console.log('  - isLocalhost:', isLocalhost);
console.log('  - Environment:', isLocalhost ? 'LOCAL' : 'PRODUCTION');
console.log('🔗 API Base:', API_BASE);
console.log('🔗 API Generate:', API_GENERATE);

// Получаем Telegram User ID
let userId;
const storedUserId = localStorage.getItem('poligraf-user-id');

if (tg.initDataUnsafe?.user?.id) {
    userId = `tg_${tg.initDataUnsafe.user.id}`;
    localStorage.setItem('poligraf-user-id', userId);
} else if (tg.initData) {
    try {
        const params = new URLSearchParams(tg.initData);
        const userData = params.get('user');
        if (userData) {
            const user = JSON.parse(decodeURIComponent(userData));
            userId = `tg_${user.id}`;
            localStorage.setItem('poligraf-user-id', userId);
        }
    } catch (e) {
        userId = storedUserId || `user_${Date.now()}`;
        localStorage.setItem('poligraf-user-id', userId);
    }
} else {
    if (storedUserId) {
        const parts = storedUserId.split('_');
        if (parts.length > 2) {
            // Миграция старого формата
            const prefix = parts[0];
            const timestamp = parts[1];
            userId = `${prefix}_${timestamp}`;
            localStorage.setItem('poligraf-user-id', userId);
        } else {
            userId = storedUserId;
        }
    } else {
        userId = `test_${Date.now()}`;
        localStorage.setItem('poligraf-user-id', userId);
    }
}

console.log('Initialized userId:', userId);

// Функция для обновления отладочной информации отключена

// Функция для обработки импортов в коде
function processImports(code) {
    let processedCode = code;
    
    processedCode = processedCode.replace(
        /import\s+React\s+from\s+['"]react['"];?/g,
        '// React доступен через window.React'
    );
    processedCode = processedCode.replace(
        /import\s+\*\s+as\s+React\s+from\s+['"]react['"];?/g,
        '// React доступен через window.React'
    );
    
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
    
    processedCode = processedCode.replace(
        /import\s+.*?from\s+['"][^'"]+['"];?/g,
        '// Импорт обработан'
    );
    
    return processedCode;
}

// Функция для сохранения промпта и разметки в localStorage
function savePromptAndMarkup(iframe, codeText, prompt) {
    try {
        // Валидация: не сохраняем явно пустой или некорректный код
        if (!codeText || codeText.trim().length < 50) {
            console.warn('⚠️ Code too short or empty, not saving');
            return;
        }
        
        // Проверяем, что код содержит хотя бы базовые React элементы
        const hasValidReactContent = codeText.includes('return') || 
                                     codeText.includes('function') || 
                                     codeText.includes('const') ||
                                     codeText.includes('className') ||
                                     codeText.includes('div');
        
        if (!hasValidReactContent) {
            console.warn('⚠️ Code does not appear to be valid React, not saving');
            return;
        }
        
        // Сохраняем исходный код для рендеринга
        const codeKey = `poligraf-last-code-${userId}`;
        localStorage.setItem(codeKey, codeText);
        
        // Сохраняем промпт
        const promptKey = `poligraf-last-prompt-${userId}`;
        localStorage.setItem(promptKey, prompt);
        
        // Сохраняем HTML разметку из iframe для использования как референс
        try {
            const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
            if (iframeDoc) {
                // Получаем только содержимое #root (без скриптов и других элементов)
                const rootElement = iframeDoc.getElementById('root');
                
                if (rootElement && rootElement.innerHTML) {
                    const rootHTML = rootElement.innerHTML.trim();
                    
                    // Проверяем, что HTML не пустой и содержит контент
                    if (rootHTML && rootHTML.length > 100) {
                        // Проверяем, что это не просто пустой div или черный экран
                        const hasContent = rootHTML.includes('<div') || 
                                         rootHTML.includes('<span') || 
                                         rootHTML.includes('<p') ||
                                         rootHTML.includes('class=') ||
                                         rootHTML.length > 500;
                        
                        if (hasContent) {
                            const htmlKey = `poligraf-last-html-${userId}`;
                            localStorage.setItem(htmlKey, rootHTML);
                            console.log('✅ Saved prompt, code and HTML to localStorage');
                            console.log('  - Prompt:', prompt);
                            console.log('  - Code length:', codeText.length);
                            console.log('  - HTML length:', rootHTML.length);
                            console.log('  - HTML preview:', rootHTML.substring(0, 200));
                        } else {
                            console.warn('⚠️ HTML appears to be empty or invalid, not saving');
                            console.warn('  - HTML content:', rootHTML.substring(0, 100));
                        }
                    } else {
                        console.warn('⚠️ HTML too short or empty, not saving');
                        console.warn('  - HTML length:', rootHTML.length);
                    }
                } else {
                    console.warn('⚠️ Root element not found in iframe');
                }
            }
        } catch (htmlError) {
            console.warn('Could not save HTML reference:', htmlError);
            console.error('Error details:', htmlError.message, htmlError.stack);
        }
    } catch (error) {
        console.warn('Error saving to localStorage:', error);
    }
}

// Функция для рендеринга React компонента в iframe
function renderReactComponent(codeText, container) {
    try {
        container.innerHTML = '';

        const iframe = document.createElement('iframe');
        iframe.className = 'react-iframe';
        iframe.style.width = '100%';
        iframe.style.height = '100%';
        iframe.style.border = 'none';
        iframe.style.margin = '0';
        iframe.style.padding = '0';
        iframe.style.backgroundColor = 'transparent';
        container.appendChild(iframe);

        iframe.onload = () => {
            try {
                const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                
                let cleanCode = codeText;
                cleanCode = cleanCode.replace(/^file="[^"]*"\s*\n?/gm, '');
                cleanCode = processImports(cleanCode);
                
                // ИСПРАВЛЕНИЕ: Экранируем проблемные кавычки в URL внутри className
                // Проблема: bg-[url('data:image/svg+xml,...')] содержит кавычки внутри SVG, которые ломают парсинг Babel
                // Решение: находим все bg-[url(...)] и экранируем кавычки внутри URL
                cleanCode = cleanCode.replace(/bg-\[url\((['"])(.*?)\1\)\]/g, (match, quote, url) => {
                    // Заменяем кавычки внутри URL на URL-encoded версии
                    // Используем простую замену, т.к. lookbehind может не работать во всех браузерах
                    let fixedUrl = url;
                    // Заменяем двойные кавычки, которые не являются частью %22
                    fixedUrl = fixedUrl.replace(/([^%]|^)"/g, '$1%22');
                    // Заменяем одинарные кавычки, которые не являются частью %27
                    fixedUrl = fixedUrl.replace(/([^%]|^)'/g, '$1%27');
                    return `bg-[url(${quote}${fixedUrl}${quote})]`;
                });
                
                if (!cleanCode.includes('export default') && !cleanCode.includes('export')) {
                    const functionMatch = cleanCode.match(/(function\s+\w+|const\s+\w+\s*=\s*\(|const\s+\w+\s*=\s*function)/);
                    if (functionMatch) {
                        cleanCode = cleanCode + '\n\nexport default ' + (cleanCode.match(/function\s+(\w+)/)?.[1] || 'Component');
                    }
                }

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
                
                iframeCode = iframeCode.replace(/import\s+.*?from\s+['"][^'"]+['"];?/g, '');
                
                // ИСПРАВЛЕНИЕ: Экранируем проблемные кавычки в URL внутри className перед передачей в Babel
                // Проблема: bg-[url('data:image/svg+xml,...')] содержит кавычки внутри SVG, которые ломают парсинг Babel
                // Решение: находим все bg-[url(...)] и экранируем кавычки внутри URL
                iframeCode = iframeCode.replace(/bg-\[url\((['"])(.*?)\1\)\]/g, (match, quote, url) => {
                    // Заменяем кавычки внутри URL на URL-encoded версии
                    // Используем простую замену, т.к. lookbehind может не работать во всех браузерах
                    let fixedUrl = url;
                    // Заменяем двойные кавычки, которые не являются частью %22
                    fixedUrl = fixedUrl.replace(/([^%]|^)"/g, '$1%22');
                    // Заменяем одинарные кавычки, которые не являются частью %27
                    fixedUrl = fixedUrl.replace(/([^%]|^)'/g, '$1%27');
                    return `bg-[url(${quote}${fixedUrl}${quote})]`;
                });
                
                let componentName = 'Component';
                const exportMatch = iframeCode.match(/export\s+default\s+function\s+(\w+)/);
                if (exportMatch) {
                    componentName = exportMatch[1];
                }
                
                iframeCode = iframeCode.replace(/export\s+default\s+/, '');

                const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
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
        
        // Импортируем хуки из React
        const { useState, useEffect, useRef, useCallback, useMemo, useContext, useReducer } = React;
        
        ${iframeCode}
        
        const Component = ${componentName};
        const root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(Component));
    </script>
</body>
</html>
                `;

                iframeDoc.open();
                iframeDoc.write(htmlContent);
                iframeDoc.close();
                
                // Сохраняем промпт и разметку после рендеринга
                setTimeout(() => {
                    const promptKey = `poligraf-last-prompt-${userId}`;
                    const savedPrompt = localStorage.getItem(promptKey);
                    if (savedPrompt) {
                        savePromptAndMarkup(iframe, codeText, savedPrompt);
                    }
                }, 1000);
                
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
                
                setTimeout(adjustHeight, 100);
                setTimeout(adjustHeight, 500);
                setTimeout(adjustHeight, 1000);
                
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
    // Полностью очищаем предыдущий контент
    resultContent.innerHTML = '';
    
    const resultItem = document.createElement('div');
    resultItem.className = 'result-item';
    
    let codeText = typeof result === 'string' ? result : (result.code || result.markup || JSON.stringify(result, null, 2));
    
    // Убеждаемся, что codeText - строка
    if (typeof codeText !== 'string') {
        console.warn('⚠️ codeText is not a string in displayResult, converting...');
        codeText = String(codeText);
    }
    
    console.log('📦 displayResult called with:', {
        resultType: typeof result,
        codeTextType: typeof codeText,
        codeTextLength: codeText?.length || 0,
        codeTextPreview: codeText?.substring(0, 200) || 'N/A'
    });
    
    // Валидация: проверяем, что результат не пустой
    if (!codeText || codeText.trim().length < 10) {
        console.error('⚠️ Empty or invalid result received');
        resultContent.innerHTML = '<div class="error-message">Получен пустой результат. Попробуйте еще раз.</div>';
        return;
    }
    
    // Проверяем, что это не текстовый ответ модели (отказ или объяснение)
    const isTextResponse = codeText.trim().startsWith("I'm") || 
                          codeText.trim().startsWith("However") ||
                          codeText.trim().startsWith("Sorry") ||
                          codeText.trim().startsWith("I can't") ||
                          codeText.trim().startsWith("I cannot") ||
                          (codeText.includes("I help with") && !codeText.includes('function')) ||
                          (codeText.includes("assistant") && !codeText.includes('export') && !codeText.includes('function'));
    
    // Улучшенное определение React кода - проверяем структуру кода
    const hasCodeStructure = (codeText.includes('export') && codeText.includes('function')) ||
                             (codeText.includes('export') && codeText.includes('const') && codeText.includes('=')) ||
                             (codeText.includes('function') && codeText.includes('return')) ||
                             (codeText.includes('const') && codeText.includes('=>') && codeText.includes('return'));
    
    const hasReactKeywords = codeText.includes('import') || 
                             codeText.includes('export') || 
                             codeText.includes('className') || 
                             codeText.includes('return (') || 
                             codeText.includes('jsx') || 
                             codeText.includes('tsx');
    
    // Проверяем, что это не просто HTML разметка
    const isPlainHTML = codeText.trim().startsWith('<!DOCTYPE') || 
                        (codeText.trim().startsWith('<html') && !codeText.includes('function') && !codeText.includes('export'));
    
    // Это React код только если есть структура кода И React ключевые слова, И это не текстовый ответ
    const isReactCode = hasCodeStructure && hasReactKeywords && !isPlainHTML && !isTextResponse;
    
    console.log('🔍 Code analysis:');
    console.log('  - Is text response:', isTextResponse);
    console.log('  - Has code structure:', hasCodeStructure);
    console.log('  - Has React keywords:', hasReactKeywords);
    console.log('  - Is plain HTML:', isPlainHTML);
    console.log('  - Will render as React:', isReactCode);
    console.log('  - Code preview (first 200 chars):', codeText.substring(0, 200));
    
    if (isReactCode) {
        const renderContainer = document.createElement('div');
        renderContainer.className = 'react-render-container';
        resultItem.appendChild(renderContainer);
        renderReactComponent(codeText, renderContainer);
    } else {
        // Если это HTML разметка, вставляем напрямую в iframe
        if (codeText.trim().startsWith('<') && codeText.includes('</')) {
            console.log('⚠️ Received HTML instead of React code, rendering directly in iframe');
            
            const renderContainer = document.createElement('div');
            renderContainer.className = 'react-render-container';
            resultItem.appendChild(renderContainer);
            
            // Создаем iframe и вставляем HTML напрямую
            try {
                renderContainer.innerHTML = '';
                
                const iframe = document.createElement('iframe');
                iframe.className = 'react-iframe';
                iframe.style.width = '100%';
                iframe.style.height = '100%';
                iframe.style.border = 'none';
                iframe.style.margin = '0';
                iframe.style.padding = '0';
                iframe.style.backgroundColor = 'transparent';
                renderContainer.appendChild(iframe);
                
                iframe.onload = () => {
                    try {
                        const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
                        
                        // Если это полный HTML документ, используем его как есть
                        if (codeText.includes('<!DOCTYPE') || codeText.includes('<html')) {
                            iframeDoc.open();
                            iframeDoc.write(codeText);
                            iframeDoc.close();
                        } else {
                            // Если это только фрагмент, оборачиваем в HTML структуру
                            const fullHTML = `<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <script src="https://cdn.tailwindcss.com"></script>
</head>
<body style="margin: 0; padding: 0;">
    ${codeText}
</body>
</html>`;
                            iframeDoc.open();
                            iframeDoc.write(fullHTML);
                            iframeDoc.close();
                        }
                        
                        // Настраиваем высоту iframe
                        const adjustHeight = () => {
                            try {
                                const iframeBody = iframeDoc.body;
                                if (iframeBody) {
                                    const height = Math.max(
                                        iframeBody.scrollHeight,
                                        iframeBody.offsetHeight,
                                        iframeDoc.documentElement.scrollHeight,
                                        iframeDoc.documentElement.offsetHeight
                                    );
                                    iframe.style.height = height + 'px';
                                }
                            } catch (e) {
                                // Игнорируем ошибки доступа к iframe
                            }
                        };
                        
                        setTimeout(adjustHeight, 100);
                        setTimeout(adjustHeight, 500);
                        setTimeout(adjustHeight, 1000);
                        
                        const observer = new MutationObserver(adjustHeight);
                        if (iframeDoc.body) {
                            observer.observe(iframeDoc.body, {
                                childList: true,
                                subtree: true,
                                attributes: true
                            });
                        }
                        
                        console.log('✅ HTML rendered in iframe');
                    } catch (error) {
                        console.error('Ошибка рендеринга HTML в iframe:', error);
                        renderContainer.innerHTML = `
                            <div class="error-message">
                                <strong>Ошибка рендеринга HTML:</strong><br>
                                ${error.message}
                            </div>
                        `;
                    }
                };
                
                iframe.src = 'about:blank';
            } catch (error) {
                console.error('Ошибка создания iframe для HTML:', error);
                renderContainer.innerHTML = `
                    <div class="error-message">
                        <strong>Ошибка рендеринга:</strong><br>
                        ${error.message}
                    </div>
                `;
            }
        } else {
            // Если это не HTML и не React, показываем как текст
            // Если это текстовый ответ модели (отказ), показываем с предупреждением
            let displayText = codeText;
            if (isTextResponse) {
                displayText = '⚠️ Модель вернула текстовый ответ вместо кода:\n\n' + codeText;
                console.warn('⚠️ Model returned text response instead of code');
            }
            
            const textElement = document.createElement('div');
            textElement.className = 'result-text';
            textElement.style.whiteSpace = 'pre-wrap';
            textElement.style.wordWrap = 'break-word';
            textElement.textContent = displayText;
            resultItem.appendChild(textElement);
        }
    }

    resultContent.appendChild(resultItem);
    resultContent.scrollTop = resultContent.scrollHeight;
}

// Функция для загрузки сохраненного промпта и разметки
function loadSavedPromptAndMarkup() {
    try {
        const codeKey = `poligraf-last-code-${userId}`;
        const promptKey = `poligraf-last-prompt-${userId}`;
        const htmlKey = `poligraf-last-html-${userId}`;
        
        const savedCode = localStorage.getItem(codeKey);
        const savedPrompt = localStorage.getItem(promptKey);
        const savedHTML = localStorage.getItem(htmlKey);
        
        console.log('Loading saved data:');
        console.log('  - Code exists:', !!savedCode);
        console.log('  - Prompt exists:', !!savedPrompt);
        console.log('  - HTML exists:', !!savedHTML);
        
        // Подставляем промпт в текстовое поле
        if (savedPrompt && savedPrompt.length > 0) {
            commentInput.value = savedPrompt;
            console.log('✅ Loaded prompt into input field:', savedPrompt);
        }
        
        // Рендерим сохраненный код, если есть
        if (savedCode && savedCode.length > 0) {
            console.log('Rendering saved code...');
            displayResult(savedCode);
            console.log('✅ Saved code loaded and rendered');
        } else {
            console.log('No saved code found');
            resultContent.innerHTML = '';
        }
    } catch (error) {
        console.error('Error loading saved data:', error);
        resultContent.innerHTML = '';
    }
}

// Системный промпт для полиграфии (всегда включен)
const SYSTEM_PROMPT = `Ты веб дизайнер элитной полиграфии. Ты верстаешь визитки, журналы, обложки, открытки, приглашения на праздники и так далее в виде сайта. Ты создаёшь дорогой стиль. Ты идеально работаешь со шрифтами, текстом и превосходно располагаешь тексты и графику на верстке. Ты ничего не упрощаешь из того что тебе дают. Ты делаешь максимально глубокую и качественную графику.

ВАЖНО: ВСЕГДА возвращай валидный React/TSX код компонента. Верни ТОЛЬКО код, без текстовых объяснений. Код должен начинаться с export default function или const Component = и содержать JSX разметку.`;

// Полиграфия всегда включена
const polygraphyModeEnabled = true;

// Провайдер всегда v0.dev
const PROVIDERS = {
    V0: 'v0',
    LOVABLE: 'lovable'
};
const currentProvider = PROVIDERS.V0; // Всегда v0.dev

// Функция для конвертации изображения в base64
function convertImageToBase64(file) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
            resolve(reader.result);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
    });
}

// Функция для очистки localStorage и текстового поля (кнопка "Новый")
function clearAll() {
    const codeKey = `poligraf-last-code-${userId}`;
    const promptKey = `poligraf-last-prompt-${userId}`;
    const htmlKey = `poligraf-last-html-${userId}`;
    
    localStorage.removeItem(codeKey);
    localStorage.removeItem(promptKey);
    localStorage.removeItem(htmlKey);
    
    commentInput.value = '';
    resultContent.innerHTML = '';
    uploadedImageBase64 = null;
    if (imageInput) {
        imageInput.value = '';
    }
    
    // Скрываем превью изображения
    if (imagePreview) {
        imagePreview.style.display = 'none';
    }
    
    console.log('✅ Cleared all saved data');
    tg.HapticFeedback.impactOccurred('light');
}

// Функция для отображения превью изображения
function showImagePreview(imageBase64) {
    if (previewImage && imagePreview) {
        previewImage.src = imageBase64;
        imagePreview.style.display = 'block';
        imagePreview.style.height = 'auto';
        imagePreview.style.margin = '0 auto';
        imagePreview.style.padding = '';
        imagePreview.style.overflow = '';
    }
}

// Функция для скрытия превью изображения
function hideImagePreview() {
    if (imagePreview) {
        imagePreview.style.display = 'none';
        imagePreview.style.height = '0';
        imagePreview.style.margin = '0';
        imagePreview.style.padding = '0';
        imagePreview.style.overflow = 'hidden';
    }
    if (previewImage) {
        previewImage.src = '';
    }
}

// Функция для генерации изображения
async function generateImage(prompt, referenceImage) {
    let imagePrompt;
    
    if (referenceImage) {
        // Если есть референс: "возьми с этого референса графику и нарисуй отдельно её и пришли одним изображением"
        imagePrompt = `Возьми с этого референса графику и нарисуй отдельно её и пришли одним изображением. Референс показывает: ${prompt}`;
        console.log('🎨 Generating image from reference');
    } else {
        // Если нет референса: "создай графику для следующего запроса: [промпт]"
        imagePrompt = `Создай графику для следующего запроса: ${prompt}`;
        console.log('🎨 Generating new image for prompt');
    }
    
    const response = await fetch(API_GENERATE_IMAGE, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({
            prompt: imagePrompt,
            referenceImage: referenceImage || null
        })
    });
    
    if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || `Ошибка генерации изображения: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('✅ Image generated successfully');
    console.log('📷 Image data received:', {
        hasImageUrl: !!data.imageUrl,
        imageUrlType: typeof data.imageUrl,
        imageUrlLength: data.imageUrl?.length || 0,
        startsWithDataImage: data.imageUrl?.startsWith('data:image'),
        preview: data.imageUrl?.substring(0, 100) || 'N/A'
    });
    
    // Отладочная проверка: сохраняем изображение в localStorage для просмотра
    if (data.imageUrl && data.imageUrl.startsWith('data:image')) {
        try {
            // Проверяем размер изображения
            const imageSize = data.imageUrl.length;
            const maxSize = 5 * 1024 * 1024; // 5MB лимит для большинства браузеров
            
            if (imageSize > maxSize) {
                console.warn(`⚠️ Image too large for localStorage (${(imageSize / 1024 / 1024).toFixed(2)}MB > ${(maxSize / 1024 / 1024).toFixed(2)}MB)`);
                console.warn('💡 Trying to save truncated version or use sessionStorage...');
                
                // Пробуем сохранить хотя бы превью
                const truncated = data.imageUrl.substring(0, maxSize - 1000);
                localStorage.setItem('poligraf-debug-generated-image-preview', truncated + '... [TRUNCATED]');
                console.log('💾 Truncated image preview saved to localStorage');
            } else {
                localStorage.setItem('poligraf-debug-generated-image', data.imageUrl);
                console.log(`💾 Image saved to localStorage (${(imageSize / 1024).toFixed(2)}KB)`);
            }
            
            // Также сохраняем в sessionStorage как резерв
            try {
                sessionStorage.setItem('poligraf-debug-generated-image', data.imageUrl);
                console.log('💾 Image also saved to sessionStorage');
            } catch (e2) {
                console.warn('⚠️ Could not save to sessionStorage:', e2);
            }
            
            // Создаем blob URL для прямого доступа
            try {
                const base64Data = data.imageUrl.split(',')[1];
                const byteCharacters = atob(base64Data);
                const byteNumbers = new Array(byteCharacters.length);
                for (let i = 0; i < byteCharacters.length; i++) {
                    byteNumbers[i] = byteCharacters.charCodeAt(i);
                }
                const byteArray = new Uint8Array(byteNumbers);
                const blob = new Blob([byteArray], { type: 'image/jpeg' });
                const blobUrl = URL.createObjectURL(blob);
                window.poligrafDebugImageBlobUrl = blobUrl;
                console.log('🔗 Blob URL created:', blobUrl);
                console.log('💡 You can access it via: window.poligrafDebugImageBlobUrl');
            } catch (e3) {
                console.warn('⚠️ Could not create blob URL:', e3);
            }
            
        } catch (e) {
            console.error('❌ Could not save image to localStorage:', e);
            console.error('  - Error name:', e.name);
            console.error('  - Error message:', e.message);
            
            // Пробуем сохранить хотя бы метаданные
            try {
                localStorage.setItem('poligraf-debug-image-meta', JSON.stringify({
                    length: data.imageUrl.length,
                    startsWith: data.imageUrl.substring(0, 50),
                    timestamp: new Date().toISOString()
                }));
                console.log('💾 Image metadata saved instead');
            } catch (e4) {
                console.error('❌ Could not save metadata either:', e4);
            }
        }
    } else {
        console.error('❌ Invalid image URL received from API');
        console.error('  - Full response:', JSON.stringify(data, null, 2));
    }
    
    return data.imageUrl;
}

// Функция для создания прогресс-индикатора
function createProgressIndicator(container) {
    const progressContainer = document.createElement('div');
    progressContainer.className = 'progress-indicator';
    
    // Этап 1: Генерация графики
    const step1 = createProgressStep('Генерация графики', 'sparkle');
    
    // Линия
    const line1 = document.createElement('div');
    line1.className = 'progress-line';
    
    // Этап 2: Графика готова
    const step2 = createProgressStep('Графика готова', 'check');
    
    // Линия
    const line2 = document.createElement('div');
    line2.className = 'progress-line';
    
    // Карточка с изображением (скрыта по умолчанию)
    const imageCard = document.createElement('div');
    imageCard.className = 'progress-image-card';
    imageCard.innerHTML = '<div style="padding: 8px; color: rgba(255,255,255,0.7); font-size: 10px; text-align: center;">Сгенерированное изображение</div><img src="" alt="Generated" style="display: none;">';
    
    // Линия
    const line3 = document.createElement('div');
    line3.className = 'progress-line';
    
    // Этап 3: Генерация полиграфии
    const step3 = createProgressStep('Генерация полиграфии', 'document');
    
    // Линия
    const line4 = document.createElement('div');
    line4.className = 'progress-line';
    
    // Этап 4: Полиграфия готова
    const step4 = createProgressStep('Полиграфия готова', 'check');
    
    // Собираем структуру - все элементы добавляются, но скрыты
    // Порядок: step1 -> line1 -> step2 -> line2 -> imageCard -> line3 -> step3 -> line4 -> step4
    progressContainer.appendChild(step1);
    progressContainer.appendChild(line1);
    progressContainer.appendChild(step2);
    progressContainer.appendChild(line2); // Линия перед карточкой изображения
    progressContainer.appendChild(imageCard);
    progressContainer.appendChild(line3); // Линия после карточки изображения
    progressContainer.appendChild(step3);
    progressContainer.appendChild(line4);
    progressContainer.appendChild(step4);
    
    // Скрываем все линии изначально
    line1.style.display = 'none';
    line2.style.display = 'none';
    line3.style.display = 'none';
    line4.style.display = 'none';
    
    // Сохраняем ссылки на линии для возможности их скрытия
    const lines = [line1, line2, line3, line4];
    
    // Показываем только первый этап сразу
    step1.classList.add('show', 'active');
    
    container.appendChild(progressContainer);
    
    return {
        container: progressContainer,
        step1,
        step2,
        step3,
        step4,
        imageCard,
        lines,
        updateStep: (stepNumber, status) => {
            const steps = [null, step1, step2, step3, step4];
            const step = steps[stepNumber];
            if (step) {
                // Показываем этап, если он еще не показан
                if (!step.classList.contains('show')) {
                    step.classList.add('show');
                }
                
                step.classList.remove('active', 'completed');
                if (status === 'active') {
                    step.classList.add('active');
                } else if (status === 'completed') {
                    step.classList.add('completed');
                    step.classList.remove('active'); // Убираем пульсацию при завершении
                    
                    // Показываем линию после завершенного этапа
                    // step1 -> line1, step2 -> line2 (перед imageCard), step3 -> line4
                    if (stepNumber === 1 && line1) {
                        line1.style.display = 'block';
                        line1.classList.add('show');
                    } else if (stepNumber === 2 && line2) {
                        // line2 показывается после step2, перед imageCard
                        line2.style.display = 'block';
                        line2.classList.add('show');
                    } else if (stepNumber === 3 && line4) {
                        line4.style.display = 'block';
                        line4.classList.add('show');
                    }
                }
            }
        },
        showImage: (imageUrl) => {
            const img = imageCard.querySelector('img');
            if (img && imageUrl) {
                console.log('🖼️ Showing image in progress card');
                console.log('  - URL type:', typeof imageUrl);
                console.log('  - URL length:', imageUrl?.length || 0);
                console.log('  - URL preview:', imageUrl?.substring(0, 100) || 'N/A');
                console.log('  - Starts with data:image:', imageUrl?.startsWith('data:image'));
                
                // Проверяем, что это data URL (изображение), а не код
                if (typeof imageUrl === 'string' && imageUrl.startsWith('data:image')) {
                    // Проверяем, что изображение действительно загружается
                    img.onload = () => {
                        console.log('✅ Image loaded successfully in progress card');
                        imageCard.classList.add('show');
                        // Показываем линию после карточки изображения
                        if (line3) {
                            line3.style.display = 'block';
                            line3.classList.add('show');
                        }
                    };
                    img.onerror = () => {
                        console.error('❌ Failed to load image in progress card');
                        console.error('  - Image URL preview:', imageUrl.substring(0, 200));
                    };
                    img.src = imageUrl;
                    img.style.display = 'block';
                    console.log('📷 Image src set, waiting for load...');
                } else {
                    console.error('❌ Invalid image URL - not a data:image URL');
                    console.error('  - Received type:', typeof imageUrl);
                    console.error('  - Received preview:', imageUrl?.substring(0, 200) || 'N/A');
                    // Не показываем карточку, если это не изображение
                }
            } else {
                console.warn('⚠️ Image element not found or imageUrl is empty');
                console.warn('  - img exists:', !!img);
                console.warn('  - imageUrl exists:', !!imageUrl);
            }
        },
        remove: () => {
            progressContainer.remove();
        }
    };
}

// Функция для создания шага прогресса
function createProgressStep(text, iconType) {
    const step = document.createElement('div');
    step.className = 'progress-step';
    
    const icon = document.createElement('div');
    icon.className = 'progress-step-icon';
    
    let iconSvg = '';
    if (iconType === 'sparkle') {
        iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L15.09 8.26L22 9.27L17 14.14L18.18 21.02L12 17.77L5.82 21.02L7 14.14L2 9.27L8.91 8.26L12 2Z"/></svg>';
    } else if (iconType === 'check') {
        iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M9 12l2 2 4-4"/></svg>';
    } else if (iconType === 'document') {
        iconSvg = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/></svg>';
    }
    
    icon.innerHTML = iconSvg;
    
    const textEl = document.createElement('div');
    textEl.className = 'progress-step-text';
    textEl.textContent = text;
    
    step.appendChild(icon);
    step.appendChild(textEl);
    
    return step;
}

// Функция для отправки запроса к v0.dev Model API
async function sendToV0(prompt) {
    let loadingOverlay = null;
    let progressIndicator = null;

    try {
        // Создаем overlay с пульсацией для затемнения iframe (поверх result-area)
        if (resultArea) {
            // Делаем result-area относительно позиционированной для overlay
            resultArea.style.position = 'relative';
            
            loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'loading-overlay';
            resultArea.appendChild(loadingOverlay);
            
            // Создаем прогресс-индикатор
            progressIndicator = createProgressIndicator(loadingOverlay);
        } else {
            console.error('resultArea not found for loading overlay');
        }

        // ЭТАП 1: Генерируем изображение (если включено)
        let generatedImage = null;
        if (imageGenerationEnabled) {
            console.log('🎨 Step 1: Generating image...');
            if (progressIndicator) {
                progressIndicator.updateStep(1, 'active');
            }
            generatedImage = await generateImage(prompt, uploadedImageBase64);
            console.log('✅ Image generated, proceeding to v0.dev');
            console.log('📷 Generated image type check:', {
                isString: typeof generatedImage === 'string',
                startsWithDataImage: generatedImage?.startsWith('data:image'),
                length: generatedImage?.length || 0,
                preview: generatedImage?.substring(0, 100) || 'N/A'
            });
            
            // Обновляем прогресс: графика готова, показываем изображение
            if (progressIndicator) {
                progressIndicator.updateStep(1, 'completed');
                // Небольшая задержка для анимации линии
                setTimeout(() => {
                    // Показываем этап 2 и карточку с изображением
                    progressIndicator.updateStep(2, 'active');
                    if (generatedImage && generatedImage.startsWith('data:image')) {
                        progressIndicator.showImage(generatedImage);
                        setTimeout(() => {
                            progressIndicator.updateStep(2, 'completed');
                            // Переходим к следующему этапу
                            setTimeout(() => {
                                if (progressIndicator) {
                                    progressIndicator.updateStep(3, 'active');
                                }
                            }, 500);
                        }, 500);
                    } else {
                        console.error('❌ Generated image is not a valid data:image URL!');
                        console.error('  - Type:', typeof generatedImage);
                        console.error('  - Value preview:', generatedImage?.substring(0, 200) || 'N/A');
                        // Продолжаем без изображения
                        progressIndicator.updateStep(2, 'completed');
                        setTimeout(() => {
                            if (progressIndicator) {
                                progressIndicator.updateStep(3, 'active');
                            }
                        }, 500);
                    }
                }, 300);
            }
        } else {
            console.log('⏭️ Image generation disabled, skipping to v0.dev');
            // Если есть загруженное изображение, используем его
            if (uploadedImageBase64) {
                generatedImage = uploadedImageBase64;
                console.log('📷 Using uploaded image instead');
                // Показываем загруженное изображение в прогресс-индикаторе
                if (progressIndicator) {
                    // Сразу показываем этап 2 как завершенный и изображение
                    progressIndicator.updateStep(1, 'completed');
                    setTimeout(() => {
                        progressIndicator.updateStep(2, 'completed');
                        progressIndicator.showImage(uploadedImageBase64);
                        setTimeout(() => {
                            progressIndicator.updateStep(3, 'active');
                        }, 500);
                    }, 300);
                }
            } else {
                // Нет изображения вообще - пропускаем этапы 1-2, сразу переходим к этапу 3
                if (progressIndicator) {
                    // Скрываем этапы 1-2 и карточку изображения
                    progressIndicator.step1.style.display = 'none';
                    progressIndicator.step2.style.display = 'none';
                    progressIndicator.imageCard.style.display = 'none';
                    // Находим и скрываем линии перед ними
                    const lines = progressIndicator.container.querySelectorAll('.progress-line');
                    if (lines[0]) lines[0].style.display = 'none';
                    if (lines[1]) lines[1].style.display = 'none';
                    if (lines[2]) lines[2].style.display = 'none';
                    // Показываем этап 3
                    progressIndicator.updateStep(3, 'active');
                }
            }
        }

        // ЭТАП 2: Формируем промпт для v0.dev с сгенерированным изображением
        const htmlKey = `poligraf-last-html-${userId}`;
        const lastHTML = localStorage.getItem(htmlKey);
        
        // Системный промпт всегда добавляется в начало (полиграфия всегда включена)
        let userPrompt = SYSTEM_PROMPT + '\n\n';
        console.log('✅ System prompt added (polygraphy mode always enabled)');
        
        // Если есть сохраненная разметка - используем её как референс
        if (lastHTML && lastHTML.length > 100) {
            // Проверяем, что HTML валидный (не пустой div)
            const isValidHTML = lastHTML.includes('<div') || 
                               lastHTML.includes('<span') || 
                               lastHTML.includes('<p') ||
                               lastHTML.includes('class=') ||
                               lastHTML.length > 500;
            
            if (isValidHTML) {
                const maxHtmlLength = 20000;
                const truncatedHTML = lastHTML.length > maxHtmlLength 
                    ? lastHTML.substring(0, maxHtmlLength) + '\n<!-- ... (HTML truncated) -->'
                    : lastHTML;
                
                // Формируем промпт: "возьми за основу вот этот HTML и расположи на фоне изображение которое я прикрепил"
                if (generatedImage || uploadedImageBase64) {
                    userPrompt += `возьми за основу вот этот HTML:

\`\`\`html
${truncatedHTML}
\`\`\`

расположи на фоне изображение которое я прикрепил и сделай ${prompt}`;
                } else {
                    userPrompt += `возьми за основу вот этот HTML:

\`\`\`html
${truncatedHTML}
\`\`\`

и сделай ${prompt}`;
                }
                
                console.log('✅ Using saved HTML as reference');
                console.log('  - HTML length:', truncatedHTML.length);
                console.log('  - User prompt:', prompt);
            } else {
                console.warn('⚠️ Saved HTML appears invalid, ignoring it');
                // Если HTML невалидный, просто добавляем промпт пользователя
                if (generatedImage || uploadedImageBase64) {
                    userPrompt += `расположи на фоне изображение которое я прикрепил и сделай ${prompt}`;
                } else {
                    userPrompt += `сделай ${prompt}`;
                }
            }
        } else {
            console.log('📝 New generation (no saved markup)');
            // Если нет HTML референса, просто добавляем промпт пользователя
            if (generatedImage || uploadedImageBase64) {
                userPrompt += `расположи на фоне изображение которое я прикрепил и сделай ${prompt}`;
            } else {
                userPrompt += `сделай ${prompt}`;
            }
        }
        
        // Инструкция возвращать React код уже включена в SYSTEM_PROMPT
        // Дополнительно напоминаем в конце
        userPrompt += '\n\nВерни ТОЛЬКО код React/TSX компонента, без текстовых объяснений.';
        console.log('✅ React code instruction included in prompt');
        
        // Логируем финальную структуру промпта для отладки
        console.log('📋 Final prompt structure:');
        console.log('  - Length:', userPrompt.length);
        console.log('  - Preview (first 500 chars):', userPrompt.substring(0, 500));
        console.log('  - Has system prompt:', userPrompt.includes('веб дизайнер элитной полиграфии'));
        console.log('  - Has HTML reference:', userPrompt.includes('возьми за основу'));
        console.log('  - Has image instruction:', userPrompt.includes('расположи на фоне изображение'));
        console.log('  - Has user prompt:', userPrompt.includes(prompt));
        console.log('  - Has React instruction:', userPrompt.includes('React/TSX'));

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 90000); // Увеличено до 90 секунд

        // ЭТАП 2: Отправляем запрос в v0.dev с сгенерированным изображением
        console.log('🚀 Step 2: Sending request to v0.dev with generated image...');
        
        // Убеждаемся, что этап 3 активен (если генерация изображения была пропущена)
        if (progressIndicator && !imageGenerationEnabled) {
            progressIndicator.updateStep(3, 'active');
        }
        
        const response = await fetch(API_GENERATE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                userPrompt: userPrompt,
                image: generatedImage || '', // Передаем изображение только если есть
                provider: currentProvider
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        // Обновляем прогресс: полиграфия готова
        if (progressIndicator) {
            progressIndicator.updateStep(3, 'completed');
            progressIndicator.updateStep(4, 'active');
            // Убираем прогресс через небольшую задержку для показа финального этапа
            setTimeout(() => {
                if (progressIndicator) {
                    progressIndicator.updateStep(4, 'completed');
                }
                if (loadingOverlay) {
                    loadingOverlay.remove();
                }
            }, 800);
        } else {
            if (loadingOverlay) {
                loadingOverlay.remove();
            }
        }

        if (!response.ok) {
            let errorMessage = `Ошибка: ${response.status} ${response.statusText}`;
            try {
                const errorData = await response.json();
                errorMessage = errorData.error || errorMessage;
                console.error('❌ API Error:', errorData);
            } catch (e) {
                const errorText = await response.text();
                console.error('❌ API Error (text):', errorText);
                errorMessage = errorText || errorMessage;
            }
            throw new Error(errorMessage);
        }

        const data = await response.json();
        console.log('📦 Raw API response:', {
            hasResult: 'result' in data,
            hasCode: 'code' in data,
            hasMarkup: 'markup' in data,
            keys: Object.keys(data),
            resultType: typeof data.result,
            codeType: typeof data.code,
            resultLength: data.result?.length || 0,
            codeLength: data.code?.length || 0
        });
        
        // Проверяем все возможные поля
        let generatedCode = data.result || data.code || data.markup || '';
        
        // Если generatedCode - объект, пробуем извлечь строку
        if (typeof generatedCode === 'object' && generatedCode !== null) {
            console.warn('⚠️ Generated code is an object, trying to extract string');
            generatedCode = JSON.stringify(generatedCode);
        }
        
        // Если все еще пусто, пробуем весь data как строку
        if (!generatedCode || generatedCode.length === 0) {
            console.warn('⚠️ All code fields are empty, trying data as string');
            generatedCode = typeof data === 'string' ? data : JSON.stringify(data);
        }
        
        // Извлекаем код из markdown блоков (```tsx ... ``` или ```jsx ... ```)
        if (typeof generatedCode === 'string') {
            // Удаляем markdown блоки кода
            const markdownCodeBlockRegex = /```(?:tsx|jsx|javascript|typescript|js|ts)?\s*\n?([\s\S]*?)```/g;
            const matches = generatedCode.match(markdownCodeBlockRegex);
            if (matches && matches.length > 0) {
                // Берем первый блок кода
                generatedCode = matches[0]
                    .replace(/```(?:tsx|jsx|javascript|typescript|js|ts)?\s*\n?/g, '')
                    .replace(/```\s*$/g, '')
                    .trim();
                console.log('✅ Extracted code from markdown block');
            } else {
                // Если нет markdown блоков, но есть ``` в начале/конце, убираем их
                generatedCode = generatedCode
                    .replace(/^```(?:tsx|jsx|javascript|typescript|js|ts)?\s*\n?/g, '')
                    .replace(/\n?```\s*$/g, '')
                    .trim();
            }
        }
        
        console.log('📦 Received response from API:');
        console.log('  - Result type:', typeof generatedCode);
        console.log('  - Result length:', generatedCode?.length || 0);
        console.log('  - Result preview (first 300 chars):', generatedCode?.substring(0, 300) || 'N/A');
        console.log('  - Has code blocks:', generatedCode?.includes('```') || false);
        console.log('  - Has React keywords:', generatedCode?.includes('React') || generatedCode?.includes('export') || false);
        console.log('  - Polygraphy mode: always enabled');
        console.log('  - Provider: always v0.dev');
        
        // Проверяем, что код не пустой
        if (!generatedCode || (typeof generatedCode === 'string' && generatedCode.trim().length < 10)) {
            console.error('❌ Empty or invalid code received');
            console.error('❌ Full data object:', JSON.stringify(data, null, 2));
            resultContent.innerHTML = '<div class="error-message">Получен пустой результат от API. Проверьте логи в консоли и на backend.</div>';
            return;
        }
        
        // Убеждаемся, что generatedCode - строка
        if (typeof generatedCode !== 'string') {
            console.warn('⚠️ Generated code is not a string, converting...');
            generatedCode = String(generatedCode);
        }
        
        // Отображаем результат (заменяет предыдущий контент)
        displayResult(generatedCode);
        
        // Сохраняем промпт (полный текст из поля) и разметку после успешной генерации
        // Разметка будет сохранена в renderReactComponent через savePromptAndMarkup
        const promptKey = `poligraf-last-prompt-${userId}`;
        localStorage.setItem(promptKey, prompt);
        console.log('✅ Saved prompt to localStorage:', prompt);
        
        // Сохраняем код для рендеринга
        const codeKey = `poligraf-last-code-${userId}`;
        localStorage.setItem(codeKey, generatedCode);
        console.log('✅ Saved code to localStorage');

        // Очищаем загруженное изображение после использования (не сохраняем в localStorage)
        if (uploadedImageBase64) {
            uploadedImageBase64 = null;
            if (imageInput) {
                imageInput.value = '';
            }
            hideImagePreview();
            console.log('✅ Image cleared after use');
        }

        // Вибро-отклик успеха
        tg.HapticFeedback.notificationOccurred('success');

    } catch (error) {
        console.error('Ошибка при отправке запроса:', error);
        
        // Убираем прогресс при ошибке
        if (progressIndicator) {
            progressIndicator.remove();
        }
        if (loadingOverlay) {
            loadingOverlay.remove();
        }

        // Показываем ошибку поверх контента
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.style.position = 'fixed';
        errorElement.style.top = '50%';
        errorElement.style.left = '50%';
        errorElement.style.transform = 'translate(-50%, -50%)';
        errorElement.style.zIndex = '10000';
        errorElement.style.maxWidth = '80%';
        
        if (error.name === 'AbortError' || error.message.includes('timeout')) {
            errorElement.textContent = 'Время ожидания истекло. Генерация занимает слишком долго. Попробуйте более простой запрос.';
        } else {
            errorElement.textContent = `Ошибка: ${error.message}`;
        }
        
        document.body.appendChild(errorElement);
        
        // Убираем ошибку через 5 секунд
        setTimeout(() => {
            if (errorElement.parentNode) {
                errorElement.remove();
            }
        }, 5000);

        tg.HapticFeedback.notificationOccurred('error');
    }
}

// Функция для отправки сообщения
async function handleSendMessage() {
    if (!commentInput) return;
    
    const comment = commentInput.value.trim();
    
    if (comment) {
        await sendToV0(comment);
        // НЕ очищаем поле - промпт остается для дальнейшего редактирования
    } else {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Обработчик отправки комментария (Enter - только с Shift для новой строки)
if (commentInput) {
    commentInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            await handleSendMessage();
        }
        // Shift+Enter позволяет добавить новую строку
    });
} else {
    console.error('Cannot add event listener: commentInput is null');
}

// Обработчик кнопки отправки
if (sendButton) {
    sendButton.addEventListener('click', async () => {
        await handleSendMessage();
    });
} else {
    console.error('Cannot add event listener: sendButton is null');
}


// Функция обновления внешнего вида кнопки
function updateImageGenerationButton() {
    if (imageGenerationButton) {
        if (imageGenerationEnabled) {
            imageGenerationButton.classList.add('active');
            console.log('✅ Image generation button: ACTIVE class added');
        } else {
            imageGenerationButton.classList.remove('active');
            console.log('✅ Image generation button: ACTIVE class removed');
        }
    } else {
        console.error('❌ imageGenerationButton is null');
    }
}

// Инициализация состояния кнопки генерации изображения
const savedImageGenState = localStorage.getItem('poligraf-image-generation-enabled');
if (savedImageGenState !== null) {
    imageGenerationEnabled = savedImageGenState === 'true';
    console.log('📦 Loaded image generation state from localStorage:', imageGenerationEnabled);
} else {
    console.log('📦 Using default image generation state:', imageGenerationEnabled);
}

// Инициализируем состояние кнопки при загрузке (после того как DOM готов)
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', updateImageGenerationButton);
} else {
    // DOM уже загружен
    updateImageGenerationButton();
}

// Обработчик кнопки "Изображение" (тоггл)
if (imageGenerationButton) {
    imageGenerationButton.addEventListener('click', () => {
        imageGenerationEnabled = !imageGenerationEnabled;
        localStorage.setItem('poligraf-image-generation-enabled', imageGenerationEnabled.toString());
        updateImageGenerationButton();
        tg.HapticFeedback.impactOccurred('light');
        console.log('🖼️ Image generation:', imageGenerationEnabled ? 'ENABLED' : 'DISABLED');
    });
} else {
    console.error('Cannot add event listener: imageGenerationButton is null');
}

// Обработчик кнопки "Новый"
if (newButton) {
    newButton.addEventListener('click', () => {
        clearAll();
    });
} else {
    console.error('Cannot add event listener: newButton is null');
}

// Кнопки полиграфии и провайдера удалены - они всегда включены
// Полиграфия: всегда enabled
// Провайдер: всегда v0.dev

// Обработчик кнопки загрузки изображения
if (imageUploadButton && imageInput) {
    imageUploadButton.addEventListener('click', () => {
        imageInput.click();
    });
    
    imageInput.addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (file) {
            try {
                uploadedImageBase64 = await convertImageToBase64(file);
                console.log('✅ Image loaded:', file.name, 'Size:', file.size);
                showImagePreview(uploadedImageBase64);
                tg.HapticFeedback.impactOccurred('light');
            } catch (error) {
                console.error('Error loading image:', error);
                tg.HapticFeedback.notificationOccurred('error');
            }
        }
    });
} else {
    console.error('Cannot add event listener: imageUploadButton or imageInput is null');
}

// Обработчик кнопки удаления изображения
if (removeImageButton) {
    removeImageButton.addEventListener('click', () => {
        uploadedImageBase64 = null;
        if (imageInput) {
            imageInput.value = '';
        }
        hideImagePreview();
        tg.HapticFeedback.impactOccurred('light');
        console.log('✅ Image removed');
    });
} else {
    console.error('Cannot add event listener: removeImageButton is null');
}

// Загружаем сохраненный промпт и разметку при старте
loadSavedPromptAndMarkup();

// Устанавливаем черный фон
document.body.style.backgroundColor = '#000000';
document.body.style.color = '#ffffff';
