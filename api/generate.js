// Vercel Serverless Function для работы с v0.dev API
// Этот файл должен быть в папке /api для работы на Vercel

// Функция для извлечения финального кода из ответа v0.dev
// Убирает thinking часть и оставляет только код
function extractCodeFromResponse(content) {
    if (!content || typeof content !== 'string') {
        return content;
    }

    // Убираем thinking блоки (могут быть в разных форматах)
    // Формат 1: <thinking>...</thinking>
    content = content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
    
    // Формат 2: Thinking: ... или [thinking] ... [/thinking]
    content = content.replace(/\[?thinking\]?:?[\s\S]*?\[\/thinking\]?/gi, '');
    
    // Формат 3: Текст "Thinking:" до следующего блока кода
    const thinkingMatch = content.match(/thinking:[\s\S]*?(?=```|$)/i);
    if (thinkingMatch) {
        content = content.replace(thinkingMatch[0], '');
    }

    // Ищем код в markdown code blocks (```language ... ```)
    const codeBlockMatch = content.match(/```[\w]*\n([\s\S]*?)```/);
    if (codeBlockMatch) {
        return codeBlockMatch[1].trim();
    }

    // Ищем код в нескольких code blocks - берем последний (финальный результат)
    const allCodeBlocks = content.match(/```[\w]*\n([\s\S]*?)```/g);
    if (allCodeBlocks && allCodeBlocks.length > 0) {
        const lastBlock = allCodeBlocks[allCodeBlocks.length - 1];
        const lastBlockContent = lastBlock.match(/```[\w]*\n([\s\S]*?)```/);
        if (lastBlockContent) {
            return lastBlockContent[1].trim();
        }
    }

    // Если нет code blocks, ищем код после разделителей
    // Обычно финальный код идет после thinking части
    const sections = content.split(/\n---+\n|\n===+\n/);
    if (sections.length > 1) {
        // Берем последнюю секцию (финальный результат)
        const lastSection = sections[sections.length - 1].trim();
        // Убираем возможные метки типа "Result:", "Code:", "Final:"
        return lastSection.replace(/^(result|code|final|output):\s*/i, '').trim();
    }

    // Если ничего не найдено, возвращаем весь контент, но убираем лишние пробелы
    return content.trim();
}

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
        // Можно использовать либо V0_API_KEY (для v0.dev), либо OPENAI_API_KEY (для OpenAI)
        const v0ApiKey = process.env.V0_API_KEY;
        const openaiApiKey = process.env.OPENAI_API_KEY;

        // Определяем, какой API использовать
        const useOpenAI = !v0ApiKey && openaiApiKey;
        const apiKey = useOpenAI ? openaiApiKey : v0ApiKey;

        if (!apiKey) {
            return res.status(500).json({ 
                error: 'API key not configured. Please set V0_API_KEY or OPENAI_API_KEY in environment variables.',
                note: 'Для v0.dev API нужен Premium или Team план. Можно использовать OpenAI API как альтернативу.'
            });
        }

        let apiResponse;
        let generatedContent;

        if (useOpenAI) {
            // Используем OpenAI API как альтернативу
            console.log('Using OpenAI API');
            const openaiUrl = 'https://api.openai.com/v1/chat/completions';

            apiResponse = await fetch(openaiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'gpt-4o-mini', // Можно использовать gpt-4o, gpt-4-turbo и т.д.
                    messages: [
                        {
                            role: 'system',
                            content: 'You are an expert React/Next.js developer. Generate clean, modern UI components. Return only the code, no explanations.'
                        },
                        {
                            role: 'user',
                            content: `Generate a React component for: ${prompt}`
                        }
                    ],
                    temperature: 0.7,
                }),
            });

            if (!apiResponse.ok) {
                const errorText = await apiResponse.text();
                console.error('OpenAI API error:', {
                    status: apiResponse.status,
                    statusText: apiResponse.statusText,
                    error: errorText
                });
                
                return res.status(apiResponse.status).json({ 
                    error: `OpenAI API error: ${apiResponse.statusText}`,
                    status: apiResponse.status,
                    details: errorText
                });
            }

            const data = await apiResponse.json();
            generatedContent = data.choices?.[0]?.message?.content || 'No content generated';

        } else {
            // Используем v0.dev API
            console.log('Using v0.dev API');
            const v0ApiUrl = 'https://api.v0.dev/v1/chat/completions';

            apiResponse = await fetch(v0ApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'v0-1.5-md',
                    messages: [
                        {
                            role: 'user',
                            content: prompt
                        }
                    ],
                    stream: false,
                }),
            });

            console.log(`v0.dev API response status: ${apiResponse.status}`);

            if (!apiResponse.ok) {
                const errorText = await apiResponse.text();
                let errorData;
                try {
                    errorData = JSON.parse(errorText);
                } catch {
                    errorData = { error: errorText };
                }

                console.error('v0.dev API error:', {
                    status: apiResponse.status,
                    statusText: apiResponse.statusText,
                    error: errorData
                });

                // Если ошибка 403 - нужна подписка или она еще активируется
                if (apiResponse.status === 403) {
                    return res.status(403).json({ 
                        error: 'Premium or Team plan required',
                        message: 'Для использования v0.dev API нужен Premium или Team план. Если вы только что оплатили подписку, подождите несколько минут для активации. Также убедитесь, что в настройках v0.dev включен "usage-based billing".',
                        details: errorData,
                        help: 'Проверьте: https://v0.app/chat/settings/billing'
                    });
                }
                
                return res.status(apiResponse.status).json({ 
                    error: `v0.dev API error: ${apiResponse.statusText}`,
                    status: apiResponse.status,
                    details: errorData
                });
            }

            const data = await apiResponse.json();
            console.log('v0.dev API response received');
            
            let rawContent = data.choices?.[0]?.message?.content || 
                           data.choices?.[0]?.message?.text ||
                           'No content generated';
            
            // Извлекаем только финальный код, убирая thinking часть
            generatedContent = extractCodeFromResponse(rawContent);
        }

        // Возвращаем результат
        return res.status(200).json({
            result: generatedContent,
            code: generatedContent,
            provider: useOpenAI ? 'openai' : 'v0.dev'
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

