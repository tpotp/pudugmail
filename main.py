import os
import sys
import io
import zipfile
import webbrowser
import threading
from pathlib import Path
from typing import Optional, List
from fastapi import FastAPI, HTTPException, Query, BackgroundTasks, Request
from fastapi.responses import FileResponse, StreamingResponse, JSONResponse, HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import uvicorn

from backend.config import (
    BASE_DIR, DATA_DIR, ATTACHMENTS_CACHE_DIR, THUMBNAILS_CACHE_DIR,
    SERVER_HOST, SERVER_PORT, APP_TITLE
)
from backend.database import (
    init_db, save_account, get_account, clear_account,
    query_attachments, get_attachment_by_id, get_stats,
    get_sync_state, clear_all_data
)
from backend.imap_scanner import (
    get_imap_client, start_background_scan, stop_background_scan,
    get_scan_status, fetch_and_cache_attachment
)
from backend.thumbnail_service import get_thumbnail_path, has_cached_thumbnail

# Initialize database
init_db()

app = FastAPI(title=APP_TITLE)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

FRONTEND_DIR = BASE_DIR / "frontend"
FRONTEND_DIR.mkdir(parents=True, exist_ok=True)

# Mount frontend static files
app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")

class ConnectRequest(BaseModel):
    email: str
    app_password: str
    imap_server: Optional[str] = "imap.gmail.com"
    imap_port: Optional[int] = 993

class ScanRequest(BaseModel):
    max_emails: Optional[int] = None

class BulkDownloadRequest(BaseModel):
    attachment_ids: List[int]

@app.get("/", response_class=HTMLResponse)
async def serve_index():
    index_file = FRONTEND_DIR / "index.html"
    if index_file.exists():
        with open(index_file, "r", encoding="utf-8") as f:
            return f.read()
    return "<h1>Gmail Attachment Explorer</h1><p>Cargando interfaz...</p>"

@app.post("/api/auth/connect")
async def connect_account(req: ConnectRequest):
    email_clean = req.email.strip().lower()
    pwd_clean = req.app_password.replace(" ", "").strip()
    
    if not email_clean or "@" not in email_clean:
        raise HTTPException(status_code=400, detail="Dirección de correo no válida.")
    if not pwd_clean:
        raise HTTPException(status_code=400, detail="Debe ingresar su Contraseña de Aplicación de Google.")

    # Test IMAP connection
    try:
        test_info = {
            "email": email_clean,
            "app_password": pwd_clean,
            "imap_server": req.imap_server,
            "imap_port": req.imap_port
        }
        client = get_imap_client(test_info)
        client.logout()
    except Exception as e:
        err_msg = str(e)
        if "AUTHENTICATIONFAILED" in err_msg or "Invalid credentials" in err_msg:
            raise HTTPException(
                status_code=401,
                detail="Credenciales incorrectas. Verifique que esté usando una Contraseña de Aplicación de 16 caracteres generada en https://myaccount.google.com/apppasswords"
            )
        raise HTTPException(status_code=400, detail=f"Error al conectar con Gmail: {err_msg}")

    # Save account
    save_account(email_clean, pwd_clean, req.imap_server, req.imap_port)
    return {"status": "success", "message": "Conexión exitosa con Gmail.", "email": email_clean}

@app.get("/api/auth/status")
async def get_auth_status():
    acc = get_account()
    if acc:
        return {
            "connected": True,
            "email": acc["email"],
            "imap_server": acc.get("imap_server", "imap.gmail.com")
        }
    return {"connected": False, "email": None}

@app.post("/api/auth/logout")
async def logout():
    clear_account()
    return {"status": "success", "message": "Cuenta desconectada."}

@app.post("/api/sync/start")
async def start_sync(req: ScanRequest):
    acc = get_account()
    if not acc:
        raise HTTPException(status_code=401, detail="Primero debe conectar su cuenta de Gmail.")
    
    status = get_scan_status()
    if status.get("is_syncing"):
        return {"status": "already_running", "message": "El escaneo ya está en curso."}
        
    start_background_scan(acc["email"], max_emails=req.max_emails)
    return {"status": "started", "message": "Escaneo iniciado."}

@app.post("/api/sync/stop")
async def stop_sync():
    stop_background_scan()
    return {"status": "stopped", "message": "Deteniendo escaneo..."}

@app.get("/api/sync/status")
async def sync_status():
    return get_scan_status()

@app.get("/api/attachments")
async def list_attachments(
    category: Optional[str] = Query(None, description="images, videos, documents, audio, archives, all"),
    search: Optional[str] = Query(None, description="Search keyword"),
    min_size: Optional[int] = Query(None),
    max_size: Optional[int] = Query(None),
    size_preset: Optional[str] = Query(None, description="huge (>25MB), large (10-25MB), medium (1-10MB), small (<1MB)"),
    sort_by: str = Query("size_desc", description="size_desc, size_asc, date_desc, date_asc, name_asc, name_desc"),
    page: int = Query(1, ge=1),
    page_size: int = Query(60, ge=1, le=200)
):
    items, total = query_attachments(
        category=category,
        search=search,
        min_size=min_size,
        max_size=max_size,
        size_preset=size_preset,
        sort_by=sort_by,
        page=page,
        page_size=page_size
    )
    
    return {
        "items": items,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size if page_size > 0 else 1
    }

@app.get("/api/attachments/{att_id}/thumbnail")
async def get_thumbnail(att_id: int):
    # Check if thumbnail is already generated
    if has_cached_thumbnail(att_id):
        return FileResponse(
            get_thumbnail_path(att_id),
            media_type="image/webp",
            headers={"Cache-Control": "public, max-age=86400"}
        )
    
    # Generate on demand
    file_path, thumb_path = fetch_and_cache_attachment(att_id)
    if thumb_path and thumb_path.exists():
        return FileResponse(
            thumb_path,
            media_type="image/webp",
            headers={"Cache-Control": "public, max-age=86400"}
        )
    
    # If no thumbnail could be generated (e.g. unsupported format), return 404 or default placeholder
    raise HTTPException(status_code=404, detail="Thumbnail no disponible")

@app.get("/api/attachments/{att_id}/preview")
async def preview_attachment(att_id: int, request: Request):
    att = get_attachment_by_id(att_id)
    if not att:
        raise HTTPException(status_code=404, detail="Adjunto no encontrado")

    file_path, _ = fetch_and_cache_attachment(att_id)
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=500, detail="No se pudo descargar el archivo desde Gmail")

    mime = att.get("content_type") or "application/octet-stream"
    
    # Support range requests for video/audio streaming
    file_size = file_path.stat().st_size
    range_header = request.headers.get("range")
    
    if range_header:
        byte1, byte2 = 0, None
        match = range_header.replace("bytes=", "").split("-")
        if match[0]:
            byte1 = int(match[0])
        if len(match) > 1 and match[1]:
            byte2 = int(match[1])
            
        byte2 = byte2 if byte2 is not None else file_size - 1
        length = byte2 - byte1 + 1
        
        def iterfile():
            with open(file_path, "rb") as f:
                f.seek(byte1)
                yield f.read(length)
                
        return StreamingResponse(
            iterfile(),
            status_code=206,
            headers={
                "Content-Range": f"bytes {byte1}-{byte2}/{file_size}",
                "Accept-Ranges": "bytes",
                "Content-Length": str(length),
                "Content-Type": mime,
            }
        )

    return FileResponse(
        file_path,
        media_type=mime,
        filename=att["clean_filename"],
        content_disposition_type="inline"
    )

@app.get("/api/attachments/{att_id}/download")
async def download_attachment(att_id: int):
    att = get_attachment_by_id(att_id)
    if not att:
        raise HTTPException(status_code=404, detail="Adjunto no encontrado")

    file_path, _ = fetch_and_cache_attachment(att_id)
    if not file_path or not file_path.exists():
        raise HTTPException(status_code=500, detail="No se pudo descargar el archivo desde Gmail")

    return FileResponse(
        file_path,
        media_type="application/octet-stream",
        filename=att["clean_filename"],
        content_disposition_type="attachment"
    )

@app.post("/api/attachments/bulk-download")
async def bulk_download(req: BulkDownloadRequest):
    if not req.attachment_ids:
        raise HTTPException(status_code=400, detail="No se han seleccionado adjuntos")
        
    zip_buffer = io.BytesIO()
    with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
        for att_id in req.attachment_ids:
            att = get_attachment_by_id(att_id)
            if att:
                file_path, _ = fetch_and_cache_attachment(att_id)
                if file_path and file_path.exists():
                    zip_file.write(file_path, arcname=att["clean_filename"])
                    
    zip_buffer.seek(0)
    return StreamingResponse(
        zip_buffer,
        media_type="application/zip",
        headers={"Content-Disposition": "attachment; filename=adjuntos_gmail.zip"}
    )

@app.get("/api/stats")
async def get_storage_stats():
    return get_stats()

@app.post("/api/database/clear")
async def clear_database():
    clear_all_data()
    return {"status": "success", "message": "Datos locales eliminados."}

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding='utf-8')
        sys.stderr.reconfigure(encoding='utf-8')
    except Exception:
        pass

def open_browser():
    try:
        webbrowser.open(f"http://{SERVER_HOST}:{SERVER_PORT}")
    except Exception as e:
        print(f"Error opening browser: {e}")

def main():
    print("=" * 60)
    print(" [OK] INICIANDO GMAIL ATTACHMENT EXPLORER")
    print(f" [*] Servidor local en http://{SERVER_HOST}:{SERVER_PORT}")
    print("=" * 60)
    
    # Auto open browser after 1.2 seconds
    threading.Timer(1.2, open_browser).start()
    
    uvicorn.run(app, host=SERVER_HOST, port=SERVER_PORT, log_level="info")

if __name__ == "__main__":
    main()
