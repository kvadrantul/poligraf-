package handlers

import (
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
)

// GenerateImageRequest структура для запроса генерации изображения
type GenerateImageRequest struct {
	Prompt         string `json:"prompt" binding:"required"`
	ReferenceImage string `json:"referenceImage,omitempty"` // Base64 изображение-референс (опционально)
	NegativePrompt string `json:"negativePrompt,omitempty"` // Негативный промпт (опционально)
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

	// Получаем URL локального Stable Diffusion API
	sdApiUrl := os.Getenv("STABLE_DIFFUSION_API_URL")
	if sdApiUrl == "" {
		sdApiUrl = "http://localhost:7861" // По умолчанию локальный сервер
	}

	log.Printf("🎨 Generating image with prompt: %s", req.Prompt[:min(100, len(req.Prompt))])
	log.Printf("📷 Has reference image: %v", req.ReferenceImage != "")
	log.Printf("🔗 Stable Diffusion API URL: %s", sdApiUrl)

	// Генерируем изображение через локальный Stable Diffusion API
	imageBase64, err := generateImageWithStableDiffusion(sdApiUrl, req.Prompt, req.ReferenceImage, req.NegativePrompt)
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

// generateImageWithStableDiffusion генерирует изображение через локальный Stable Diffusion API
func generateImageWithStableDiffusion(apiUrl, prompt, referenceImage, negativePrompt string) (string, error) {
	apiEndpoint := fmt.Sprintf("%s/generate", apiUrl)

	// Формируем запрос
		// Для LCM Dreamshaper используем оптимальные параметры (4 шага для нормального качества!)
		requestBody := map[string]interface{}{
			"prompt":              prompt,
			"num_inference_steps": 4,   // LCM работает с 4+ шагами (2 шага дают черные изображения!)
			"guidance_scale":      2.0, // LCM использует низкий guidance, но не слишком низкий
			"width":               512, // Минимальный размер для скорости
			"height":              512,
		}
		
		// Добавляем негативный промпт если указан
		if negativePrompt != "" {
			requestBody["negative_prompt"] = negativePrompt
		}

	// Если есть референс, добавляем его
	if referenceImage != "" {
		requestBody["reference_image"] = referenceImage
		log.Println("📷 Reference image provided, using image-to-image mode")
	}

	jsonData, err := json.Marshal(requestBody)
	if err != nil {
		return "", fmt.Errorf("failed to marshal request: %w", err)
	}

	log.Printf("📤 Request body: %s", string(jsonData))
	log.Printf("📤 Request URL: %s", apiEndpoint)

	req, err := http.NewRequest("POST", apiEndpoint, strings.NewReader(string(jsonData)))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	// Увеличиваем таймаут для генерации (на CPU может занять 5-15 минут)
	// Используем Transport с keep-alive для переиспользования соединений
	transport := &http.Transport{
		MaxIdleConns:        10,
		IdleConnTimeout:     30 * time.Second,
		DisableKeepAlives:   false, // Включаем keep-alive для переиспользования соединений
		DisableCompression:  false, // Разрешаем сжатие ответов
	}
	client := &http.Client{
		Timeout:   900 * time.Second, // 15 минут для CPU генерации
		Transport: transport,
	}

	log.Println("📤 Sending request to Stable Diffusion API...")
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("❌ Request failed: %v", err)
		return "", fmt.Errorf("failed to send request to Stable Diffusion API: %w", err)
	}
	defer resp.Body.Close()

	log.Printf("📥 Received response: status %d", resp.StatusCode)
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		log.Printf("❌ Error response: %s", string(body))
		return "", fmt.Errorf("Stable Diffusion API error: %d - %s", resp.StatusCode, string(body))
	}

	// Читаем ответ напрямую, без буферизации через json.Decoder
	// Это быстрее для больших base64 ответов
	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", fmt.Errorf("failed to read response body: %w", err)
	}

	log.Printf("📥 Response body length: %d bytes", len(bodyBytes))
	log.Printf("📥 Response body preview (first 200 chars): %s", string(bodyBytes[:min(200, len(bodyBytes))]))

	var response GenerateImageResponse
	if err := json.Unmarshal(bodyBytes, &response); err != nil {
		log.Printf("❌ Failed to unmarshal response: %v", err)
		log.Printf("❌ Response body: %s", string(bodyBytes))
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	if response.Error != "" {
		return "", fmt.Errorf("Stable Diffusion API error: %s", response.Error)
	}

	if response.ImageURL == "" {
		log.Printf("❌ Empty imageUrl in response")
		log.Printf("❌ Full response: %+v", response)
		return "", fmt.Errorf("no image URL in response")
	}

	log.Printf("✅ Image URL length: %d bytes", len(response.ImageURL))
	log.Printf("✅ Image URL preview: %s", response.ImageURL[:min(100, len(response.ImageURL))])
	log.Println("✅ Image generated successfully by Stable Diffusion")
	return response.ImageURL, nil
}

// min возвращает минимум двух чисел
func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}
