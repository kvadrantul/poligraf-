// Vercel Serverless Function для работы с v0.dev API
// Этот файл должен быть в папке /api для работы на Vercel

export default async function handler(req, res) {
    // Разрешаем CORS для Telegram Mini App
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Обработка preflight запроса
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Только POST запросы
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { prompt } = req.body;

        if (!prompt) {
            return res.status(400).json({ error: 'Prompt is required' });
        }

        // Получаем API ключ из переменных окружения
        // На Vercel: Settings -> Environment Variables -> добавить V0_API_KEY
        const apiKey = process.env.V0_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ 
                error: 'V0_API_KEY not configured. Please set it in environment variables.' 
            });
        }

        // Отправляем запрос к v0.dev API согласно документации
        // Документация: https://v0.app/docs/api/model
        // Endpoint: POST https://api.v0.dev/v1/chat/completions
        const v0ApiUrl = 'https://api.v0.dev/v1/chat/completions';

        console.log('Sending request to v0.dev API:', v0ApiUrl);

        const v0Response = await fetch(v0ApiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                model: 'v0-1.5-md', // Модель для генерации UI компонентов
                messages: [
                    {
                        role: 'user',
                        content: prompt
                    }
                ],
                stream: false, // Не используем streaming для простоты
            }),
        });

        console.log(`v0.dev API response status: ${v0Response.status}`);

        if (!v0Response.ok) {
            const errorText = await v0Response.text();
            console.error('v0.dev API error:', {
                status: v0Response.status,
                statusText: v0Response.statusText,
                error: errorText
            });
            
            return res.status(v0Response.status).json({ 
                error: `v0.dev API error: ${v0Response.statusText}`,
                status: v0Response.status,
                details: errorText
            });
        }

        const data = await v0Response.json();
        console.log('v0.dev API response received');

        // Формат ответа согласно документации:
        // {
        //   "choices": [
        //     {
        //       "message": {
        //         "role": "assistant",
        //         "content": "generated code..."
        //       }
        //     }
        //   ]
        // }
        const generatedContent = data.choices?.[0]?.message?.content || 
                                 data.choices?.[0]?.message?.text ||
                                 'No content generated';

        // Возвращаем результат
        return res.status(200).json({
            result: generatedContent,
            code: generatedContent,
            raw: data, // Для отладки
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

