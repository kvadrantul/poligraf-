// Vercel Serverless Function для получения контента проекта из v0.dev Platform API
// Контент хранится в файлах проекта, а не в сообщениях чата

export default async function handler(req, res) {
    // Разрешаем CORS для Telegram Mini App
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    if (req.method !== 'GET') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { projectId, chatId } = req.query;

        if (!projectId || !chatId) {
            return res.status(400).json({ 
                error: 'projectId and chatId are required' 
            });
        }

        const apiKey = process.env.V0_API_KEY;

        if (!apiKey) {
            return res.status(500).json({ 
                error: 'V0_API_KEY not configured' 
            });
        }

        // Получаем файлы проекта (контент хранится в файлах, а не в сообщениях)
        console.log('Getting project files:', projectId);
        
        // Пробуем несколько возможных endpoints для получения файлов проекта
        let projectFiles = null;
        let projectData = null;
        
        // Вариант 1: GET /v1/projects/{projectId} - получение информации о проекте
        try {
            const getProjectResponse = await fetch(`https://api.v0.dev/v1/projects/${projectId}`, {
                method: 'GET',
                headers: {
                    'Authorization': `Bearer ${apiKey}`,
                },
            });
            
            if (getProjectResponse.ok) {
                projectData = await getProjectResponse.json();
                console.log('Project data received:', JSON.stringify(projectData, null, 2));
                
                // Проверяем разные возможные поля с файлами
                projectFiles = projectData.files || projectData.data?.files || projectData.content || projectData.data?.content;
            } else {
                const errorText = await getProjectResponse.text();
                console.log('GET /v1/projects/{id} failed:', getProjectResponse.status, errorText);
            }
        } catch (error) {
            console.log('Error getting project:', error.message);
        }
        
        // Вариант 2: GET /v1/projects/{projectId}/files - получение файлов проекта
        if (!projectFiles) {
            try {
                const getFilesResponse = await fetch(`https://api.v0.dev/v1/projects/${projectId}/files`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                    },
                });
                
                if (getFilesResponse.ok) {
                    const filesData = await getFilesResponse.json();
                    console.log('Project files received:', JSON.stringify(filesData, null, 2));
                    projectFiles = filesData.files || filesData.data || filesData;
                } else {
                    const errorText = await getFilesResponse.text();
                    console.log('GET /v1/projects/{id}/files failed:', getFilesResponse.status, errorText);
                }
            } catch (error) {
                console.log('Error getting project files:', error.message);
            }
        }
        
        // Извлекаем код из файлов проекта
        let lastCode = '';
        let hasContent = false;
        
        if (projectFiles && Array.isArray(projectFiles) && projectFiles.length > 0) {
            // Есть файлы - берем последний файл с кодом
            console.log('Found project files:', projectFiles.length);
            
            // Ищем файлы с кодом (обычно .tsx, .ts, .jsx, .js)
            const codeFiles = projectFiles.filter(file => {
                const name = file.name || file.path || file.fileName || '';
                return name.endsWith('.tsx') || name.endsWith('.ts') || name.endsWith('.jsx') || name.endsWith('.js');
            });
            
            if (codeFiles.length > 0) {
                // Берем последний файл (самый свежий)
                const lastFile = codeFiles[codeFiles.length - 1];
                lastCode = lastFile.content || lastFile.code || lastFile.text || lastFile.body || '';
                hasContent = lastCode.length > 0;
                console.log('✅ Found code in project file:', lastFile.name || lastFile.path || lastFile.fileName, 'length:', lastCode.length);
            } else {
                // Нет файлов с кодом - пробуем взять первый файл
                const firstFile = projectFiles[0];
                lastCode = firstFile.content || firstFile.code || firstFile.text || firstFile.body || '';
                hasContent = lastCode.length > 0;
                console.log('Using first file as code:', firstFile.name || firstFile.path || firstFile.fileName, 'length:', lastCode.length);
            }
        } else if (projectFiles && typeof projectFiles === 'object' && !Array.isArray(projectFiles)) {
            // Файлы в виде объекта - пробуем извлечь код
            lastCode = projectFiles.content || projectFiles.code || projectFiles.text || projectFiles.body || '';
            hasContent = lastCode.length > 0;
            console.log('Found code in project data object, length:', lastCode.length);
        }
        
        // Fallback: если не нашли в файлах, пробуем получить из сообщений чата
        if (!hasContent) {
            console.log('No code in project files, trying to get from chat messages (fallback)');
            try {
                const getMessagesResponse = await fetch(`https://api.v0.dev/v1/chats/${chatId}/messages`, {
                    method: 'GET',
                    headers: {
                        'Authorization': `Bearer ${apiKey}`,
                    },
                });

                if (getMessagesResponse.ok) {
                    const messagesData = await getMessagesResponse.json();
                    const messages = messagesData.messages || messagesData.data?.messages || [];
                    
                    // Ищем последнее сообщение от assistant
                    const assistantMessages = messages
                        .filter(msg => msg.role === 'assistant')
                        .reverse();
                    
                    if (assistantMessages.length > 0) {
                        const lastMessage = assistantMessages[0];
                        lastCode = lastMessage.content || '';
                        hasContent = lastCode.length > 0;
                        console.log('Found code in assistant message (fallback), length:', lastCode.length);
                    }
                }
            } catch (error) {
                console.log('Error getting messages (fallback):', error.message);
            }
        }
        
        console.log('Final result:', {
            hasContent: hasContent,
            codeLength: lastCode.length,
            codePreview: lastCode.substring(0, 100),
            source: projectFiles ? 'project_files' : 'chat_messages_fallback'
        });

        return res.status(200).json({
            code: lastCode,
            hasContent: hasContent,
            source: projectFiles ? 'project_files' : (hasContent ? 'chat_messages' : 'none')
        });

    } catch (error) {
        console.error('Error:', error);
        return res.status(500).json({ 
            error: 'Internal server error',
            message: error.message 
        });
    }
}
