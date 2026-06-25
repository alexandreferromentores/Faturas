// ─── render.js ────────────────────────────────────────────────────────────────
// Todas as funções que constroem e actualizam o HTML das páginas.

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderDashboard() {
  const fornecedores = invoices.filter(i => !isClient(i));
  const clientes     = invoices.filter(i => isClient(i));

  const aPagar   = fornecedores.filter(i => !isPaid(i)).reduce((s, i) => s + toNum(i.total), 0);
  const aReceber = clientes.filter(i => !isPaid(i)).reduce((s, i) => s + toNum(i.total), 0);
  const pago     = fornecedores.filter(isPaid).reduce((s, i) => s + toNum(i.total), 0);
  const recebido = clientes.filter(isPaid).reduce((s, i) => s + toNum(i.total), 0);

  document.getElementById('m-receber').textContent    = fmt(aReceber);
  document.getElementById('m-pagar').textContent      = fmt(aPagar);
  document.getElementById('m-recebido').textContent   = fmt(recebido);
  document.getElementById('m-pago').textContent       = fmt(pago);
  document.getElementById('m-receber-n').textContent  = clientes.filter(i => !isPaid(i)).length + ' pendentes';
  document.getElementById('m-pagar-n').textContent    = fornecedores.filter(i => !isPaid(i)).length + ' pendentes';
  document.getElementById('m-recebido-n').textContent = clientes.filter(isPaid).length + ' recebidas';
  document.getElementById('m-pago-n').textContent     = fornecedores.filter(isPaid).length + ' pagas';

  // Faturas recentes
  const recent = [...invoices]
    .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''))
    .slice(0, 5);

  document.getElementById('dash-recent').innerHTML = recent.length === 0
    ? '<p style="color:var(--muted);font-size:13px">Sem faturas ainda.</p>'
    : recent.map(i => `
        <div style="display:flex;justify-content:space-between;align-items:center;padding:8px 0;border-bottom:1px solid var(--border)">
          <div>
            <div style="font-size:13px;font-weight:500">${i.entidade || '—'}</div>
            <div style="font-size:11px;color:var(--muted)">${i.numero || ''} · ${isClient(i) ? 'Cliente' : 'Fornecedor'}</div>
          </div>
          <div style="text-align:right">
            <div style="font-family:var(--mono);font-size:12px">${fmt(i.total)}</div>
            ${estadoBadge(i)}
          </div>
        </div>`).join('');

  // Vencimentos próximos (14 dias)
  const upcoming = invoices
    .filter(i => !isPaid(i) && i.vencimento && daysDiff(i.vencimento) !== null
      && daysDiff(i.vencimento) <= 14 && daysDiff(i.vencimento) >= 0)
    .sort((a, b) => (parseDate(a.vencimento) || 0) - (parseDate(b.vencimento) || 0))
    .slice(0, 6);

  document.getElementById('dash-venc').innerHTML = upcoming.length === 0
    ? '<p style="color:var(--muted);font-size:13px">Sem vencimentos nos próximos 14 dias.</p>'
    : upcoming.map(i => `
        <div class="alert-row">
          <div>
            <div style="font-size:13px;font-weight:500">${i.entidade || '—'}</div>
            <div style="font-size:11px;color:var(--muted)">${i.vencimento}</div>
          </div>
          <div style="text-align:right;display:flex;flex-direction:column;align-items:flex-end;gap:3px">
            <div style="font-family:var(--mono);font-size:12px">${fmt(i.total)}</div>
            ${dueBadge(i)}
          </div>
        </div>`).join('');
}

// ─── Fornecedores ─────────────────────────────────────────────────────────────
function renderForn() {
  const estado = document.getElementById('ff-estado')?.value || '';
  const pasta  = document.getElementById('ff-pasta')?.value  || '';
  const search = (document.getElementById('ff-search')?.value || '').toLowerCase();

  let data = invoices.filter(i => !isClient(i));
  if (estado === 'vencido') data = data.filter(isOverdue);
  else if (estado)          data = data.filter(i => i.estado === estado);
  if (pasta)  data = data.filter(i => String(i.pastaId || '') === pasta);
  if (search) data = data.filter(i =>
    (i.entidade || '').toLowerCase().includes(search) ||
    (i.numero   || '').toLowerCase().includes(search));

  document.getElementById('forn-count').textContent = data.length + ' fatura' + (data.length !== 1 ? 's' : '');
  const body  = document.getElementById('forn-body');
  const empty = document.getElementById('forn-empty');
  if (data.length === 0) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  body.innerHTML = data
    .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''))
    .map(inv => {
      const ri    = invoices.indexOf(inv);
      const p     = getPasta(inv.pastaId);
      const pChip = p
        ? `<span class="folder-chip" style="background:${p.cor.bg};color:${p.cor.text};border-color:${p.cor.border}">${p.icon} ${p.nome}</span>`
        : '<span style="color:var(--muted);font-size:12px">—</span>';
      return `<tr>
        <td>${estadoBadge(inv)} ${dueBadge(inv)}</td>
        <td class="mono">${inv.numero || '—'}</td>
        <td><strong style="font-weight:500">${inv.entidade || '—'}</strong></td>
        <td class="mono" style="color:var(--muted)">${inv.nif || '—'}</td>
        <td style="color:var(--muted)">${inv.emissao || '—'}</td>
        <td style="color:var(--muted)">${inv.vencimento || '—'}</td>
        <td class="mono"><strong>${fmt(inv.total)}</strong></td>
        <td>${pChip}</td>
        <td><div style="display:flex;gap:3px">
          <button class="icon-btn" title="Estado" onclick="openWF(${ri})">⇄</button>
          <button class="icon-btn" title="Editar"  onclick="editInv(${ri})">✎</button>
          <button class="icon-btn" title="Apagar"  onclick="delInv(${ri})">✕</button>
        </div></td>
      </tr>`;
    }).join('');
}

// ─── Clientes ─────────────────────────────────────────────────────────────────
function renderCli() {
  const estado = document.getElementById('cf-estado')?.value || '';
  const pasta  = document.getElementById('cf-pasta')?.value  || '';
  const search = (document.getElementById('cf-search')?.value || '').toLowerCase();

  let data = invoices.filter(isClient);
  if (estado === 'vencido')       data = data.filter(isOverdue);
  else if (estado === 'recebido') data = data.filter(i => i.estado === 'pago');
  else if (estado === 'pendente') data = data.filter(i => i.estado !== 'pago');
  if (pasta)  data = data.filter(i => String(i.pastaId || '') === pasta);
  if (search) data = data.filter(i =>
    (i.entidade || '').toLowerCase().includes(search) ||
    (i.numero   || '').toLowerCase().includes(search));

  document.getElementById('cli-count').textContent = data.length + ' fatura' + (data.length !== 1 ? 's' : '');
  const body  = document.getElementById('cli-body');
  const empty = document.getElementById('cli-empty');
  if (data.length === 0) { body.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';

  body.innerHTML = data
    .sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || ''))
    .map(inv => {
      const ri    = invoices.indexOf(inv);
      const p     = getPasta(inv.pastaId);
      const pChip = p
        ? `<span class="folder-chip" style="background:${p.cor.bg};color:${p.cor.text};border-color:${p.cor.border}">${p.icon} ${p.nome}</span>`
        : '<span style="color:var(--muted);font-size:12px">—</span>';
      const badgeLbl = inv.estado === 'pago'
        ? '<span class="badge badge-recebido">Recebido</span>'
        : estadoBadge(inv);
      return `<tr>
        <td>${badgeLbl} ${dueBadge(inv)}</td>
        <td class="mono">${inv.numero || '—'}</td>
        <td><strong style="font-weight:500">${inv.entidade || '—'}</strong></td>
        <td class="mono" style="color:var(--muted)">${inv.nif || '—'}</td>
        <td style="color:var(--muted)">${inv.emissao || '—'}</td>
        <td style="color:var(--muted)">${inv.vencimento || '—'}</td>
        <td class="mono"><strong>${fmt(inv.total)}</strong></td>
        <td>${pChip}</td>
        <td><div style="display:flex;gap:3px">
          <button class="icon-btn" title="Estado" onclick="openWF(${ri})">⇄</button>
          <button class="icon-btn" title="Editar"  onclick="editInv(${ri})">✎</button>
          <button class="icon-btn" title="Apagar"  onclick="delInv(${ri})">✕</button>
        </div></td>
      </tr>`;
    }).join('');
}

// ─── Alertas ──────────────────────────────────────────────────────────────────
function renderAlertas() {
  const alerts = invoices
    .filter(i => !isPaid(i) && i.vencimento
      && daysDiff(i.vencimento) !== null && daysDiff(i.vencimento) <= 7)
    .sort((a, b) => (parseDate(a.vencimento) || 0) - (parseDate(b.vencimento) || 0));

  const el = document.getElementById('alertas-list');
  if (alerts.length === 0) {
    el.innerHTML = '<div class="empty"><div class="empty-icon">✓</div><h3>Sem alertas</h3><p>Não há vencimentos nos próximos 7 dias.</p></div>';
    return;
  }
  el.innerHTML = alerts.map(inv => {
    const ri = invoices.indexOf(inv);
    return `<div class="alert-row">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="font-size:20px">${isClient(inv) ? '👤' : '🏢'}</div>
        <div>
          <div style="font-size:13px;font-weight:500">${inv.entidade || '—'}
            <span style="font-weight:400;color:var(--muted);font-size:12px">${inv.numero || ''}</span>
          </div>
          <div style="font-size:11px;color:var(--muted)">Vencimento: ${inv.vencimento} · ${isClient(inv) ? 'Cliente' : 'Fornecedor'}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div style="text-align:right">
          <div style="font-family:var(--mono);font-size:13px;font-weight:500">${fmt(inv.total)}</div>
          ${dueBadge(inv)}
        </div>
        <button class="btn btn-primary btn-sm" onclick="openWF(${ri})">Marcar pago</button>
      </div>
    </div>`;
  }).join('');
}

// ─── Pastas ───────────────────────────────────────────────────────────────────
function renderPastas() {
  const grid  = document.getElementById('pasta-grid');
  const empty = document.getElementById('pasta-empty');
  if (pastas.length === 0) { grid.innerHTML = ''; empty.style.display = 'block'; return; }
  empty.style.display = 'none';
  grid.innerHTML = pastas.map((p, idx) => {
    const ct = invoices.filter(i => i.pastaId === p.id).length;
    return `<div class="folder-card" style="border-color:${p.cor.border};background:${p.cor.bg}">
      <button class="fc-del icon-btn" onclick="delPasta(${idx})" title="Apagar">✕</button>
      <div class="fc-icon">${p.icon}</div>
      <div class="fc-name" style="color:${p.cor.text}">${p.nome}</div>
      <div class="fc-count">${ct} fatura${ct !== 1 ? 's' : ''}</div>
    </div>`;
  }).join('');
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

// ─── Inicialização ────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderDashboard();
  updateAlertBadge();
});
