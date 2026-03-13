// popup.js v2.0 - WhatsApp Bulk Sender con Plantillas

let isSending = false;
let stopRequested = false;
let templates = [];
let editingTemplateId = null;

// ─── Elementos del DOM ─────────────────────────────────────────
const phonesEl = document.getElementById('phones');
const delayInput = document.getElementById('delay');
const btnSend = document.getElementById('btnSend');
const progressSection = document.getElementById('progressSection');
const progressFill = document.getElementById('progressFill');
const progressCount = document.getElementById('progressCount');
const currentPhoneEl = document.getElementById('currentPhone');
const logEl = document.getElementById('log');
const templateSelect = document.getElementById('templateSelect');
const templatePreview = document.getElementById('templatePreview');
const templatePreviewContent = document.getElementById('templatePreviewContent');

// ─── Check WhatsApp tab ───────────────────────────────────────
async function checkWhatsAppTab() {
  const statusDot = document.getElementById('statusDot');
  const statusText = document.getElementById('statusText');
  
  try {
    const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
    if (tabs.length > 0) {
      statusDot.classList.add('connected');
      statusText.textContent = 'WhatsApp Web abierto';
    } else {
      statusDot.classList.remove('connected');
      statusText.textContent = 'Abrí WhatsApp Web';
    }
  } catch (err) {
    statusText.textContent = 'Error verificando';
  }
}
checkWhatsAppTab();

// ─── Plantillas ───────────────────────────────────────────────
const TEMPLATES_KEY = 'messageTemplates';

function generateId() {
  return 'tpl_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function loadTemplates() {
  return new Promise(resolve => {
    chrome.storage.local.get([TEMPLATES_KEY], data => {
      resolve(data[TEMPLATES_KEY] || []);
    });
  });
}

function saveTemplates(tpls) {
  return new Promise(resolve => {
    chrome.storage.local.set({ [TEMPLATES_KEY]: tpls }, resolve);
  });
}

async function renderTemplateList() {
  templates = await loadTemplates();
  const list = document.getElementById('templateList');
  
  if (templates.length === 0) {
    list.innerHTML = '<div class="empty-state"><p>No hay plantillas aún</p></div>';
    return;
  }

  list.innerHTML = templates.map(t => `
    <div class="template-item" data-id="${t.id}">
      <div class="template-item-header">
        <span class="template-item-name">${escapeHtml(t.name)}</span>
        <div class="template-item-actions">
          <button class="btn-secondary btn-edit" data-id="${t.id}" style="padding:4px 8px;font-size:10px;">✏️</button>
          <button class="btn-danger btn-delete" data-id="${t.id}" style="padding:4px 8px;">✕</button>
        </div>
      </div>
      <div class="template-item-preview">${escapeHtml(t.messageBefore || 'Sin mensaje antes')}</div>
      <div class="template-item-meta">
        ${t.images?.length ? `<span>🖼️ ${t.images.length} imagen${t.images.length > 1 ? 'es' : ''}</span>` : ''}
        ${t.attachments?.length ? `<span>📎 ${t.attachments.length} archivo${t.attachments.length > 1 ? 's' : ''}</span>` : ''}
        ${t.messageAfter ? `<span>💬</span>` : ''}
      </div>
    </div>
  `).join('');

  templateSelect.innerHTML = '<option value="">-- Elegir plantilla --</option>' + 
    templates.map(t => `<option value="${t.id}">${escapeHtml(t.name)}</option>`).join('');
}

function showTemplateEditor(template = null) {
  document.getElementById('templateListView').style.display = 'none';
  document.getElementById('templateEditor').classList.add('active');
  
  if (template) {
    editingTemplateId = template.id;
    document.getElementById('editorTitle').textContent = 'Editar plantilla';
    document.getElementById('templateName').value = template.name || '';
    document.getElementById('messageBefore').value = template.messageBefore || '';
    document.getElementById('messageAfter').value = template.messageAfter || '';
    window.currentImages = template.images || [];
    window.currentAttachments = template.attachments || [];
    renderFilesList('images', window.currentImages);
    renderFilesList('attachments', window.currentAttachments);
  } else {
    editingTemplateId = null;
    document.getElementById('editorTitle').textContent = 'Nueva plantilla';
    document.getElementById('templateName').value = '';
    document.getElementById('messageBefore').value = '';
    document.getElementById('messageAfter').value = '';
    window.currentImages = [];
    window.currentAttachments = [];
    document.getElementById('imagesList').style.display = 'none';
    document.getElementById('imagesPlaceholder').style.display = 'flex';
    document.getElementById('attachmentsList').style.display = 'none';
    document.getElementById('attachmentsPlaceholder').style.display = 'flex';
  }
}

function hideTemplateEditor() {
  document.getElementById('templateListView').style.display = 'block';
  document.getElementById('templateEditor').classList.remove('active');
  editingTemplateId = null;
  renderTemplateList();
}

async function saveTemplate() {
  const name = document.getElementById('templateName').value.trim();
  if (!name) { alert('Ingresá un nombre para la plantilla'); return; }

  const template = {
    id: editingTemplateId || generateId(),
    name: name,
    messageBefore: document.getElementById('messageBefore').value.trim(),
    messageAfter: document.getElementById('messageAfter').value.trim(),
    images: window.currentImages || [],
    attachments: window.currentAttachments || [],
    createdAt: editingTemplateId ? templates.find(t => t.id === editingTemplateId)?.createdAt : new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };

  if (editingTemplateId) {
    const idx = templates.findIndex(t => t.id === editingTemplateId);
    if (idx >= 0) templates[idx] = template;
  } else {
    templates.push(template);
  }

  await saveTemplates(templates);
  window.currentImages = [];
  window.currentAttachments = [];
  hideTemplateEditor();
}

async function deleteTemplate(id) {
  if (!confirm('¿Eliminar esta plantilla?')) return;
  templates = templates.filter(t => t.id !== id);
  await saveTemplates(templates);
  renderTemplateList();
}

// ─── File handling ─────────────────────────────────────────────
window.currentImages = [];
window.currentAttachments = [];

async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

async function handleImageUpload(files) {
  for (const file of files) {
    if (!file.type.startsWith('image/')) continue;
    const base64 = await fileToBase64(file);
    window.currentImages.push({
      name: file.name,
      data: base64,
      mime: file.type
    });
  }
  renderFilesList('images', window.currentImages);
}

async function handleAttachmentUpload(files) {
  for (const file of files) {
    const base64 = await fileToBase64(file);
    window.currentAttachments.push({
      name: file.name,
      data: base64,
      mime: file.type
    });
  }
  renderFilesList('attachments', window.currentAttachments);
}

function renderFilesList(type, files) {
  const list = document.getElementById(type + 'List');
  const placeholder = document.getElementById(type + 'Placeholder');
  const area = document.getElementById(type + 'Area');
  
  if (files.length === 0) {
    list.style.display = 'none';
    placeholder.style.display = 'flex';
    area.classList.remove('has-files');
    return;
  }

  list.style.display = 'flex';
  placeholder.style.display = 'none';
  area.classList.add('has-files');

  const isImage = type === 'images';
  list.innerHTML = files.map((f, i) => `
    <div class="file-item">
      ${isImage ? `<img src="data:${f.mime};base64,${f.data}">` : `<div class="file-icon">📄</div>`}
      <span class="file-name">${escapeHtml(f.name)}</span>
      <span class="file-remove" data-type="${type}" data-index="${i}">✕</span>
    </div>
  `).join('');
}

function removeFile(type, index) {
  if (type === 'images') {
    window.currentImages = window.currentImages.filter((_, i) => i !== index);
    renderFilesList('images', window.currentImages);
  } else {
    window.currentAttachments = window.currentAttachments.filter((_, i) => i !== index);
    renderFilesList('attachments', window.currentAttachments);
  }
}

// ─── Contactos - Soporta números simples y CSV ─────────────────────
const DEFAULT_COUNTRY_CODE = '+54';

function formatPhone(phone) {
  let p = phone.trim().replace(/\s+/g, '');
  if (!p) return '';
  if (p.length > 4) {
    if (!p.startsWith('+')) {
      if (p.startsWith('54')) p = '+' + p;
      else if (p.startsWith('0')) p = '+54' + p.substring(1);
      else p = DEFAULT_COUNTRY_CODE + p;
    }
  }
  return p;
}

// Detectar si es CSV (tiene tabs, comas o punto y coma con múltiples columnas)
function isCSV(text) {
  const firstLine = text.split('\n')[0];
  if (!firstLine) return false;
  const separators = ['\t', ';', ','];
  for (const sep of separators) {
    const parts = firstLine.split(sep);
    if (parts.length > 1) return true;
  }
  return false;
}

function parseContacts(text) {
  if (!text.trim()) return { contacts: [], headers: [] };
  
  // Si no es CSV, parsear como números simples
  if (!isCSV(text)) {
    const phones = text.split(/[,;\n]+/).map(p => {
      const phone = formatPhone(p);
      if (phone) return { _telefono: phone, telefono: phone };
      return null;
    }).filter(p => p !== null);
    return { contacts: phones, headers: ['telefono'] };
  }
  
  // Es CSV
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length === 0) return { contacts: [], headers: [] };

  let separator = '\t';
  const firstLine = lines[0];
  if (firstLine.includes(';')) separator = ';';
  else if (firstLine.includes(',')) separator = ',';

  const headers = lines[0].split(separator).map(h => h.trim().toLowerCase());
  const contacts = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(separator).map(v => v.trim());
    const contact = {};
    headers.forEach((h, idx) => {
      contact[h] = values[idx] || '';
    });
    const telefono = contact.telefono || contact.phone || contact.celular || contact.cel || values[0] || '';
    if (telefono) contact._telefono = formatPhone(telefono);
    contacts.push(contact);
  }

  return { contacts, headers };
}

function detectVariables(headers) {
  const known = ['telefono', 'phone', 'celular', 'cel', 'nombre', 'name', 'email', 'correo', 'empresa', 'company', 'direccion', 'address'];
  return headers.filter(h => known.includes(h));
}

function replaceVariables(text, contact) {
  if (!text) return '';
  return text.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    const lowerKey = key.toLowerCase();
    const value = contact[lowerKey] || contact[key] || match;
    return value;
  });
}

// ─── Envío de mensajes ─────────────────────────────────────────
function logMsg(type, msg) {
  logEl.classList.add('visible');
  const span = document.createElement('div');
  span.className = 'log-' + type;
  span.textContent = msg;
  logEl.appendChild(span);
  logEl.scrollTop = logEl.scrollHeight;
}

function updateProgress(current, total, phone) {
  const pct = Math.round((current / total) * 100);
  progressFill.style.width = pct + '%';
  progressCount.textContent = `${current} / ${total}`;
  currentPhoneEl.textContent = phone;
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function sendMessage(tabId, payload) {
  return new Promise(resolve => {
    chrome.tabs.sendMessage(tabId, { action: 'doSend', ...payload }, res => {
      if (chrome.runtime.lastError) {
        resolve({ success: false, error: chrome.runtime.lastError.message });
      } else {
        resolve(res || { success: false, error: 'Sin respuesta' });
      }
    });
  });
}

async function injectContentScript(tabId) {
  await chrome.scripting.executeScript({ target: { tabId }, files: ['content.js'] });
}

function waitForTabLoad(tabId) {
  return new Promise(resolve => {
    function listener(updatedTabId, changeInfo) {
      if (updatedTabId === tabId && changeInfo.status === 'complete') {
        chrome.tabs.onUpdated.removeListener(listener);
        resolve();
      }
    }
    chrome.tabs.onUpdated.addListener(listener);
    setTimeout(() => {
      chrome.tabs.onUpdated.removeListener(listener);
      resolve();
    }, 12000);
  });
}

btnSend.addEventListener('click', async () => {
  if (isSending) {
    stopRequested = true;
    return;
  }

  const templateId = templateSelect.value;
  if (!templateId) { logMsg('err', 'Seleccioná una plantilla'); return; }

  const template = templates.find(t => t.id === templateId);
  if (!template) { logMsg('err', 'Plantilla no encontrada'); return; }

  const { contacts } = parseContacts(phonesEl.value);
  const validContacts = contacts.filter(c => c._telefono);
  if (validContacts.length === 0) { logMsg('err', 'No hay contactos válidos'); return; }

  const tabs = await chrome.tabs.query({ url: 'https://web.whatsapp.com/*' });
  if (tabs.length === 0) { logMsg('err', 'Abrí WhatsApp Web primero'); return; }

  const tabId = tabs[0].id;
  const delay = Math.max(2, parseInt(delayInput.value) || 4) * 1000;

  isSending = true;
  stopRequested = false;
  logEl.innerHTML = '';
  logEl.classList.add('visible');
  progressSection.classList.add('visible');
  btnSend.classList.add('sending');
  btnSend.querySelector('#btnText').textContent = 'Detener';

  let sent = 0;
  let errors = 0;

  for (let i = 0; i < validContacts.length; i++) {
    if (stopRequested) { logMsg('info', 'Envío detenido'); break; }

    const contact = validContacts[i];
    const phone = contact._telefono;
    const cleanPhone = phone.replace(/\D/g, '');
    
    updateProgress(i + 1, validContacts.length, phone);
    logMsg('info', `Procesando ${phone}...`);

    try {
      const chatUrl = `https://web.whatsapp.com/send?phone=${cleanPhone}`;
      await chrome.tabs.update(tabId, { url: chatUrl });
      await waitForTabLoad(tabId);
      await sleep(4000);

      await injectContentScript(tabId);
      await sleep(800);

      const msgBefore = replaceVariables(template.messageBefore, contact);
      const msgAfter = replaceVariables(template.messageAfter, contact);
      const hasImage = template.images && template.images.length > 0;
      const hasAttachment = template.attachments && template.attachments.length > 0;

      if (!msgBefore && !msgAfter && !hasImage && !hasAttachment) {
        logMsg('err', `${phone} — Sin contenido`);
        errors++;
        continue;
      }

      const result = await sendMessage(tabId, {
        messageBefore: msgBefore,
        messageAfter: msgAfter,
        images: template.images,
        attachments: template.attachments
      });

      if (result && result.success) {
        logMsg('ok', `${phone} — enviado`);
        sent++;
      } else {
        logMsg('err', `${phone} — ${result?.error || 'error'}`);
        errors++;
      }
      
      saveToHistory({
        phone,
        templateName: template.name,
        hasImage,
        hasAttachment,
        success: result && result.success,
        error: result?.error,
        timestamp: new Date().toISOString()
      });
    } catch (err) {
      logMsg('err', `${phone} — ${err.message}`);
      errors++;
    }

    if (i < validContacts.length - 1 && !stopRequested) {
      await sleep(delay);
    }
  }

  isSending = false;
  stopRequested = false;
  btnSend.classList.remove('sending');
  btnSend.querySelector('#btnText').textContent = 'Enviar a todos';
  logMsg('info', `Completado: ${sent} ok, ${errors} errores`);
});

// ─── Tabs ─────────────────────────────────────────────────────
document.querySelectorAll('.tab').forEach(tab => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    tab.classList.add('active');
    const tabName = tab.dataset.tab.charAt(0).toUpperCase() + tab.dataset.tab.slice(1);
    document.getElementById('tab' + tabName).classList.add('active');
    
    if (tab.dataset.tab === 'history') loadHistory();
  });
});

// ─── Template editor events ───────────────────────────────────
document.getElementById('btnNewTemplate').addEventListener('click', () => showTemplateEditor());
document.getElementById('editorClose').addEventListener('click', hideTemplateEditor);
document.getElementById('btnCancelTemplate').addEventListener('click', hideTemplateEditor);
document.getElementById('btnSaveTemplate').addEventListener('click', saveTemplate);

document.getElementById('templateList').addEventListener('click', e => {
  const editBtn = e.target.closest('.btn-edit');
  const deleteBtn = e.target.closest('.btn-delete');
  
  if (editBtn) {
    const template = templates.find(t => t.id === editBtn.dataset.id);
    showTemplateEditor(template);
  }
  if (deleteBtn) {
    deleteTemplate(deleteBtn.dataset.id);
  }
});

document.getElementById('imagesInput').addEventListener('change', e => handleImageUpload(e.target.files));
document.getElementById('attachmentsInput').addEventListener('change', e => handleAttachmentUpload(e.target.files));

document.getElementById('imagesList').addEventListener('click', e => {
  if (e.target.classList.contains('file-remove')) {
    removeFile('images', parseInt(e.target.dataset.index));
  }
});

document.getElementById('attachmentsList').addEventListener('click', e => {
  if (e.target.classList.contains('file-remove')) {
    removeFile('attachments', parseInt(e.target.dataset.index));
  }
});

document.querySelectorAll('.variable-tag').forEach(tag => {
  tag.addEventListener('click', () => {
    const group = tag.closest('.input-group');
    const textarea = group.querySelector('textarea');
    if (!textarea) return;
    const varName = tag.dataset.var;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value;
    textarea.value = text.substring(0, start) + varName + text.substring(end);
    textarea.focus();
  });
});

// ─── Selector de plantilla ─────────────────────────────────────
templateSelect.addEventListener('change', () => {
  const templateId = templateSelect.value;
  if (!templateId) {
    templatePreview.style.display = 'none';
    return;
  }
  
  const template = templates.find(t => t.id === templateId);
  if (!template) return;

  let content = `<div style="margin-bottom:8px;"><strong>Antes:</strong> ${escapeHtml(template.messageBefore || '-')}</div>`;
  
  if (template.images?.length) {
    content += `<div style="margin-bottom:8px;"><strong>🖼️ Imágenes:</strong> ${template.images.length}</div>`;
  }
  if (template.attachments?.length) {
    content += `<div style="margin-bottom:8px;"><strong>📎 Archivos:</strong> ${template.attachments.length}</div>`;
  }
  
  content += `<div><strong>Después:</strong> ${escapeHtml(template.messageAfter || '-')}</div>`;
  
  templatePreviewContent.innerHTML = content;
  templatePreview.style.display = 'block';
});

// ─── Contactos input ───────────────────────────────────────────
phonesEl.addEventListener('input', () => {
  const { contacts, headers } = parseContacts(phonesEl.value);
  const count = contacts.filter(c => c._telefono).length;
  const countEl = document.getElementById('contactCount');
  if (countEl) {
    countEl.textContent = `${count} contacto${count !== 1 ? 's' : ''}`;
  } else {
    // Versión vieja compatibility
    const phoneCountEl = document.getElementById('phoneCount');
    if (phoneCountEl) phoneCountEl.textContent = `${count} número${count !== 1 ? 's' : ''}`;
  }

  const vars = detectVariables(headers);
  const info = document.getElementById('variablesInfo');
  if (info) {
    if (vars.length > 0) {
      document.getElementById('detectedVariables').innerHTML = vars.map(v => `<span class="variable-tag">{{${v}}}</span>`).join('');
      info.style.display = 'block';
    } else {
      info.style.display = 'none';
    }
  }
});

document.getElementById('btnImportContacts')?.addEventListener('click', () => {
  document.getElementById('contactsInput').click();
});

document.getElementById('contactsInput')?.addEventListener('change', async e => {
  const file = e.target.files[0];
  if (!file) return;
  const text = await file.text();
  phonesEl.value = text;
  phonesEl.dispatchEvent(new Event('input'));
});

document.getElementById('btnPaste')?.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    phonesEl.value = text;
    phonesEl.dispatchEvent(new Event('input'));
  } catch (err) {
    logMsg('err', 'Error al pegar');
  }
});

// ─── Historial ───────────────────────────────────────────────
const HISTORY_KEY = 'messageHistory';

function getHistory() {
  return new Promise(resolve => {
    chrome.storage.local.get([HISTORY_KEY], data => {
      resolve(data[HISTORY_KEY] || []);
    });
  });
}

function saveToHistory(record) {
  getHistory().then(history => {
    history.unshift(record);
    const trimmed = history.slice(0, 500);
    chrome.storage.local.set({ [HISTORY_KEY]: trimmed });
  });
}

function formatDate(date) {
  return date.toLocaleString('es-AR', { 
    day: '2-digit', month: '2-digit', year: 'numeric',
    hour: '2-digit', minute: '2-digit'
  });
}

async function loadHistory() {
  const history = await getHistory();
  const list = document.getElementById('historyList');
  const sent = history.filter(r => r.success).length;
  const errors = history.filter(r => !r.success).length;
  
  document.getElementById('statSent').textContent = sent;
  document.getElementById('statErrors').textContent = errors;
  document.getElementById('statTotal').textContent = history.length;

  if (history.length === 0) {
    list.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px;">No hay registros aún</p>';
    return;
  }

  list.innerHTML = history.map(r => `
    <div style="padding:8px;border-bottom:1px solid var(--border);display:flex;justify-content:space-between;align-items:center;">
      <div>
        <div style="color:${r.success ? 'var(--accent)' : '#ff6b6b'};font-weight:600;">
          ${r.success ? '✓' : '✗'} ${r.phone}
        </div>
        <div style="color:var(--muted);font-size:9px;">${r.templateName || 'Sin plantilla'}</div>
        <div style="color:var(--muted);font-size:9px;">${formatDate(new Date(r.timestamp))}</div>
      </div>
      <div style="font-size:10px;">
        ${r.hasImage ? '🖼️' : ''} ${r.hasAttachment ? '📎' : ''}
      </div>
    </div>
  `).join('');
}

document.getElementById('btnExportCsv')?.addEventListener('click', async () => {
  const history = await getHistory();
  const headers = ['Fecha', 'Teléfono', 'Plantilla', 'Imagen', 'Archivo', 'Estado'];
  const rows = history.map(r => [
    formatDate(new Date(r.timestamp)),
    r.phone,
    `"${(r.templateName || '').replace(/"/g, '""')}"`,
    r.hasImage ? 'Sí' : 'No',
    r.hasAttachment ? 'Sí' : 'No',
    r.success ? 'Enviado' : 'Error'
  ]);
  const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
  const BOM = '\uFEFF';
  const blob = new Blob([BOM + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `whatsapp_historial_${new Date().toISOString().slice(0,10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
});

document.getElementById('btnClearHistory')?.addEventListener('click', () => {
  if (confirm('¿Borrar todo el historial?')) {
    chrome.storage.local.set({ [HISTORY_KEY]: [] });
    loadHistory();
  }
});

// ─── Utils ───────────────────────────────────────────────────
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ─── Init ─────────────────────────────────────────────────────
renderTemplateList();
