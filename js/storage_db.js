/**
 * PUDÚ GMAIL - CLIENT-SIDE INDEXEDDB STORAGE
 * Stores cached attachment metadata, thumbnails, trash state and user preferences in browser.
 */

const DB_NAME = 'PuduGmailDB';
const DB_VERSION = 1;

class PuduStorage {
  constructor() {
    this.db = null;
    this.initPromise = this.init();
  }

  async init() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        
        // Attachments store
        if (!db.objectStoreNames.contains('attachments')) {
          const attStore = db.createObjectStore('attachments', { keyPath: 'id' });
          attStore.createIndex('size_bytes', 'size_bytes', { unique: false });
          attStore.createIndex('category', 'category', { unique: false });
          attStore.createIndex('date', 'date', { unique: false });
          attStore.createIndex('msg_id', 'msg_id', { unique: false });
          attStore.createIndex('status', 'status', { unique: false }); // 'active' | 'trashed' | 'moved'
        }

        // Settings & stats store
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }
      };

      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve(this.db);
      };

      request.onerror = (e) => {
        console.error('IndexedDB open error:', e.target.error);
        reject(e.target.error);
      };
    });
  }

  async ensureDb() {
    if (!this.db) {
      await this.initPromise;
    }
    return this.db;
  }

  async saveAttachments(items) {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('attachments', 'readwrite');
      const store = tx.objectStore('attachments');

      for (const item of items) {
        store.put(item);
      }

      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getAllAttachments() {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('attachments', 'readonly');
      const store = tx.objectStore('attachments');
      const req = store.getAll();

      req.onsuccess = () => resolve(req.result || []);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async updateAttachmentStatus(id, newStatus) {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('attachments', 'readwrite');
      const store = tx.objectStore('attachments');
      const getReq = store.get(id);

      getReq.onsuccess = () => {
        const item = getReq.result;
        if (item) {
          item.status = newStatus;
          store.put(item);
          resolve(true);
        } else {
          resolve(false);
        }
      };
      getReq.onerror = (e) => reject(e.target.error);
    });
  }

  async removeAttachment(id) {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('attachments', 'readwrite');
      const store = tx.objectStore('attachments');
      const req = store.delete(id);

      req.onsuccess = () => resolve(true);
      req.onerror = (e) => reject(e.target.error);
    });
  }

  async clearAll() {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(['attachments', 'settings'], 'readwrite');
      tx.objectStore('attachments').clear();
      tx.objectStore('settings').clear();
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }

  async getSetting(key, defaultValue = null) {
    const db = await this.ensureDb();
    return new Promise((resolve) => {
      const tx = db.transaction('settings', 'readonly');
      const req = tx.objectStore('settings').get(key);
      req.onsuccess = () => {
        resolve(req.result ? req.result.value : defaultValue);
      };
      req.onerror = () => resolve(defaultValue);
    });
  }

  async setSetting(key, value) {
    const db = await this.ensureDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('settings', 'readwrite');
      tx.objectStore('settings').put({ key, value });
      tx.oncomplete = () => resolve(true);
      tx.onerror = (e) => reject(e.target.error);
    });
  }
}

window.puduStorage = new PuduStorage();
