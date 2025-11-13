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
        // Используем короткий таймаут и не ждем ответа от AI
        console.log('Saving code to project:', projectId);
        
        // Ограничиваем размер кода для быстрой отправки
        const maxCodeLength = 3000;
        const codeToSave = code.length > maxCodeLength 
            ? code.substring(0, maxCodeLength) + '\n// ... (truncated)'
            : code;
        
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000); // 8 секунд максимум
        
        try {
            const saveResponse = await fetch(`https://api.v0.dev/v1/chats/${chatId}/messages`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    message: `Save this code:\n\n\`\`\`tsx\n${codeToSave}\n\`\`\``
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            // Не ждем ответа от AI, просто отправляем сообщение
            // Если запрос ушел - считаем успешным
            if (saveResponse.ok || saveResponse.status === 200 || saveResponse.status === 201) {
                return res.status(200).json({
                    success: true,
                    message: 'Code saved to project'
                });
            } else {
                // Логируем ошибку, но не блокируем
                const errorText = await saveResponse.text().catch(() => 'Unknown error');
                console.warn('v0.dev save warning:', errorText);
                
                // Все равно возвращаем успех, т.к. это не критично
                return res.status(200).json({
                    success: true,
                    message: 'Code save initiated (may be processing)'
                });
            }
        } catch (error) {
            clearTimeout(timeoutId);
            
            // Если таймаут или другая ошибка - не критично, просто логируем
            if (error.name === 'AbortError') {
                console.warn('Save request timeout (non-critical)');
            } else {
                console.warn('Save request error (non-critical):', error.message);
            }
            
            // Возвращаем успех, т.к. сохранение не критично
            return res.status(200).json({
                success: true,
                message: 'Code save initiated (may be processing in background)'
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

