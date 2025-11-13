// Vercel Serverless Function для сохранения результата Model API в Platform API проект

export default async function handler(req, res) {
    // Разрешаем CORS для Telegram Mini App
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { projectId, chatId, code } = req.body;

        if (!projectId || !chatId || !code) {
            return res.status(400).json({ 
                error: 'projectId, chatId, and code are required' 
            });
        }

        const apiKey = process.env.V0_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ 
                error: 'V0_API_KEY not configured' 
            });
        }

        // Сохраняем код в проект через отправку сообщения в чат
        // Пробуем более короткий и простой формат сообщения
        console.log('Saving code to project:', projectId);
        
        // Ограничиваем размер кода - возможно проблема в длине
        // v0.dev может иметь лимит на длину сообщения
        const maxCodeLength = 2000; // Уменьшили до 2000 символов
        const codeToSave = code.length > maxCodeLength 
            ? code.substring(0, maxCodeLength) + '\n// ... (code truncated for saving)'
            : code;
        
            // Отправляем код как сообщение пользователя с просьбой сохранить
            // Формат: просто код в markdown блоке, без лишних слов
            const saveMessage = `\`\`\`tsx\n${codeToSave}\n\`\`\``;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000); // 5 секунд максимум
        
        try {
            const saveResponse = await fetch(`https://api.v0.dev/v1/chats/${chatId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    message: saveMessage
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // Проверяем статус ответа
            if (saveResponse.ok) {
                console.log('Code save request sent successfully');
                return res.status(200).json({
                    success: true,
                    message: 'Code save request sent'
                });
            } else {
                // Получаем детали ошибки
                const errorText = await saveResponse.text().catch(() => 'Unknown error');
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch {
                    errorData = { error: errorText };
                }
                
                console.warn('v0.dev save error:', {
                    status: saveResponse.status,
                    error: errorData
                });
                
                // Возвращаем ошибку, но не критичную
                return res.status(200).json({
                    success: false,
                    message: 'Code save request failed',
                    error: errorData,
                    note: 'Code is still available in the app, but may not be saved to project'
                });
            }
        } catch (error) {
            clearTimeout(timeoutId);
            
            console.warn('Save request error:', error.message);
            
            // Возвращаем ошибку, но не критичную
            return res.status(200).json({
                success: false,
                message: 'Code save request failed',
                error: error.message,
                note: 'Code is still available in the app'
            });
        }

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

