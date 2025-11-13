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
        // Замените URL на актуальный endpoint v0.dev API
        const v0Response = await fetch('https://api.v0.dev/api/generate', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                prompt: prompt,
                // Добавьте другие параметры если нужно
            }),
        });

        if (!v0Response.ok) {
            const errorText = await v0Response.text();
            console.error('v0.dev API error:', errorText);
            return res.status(v0Response.status).json({ 
                error: `v0.dev API error: ${v0Response.statusText}` 
            });
        }

        const data = await v0Response.json();

        // Возвращаем результат
        return res.status(200).json({
            result: data.code || data.markup || data,
            code: data.code,
            markup: data.markup,
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

