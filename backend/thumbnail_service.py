import os
from pathlib import Path
from typing import Optional
from PIL import Image, ImageOps
import fitz # PyMuPDF
from backend.config import THUMBNAILS_CACHE_DIR, ATTACHMENTS_CACHE_DIR

THUMBNAIL_SIZE = (400, 400)

def get_thumbnail_path(att_id: int) -> Path:
    return THUMBNAILS_CACHE_DIR / f"thumb_{att_id}.webp"

def has_cached_thumbnail(att_id: int) -> bool:
    thumb_path = get_thumbnail_path(att_id)
    return thumb_path.exists() and thumb_path.stat().st_size > 0

def generate_thumbnail_from_file(file_path: Path, att_id: int, category: str = "images") -> Optional[Path]:
    if not file_path.exists():
        return None
        
    out_path = get_thumbnail_path(att_id)
    
    try:
        if category == "images" or file_path.suffix.lower() in {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'}:
            with Image.open(file_path) as img:
                # Correct EXIF orientation if needed
                img = ImageOps.exif_transpose(img)
                img.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
                
                # Convert to RGB if RGBA or P for saving as WEBP
                if img.mode in ("RGBA", "LA"):
                    background = Image.new("RGBA", img.size, (255, 255, 255, 0))
                    background.paste(img, (0, 0), img)
                    img = background
                elif img.mode != "RGB":
                    img = img.convert("RGB")
                    
                img.save(out_path, format="WEBP", quality=85, method=6)
                return out_path
                
        elif category == "documents" and file_path.suffix.lower() == '.pdf':
            # Render first page with PyMuPDF
            doc = fitz.open(file_path)
            if len(doc) > 0:
                page = doc[0]
                pix = page.get_pixmap(dpi=150)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                img.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
                img.save(out_path, format="WEBP", quality=85)
                doc.close()
                return out_path
            doc.close()
            
    except Exception as e:
        print(f"Error generating thumbnail for attachment {att_id} ({file_path}): {e}")
        
    return None

def generate_thumbnail_from_bytes(data: bytes, att_id: int, filename: str, category: str = "images") -> Optional[Path]:
    if not data:
        return None
        
    out_path = get_thumbnail_path(att_id)
    ext = Path(filename).suffix.lower()
    
    try:
        if category == "images" or ext in {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff'}:
            import io
            with Image.open(io.BytesIO(data)) as img:
                img = ImageOps.exif_transpose(img)
                img.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
                if img.mode in ("RGBA", "LA"):
                    img = img.convert("RGBA")
                elif img.mode != "RGB":
                    img = img.convert("RGB")
                img.save(out_path, format="WEBP", quality=85, method=6)
                return out_path
                
        elif category == "documents" and ext == '.pdf':
            doc = fitz.open(stream=data, filetype="pdf")
            if len(doc) > 0:
                page = doc[0]
                pix = page.get_pixmap(dpi=150)
                img = Image.frombytes("RGB", [pix.width, pix.height], pix.samples)
                img.thumbnail(THUMBNAIL_SIZE, Image.Resampling.LANCZOS)
                img.save(out_path, format="WEBP", quality=85)
                doc.close()
                return out_path
            doc.close()
    except Exception as e:
        print(f"Error generating thumbnail from bytes for {att_id}: {e}")
        
    return None
