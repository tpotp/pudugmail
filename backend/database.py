import sqlite3
import json
from typing import List, Dict, Any, Optional, Tuple
from pathlib import Path
from backend.config import DB_PATH, get_category

def get_connection() -> sqlite3.Connection:
    conn = sqlite3.connect(str(DB_PATH), check_same_thread=False)
    conn.row_factory = sqlite3.Row
    # Enable WAL mode for high concurrency and speed
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn

def init_db():
    conn = get_connection()
    with conn:
        conn.execute("""
        CREATE TABLE IF NOT EXISTS attachments (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            msg_uid INTEGER NOT NULL,
            folder TEXT NOT NULL,
            message_id TEXT,
            gmail_msg_id TEXT,
            date TEXT,
            sender TEXT,
            sender_name TEXT,
            subject TEXT,
            filename TEXT NOT NULL,
            clean_filename TEXT,
            content_type TEXT,
            category TEXT,
            size_bytes INTEGER DEFAULT 0,
            part_id TEXT NOT NULL,
            encoding TEXT,
            has_thumbnail INTEGER DEFAULT 0,
            cached_path TEXT,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            UNIQUE(folder, msg_uid, part_id)
        )
        """)

        # Performance Indexes
        conn.execute("CREATE INDEX IF NOT EXISTS idx_size_bytes ON attachments(size_bytes DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_category ON attachments(category);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_date ON attachments(date DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_filename ON attachments(filename);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_msg_uid ON attachments(folder, msg_uid);")

        # Sync state table
        conn.execute("""
        CREATE TABLE IF NOT EXISTS sync_state (
            account_email TEXT PRIMARY KEY,
            last_synced_uid INTEGER DEFAULT 0,
            total_messages INTEGER DEFAULT 0,
            last_sync_time TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            is_syncing INTEGER DEFAULT 0,
            current_progress TEXT
        )
        """)

        # Account credentials / configuration storage
        conn.execute("""
        CREATE TABLE IF NOT EXISTS accounts (
            email TEXT PRIMARY KEY,
            app_password TEXT,
            imap_server TEXT DEFAULT 'imap.gmail.com',
            imap_port INTEGER DEFAULT 993,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
        """)
    conn.close()

def save_account(email: str, app_password: str, imap_server: str = "imap.gmail.com", imap_port: int = 993):
    conn = get_connection()
    with conn:
        conn.execute("""
        INSERT INTO accounts (email, app_password, imap_server, imap_port)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(email) DO UPDATE SET
            app_password = excluded.app_password,
            imap_server = excluded.imap_server,
            imap_port = excluded.imap_port
        """, (email.strip().lower(), app_password.strip(), imap_server, imap_port))
    conn.close()

def get_account() -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute("SELECT email, app_password, imap_server, imap_port FROM accounts LIMIT 1").fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def clear_account():
    conn = get_connection()
    with conn:
        conn.execute("DELETE FROM accounts")
        conn.execute("DELETE FROM sync_state")
    conn.close()

def upsert_attachment(att: Dict[str, Any]) -> int:
    conn = get_connection()
    category = get_category(att.get("filename", ""), att.get("content_type", ""))
    clean_filename = Path(att.get("filename", "")).name
    with conn:
        cursor = conn.execute("""
        INSERT INTO attachments (
            msg_uid, folder, message_id, gmail_msg_id, date, sender, sender_name,
            subject, filename, clean_filename, content_type, category, size_bytes,
            part_id, encoding, has_thumbnail, cached_path
        ) VALUES (
            :msg_uid, :folder, :message_id, :gmail_msg_id, :date, :sender, :sender_name,
            :subject, :filename, :clean_filename, :content_type, :category, :size_bytes,
            :part_id, :encoding, :has_thumbnail, :cached_path
        )
        ON CONFLICT(folder, msg_uid, part_id) DO UPDATE SET
            message_id = excluded.message_id,
            gmail_msg_id = excluded.gmail_msg_id,
            date = excluded.date,
            sender = excluded.sender,
            sender_name = excluded.sender_name,
            subject = excluded.subject,
            filename = excluded.filename,
            clean_filename = excluded.clean_filename,
            content_type = excluded.content_type,
            category = excluded.category,
            size_bytes = excluded.size_bytes,
            encoding = excluded.encoding
        """, {
            "msg_uid": att.get("msg_uid"),
            "folder": att.get("folder", "INBOX"),
            "message_id": att.get("message_id", ""),
            "gmail_msg_id": att.get("gmail_msg_id", ""),
            "date": att.get("date", ""),
            "sender": att.get("sender", ""),
            "sender_name": att.get("sender_name", ""),
            "subject": att.get("subject", ""),
            "filename": att.get("filename", "unnamed_attachment"),
            "clean_filename": clean_filename,
            "content_type": att.get("content_type", "application/octet-stream"),
            "category": category,
            "size_bytes": att.get("size_bytes", 0),
            "part_id": str(att.get("part_id", "1")),
            "encoding": att.get("encoding", "base64"),
            "has_thumbnail": att.get("has_thumbnail", 0),
            "cached_path": att.get("cached_path", None)
        })
        inserted_id = cursor.lastrowid
    conn.close()
    return inserted_id

def batch_upsert_attachments(attachments: List[Dict[str, Any]]):
    if not attachments:
        return
    conn = get_connection()
    with conn:
        for att in attachments:
            category = get_category(att.get("filename", ""), att.get("content_type", ""))
            clean_filename = Path(att.get("filename", "")).name
            conn.execute("""
            INSERT INTO attachments (
                msg_uid, folder, message_id, gmail_msg_id, date, sender, sender_name,
                subject, filename, clean_filename, content_type, category, size_bytes,
                part_id, encoding, has_thumbnail, cached_path
            ) VALUES (
                :msg_uid, :folder, :message_id, :gmail_msg_id, :date, :sender, :sender_name,
                :subject, :filename, :clean_filename, :content_type, :category, :size_bytes,
                :part_id, :encoding, :has_thumbnail, :cached_path
            )
            ON CONFLICT(folder, msg_uid, part_id) DO UPDATE SET
                message_id = excluded.message_id,
                gmail_msg_id = excluded.gmail_msg_id,
                date = excluded.date,
                sender = excluded.sender,
                sender_name = excluded.sender_name,
                subject = excluded.subject,
                filename = excluded.filename,
                clean_filename = excluded.clean_filename,
                content_type = excluded.content_type,
                category = excluded.category,
                size_bytes = excluded.size_bytes,
                encoding = excluded.encoding
            """, {
                "msg_uid": att.get("msg_uid"),
                "folder": att.get("folder", "INBOX"),
                "message_id": att.get("message_id", ""),
                "gmail_msg_id": att.get("gmail_msg_id", ""),
                "date": att.get("date", ""),
                "sender": att.get("sender", ""),
                "sender_name": att.get("sender_name", ""),
                "subject": att.get("subject", ""),
                "filename": att.get("filename", "unnamed_attachment"),
                "clean_filename": clean_filename,
                "content_type": att.get("content_type", "application/octet-stream"),
                "category": category,
                "size_bytes": att.get("size_bytes", 0),
                "part_id": str(att.get("part_id", "1")),
                "encoding": att.get("encoding", "base64"),
                "has_thumbnail": att.get("has_thumbnail", 0),
                "cached_path": att.get("cached_path", None)
            })
    conn.close()

def update_attachment_cache(att_id: int, cached_path: str, has_thumbnail: bool = False):
    conn = get_connection()
    with conn:
        conn.execute("""
        UPDATE attachments 
        SET cached_path = ?, has_thumbnail = CASE WHEN ? THEN 1 ELSE has_thumbnail END
        WHERE id = ?
        """, (cached_path, 1 if has_thumbnail else 0, att_id))
    conn.close()

def get_attachment_by_id(att_id: int) -> Optional[Dict[str, Any]]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM attachments WHERE id = ?", (att_id,)).fetchone()
    conn.close()
    if row:
        return dict(row)
    return None

def query_attachments(
    category: Optional[str] = None,
    search: Optional[str] = None,
    min_size: Optional[int] = None,
    max_size: Optional[int] = None,
    size_preset: Optional[str] = None,
    sort_by: str = "size_desc",
    page: int = 1,
    page_size: int = 50
) -> Tuple[List[Dict[str, Any]], int]:
    conn = get_connection()
    
    where_clauses = ["1=1"]
    params = []

    if category and category != "all":
        where_clauses.append("category = ?")
        params.append(category)

    if search:
        search_term = f"%{search.strip()}%"
        where_clauses.append("(filename LIKE ? OR subject LIKE ? OR sender LIKE ? OR sender_name LIKE ?)")
        params.extend([search_term, search_term, search_term, search_term])

    if size_preset:
        if size_preset == "huge": # > 25 MB
            where_clauses.append("size_bytes >= ?")
            params.append(25 * 1024 * 1024)
        elif size_preset == "large": # 10 MB - 25 MB
            where_clauses.append("size_bytes >= ? AND size_bytes < ?")
            params.extend([10 * 1024 * 1024, 25 * 1024 * 1024])
        elif size_preset == "medium": # 1 MB - 10 MB
            where_clauses.append("size_bytes >= ? AND size_bytes < ?")
            params.extend([1 * 1024 * 1024, 10 * 1024 * 1024])
        elif size_preset == "small": # < 1 MB
            where_clauses.append("size_bytes < ?")
            params.append(1 * 1024 * 1024)

    if min_size is not None:
        where_clauses.append("size_bytes >= ?")
        params.append(min_size)
    if max_size is not None:
        where_clauses.append("size_bytes <= ?")
        params.append(max_size)

    where_sql = " AND ".join(where_clauses)

    # Sort order
    order_map = {
        "size_desc": "size_bytes DESC, date DESC",
        "size_asc": "size_bytes ASC, date DESC",
        "date_desc": "date DESC, size_bytes DESC",
        "date_asc": "date ASC, size_bytes DESC",
        "name_asc": "filename ASC",
        "name_desc": "filename DESC"
    }
    order_sql = order_map.get(sort_by, "size_bytes DESC, date DESC")

    # Count total
    count_cursor = conn.execute(f"SELECT COUNT(*) as total FROM attachments WHERE {where_sql}", params)
    total = count_cursor.fetchone()["total"]

    # Fetch page
    offset = (page - 1) * page_size
    query_sql = f"""
    SELECT id, msg_uid, folder, message_id, gmail_msg_id, date, sender, sender_name,
           subject, filename, clean_filename, content_type, category, size_bytes,
           part_id, has_thumbnail, cached_path
    FROM attachments 
    WHERE {where_sql}
    ORDER BY {order_sql}
    LIMIT ? OFFSET ?
    """
    
    rows = conn.execute(query_sql, params + [page_size, offset]).fetchall()
    conn.close()
    
    return [dict(r) for r in rows], total

def get_stats() -> Dict[str, Any]:
    conn = get_connection()
    
    stats_query = """
    SELECT 
        COUNT(*) as total_count,
        COALESCE(SUM(size_bytes), 0) as total_size,
        COALESCE(SUM(CASE WHEN category = 'images' THEN 1 ELSE 0 END), 0) as images_count,
        COALESCE(SUM(CASE WHEN category = 'images' THEN size_bytes ELSE 0 END), 0) as images_size,
        COALESCE(SUM(CASE WHEN category = 'videos' THEN 1 ELSE 0 END), 0) as videos_count,
        COALESCE(SUM(CASE WHEN category = 'videos' THEN size_bytes ELSE 0 END), 0) as videos_size,
        COALESCE(SUM(CASE WHEN category = 'documents' THEN 1 ELSE 0 END), 0) as documents_count,
        COALESCE(SUM(CASE WHEN category = 'documents' THEN size_bytes ELSE 0 END), 0) as documents_size,
        COALESCE(SUM(CASE WHEN category = 'audio' THEN 1 ELSE 0 END), 0) as audio_count,
        COALESCE(SUM(CASE WHEN category = 'audio' THEN size_bytes ELSE 0 END), 0) as audio_size,
        COALESCE(SUM(CASE WHEN category = 'archives' THEN 1 ELSE 0 END), 0) as archives_count,
        COALESCE(SUM(CASE WHEN category = 'archives' THEN size_bytes ELSE 0 END), 0) as archives_size,
        COALESCE(SUM(CASE WHEN size_bytes >= 26214400 THEN 1 ELSE 0 END), 0) as huge_count,
        COALESCE(SUM(CASE WHEN size_bytes >= 26214400 THEN size_bytes ELSE 0 END), 0) as huge_size
    FROM attachments
    """
    row = conn.execute(stats_query).fetchone()
    
    # Largest 5 files
    largest_rows = conn.execute("""
    SELECT id, filename, category, size_bytes, date, sender, subject 
    FROM attachments 
    ORDER BY size_bytes DESC 
    LIMIT 5
    """).fetchall()

    conn.close()
    
    return {
        "overview": dict(row) if row else {},
        "largest_files": [dict(r) for r in largest_rows]
    }

def update_sync_state(email: str, last_uid: int, total_msgs: int, is_syncing: bool, progress_msg: str):
    conn = get_connection()
    with conn:
        conn.execute("""
        INSERT INTO sync_state (account_email, last_synced_uid, total_messages, last_sync_time, is_syncing, current_progress)
        VALUES (?, ?, ?, CURRENT_TIMESTAMP, ?, ?)
        ON CONFLICT(account_email) DO UPDATE SET
            last_synced_uid = excluded.last_synced_uid,
            total_messages = excluded.total_messages,
            last_sync_time = CURRENT_TIMESTAMP,
            is_syncing = excluded.is_syncing,
            current_progress = excluded.current_progress
        """, (email.lower(), last_uid, total_msgs, 1 if is_syncing else 0, progress_msg))
    conn.close()

def get_sync_state(email: str) -> Dict[str, Any]:
    conn = get_connection()
    row = conn.execute("SELECT * FROM sync_state WHERE account_email = ?", (email.lower(),)).fetchone()
    conn.close()
    if row:
        return dict(row)
    return {"is_syncing": 0, "current_progress": "Sin actividad", "total_messages": 0, "last_synced_uid": 0}

def clear_all_data():
    conn = get_connection()
    with conn:
        conn.execute("DELETE FROM attachments")
        conn.execute("DELETE FROM sync_state")
    conn.close()
