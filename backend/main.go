package main

import (
	"log"
	"os"

	"poligraf-backend/handlers"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
)

func main() {
	// Получаем порт из переменной окружения или используем 8080 по умолчанию
	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	// Создаем Gin router
	r := gin.Default()

	// Настраиваем CORS для работы с frontend
	config := cors.DefaultConfig()
	config.AllowAllOrigins = true
	config.AllowMethods = []string{"GET", "POST", "PUT", "DELETE", "OPTIONS"}
	config.AllowHeaders = []string{"Origin", "Content-Type", "Accept", "Authorization"}
	r.Use(cors.New(config))

	// Регистрируем routes
	setupRoutes(r)

	// Запускаем сервер
	log.Printf("🚀 Server starting on port %s", port)
	if err := r.Run(":" + port); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func setupRoutes(r *gin.Engine) {
	api := r.Group("/api")
	{
		api.POST("/generate", handlers.HandleGenerate)
		// В будущем можно добавить другие endpoints
		// api.POST("/v0/create-project", handlers.HandleCreateProject)
		// api.POST("/v0/iterate", handlers.HandleIterate)
	}
}

