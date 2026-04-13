FROM python:3.11-slim

# System deps: tesseract for OCR, libgomp for PyTorch/ultralytics
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-nor \
    libgomp1 \
    libglib2.0-0 \
    libgl1-mesa-glx \
    libsm6 \
    libxext6 \
    libxrender-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install base deps first (cache layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install ultralytics for YOLO (only needed when PROVIDER=yolo)
RUN pip install --no-cache-dir ultralytics

COPY . .

# Warm-up: download YOLO model weights at build time so first request isn't slow.
# Falls back gracefully if network is unavailable during build.
RUN python -c "from ultralytics import YOLO; YOLO('yolo11n.pt')" || true

EXPOSE 8001

ENV HOST=0.0.0.0
ENV PORT=8001
ENV PROVIDER=yolo
ENV TEXT_PROVIDER=tesseract
ENV ENABLE_SCAN_LOGGING=false
ENV LOG_LEVEL=INFO

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8001"]
