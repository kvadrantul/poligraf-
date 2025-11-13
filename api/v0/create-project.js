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
        // Согласно документации: POST https://api.v0.dev/v1/projects
        console.log('Creating project via v0 Platform API');
        const createProjectResponse = await fetch('https://api.v0.dev/v1/projects', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                name: `Poligraf Project - User ${userId}`
            }),
        });

        if (!createProjectResponse.ok) {
            const errorText = await createProjectResponse.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { error: errorText };
            }
            console.error('v0.dev create project error:', errorData);
            
            return res.status(createProjectResponse.status).json({ 
                error: 'Failed to create project',
                details: errorData
            });
        }

        const projectData = await createProjectResponse.json();
        const projectId = projectData.id || projectData.data?.id;

        if (!projectId) {
            return res.status(500).json({ 
                error: 'Project ID not found in response',
                data: projectData
            });
        }

        // Создаем чат в проекте
        // Согласно документации: POST https://api.v0.dev/v1/chats
        // Используем create() для начала с AI генерацией
        console.log('Creating chat in project:', projectId);
        const createChatResponse = await fetch('https://api.v0.dev/v1/chats', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
            },
            body: JSON.stringify({
                projectId: projectId,
                initialMessage: 'Hello! I\'m ready to help you build components.'
            }),
        });

        if (!createChatResponse.ok) {
            const errorText = await createChatResponse.text();
            let errorData;
            try {
                errorData = JSON.parse(errorText);
            } catch {
                errorData = { error: errorText };
            }
            console.error('v0.dev create chat error:', errorData);
            
            // Возвращаем projectId даже если чат не создан (можно создать позже)
            return res.status(200).json({
                projectId: projectId,
                chatId: null,
                warning: 'Project created but chat creation failed',
                error: errorData
            });
        }

        const chatData = await createChatResponse.json();
        const chatId = chatData.id || chatData.data?.id;

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

