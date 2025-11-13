// Vercel Serverless Function для создания проекта в v0.dev Platform API

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
        const { userId } = req.body;

        if (!userId) {
            return res.status(400).json({ error: 'userId is required' });
        }

        const apiKey = process.env.V0_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ 
                error: 'V0_API_KEY not configured' 
            });
        }

        // Создаем проект через v0 Platform API
        // Пробуем разные возможные endpoints
        const endpoints = [
            'https://api.v0.dev/v1/projects',
            'https://v0.dev/api/v1/projects',
            'https://api.v0.dev/v1/platform/projects',
        ];

        let createProjectResponse = null;
        let lastError = null;

        for (const endpoint of endpoints) {
            try {
                console.log(`Trying to create project at: ${endpoint}`);
                createProjectResponse = await fetch(endpoint, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${apiKey}`,
                    },
                    body: JSON.stringify({
                        name: `Poligraf Project - User ${userId}`,
                        description: 'Telegram Mini App project'
                    }),
                });

                if (createProjectResponse.ok) {
                    console.log(`Success with endpoint: ${endpoint}`);
                    break;
                } else {
                    const errorText = await createProjectResponse.text();
                    lastError = { endpoint, status: createProjectResponse.status, error: errorText };
                    console.log(`Failed with ${endpoint}:`, lastError);
                }
            } catch (err) {
                lastError = { endpoint, error: err.message };
                console.log(`Error with ${endpoint}:`, err.message);
                continue;
            }
        }

        if (!createProjectResponse || !createProjectResponse.ok) {
            const errorText = lastError ? JSON.stringify(lastError) : 'Unknown error';
            console.error('v0.dev create project error:', errorText);
            
            return res.status(createProjectResponse?.status || 500).json({ 
                error: 'Failed to create project',
                details: lastError,
                note: 'Возможно, используется неправильный endpoint. Проверьте документацию v0 Platform API.'
            });
        }

        if (!createProjectResponse.ok) {
            const errorText = await createProjectResponse.text();
            console.error('v0.dev create project error:', errorText);
            
            // Если проект уже существует или другая ошибка
            return res.status(createProjectResponse.status).json({ 
                error: 'Failed to create project',
                details: errorText
            });
        }

        const projectData = await createProjectResponse.json();
        const projectId = projectData.id || projectData.projectId;

        if (!projectId) {
            return res.status(500).json({ 
                error: 'Project ID not found in response',
                data: projectData
            });
        }

        // Создаем чат в проекте
        const createChatResponse = await fetch(`https://api.v0.dev/v1/projects/${projectId}/chats`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                name: 'Main Chat'
            }),
        });

        if (!createChatResponse.ok) {
            const errorText = await createChatResponse.text();
            console.error('v0.dev create chat error:', errorText);
            
            // Возвращаем projectId даже если чат не создан (можно создать позже)
            return res.status(200).json({
                projectId: projectId,
                chatId: null,
                warning: 'Project created but chat creation failed'
            });
        }

        const chatData = await createChatResponse.json();
        const chatId = chatData.id || chatData.chatId;

        return res.status(200).json({
            projectId: projectId,
            chatId: chatId,
            userId: userId
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}

