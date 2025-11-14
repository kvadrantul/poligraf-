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
	extractedCode := extractCodeFromResponse(generatedContent)
	if extractedCode == "" {
		extractedCode = generatedContent
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
	requestBody := map[string]interface{}{
		"model": "v0-1.5-md",
		"messages": []map[string]interface{}{
			{
				"role":    "user",
				"content": userContent,
			},
		},
		"stream": false,
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
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	if len(response.Choices) == 0 {
		return "", fmt.Errorf("no content generated")
	}

	content := response.Choices[0].Message.Content
	if content == "" {
		content = response.Choices[0].Message.Text
	}
	if content == "" {
		return "", fmt.Errorf("no content generated")
	}

	log.Println("✅ v0.dev API response received")
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
	codeBlockRegex := regexp.MustCompile("(?s)```[\\w]*\\n?(.*?)```")
	matches := codeBlockRegex.FindAllStringSubmatch(content, -1)

	// Если есть code blocks, берем последний (финальный результат)
	if len(matches) > 0 {
		lastMatch := matches[len(matches)-1]
		if len(lastMatch) > 1 {
			log.Println("Found code block, using last one")
			return strings.TrimSpace(lastMatch[1])
		}
	}

	// Убираем thinking блоки
	// Формат 1: <thinking>...</thinking>
	thinkingRegex1 := regexp.MustCompile("(?i)<thinking>.*?</thinking>")
	content = thinkingRegex1.ReplaceAllString(content, "")

	// Формат 2: [thinking] ... [/thinking]
	thinkingRegex2 := regexp.MustCompile("(?i)\\[?thinking\\]?:?.*?\\[/thinking\\]?")
	content = thinkingRegex2.ReplaceAllString(content, "")

	// Формат 3: Thinking: ... до следующего блока
	thinkingRegex3 := regexp.MustCompile("(?i)thinking:.*?(?=```|---|===|\\n\\n)")
	content = thinkingRegex3.ReplaceAllString(content, "")

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

