from io import BytesIO

from PIL import Image

from src.core.errors import BotError


def load_image_from_bytes(image_bytes: bytes, max_bytes: int):
    if not image_bytes:
        raise BotError('MISSING_IMAGE', 'Missing image upload (field name: image).', status_code=400)
    if len(image_bytes) > max_bytes:
        raise BotError('IMAGE_TOO_LARGE', f'Image too large. Max {max_bytes} bytes.', status_code=413)

    try:
        image = Image.open(BytesIO(image_bytes))
        image.load()
    except Exception as exc:
        raise BotError('IMAGE_DECODE_FAILED', 'Could not decode image.', status_code=400) from exc

    if image.mode != 'RGB':
        image = image.convert('RGB')
    return image
