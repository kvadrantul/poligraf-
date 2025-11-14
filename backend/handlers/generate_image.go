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
	imageBase64, err := generateImageWithStableDiffusion(sdApiUrl, req.Prompt, req.ReferenceImage)
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
func generateImageWithStableDiffusion(apiUrl, prompt, referenceImage string) (string, error) {
	apiEndpoint := fmt.Sprintf("%s/generate", apiUrl)

	// Формируем запрос
	// Для SDXL Turbo используем 4 шага (работает намного быстрее)
	requestBody := map[string]interface{}{
		"prompt":              prompt,
		"num_inference_steps": 4,  // Turbo работает с 1-4 шагами (вместо 20-50)
		"guidance_scale":      1.0, // Turbo не использует guidance
		"width":               1024,
		"height":              1024,
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

	req, err := http.NewRequest("POST", apiEndpoint, strings.NewReader(string(jsonData)))
	if err != nil {
		return "", fmt.Errorf("failed to create request: %w", err)
	}

	req.Header.Set("Content-Type", "application/json")

	// Увеличиваем таймаут для генерации (на CPU может занять 5-15 минут)
	client := &http.Client{
		Timeout: 900 * time.Second, // 15 минут для CPU генерации
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

	var response GenerateImageResponse
	if err := json.NewDecoder(resp.Body).Decode(&response); err != nil {
		return "", fmt.Errorf("failed to decode response: %w", err)
	}

	if response.Error != "" {
		return "", fmt.Errorf("Stable Diffusion API error: %s", response.Error)
	}

	if response.ImageURL == "" {
		return "", fmt.Errorf("no image URL in response")
	}

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
