#!/bin/bash
# Скрипт запуска Stable Diffusion API с оптимизацией для всех ядер CPU

cd "$(dirname "$0")"

# Устанавливаем переменные окружения для использования всех ядер
export OMP_NUM_THREADS=$(sysctl -n hw.ncpu)
export MKL_NUM_THREADS=$(sysctl -n hw.ncpu)
export NUMEXPR_NUM_THREADS=$(sysctl -n hw.ncpu)

echo "🚀 Starting Stable Diffusion API Server"
echo "🔧 CPU cores: $(sysctl -n hw.ncpu)"
echo "🔧 OMP_NUM_THREADS: $OMP_NUM_THREADS"
echo "🔧 MKL_NUM_THREADS: $MKL_NUM_THREADS"
echo ""

# Проверяем, активировано ли виртуальное окружение
if [ -d "venv" ]; then
    echo "📦 Activating virtual environment..."
    source venv/bin/activate
fi

# Запускаем сервер
python3 main.py

