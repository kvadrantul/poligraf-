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
        // Предполагаемый endpoint (нужно проверить в документации)
        const iterateResponse = await fetch(
            `https://api.v0.dev/v1/projects/${projectId}/chats/${chatId}/messages`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    content: prompt,
                    role: 'user'
                }),
            }
        );

        if (!iterateResponse.ok) {
            const errorText = await iterateResponse.text();
            console.error('v0.dev iterate error:', errorText);
            
            return res.status(iterateResponse.status).json({ 
                error: 'Failed to iterate',
                details: errorText
            });
        }

        const responseData = await iterateResponse.json();
        
        // Извлекаем код из ответа
        // Формат ответа может быть разным, нужно адаптировать
        const code = responseData.code || 
                    responseData.content || 
                    responseData.message?.content ||
                    responseData;

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

