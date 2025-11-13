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
        // Попробуем несколько возможных endpoints и форматов
        const endpoints = [
            {
                url: 'https://v0.dev/api/v1/prompt',
                body: { prompt: prompt }
            },
            {
                url: 'https://api.v0.dev/v1/prompt',
                body: { prompt: prompt }
            },
            {
                url: 'https://v0.dev/api/generate',
                body: { prompt: prompt }
            },
            {
                url: 'https://api.v0.dev/api/generate',
                body: { prompt: prompt }
            },
        ];

        let v0Response = null;
        let lastError = null;

        // Пробуем каждый endpoint
        for (const endpointConfig of endpoints) {
            try {
                console.log(`Trying endpoint: ${endpointConfig.url}`);
                
                v0Response = await fetch(endpointConfig.url, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                        'User-Agent': 'Poligraf-Telegram-MiniApp/1.0',
                    },
                    body: JSON.stringify(endpointConfig.body),
                });

                console.log(`Response status: ${v0Response.status} for ${endpointConfig.url}`);

                if (v0Response.ok) {
                    console.log(`Success with endpoint: ${endpointConfig.url}`);
                    break; // Успешный запрос
                } else {
                    const errorText = await v0Response.text();
                    lastError = { 
                        endpoint: endpointConfig.url, 
                        status: v0Response.status, 
                        statusText: v0Response.statusText,
                        error: errorText 
                    };
                    console.error(`Endpoint ${endpointConfig.url} failed:`, lastError);
                }
            } catch (err) {
                lastError = { endpoint: endpointConfig.url, error: err.message };
                console.error(`Endpoint ${endpointConfig.url} error:`, err.message);
                continue;
            }
        }

        if (!v0Response || !v0Response.ok) {
            const errorDetails = lastError || { message: 'All endpoints failed' };
            console.error('v0.dev API error:', errorDetails);
            return res.status(v0Response?.status || 500).json({ 
                error: `v0.dev API error: ${v0Response?.statusText || 'Unknown error'}`,
                status: v0Response?.status,
                details: errorDetails,
                message: 'Проверьте правильность API ключа и endpoint. Возможно, v0.dev использует другой формат API.'
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

