import sys
import unittest
from pathlib import Path

# Add project root to sys.path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from backend.config import get_category
from backend.database import (
    init_db, upsert_attachment, query_attachments,
    get_stats, get_attachment_by_id, clear_all_data
)

class TestDatabaseAndQueries(unittest.TestCase):
    def setUp(self):
        init_db()
        clear_all_data()

    def test_category_detection(self):
        self.assertEqual(get_category("foto.jpg"), "images")
        self.assertEqual(get_category("video.mp4"), "videos")
        self.assertEqual(get_category("documento.pdf"), "documents")
        self.assertEqual(get_category("audio.mp3"), "audio")
        self.assertEqual(get_category("archivo.zip"), "archives")

    def test_upsert_and_size_sorting(self):
        # Insert sample items
        upsert_attachment({
            "msg_uid": 101,
            "folder": "INBOX",
            "message_id": "msg101@mail.gmail.com",
            "date": "2024-05-10 12:00:00",
            "sender": "juan@example.com",
            "sender_name": "Juan Perez",
            "subject": "Fotos de vacaciones",
            "filename": "playa_4k.jpg",
            "content_type": "image/jpeg",
            "size_bytes": 15 * 1024 * 1024, # 15 MB
            "part_id": "2"
        })

        upsert_attachment({
            "msg_uid": 102,
            "folder": "INBOX",
            "message_id": "msg102@mail.gmail.com",
            "date": "2024-05-11 14:30:00",
            "sender": "maria@example.com",
            "sender_name": "Maria Lopez",
            "subject": "Video de la fiesta",
            "filename": "fiesta_cumple.mp4",
            "content_type": "video/mp4",
            "size_bytes": 850 * 1024 * 1024, # 850 MB (Huge)
            "part_id": "2"
        })

        upsert_attachment({
            "msg_uid": 103,
            "folder": "INBOX",
            "message_id": "msg103@mail.gmail.com",
            "date": "2024-05-12 09:15:00",
            "sender": "empresa@corp.com",
            "sender_name": "Facturación",
            "subject": "Factura Mayo",
            "filename": "factura.pdf",
            "content_type": "application/pdf",
            "size_bytes": 250 * 1024, # 250 KB (Small)
            "part_id": "2"
        })

        # Query sorted by size descending (largest first)
        items, total = query_attachments(sort_by="size_desc")
        self.assertEqual(total, 3)
        self.assertEqual(items[0]["filename"], "fiesta_cumple.mp4")
        self.assertEqual(items[1]["filename"], "playa_4k.jpg")
        self.assertEqual(items[2]["filename"], "factura.pdf")

        # Query filtered by category
        img_items, img_total = query_attachments(category="images")
        self.assertEqual(img_total, 1)
        self.assertEqual(img_items[0]["filename"], "playa_4k.jpg")

        # Test stats
        stats = get_stats()
        self.assertEqual(stats["overview"]["total_count"], 3)
        self.assertEqual(stats["overview"]["videos_count"], 1)
        self.assertEqual(stats["overview"]["images_count"], 1)

if __name__ == "__main__":
    unittest.main()
