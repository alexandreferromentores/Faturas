// ─── ui.js ────────────────────────────────────────────────────────────────────
// Toast, modais, alertas de duplicado e indicadores de estado.

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  if (!el) return;
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.classList.remove('show'), 3500);
}

// ─── Alerta de duplicado ──────────────────────────────────────────────────────
// Mais visível que um simples warning — banner animado no topo do modal
function showDuplicateAlert(msg, type = 'warning') {
  const el = document.getElementById('dup-warn');
  if (!el) return;
  el.innerHTML = `
    <div class="dup-icon">${type === 'error' ? '🚫' : '⚠️'}</div>
    <div class="dup-content">
      <div class="dup-title">${type === 'error' ? 'Campos obrigatórios' : 'Possível Duplicado Detectado'}</div>
      <div class="dup-msg">${msg || 'Esta fatura pode já existir. Verifica os dados antes de guardar.'}</div>
    </div>`;
  el.className = 'dup-warning dup-' + type + ' show';
  el.style.display = 'flex';

  // Shake animation
  el.classList.add('dup-shake');
  setTimeout(() => el.classList.remove('dup-shake'), 600);
}

function hideDuplicateAlert() {
  const el = document.getElementById('dup-warn');
  if (el) { el.style.display = 'none'; el.className = 'dup-warning'; }
}

// ─── Modais ───────────────────────────────────────────────────────────────────
function closeModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.remove('show');
}

function openModal(id) {
  const el = document.getElementById(id);
  if (el) el.classList.add('show');
}

// Fechar ao clicar fora ou Escape
document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay, .upload-modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.modal-overlay.show, .upload-modal-overlay.show')
        .forEach(m => m.classList.remove('show'));
    }
  });
});

// ─── Sync status ──────────────────────────────────────────────────────────────
function showSyncStatus(msg) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = msg;
  setTimeout(() => { if (el) el.textContent = ''; }, 3000);
}

// ─── Confirmação personalizada ────────────────────────────────────────────────
function confirmDialog(msg) {
  return new Promise(resolve => {
    const overlay = document.createElement('div');
    overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,.5);z-index:9999;display:flex;align-items:center;justify-content:center';
    overlay.innerHTML = `
      <div style="background:var(--surface);border-radius:10px;padding:28px;max-width:400px;width:90%;box-shadow:0 8px 32px rgba(0,0,0,.2)">
        <div style="font-size:15px;font-weight:600;margin-bottom:12px;color:var(--text)">Confirmar</div>
        <div style="font-size:13px;color:var(--muted);margin-bottom:22px;line-height:1.5">${msg}</div>
        <div style="display:flex;gap:10px;justify-content:flex-end">
          <button id="conf-no"  class="btn btn-ghost btn-sm">Cancelar</button>
          <button id="conf-yes" class="btn btn-danger btn-sm">Confirmar</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#conf-yes').onclick = () => { document.body.removeChild(overlay); resolve(true); };
    overlay.querySelector('#conf-no').onclick  = () => { document.body.removeChild(overlay); resolve(false); };
    overlay.addEventListener('click', e => { if (e.target === overlay) { document.body.removeChild(overlay); resolve(false); } });
  });
}

// ─── Badge de alertas na navegação ───────────────────────────────────────────
function updateAlertBadge() {
  const ct = invoices.filter(i =>
    !isPaid(i) && i.vencimento && daysDiff(i.vencimento) !== null && daysDiff(i.vencimento) <= 7
  ).length;
  const badge = document.getElementById('badge-alertas');
  if (!badge) return;
  if (ct > 0) { badge.textContent = ct; badge.style.display = ''; }
  else badge.style.display = 'none';
}

// ─── Popula selects de pasta ──────────────────────────────────────────────────
function populatePastaFilter(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todas as pastas</option>' +
    pastas.map(p => `<option value="${p.id}">${p.icon} ${p.nome}</option>`).join('');
  sel.value = cur;
}

function populatePastaSelect(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Sem pasta</option>' +
    pastas.map(p => `<option value="${p.id}">${p.icon} ${p.nome}</option>`).join('');
  sel.value = cur;
}
