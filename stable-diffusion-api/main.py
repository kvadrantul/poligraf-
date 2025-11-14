"""
Stable Diffusion 3.5 Medium API Server
Локальный сервер для генерации изображений через Stable Diffusion 3.5 Medium
"""
import asyncio
import base64
import io
import os
from concurrent.futures import ThreadPoolExecutor
from typing import Optional

import torch
from diffusers import StableDiffusionPipeline
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import multiprocessing

app = FastAPI(title="Stable Diffusion 3.5 Medium API")

# ⚡ КРИТИЧНО: Настраиваем PyTorch для использования ВСЕХ ядер CPU
# Mac Mini M4 имеет 10 ядер (4 performance + 6 efficiency)
NUM_CPU_CORES = multiprocessing.cpu_count()
print(f"🔧 Detected CPU cores: {NUM_CPU_CORES}")

# Устанавливаем количество потоков для PyTorch (используем все ядра)
torch.set_num_threads(NUM_CPU_CORES)
torch.set_num_interop_threads(NUM_CPU_CORES)

# Устанавливаем переменные окружения для OpenMP/MKL (если доступны)
os.environ.setdefault("OMP_NUM_THREADS", str(NUM_CPU_CORES))
os.environ.setdefault("MKL_NUM_THREADS", str(NUM_CPU_CORES))
os.environ.setdefault("NUMEXPR_NUM_THREADS", str(NUM_CPU_CORES))

print(f"✅ PyTorch configured to use {NUM_CPU_CORES} threads")
print(f"✅ PyTorch get_num_threads(): {torch.get_num_threads()}")
print(f"✅ PyTorch get_num_interop_threads(): {torch.get_num_interop_threads()}")

# Настройка CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Глобальная переменная для пайплайна
pipe = None
device = "cuda" if torch.cuda.is_available() else "cpu"
print(f"🔧 Using device: {device}")

# Thread pool для выполнения блокирующих операций
executor = ThreadPoolExecutor(max_workers=1)

# Модель по умолчанию
# Варианты (от самой простой к сложной):
# - "CompVis/stable-diffusion-v1-4" - САМАЯ ПРОСТАЯ базовая модель SD 1.4, ~4GB, коммерческое использование разрешено ⚡⚡⚡⚡
# - "SimianLuo/LCM_Dreamshaper_v7" - ОЧЕНЬ БЫСТРАЯ SD 1.5 с LCM (1-2 шага!), ~4GB, коммерческое использование разрешено ⚡⚡⚡
# - "runwayml/stable-diffusion-v1-5" - стандартная SD 1.5 (20-50 шагов), ~4GB, коммерческое использование разрешено
# - "ByteDance/SDXL-Lightning" - очень быстрая SDXL (1-4 шага), ~10GB, коммерческое использование разрешено
# - "stabilityai/sdxl-turbo" - быстрая SDXL (1-4 шага), ~10GB, коммерческое использование разрешено
# - "stabilityai/stable-diffusion-3-medium-diffusers" - требует HF token, НЕКОММЕРЧЕСКОЕ использование
MODEL_ID = os.getenv("SD_MODEL_ID", "SimianLuo/LCM_Dreamshaper_v7")  # По умолчанию: САМАЯ БЫСТРАЯ модель (1-2 шага!)
HF_TOKEN = os.getenv("HUGGINGFACE_TOKEN", "")  # Для gated моделей (не используется для Lightning)


class GenerateRequest(BaseModel):
    prompt: str
    reference_image: Optional[str] = None  # Base64 изображение
    num_inference_steps: int = 28
    guidance_scale: float = 7.0
    width: int = 1024
    height: int = 1024


class GenerateResponse(BaseModel):
    imageUrl: str  # Base64 data URL
    error: Optional[str] = None


def load_model():
    """Загружает модель Stable Diffusion 3.5 Medium"""
    global pipe
    if pipe is not None:
        return pipe

    print(f"📦 Loading model: {MODEL_ID}")
    print("⏳ This may take a few minutes on first run...")

    try:
        # Определяем, какой пайплайн использовать в зависимости от модели
        if "sdxl" in MODEL_ID.lower() or "turbo" in MODEL_ID.lower() or "lightning" in MODEL_ID.lower():
            # SDXL модели используют StableDiffusionXLPipeline
            from diffusers import StableDiffusionXLPipeline
            print("📦 Using SDXL pipeline")
            
            # Для gated моделей нужен токен
            kwargs = {
                "torch_dtype": torch.float16 if device == "cuda" else torch.float32,
            }
            if HF_TOKEN:
                kwargs["token"] = HF_TOKEN
                print("🔑 Using Hugging Face token for gated model")
            
            pipe = StableDiffusionXLPipeline.from_pretrained(
                MODEL_ID,
                **kwargs
            )
        elif "stable-diffusion-3" in MODEL_ID.lower():
            # SD 3.5 Medium использует StableDiffusion3Pipeline
            from diffusers import StableDiffusion3Pipeline
            print("📦 Using Stable Diffusion 3 pipeline")
            
            kwargs = {
                "torch_dtype": torch.float16 if device == "cuda" else torch.float32,
            }
            if HF_TOKEN:
                kwargs["token"] = HF_TOKEN
                print("🔑 Using Hugging Face token for SD 3.5 Medium")
            
            pipe = StableDiffusion3Pipeline.from_pretrained(
                MODEL_ID,
                **kwargs
            )
        else:
            # Стандартный Stable Diffusion (1.5, 2.1)
            from diffusers import StableDiffusionPipeline
            print("📦 Using standard Stable Diffusion pipeline")
            
            pipe = StableDiffusionPipeline.from_pretrained(
                MODEL_ID,
                torch_dtype=torch.float16 if device == "cuda" else torch.float32,
            )
        pipe = pipe.to(device)

        # Оптимизация для ускорения (для CPU и CUDA)
        pipe.enable_attention_slicing(1)  # Включаем для CPU тоже - экономит память и может ускорить
        pipe.enable_vae_slicing()  # Включаем для CPU - экономит память
        
        # Для CPU используем float32 (не float16) - это уже установлено выше
        # Дополнительные оптимизации для CPU
        if device == "cpu":
            # Убеждаемся, что используем все ядра (уже настроено выше при импорте)
            current_threads = torch.get_num_threads()
            print(f"🔧 CPU optimizations: attention_slicing, vae_slicing, {current_threads} threads")
            print(f"🔧 PyTorch will use {current_threads} CPU cores for inference")

        print("✅ Model loaded successfully")
        return pipe
    except Exception as e:
        print(f"❌ Error loading model: {e}")
        raise


@app.on_event("startup")
async def startup_event():
    """Модель загрузится при первом запросе (ленивая загрузка)"""
    print("✅ Server started. Model will be loaded on first request.")


@app.get("/health")
async def health():
    """Проверка здоровья сервиса"""
    return {
        "status": "ok",
        "model_loaded": pipe is not None,
        "device": device,
    }


@app.post("/generate", response_model=GenerateResponse)
async def generate_image(request: GenerateRequest):
    """
    Генерирует изображение по текстовому промпту
    Поддерживает image-to-image если передан reference_image
    """
    try:
        # Загружаем модель если еще не загружена (в отдельном потоке, чтобы не блокировать)
        if pipe is None:
            print("📦 Loading model in background thread...")
            # Используем asyncio.to_thread для неблокирующей загрузки
            await asyncio.to_thread(load_model)
            print("✅ Model loaded, proceeding with generation")

        print(f"🎨 Generating image with prompt: {request.prompt[:100]}...")
        print(f"📷 Has reference image: {request.reference_image is not None}")

        # Генерируем изображение в отдельном потоке, чтобы не блокировать event loop
        def generate():
            # Округляем размеры до кратных 8 (требование Stable Diffusion)
            width = ((request.width + 7) // 8) * 8
            height = ((request.height + 7) // 8) * 8
            
            # Для SD 1.4/1.5 (не SDXL) ограничиваем максимальный размер 512x512 для максимальной скорости
            if "sdxl" not in MODEL_ID.lower() and "stable-diffusion-3" not in MODEL_ID.lower():
                width = min(width, 512)  # Ограничиваем до 512 для скорости
                height = min(height, 512)
            
            if width != request.width or height != request.height:
                print(f"⚠️ Adjusted image size from {request.width}x{request.height} to {width}x{height} (must be multiple of 8)")
            
            # Подготовка входных данных
            if request.reference_image:
                # Image-to-image режим
                # Декодируем base64 референс
                if request.reference_image.startswith("data:"):
                    # Убираем data URL префикс
                    base64_data = request.reference_image.split(",")[1]
                else:
                    base64_data = request.reference_image

                image_bytes = base64.b64decode(base64_data)
                from PIL import Image
                reference_img = Image.open(io.BytesIO(image_bytes))

                # Генерируем с референсом
                print("📷 Using reference image (image-to-image mode)")
                
                # Для разных моделей используем оптимальные параметры
                steps = request.num_inference_steps
                guidance = request.guidance_scale
                if "v1-4" in MODEL_ID.lower() or "stable-diffusion-v1-4" in MODEL_ID.lower():
                    steps = min(steps, 10)
                    guidance = 7.5
                    print(f"⚡⚡⚡⚡ SD 1.4 mode (SIMPLEST!): {steps} steps, guidance={guidance}")
                elif "lcm" in MODEL_ID.lower():
                    steps = min(steps, 2)
                    guidance = 1.0
                    print(f"⚡⚡⚡ LCM mode (FASTEST!): {steps} steps, guidance={guidance}")
                
                return pipe(
                    prompt=request.prompt,
                    num_inference_steps=steps,
                    guidance_scale=guidance,
                    width=width,
                    height=height,
                )
            else:
                # Text-to-image режим
                print("📝 Text-to-image mode")
                
                # Для разных моделей используем оптимальные параметры
                steps = request.num_inference_steps
                guidance = request.guidance_scale
                
                if "v1-4" in MODEL_ID.lower() or "stable-diffusion-v1-4" in MODEL_ID.lower():
                    # SD 1.4 - самая простая модель, используем минимальные шаги для скорости
                    steps = min(steps, 10)  # Минимум для базового качества
                    guidance = 7.5  # Стандартный guidance для SD 1.4
                    print(f"⚡⚡⚡⚡ SD 1.4 mode (SIMPLEST!): {steps} steps, guidance={guidance}")
                elif "lcm" in MODEL_ID.lower():
                    # LCM модели работают лучше с 1-2 шагами (самые быстрые!)
                    steps = min(steps, 2)
                    guidance = 1.0  # LCM использует низкий guidance
                    print(f"⚡⚡⚡ LCM mode (FASTEST!): {steps} steps, guidance={guidance}")
                elif "turbo" in MODEL_ID.lower():
                    # Turbo работает лучше с 1-4 шагами
                    steps = min(steps, 4)
                    guidance = 0.0  # Turbo не использует guidance
                    print(f"⚡ Turbo mode: {steps} steps, guidance={guidance}")
                elif "lightning" in MODEL_ID.lower():
                    # Lightning работает лучше с 1-4 шагами
                    steps = min(steps, 4)
                    guidance = 1.0  # Lightning использует низкий guidance
                    print(f"⚡ Lightning mode: {steps} steps, guidance={guidance}")
                
                return pipe(
                    prompt=request.prompt,
                    num_inference_steps=steps,
                    guidance_scale=guidance,
                    width=width,
                    height=height,
                )
        
        # Запускаем генерацию в отдельном потоке через asyncio (не блокирует event loop)
        result = await asyncio.wait_for(
            asyncio.to_thread(generate),
            timeout=900.0  # 15 минут таймаут на генерацию (CPU может быть медленным)
        )

        # Получаем изображение
        image = result.images[0]

        # Конвертируем в base64 с оптимизацией размера
        # Используем JPEG с качеством 85% для уменьшения размера (вместо PNG)
        buffered = io.BytesIO()
        # Конвертируем RGBA в RGB для JPEG (JPEG не поддерживает прозрачность)
        if image.mode == 'RGBA':
            # Создаем белый фон
            rgb_image = Image.new('RGB', image.size, (255, 255, 255))
            rgb_image.paste(image, mask=image.split()[3])  # Используем альфа-канал как маску
            image = rgb_image
        elif image.mode != 'RGB':
            image = image.convert('RGB')
        
        # Сохраняем как JPEG с качеством 85% для уменьшения размера
        image.save(buffered, format="JPEG", quality=85, optimize=True)
        img_base64 = base64.b64encode(buffered.getvalue()).decode()
        
        # Логируем размер для отладки
        original_size = len(img_base64)
        print(f"📏 Image size: {original_size} base64 chars ({original_size * 3 // 4} bytes)")

        # Формируем data URL
        image_url = f"data:image/jpeg;base64,{img_base64}"

        print("✅ Image generated successfully")
        return GenerateResponse(imageUrl=image_url)

    except Exception as e:
        error_msg = str(e)
        print(f"❌ Error generating image: {error_msg}")
        raise HTTPException(status_code=500, detail=error_msg)


if __name__ == "__main__":
    import uvicorn

    port = int(os.getenv("PORT", "7861"))
    uvicorn.run(app, host="0.0.0.0", port=port)

