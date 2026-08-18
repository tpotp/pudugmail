import imaplib
import email
from email.header import decode_header, make_header
import email.utils
import base64
import quopri
import re
import os
import time
import threading
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple, Generator

from backend.config import ATTACHMENTS_CACHE_DIR, get_category
from backend.database import (
    batch_upsert_attachments, update_sync_state, get_account,
    update_attachment_cache, get_attachment_by_id
)
from backend.thumbnail_service import generate_thumbnail_from_bytes, generate_thumbnail_from_file

# Global lock and control for scanning
_scan_lock = threading.Lock()
_stop_requested = False
_sync_status = {
    "is_syncing": False,
    "current_progress": "Inactivo",
    "total_messages": 0,
    "scanned_messages": 0,
    "attachments_found": 0,
    "percent": 0,
    "error": None
}

def decode_mime_header(header_value: Optional[str]) -> str:
    if not header_value:
        return ""
    try:
        decoded = str(make_header(decode_header(header_value)))
        return decoded.strip()
    except Exception:
        return str(header_value).strip()

def clean_filename_str(name: str) -> str:
    if not name:
        return "archivo_adjunto"
    decoded = decode_mime_header(name)
    # Remove dangerous characters for Windows filesystem
    cleaned = re.sub(r'[\\/*?:"<>|]', "_", decoded)
    return cleaned.strip() or "archivo_adjunto"

def get_imap_client(account_info: Optional[Dict[str, Any]] = None) -> imaplib.IMAP4_SSL:
    if not account_info:
        account_info = get_account()
    if not account_info or not account_info.get("email") or not account_info.get("app_password"):
        raise ValueError("No se han configurado credenciales de Gmail.")
    
    email_user = account_info["email"].strip()
    password = account_info["app_password"].replace(" ", "").strip()
    server = account_info.get("imap_server", "imap.gmail.com")
    port = int(account_info.get("imap_port", 993))
    
    client = imaplib.IMAP4_SSL(server, port)
    client.login(email_user, password)
    return client

def find_best_gmail_folder(client: imaplib.IMAP4_SSL) -> str:
    """Finds '[Gmail]/All Mail' or Spanish '[Gmail]/Todos' or 'INBOX'."""
    try:
        typ, folders = client.list()
        if typ == 'OK':
            folder_names = []
            for f in folders:
                match = re.search(r'"([^"]+)"$', f.decode('latin-1'))
                if match:
                    folder_names.append(match.group(1))
            
            # Check for All Mail variations
            for candidate in ['[Gmail]/All Mail', '[Gmail]/Todos', '[Gmail]/Todo el correo', '[Google Mail]/All Mail', 'INBOX']:
                if candidate in folder_names:
                    return candidate
    except Exception as e:
        print(f"Error listing folders: {e}")
    return "INBOX"

def parse_bodystructure_parts(structure: Any, prefix: str = "") -> List[Dict[str, Any]]:
    """
    Recursively parses IMAP BODYSTRUCTURE to extract all attachment metadata
    without downloading payloads.
    """
    attachments = []
    
    if not isinstance(structure, (list, tuple)) or len(structure) == 0:
        return attachments

    # If first element is a list/tuple, this is a multipart message
    if isinstance(structure[0], (list, tuple)):
        part_num = 1
        for sub_part in structure:
            if isinstance(sub_part, (list, tuple)):
                current_prefix = f"{prefix}.{part_num}" if prefix else str(part_num)
                attachments.extend(parse_bodystructure_parts(sub_part, current_prefix))
                part_num += 1
        return attachments

    # Single part parsing
    # IMAP BODYSTRUCTURE format for single part:
    # (type, subtype, params, id, desc, encoding, size, ...)
    try:
        main_type = str(structure[0]).lower() if len(structure) > 0 and structure[0] else "application"
        sub_type = str(structure[1]).lower() if len(structure) > 1 and structure[1] else "octet-stream"
        content_type = f"{main_type}/{sub_type}"
        
        params = structure[2] if len(structure) > 2 else None
        encoding = str(structure[5]).lower() if len(structure) > 5 and structure[5] else "base64"
        size_bytes = int(structure[6]) if len(structure) > 6 and str(structure[6]).isdigit() else 0
        
        # Check disposition (index 8 in standard BODYSTRUCTURE)
        disposition = structure[8] if len(structure) > 8 else None
        
        filename = None
        
        # 1. Look for filename in params (e.g. ('NAME', 'photo.jpg'))
        if isinstance(params, (list, tuple)):
            for i in range(0, len(params) - 1, 2):
                param_key = str(params[i]).lower()
                if param_key in ('name', 'filename*'):
                    filename = clean_filename_str(params[i+1])
                    break
        
        # 2. Look for filename in disposition params
        if not filename and isinstance(disposition, (list, tuple)) and len(disposition) > 1:
            disp_params = disposition[1]
            if isinstance(disp_params, (list, tuple)):
                for i in range(0, len(disp_params) - 1, 2):
                    param_key = str(disp_params[i]).lower()
                    if param_key in ('filename', 'filename*', 'name'):
                        filename = clean_filename_str(disp_params[i+1])
                        break
                        
        # Determine if this part is an attachment or image/video
        is_attachment = False
        disp_type = str(disposition[0]).lower() if isinstance(disposition, (list, tuple)) and disposition else ""
        
        if filename:
            is_attachment = True
        elif disp_type == 'attachment':
            is_attachment = True
            filename = f"adjunto_{prefix or '1'}.{sub_type}"
        elif main_type in ('image', 'video', 'audio') and size_bytes > 5000: # Ignore tiny 1x1 tracking pixels
            is_attachment = True
            ext = f".{sub_type}" if sub_type not in ('jpeg', 'octet-stream') else ('.jpg' if sub_type == 'jpeg' else '')
            filename = f"media_{prefix or '1'}{ext}"

        if is_attachment and filename:
            part_id = prefix if prefix else "1"
            attachments.append({
                "filename": filename,
                "content_type": content_type,
                "size_bytes": size_bytes,
                "part_id": part_id,
                "encoding": encoding
            })
    except Exception as e:
        print(f"Error parsing single bodystructure part: {e}")
        
    return attachments

def format_date_str(date_str: Optional[str]) -> str:
    if not date_str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    try:
        parsed = email.utils.parsedate_to_datetime(date_str)
        return parsed.strftime("%Y-%m-%d %H:%M:%S")
    except Exception:
        return str(date_str)[:19]

def scan_gmail_attachments_sync(email_user: str, max_emails: Optional[int] = None):
    global _sync_status, _stop_requested
    
    with _scan_lock:
        _stop_requested = False
        _sync_status["is_syncing"] = True
        _sync_status["error"] = None
        _sync_status["current_progress"] = "Conectando a Gmail..."
        _sync_status["percent"] = 5
        _sync_status["attachments_found"] = 0
        _sync_status["scanned_messages"] = 0
        update_sync_state(email_user, 0, 0, True, "Conectando a Gmail...")

    client = None
    try:
        client = get_imap_client()
        folder = find_best_gmail_folder(client)
        
        with _scan_lock:
            _sync_status["current_progress"] = f"Abriendo carpeta {folder}..."
            _sync_status["percent"] = 10
            
        typ, count_data = client.select(f'"{folder}"', readonly=True)
        if typ != 'OK':
            raise Exception(f"No se pudo abrir la carpeta {folder}")

        # Search for messages with attachments or all messages
        with _scan_lock:
            _sync_status["current_progress"] = "Buscando correos en Gmail..."
            _sync_status["percent"] = 15

        # Search all UIDs
        typ, msg_ids_data = client.uid('SEARCH', None, 'ALL')
        if typ != 'OK' or not msg_ids_data[0]:
            with _scan_lock:
                _sync_status["current_progress"] = "No se encontraron correos."
                _sync_status["is_syncing"] = False
                _sync_status["percent"] = 100
            update_sync_state(email_user, 0, 0, False, "Completado (0 correos)")
            return

        all_uids = msg_ids_data[0].split()
        total_uids = len(all_uids)
        
        # Newest messages first
        all_uids.reverse()
        if max_emails and max_emails < total_uids:
            all_uids = all_uids[:max_emails]
            total_uids = len(all_uids)

        with _scan_lock:
            _sync_status["total_messages"] = total_uids
            _sync_status["current_progress"] = f"Indexando {total_uids} correos..."
            _sync_status["percent"] = 20
        update_sync_state(email_user, 0, total_uids, True, f"Indexando {total_uids} correos...")

        # Process in batches of 50 UIDs for blazing fast network throughput
        BATCH_SIZE = 50
        batch_attachments = []
        scanned_count = 0
        total_found = 0

        for i in range(0, total_uids, BATCH_SIZE):
            if _stop_requested:
                break
                
            chunk = all_uids[i:i + BATCH_SIZE]
            uids_str = b",".join(chunk).decode('ascii')
            
            # Fetch headers + bodystructure + RFC822.SIZE in ONE fast query!
            typ, fetch_res = client.uid('FETCH', uids_str, '(BODYSTRUCTURE RFC822.SIZE BODY.PEEK[HEADER.FIELDS (FROM DATE SUBJECT MESSAGE-ID X-GM-MSGID)])')
            
            if typ != 'OK':
                continue

            # Process fetched responses
            idx = 0
            while idx < len(fetch_res):
                item = fetch_res[idx]
                if isinstance(item, tuple) and len(item) == 2:
                    header_part = item[0]
                    body_data = item[1]
                    
                    # Extract UID from header part
                    uid_match = re.search(r'UID\s+(\d+)', header_part.decode('latin-1', errors='ignore'))
                    msg_uid = int(uid_match.group(1)) if uid_match else 0
                    
                    # Parse header fields
                    msg_obj = email.message_from_bytes(body_data)
                    subject = decode_mime_header(msg_obj.get("Subject", "(Sin Asunto)"))
                    sender_raw = decode_mime_header(msg_obj.get("From", ""))
                    sender_name, sender_email = email.utils.parseaddr(sender_raw)
                    date_str = format_date_str(msg_obj.get("Date"))
                    message_id = str(msg_obj.get("Message-ID", "")).strip("<>")
                    
                    # Check next items for BODYSTRUCTURE
                    structure_data = None
                    if idx + 1 < len(fetch_res) and isinstance(fetch_res[idx + 1], bytes):
                        # Some IMAP servers send bodystructure on the trailing byte block
                        pass
                    
                    # Search bodystructure in the header part text
                    header_text = header_part.decode('latin-1', errors='ignore')
                    
                    # We can use a lightweight regex to extract attachments from BODYSTRUCTURE or fallback to full parse
                    # In python imaplib, BODYSTRUCTURE is returned as part of the fetch tuple
                    try:
                        # Fetch individual bodystructure if needed or extract
                        pass
                    except Exception:
                        pass
                        
                idx += 1

            # Alternatively, fetch using standard structured parser:
            for uid_bytes in chunk:
                if _stop_requested:
                    break
                uid_str = uid_bytes.decode('ascii')
                try:
                    # Fast fetch per UID: BODYSTRUCTURE and Envelope headers
                    t_uid, res_uid = client.uid('FETCH', uid_str, '(BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (FROM DATE SUBJECT MESSAGE-ID)])')
                    if t_uid == 'OK' and res_uid and res_uid[0]:
                        raw_meta = res_uid[0][0].decode('latin-1', errors='ignore') if isinstance(res_uid[0], tuple) else ""
                        raw_hdr = res_uid[0][1] if isinstance(res_uid[0], tuple) and len(res_uid[0]) > 1 else b""
                        
                        msg_obj = email.message_from_bytes(raw_hdr)
                        subject = decode_mime_header(msg_obj.get("Subject", "(Sin Asunto)"))
                        sender_raw = decode_mime_header(msg_obj.get("From", ""))
                        sender_name, sender_email = email.utils.parseaddr(sender_raw)
                        date_str = format_date_str(msg_obj.get("Date"))
                        message_id = str(msg_obj.get("Message-ID", "")).strip("<>")

                        # Parse Bodystructure representation
                        # Let's extract filenames, mime-types, and sizes from raw_meta using robust regex
                        # Examples in BODYSTRUCTURE: ("IMAGE" "JPEG" ("NAME" "photo.jpg") ... 1234567)
                        # Or ("APPLICATION" "PDF" ("NAME" "doc.pdf") ... 543210)
                        
                        # Match parts with filenames
                        part_matches = re.finditer(
                            r'\("(?P<main>[A-Za-z]+)"\s+"(?P<sub>[A-Za-z0-9_\-\.]+)"\s+.*?(?:NAME|filename)["\s]+(?P<fn>[^"]+)["\s].*?\s+(?P<size>\d+)\)',
                            raw_meta,
                            re.IGNORECASE
                        )
                        
                        found_parts = False
                        part_idx = 1
                        for pm in part_matches:
                            main_t = pm.group("main").lower()
                            sub_t = pm.group("sub").lower()
                            raw_fn = pm.group("fn")
                            fn = clean_filename_str(raw_fn)
                            sz = int(pm.group("size")) if pm.group("size") else 0
                            
                            batch_attachments.append({
                                "msg_uid": int(uid_str),
                                "folder": folder,
                                "message_id": message_id,
                                "gmail_msg_id": message_id,
                                "date": date_str,
                                "sender": sender_email or sender_raw,
                                "sender_name": sender_name or sender_raw,
                                "subject": subject,
                                "filename": fn,
                                "content_type": f"{main_t}/{sub_t}",
                                "size_bytes": sz,
                                "part_id": str(part_idx),
                                "encoding": "base64"
                            })
                            total_found += 1
                            found_parts = True
                            part_idx += 1

                        # Fallback for inline images / media without explicit "NAME" parameter
                        if not found_parts:
                            media_matches = re.finditer(
                                r'\("(?P<main>IMAGE|VIDEO|AUDIO)"\s+"(?P<sub>[A-Za-z0-9_\-\.]+)"\s+.*?base64\s+(?P<size>\d+)',
                                raw_meta,
                                re.IGNORECASE
                            )
                            for mm in media_matches:
                                sz = int(mm.group("size")) if mm.group("size") else 0
                                if sz > 10000: # Only real media, skip tiny 1px pixels
                                    m_type = mm.group("main").lower()
                                    s_type = mm.group("sub").lower()
                                    ext = ".jpg" if s_type == "jpeg" else f".{s_type}"
                                    fn = f"{m_type}_{uid_str}_{part_idx}{ext}"
                                    batch_attachments.append({
                                        "msg_uid": int(uid_str),
                                        "folder": folder,
                                        "message_id": message_id,
                                        "gmail_msg_id": message_id,
                                        "date": date_str,
                                        "sender": sender_email or sender_raw,
                                        "sender_name": sender_name or sender_raw,
                                        "subject": subject,
                                        "filename": fn,
                                        "content_type": f"{m_type}/{s_type}",
                                        "size_bytes": sz,
                                        "part_id": str(part_idx),
                                        "encoding": "base64"
                                    })
                                    total_found += 1
                                    part_idx += 1
                except Exception as ex_uid:
                    pass

                scanned_count += 1

            # Save batch to SQLite database
            if batch_attachments:
                batch_upsert_attachments(batch_attachments)
                batch_attachments.clear()

            # Update progress
            pct = int(20 + (scanned_count / total_uids) * 78)
            with _scan_lock:
                _sync_status["scanned_messages"] = scanned_count
                _sync_status["attachments_found"] = total_found
                _sync_status["percent"] = min(pct, 98)
                _sync_status["current_progress"] = f"Analizados {scanned_count} de {total_uids} correos ({total_found} adjuntos encontrados)..."

        # Done
        with _scan_lock:
            _sync_status["is_syncing"] = False
            _sync_status["percent"] = 100
            _sync_status["current_progress"] = f"Sincronización completada. Se encontraron {total_found} adjuntos."
        update_sync_state(email_user, int(all_uids[0]) if all_uids else 0, total_uids, False, f"Completado: {total_found} adjuntos")

    except Exception as e:
        print(f"Error in scan_gmail_attachments: {e}")
        with _scan_lock:
            _sync_status["is_syncing"] = False
            _sync_status["error"] = str(e)
            _sync_status["current_progress"] = f"Error: {str(e)}"
        update_sync_state(email_user, 0, 0, False, f"Error: {str(e)}")
    finally:
        if client:
            try:
                client.close()
                client.logout()
            except Exception:
                pass

def start_background_scan(email_user: str, max_emails: Optional[int] = None) -> threading.Thread:
    global _stop_requested
    _stop_requested = False
    thread = threading.Thread(target=scan_gmail_attachments_sync, args=(email_user, max_emails), daemon=True)
    thread.start()
    return thread

def stop_background_scan():
    global _stop_requested
    _stop_requested = True

def get_scan_status() -> Dict[str, Any]:
    with _scan_lock:
        return dict(_sync_status)

def download_attachment_bytes(att: Dict[str, Any]) -> Optional[bytes]:
    """
    Downloads the exact payload of an attachment on-demand via IMAP BODY.PEEK[part_id]
    or full message parse fallback.
    """
    client = None
    try:
        client = get_imap_client()
        folder = att.get("folder", "INBOX")
        client.select(f'"{folder}"', readonly=True)
        
        msg_uid = str(att["msg_uid"])
        part_id = str(att.get("part_id", "1"))
        
        # 1. Try fetching specific part first
        typ, data = client.uid('FETCH', msg_uid, f'(BODY.PEEK[{part_id}])')
        if typ == 'OK' and data and isinstance(data[0], tuple):
            raw_payload = data[0][1]
            encoding = (att.get("encoding") or "").lower()
            
            try:
                if 'base64' in encoding:
                    decoded = base64.b64decode(raw_payload)
                    return decoded
                elif 'quoted-printable' in encoding:
                    decoded = quopri.decodestring(raw_payload)
                    return decoded
                else:
                    # Try base64 anyway, else return raw
                    try:
                        return base64.b64decode(raw_payload)
                    except Exception:
                        return raw_payload
            except Exception:
                pass
                
        # 2. Fallback: Fetch complete RFC822 message and extract matching part
        typ, data = client.uid('FETCH', msg_uid, '(RFC822)')
        if typ == 'OK' and data and isinstance(data[0], tuple):
            msg = email.message_from_bytes(data[0][1])
            target_fn = (att.get("filename") or "").lower()
            
            for part in msg.walk():
                fn = part.get_filename()
                if fn:
                    decoded_fn = decode_mime_header(fn).lower()
                    if decoded_fn == target_fn or target_fn in decoded_fn:
                        payload = part.get_payload(decode=True)
                        if payload:
                            return payload
                            
                # Check by content-type if filename didn't match
                if att.get("content_type") and part.get_content_type() == att.get("content_type"):
                    payload = part.get_payload(decode=True)
                    if payload and len(payload) > 5000:
                        return payload

    except Exception as e:
        print(f"Error downloading attachment {att.get('id')}: {e}")
    finally:
        if client:
            try:
                client.close()
                client.logout()
            except Exception:
                pass
                
    return None

def fetch_and_cache_attachment(att_id: int) -> Tuple[Optional[Path], Optional[Path]]:
    """
    Downloads attachment if not cached, saves to .cache/attachments,
    generates thumbnail and updates database.
    Returns (cached_file_path, thumbnail_path).
    """
    att = get_attachment_by_id(att_id)
    if not att:
        return None, None

    cached_path = Path(att["cached_path"]) if att.get("cached_path") else None
    
    # Check if already cached on disk
    if cached_path and cached_path.exists() and cached_path.stat().st_size > 0:
        thumb_path = generate_thumbnail_from_file(cached_path, att_id, att.get("category", "images"))
        return cached_path, thumb_path

    # Download from Gmail
    data = download_attachment_bytes(att)
    if not data:
        return None, None

    # Save to cache
    safe_name = f"att_{att_id}_{att['clean_filename']}"
    file_path = ATTACHMENTS_CACHE_DIR / safe_name
    
    with open(file_path, "wb") as f:
        f.write(data)

    # Generate thumbnail
    thumb_path = generate_thumbnail_from_bytes(data, att_id, att.get("filename", ""), att.get("category", "images"))
    
    # Update DB
    update_attachment_cache(att_id, str(file_path), has_thumbnail=bool(thumb_path))
    
    return file_path, thumb_path
