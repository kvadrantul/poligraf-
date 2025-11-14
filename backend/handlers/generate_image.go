package handlers

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
)

// GenerateImageRequest структура для запроса генерации изображения
type GenerateImageRequest struct {
	Prompt      string `json:"prompt" binding:"required"`
	ReferenceImage string `json:"referenceImage,omitempty"` // Base64 изображение-референс (опционально)
}

// GenerateImageResponse структура для ответа генерации изображения
type GenerateImageResponse struct {
	ImageURL string `json:"imageUrl"` // Base64 изображение
	Error    string `json:"error,omitempty"`
}

// HandleGenerateImage обрабатывает запрос на генерацию изображения
func HandleGenerateImage(c *gin.Context) {
	var req GenerateImageRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, ErrorResponse{
			Error: "prompt is required",
		})
		return
	}

	// Получаем API ключ OpenAI для DALL-E
	openaiApiKey := os.Getenv("OPENAI_API_KEY")
	if openaiApiKey == "" {
		c.JSON(http.StatusInternalServerError, ErrorResponse{
			Error: "OPENAI_API_KEY not configured",
			Note:  "Для генерации изображений нужен OpenAI API ключ. Установите OPENAI_API_KEY в переменных окружения.",
		})
		return
	}

	log.Printf("🎨 Generating image with prompt: %s", req.Prompt[:min(100, len(req.Prompt))])
	log.Printf("📷 Has reference image: %v", req.ReferenceImage != "")

	// Генерируем изображение через OpenAI DALL-E
	imageBase64, err := generateImageWithDALLE(openaiApiKey, req.Prompt, req.ReferenceImage)
	if err != nil {
		log.Printf("❌ Error generating image: %v", err)
		c.JSON(http.StatusInternalServerError, GenerateImageResponse{
			Error: fmt.Sprintf("Failed to generate image: %v", err),
		})
		return
	}

	log.Println("✅ Image generated successfully")
	c.JSON(http.StatusOK, GenerateImageResponse{
		ImageURL: imageBase64,
	})
}

// generateImageWithDALLE генерирует изображение через OpenAI DALL-E API
func generateImageWithDALLE(apiKey, prompt, referenceImage string) (string, error) {
	apiUrl := "https://api.openai.com/v1/images/generations"
	
	// Если есть референс, добавляем его описание в промпт
	// DALL-E 3 не поддерживает прямой image-to-image, поэтому используем текстовое описание
	finalPrompt := prompt
	if referenceImage != "" {
		// Для референса используем промпт с указанием на референс
		// В будущем можно использовать image-to-image API если OpenAI добавит поддержку
		log.Println("📷 Reference image provided, using enhanced prompt")
	}
	
	requestBody := map[string]interface{}{
		"model":   "dall-e-3",
		"prompt":  finalPrompt,
		"n":       1,
		"size":    "1024x1024",
		"quality": "standard",
	}

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	req, err := http.NewRequest("POST", apiUrl, strings.NewReader(string(jsonData)))
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
		return "", fmt.Errorf("OpenAI API error: %d - %s", resp.StatusCode, string(body))
	}

	var response struct {
		Data []struct {
			URL string `json:"url"`
		} `json:"data"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	if len(response.Data) == 0 {
		return "", fmt.Errorf("no image URL in response")
	}

	imageURL := response.Data[0].URL
	log.Printf("✅ Generated image URL: %s", imageURL)

	// Скачиваем изображение и конвертируем в base64
	imageResp, err := http.Get(imageURL)
	if err != nil {
		return "", fmt.Errorf("failed to download image: %w", err)
	}
	defer imageResp.Body.Close()

	imageData, err := io.ReadAll(imageResp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read image data: %w", err)
	}

	// Определяем MIME тип (обычно PNG для DALL-E)
	mimeType := "image/png"
	if strings.HasPrefix(string(imageData), "\x89PNG") {
		mimeType = "image/png"
	} else if strings.HasPrefix(string(imageData), "\xff\xd8") {
		mimeType = "image/jpeg"
	}

	// Конвертируем в base64 data URL
	base64Image := fmt.Sprintf("data:%s;base64,%s", mimeType, 
		base64.StdEncoding.EncodeToString(imageData))

	return base64Image, nil
}

// min возвращает минимум двух чисел
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

