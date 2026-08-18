/**
 * PUDÚ GMAIL - MAIN APPLICATION CONTROLLER
 * Zero-backend Client Application for Vercel Free
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
  allAttachments: [],
  filteredAttachments: [],
  selectedIds: new Set(),
  currentModalIndex: -1,
  freedSpaceBytes: 0,
  isScanning: false
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
  emptyState: document.getElementById('emptyState'),
  emptyStateText: document.getElementById('emptyStateText'),
  btnLoadDemoEmpty: document.getElementById('btnLoadDemoEmpty'),

  // Selection & Counters
  selectAllCheckbox: document.getElementById('selectAllCheckbox'),
  tableSelectAll: document.getElementById('tableSelectAll'),
  itemsCountSummary: document.getElementById('itemsCountSummary'),
  floatingActionBar: document.getElementById('floatingActionBar'),
  selectedCountBadge: document.getElementById('selectedCountBadge'),
  selectedSizeLabel: document.getElementById('selectedSizeLabel'),
  btnMoveSelectedToDevice: document.getElementById('btnMoveSelectedToDevice'),
  btnDownloadSelectedZip: document.getElementById('btnDownloadSelectedZip'),
  btnDeleteSelected: document.getElementById('btnDeleteSelected'),
  btnClearSelection: document.getElementById('btnClearSelection'),

  // Sidebar counters & stats
  countAll: document.getElementById('countAll'),
  countImages: document.getElementById('countImages'),
  countVideos: document.getElementById('countVideos'),
  countDocuments: document.getElementById('countDocuments'),
  countAudio: document.getElementById('countAudio'),
  countArchives: document.getElementById('countArchives'),
  countHuge: document.getElementById('countHuge'),
  totalStorageDisplay: document.getElementById('totalStorageDisplay'),
  freedSpaceDisplay: document.getElementById('freedSpaceDisplay'),
  barImages: document.getElementById('barImages'),
  barVideos: document.getElementById('barVideos'),
  barDocs: document.getElementById('barDocs'),
  barOther: document.getElementById('barOther'),

  // Auth & Account
  btnSidebarGoogleLogin: document.getElementById('btnSidebarGoogleLogin'),
  btnModalGoogleLogin: document.getElementById('btnModalGoogleLogin'),
  btnSwitchAccount: document.getElementById('btnSwitchAccount'),
  accountEmailDisplay: document.getElementById('accountEmailDisplay'),
  accountStatusTag: document.getElementById('accountStatusTag'),
  btnOpenConnectModal: document.getElementById('btnOpenConnectModal'),
  btnSyncNow: document.getElementById('btnSyncNow'),

  // Sync Progress Banner
  syncProgressBanner: document.getElementById('syncProgressBanner'),
  syncProgressTitle: document.getElementById('syncProgressTitle'),
  syncProgressText: document.getElementById('syncProgressText'),
  syncProgressBar: document.getElementById('syncProgressBar'),
  syncPercentText: document.getElementById('syncPercentText'),

  // Lightbox Modal
  previewModal: document.getElementById('previewModal'),
  modalFileName: document.getElementById('modalFileName'),
  modalCategoryBadge: document.getElementById('modalCategoryBadge'),
  modalMediaContainer: document.getElementById('modalMediaContainer'),
  modalSize: document.getElementById('modalSize'),
  modalDate: document.getElementById('modalDate'),
  modalSender: document.getElementById('modalSender'),
  modalSubject: document.getElementById('modalSubject'),
  modalMime: document.getElementById('modalMime'),
  modalMoveToDeviceBtn: document.getElementById('modalMoveToDeviceBtn'),
  modalDownloadBtn: document.getElementById('modalDownloadBtn'),
  modalOpenGmailBtn: document.getElementById('modalOpenGmailBtn'),
  modalDeleteBtn: document.getElementById('modalDeleteBtn'),
  btnCloseModal: document.getElementById('btnCloseModal'),

  // Toast
  puduCelebrationToast: document.getElementById('puduCelebrationToast'),
  toastTitle: document.getElementById('toastTitle'),
  toastMessage: document.getElementById('toastMessage'),

  // Connect Modal & Forms
  connectModal: document.getElementById('connectModal'),
  btnCloseConnectModal: document.getElementById('btnCloseConnectModal'),
  btnLaunchDemo: document.getElementById('btnLaunchDemo'),
  oauthConfigForm: document.getElementById('oauthConfigForm'),
  inputGoogleClientId: document.getElementById('inputGoogleClientId'),
  oauthErrorAlert: document.getElementById('oauthErrorAlert'),

  // Pagination
  paginationBar: document.getElementById('paginationBar'),
  btnPrevPage: document.getElementById('btnPrevPage'),
  btnNextPage: document.getElementById('btnNextPage'),
  pageInfoText: document.getElementById('pageInfoText')
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
    return d.toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch (e) {
    return dateString.substring(0, 10);
  }
}

function getCategoryLabel(cat) {
  const map = {
    'all': 'Todos los Adjuntos',
    'images': 'Fotos e Imágenes',
    'videos': 'Videos y Grabaciones',
    'documents': 'Documentos y PDFs',
    'audio': 'Audios y Voz',
    'archives': 'Comprimidos (ZIP/RAR)',
    'others': 'Otros Archivos'
  };
  return map[cat] || 'Adjuntos';
}

function getCategoryIcon(cat, filename = '') {
  if (cat === 'images') return '🖼️';
  if (cat === 'videos') return '🎬';
  if (cat === 'audio') return '🎵';
  if (cat === 'documents') {
    const lower = (filename || '').toLowerCase();
    if (lower.endsWith('.pdf')) return '📕';
    if (lower.match(/\.(doc|docx)$/)) return '📘';
    if (lower.match(/\.(xls|xlsx|csv)$/)) return '📗';
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

function showToast(title, message) {
  el.toastTitle.textContent = title;
  el.toastMessage.textContent = message;
  el.puduCelebrationToast.classList.remove('hidden');
  setTimeout(() => {
    el.puduCelebrationToast.classList.add('hidden');
  }, 4000);
}

// ==========================================================================
// Filtering, Sorting & Stats Calculation
// ==========================================================================

function applyFiltersAndSort() {
  let list = state.allAttachments.filter(item => item.status !== 'trashed' && item.status !== 'moved');

  // Category filter
  if (state.category && state.category !== 'all') {
    list = list.filter(item => item.category === state.category);
  }

  // Size preset filter
  if (state.sizePreset) {
    if (state.sizePreset === 'huge') list = list.filter(item => item.size_bytes >= 26214400); // >= 25 MB
    else if (state.sizePreset === 'large') list = list.filter(item => item.size_bytes >= 10485760 && item.size_bytes < 26214400); // 10-25 MB
    else if (state.sizePreset === 'medium') list = list.filter(item => item.size_bytes >= 1048576 && item.size_bytes < 10485760); // 1-10 MB
    else if (state.sizePreset === 'small') list = list.filter(item => item.size_bytes < 1048576); // < 1 MB
  }

  // Search keyword
  if (state.search.trim()) {
    const q = state.search.toLowerCase().trim();
    list = list.filter(item =>
      (item.filename || '').toLowerCase().includes(q) ||
      (item.subject || '').toLowerCase().includes(q) ||
      (item.sender || '').toLowerCase().includes(q) ||
      (item.sender_name || '').toLowerCase().includes(q)
    );
  }

  // Sorting
  list.sort((a, b) => {
    if (state.sortBy === 'size_desc') return b.size_bytes - a.size_bytes;
    if (state.sortBy === 'size_asc') return a.size_bytes - b.size_bytes;
    if (state.sortBy === 'date_desc') return new Date(b.date || 0) - new Date(a.date || 0);
    if (state.sortBy === 'date_asc') return new Date(a.date || 0) - new Date(b.date || 0);
    if (state.sortBy === 'name_asc') return (a.filename || '').localeCompare(b.filename || '');
    if (state.sortBy === 'name_desc') return (b.filename || '').localeCompare(a.filename || '');
    return b.size_bytes - a.size_bytes;
  });

  state.filteredAttachments = list;
  state.totalPages = Math.max(1, Math.ceil(list.length / state.pageSize));
  if (state.page > state.totalPages) state.page = 1;

  renderView();
  updateSidebarStats();
}

function updateSidebarStats() {
  const active = state.allAttachments.filter(item => item.status !== 'trashed' && item.status !== 'moved');
  
  let totalBytes = 0;
  let imgCount = 0, imgBytes = 0;
  let vidCount = 0, vidBytes = 0;
  let docCount = 0, docBytes = 0;
  let audCount = 0, audBytes = 0;
  let arcCount = 0, arcBytes = 0;
  let hugeCount = 0;

  for (const it of active) {
    totalBytes += it.size_bytes || 0;
    if (it.size_bytes >= 26214400) hugeCount++;

    if (it.category === 'images') { imgCount++; imgBytes += it.size_bytes; }
    else if (it.category === 'videos') { vidCount++; vidBytes += it.size_bytes; }
    else if (it.category === 'documents') { docCount++; docBytes += it.size_bytes; }
    else if (it.category === 'audio') { audCount++; audBytes += it.size_bytes; }
    else if (it.category === 'archives') { arcCount++; arcBytes += it.size_bytes; }
  }

  el.countAll.textContent = active.length.toLocaleString();
  el.countImages.textContent = imgCount.toLocaleString();
  el.countVideos.textContent = vidCount.toLocaleString();
  el.countDocuments.textContent = docCount.toLocaleString();
  el.countAudio.textContent = audCount.toLocaleString();
  el.countArchives.textContent = arcCount.toLocaleString();
  el.countHuge.textContent = hugeCount.toLocaleString();

  el.totalStorageDisplay.textContent = formatBytes(totalBytes);
  el.freedSpaceDisplay.textContent = formatBytes(state.freedSpaceBytes);

  if (totalBytes > 0) {
    el.barImages.style.width = `${(imgBytes / totalBytes) * 100}%`;
    el.barVideos.style.width = `${(vidBytes / totalBytes) * 100}%`;
    el.barDocs.style.width = `${(docBytes / totalBytes) * 100}%`;
    const otherBytes = totalBytes - imgBytes - vidBytes - docBytes;
    el.barOther.style.width = `${Math.max(0, (otherBytes / totalBytes) * 100)}%`;
  } else {
    el.barImages.style.width = '0%';
    el.barVideos.style.width = '0%';
    el.barDocs.style.width = '0%';
    el.barOther.style.width = '0%';
  }
}

// ==========================================================================
// Rendering
// ==========================================================================

function renderView() {
  const total = state.filteredAttachments.length;
  el.itemsCountSummary.textContent = `${total.toLocaleString()} ${total === 1 ? 'adjunto' : 'adjuntos'}`;

  if (total === 0) {
    el.emptyState.classList.remove('hidden');
    el.attachmentsGrid.classList.add('hidden');
    el.attachmentsTableContainer.classList.add('hidden');
    if (state.search) {
      el.emptyStateText.textContent = `No se encontraron adjuntos que coincidan con "${state.search}".`;
    } else if (state.category !== 'all') {
      el.emptyStateText.textContent = `No hay adjuntos en la categoría ${getCategoryLabel(state.category)}.`;
    } else {
      el.emptyStateText.textContent = 'Tu bandeja está limpia o aún no has conectado tu cuenta.';
    }
    updateSelectionUI();
    updatePaginationUI();
    return;
  }

  el.emptyState.classList.add('hidden');

  const startIdx = (state.page - 1) * state.pageSize;
  const pageItems = state.filteredAttachments.slice(startIdx, startIdx + state.pageSize);

  if (state.viewMode === 'grid') {
    renderGrid(pageItems);
    el.attachmentsGrid.classList.remove('hidden');
    el.attachmentsTableContainer.classList.add('hidden');
  } else {
    renderTable(pageItems);
    el.attachmentsTableContainer.classList.remove('hidden');
    el.attachmentsGrid.classList.add('hidden');
  }

  updateSelectionUI();
  updatePaginationUI();
}

function renderGrid(items) {
  el.attachmentsGrid.innerHTML = '';
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const card = document.createElement('div');
    const isHuge = item.size_bytes >= 26214400; // >= 25 MB
    const isLarge = item.size_bytes >= 10485760 && item.size_bytes < 26214400; // 10-25 MB
    const isSelected = state.selectedIds.has(item.id);

    card.className = `attachment-card ${isHuge ? 'huge-file' : ''} ${isSelected ? 'selected' : ''}`;
    card.dataset.id = item.id;

    let badgeClass = '';
    if (isHuge) badgeClass = 'badge-huge';
    else if (isLarge) badgeClass = 'badge-large';

    const gmailUrl = getGmailSearchUrl(item);

    let previewContent = '';
    if (item.category === 'images' && (item.preview_url || item.thumbnail_url)) {
      previewContent = `<img class="card-img-preview" src="${item.preview_url || item.thumbnail_url}" alt="${escapeHtml(item.filename)}" loading="lazy">`;
    } else if (item.category === 'videos') {
      const poster = item.thumbnail_url ? `<img class="card-img-preview" src="${item.thumbnail_url}" alt="" loading="lazy">` : '';
      previewContent = `
        ${poster}
        <div class="card-video-overlay">
          <div class="play-btn-circle">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>
          </div>
        </div>
      `;
    } else {
      const icon = getCategoryIcon(item.category, item.filename);
      previewContent = `<span class="card-icon-fallback">${icon}</span>`;
    }

    card.innerHTML = `
      <input type="checkbox" class="card-checkbox" data-id="${item.id}" ${isSelected ? 'checked' : ''} onclick="event.stopPropagation()">
      <div class="card-preview-wrapper" onclick="openPreviewModal('${item.id}')">
        ${previewContent}
        <span class="card-size-badge ${badgeClass}">${formatBytes(item.size_bytes)}</span>
      </div>
      <div class="card-body" onclick="openPreviewModal('${item.id}')">
        <div class="card-title" title="${escapeHtml(item.filename)}">${escapeHtml(item.filename)}</div>
        <div class="card-meta">
          <span class="card-sender" title="${escapeHtml(item.sender_name || item.sender)}">${escapeHtml(item.sender_name || item.sender || 'Gmail')}</span>
          <span class="card-date">${formatDate(item.date)}</span>
        </div>
        <div class="card-actions-quick" onclick="event.stopPropagation()">
          <button class="btn-quick-move" onclick="handleMoveToDevice('${item.id}')" title="Descargar y enviar a la papelera de Gmail">
            📥➡️🗑️ Mover
          </button>
          <a href="${gmailUrl}" target="_blank" class="btn-quick-gmail" title="Abrir en Gmail">
            Gmail
          </a>
        </div>
      </div>
    `;

    fragment.appendChild(card);
  });

  el.attachmentsGrid.appendChild(fragment);

  // Checkbox listeners
  el.attachmentsGrid.querySelectorAll('.card-checkbox').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
      const card = e.target.closest('.attachment-card');
      if (card) card.classList.toggle('selected', e.target.checked);
      updateSelectionUI();
    });
  });
}

function renderTable(items) {
  el.attachmentsTableBody.innerHTML = '';
  const fragment = document.createDocumentFragment();

  items.forEach((item) => {
    const row = document.createElement('tr');
    const isSelected = state.selectedIds.has(item.id);
    if (isSelected) row.classList.add('selected');
    row.dataset.id = item.id;

    const gmailUrl = getGmailSearchUrl(item);
    const icon = getCategoryIcon(item.category, item.filename);

    let thumbHtml = `<span style="font-size: 20px;">${icon}</span>`;
    if (item.category === 'images' && (item.preview_url || item.thumbnail_url)) {
      thumbHtml = `<img class="table-thumb" src="${item.preview_url || item.thumbnail_url}" alt="" loading="lazy">`;
    }

    row.innerHTML = `
      <td onclick="event.stopPropagation()"><input type="checkbox" class="table-row-cb" data-id="${item.id}" ${isSelected ? 'checked' : ''}></td>
      <td onclick="openPreviewModal('${item.id}')">${thumbHtml}</td>
      <td onclick="openPreviewModal('${item.id}')"><strong>${escapeHtml(item.filename)}</strong></td>
      <td onclick="openPreviewModal('${item.id}')"><span class="size-pill">${formatBytes(item.size_bytes)}</span></td>
      <td onclick="openPreviewModal('${item.id}')"><span class="preview-category-badge">${item.category.toUpperCase()}</span></td>
      <td onclick="openPreviewModal('${item.id}')">${escapeHtml(item.sender_name || item.sender || 'Gmail')}</td>
      <td onclick="openPreviewModal('${item.id}')" style="color: var(--text-secondary); max-width: 180px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(item.subject || '-')}</td>
      <td onclick="openPreviewModal('${item.id}')" style="color: var(--text-muted); font-size: 12px;">${formatDate(item.date)}</td>
      <td onclick="event.stopPropagation()">
        <div style="display: flex; gap: 6px; align-items: center;">
          <button class="btn-quick-move" onclick="handleMoveToDevice('${item.id}')" title="Mover al Dispositivo (Descargar + Borrar)">📥➡️🗑️</button>
          <a href="${gmailUrl}" target="_blank" class="btn-quick-gmail" title="Abrir en Gmail">Gmail</a>
        </div>
      </td>
    `;

    fragment.appendChild(row);
  });

  el.attachmentsTableBody.appendChild(fragment);

  // Checkbox listeners
  el.attachmentsTableBody.querySelectorAll('.table-row-cb').forEach(cb => {
    cb.addEventListener('change', (e) => {
      const id = e.target.dataset.id;
      if (e.target.checked) state.selectedIds.add(id);
      else state.selectedIds.delete(id);
      const row = e.target.closest('tr');
      if (row) row.classList.toggle('selected', e.target.checked);
      updateSelectionUI();
    });
  });
}

function updateSelectionUI() {
  const count = state.selectedIds.size;
  if (count > 0) {
    let totalBytes = 0;
    state.allAttachments.forEach(it => {
      if (state.selectedIds.has(it.id)) totalBytes += it.size_bytes || 0;
    });

    el.selectedCountBadge.textContent = count;
    el.selectedSizeLabel.textContent = `(${formatBytes(totalBytes)})`;
    el.floatingActionBar.classList.remove('hidden');
  } else {
    el.floatingActionBar.classList.add('hidden');
  }

  const startIdx = (state.page - 1) * state.pageSize;
  const pageItems = state.filteredAttachments.slice(startIdx, startIdx + state.pageSize);
  const allSelected = pageItems.length > 0 && pageItems.every(it => state.selectedIds.has(it.id));
  el.selectAllCheckbox.checked = allSelected;
  el.tableSelectAll.checked = allSelected;
}

function updatePaginationUI() {
  el.pageInfoText.textContent = `Página ${state.page} de ${state.totalPages || 1}`;
  el.btnPrevPage.disabled = state.page <= 1;
  el.btnNextPage.disabled = state.page >= state.totalPages;
}

// ==========================================================================
// User Actions: Move to Device, Download, Delete
// ==========================================================================

async function handleMoveToDevice(attId) {
  const att = state.allAttachments.find(x => x.id === attId);
  if (!att) return;

  try {
    const blob = await window.puduGmailService.downloadAttachmentBlob(att);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);

    await window.puduGmailService.moveMessageToTrash(att.msg_id);

    att.status = 'moved';
    await window.puduStorage.updateAttachmentStatus(att.id, 'moved');

    state.freedSpaceBytes += att.size_bytes || 0;
    await window.puduStorage.setSetting('freed_space_bytes', state.freedSpaceBytes);

    showToast(
      '¡Pudú Postal Feliz! 🦌🎉',
      `Descargaste "${att.filename}" y liberaste ${formatBytes(att.size_bytes)} en tu Gmail.`
    );

    state.selectedIds.delete(att.id);
    closePreviewModal();
    applyFiltersAndSort();
  } catch (err) {
    alert(`Error al mover al dispositivo: ${err.message}`);
  }
}

async function handleDownloadSingle(attId) {
  const att = state.allAttachments.find(x => x.id === attId);
  if (!att) return;

  try {
    const blob = await window.puduGmailService.downloadAttachmentBlob(att);
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = att.filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  } catch (err) {
    alert(`Error al descargar: ${err.message}`);
  }
}

async function handleDeleteSingle(attId) {
  const att = state.allAttachments.find(x => x.id === attId);
  if (!att) return;

  if (!confirm(`¿Estás seguro de enviar a la papelera el correo que contiene "${att.filename}"?`)) {
    return;
  }

  try {
    await window.puduGmailService.moveMessageToTrash(att.msg_id);
    att.status = 'trashed';
    await window.puduStorage.updateAttachmentStatus(att.id, 'trashed');

    state.freedSpaceBytes += att.size_bytes || 0;
    await window.puduStorage.setSetting('freed_space_bytes', state.freedSpaceBytes);

    showToast('Correo en Papelera 🗑️', `Liberaste ${formatBytes(att.size_bytes)} en tu Gmail.`);
    state.selectedIds.delete(att.id);
    closePreviewModal();
    applyFiltersAndSort();
  } catch (err) {
    alert(`Error al borrar: ${err.message}`);
  }
}

// Bulk Actions
async function handleBulkMoveToDevice() {
  const ids = Array.from(state.selectedIds);
  if (ids.length === 0) return;

  if (!confirm(`¿Mover ${ids.length} archivos a tu dispositivo? Se descargarán y se enviarán sus correos a la papelera de Gmail para liberar espacio.`)) {
    return;
  }

  let totalFreed = 0;
  for (const id of ids) {
    const att = state.allAttachments.find(x => x.id === id);
    if (att) {
      try {
        const blob = await window.puduGmailService.downloadAttachmentBlob(att);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = att.filename;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 2000);

        await window.puduGmailService.moveMessageToTrash(att.msg_id);
        att.status = 'moved';
        await window.puduStorage.updateAttachmentStatus(att.id, 'moved');
        totalFreed += att.size_bytes || 0;
      } catch (e) {
        console.error('Error in bulk move item:', e);
      }
    }
  }

  state.freedSpaceBytes += totalFreed;
  await window.puduStorage.setSetting('freed_space_bytes', state.freedSpaceBytes);

  showToast('¡Operación Exitosa! 🦌🌿', `Se descargaron los archivos y liberaste ${formatBytes(totalFreed)}.`);
  state.selectedIds.clear();
  applyFiltersAndSort();
}

async function handleBulkDownloadZip() {
  const ids = Array.from(state.selectedIds);
  if (ids.length === 0) return;

  if (!window.JSZip) {
    alert('La biblioteca JSZip no está cargada.');
    return;
  }

  const zip = new JSZip();
  showToast('Comprimiendo ZIP... 📦', `Preparando ${ids.length} archivos en el navegador...`);

  for (const id of ids) {
    const att = state.allAttachments.find(x => x.id === id);
    if (att) {
      try {
        const blob = await window.puduGmailService.downloadAttachmentBlob(att);
        zip.file(att.filename, blob);
      } catch (e) {
        console.error('Error adding file to zip:', e);
      }
    }
  }

  const content = await zip.generateAsync({ type: 'blob' });
  const url = URL.createObjectURL(content);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'pudugmail_adjuntos.zip';
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

async function handleBulkDelete() {
  const ids = Array.from(state.selectedIds);
  if (ids.length === 0) return;

  if (!confirm(`¿Estás seguro de enviar a la papelera los correos de los ${ids.length} archivos seleccionados?`)) {
    return;
  }

  let totalFreed = 0;
  for (const id of ids) {
    const att = state.allAttachments.find(x => x.id === id);
    if (att) {
      try {
        await window.puduGmailService.moveMessageToTrash(att.msg_id);
        att.status = 'trashed';
        await window.puduStorage.updateAttachmentStatus(att.id, 'trashed');
        totalFreed += att.size_bytes || 0;
      } catch (e) {
        console.error('Error trashing message:', e);
      }
    }
  }

  state.freedSpaceBytes += totalFreed;
  await window.puduStorage.setSetting('freed_space_bytes', state.freedSpaceBytes);

  showToast('Correos a la Papelera 🗑️', `Liberaste ${formatBytes(totalFreed)} en tu Gmail.`);
  state.selectedIds.clear();
  applyFiltersAndSort();
}

// ==========================================================================
// Lightbox Modal
// ==========================================================================

function openPreviewModal(attId) {
  const index = state.filteredAttachments.findIndex(x => x.id === attId);
  if (index < 0) return;
  state.currentModalIndex = index;
  const item = state.filteredAttachments[index];

  el.modalFileName.textContent = item.filename;
  el.modalCategoryBadge.textContent = item.category.toUpperCase();
  el.modalSize.textContent = formatBytes(item.size_bytes);
  el.modalDate.textContent = formatDate(item.date);
  el.modalSender.textContent = `${item.sender_name || ''} <${item.sender || ''}>`.trim();
  el.modalSubject.textContent = item.subject || '(Sin Asunto)';
  el.modalMime.textContent = item.content_type || 'application/octet-stream';

  const gmailUrl = getGmailSearchUrl(item);
  el.modalOpenGmailBtn.href = gmailUrl;

  el.modalMoveToDeviceBtn.onclick = () => handleMoveToDevice(item.id);
  el.modalDownloadBtn.onclick = () => handleDownloadSingle(item.id);
  el.modalDeleteBtn.onclick = () => handleDeleteSingle(item.id);

  el.modalMediaContainer.innerHTML = '';

  if (item.category === 'images' && (item.preview_url || item.thumbnail_url)) {
    const img = document.createElement('img');
    img.src = item.preview_url || item.thumbnail_url;
    img.alt = item.filename;
    el.modalMediaContainer.appendChild(img);
  } else if (item.category === 'videos' && item.preview_url) {
    const video = document.createElement('video');
    video.src = item.preview_url;
    video.controls = true;
    video.autoplay = true;
    video.playsInline = true;
    el.modalMediaContainer.appendChild(video);
  } else if (item.category === 'audio' && item.preview_url) {
    const box = document.createElement('div');
    box.style.textAlign = 'center';
    box.innerHTML = `
      <div style="font-size: 64px; margin-bottom: 20px;">🎵</div>
      <audio controls autoplay src="${item.preview_url}" style="width: 320px;"></audio>
    `;
    el.modalMediaContainer.appendChild(box);
  } else {
    const icon = getCategoryIcon(item.category, item.filename);
    const box = document.createElement('div');
    box.style.textAlign = 'center';
    box.innerHTML = `
      <div style="font-size: 80px; margin-bottom: 16px;">${icon}</div>
      <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 20px;">Archivo listo para descargar.</p>
      <button class="btn-pudu-primary" onclick="handleDownloadSingle('${item.id}')">Descargar ${escapeHtml(item.filename)}</button>
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
// Google OAuth & Sync
// ==========================================================================

function handleGoogleLogin() {
  window.puduGmailService.loginWithGoogle(async (res) => {
    if (res.success) {
      el.accountEmailDisplay.textContent = res.user?.emailAddress || 'Conectado';
      el.accountStatusTag.textContent = 'Google Conectado';
      el.accountStatusTag.classList.add('active');
      closeConnectModal();
      showToast('¡Sesión Iniciada! 🦌✉️', `Conectado como ${res.user?.emailAddress || 'usuario de Gmail'}`);
      startScan();
    } else {
      if (res.error === 'GIS_NOT_LOADED') {
        alert('Cargando servicios de Google... Por favor inténtalo de nuevo en unos segundos.');
      } else {
        openConnectModal();
        el.oauthErrorAlert.textContent = `Error al conectar con Google: ${res.error || 'Cancelado'}`;
        el.oauthErrorAlert.classList.remove('hidden');
      }
    }
  });
}

async function startScan() {
  if (state.isScanning) return;
  state.isScanning = true;

  el.syncProgressBanner.classList.remove('hidden');
  el.syncProgressTitle.textContent = 'El Pudú está buscando tus adjuntos...';
  el.syncProgressText.textContent = 'Iniciando escaneo...';
  el.syncProgressBar.style.width = '10%';
  el.syncPercentText.textContent = '10%';

  try {
    const results = await window.puduGmailService.scanAttachments((prog) => {
      el.syncProgressText.textContent = prog.message;
      el.syncProgressBar.style.width = `${prog.percent}%`;
      el.syncPercentText.textContent = `${prog.percent}%`;
    });

    state.allAttachments = results;
    await window.puduStorage.saveAttachments(results);

    showToast('¡Escaneo Listo! 🦌✨', `Se encontraron ${results.length} adjuntos en tu bandeja.`);
    applyFiltersAndSort();
  } catch (err) {
    alert(`Error al escanear Gmail: ${err.message}`);
  } finally {
    state.isScanning = false;
    setTimeout(() => {
      el.syncProgressBanner.classList.add('hidden');
    }, 1200);
  }
}

// ==========================================================================
// Event Listeners & Initialization
// ==========================================================================

function initEvents() {
  // Google Sign In Triggers
  if (el.btnSidebarGoogleLogin) el.btnSidebarGoogleLogin.addEventListener('click', handleGoogleLogin);
  if (el.btnModalGoogleLogin) el.btnModalGoogleLogin.addEventListener('click', handleGoogleLogin);
  if (el.btnSwitchAccount) el.btnSwitchAccount.addEventListener('click', openConnectModal);

  // Category tabs
  el.navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      el.navItems.forEach(b => b.classList.remove('active'));
      el.sizeItems.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.category = btn.dataset.category;
      state.sizePreset = null;
      state.page = 1;
      el.breadcrumbCategory.textContent = getCategoryLabel(state.category);
      applyFiltersAndSort();
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
      applyFiltersAndSort();
    });
  });

  // Live search
  let searchTimeout = null;
  el.searchInput.addEventListener('input', (e) => {
    const val = e.target.value;
    el.btnClearSearch.classList.toggle('hidden', !val);
    clearTimeout(searchTimeout);
    searchTimeout = setTimeout(() => {
      state.search = val;
      state.page = 1;
      applyFiltersAndSort();
    }, 200);
  });

  el.btnClearSearch.addEventListener('click', () => {
    el.searchInput.value = '';
    el.btnClearSearch.classList.add('hidden');
    state.search = '';
    state.page = 1;
    applyFiltersAndSort();
  });

  // Sort selector
  el.sortBySelect.addEventListener('change', (e) => {
    state.sortBy = e.target.value;
    state.page = 1;
    applyFiltersAndSort();
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
        applyFiltersAndSort();
      }
    });
  });

  // Pagination
  el.btnPrevPage.addEventListener('click', () => {
    if (state.page > 1) { state.page--; renderView(); }
  });
  el.btnNextPage.addEventListener('click', () => {
    if (state.page < state.totalPages) { state.page++; renderView(); }
  });

  // Select all checkbox
  const handleSelectAll = (checked) => {
    const startIdx = (state.page - 1) * state.pageSize;
    const pageItems = state.filteredAttachments.slice(startIdx, startIdx + state.pageSize);
    pageItems.forEach(it => {
      if (checked) state.selectedIds.add(it.id);
      else state.selectedIds.delete(it.id);
    });
    renderView();
  };

  el.selectAllCheckbox.addEventListener('change', (e) => handleSelectAll(e.target.checked));
  el.tableSelectAll.addEventListener('change', (e) => handleSelectAll(e.target.checked));

  // Floating Action Bar buttons
  el.btnMoveSelectedToDevice.addEventListener('click', handleBulkMoveToDevice);
  el.btnDownloadSelectedZip.addEventListener('click', handleBulkDownloadZip);
  el.btnDeleteSelected.addEventListener('click', handleBulkDelete);
  el.btnClearSelection.addEventListener('click', () => {
    state.selectedIds.clear();
    renderView();
  });

  // Sync / Scan button
  el.btnSyncNow.addEventListener('click', () => {
    if (window.puduGmailService.accessToken || window.puduGmailService.isDemoMode) {
      startScan();
    } else {
      handleGoogleLogin();
    }
  });

  // Demo launch button
  el.btnLaunchDemo.addEventListener('click', () => {
    window.puduGmailService.enableDemoMode();
    state.allAttachments = window.PUDU_DEMO_DATA;
    window.puduStorage.saveAttachments(window.PUDU_DEMO_DATA);
    el.accountEmailDisplay.textContent = 'puducito.demo@chile.cl';
    el.accountStatusTag.textContent = 'Modo Demo Activo';
    closeConnectModal();
    showToast('¡Modo Demo Activo! 🦌✨', 'Datos de prueba de pudúes cargados con éxito.');
    applyFiltersAndSort();
  });

  el.btnLoadDemoEmpty.addEventListener('click', () => {
    el.btnLaunchDemo.click();
  });

  // Custom OAuth Form
  el.oauthConfigForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const clientId = el.inputGoogleClientId.value.trim();
    if (clientId) {
      window.puduGmailService.setClientId(clientId);
      showToast('Client ID Guardado ⚙️', 'Se actualizó tu ID de cliente de Google.');
      el.oauthErrorAlert.classList.add('hidden');
    }
  });

  // Modal Open/Close
  el.btnOpenConnectModal.addEventListener('click', openConnectModal);
  el.btnCloseConnectModal.addEventListener('click', closeConnectModal);

  // Lightbox navigation & shortcuts
  el.btnCloseModal.addEventListener('click', closePreviewModal);
  el.previewModal.addEventListener('click', (e) => {
    if (e.target === el.previewModal) closePreviewModal();
  });

  window.addEventListener('keydown', (e) => {
    if (!el.previewModal.classList.contains('hidden')) {
      if (e.key === 'Escape') closePreviewModal();
      if (e.key === 'ArrowLeft' && state.currentModalIndex > 0) {
        const prevItem = state.filteredAttachments[state.currentModalIndex - 1];
        if (prevItem) openPreviewModal(prevItem.id);
      }
      if (e.key === 'ArrowRight' && state.currentModalIndex < state.filteredAttachments.length - 1) {
        const nextItem = state.filteredAttachments[state.currentModalIndex + 1];
        if (nextItem) openPreviewModal(nextItem.id);
      }
    }
  });
}

function openConnectModal() {
  el.inputGoogleClientId.value = window.puduGmailService.getClientId();
  el.oauthErrorAlert.classList.add('hidden');
  el.connectModal.classList.remove('hidden');
}

function closeConnectModal() {
  el.connectModal.classList.add('hidden');
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
// Bootstrapping
// ==========================================================================

async function init() {
  initEvents();

  state.freedSpaceBytes = await window.puduStorage.getSetting('freed_space_bytes', 0);

  const cached = await window.puduStorage.getAllAttachments();
  if (cached && cached.length > 0) {
    state.allAttachments = cached;
  } else {
    state.allAttachments = window.PUDU_DEMO_DATA;
    await window.puduStorage.saveAttachments(window.PUDU_DEMO_DATA);
  }

  applyFiltersAndSort();
}

window.addEventListener('DOMContentLoaded', init);
