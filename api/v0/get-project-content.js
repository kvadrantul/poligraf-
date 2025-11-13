// Vercel Serverless Function для получения контента проекта из v0.dev Platform API

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

        // Получаем сообщения из чата
        console.log('Getting messages from chat:', chatId);
        const getMessagesResponse = await fetch(`https://api.v0.dev/v1/chats/${chatId}/messages`, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
            },
        });

        if (!getMessagesResponse.ok) {
            const errorText = await getMessagesResponse.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { error: errorText };
            }
            console.error('v0.dev get messages error:', errorData);
            
            return res.status(getMessagesResponse.status).json({ 
                error: 'Failed to get messages',
                details: errorData
            });
        }

        const messagesData = await getMessagesResponse.json();
        const messages = messagesData.messages || messagesData.data?.messages || [];
        
        console.log('Total messages:', messages.length);
        
        // Ищем последнее сообщение от assistant с кодом
        const assistantMessages = messages
            .filter(msg => msg.role === 'assistant')
            .reverse();
        
        let lastCode = '';
        let hasContent = false;
        
        if (assistantMessages.length > 0) {
            // Есть сообщения от assistant - берем последнее
            const lastMessage = assistantMessages[0];
            lastCode = lastMessage.content || '';
            hasContent = lastCode.length > 0;
            console.log('Found assistant message with code, length:', lastCode.length);
        } else {
            // Нет сообщений от assistant - ищем код в сообщениях пользователя
            // (когда код был сохранен через save-to-project)
            const userMessages = messages
                .filter(msg => msg.role === 'user')
                .reverse();
            
            for (const msg of userMessages) {
                const content = msg.content || '';
                // Ищем код в markdown блоках
                const codeBlockMatch = content.match(/```[\w]*\n?([\s\S]*?)```/);
                if (codeBlockMatch && codeBlockMatch[1]) {
                    lastCode = codeBlockMatch[1].trim();
                    hasContent = lastCode.length > 0;
                    console.log('Found code in user message, length:', lastCode.length);
                    break;
                } else if (content.length > 100 && (content.includes('export') || content.includes('function') || content.includes('const'))) {
                    // Похоже на код без markdown блоков
                    lastCode = content.trim();
                    hasContent = lastCode.length > 0;
                    console.log('Found code-like content in user message, length:', lastCode.length);
                    break;
                }
            }
        }

        return res.status(200).json({
            code: lastCode,
            messagesCount: messages.length,
            hasContent: hasContent
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

