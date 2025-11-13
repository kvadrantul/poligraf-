// Vercel Serverless Function для работы с v0.dev API
// Этот файл должен быть в папке /api для работы на Vercel

// Функция для извлечения финального кода из ответа v0.dev
// Убирает thinking часть и оставляет только код
function extractCodeFromResponse(content) {
    if (!content || typeof content !== 'string') {
        return content || '';
    }

    const originalContent = content;

    // Сначала ищем код в markdown code blocks (```language ... ```)
    // Используем глобальный поиск, чтобы найти все блоки
    const codeBlockRegex = /```[\w]*\n?([\s\S]*?)```/g;
    const allCodeBlocks = [];
    let match;
    
    while ((match = codeBlockRegex.exec(content)) !== null) {
        allCodeBlocks.push({
            full: match[0],
            code: match[1].trim(),
            index: match.index
        });
    }

    // Если есть code blocks, берем последний (финальный результат)
    if (allCodeBlocks.length > 0) {
        const lastBlock = allCodeBlocks[allCodeBlocks.length - 1];
        console.log('Found code block, using last one');
        return lastBlock.code;
    }

    // Если нет code blocks, пытаемся убрать thinking и вернуть остальное
    // Убираем thinking блоки (могут быть в разных форматах)
    // Формат 1: <thinking>...</thinking>
    content = content.replace(/<thinking>[\s\S]*?<\/thinking>/gi, '');
    
    // Формат 2: Thinking: ... или [thinking] ... [/thinking]
    content = content.replace(/\[?thinking\]?:?[\s\S]*?\[\/thinking\]?/gi, '');
    
    // Формат 3: Текст "Thinking:" до следующего блока кода или разделителя
    content = content.replace(/thinking:[\s\S]*?(?=```|---|===|\n\n)/gi, '');

    // Если после удаления thinking остался контент, возвращаем его
    const cleaned = content.trim();
    if (cleaned.length > 0 && cleaned !== originalContent.trim()) {
        console.log('Removed thinking, returning cleaned content');
        return cleaned;
    }

    // Если ничего не изменилось, ищем код после разделителей
    const sections = originalContent.split(/\n---+\n|\n===+\n/);
    if (sections.length > 1) {
        const lastSection = sections[sections.length - 1].trim();
        const cleanedSection = lastSection.replace(/^(result|code|final|output):\s*/i, '').trim();
        if (cleanedSection.length > 0) {
            console.log('Found section after separator');
            return cleanedSection;
        }
    }

    // Если ничего не найдено, возвращаем весь контент (для отладки)
    console.log('No code blocks found, returning full content');
    return originalContent.trim();
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
        const { userPrompt, image } = req.body;

        if (!userPrompt) {
            return res.status(400).json({ error: 'userPrompt is required' });
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
            console.log('User prompt length:', userPrompt.length);
            console.log('User prompt preview:', userPrompt.substring(0, 200));
            console.log('Has image:', !!image);
            
            const v0ApiUrl = 'https://api.v0.dev/v1/chat/completions';

            // Формируем контент сообщения пользователя (может быть строкой или массивом с текстом и изображением)
            // Системный промпт уже включен в начало userPrompt на frontend
            let userContent = userPrompt;
            
            // Если есть изображение, формируем массив с текстом и изображением
            if (image) {
                userContent = [
                    {
                        type: 'text',
                        text: userPrompt
                    },
                    {
                        type: 'image_url',
                        image_url: {
                            url: image
                        }
                    }
                ];
                console.log('✅ Image attached to v0.dev API request');
            }
            
            // Формируем сообщения: только пользовательское сообщение (системный промпт уже в начале userPrompt)
            const messages = [
                {
                    role: 'user',
                    content: userContent
                }
            ];
            
            apiResponse = await fetch(v0ApiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`,
                },
                body: JSON.stringify({
                    model: 'v0-1.5-md',
                    messages: messages,
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
            console.log('Full response:', JSON.stringify(data, null, 2));
            
            let rawContent = data.choices?.[0]?.message?.content || 
                           data.choices?.[0]?.message?.text ||
                           'No content generated';
            
            console.log('Raw content length:', rawContent.length);
            console.log('Raw content preview:', rawContent.substring(0, 500));
            
            // Извлекаем только финальный код, убирая thinking часть
            generatedContent = extractCodeFromResponse(rawContent);
            
            console.log('Extracted content length:', generatedContent.length);
            console.log('Extracted content preview:', generatedContent.substring(0, 500));
            
            // Если ничего не извлечено, возвращаем весь контент (для отладки)
            if (!generatedContent || generatedContent.trim().length === 0) {
                console.warn('No code extracted, returning full content');
                generatedContent = rawContent;
            }
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

