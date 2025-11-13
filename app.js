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
const imageUploadButton = document.getElementById('imageUploadButton');
const imageInput = document.getElementById('imageInput');
const imagePreview = document.getElementById('imagePreview');
const previewImage = document.getElementById('previewImage');
const removeImageButton = document.getElementById('removeImageButton');
const resultArea = document.querySelector('.result-area');

// Переменная для хранения загруженного изображения (base64)
let uploadedImageBase64 = null;

// Проверяем, что элементы найдены
if (!commentInput) {
    console.error('commentInput not found!');
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
    
    const codeText = typeof result === 'string' ? result : (result.code || result.markup || JSON.stringify(result, null, 2));
    
    // Валидация: проверяем, что результат не пустой
    if (!codeText || codeText.trim().length < 10) {
        console.error('⚠️ Empty or invalid result received');
        resultContent.innerHTML = '<div class="error-message">Получен пустой результат. Попробуйте еще раз.</div>';
        return;
    }
    
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

// Системный промпт для полиграфии (добавляется в начало каждого запроса)
// Упрощенная версия для лучшей работы с изображениями
const SYSTEM_PROMPT = `Ты — эксперт по дизайну полиграфической продукции. Создавай макеты для печати: открытки, визитки, буклеты, плакаты, календари, этикетки.

ВАЖНО: 
- НЕ создавай веб-элементы (навигация, футеры, кнопки для клика)
- НЕ используй "lorem ipsum" — только реальный текст
- Используй 2-3 шрифта, гармоничные цвета для печати, активное белое пространство
- Добавляй графические элементы и декоративные детали
- Макет должен быть готов к отправке в типографию

Верни React/TSX компонент с готовым дизайном.`;

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

        // Формируем промпт пользователя (без системного промпта)
        const htmlKey = `poligraf-last-html-${userId}`;
        const lastHTML = localStorage.getItem(htmlKey);
        
        let userPrompt = prompt;
        
        // Если есть сохраненная разметка - используем её как референс
        if (lastHTML && lastHTML.length > 100) {
            // Проверяем, что HTML валидный (не пустой div)
            const isValidHTML = lastHTML.includes('<div') || 
                               lastHTML.includes('<span') || 
                               lastHTML.includes('<p') ||
                               lastHTML.includes('class=') ||
                               lastHTML.length > 500;
            
            if (isValidHTML) {
                const maxHtmlLength = 10000;
                const truncatedHTML = lastHTML.length > maxHtmlLength 
                    ? lastHTML.substring(0, maxHtmlLength) + '\n<!-- ... (HTML truncated) -->'
                    : lastHTML;
                
                // Формируем промпт: "возьми за основу вот этот HTML и сделай [промпт пользователя]"
                userPrompt = `возьми за основу вот этот HTML:

\`\`\`html
${truncatedHTML}
\`\`\`

и сделай ${prompt}`;
                
                console.log('✅ Using saved HTML as reference');
                console.log('  - HTML length:', truncatedHTML.length);
                console.log('  - Prompt:', prompt);
            } else {
                console.warn('⚠️ Saved HTML appears invalid, ignoring it');
            }
        } else {
            console.log('📝 New generation (no saved markup)');
        }
        
        // Если есть изображение, добавляем упоминание о нём
        if (uploadedImageBase64) {
            userPrompt += '\n\nСмотри на такой референс который я прикрепил в изображении.';
            console.log('✅ Image reference mentioned in prompt');
        }

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 55000);

        const response = await fetch(API_GENERATE, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({ 
                systemPrompt: SYSTEM_PROMPT,
                userPrompt: userPrompt,
                image: uploadedImageBase64 || null
            }),
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


// Обработчик кнопки "Новый"
if (newButton) {
    newButton.addEventListener('click', () => {
        clearAll();
    });
} else {
    console.error('Cannot add event listener: newButton is null');
}

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
