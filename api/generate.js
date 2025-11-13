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
        // Пробуем разные варианты endpoints и методов
        const endpointConfigs = [
            // POST запросы
            {
                url: 'https://v0.dev/api/v1/prompt',
                method: 'POST',
                body: { prompt: prompt },
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                }
            },
            {
                url: 'https://api.v0.dev/v1/prompt',
                method: 'POST',
                body: { prompt: prompt },
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                }
            },
            {
                url: 'https://v0.dev/api/v1/generate',
                method: 'POST',
                body: { prompt: prompt },
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                }
            },
            // GET запросы с query параметрами
            {
                url: `https://v0.dev/api/v1/prompt?prompt=${encodeURIComponent(prompt)}`,
                method: 'GET',
                body: null,
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                }
            },
            // Альтернативный формат авторизации
            {
                url: 'https://v0.dev/api/v1/prompt',
                method: 'POST',
                body: { prompt: prompt },
                headers: {
                    'Content-Type': 'application/json',
                    'X-API-Key': apiKey,
                }
            },
            {
                url: 'https://v0.dev/api/v1/prompt',
                method: 'POST',
                body: { prompt: prompt },
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `v1 ${apiKey}`,
                }
            },
        ];

        let v0Response = null;
        let lastError = null;

        // Пробуем каждый вариант
        for (const config of endpointConfigs) {
            try {
                console.log(`Trying: ${config.method} ${config.url}`);
                
                const fetchOptions = {
                    method: config.method,
                    headers: {
                        ...config.headers,
                        'User-Agent': 'Poligraf-Telegram-MiniApp/1.0',
                    },
                };

                if (config.body) {
                    fetchOptions.body = JSON.stringify(config.body);
                }

                v0Response = await fetch(config.url, fetchOptions);

                console.log(`Response status: ${v0Response.status} for ${config.method} ${config.url}`);

                if (v0Response.ok) {
                    console.log(`Success with: ${config.method} ${config.url}`);
                    break; // Успешный запрос
                } else {
                    const errorText = await v0Response.text();
                    lastError = { 
                        endpoint: config.url,
                        method: config.method,
                        status: v0Response.status, 
                        statusText: v0Response.statusText,
                        error: errorText 
                    };
                    console.error(`Failed: ${config.method} ${config.url}`, lastError);
                }
            } catch (err) {
                lastError = { endpoint: config.url, method: config.method, error: err.message };
                console.error(`Error: ${config.method} ${config.url}`, err.message);
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

