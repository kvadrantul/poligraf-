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
// ⚠️ ВАЖНО: Замените на URL вашего backend после настройки!
// Для GitHub Pages нужен внешний backend (Vercel/Netlify), так как GitHub Pages не поддерживает serverless functions
const API_ENDPOINT = 'https://your-backend.vercel.app/api/generate'; // Замените на ваш URL!
// Или для локального тестирования: 'http://localhost:3000/api/generate'

// История результатов (для отображения всех результатов в одном проекте)
let resultsHistory = [];

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
    
    // Если результат содержит код (JSX/TSX), отображаем с подсветкой
    if (result.code || result.markup) {
        const codeBlock = document.createElement('pre');
        codeBlock.className = 'code-block';
        codeBlock.textContent = result.code || result.markup || result;
        resultItem.appendChild(codeBlock);
    } else {
        // Обычный текст
        const textElement = document.createElement('div');
        textElement.className = 'result-text';
        textElement.textContent = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
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
    try {
        // Показываем индикатор загрузки
        sendButton.disabled = true;
        sendButton.textContent = 'Отправка...';
        
        // Показываем загрузку в области результата
        const loadingIndicator = document.createElement('div');
        loadingIndicator.className = 'loading-indicator';
        loadingIndicator.textContent = 'Генерация...';
        resultContent.appendChild(loadingIndicator);
        resultContent.scrollTop = resultContent.scrollHeight;

        // Отправляем запрос к backend
        const response = await fetch(API_ENDPOINT, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                prompt: prompt
            })
        });

        // Убираем индикатор загрузки
        loadingIndicator.remove();

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
        const loadingIndicator = resultContent.querySelector('.loading-indicator');
        if (loadingIndicator) {
            loadingIndicator.remove();
        }

        // Показываем ошибку
        const errorElement = document.createElement('div');
        errorElement.className = 'error-message';
        errorElement.textContent = `Ошибка: ${error.message}`;
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

