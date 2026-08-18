/**
 * GMAIL ATTACHMENT EXPLORER - FRONTEND CLIENT
 */

const state = {
  category: 'all',
  sizePreset: null,
  search: '',
  sortBy: 'size_desc',
  viewMode: 'grid', // 'grid' | 'table'
  page: 1,
  pageSize: 60,
  totalPages: 1,
  totalItems: 0,
  items: [],
  selectedIds: new Set(),
  currentModalIndex: -1,
  isSyncing: false,
  account: null
};

// DOM Elements
const el = {
  // Navigation & Filters
  navItems: document.querySelectorAll('.nav-item[data-category]'),
  sizeItems: document.querySelectorAll('.nav-item[data-size]'),
  searchInput: document.getElementById('searchInput'),
  btnClearSearch: document.getElementById('btnClearSearch'),
  sortBySelect: document.getElementById('sortBySelect'),
  btnViewGrid: document.getElementById('btnViewGrid'),
  btnViewTable: document.getElementById('btnViewTable'),
  breadcrumbCategory: document.getElementById('breadcrumbCategory'),

  // Views & Containers
  attachmentsGrid: document.getElementById('attachmentsGrid'),
  attachmentsTableContainer: document.getElementById('attachmentsTableContainer'),
  attachmentsTableBody: document.getElementById('attachmentsTableBody'),
  loadingSkeleton: document.getElementById('loadingSkeleton'),
  emptyState: document.getElementById('emptyState'),
  emptyStateText: document.getElementById('emptyStateText'),

  // Selection & Stats
  selectAllCheckbox: document.getElementById('selectAllCheckbox'),
  tableSelectAll: document.getElementById('tableSelectAll'),
  itemsCountSummary: document.getElementById('itemsCountSummary'),
  btnBulkDownload: document.getElementById('btnBulkDownload'),
  selectedCount: document.getElementById('selectedCount'),
  btnSyncNow: document.getElementById('btnSyncNow'),

  // Pagination
  paginationBar: document.getElementById('paginationBar'),
  btnPrevPage: document.getElementById('btnPrevPage'),
  btnNextPage: document.getElementById('btnNextPage'),
  pageInfoText: document.getElementById('pageInfoText'),

  // Sync Progress Banner
  syncProgressBanner: document.getElementById('syncProgressBanner'),
  syncProgressText: document.getElementById('syncProgressText'),
  syncProgressBar: document.getElementById('syncProgressBar'),
  btnStopSync: document.getElementById('btnStopSync'),

  // Sidebar counters & storage
  countAll: document.getElementById('countAll'),
  countImages: document.getElementById('countImages'),
  countVideos: document.getElementById('countVideos'),
  countDocuments: document.getElementById('countDocuments'),
  countAudio: document.getElementById('countAudio'),
  countArchives: document.getElementById('countArchives'),
  countHuge: document.getElementById('countHuge'),
  totalStorageDisplay: document.getElementById('totalStorageDisplay'),
  barImages: document.getElementById('barImages'),
  barVideos: document.getElementById('barVideos'),
  barDocs: document.getElementById('barDocs'),
  barOther: document.getElementById('barOther'),

  // Account Card
  accountCard: document.getElementById('accountCard'),
  userAvatarLetter: document.getElementById('userAvatarLetter'),
  accountEmailDisplay: document.getElementById('accountEmailDisplay'),
  accountStatusTag: document.getElementById('accountStatusTag'),
  btnAccountSettings: document.getElementById('btnAccountSettings'),
  btnOpenConnectModal: document.getElementById('btnOpenConnectModal'),
  btnEmptySync: document.getElementById('btnEmptySync'),

  // Modals
  previewModal: document.getElementById('previewModal'),
  modalFileName: document.getElementById('modalFileName'),
  modalCategoryBadge: document.getElementById('modalCategoryBadge'),
  modalMediaContainer: document.getElementById('modalMediaContainer'),
  modalSize: document.getElementById('modalSize'),
  modalDate: document.getElementById('modalDate'),
  modalSender: document.getElementById('modalSender'),
  modalSubject: document.getElementById('modalSubject'),
  modalMime: document.getElementById('modalMime'),
  modalOpenGmailBtn: document.getElementById('modalOpenGmailBtn'),
  modalDownloadBtn: document.getElementById('modalDownloadBtn'),
  btnCloseModal: document.getElementById('btnCloseModal'),

  connectModal: document.getElementById('connectModal'),
  connectForm: document.getElementById('connectForm'),
  inputEmail: document.getElementById('inputEmail'),
  inputAppPassword: document.getElementById('inputAppPassword'),
  selectScanLimit: document.getElementById('selectScanLimit'),
  btnTogglePwd: document.getElementById('btnTogglePwd'),
  connectErrorAlert: document.getElementById('connectErrorAlert'),
  btnSubmitConnect: document.getElementById('btnSubmitConnect'),
  btnSubmitText: document.getElementById('btnSubmitText'),
  connectSpinner: document.getElementById('connectSpinner'),
  btnCancelConnect: document.getElementById('btnCancelConnect'),
  btnCloseConnectModal: document.getElementById('btnCloseConnectModal')
};

// ==========================================================================
// Formatting Helpers
// ==========================================================================

function formatBytes(bytes, decimals = 1) {
  if (!bytes || bytes === 0) return '0 B';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

function formatDate(dateString) {
  if (!dateString) return 'Desconocida';
  try {
    const d = new Date(dateString.replace(' ', 'T'));
    if (isNaN(d.getTime())) return dateString.substring(0, 10);
    return d.toLocaleDateString('es-ES', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return dateString.substring(0, 10);
  }
}

function getCategoryLabel(cat) {
  const map = {
    'all': 'Todos los Adjuntos',
    'images': 'Fotos e Imágenes',
    'videos': 'Videos y Clips',
    'documents': 'Documentos y PDFs',
    'audio': 'Audios y Grabaciones',
    'archives': 'Archivos Comprimidos',
    'others': 'Otros Archivos'
  };
  return map[cat] || 'Adjuntos';
}

function getCategoryIcon(cat, filename = '') {
  if (cat === 'images') return '🖼️';
  if (cat === 'videos') return '🎬';
  if (cat === 'audio') return '🎵';
  if (cat === 'documents') {
    if (filename.toLowerCase().endsWith('.pdf')) return '📕';
    if (filename.toLowerCase().match(/\.(doc|docx)$/)) return '📘';
    if (filename.toLowerCase().match(/\.(xls|xlsx|csv)$/)) return '📗';
    return '📄';
  }
  if (cat === 'archives') return '📦';
  return '📎';
}

function getGmailSearchUrl(att) {
  if (att.message_id) {
    return `https://mail.google.com/mail/u/0/#search/rfc822msgid%3A${encodeURIComponent(att.message_id)}`;
  }
  if (att.subject && att.subject !== '(Sin Asunto)') {
    return `https://mail.google.com/mail/u/0/#search/${encodeURIComponent(att.subject)}`;
  }
  if (att.sender) {
    return `https://mail.google.com/mail/u/0/#search/from%3A${encodeURIComponent(att.sender)}`;
  }
  return 'https://mail.google.com/mail/u/0/#inbox';
}

// ==========================================================================
// API Calls & Data Fetching
// ==========================================================================

async function fetchAuthStatus() {
  try {
    const res = await fetch('/api/auth/status');
    const data = await res.json();
    state.account = data;
    if (data.connected && data.email) {
      el.accountEmailDisplay.textContent = data.email;
      el.accountStatusTag.textContent = 'Conectado';
      el.accountStatusTag.classList.add('connected');
      el.userAvatarLetter.textContent = data.email[0].toUpperCase();
    } else {
      el.accountEmailDisplay.textContent = 'No conectado';
      el.accountStatusTag.textContent = 'Desconectado';
      el.accountStatusTag.classList.remove('connected');
      el.userAvatarLetter.textContent = 'G';
    }
  } catch (err) {
    console.error('Error fetching auth status:', err);
  }
}

async function fetchStats() {
  try {
    const res = await fetch('/api/stats');
    const data = await res.json();
    const ov = data.overview || {};

    el.countAll.textContent = (ov.total_count || 0).toLocaleString();
    el.countImages.textContent = (ov.images_count || 0).toLocaleString();
    el.countVideos.textContent = (ov.videos_count || 0).toLocaleString();
    el.countDocuments.textContent = (ov.documents_count || 0).toLocaleString();
    el.countAudio.textContent = (ov.audio_count || 0).toLocaleString();
    el.countArchives.textContent = (ov.archives_count || 0).toLocaleString();
    el.countHuge.textContent = (ov.huge_count || 0).toLocaleString();

    const totalBytes = ov.total_size || 0;
    el.totalStorageDisplay.textContent = formatBytes(totalBytes);

    if (totalBytes > 0) {
      el.barImages.style.width = `${((ov.images_size || 0) / totalBytes) * 100}%`;
      el.barVideos.style.width = `${((ov.videos_size || 0) / totalBytes) * 100}%`;
      el.barDocs.style.width = `${((ov.documents_size || 0) / totalBytes) * 100}%`;
      const otherSize = totalBytes - (ov.images_size || 0) - (ov.videos_size || 0) - (ov.documents_size || 0);
      el.barOther.style.width = `${Math.max(0, (otherSize / totalBytes) * 100)}%`;
    }
  } catch (err) {
    console.error('Error fetching stats:', err);
  }
}

async function loadAttachments() {
  el.loadingSkeleton.classList.remove('hidden');
  el.emptyState.classList.add('hidden');
  if (state.viewMode === 'grid') {
    el.attachmentsGrid.classList.add('hidden');
    el.attachmentsTableContainer.classList.add('hidden');
  } else {
    el.attachmentsTableContainer.classList.add('hidden');
    el.attachmentsGrid.classList.add('hidden');
  }

  const params = new URLSearchParams({
    page: state.page,
    page_size: state.pageSize,
    sort_by: state.sortBy
  });

  if (state.category && state.category !== 'all') {
    params.set('category', state.category);
  }
  if (state.sizePreset) {
    params.set('size_preset', state.sizePreset);
  }
  if (state.search.trim()) {
    params.set('search', state.search.trim());
  }

  try {
    const res = await fetch(`/api/attachments?${params.toString()}`);
    const data = await res.json();
    state.items = data.items || [];
    state.totalItems = data.total || 0;
    state.totalPages = data.total_pages || 1;

    renderView();
    updatePagination();
    fetchStats();
  } catch (err) {
    console.error('Error loading attachments:', err);
  } finally {
    el.loadingSkeleton.classList.add('hidden');
  }
}

// ==========================================================================
// Rendering
// ==========================================================================

function renderView() {
  const countStr = `${state.totalItems.toLocaleString()} ${state.totalItems === 1 ? 'adjunto' : 'adjuntos'}`;
  el.itemsCountSummary.textContent = state.totalItems > 0 ? countStr : '0 adjuntos';

  if (state.items.length === 0) {
    el.emptyState.classList.remove('hidden');
    if (state.search) {
      el.emptyStateText.textContent = `No se encontraron adjuntos que coincidan con "${state.search}".`;
    } else if (state.category !== 'all') {
      el.emptyStateText.textContent = `No hay adjuntos en la categoría ${getCategoryLabel(state.category)}.`;
    } else {
      el.emptyStateText.textContent = 'Aún no has sincronizado correos o no se encontraron archivos adjuntos.';
    }
    el.attachmentsGrid.classList.add('hidden');
    el.attachmentsTableContainer.classList.add('hidden');
    return;
  }

  el.emptyState.classList.add('hidden');

  if (state.viewMode === 'grid') {
    renderGrid(state.items);
    el.attachmentsGrid.classList.remove('hidden');
    el.attachmentsTableContainer.classList.add('hidden');
  } else {
    renderTable(state.items);
    el.attachmentsTableContainer.classList.remove('hidden');
    el.attachmentsGrid.classList.add('hidden');
  }

  updateSelectionUI();
}

function renderGrid(items) {
  el.attachmentsGrid.innerHTML = '';
  const fragment = document.createDocumentFragment();

  items.forEach((item, index) => {
    const card = document.createElement('div');
    const isHuge = item.size_bytes >= 26214400; // >= 25 MB
    const isLarge = item.size_bytes >= 10485760 && item.size_bytes < 26214400; // 10-25 MB
    const isSelected = state.selectedIds.has(item.id);

    card.className = `attachment-card ${isHuge ? 'huge-file' : ''} ${isSelected ? 'selected' : ''}`;
    card.dataset.id = item.id;
    card.dataset.index = index;

    // Badge styling
    let badgeClass = '';
    if (isHuge) badgeClass = 'badge-huge';
    else if (isLarge) badgeClass = 'badge-large';

    const gmailUrl = getGmailSearchUrl(item);
    const hasThumb = item.category === 'images' || item.has_thumbnail || item.filename.toLowerCase().endsWith('.pdf');
    const thumbUrl = `/api/attachments/${item.id}/thumbnail`;

    let previewContent = '';
    if (item.category === 'images') {
      previewContent = `<img class="card-img-preview" src="${thumbUrl}" alt="${escapeHtml(item.filename)}" loading="lazy" onerror="this.outerHTML='<span class=\\'card-icon-fallback\\'>🖼️</span>'">`;
    } else if (item.category === 'videos') {
      previewContent = `
        <span class="card-icon-fallback">🎬</span>
        <div class="card-video-overlay">
          <div class="play-btn-circle">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </div>
        </div>
      `;
    } else if (item.filename.toLowerCase().endsWith('.pdf')) {
      previewContent = `<img class="card-img-preview" src="${thumbUrl}" alt="${escapeHtml(item.filename)}" loading="lazy" onerror="this.outerHTML='<span class=\\'card-icon-fallback\\'>📕</span>'">`;
    } else {
      const icon = getCategoryIcon(item.category, item.filename);
      previewContent = `<span class="card-icon-fallback">${icon}</span>`;
    }

    card.innerHTML = `
      <input type="checkbox" class="card-checkbox" data-id="${item.id}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">
      <div class="card-preview-wrapper" onclick="openPreviewModal(${index})">
        ${previewContent}
        <span class="card-size-badge ${badgeClass}">${formatBytes(item.size_bytes)}</span>
      </div>
      <div class="card-body" onclick="openPreviewModal(${index})">
        <div class="card-title" title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</div>
        <div class="card-meta">
          <span class="card-sender" title="${escapeHtml(item.sender_name || item.sender)}">${escapeHtml(item.sender_name || item.sender || 'Gmail')}</span>
          <span class="card-date">${formatDate(item.date)}</span>
        </div>
        <div class="card-actions-quick" onclick="event.stopPropagation()">
          <a href="${gmailUrl}" target="_blank" class="btn-quick-gmail" title="Abrir correo original en Gmail">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor"><path d="M24 5.457v13.909c0 .904-.732 1.636-1.636 1.636h-3.819V11.73L12 16.64l-6.545-4.91v9.273H1.636A1.636 1.636 0 0 1 0 19.366V5.457c0-2.023 2.309-3.178 3.927-1.964L5.455 4.64 12 9.548l6.545-4.91 1.528-1.145C21.69 2.28 24 3.434 24 5.457z"/></svg>
            Gmail
          </a>
          <a href="/api/attachments/${item.id}/download" class="btn-icon" title="Descargar archivo" download>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </a>
        </div>
      </div>
    `;

    fragment.appendChild(card);
  });

  el.attachmentsGrid.appendChild(fragment);

  // Attach card checkbox change listeners
  el.attachmentsGrid.querySelectorAll('.card-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id);
      if (e.target.checked) {
        state.selectedIds.add(id);
      } else {
        state.selectedIds.delete(id);
      }
      const card = e.target.closest('.attachment-card');
      if (card) card.classList.toggle('selected', e.target.checked);
      updateSelectionUI();
    });
  });
}

function renderTable(items) {
  el.attachmentsTableBody.innerHTML = '';
  const fragment = document.createDocumentFragment();

  items.forEach((item, index) => {
    const row = document.createElement('tr');
    const isSelected = state.selectedIds.has(item.id);
    if (isSelected) row.classList.add('selected');
    row.dataset.id = item.id;
    row.dataset.index = index;

    const gmailUrl = getGmailSearchUrl(item);
    const thumbUrl = `/api/attachments/${item.id}/thumbnail`;
    const icon = getCategoryIcon(item.category, item.filename);

    let thumbHtml = `<span style="font-size: 20px;">${icon}</span>`;
    if (item.category === 'images' || item.has_thumbnail) {
      thumbHtml = `<img class="table-thumb" src="${thumbUrl}" alt="" loading="lazy" onerror="this.outerHTML='<span>${icon}</span>'">`;
    }

    row.innerHTML = `
      <td onclick="event.stopPropagation()"><input type="checkbox" class="table-row-cb" data-id="${item.id}" ${isSelected ? 'checked' : ''}></td>
      <td onclick="openPreviewModal(${index})">${thumbHtml}</td>
      <td onclick="openPreviewModal(${index})"><strong>${escapeHtml(item.filename)}</strong></td>
      <td onclick="openPreviewModal(${index})"><span class="size-pill">${formatBytes(item.size_bytes)}</span></td>
      <td onclick="openPreviewModal(${index})"><span class="preview-category-badge">${item.category.toUpperCase()}</span></td>
      <td onclick="openPreviewModal(${index})">${escapeHtml(item.sender_name || item.sender || 'Gmail')}</td>
      <td onclick="openPreviewModal(${index})" style="color: var(--text-secondary); max-width: 200px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.subject || '-')}</td>
      <td onclick="openPreviewModal(${index})" style="color: var(--text-muted); font-size: 12px;">${formatDate(item.date)}</td>
      <td onclick="event.stopPropagation()">
        <div style="display: flex; gap: 6px; align-items: center;">
          <a href="${gmailUrl}" target="_blank" class="btn-quick-gmail" title="Abrir en Gmail">Gmail</a>
          <a href="/api/attachments/${item.id}/download" class="btn-icon" title="Descargar" download>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
          </a>
        </div>
      </td>
    `;

    fragment.appendChild(row);
  });

  el.attachmentsTableBody.appendChild(fragment);

  // Row selection checkbox listeners
  el.attachmentsTableBody.querySelectorAll('.table-row-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = parseInt(e.target.dataset.id);
      if (e.target.checked) {
        state.selectedIds.add(id);
      } else {
        state.selectedIds.delete(id);
      }
      const row = e.target.closest('tr');
      if (row) row.classList.toggle('selected', e.target.checked);
      updateSelectionUI();
    });
  });
}

function updatePagination() {
  el.pageInfoText.textContent = `Página ${state.page} de ${state.totalPages || 1}`;
  el.btnPrevPage.disabled = state.page <= 1;
  el.btnNextPage.disabled = state.page >= state.totalPages;
}

function updateSelectionUI() {
  const count = state.selectedIds.size;
  el.selectedCount.textContent = count;
  if (count > 0) {
    el.btnBulkDownload.classList.remove('hidden');
  } else {
    el.btnBulkDownload.classList.add('hidden');
  }

  // Check if all on current page are selected
  const allCurrentSelected = state.items.length > 0 && state.items.every(it => state.selectedIds.has(it.id));
  el.selectAllCheckbox.checked = allCurrentSelected;
  el.tableSelectAll.checked = allCurrentSelected;
}

// ==========================================================================
// Preview Lightbox Modal
// ==========================================================================

function openPreviewModal(index) {
  if (index < 0 || index >= state.items.length) return;
  state.currentModalIndex = index;
  const item = state.items[index];

  el.modalFileName.textContent = item.filename;
  el.modalCategoryBadge.textContent = item.category.toUpperCase();
  el.modalSize.textContent = formatBytes(item.size_bytes);
  el.modalDate.textContent = item.date || 'Desconocida';
  el.modalSender.textContent = `${item.sender_name || ''} <${item.sender || ''}>`.trim();
  el.modalSubject.textContent = item.subject || '(Sin Asunto)';
  el.modalMime.textContent = item.content_type || 'application/octet-stream';

  const gmailUrl = getGmailSearchUrl(item);
  el.modalOpenGmailBtn.href = gmailUrl;
  el.modalDownloadBtn.onclick = () => {
    window.location.href = `/api/attachments/${item.id}/download`;
  };

  // Render media viewer
  const previewUrl = `/api/attachments/${item.id}/preview`;
  el.modalMediaContainer.innerHTML = '';

  if (item.category === 'images') {
    const img = document.createElement('img');
    img.src = previewUrl;
    img.alt = item.filename;
    el.modalMediaContainer.appendChild(img);
  } else if (item.category === 'videos') {
    const video = document.createElement('video');
    video.src = previewUrl;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    el.modalMediaContainer.appendChild(video);
  } else if (item.category === 'audio') {
    const audioWrapper = document.createElement('div');
    audioWrapper.style.textAlign = 'center';
    audioWrapper.innerHTML = `
      <div style="font-size: 64px; margin-bottom: 20px;">🎵</div>
      <audio controls autoplay src="${previewUrl}" style="width: 320px;"></audio>
    `;
    el.modalMediaContainer.appendChild(audioWrapper);
  } else if (item.filename.toLowerCase().endsWith('.pdf')) {
    const iframe = document.createElement('iframe');
    iframe.src = previewUrl;
    iframe.style.width = '100%';
    iframe.style.height = '100%';
    iframe.style.border = 'none';
    el.modalMediaContainer.appendChild(iframe);
  } else {
    const icon = getCategoryIcon(item.category, item.filename);
    const box = document.createElement('div');
    box.style.textAlign = 'center';
    box.innerHTML = `
      <div style="font-size: 80px; margin-bottom: 16px;">${icon}</div>
      <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 20px;">Vista previa no compatible en el navegador.</p>
      <a href="/api/attachments/${item.id}/download" class="btn-primary" download>Descargar para abrir</a>
    `;
    el.modalMediaContainer.appendChild(box);
  }

  el.previewModal.classList.remove('hidden');
}

function closePreviewModal() {
  el.previewModal.classList.add('hidden');
  el.modalMediaContainer.innerHTML = '';
  state.currentModalIndex = -1;
}

// ==========================================================================
// Sync & Background Status Polling
// ==========================================================================

let syncPollInterval = null;

async function checkSyncStatus() {
  try {
    const res = await fetch('/api/sync/status');
    const data = await res.json();
    
    if (data.is_syncing) {
      state.isSyncing = true;
      el.syncProgressBanner.classList.remove('hidden');
      el.syncProgressText.textContent = data.current_progress || 'Escaneando Gmail...';
      el.syncProgressBar.style.width = `${data.percent || 0}%`;
    } else {
      if (state.isSyncing) {
        // Just finished syncing!
        state.isSyncing = false;
        el.syncProgressBanner.classList.add('hidden');
        loadAttachments();
        fetchStats();
      }
    }
  } catch (err) {
    console.error('Error checking sync status:', err);
  }
}

function startSyncPolling() {
  if (syncPollInterval) clearInterval(syncPollInterval);
  syncPollInterval = setInterval(checkSyncStatus, 1500);
}

// ==========================================================================
// Event Listeners
// ==========================================================================

function initEvents() {
  // Category navigation
  el.navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      el.navItems.forEach(b => b.classList.remove('active'));
      el.sizeItems.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.category = btn.dataset.category;
      state.sizePreset = null;
      state.page = 1;
      el.breadcrumbCategory.textContent = getCategoryLabel(state.category);
      loadAttachments();
    });
  });

  // Size preset filters
  el.sizeItems.forEach(btn => {
    btn.addEventListener('click', () => {
      el.sizeItems.forEach(b => b.classList.remove('active'));
      el.navItems.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.sizePreset = btn.dataset.size;
      state.category = 'all';
      state.page = 1;
      el.breadcrumbCategory.textContent = `Tamaño: ${btn.querySelector('.nav-label').textContent}`;
      loadAttachments();
    });
  });

  // Live Search with Debounce
  let searchTimeout = null;
  el.searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    el.btnClearSearch.classList.toggle('hidden', !val);
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.search = val;
      state.page = 1;
      loadAttachments();
    }, 300);
  });

  el.btnClearSearch.addEventListener('click', () => {
    el.searchInput.value = '';
    el.btnClearSearch.classList.add('hidden');
    state.search = '';
    state.page = 1;
    loadAttachments();
  });

  // Sort change
  el.sortBySelect.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    state.page = 1;
    loadAttachments();
  });

  // View switchers
  el.btnViewGrid.addEventListener('click', () => {
    state.viewMode = 'grid';
    el.btnViewGrid.classList.add('active');
    el.btnViewTable.classList.remove('active');
    renderView();
  });

  el.btnViewTable.addEventListener('click', () => {
    state.viewMode = 'table';
    el.btnViewTable.classList.add('active');
    el.btnViewGrid.classList.remove('active');
    renderView();
  });

  // Pagination buttons
  el.btnPrevPage.addEventListener('click', () => {
    if (state.page > 1) {
      state.page--;
      loadAttachments();
    }
  });

  el.btnNextPage.addEventListener('click', () => {
    if (state.page < state.totalPages) {
      state.page++;
      loadAttachments();
    }
  });

  // Table header sorting
  document.querySelectorAll('.explorer-table th.sortable').forEach(th => {
    th.addEventListener('click', () => {
      const sortKey = th.dataset.sort;
      if (sortKey) {
        state.sortBy = sortKey;
        el.sortBySelect.value = sortKey;
        document.querySelectorAll('.explorer-table th.sortable').forEach(t => t.classList.remove('active'));
        th.classList.add('active');
        state.page = 1;
        loadAttachments();
      }
    });
  });

  // Select all checkbox
  const handleSelectAll = (checked) => {
    state.items.forEach(it => {
      if (checked) {
        state.selectedIds.add(it.id);
      } else {
        state.selectedIds.delete(it.id);
      }
    });
    renderView();
  };

  el.selectAllCheckbox.addEventListener('change', (e) => handleSelectAll(e.target.checked));
  el.tableSelectAll.addEventListener('change', (e) => handleSelectAll(e.target.checked));

  // Bulk Download ZIP
  el.btnBulkDownload.addEventListener('click', async () => {
    if (state.selectedIds.size === 0) return;
    const ids = Array.from(state.selectedIds);
    try {
      const res = await fetch('/api/attachments/bulk-download', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ attachment_ids: ids })
      });
      if (res.ok) {
        const blob = await res.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'adjuntos_gmail.zip';
        document.body.appendChild(a);
        a.click();
        a.remove();
      }
    } catch (err) {
      console.error('Error downloading bulk attachments:', err);
    }
  });

  // Sync actions
  el.btnSyncNow.addEventListener('click', () => {
    if (!state.account || !state.account.connected) {
      openConnectModal();
    } else {
      triggerSync();
    }
  });

  el.btnStopSync.addEventListener('click', async () => {
    await fetch('/api/sync/stop', { method: 'POST' });
  });

  // Modal navigation & keyboard controls
  el.btnCloseModal.addEventListener('click', closePreviewModal);
  el.previewModal.addEventListener('click', (e) => {
    if (e.target === el.previewModal) closePreviewModal();
  });

  window.addEventListener('keydown', (e) => {
    if (!el.previewModal.classList.contains('hidden')) {
      if (e.key === 'Escape') closePreviewModal();
      if (e.key === 'ArrowLeft' && state.currentModalIndex > 0) {
        openPreviewModal(state.currentModalIndex - 1);
      }
      if (e.key === 'ArrowRight' && state.currentModalIndex < state.items.length - 1) {
        openPreviewModal(state.currentModalIndex + 1);
      }
    }
  });

  // Connect Modal controls
  el.btnOpenConnectModal.addEventListener('click', openConnectModal);
  el.btnAccountSettings.addEventListener('click', openConnectModal);
  el.btnEmptySync.addEventListener('click', openConnectModal);
  el.btnCloseConnectModal.addEventListener('click', closeConnectModal);
  el.btnCancelConnect.addEventListener('click', closeConnectModal);

  el.btnTogglePwd.addEventListener('click', () => {
    const isPwd = el.inputAppPassword.type === 'password';
    el.inputAppPassword.type = isPwd ? 'text' : 'password';
    el.btnTogglePwd.textContent = isPwd ? '🔒' : '👁️';
  });

  el.connectForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = el.inputEmail.value.trim();
    const appPassword = el.inputAppPassword.value.trim();
    const maxEmails = parseInt(el.selectScanLimit.value) || null;

    el.connectErrorAlert.classList.add('hidden');
    el.btnSubmitText.textContent = 'Verificando con Gmail...';
    el.connectSpinner.classList.remove('hidden');
    el.btnSubmitConnect.disabled = true;

    try {
      const res = await fetch('/api/auth/connect', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, app_password: appPassword })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.detail || 'Error al conectar con Gmail.');
      }

      // Start scan
      await fetch('/api/sync/start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ max_emails: maxEmails === 0 ? null : maxEmails })
      });

      closeConnectModal();
      fetchAuthStatus();
      checkSyncStatus();
    } catch (err) {
      el.connectErrorAlert.textContent = err.message;
      el.connectErrorAlert.classList.remove('hidden');
    } finally {
      el.btnSubmitText.textContent = 'Conectar y Escanear';
      el.connectSpinner.classList.add('hidden');
      el.btnSubmitConnect.disabled = false;
    }
  });
}

function openConnectModal() {
  if (state.account && state.account.email) {
    el.inputEmail.value = state.account.email;
  }
  el.connectErrorAlert.classList.add('hidden');
  el.connectModal.classList.remove('hidden');
}

function closeConnectModal() {
  el.connectModal.classList.add('hidden');
}

async function triggerSync() {
  try {
    await fetch('/api/sync/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ max_emails: 1500 })
    });
    checkSyncStatus();
  } catch (err) {
    console.error('Error starting sync:', err);
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
}

// ==========================================================================
// Initialization
// ==========================================================================

async function init() {
  initEvents();
  await fetchAuthStatus();
  await fetchStats();
  await loadAttachments();
  startSyncPolling();
  checkSyncStatus();
}

window.addEventListener('DOMContentLoaded', init);
