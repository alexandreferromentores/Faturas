// ─── validation.js ───────────────────────────────────────────────────────────
// Validação de NIF português e backup/restauro completo em JSON.

// ─── Validação de NIF português (algoritmo de checksum oficial) ─────────────
function isValidNIF(nif) {
  if (!nif) return null; // sem NIF não é erro, é apenas ausência
  const clean = String(nif).replace(/\D/g, '');
  if (clean.length !== 9) return false;

  // Primeiro dígito válido para pessoas singulares/colectivas em Portugal
  const validFirst = ['1','2','3','5','6','7','8','9'];
  if (!validFirst.includes(clean[0])) return false;

  let sum = 0;
  for (let i = 0; i < 8; i++) {
    sum += parseInt(clean[i]) * (9 - i);
  }
  const mod = sum % 11;
  const checkDigit = mod < 2 ? 0 : 11 - mod;

  return checkDigit === parseInt(clean[8]);
}

function nifFeedbackHTML(nif) {
  const result = isValidNIF(nif);
  if (result === null) return '';
  if (result) return '<span style="color:var(--green);font-size:11px;font-weight:600">✓ NIF válido</span>';
  return '<span style="color:var(--red);font-size:11px;font-weight:600">✗ NIF inválido — verifica os dígitos</span>';
}

// ─── Adiciona feedback visual de NIF nos formulários ─────────────────────────
function attachNifValidation(inputId) {
  const input = document.getElementById(inputId);
  if (!input || input.dataset.nifValidated) return;
  input.dataset.nifValidated = '1';

  const feedback = document.createElement('div');
  feedback.style.marginTop = '4px';
  feedback.id = inputId + '-feedback';
  input.parentElement.appendChild(feedback);

  input.addEventListener('input', () => {
    feedback.innerHTML = nifFeedbackHTML(input.value);
  });
  input.addEventListener('blur', () => {
    feedback.innerHTML = nifFeedbackHTML(input.value);
  });
}

document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    ['f-nif', 'm-nif', 'emp-nif', 'emp-cont-nif'].forEach(attachNifValidation);
  }, 500);
});

// Re-attach when modals open (elements may be recreated)
window.addEventListener('load', function hookNifModals() {
  const origOpenManual  = window.openManual;
  const origOpenUpload  = window.openUploadModal;

  if (typeof origOpenManual === 'function') {
    window.openManual = function() {
      origOpenManual.apply(this, arguments);
      setTimeout(() => attachNifValidation('m-nif'), 50);
    };
  }
  if (typeof origOpenUpload === 'function') {
    window.openUploadModal = function() {
      origOpenUpload.apply(this, arguments);
      setTimeout(() => attachNifValidation('f-nif'), 50);
    };
  }
});

// ─── Backup completo em JSON ──────────────────────────────────────────────────
function exportBackupJSON() {
  const backup = {
    version: 1,
    exportedAt: new Date().toISOString(),
    invoices: invoices,
    pastas: pastas,
    empresa: typeof empresa !== 'undefined' ? empresa : {},
  };
  const json = JSON.stringify(backup, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `faturas_backup_${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  toast('Backup exportado!', 'success');
}

function importBackupJSON(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = async e => {
    try {
      const data = JSON.parse(e.target.result);
      if (!data.invoices || !Array.isArray(data.invoices)) {
        throw new Error('Ficheiro inválido — não contém faturas');
      }

      const ok = await confirmDialog(
        `Este backup tem <strong>${data.invoices.length} faturas</strong> e <strong>${(data.pastas||[]).length} pastas</strong>, exportado em ${new Date(data.exportedAt).toLocaleDateString('pt-PT')}.<br><br>
        Isto vai <strong>substituir todos os dados actuais</strong>. Continuar?`
      );
      if (!ok) return;

      invoices = data.invoices;
      pastas   = data.pastas || [];
      if (data.empresa && typeof empresa !== 'undefined') {
        empresa = data.empresa;
        localStorage.setItem('fv_empresa', JSON.stringify(empresa));
      }

      save();
      toast('Backup importado com sucesso!', 'success');
      renderDashboard();
      updateAlertBadge();
    } catch (err) {
      toast('Erro ao importar: ' + err.message, 'error');
    }
  };
  reader.readAsText(file);
}

// ─── Adiciona secção de backup à página de Configuração ──────────────────────
function addBackupSectionToConfig() {
  const configCard = document.querySelector('#page-config .card');
  if (!configCard || document.getElementById('backup-section')) return;

  const section = document.createElement('div');
  section.id = 'backup-section';
  section.style.cssText = 'margin-bottom:24px';
  section.innerHTML = `
    <div style="font-size:14px;font-weight:600;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)">Backup Completo</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:12px">
      Exporta todos os dados (faturas, pastas, perfil da empresa) num único ficheiro JSON. Útil como cópia de segurança independente do Google Sheets.
    </p>
    <div style="display:flex;gap:10px">
      <button class="btn btn-ghost btn-sm" onclick="exportBackupJSON()">⬇ Exportar Backup JSON</button>
      <label class="btn btn-ghost btn-sm" style="cursor:pointer">
        ⬆ Importar Backup
        <input type="file" accept=".json" style="display:none" onchange="importBackupJSON(this.files[0])">
      </label>
    </div>
  `;
  configCard.appendChild(section);
}

window.addEventListener('load', function hookBackupConfig() {
  if (typeof window.loadConfig !== 'function') {
    setTimeout(hookBackupConfig, 100);
    return;
  }
  const _origLoadConfig = window.loadConfig;
  window.loadConfig = function() {
    _origLoadConfig.apply(this, arguments);
    setTimeout(addBackupSectionToConfig, 60);
  };
});
