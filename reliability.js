// ─── reliability.js ──────────────────────────────────────────────────────────
// Indicador claro de sincronização, confirmação de upload, aviso de alterações
// não guardadas. Foco: nunca deixar o utilizador na dúvida sobre o estado dos dados.

// ─── 1. Indicador de sincronização persistente ───────────────────────────────
// Substitui o toast efémero por um indicador fixo no menu que reflecte o
// estado real: sincronizado, a sincronizar, erro, ou offline (sem Sheets).

const SYNC_STATES = {
  synced:    { icon: '✓', label: 'Sincronizado',     color: '#3FB950' },
  syncing:   { icon: '↻', label: 'A sincronizar...', color: '#E3B341' },
  error:     { icon: '⚠', label: 'Erro de sincronização', color: '#F85149' },
  offline:   { icon: '○', label: 'Apenas local',     color: 'rgba(255,255,255,.4)' },
};

let _syncState = 'offline';
let _syncErrorMsg = '';

function setSyncState(state, errorMsg) {
  _syncState = state;
  _syncErrorMsg = errorMsg || '';
  renderSyncIndicator();
}

function renderSyncIndicator() {
  const el = document.getElementById('sync-status');
  if (!el) return;
  const s = SYNC_STATES[_syncState] || SYNC_STATES.offline;

  el.style.cssText = `font-size:11px;margin-top:4px;min-height:14px;display:flex;align-items:center;gap:5px;cursor:${_syncState === 'error' ? 'pointer' : 'default'}`;
  el.innerHTML = `<span style="color:${s.color}${_syncState === 'syncing' ? ';animation:spin 1s linear infinite;display:inline-block' : ''}">${s.icon}</span><span style="color:rgba(255,255,255,.55)">${s.label}</span>`;

  if (_syncState === 'error') {
    el.title = 'Clica para ver detalhes: ' + _syncErrorMsg;
    el.onclick = () => {
      toast('Erro: ' + _syncErrorMsg, 'error');
    };
  } else {
    el.title = '';
    el.onclick = null;
  }
}

// ─── Hook into sheetsSave / sheetsLoad to reflect real state ─────────────────
window.addEventListener('load', function hookSyncState() {
  if (typeof window.sheetsSave !== 'function') {
    setTimeout(hookSyncState, 100);
    return;
  }

  // Determine initial state
  if (config.sheetsKey) {
    setSyncState('synced');
  } else {
    setSyncState('offline');
  }

  const _origSheetsSave = window.sheetsSave;
  window.sheetsSave = async function() {
    if (!config.sheetsKey) {
      setSyncState('offline');
      localStorage.setItem('fv_invoices', JSON.stringify(invoices));
      localStorage.setItem('fv_pastas', JSON.stringify(pastas));
      return;
    }

    setSyncState('syncing');
    localStorage.setItem('fv_invoices', JSON.stringify(invoices));
    localStorage.setItem('fv_pastas', JSON.stringify(pastas));

    if (window.syncPending) return;
    window.syncPending = true;

    setTimeout(async () => {
      try {
        const rowsFat = [HEADERS_FATURAS, ...invoices.map(invToRow)];
        const rowsPas = [HEADERS_PASTAS, ...pastas.map(pastaToRow)];
        await Promise.all([
          sheetsWrite(SHEET_FATURAS, rowsFat),
          sheetsWrite(SHEET_PASTAS, rowsPas),
        ]);
        setSyncState('synced');
      } catch (e) {
        console.error('Erro ao guardar na Sheet:', e);
        setSyncState('error', e.message);
      }
      window.syncPending = false;
    }, 1000);
  };
});

// Update state when testSheets succeeds/fails
window.addEventListener('load', function hookTestSheets() {
  if (typeof window.testSheets !== 'function') {
    setTimeout(hookTestSheets, 100);
    return;
  }
  const _origTestSheets = window.testSheets;
  window.testSheets = async function() {
    setSyncState('syncing');
    await _origTestSheets.apply(this, arguments);
    if (config.sheetsKey) {
      // testSheets already shows its own status; reflect success/failure in nav indicator
      const statusEl = document.getElementById('cfg-sheets-status');
      if (statusEl && statusEl.textContent.includes('✓')) {
        setSyncState('synced');
      } else {
        setSyncState('error', 'Falha ao ligar ao Google Sheets');
      }
    }
  };
});

// ─── 2. Confirmação visual de upload para Drive ──────────────────────────────
// Mostra um indicador inline no formulário de upload sobre o estado do
// envio do PDF para o Drive (em vez de só descobrir no detalhe depois).

function showDriveUploadStatus(state, message) {
  let el = document.getElementById('drive-upload-status');
  if (!el) {
    el = document.createElement('div');
    el.id = 'drive-upload-status';
    el.style.cssText = 'margin-top:10px;padding:8px 12px;border-radius:var(--r);font-size:12px;display:flex;align-items:center;gap:8px';
    const extractedBox = document.getElementById('extracted-box');
    if (extractedBox) extractedBox.insertBefore(el, extractedBox.firstChild);
  }

  const states = {
    uploading: { bg: 'var(--accent-light)', color: 'var(--accent)', icon: '<div class="spinner" style="width:13px;height:13px"></div>' },
    success:   { bg: 'var(--green-bg)', color: 'var(--green)', icon: '✓' },
    error:     { bg: 'var(--red-bg)', color: 'var(--red)', icon: '⚠' },
    skipped:   { bg: 'var(--amber-bg)', color: 'var(--amber)', icon: 'ℹ' },
  };
  const s = states[state];
  if (!s) { el.style.display = 'none'; return; }

  el.style.display = 'flex';
  el.style.background = s.bg;
  el.style.color = s.color;
  el.innerHTML = `${s.icon} <span>${message}</span>`;
}

function clearDriveUploadStatus() {
  const el = document.getElementById('drive-upload-status');
  if (el) el.remove();
}

// Patch saveFromPDF to show clear upload feedback
window.addEventListener('load', function hookDriveUploadFeedback() {
  if (typeof window.saveFromPDF !== 'function') {
    setTimeout(hookDriveUploadFeedback, 100);
    return;
  }

  const _origSaveFromPDF = window.saveFromPDF;
  window.saveFromPDF = async function() {
    const tipo = document.getElementById('upload-tipo')?.value || 'fornecedor';
    const fields = {
      tipo,
      numero:     document.getElementById('f-num').value,
      entidade:   document.getElementById('f-ent').value,
      nif:        document.getElementById('f-nif').value,
      emissao:    document.getElementById('f-emissao').value,
      vencimento: document.getElementById('f-venc').value,
      descritivo: document.getElementById('f-desc').value,
      base:       document.getElementById('f-base').value,
      iva:        document.getElementById('f-iva').value,
      retencao:   document.getElementById('f-retencao').value,
      totalDoc:   document.getElementById('f-totalDoc').value,
      total:      document.getElementById('f-total').value,
      estado:     document.getElementById('f-estado').value,
      pastaId:    document.getElementById('f-pasta').value || null,
      notas:      document.getElementById('f-notas').value,
    };

    if (!validateInv(fields)) return;

    const inv = buildInv(fields);

    if (window._currentPDFFile && config.sheetsKey) {
      showDriveUploadStatus('uploading', 'A guardar PDF no Google Drive...');
      try {
        const num = fields.numero.replace(/[^a-zA-Z0-9_-]/g, '_');
        const ent = (fields.entidade || '').replace(/[^a-zA-Z0-9_-]/g, '_').slice(0, 30);
        const filename = `${num}_${ent}_fatura.pdf`;
        const result = await uploadToDrive(window._currentPDFFile, filename);
        inv.faturaUrl = result.url;
        inv.faturaId = result.id;
        showDriveUploadStatus('success', 'PDF guardado no Drive com sucesso');
      } catch (e) {
        console.warn('Não foi possível guardar PDF no Drive:', e.message);
        showDriveUploadStatus('error', 'PDF NÃO foi guardado no Drive — ' + e.message);
        const proceed = await confirmDialog(
          `O PDF não pôde ser guardado no Google Drive (${e.message}).<br><br>A fatura vai ser guardada apenas com os dados extraídos, sem o ficheiro original. Continuar?`
        );
        if (!proceed) { clearDriveUploadStatus(); return; }
      }
    } else if (window._currentPDFFile && !config.sheetsKey) {
      showDriveUploadStatus('skipped', 'Google Sheets não configurado — PDF não foi guardado');
    }

    invoices.push(inv);
    save();
    toast('Fatura guardada!', 'success');

    setTimeout(() => {
      resetUpload();
      clearDriveUploadStatus();
      closeModal('modal-upload');
      nav(tipo === 'cliente' ? 'clientes' : 'fornecedores');
    }, inv.faturaUrl || !window._currentPDFFile ? 200 : 1200);
  };
});

// ─── 3. Aviso de alterações não guardadas ────────────────────────────────────
let _formDirty = false;
let _dirtyFormSelector = null;

function markFormDirty(formSelector) {
  _formDirty = true;
  _dirtyFormSelector = formSelector;
}

function markFormClean() {
  _formDirty = false;
  _dirtyFormSelector = null;
}

// Track input changes within modals
document.addEventListener('DOMContentLoaded', () => {
  const watchedModals = ['#modal-manual', '#modal-upload .upload-modal-left'];

  watchedModals.forEach(sel => {
    const container = document.querySelector(sel);
    if (!container) return;
    container.addEventListener('input', () => markFormDirty(sel));
  });
});

// Warn before closing modal with unsaved changes
function confirmCloseIfDirty(closeAction) {
  if (!_formDirty) { closeAction(); return; }

  confirmDialog('Tens alterações não guardadas neste formulário. Queres mesmo fechar sem guardar?')
    .then(ok => { if (ok) { markFormClean(); closeAction(); } });
}

// Patch closeModal('modal-manual') and closeUploadModal to check dirty state
window.addEventListener('load', function hookDirtyCheck() {
  if (typeof window.closeModal !== 'function' || typeof window.closeUploadModal !== 'function') {
    setTimeout(hookDirtyCheck, 100);
    return;
  }

  const _origCloseModal = window.closeModal;
  window.closeModal = function(id) {
    if (id === 'modal-manual' && _formDirty) {
      confirmCloseIfDirty(() => _origCloseModal(id));
      return;
    }
    _origCloseModal(id);
    if (id === 'modal-manual') markFormClean();
  };

  const _origCloseUploadModal = window.closeUploadModal;
  window.closeUploadModal = function() {
    if (_formDirty) {
      confirmCloseIfDirty(() => { _origCloseUploadModal(); markFormClean(); });
      return;
    }
    _origCloseUploadModal();
  };

  // Clear dirty flag when successfully saving
  const _origSaveManual = window.saveManual;
  if (_origSaveManual) {
    window.saveManual = function() {
      markFormClean();
      return _origSaveManual.apply(this, arguments);
    };
  }
});

// Browser-level warning on page unload if there's an open dirty form
window.addEventListener('beforeunload', e => {
  if (_formDirty) {
    e.preventDefault();
    e.returnValue = '';
    return '';
  }
});
