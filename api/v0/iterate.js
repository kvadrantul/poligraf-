// Vercel Serverless Function для итерации в чате v0.dev Platform API

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
        const { projectId, chatId, prompt } = req.body;

        if (!projectId || !chatId || !prompt) {
            return res.status(400).json({ 
                error: 'projectId, chatId, and prompt are required' 
            });
        }

        const apiKey = process.env.V0_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ 
                error: 'V0_API_KEY not configured' 
            });
        }

        // Отправляем сообщение в чат (итерация)
        // Согласно документации: POST https://api.v0.dev/v1/chats/:id/messages
        // Увеличиваем таймаут для длительных запросов
        console.log('Sending message to chat:', chatId);
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 280000); // 280 секунд (чуть меньше 300)
        
        const iterateResponse = await fetch(`https://api.v0.dev/v1/chats/${chatId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                message: prompt
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);

        if (!iterateResponse.ok) {
            const errorText = await iterateResponse.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { error: errorText };
            }
            console.error('v0.dev iterate error:', errorData);
            
            return res.status(iterateResponse.status).json({ 
                error: 'Failed to iterate',
                details: errorData
            });
        }

        const responseData = await iterateResponse.json();
        
        // Извлекаем код из ответа
        // Согласно документации, ответ содержит messages с content
        // Нужно найти последнее сообщение от assistant с кодом
        let code = '';
        
        if (responseData.messages && Array.isArray(responseData.messages)) {
            // Ищем последнее сообщение от assistant
            const assistantMessages = responseData.messages
                .filter(msg => msg.role === 'assistant')
                .reverse();
            
            if (assistantMessages.length > 0) {
                const lastMessage = assistantMessages[0];
                code = lastMessage.content || '';
            }
        } else if (responseData.data?.messages) {
            const assistantMessages = responseData.data.messages
                .filter(msg => msg.role === 'assistant')
                .reverse();
            
            if (assistantMessages.length > 0) {
                code = assistantMessages[0].content || '';
            }
        } else {
            // Fallback: ищем код в разных местах
            code = responseData.code || 
                   responseData.content || 
                   responseData.message?.content ||
                   JSON.stringify(responseData);
        }

        return res.status(200).json({
            result: code,
            code: code,
            projectId: projectId,
            chatId: chatId
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

