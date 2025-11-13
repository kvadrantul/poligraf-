// Инициализация Telegram Web App
const tg = window.Telegram.WebApp;

// Инициализируем приложение
tg.ready();
tg.expand();

// Получаем элементы DOM
const resultContent = document.getElementById('resultContent');
const commentInput = document.getElementById('commentInput');
const backButton = document.getElementById('backButton');
const sendButton = document.getElementById('sendButton');
const resultArea = document.querySelector('.result-area');

// Проверяем, что элементы найдены
if (!commentInput) {
    console.error('commentInput not found!');
}
if (!backButton) {
    console.error('backButton not found!');
}
if (!resultContent) {
    console.error('resultContent not found!');
}

// Конфигурация API
const API_BASE = 'https://poligraf-black.vercel.app';
const API_GENERATE = `${API_BASE}/api/generate`; // Model API - быстрая генерация

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

// Функция для обновления отладочной информации на экране
function updateDebugInfo() {
    const debugInfo = document.getElementById('debugInfo');
    const debugUserId = document.getElementById('debugUserId');
    const debugStoredUserId = document.getElementById('debugStoredUserId');
    const debugProjectKey = document.getElementById('debugProjectKey');
    const debugProjectData = document.getElementById('debugProjectData');
    
    if (debugInfo && debugUserId && debugStoredUserId && debugProjectKey && debugProjectData) {
        const storedUserIdFromLS = localStorage.getItem('poligraf-user-id');
        const lastHtmlKey = `poligraf-last-html-${userId}`;
        const lastCodeKey = `poligraf-last-code-${userId}`;
        const hasHtml = !!localStorage.getItem(lastHtmlKey);
        const hasCode = !!localStorage.getItem(lastCodeKey);
        
        debugUserId.textContent = `Current userId: ${userId}`;
        debugStoredUserId.textContent = `Stored userId: ${storedUserIdFromLS || 'NOT FOUND'}`;
        debugProjectKey.textContent = `Last Code: ${hasCode ? 'EXISTS (' + (localStorage.getItem(`poligraf-last-code-${userId}`)?.length || 0) + ' chars)' : 'NOT FOUND'}`;
        debugProjectData.textContent = `Code will be re-rendered on load`;
        
        debugInfo.style.display = 'block';
    }
}

updateDebugInfo();

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

// Функция для сохранения кода в localStorage
// Сохраняем только исходный код, HTML не сохраняем (рендерим заново при загрузке)
function saveRenderedHTML(iframe, codeText) {
    try {
        // Сохраняем только исходный код для использования в промптах и для рендеринга
        const codeKey = `poligraf-last-code-${userId}`;
        localStorage.setItem(codeKey, codeText);
        
        console.log('✅ Saved code to localStorage, length:', codeText.length);
    } catch (error) {
        console.warn('Error saving code to localStorage:', error);
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
                
                // Сохраняем HTML разметку после рендеринга
                setTimeout(() => {
                    saveRenderedHTML(iframe, codeText);
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
    const resultItem = document.createElement('div');
    resultItem.className = 'result-item';
    
    const codeText = typeof result === 'string' ? result : (result.code || result.markup || JSON.stringify(result, null, 2));
    const isReactCode = codeText.includes('import') || codeText.includes('export') || 
                        codeText.includes('function') || codeText.includes('className') || 
                        codeText.includes('return (') || codeText.includes('React') ||
                        codeText.includes('jsx') || codeText.includes('tsx');
    
    if (isReactCode) {
        const renderContainer = document.createElement('div');
        renderContainer.className = 'react-render-container';
        resultItem.appendChild(renderContainer);
        renderReactComponent(codeText, renderContainer);
    } else {
        const textElement = document.createElement('div');
        textElement.className = 'result-text';
        textElement.textContent = codeText;
        resultItem.appendChild(textElement);
    }

    resultContent.innerHTML = '';
    resultContent.appendChild(resultItem);
    resultContent.scrollTop = resultContent.scrollHeight;
}

// Функция для загрузки сохраненного кода и его рендеринга
function loadSavedHTML() {
    try {
        const codeKey = `poligraf-last-code-${userId}`;
        const savedCode = localStorage.getItem(codeKey);
        
        console.log('Loading saved code, key:', codeKey);
        console.log('Saved code exists:', !!savedCode);
        console.log('Saved code length:', savedCode?.length || 0);
        
        if (savedCode && savedCode.length > 0) {
            console.log('Saved code preview:', savedCode.substring(0, 200));
            
            // Рендерим код заново (как при первой генерации)
            // Это гарантирует, что все импорты и зависимости будут правильными
            displayResult(savedCode);
            
            console.log('✅ Saved code loaded and rendered');
        } else {
            console.log('No saved code found in localStorage');
            resultContent.innerHTML = '';
        }
    } catch (error) {
        console.error('Error loading saved code:', error);
        console.error('Error details:', error.message, error.stack);
        resultContent.innerHTML = '';
    }
}

// Функция для отправки запроса к v0.dev Model API
async function sendToV0(prompt) {
    let loadingOverlay = null;
    let loadingSpinner = null;

    try {
        // Создаем overlay с пульсацией для затемнения iframe (поверх result-area)
        if (resultArea) {
            // Делаем result-area относительно позиционированной для overlay
            resultArea.style.position = 'relative';
            
            loadingOverlay = document.createElement('div');
            loadingOverlay.className = 'loading-overlay';
            resultArea.appendChild(loadingOverlay);
            
            // Создаем маленький белый спиннер в правом нижнем углу (внутри overlay)
            loadingSpinner = document.createElement('div');
            loadingSpinner.className = 'loading-spinner-small';
            const spinnerSmall = document.createElement('div');
            spinnerSmall.className = 'spinner-small';
            loadingSpinner.appendChild(spinnerSmall);
            loadingOverlay.appendChild(loadingSpinner);
        } else {
            console.error('resultArea not found for loading overlay');
        }

        // Проверяем, есть ли сохраненный код для контекста (правка)
        const codeKey = `poligraf-last-code-${userId}`;
        const lastCode = localStorage.getItem(codeKey);
        
        let enhancedPrompt = prompt;
        
        // Если есть сохраненный код - ВСЕГДА используем его как основу для правок
        // Это гарантирует, что мы редактируем существующий компонент, а не создаем новый
        if (lastCode && lastCode.length > 0) {
            const isEdit = prompt.toLowerCase().includes('измени') ||
                          prompt.toLowerCase().includes('прав') ||
                          prompt.toLowerCase().includes('добавь') ||
                          prompt.toLowerCase().includes('убери') ||
                          prompt.toLowerCase().includes('сделай') ||
                          prompt.toLowerCase().includes('переделай') ||
                          prompt.toLowerCase().includes('поменяй') ||
                          prompt.toLowerCase().includes('замени') ||
                          prompt.toLowerCase().includes('change') ||
                          prompt.toLowerCase().includes('modify') ||
                          prompt.toLowerCase().includes('update') ||
                          prompt.toLowerCase().includes('fix') ||
                          prompt.toLowerCase().includes('edit') ||
                          prompt.toLowerCase().includes('color') ||
                          prompt.toLowerCase().includes('цвет');
            
            if (isEdit) {
                // Используем полный код как основу (увеличиваем лимит для лучшего контекста)
                const maxCodeLength = 8000;
                const truncatedCode = lastCode.length > maxCodeLength 
                    ? lastCode.substring(0, maxCodeLength) + '\n// ... (code truncated)'
                    : lastCode;
                
                enhancedPrompt = `You are an expert React/Next.js developer. I have an existing React component that I need to modify. 

IMPORTANT: Use the existing code below as the BASE/FOUNDATION. Keep the same structure, layout, and styling approach. Only make the specific changes requested by the user.

Existing component code:
${'```'}tsx
${truncatedCode}
${'```'}

User's modification request: "${prompt}"

Please update ONLY what the user requested, keeping everything else the same. Return the COMPLETE updated component code with all the original structure preserved.`;
                console.log('Using enhanced prompt with existing code as base for edit');
            }
        }

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

        if (loadingOverlay) {
            loadingOverlay.remove();
        }
        if (loadingSpinner) {
            loadingSpinner.remove();
        }

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || `Ошибка: ${response.status} ${response.statusText}`);
        }

        const data = await response.json();
        const generatedCode = data.result || data.code || data.markup || data;
        
        // Отображаем результат (заменяет предыдущий контент)
        displayResult(generatedCode);

        // Вибро-отклик успеха
        tg.HapticFeedback.notificationOccurred('success');

    } catch (error) {
        console.error('Ошибка при отправке запроса:', error);
        
        if (loadingOverlay) {
            loadingOverlay.remove();
        }
        if (loadingSpinner) {
            loadingSpinner.remove();
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
        commentInput.value = '';
    } else {
        tg.HapticFeedback.impactOccurred('light');
    }
}

// Обработчик отправки комментария (Enter)
if (commentInput) {
    commentInput.addEventListener('keydown', async (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            await handleSendMessage();
        }
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

// Обработчик кнопки "Назад"
if (backButton) {
    backButton.addEventListener('click', () => {
        tg.close();
    });
} else {
    console.error('Cannot add event listener: backButton is null');
}

// Загружаем сохраненную HTML при старте
loadSavedHTML();

// Устанавливаем черный фон
document.body.style.backgroundColor = '#000000';
document.body.style.color = '#ffffff';
