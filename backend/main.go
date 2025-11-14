package main

import (
	"log"
	"os"

	"poligraf-backend/handlers"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

func main() {
	// Загружаем переменные окружения из .env файла
	if err := godotenv.Load(); err != nil {
		log.Println("⚠️ .env file not found, using environment variables")
	}

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
	// API endpoints (должны быть ПЕРЕД статикой, чтобы /api/* не конфликтовали)
	api := r.Group("/api")
	{
		api.POST("/generate", handlers.HandleGenerate)
		// В будущем можно добавить другие endpoints
		// api.POST("/v0/create-project", handlers.HandleCreateProject)
		// api.POST("/v0/iterate", handlers.HandleIterate)
	}

	// Отдаем статические файлы из корня проекта (на уровень выше backend/)
	// Явно отдаем index.html для корня
	r.GET("/", func(c *gin.Context) {
		c.File("../index.html")
	})

	// Отдаем остальные статические файлы (JS, CSS и т.д.)
	r.StaticFile("/app.js", "../app.js")
	r.StaticFile("/app.local.js", "../app.local.js")
	r.StaticFile("/styles.css", "../styles.css")
	r.StaticFile("/index.html", "../index.html")

	// Для всех остальных GET запросов (fallback для статики)
	r.NoRoute(func(c *gin.Context) {
		// Только для GET запросов пытаемся отдать файл
		if c.Request.Method == "GET" {
			filePath := "../" + c.Request.URL.Path
			c.File(filePath)
		} else {
			// Для POST/PUT/DELETE и других методов возвращаем 404
			c.JSON(404, gin.H{"error": "Not found"})
		}
	})
}
