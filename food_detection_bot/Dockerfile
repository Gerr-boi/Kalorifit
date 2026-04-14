FROM python:3.11-slim

# System deps: tesseract for OCR, libgomp for PyTorch/ultralytics
RUN apt-get update && apt-get install -y --no-install-recommends \
    tesseract-ocr \
    tesseract-ocr-nor \
    libgomp1 \
    libglib2.0-0 \
    libgl1 \
    libsm6 \
    libxext6 \
    libxrender-dev \
    libgl1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Install base deps first (cache layer)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install ultralytics for YOLO (only needed when PROVIDER=yolo)
RUN pip install --no-cache-dir ultralytics

COPY . .

EXPOSE 8001

ENV HOST=0.0.0.0
ENV PORT=8001
ENV PROVIDER=yolo
ENV TEXT_PROVIDER=tesseract
ENV ENABLE_SCAN_LOGGING=false
ENV LOG_LEVEL=INFO

CMD uvicorn src.main:app --host 0.0.0.0 --port ${PORT:-8001}
