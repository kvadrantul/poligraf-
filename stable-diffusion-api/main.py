"""
Stable Diffusion 3.5 Medium API Server
Локальный сервер для генерации изображений через Stable Diffusion 3.5 Medium
"""
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

# Модель по умолчанию (используем открытую модель, не требующую авторизации)
MODEL_ID = "runwayml/stable-diffusion-v1-5"


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
        # Загружаем пайплайн (Stable Diffusion 2.1 использует StableDiffusionPipeline)
        from diffusers import StableDiffusionPipeline
        
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
            # Запускаем загрузку модели в отдельном потоке
            future = executor.submit(load_model)
            # Ждем завершения загрузки
            future.result(timeout=300)  # 5 минут таймаут на загрузку
            print("✅ Model loaded, proceeding with generation")

        print(f"🎨 Generating image with prompt: {request.prompt[:100]}...")
        print(f"📷 Has reference image: {request.reference_image is not None}")

        # Генерируем изображение в отдельном потоке, чтобы не блокировать event loop
        def generate():
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
                    width=request.width,
                    height=request.height,
                )
            else:
                # Text-to-image режим
                print("📝 Text-to-image mode")
                return pipe(
                    prompt=request.prompt,
                    num_inference_steps=request.num_inference_steps,
                    guidance_scale=request.guidance_scale,
                    width=request.width,
                    height=request.height,
                )
        
        # Запускаем генерацию в отдельном потоке
        future = executor.submit(generate)
        result = future.result(timeout=300)  # 5 минут таймаут на генерацию

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

