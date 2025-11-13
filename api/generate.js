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

        // Отправляем запрос к v0.dev API
        // Попробуем несколько возможных endpoints
        const endpoints = [
            'https://v0.dev/api/generate',
            'https://api.v0.dev/api/generate',
            'https://v0.dev/api/v1/generate',
        ];

        let v0Response = null;
        let lastError = null;

        // Пробуем каждый endpoint
        for (const endpoint of endpoints) {
            try {
                v0Response = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        prompt: prompt,
                    }),
                });

                if (v0Response.ok) {
                    break; // Успешный запрос
                } else {
                    const errorText = await v0Response.text();
                    lastError = { endpoint, status: v0Response.status, error: errorText };
                    console.log(`Endpoint ${endpoint} failed:`, lastError);
                }
            } catch (err) {
                lastError = { endpoint, error: err.message };
                console.log(`Endpoint ${endpoint} error:`, err.message);
                continue;
            }
        }

        if (!v0Response || !v0Response.ok) {
            const errorText = lastError ? JSON.stringify(lastError) : 'Unknown error';
            console.error('v0.dev API error:', errorText);
            return res.status(v0Response?.status || 500).json({ 
                error: `v0.dev API error`,
                details: lastError
            });
        }

        const data = await v0Response.json();

        // Возвращаем результат
        // v0.dev может возвращать код в разных форматах
        return res.status(200).json({
            result: data.code || data.markup || data.content || data,
            code: data.code,
            markup: data.markup,
            content: data.content,
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

