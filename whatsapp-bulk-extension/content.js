// content.js v2.0 - WhatsApp Bulk Sender con Plantillas
if (!window.__waBulkSenderLoaded) {
  window.__waBulkSenderLoaded = true;
  console.log('[WA Bulk Sender] v2.0 loaded');
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.action === 'ping') { sendResponse({ alive: true }); return false; }

  if (msg.action === 'debug') {
    const attachSelectors = [
      '[data-testid="attach-btn"]',
      'button[aria-label*="Adjuntar"]',
      'button[aria-label*="Attach"]',
      'span[data-icon="plus"]',
    ];
    let attachSelector = null;
    for (const s of attachSelectors) {
      if (document.querySelector(s)) { attachSelector = s; break; }
    }
    sendResponse({
      hasFooter: !!document.querySelector('footer [contenteditable="true"]'),
      hasAttach: !!attachSelector,
      attachSelector,
      fileInputs: document.querySelectorAll('input[type="file"]').length,
      hasMain: !!document.querySelector('#main, main'),
    });
    return false;
  }
  if (msg.action === 'doSend') {
    doSend(msg).then(sendResponse).catch(err => sendResponse({ success: false, error: err.message }));
    return true;
  }
});

async function doSend({ messageBefore, messageAfter, images, attachments }) {
  try {
    const inputBox = await waitForElement(
      'footer [contenteditable="true"], [data-tab="10"][contenteditable="true"]',
      10000
    );
    if (!inputBox) return { success: false, error: 'Chat no cargó' };
    await sleep(600);

    const hasBefore = messageBefore && messageBefore.trim();
    const hasAfter = messageAfter && messageAfter.trim();
    const hasImages = images && images.length > 0;
    const hasAttachments = attachments && attachments.length > 0;

    if (!hasImages && !hasAttachments && (hasBefore || hasAfter)) {
      const text = hasBefore ? messageBefore : messageAfter;
      inputBox.click();
      inputBox.focus();
      await sleep(300);
      document.execCommand('selectAll', false, null);
      document.execCommand('insertText', false, text);
      await sleep(300);
      await clickSend();
      await sleep(1200);
      return { success: true };
    }

    if (hasImages || hasAttachments) {
      if (hasBefore) {
        inputBox.click();
        inputBox.focus();
        await sleep(300);
        document.execCommand('selectAll', false, null);
        document.execCommand('insertText', false, messageBefore);
        await sleep(300);
        await clickSend();
        await sleep(1500);
      }

      if (hasImages) {
        for (let i = 0; i < images.length; i++) {
          const img = images[i];
          const bytes = Uint8Array.from(atob(img.data), c => c.charCodeAt(0));
          const file = new File([bytes], img.name || 'imagen.jpg', { type: img.mime || 'image/jpeg' });

          const attached = await tryAttachImage(file);
          if (!attached) return { success: false, error: 'No se pudo adjuntar imagen: ' + img.name };

          await sleep(2500);

          const isLast = i === images.length - 1 && (!hasAttachments || !hasAfter);
          if (hasAfter && isLast) {
            const captionBox = await waitForAnyElement([
              '[data-testid="media-caption-input-container"] [contenteditable="true"]',
              'div[contenteditable="true"][class*="caption"]',
              'div[contenteditable="true"][data-tab="10"]',
              'div[contenteditable="true"][aria-placeholder]',
            ], 3000);

            if (captionBox) {
              captionBox.click();
              captionBox.focus();
              await sleep(300);
              document.execCommand('selectAll', false, null);
              document.execCommand('insertText', false, messageAfter);
              await sleep(400);
            }
          }

          await sleep(500);
          let sent = await clickSend();
          if (!sent) {
            const active = document.activeElement;
            if (active) active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
          }
          await sleep(2000);
        }
      }

      if (hasAttachments) {
        for (let i = 0; i < attachments.length; i++) {
          const att = attachments[i];
          const bytes = Uint8Array.from(atob(att.data), c => c.charCodeAt(0));
          const file = new File([bytes], att.name || 'archivo', { type: att.mime || 'application/octet-stream' });

          const attached = await tryAttachFile(file);
          if (!attached) return { success: false, error: 'No se pudo adjuntar archivo: ' + att.name };

          // Esperar más tiempo para documentos
          await sleep(3000);

          const isLast = i === attachments.length - 1 && !hasAfter;
          if (hasAfter && isLast) {
            const captionBox = await waitForAnyElement([
              '[data-testid="media-caption-input-container"] [contenteditable="true"]',
              'div[contenteditable="true"][class*="caption"]',
            ], 3000);

            if (captionBox) {
              captionBox.click();
              captionBox.focus();
              await sleep(300);
              document.execCommand('selectAll', false, null);
              document.execCommand('insertText', false, messageAfter);
              await sleep(400);
            }
          }

          // Enviar - intentar múltiples veces si es necesario
          await sleep(500);
          let sent = await clickSend();
          if (!sent) {
            const active = document.activeElement;
            if (active) active.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', keyCode: 13, bubbles: true }));
          }
          
          // Esperar a que aparezca el mensaje enviado
          await sleep(2000);
        }
      }

      return { success: true };
    }

    return { success: false, error: 'Sin contenido para enviar' };

  } catch (err) {
    return { success: false, error: err.message };
  }
}

async function tryAttachImage(file) {
  if (await dropOnChat(file)) return true;
  await sleep(500);
  if (await pasteImage(file)) return true;
  await sleep(500);
  if (await clickAttachAndInject(file, true)) return true;
  return false;
}

async function tryAttachFile(file) {
  // Para documentos, intentar click directo en el botón de adjuntar
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await sleep(500);

    const attachBtn = await waitForAnyElement([
      '[data-testid="attach-btn"]',
      'button[aria-label*="Adjuntar"]',
      'button[aria-label*="Attach"]',
      'span[data-icon="plus"]',
      '[data-icon="plus"]',
    ], 4000);

    if (!attachBtn) return false;
    attachBtn.click();
    await sleep(1000);

    // Buscar menú de opciones (documento, galería, etc.)
    const menuItem = await waitForAnyElement([
      'li[data-testid="attach-item-document"]',
      'li[aria-label*="Documento"]',
      'li[aria-label*="Document"]',
      '[data-testid="attach-menu"] li:nth-child(2)',
    ], 3000);

    if (menuItem) {
      menuItem.click();
      await sleep(800);
    }

    const allInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    // Para documentos, buscar input que acepte archivos
    let target = allInputs.find(i => !(i.accept || '').includes('image'));
    if (!target && allInputs.length > 0) target = allInputs[0];
    if (!target) return false;

    const dt = new DataTransfer();
    dt.items.add(file);
    try {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
      descriptor.set.call(target, dt.files);
    } catch {
      Object.defineProperty(target, 'files', { value: dt.files, configurable: true, writable: true });
    }
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.dispatchEvent(new InputEvent('input', { bubbles: true }));
    
    // Esperar a que aparezca el modal de confirmación
    await sleep(2000);
    const modal = document.querySelector('[data-testid="media-confirmation-window"], [data-testid="media-editor"]');
    return !!modal;
  } catch (err) {
    console.error('[WA Bulk] tryAttachFile:', err.message);
    return false;
  }
}

async function dropOnChat(file) {
  try {
    const zone = document.querySelector('#main, main, [data-testid="conversation-panel-wrapper"]');
    if (!zone) return false;
    const dt = new DataTransfer();
    dt.items.add(file);
    const opts = { bubbles: true, cancelable: true, dataTransfer: dt };
    zone.dispatchEvent(new DragEvent('dragenter', opts));
    await sleep(100);
    zone.dispatchEvent(new DragEvent('dragover', opts));
    await sleep(100);
    zone.dispatchEvent(new DragEvent('drop', opts));
    await sleep(800);
    const appeared = document.querySelector(
      '[data-testid="media-confirmation-window"], [data-testid="media-editor"], ' +
      'div[class*="popup-contents"], div[class*="_2Gdnd"], div[class*="media-panel"]'
    );
    return !!appeared;
  } catch { return false; }
}

async function pasteImage(file) {
  try {
    const inputBox = document.querySelector('footer [contenteditable="true"]');
    if (!inputBox) return false;
    inputBox.focus();
    await sleep(200);
    const dt = new DataTransfer();
    dt.items.add(file);
    const pasteEvent = new ClipboardEvent('paste', {
      bubbles: true, cancelable: true, clipboardData: dt
    });
    inputBox.dispatchEvent(pasteEvent);
    await sleep(800);
    const appeared = document.querySelector(
      '[data-testid="media-confirmation-window"], [data-testid="media-editor"], ' +
      'div[class*="popup-contents"], div[class*="media-panel"]'
    );
    return !!appeared;
  } catch { return false; }
}

async function clickAttachAndInject(file, isImage) {
  try {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));
    await sleep(300);

    const attachBtn = await waitForAnyElement([
      '[data-testid="attach-btn"]',
      'button[aria-label*="Adjuntar"]',
      'button[aria-label*="Attach"]',
      'span[data-icon="plus"]',
      '[data-icon="plus"]',
      'li[data-testid="attach-btn"]',
    ], 4000);

    if (!attachBtn) return false;
    attachBtn.click();
    await sleep(800);

    const allInputs = Array.from(document.querySelectorAll('input[type="file"]'));
    let target = null;

    if (isImage) {
      target = allInputs.find(i => (i.accept || '').includes('image'));
      if (!target) target = allInputs.find(i => !(i.accept || '').includes('application'));
    } else {
      target = allInputs.find(i => !(i.accept || '').includes('image'));
      if (!target && allInputs.length > 0) target = allInputs[0];
    }

    if (!target && allInputs.length > 0) target = allInputs[0];
    if (!target) return false;

    const dt = new DataTransfer();
    dt.items.add(file);
    try {
      const descriptor = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'files');
      descriptor.set.call(target, dt.files);
    } catch {
      Object.defineProperty(target, 'files', { value: dt.files, configurable: true, writable: true });
    }
    target.dispatchEvent(new Event('change', { bubbles: true }));
    target.dispatchEvent(new InputEvent('input', { bubbles: true }));
    await sleep(1500);
    return true;
  } catch (err) {
    console.error('[WA Bulk] clickAttachAndInject:', err.message);
    return false;
  }
}

async function clickSend() {
  const selectors = [
    '[data-testid="send-button"]',
    'button[aria-label="Enviar"]',
    'button[aria-label="Send"]',
    'span[data-icon="send"]',
    '[data-icon="send"]',
  ];
  for (const sel of selectors) {
    const btns = document.querySelectorAll(sel);
    if (btns.length > 0) {
      btns[btns.length - 1].click();
      return true;
    }
  }
  return false;
}

function waitForAnyElement(selectors, timeout = 5000) {
  return new Promise(resolve => {
    const combined = selectors.join(', ');
    const el = document.querySelector(combined);
    if (el) return resolve(el);
    const obs = new MutationObserver(() => {
      const found = document.querySelector(combined);
      if (found) { obs.disconnect(); resolve(found); }
    });
    obs.observe(document.body, { childList: true, subtree: true });
    setTimeout(() => { obs.disconnect(); resolve(null); }, timeout);
  });
}

function waitForElement(selector, timeout = 5000) {
  return waitForAnyElement([selector], timeout);
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
