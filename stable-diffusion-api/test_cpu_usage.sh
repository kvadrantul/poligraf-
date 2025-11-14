#!/bin/bash
# Скрипт для тестирования использования CPU во время генерации изображения

echo "=== ТЕСТ ИСПОЛЬЗОВАНИЯ CPU ПРИ ГЕНЕРАЦИИ ==="
echo ""

# Находим PID процесса Python (SD API сервер)
PYTHON_PID=$(ps aux | grep -E "python.*main.py|uvicorn" | grep -v grep | awk '{print $2}')

if [ -z "$PYTHON_PID" ]; then
    echo "❌ SD API сервер не найден. Запустите сервер сначала:"
    echo "   cd stable-diffusion-api && ./start_server.sh"
    exit 1
fi

echo "✅ Найден процесс SD API: PID=$PYTHON_PID"
echo ""

# Запускаем мониторинг CPU в фоне
echo "📊 Запускаю мониторинг CPU (обновление каждые 1 сек)..."
(
    while true; do
        # Получаем использование CPU для процесса
        CPU_USAGE=$(ps -p $PYTHON_PID -o %cpu= 2>/dev/null | tr -d ' ')
        # Получаем количество потоков
        THREADS=$(ps -p $PYTHON_PID -M 2>/dev/null | wc -l | tr -d ' ')
        # Получаем общее использование CPU системы
        SYS_CPU=$(top -l 1 | grep "CPU usage" | awk '{print $3}' | sed 's/%//')
        
        if [ ! -z "$CPU_USAGE" ]; then
            echo "[$(date '+%H:%M:%S')] SD API CPU: ${CPU_USAGE}% | Threads: $((THREADS-1)) | System CPU: ${SYS_CPU}%"
        fi
        sleep 1
    done
) &
MONITOR_PID=$!

# Ждем 2 секунды для начала мониторинга
sleep 2

echo ""
echo "🚀 Отправляю запрос на генерацию изображения..."
echo ""

# Отправляем запрос на генерацию
START_TIME=$(date +%s)
curl -X POST http://localhost:7861/generate \
  -H "Content-Type: application/json" \
  -d '{
    "prompt": "simple business card design",
    "width": 512,
    "height": 512,
    "num_inference_steps": 2,
    "guidance_scale": 1.0
  }' \
  --max-time 120 \
  -s -w "\n\n📊 HTTP: %{http_code}\n⏱️  Время: %{time_total}s\n" \
  -o /tmp/test_cpu_generation.json

END_TIME=$(date +%s)
DURATION=$((END_TIME - START_TIME))

# Останавливаем мониторинг
kill $MONITOR_PID 2>/dev/null
wait $MONITOR_PID 2>/dev/null

echo ""
echo "=== РЕЗУЛЬТАТЫ ==="
echo "⏱️  Общее время: ${DURATION} секунд"

if [ -f /tmp/test_cpu_generation.json ]; then
    if grep -q "imageUrl" /tmp/test_cpu_generation.json; then
        echo "✅ Генерация успешна"
        IMAGE_SIZE=$(cat /tmp/test_cpu_generation.json | python3 -c "import sys, json; d=json.load(sys.stdin); print(len(d.get('imageUrl', '')))" 2>/dev/null)
        echo "📏 Размер изображения: ${IMAGE_SIZE} символов base64"
    else
        echo "❌ Ошибка генерации"
        cat /tmp/test_cpu_generation.json
    fi
else
    echo "❌ Ответ не получен (таймаут?)"
fi

echo ""
echo "💡 Для проверки использования всех ядер откройте Activity Monitor"
echo "   и посмотрите на процесс Python во время генерации"


