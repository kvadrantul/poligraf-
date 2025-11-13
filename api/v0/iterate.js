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
        console.log('Sending message to chat:', chatId);
        
        // Отправляем сообщение (может вернуться быстро, но генерация идет асинхронно)
        const sendMessageResponse = await fetch(`https://api.v0.dev/v1/chats/${chatId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                message: prompt
            }),
        });

        if (!sendMessageResponse.ok) {
            const errorText = await sendMessageResponse.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { error: errorText };
            }
            console.error('v0.dev send message error:', errorData);
            
            return res.status(sendMessageResponse.status).json({ 
                error: 'Failed to send message',
                details: errorData
            });
        }

        // Получаем сообщения чата через GET запрос (polling)
        // Ждем появления ответа от assistant
        console.log('Waiting for assistant response...');
        const maxAttempts = 60; // 60 попыток
        const pollInterval = 2000; // 2 секунды между попытками
        let code = '';
        let lastMessageCount = 0;

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            
            const getMessagesResponse = await fetch(`https://api.v0.dev/v1/chats/${chatId}/messages`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                },
            });

            if (!getMessagesResponse.ok) {
                console.error(`Failed to get messages (attempt ${attempt + 1}):`, getMessagesResponse.status);
                continue;
            }

            const messagesData = await getMessagesResponse.json();
            const messages = messagesData.messages || messagesData.data?.messages || [];
            
            // Проверяем, появилось ли новое сообщение от assistant
            const assistantMessages = messages.filter(msg => msg.role === 'assistant');
            
            if (assistantMessages.length > lastMessageCount) {
                // Новое сообщение появилось
                const lastMessage = assistantMessages[assistantMessages.length - 1];
                code = lastMessage.content || '';
                
                // Проверяем, завершена ли генерация (может быть статус или другой индикатор)
                if (code && code.length > 0) {
                    console.log(`Got response after ${attempt + 1} attempts`);
                    break;
                }
            }
            
            lastMessageCount = assistantMessages.length;
            
            // Если прошло много времени без результата, возвращаем что есть
            if (attempt === maxAttempts - 1 && code) {
                console.log('Max attempts reached, returning partial result');
                break;
            }
        }

        // Если не получили код, возвращаем ошибку
        if (!code || code.length === 0) {
            return res.status(408).json({ 
                error: 'Timeout waiting for response',
                note: 'The AI is still generating. Please try again later.'
            });
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

