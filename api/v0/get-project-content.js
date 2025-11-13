// Vercel Serverless Function для получения контента проекта из v0.dev Platform API
// Получаем последний сгенерированный код из чата (как при генерации через Model API)

export default async function handler(req, res) {
    // Разрешаем CORS для Telegram Mini App
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { projectId, chatId } = req.query;

        if (!projectId || !chatId) {
            return res.status(400).json({ 
                error: 'projectId and chatId are required' 
            });
        }

        const apiKey = process.env.V0_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ 
                error: 'V0_API_KEY not configured' 
            });
        }

        console.log('Getting chat content:', { projectId, chatId });
        
        // Основной способ: получаем информацию о чате
        // Согласно документации: GET /v1/chats/:id
        let chatData = null;
        let lastCode = '';
        let hasContent = false;
        
        try {
            const getChatResponse = await fetch(`https://api.v0.dev/v1/chats/${chatId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                },
            });
            
            if (getChatResponse.ok) {
                chatData = await getChatResponse.json();
                console.log('Chat data received:', JSON.stringify(chatData, null, 2));
                
                // Проверяем разные возможные поля с кодом
                // Может быть latestVersion, currentVersion, content, code и т.д.
                if (chatData.latestVersion) {
                    const version = chatData.latestVersion;
                    lastCode = version.content || version.code || version.files?.[0]?.content || '';
                    hasContent = lastCode.length > 0;
                    console.log('Found code in latestVersion, length:', lastCode.length);
                } else if (chatData.currentVersion) {
                    const version = chatData.currentVersion;
                    lastCode = version.content || version.code || version.files?.[0]?.content || '';
                    hasContent = lastCode.length > 0;
                    console.log('Found code in currentVersion, length:', lastCode.length);
                } else if (chatData.content) {
                    lastCode = chatData.content;
                    hasContent = lastCode.length > 0;
                    console.log('Found code in chat.content, length:', lastCode.length);
                } else if (chatData.code) {
                    lastCode = chatData.code;
                    hasContent = lastCode.length > 0;
                    console.log('Found code in chat.code, length:', lastCode.length);
                }
            } else {
                const errorText = await getChatResponse.text();
                console.log('GET /v1/chats/{id} failed:', getChatResponse.status, errorText);
            }
        } catch (error) {
            console.log('Error getting chat:', error.message);
        }
        
        // Fallback: получаем сообщения из чата и ищем последний код от assistant
        if (!hasContent) {
            console.log('No code in chat data, trying to get from messages');
            try {
                const getMessagesResponse = await fetch(`https://api.v0.dev/v1/chats/${chatId}/messages`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                    },
                });

                if (getMessagesResponse.ok) {
                    const messagesData = await getMessagesResponse.json();
                    const messages = messagesData.messages || messagesData.data?.messages || [];
                    
                    console.log('Total messages:', messages.length);
                    
                    // Ищем последнее сообщение от assistant с кодом
                    const assistantMessages = messages
                        .filter(msg => msg.role === 'assistant')
                        .reverse();
                    
                    if (assistantMessages.length > 0) {
                        const lastMessage = assistantMessages[0];
                        const content = lastMessage.content || '';
                        
                        // Извлекаем код из markdown блоков (как в Model API)
                        const codeBlockMatch = content.match(/```[\w]*\n?([\s\S]*?)```/);
                        if (codeBlockMatch && codeBlockMatch[1]) {
                            lastCode = codeBlockMatch[1].trim();
                            hasContent = lastCode.length > 0;
                            console.log('✅ Found code in assistant message markdown block, length:', lastCode.length);
                        } else if (content.length > 50) {
                            // Если нет markdown блоков, но есть контент - используем его
                            lastCode = content.trim();
                            hasContent = lastCode.length > 0;
                            console.log('✅ Found code in assistant message (no markdown), length:', lastCode.length);
                        }
                    }
                } else {
                    const errorText = await getMessagesResponse.text();
                    console.log('GET /v1/chats/{id}/messages failed:', getMessagesResponse.status, errorText);
                }
            } catch (error) {
                console.log('Error getting messages:', error.message);
            }
        }
        
        console.log('Final result:', {
            hasContent: hasContent,
            codeLength: lastCode.length,
            codePreview: lastCode.substring(0, 100),
            source: chatData ? 'chat_data' : 'messages'
        });

        return res.status(200).json({
            code: lastCode,
            hasContent: hasContent,
            source: chatData ? 'chat_data' : (hasContent ? 'messages' : 'none')
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}
