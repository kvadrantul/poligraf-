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
        // Это создаст файл в проекте
        console.log('Saving code to project:', projectId);
        const saveResponse = await fetch(`https://api.v0.dev/v1/chats/${chatId}/messages`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                message: `Please save this code to the project:\n\n\`\`\`tsx\n${code}\n\`\`\``
            }),
        });

        if (!saveResponse.ok) {
            const errorText = await saveResponse.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { error: errorText };
            }
            console.error('v0.dev save error:', errorData);
            
            return res.status(saveResponse.status).json({ 
                error: 'Failed to save to project',
                details: errorData
            });
        }

        return res.status(200).json({
            success: true,
            message: 'Code saved to project'
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

