import os
from pathlib import Path

# Base directories
BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIR = BASE_DIR / "data"
CACHE_DIR = DATA_DIR / "cache"
ATTACHMENTS_CACHE_DIR = CACHE_DIR / "attachments"
THUMBNAILS_CACHE_DIR = CACHE_DIR / "thumbnails"
DB_PATH = DATA_DIR / "attachments.db"
CONFIG_FILE = DATA_DIR / "config.json"

# Ensure directories exist
DATA_DIR.mkdir(parents=True, exist_ok=True)
CACHE_DIR.mkdir(parents=True, exist_ok=True)
ATTACHMENTS_CACHE_DIR.mkdir(parents=True, exist_ok=True)
THUMBNAILS_CACHE_DIR.mkdir(parents=True, exist_ok=True)

# Application constants
APP_TITLE = "Gmail Attachment Explorer"
SERVER_HOST = "127.0.0.1"
SERVER_PORT = 8765

# Supported file extensions for quick categorization
IMAGE_EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.tiff', '.tif', '.svg', '.heic', '.heif', '.raw', '.cr2', '.nef', '.arw'}
VIDEO_EXTENSIONS = {'.mp4', '.mkv', '.mov', '.avi', '.wmv', '.webm', '.flv', '.m4v', '.3gp', '.ts', '.mpeg', '.mpg'}
AUDIO_EXTENSIONS = {'.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac', '.wma'}
DOC_EXTENSIONS = {'.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv', '.rtf', '.odt', '.ods', '.odp'}
ARCHIVE_EXTENSIONS = {'.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.iso'}

def get_category(filename: str, mime_type: str = "") -> str:
    ext = Path(filename).suffix.lower() if filename else ""
    mime = (mime_type or "").lower()
    
    if ext in IMAGE_EXTENSIONS or mime.startswith("image/"):
        return "images"
    elif ext in VIDEO_EXTENSIONS or mime.startswith("video/"):
        return "videos"
    elif ext in AUDIO_EXTENSIONS or mime.startswith("audio/"):
        return "audio"
    elif ext in DOC_EXTENSIONS or mime.startswith("application/pdf") or "word" in mime or "excel" in mime or "presentation" in mime or "text" in mime:
        return "documents"
    elif ext in ARCHIVE_EXTENSIONS or "zip" in mime or "compressed" in mime or "tar" in mime:
        return "archives"
    return "others"
