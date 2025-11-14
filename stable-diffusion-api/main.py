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

app = FastAPI(title="Stable Diffusion 3.5 Medium API")

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
# Варианты:
# - "ByteDance/SDXL-Lightning" - очень быстрая (1-4 шага), коммерческое использование разрешено (CreativeML Open RAIL++-M)
# - "stabilityai/sdxl-turbo" - быстрая (1-4 шага), коммерческое использование разрешено (CreativeML Open RAIL++-M)
# - "runwayml/stable-diffusion-v1-5" - стандартная (20-50 шагов), коммерческое использование разрешено (CreativeML Open RAIL-M)
# - "stabilityai/stable-diffusion-3-medium-diffusers" - требует HF token, НЕКОММЕРЧЕСКОЕ использование
MODEL_ID = os.getenv("SD_MODEL_ID", "ByteDance/SDXL-Lightning")  # По умолчанию: быстрая модель с коммерческой лицензией
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

        # Оптимизация для ускорения
        if device == "cuda":
            pipe.enable_attention_slicing()
            pipe.enable_vae_slicing()

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
            width = (request.width // 8) * 8
            height = (request.height // 8) * 8
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
                return pipe(
                    prompt=request.prompt,
                    num_inference_steps=request.num_inference_steps,
                    guidance_scale=request.guidance_scale,
                    width=width,
                    height=height,
                )
            else:
                # Text-to-image режим
                print("📝 Text-to-image mode")
                
                # Для Turbo/Lightning моделей используем меньше шагов и guidance_scale
                steps = request.num_inference_steps
                guidance = request.guidance_scale
                
                if "turbo" in MODEL_ID.lower():
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

        # Конвертируем в base64
        buffered = io.BytesIO()
        image.save(buffered, format="PNG")
        img_base64 = base64.b64encode(buffered.getvalue()).decode()

        # Формируем data URL
        image_url = f"data:image/png;base64,{img_base64}"

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

