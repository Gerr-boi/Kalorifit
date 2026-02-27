from pydantic import BaseModel, Field


class DetectionOut(BaseModel):
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: list[float] | None = None


class TextDetectionOut(BaseModel):
    text: str
    confidence: float = Field(ge=0.0, le=1.0)
    bbox: list[float] | None = None


class ItemOut(BaseModel):
    name: str
    confidence: float = Field(ge=0.0, le=1.0)
    count: int = 1
    brand: str | None = None
    product_name: str | None = None
    product_id: str | None = None
    reasons: list[str] | None = None
    evidence: dict | None = None
    packaging: list[str] | None = None
    volume_ml: int | None = None
    accepted: bool | None = None


class MatchOut(BaseModel):
    product_id: str | None = None
    name: str
    brand: str | None = None
    product_name: str | None = None
    confidence: float = Field(ge=0.0, le=1.0)
    reasons: list[str] | None = None
    evidence: dict | None = None


class DetectResponse(BaseModel):
    ok: bool = True
    model: str
    latency_ms: int
    items: list[ItemOut]
    detections: list[DetectionOut]
    text_detections: list[TextDetectionOut] = []
    barcode_result: str | None = None
    predicted_product: str | None = None
    package_detection: DetectionOut | None = None
    packaging_type: str | None = None
    top_match: MatchOut | None = None
    alternatives: list[MatchOut] = []
    scan_log_id: str | None = None
    debug: dict | None = None


class DishPredictionOut(BaseModel):
    label: str
    confidence: float = Field(ge=0.0, le=1.0)
    source: str | None = None


class DishPredictResponse(BaseModel):
    ok: bool = True
    model: str | None = None
    results: list[DishPredictionOut] = []


class HealthResponse(BaseModel):
    ok: bool
    version: str
    provider: str
    model_loaded: bool
    model: str | None = None
    model_weights_path: str | None = None
    model_weights_sha256: str | None = None
    model_loaded_at: str | None = None
    uptime_s: float


class ErrorResponse(BaseModel):
    ok: bool = False
    error: str
    message: str
    request_id: str | None = None


class LogScanResponse(BaseModel):
    ok: bool = True
    scan_log_id: str
    image_path: str
    created_at: str


class FeedbackRequest(BaseModel):
    scan_log_id: str
    user_confirmed: bool | None = None
    user_corrected_to: str | None = None
    not_food: bool | None = None
    bad_photo: bool | None = None
    feedback_notes: str | None = None
    feedback_context: dict | None = None


class FeedbackResponse(BaseModel):
    ok: bool = True
    scan_log_id: str
    updated_at: str
