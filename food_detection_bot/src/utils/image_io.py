from io import BytesIO

from PIL import Image

from src.core.errors import BotError


def load_image_from_bytes(image_bytes: bytes, max_bytes: int):
    if not image_bytes:
        raise BotError('MISSING_IMAGE', 'No image received. Please attach an image file using the "image" form field.', status_code=400)
    if len(image_bytes) > max_bytes:
        max_mb = round(max_bytes / (1024 * 1024), 1)
        raise BotError('IMAGE_TOO_LARGE', f'Image exceeds the maximum allowed size of {max_mb} MB. Please compress or resize the image before uploading.', status_code=413)

    try:
        image = Image.open(BytesIO(image_bytes))
        image.load()
    except Exception as exc:
        raise BotError('IMAGE_DECODE_FAILED', 'Could not decode the uploaded image. Ensure the file is a valid JPEG, PNG, or WebP image and is not corrupted.', status_code=400) from exc

    if image.mode != 'RGB':
        image = image.convert('RGB')
    return image
