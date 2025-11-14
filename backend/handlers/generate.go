package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"regexp"
	"strings"

	"github.com/gin-gonic/gin"
)

// Request структура для входящего запроса
type GenerateRequest struct {
	UserPrompt string `json:"userPrompt" binding:"required"`
	Image      string `json:"image,omitempty"`
	Provider   string `json:"provider"`
}

// Response структура для ответа
type GenerateResponse struct {
	Result   string `json:"result"`
	Code     string `json:"code"`
	Provider string `json:"provider"`
}

// ErrorResponse структура для ошибок
type ErrorResponse struct {
	Error   string `json:"error"`
	Status  int    `json:"status,omitempty"`
	Details string `json:"details,omitempty"`
	Note    string `json:"note,omitempty"`
	Help    string `json:"help,omitempty"`
	Message string `json:"message,omitempty"`
}

// handleGenerate обрабатывает запрос на генерацию
func HandleGenerate(c *gin.Context) {
	var req GenerateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error: "userPrompt is required",
		})
		return
	}

	// Устанавливаем provider по умолчанию
	if req.Provider == "" {
		req.Provider = "v0"
	}

	log.Printf("📡 Request provider: %s", req.Provider)

	// Получаем API ключи из переменных окружения
	v0ApiKey := os.Getenv("V0_API_KEY")
	lovableApiKey := os.Getenv("LOVABLE_API_KEY")
	openaiApiKey := os.Getenv("OPENAI_API_KEY")

	var apiKey string
	var useOpenAI, useLovable bool

	// Определяем, какой API использовать
	if req.Provider == "lovable" && lovableApiKey != "" {
		useLovable = true
		apiKey = lovableApiKey
		log.Println("✅ Using Lovable API")
	} else if req.Provider == "v0" && v0ApiKey != "" {
		apiKey = v0ApiKey
		log.Println("✅ Using v0.dev API")
	} else if v0ApiKey == "" && openaiApiKey != "" {
		useOpenAI = true
		apiKey = openaiApiKey
		log.Println("⚠️ Using OpenAI API as fallback")
	} else if req.Provider == "lovable" && v0ApiKey != "" {
		log.Println("⚠️ Lovable API key not found, falling back to v0.dev")
		apiKey = v0ApiKey
	} else {
		providerName := "LOVABLE_API_KEY"
		if req.Provider == "v0" {
			providerName = "V0_API_KEY"
		}
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error: fmt.Sprintf("API key not configured for provider: %s. Please set %s in environment variables.", req.Provider, providerName),
			Note:  "Для v0.dev API нужен Premium или Team план. Можно использовать OpenAI API как альтернативу.",
		})
		return
	}

	if apiKey == "" {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error: "API key not configured. Please set V0_API_KEY or OPENAI_API_KEY in environment variables.",
			Note:  "Для v0.dev API нужен Premium или Team план. Можно использовать OpenAI API как альтернативу.",
		})
		return
	}

	var generatedContent string
	var err error

	if useOpenAI {
		generatedContent, err = callOpenAI(apiKey, req.UserPrompt)
	} else if useLovable {
		generatedContent, err = callLovable(apiKey, req.UserPrompt, req.Image)
	} else {
		generatedContent, err = callV0(apiKey, req.UserPrompt, req.Image)
	}

	if err != nil {
		log.Printf("Error calling API: %v", err)
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error: err.Error(),
		})
		return
	}

	// Извлекаем код из ответа
	log.Printf("📦 Raw generated content length: %d chars", len(generatedContent))
	previewLen := 300
	if len(generatedContent) < previewLen {
		previewLen = len(generatedContent)
	}
	if previewLen > 0 {
		log.Printf("📦 Raw generated content preview (first %d chars): %s", previewLen, generatedContent[:previewLen])
	}

	extractedCode := extractCodeFromResponse(generatedContent)
	log.Printf("📦 Extracted code length: %d chars", len(extractedCode))

	if extractedCode == "" {
		log.Println("⚠️ Extracted code is empty, using raw content")
		extractedCode = generatedContent
	}

	if len(extractedCode) < 10 {
		log.Printf("⚠️ Extracted code is very short (%d chars), may be invalid", len(extractedCode))
	}

	provider := "v0.dev"
	if useOpenAI {
		provider = "openai"
	} else if useLovable {
		provider = "lovable"
	}

	c.JSON(http.StatusOK, GenerateResponse{
		Result:   extractedCode,
		Code:     extractedCode,
		Provider: provider,
	})
}

// callV0 вызывает v0.dev API
func callV0(apiKey, userPrompt, image string) (string, error) {
	log.Printf("Using v0.dev API")
	log.Printf("User prompt length: %d", len(userPrompt))

	v0ApiUrl := "https://api.v0.dev/v1/chat/completions"

	// Формируем контент сообщения
	var userContent interface{} = userPrompt

	// Если есть изображение, формируем массив
	if image != "" {
		imageSize := len(image)
		log.Printf("📷 Image size: %d chars (%.2f MB)", imageSize, float64(imageSize)/1024/1024)

		// Проверяем размер изображения (v0.dev может иметь лимиты)
		if imageSize > 10*1024*1024 { // 10MB лимит
			log.Printf("⚠️ Image size exceeds 10MB, may cause issues with v0.dev API")
		}

		userContent = []map[string]interface{}{
			{
				"type": "text",
				"text": userPrompt,
			},
			{
				"type": "image_url",
				"image_url": map[string]interface{}{
					"url": image,
				},
			},
		}
		log.Println("✅ Image attached to v0.dev API request")
	}

	// Формируем запрос
	// Проверяем, есть ли системный промпт в начале userPrompt
	// Если есть, выделяем его в отдельное system сообщение для лучшей работы модели
	messages := []map[string]interface{}{}

	// Проверяем наличие системного промпта (начинается с "Ты веб дизайнер")
	if strings.HasPrefix(userPrompt, "Ты веб дизайнер") {
		// Ищем конец системного промпта
		// Системный промпт заканчивается перед "возьми за основу" или перед пользовательским промптом
		systemPromptEnd := -1

		// Ищем различные маркеры конца системного промпта
		markers := []string{
			"\n\nвозьми за основу",
			"\n\nи сделай",
			"\n\nВерни ТОЛЬКО",
		}

		for _, marker := range markers {
			if idx := strings.Index(userPrompt, marker); idx > 0 {
				systemPromptEnd = idx
				break
			}
		}

		if systemPromptEnd > 0 {
			systemPrompt := strings.TrimSpace(userPrompt[:systemPromptEnd])
			userPromptOnly := strings.TrimSpace(userPrompt[systemPromptEnd+2:])

			// Добавляем system сообщение
			messages = append(messages, map[string]interface{}{
				"role":    "system",
				"content": systemPrompt,
			})

			// Обновляем userContent с только user промптом
			if image != "" {
				userContent = []map[string]interface{}{
					{
						"type": "text",
						"text": userPromptOnly,
					},
					{
						"type": "image_url",
						"image_url": map[string]interface{}{
							"url": image,
						},
					},
				}
			} else {
				userContent = userPromptOnly
			}

			log.Println("✅ System prompt extracted and sent as separate message")
			log.Printf("System prompt length: %d", len(systemPrompt))
			log.Printf("User prompt length: %d", len(userPromptOnly))
		}
	}

	// Если системный промпт не был выделен, используем весь userPrompt как есть
	if len(messages) == 0 {
		messages = append(messages, map[string]interface{}{
			"role":    "user",
			"content": userContent,
		})
	} else {
		// Добавляем user сообщение после system
		messages = append(messages, map[string]interface{}{
			"role":    "user",
			"content": userContent,
		})
	}

	requestBody := map[string]interface{}{
		"model":    "v0-1.5-md",
		"messages": messages,
		"stream":   false,
	}

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	// Создаем HTTP запрос
	req, err := http.NewRequest("POST", v0ApiUrl, strings.NewReader(string(jsonData)))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	// Выполняем запрос
	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	log.Printf("v0.dev API response status: %d", resp.StatusCode)

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("v0.dev API error: %s", string(body))

		if resp.StatusCode == 403 {
			var errorData map[string]interface{}
			json.Unmarshal(body, &errorData)
			return "", fmt.Errorf("Premium or Team plan required. Проверьте: https://v0.app/chat/settings/billing")
		}

		return "", fmt.Errorf("v0.dev API error: %s", resp.Status)
	}

	// Парсим ответ
	var response struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
				Text    string `json:"text"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		bodyBytes, _ := io.ReadAll(resp.Body)
		log.Printf("❌ Failed to decode v0.dev response: %v", err)
		bodyLen := len(string(bodyBytes))
		previewLen := 500
		if bodyLen < previewLen {
			previewLen = bodyLen
		}
		if previewLen > 0 {
			log.Printf("Response body (first %d chars): %s", previewLen, string(bodyBytes)[:previewLen])
		}
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	if len(response.Choices) == 0 {
		log.Println("❌ No choices in v0.dev response")
		log.Printf("📋 Full response structure: %+v", response)
		return "", fmt.Errorf("no content generated")
	}

	content := response.Choices[0].Message.Content
	if content == "" {
		content = response.Choices[0].Message.Text
	}
	if content == "" {
		log.Println("❌ Empty content in v0.dev response")
		log.Printf("📋 Choice structure: %+v", response.Choices[0])
		return "", fmt.Errorf("no content generated")
	}

	log.Printf("✅ v0.dev API response received: %d chars", len(content))
	previewLen := 500
	if len(content) < previewLen {
		previewLen = len(content)
	}
	if previewLen > 0 {
		log.Printf("📋 Content preview (first %d chars): %s", previewLen, content[:previewLen])
	}

	// Проверяем, есть ли код в ответе
	if strings.Contains(content, "```") {
		log.Println("✅ Content contains code blocks")
	} else {
		log.Println("⚠️ Content does not contain code blocks - may be plain text")
	}

	// Проверяем, не обрезана ли base64 строка в backgroundImage
	if strings.Contains(content, "backgroundImage") {
		// Ищем все вхождения backgroundImage
		backgroundImageRegex := regexp.MustCompile(`backgroundImage:\s*\` + "`" + `url\(['"](data:image[^'"]*?)(?:['"]\)` + "`" + `|$)`)
		matches := backgroundImageRegex.FindAllStringSubmatch(content, -1)
		for i, match := range matches {
			if len(match) > 1 {
				urlPart := match[1]
				log.Printf("📷 backgroundImage #%d: length=%d, ends with '...'=%v", i+1, len(urlPart), strings.HasSuffix(urlPart, "..."))
				if len(urlPart) > 100 {
					log.Printf("📷 backgroundImage #%d preview (first 100): %s", i+1, urlPart[:100])
					log.Printf("📷 backgroundImage #%d preview (last 100): %s", i+1, urlPart[len(urlPart)-100:])
				}
				// Проверяем, закрыт ли template literal
				if !strings.Contains(match[0], "`") {
					log.Printf("⚠️ backgroundImage #%d: template literal not closed!", i+1)
				}
			}
		}
	}

	return content, nil
}

// callOpenAI вызывает OpenAI API (fallback)
func callOpenAI(apiKey, prompt string) (string, error) {
	log.Println("Using OpenAI API")

	openaiUrl := "https://api.openai.com/v1/chat/completions"

	requestBody := map[string]interface{}{
		"model": "gpt-4o-mini",
		"messages": []map[string]interface{}{
			{
				"role":    "system",
				"content": "You are an expert React/Next.js developer. Generate clean, modern UI components. Return only the code, no explanations.",
			},
			{
				"role":    "user",
				"content": fmt.Sprintf("Generate a React component for: %s", prompt),
			},
		},
		"temperature": 0.7,
	}

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", openaiUrl, strings.NewReader(string(jsonData)))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+apiKey)

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		return "", fmt.Errorf("failed to send request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("OpenAI API error: %s - %s", resp.Status, string(body))
	}

	var response struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	if len(response.Choices) == 0 {
		return "", fmt.Errorf("no content generated")
	}

	return response.Choices[0].Message.Content, nil
}

// callLovable вызывает Lovable API (TODO: уточнить формат)
func callLovable(apiKey, userPrompt, image string) (string, error) {
	log.Println("Using Lovable API")
	// TODO: Реализовать когда будет известен формат API
	return "", fmt.Errorf("Lovable API not yet implemented")
}

// extractCodeFromResponse извлекает код из ответа, убирая thinking блоки
func extractCodeFromResponse(content string) string {
	if content == "" {
		return ""
	}

	originalContent := content

	// Ищем код в markdown code blocks (```language ... ```)
	// Используем более надежный regex, который ищет закрывающие ``` даже если контент очень длинный
	codeBlockRegex := regexp.MustCompile("(?s)```[\\w]*\\n?(.*?)```")
	matches := codeBlockRegex.FindAllStringSubmatch(content, -1)

	// Если есть code blocks, берем последний (финальный результат)
	if len(matches) > 0 {
		lastMatch := matches[len(matches)-1]
		if len(lastMatch) > 1 {
			extracted := strings.TrimSpace(lastMatch[1])
			log.Printf("Found code block, using last one (length: %d chars)", len(extracted))
			return extracted
		}
	}

	// Альтернативный метод: ищем первый ``` и последний ```, если regex не сработал
	if strings.Contains(content, "```") {
		firstIdx := strings.Index(content, "```")
		if firstIdx >= 0 {
			// Пропускаем открывающий ```
			afterFirst := content[firstIdx+3:]
			// Ищем следующий ``` после первого
			nextIdx := strings.Index(afterFirst, "```")
			if nextIdx > 0 {
				// Извлекаем код между первым и последним ```
				codePart := afterFirst[:nextIdx]
				// Убираем язык (tsx, jsx, и т.д.) если есть
				codePart = strings.TrimSpace(codePart)
				if strings.HasPrefix(codePart, "tsx\n") || strings.HasPrefix(codePart, "jsx\n") || strings.HasPrefix(codePart, "js\n") {
					codePart = codePart[strings.Index(codePart, "\n")+1:]
				}
				log.Printf("Found code block using alternative method (length: %d chars)", len(codePart))
				return strings.TrimSpace(codePart)
			}
		}
	}

	// Убираем thinking блоки
	// Формат 1: <thinking>...</thinking>
	thinkingRegex1 := regexp.MustCompile("(?i)<thinking>.*?</thinking>")
	content = thinkingRegex1.ReplaceAllString(content, "")

	// Формат 2: [thinking] ... [/thinking]
	thinkingRegex2 := regexp.MustCompile("(?i)\\[?thinking\\]?:?.*?\\[/thinking\\]?")
	content = thinkingRegex2.ReplaceAllString(content, "")

	// Формат 3: Thinking: ... до следующего блока (без lookahead, т.к. Go не поддерживает)
	// Ищем "thinking:" и удаляем до следующего блока кода или разделителя
	thinkingRegex3 := regexp.MustCompile("(?i)thinking:.*?(```|---|===|\\n\\n)")
	content = thinkingRegex3.ReplaceAllString(content, "$1") // Оставляем только разделитель

	// Если после удаления thinking остался контент, возвращаем его
	cleaned := strings.TrimSpace(content)
	if cleaned != "" && cleaned != strings.TrimSpace(originalContent) {
		log.Println("Removed thinking, returning cleaned content")
		return cleaned
	}

	// Если ничего не изменилось, ищем код после разделителей
	separatorRegex := regexp.MustCompile("\\n-{3,}\\n|\\n={3,}\\n")
	sections := separatorRegex.Split(originalContent, -1)
	if len(sections) > 1 {
		lastSection := strings.TrimSpace(sections[len(sections)-1])
		prefixRegex := regexp.MustCompile("(?i)^(result|code|final|output):\\s*")
		cleanedSection := prefixRegex.ReplaceAllString(lastSection, "")
		if cleanedSection != "" {
			log.Println("Found section after separator")
			return strings.TrimSpace(cleanedSection)
		}
	}

	// Если ничего не найдено, возвращаем весь контент
	log.Println("No code blocks found, returning full content")
	return strings.TrimSpace(originalContent)
}
