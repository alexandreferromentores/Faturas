// ─── render.js ────────────────────────────────────────────────────────────────
// Todas as funções que constroem e actualizam o HTML das páginas.

let chartMensal = null;
let chartPasstas = null;

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderDashboard() {
  const forn = invoices.filter(i => !isClient(i));
  const cli  = invoices.filter(i => isClient(i));

  // Métricas fornecedores
  const fornTotal = forn.reduce((s, i) => s + toNum(i.total), 0);
  const fornPago  = forn.filter(isPaid).reduce((s, i) => s + toNum(i.total), 0);
  const fornPend  = forn.filter(i => !isPaid(i) && !isOverdue(i)).reduce((s, i) => s + toNum(i.total), 0);
  const fornVenc  = forn.filter(isOverdue).reduce((s, i) => s + toNum(i.total), 0);

  document.getElementById('m-forn-total').textContent   = fmt(fornTotal);
  document.getElementById('m-forn-pago').textContent    = fmt(fornPago);
  document.getElementById('m-forn-pend').textContent    = fmt(fornPend);
  document.getElementById('m-forn-venc').textContent    = fmt(fornVenc);
  document.getElementById('m-forn-total-n').textContent = forn.length + ' faturas';
  document.getElementById('m-forn-pago-n').textContent  = forn.filter(isPaid).length + ' faturas';
  document.getElementById('m-forn-pend-n').textContent  = forn.filter(i => !isPaid(i) && !isOverdue(i)).length + ' faturas';
  document.getElementById('m-forn-venc-n').textContent  = forn.filter(isOverdue).length + ' faturas';

  // Métricas clientes
  const cliTotal = cli.reduce((s, i) => s + toNum(i.total), 0);
  const cliRec   = cli.filter(isPaid).reduce((s, i) => s + toNum(i.total), 0);
  const cliPend  = cli.filter(i => !isPaid(i) && !isOverdue(i)).reduce((s, i) => s + toNum(i.total), 0);
  const cliVenc  = cli.filter(isOverdue).reduce((s, i) => s + toNum(i.total), 0);

  document.getElementById('m-cli-total').textContent   = fmt(cliTotal);
  document.getElementById('m-cli-rec').textContent     = fmt(cliRec);
  document.getElementById('m-cli-pend').textContent    = fmt(cliPend);
  document.getElementById('m-cli-venc').textContent    = fmt(cliVenc);
  document.getElementById('m-cli-total-n').textContent = cli.length + ' faturas';
  document.getElementById('m-cli-rec-n').textContent   = cli.filter(isPaid).length + ' faturas';
  document.getElementById('m-cli-pend-n').textContent  = cli.filter(i => !isPaid(i) && !isOverdue(i)).length + ' faturas';
  document.getElementById('m-cli-venc-n').textContent  = cli.filter(isOverdue).length + ' faturas';

  // Cash flow projetado
  renderCashFlow();

  // Gráficos
  renderChartMensal();
  renderChartPasstas();

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

// ─── Cash flow projetado ──────────────────────────────────────────────────────
function renderCashFlow() {
  const now = new Date();
  const cf = [
    { label: 'Próximos 30d', from: 0,  to: 30  },
    { label: 'Dias 31–60',   from: 31, to: 60  },
    { label: 'Dias 61–90',   from: 61, to: 90  },
  ].map(({ label, from, to }) => {
    const start = new Date(now); start.setDate(now.getDate() + from);
    const end   = new Date(now); end.setDate(now.getDate() + to);
    const saidas = invoices.filter(i => !isClient(i) && !isPaid(i) && i.vencimento)
      .filter(i => { const d = parseDate(i.vencimento); return d && d >= start && d <= end; })
      .reduce((s, i) => s + toNum(i.total), 0);
    const entradas = invoices.filter(i => isClient(i) && !isPaid(i) && i.vencimento)
      .filter(i => { const d = parseDate(i.vencimento); return d && d >= start && d <= end; })
      .reduce((s, i) => s + toNum(i.total), 0);
    return { label, saidas, entradas, net: entradas - saidas };
  });

  document.getElementById('dash-cashflow').innerHTML = cf.map(({ label, saidas, entradas, net }) => {
    const pos = net >= 0;
    const col = pos ? 'var(--green)' : 'var(--red)';
    const bg  = pos ? 'var(--green-bg)' : 'var(--red-bg)';
    const brd = pos ? 'var(--green-border)' : 'var(--red-border)';
    return `<div style="background:${bg};border:1px solid ${brd};border-radius:var(--r);padding:14px 16px">
      <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;margin-bottom:6px">${label}</div>
      <div style="font-family:var(--mono);font-size:20px;font-weight:600;color:${col}">${net >= 0 ? '+' : ''}${fmt(net)}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:6px">Saídas: ${fmt(saidas)}</div>
      <div style="font-size:11px;color:var(--muted)">Entradas: ${fmt(entradas)}</div>
    </div>`;
  }).join('');
}

// ─── Gráfico: últimos 6 meses ─────────────────────────────────────────────────
function renderChartMensal() {
  const canvas = document.getElementById('chart-mensal');
  if (!canvas || typeof Chart === 'undefined') return;

  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    const label = d.toLocaleDateString('pt-PT', { month: 'short' }).replace('.', '');
    months.push({ key, label, entradas: 0, saidas: 0 });
  }

  invoices.forEach(inv => {
    const parts = (inv.emissao || '').split('/');
    if (parts.length < 3) return;
    const key = `${parts[2]}-${parts[1]}`;
    const m = months.find(x => x.key === key);
    if (!m) return;
    if (isClient(inv)) m.entradas += toNum(inv.total);
    else m.saidas += toNum(inv.total);
  });

  if (chartMensal) chartMensal.destroy();
  chartMensal = new Chart(canvas, {
    type: 'bar',
    data: {
      labels: months.map(m => m.label),
      datasets: [
        {
          label: 'Entradas',
          data: months.map(m => m.entradas),
          backgroundColor: 'rgba(27,107,69,.7)',
          borderRadius: 4,
        },
        {
          label: 'Saídas',
          data: months.map(m => m.saidas),
          backgroundColor: 'rgba(139,26,26,.7)',
          borderRadius: 4,
        },
      ],
    },
    options: {
      responsive: true,
      plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } },
      scales: {
        x: { grid: { display: false }, ticks: { font: { size: 11 } } },
        y: { grid: { color: '#f0f0f0' }, ticks: { font: { size: 11 }, callback: v => v.toLocaleString('pt-PT') + ' €' } },
      },
    },
  });
}

// ─── Gráfico: distribuição por pasta ─────────────────────────────────────────
function renderChartPasstas() {
  const canvas = document.getElementById('chart-pastas');
  if (!canvas || typeof Chart === 'undefined') return;

  const forn = invoices.filter(i => !isClient(i));
  const map  = {};
  forn.forEach(inv => {
    const p   = getPasta(inv.pastaId);
    const key = p ? p.nome : 'Sem pasta';
    map[key]  = (map[key] || 0) + toNum(inv.total);
  });

  const labels = Object.keys(map);
  const values = Object.values(map);
  const colors = [
    '#1A3A5C', '#1B6B45', '#8B1A1A', '#7A4F00', '#4A2080', '#0E6B8A',
    '#2E6BA8', '#2E8B57', '#B22222', '#DAA520',
  ];

  if (chartPasstas) chartPasstas.destroy();

  if (labels.length === 0) {
    document.getElementById('chart-pastas-legend').innerHTML =
      '<p style="color:var(--muted);font-size:12px">Sem dados ainda.</p>';
    return;
  }

  chartPasstas = new Chart(canvas, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 2, borderColor: '#fff' }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      cutout: '60%',
    },
  });

  document.getElementById('chart-pastas-legend').innerHTML = labels.map((l, i) => `
    <div style="display:flex;align-items:center;gap:5px;font-size:11px;color:var(--text)">
      <div style="width:10px;height:10px;border-radius:2px;background:${colors[i]};flex-shrink:0"></div>
      ${l}
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
