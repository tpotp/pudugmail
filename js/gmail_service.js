/**
 * PUDÚ GMAIL - GOOGLE IDENTITY & GMAIL REST API SERVICE
 * 100% Client-side interaction with Gmail via Google Identity Services (GIS).
 */

// Default OAuth 2.0 Client ID for Pudú Gmail on Vercel
// Authorized origins: https://pudugmail.vercel.app, https://*.vercel.app, http://localhost:8765, http://127.0.0.1:8765
const DEFAULT_GOOGLE_CLIENT_ID = '789234851234-pudugmailclientapp.apps.googleusercontent.com';

class GmailService {
  constructor() {
    this.accessToken = null;
    this.tokenClient = null;
    this.currentUser = null;
    this.isDemoMode = false;
    this.clientId = localStorage.getItem('pudu_gmail_client_id') || DEFAULT_GOOGLE_CLIENT_ID;
  }

  setClientId(clientId) {
    this.clientId = (clientId || DEFAULT_GOOGLE_CLIENT_ID).trim();
    localStorage.setItem('pudu_gmail_client_id', this.clientId);
    this.tokenClient = null; // reset token client to re-init
  }

  getClientId() {
    return this.clientId;
  }

  isCustomClientId() {
    return this.clientId !== DEFAULT_GOOGLE_CLIENT_ID;
  }

  initTokenClient(callback) {
    if (!window.google || !window.google.accounts || !window.google.accounts.oauth2) {
      console.warn('Google Identity Services (GIS) no está disponible en la ventana.');
      return false;
    }

    try {
      this.tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: this.clientId,
        scope: 'https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/gmail.readonly',
        callback: async (resp) => {
          if (resp.error) {
            console.error('Error de OAuth Token:', resp);
            if (callback) callback({ success: false, error: resp.error });
            return;
          }
          this.accessToken = resp.access_token;
          this.isDemoMode = false;
          const profile = await this.fetchUserProfile();
          if (callback) callback({ success: true, user: profile });
        },
      });
      return true;
    } catch (err) {
      console.error('Error inicializando GIS Token Client:', err);
      return false;
    }
  }

  loginWithGoogle(callback) {
    this.isDemoMode = false;
    
    // Check if GIS is loaded
    if (!window.google || !window.google.accounts) {
      // Retry once after 500ms
      setTimeout(() => {
        if (!window.google || !window.google.accounts) {
          if (callback) callback({ success: false, error: 'GIS_NOT_LOADED' });
          return;
        }
        this.executeLogin(callback);
      }, 500);
      return;
    }

    this.executeLogin(callback);
  }

  executeLogin(callback) {
    if (!this.tokenClient) {
      const ok = this.initTokenClient(callback);
      if (!ok) {
        if (callback) callback({ success: false, error: 'INIT_FAILED' });
        return;
      }
    }

    try {
      this.tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (e) {
      console.error('Error solicitando token:', e);
      if (callback) callback({ success: false, error: e.message });
    }
  }

  enableDemoMode() {
    this.isDemoMode = true;
    this.accessToken = null;
    this.currentUser = { emailAddress: 'puducito.demo@chile.cl', messagesTotal: 8 };
    return this.currentUser;
  }

  logout() {
    if (this.accessToken && window.google && window.google.accounts && window.google.accounts.oauth2) {
      try {
        google.accounts.oauth2.revoke(this.accessToken, () => {
          console.log('Token revocado.');
        });
      } catch (e) {}
    }
    this.accessToken = null;
    this.currentUser = null;
    this.isDemoMode = false;
  }

  async fetchUserProfile() {
    if (this.isDemoMode) return this.currentUser;
    if (!this.accessToken) return null;

    try {
      const res = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/profile', {
        headers: { Authorization: `Bearer ${this.accessToken}` }
      });
      if (res.ok) {
        this.currentUser = await res.json();
        return this.currentUser;
      }
    } catch (err) {
      console.error('Error obteniendo perfil de Gmail:', err);
    }
    return null;
  }

  async scanAttachments(onProgress, maxResults = 100) {
    if (this.isDemoMode) {
      if (onProgress) onProgress({ percent: 100, current: 8, total: 8, message: '¡Modo Demo cargado!' });
      return window.PUDU_DEMO_DATA;
    }

    if (!this.accessToken) {
      throw new Error('No hay sesión activa de Google. Por favor inicia sesión primero.');
    }

    if (onProgress) onProgress({ percent: 10, current: 0, total: 0, message: 'Buscando correos con adjuntos en Gmail...' });

    // 1. List messages with attachments
    const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=has%3Aattachment&maxResults=${maxResults}`;
    const listRes = await fetch(listUrl, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!listRes.ok) {
      const err = await listRes.json();
      throw new Error(err.error?.message || 'Error al conectar con la API de Gmail.');
    }

    const listData = await listRes.json();
    const messages = listData.messages || [];
    const totalMsgs = messages.length;

    if (totalMsgs === 0) {
      return [];
    }

    const attachmentsList = [];
    let scanned = 0;

    // 2. Fetch message details in concurrent batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < totalMsgs; i += BATCH_SIZE) {
      const chunk = messages.slice(i, i + BATCH_SIZE);

      await Promise.all(chunk.map(async (m) => {
        try {
          const detailUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`;
          const detailRes = await fetch(detailUrl, {
            headers: { Authorization: `Bearer ${this.accessToken}` }
          });

          if (!detailRes.ok) return;
          const msg = await detailRes.json();

          // Extract headers
          const headers = msg.payload?.headers || [];
          const getHeader = (name) => {
            const h = headers.find(x => x.name.toLowerCase() === name.toLowerCase());
            return h ? h.value : '';
          };

          const subject = getHeader('Subject') || '(Sin Asunto)';
          const senderRaw = getHeader('From') || 'Gmail';
          const dateRaw = getHeader('Date');
          const messageId = (getHeader('Message-ID') || '').replace(/[<>]/g, '');

          let senderName = senderRaw;
          let senderEmail = senderRaw;
          const match = senderRaw.match(/^(.*?)\s*<(.+)>$/);
          if (match) {
            senderName = match[1].replace(/["']/g, '').trim();
            senderEmail = match[2].trim();
          }

          // Recursive parse parts
          const extractParts = (parts) => {
            if (!parts || !Array.isArray(parts)) return;
            for (const p of parts) {
              if (p.filename && p.body && p.body.attachmentId) {
                const mime = (p.mimeType || 'application/octet-stream').toLowerCase();
                const fn = p.filename;
                const sz = p.body.size || 0;
                const cat = this.determineCategory(fn, mime);

                attachmentsList.push({
                  id: `${msg.id}_${p.body.attachmentId.substring(0, 16)}`,
                  msg_id: msg.id,
                  attachment_id: p.body.attachmentId,
                  message_id: messageId,
                  filename: fn,
                  content_type: mime,
                  category: cat,
                  size_bytes: sz,
                  date: this.formatDate(dateRaw, msg.internalDate),
                  sender: senderEmail,
                  sender_name: senderName,
                  subject: subject,
                  preview_url: null,
                  thumbnail_url: null,
                  status: 'active'
                });
              }

              if (p.parts) {
                extractParts(p.parts);
              }
            }
          };

          extractParts(msg.payload?.parts);
        } catch (e) {
          console.warn('Error al procesar mensaje:', e);
        }
      }));

      scanned += chunk.length;
      const pct = Math.round((scanned / totalMsgs) * 90) + 10;
      if (onProgress) {
        onProgress({
          percent: Math.min(pct, 98),
          current: scanned,
          total: totalMsgs,
          message: `Analizados ${scanned} de ${totalMsgs} correos (${attachmentsList.length} adjuntos encontrados)...`
        });
      }
    }

    if (onProgress) {
      onProgress({ percent: 100, current: totalMsgs, total: totalMsgs, message: `¡Listo! Se encontraron ${attachmentsList.length} adjuntos.` });
    }

    return attachmentsList;
  }

  async downloadAttachmentBlob(att) {
    if (this.isDemoMode || !att.attachment_id) {
      if (att.preview_url) {
        const res = await fetch(att.preview_url);
        return await res.blob();
      }
      return new Blob([`Contenido de demostración para ${att.filename}`], { type: att.content_type });
    }

    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${att.msg_id}/attachments/${att.attachment_id}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!res.ok) {
      throw new Error(`Error descargando adjunto ${att.filename}`);
    }

    const data = await res.json();
    const base64Data = data.data.replace(/-/g, '+').replace(/_/g, '/');
    const byteCharacters = atob(base64Data);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    return new Blob([byteArray], { type: att.content_type });
  }

  async moveMessageToTrash(msgId) {
    if (this.isDemoMode) {
      console.log(`[DEMO] Correo ${msgId} movido a la papelera.`);
      return true;
    }

    const url = `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msgId}/trash`;
    const res = await fetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${this.accessToken}` }
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error?.message || 'No se pudo mover el correo a la papelera de Gmail.');
    }
    return true;
  }

  determineCategory(filename, mimeType) {
    const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
    const mime = (mimeType || '').toLowerCase();

    if (['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.raw'].includes(ext) || mime.startsWith('image/')) {
      return 'images';
    }
    if (['.mp4', '.mov', '.mkv', '.avi', '.webm', '.m4v'].includes(ext) || mime.startsWith('video/')) {
      return 'videos';
    }
    if (['.mp3', '.wav', '.ogg', '.m4a', '.flac', '.aac'].includes(ext) || mime.startsWith('audio/')) {
      return 'audio';
    }
    if (['.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx', '.txt', '.csv'].includes(ext) || mime.includes('pdf') || mime.includes('word') || mime.includes('excel')) {
      return 'documents';
    }
    if (['.zip', '.rar', '.7z', '.tar', '.gz'].includes(ext) || mime.includes('zip') || mime.includes('compressed')) {
      return 'archives';
    }
    return 'others';
  }

  formatDate(dateStr, internalDate) {
    if (dateStr) {
      try {
        const d = new Date(dateStr);
        if (!isNaN(d.getTime())) {
          return d.toISOString().replace('T', ' ').substring(0, 19);
        }
      } catch (e) {}
    }
    if (internalDate) {
      try {
        const d = new Date(parseInt(internalDate));
        return d.toISOString().replace('T', ' ').substring(0, 19);
      } catch (e) {}
    }
    return new Date().toISOString().replace('T', ' ').substring(0, 19);
  }
}

window.puduGmailService = new GmailService();
