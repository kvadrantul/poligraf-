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
        // Оптимизированный polling: проверяем, что код не меняется несколько попыток подряд
        console.log('Waiting for assistant response...');
        const maxAttempts = 30; // 30 попыток
        const pollInterval = 1000; // 1 секунда между попытками
        let code = '';
        let lastMessageCount = 0;
        let lastCodeLength = 0;
        let stableCodeAttempts = 0; // Счетчик попыток, когда код не меняется
        const requiredStableAttempts = 3; // Код должен не меняться 3 попытки подряд

        for (let attempt = 0; attempt < maxAttempts; attempt++) {
            await new Promise(resolve => setTimeout(resolve, pollInterval));
            
            try {
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
                    const newCode = lastMessage.content || '';
                    
                    // Проверяем, изменился ли код (генерация продолжается)
                    if (newCode.length > lastCodeLength) {
                        // Код изменился - генерация продолжается
                        code = newCode;
                        lastCodeLength = newCode.length;
                        stableCodeAttempts = 0; // Сбрасываем счетчик стабильности
                        console.log(`Code is growing: ${newCode.length} chars (attempt ${attempt + 1})`);
                    } else if (newCode.length === lastCodeLength && newCode.length > 0) {
                        // Код не изменился - возможно готов
                        stableCodeAttempts++;
                        console.log(`Code is stable: ${newCode.length} chars, stable attempts: ${stableCodeAttempts}/${requiredStableAttempts}`);
                        
                        if (stableCodeAttempts >= requiredStableAttempts && newCode.length > 50) {
                            // Код стабилен несколько попыток подряд - считаем готовым
                            code = newCode;
                            console.log(`Code is ready after ${attempt + 1} attempts (${code.length} chars, stable for ${stableCodeAttempts} attempts)`);
                            break;
                        }
                    }
                } else if (code && code.length > 0) {
                    // Нет новых сообщений, но код уже есть - проверяем стабильность
                    stableCodeAttempts++;
                    if (stableCodeAttempts >= requiredStableAttempts) {
                        console.log(`No new messages, code is stable for ${stableCodeAttempts} attempts, returning`);
                        break;
                    }
                }
                
                lastMessageCount = assistantMessages.length;
                
            } catch (pollError) {
                console.warn(`Polling error (attempt ${attempt + 1}):`, pollError.message);
                continue;
            }
        }

        // Если не получили код, возвращаем ошибку
        if (!code || code.length === 0) {
            return res.status(408).json({ 
                error: 'Timeout waiting for response',
                note: 'The AI is still generating. Please try again later or use Model API for faster generation.'
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

