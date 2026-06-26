// ─── render.js ────────────────────────────────────────────────────────────────
// Renderização de todas as páginas: dashboard, tabelas, alertas, pastas.

let chartMensal  = null;
let chartPasstas = null;

// ─── Helper: filtro por período MM/AAAA ───────────────────────────────────────
function inPeriod(emissao, de, ate) {
  if (!de && !ate) return true;
  if (!emissao) return false;
  const parts = emissao.split('/');
  if (parts.length < 3) return false;
  const invKey = parts[2] + '-' + parts[1].padStart(2, '0');
  const toKey  = s => { const p = s.trim().split('/'); return p.length === 2 ? p[1] + '-' + p[0].padStart(2,'0') : null; };
  const deKey  = de  ? toKey(de)  : null;
  const ateKey = ate ? toKey(ate) : null;
  if (deKey  && invKey < deKey)  return false;
  if (ateKey && invKey > ateKey) return false;
  return true;
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderDashboard() {
  const forn = invoices.filter(i => !isClient(i));
  const cli  = invoices.filter(i => isClient(i));

  const fornTotal = forn.reduce((s, i) => s + toNum(i.total), 0);
  const fornPago  = forn.filter(isPaid).reduce((s, i) => s + toNum(i.total), 0);
  const fornPend  = forn.filter(i => !isPaid(i) && !isOverdue(i)).reduce((s, i) => s + toNum(i.total), 0);
  const fornVenc  = forn.filter(isOverdue).reduce((s, i) => s + toNum(i.total), 0);
  const cliTotal  = cli.reduce((s, i) => s + toNum(i.total), 0);
  const cliRec    = cli.filter(isPaid).reduce((s, i) => s + toNum(i.total), 0);
  const cliPend   = cli.filter(i => !isPaid(i) && !isOverdue(i)).reduce((s, i) => s + toNum(i.total), 0);
  const cliVenc   = cli.filter(isOverdue).reduce((s, i) => s + toNum(i.total), 0);

  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  set('m-forn-total',   fmt(fornTotal));
  set('m-forn-pago',    fmt(fornPago));
  set('m-forn-pend',    fmt(fornPend));
  set('m-forn-venc',    fmt(fornVenc));
  set('m-forn-total-n', forn.length + ' faturas');
  set('m-forn-pago-n',  forn.filter(isPaid).length + ' pagas');
  set('m-forn-pend-n',  forn.filter(i => !isPaid(i) && !isOverdue(i)).length + ' pendentes');
  set('m-forn-venc-n',  forn.filter(isOverdue).length + ' vencidas');
  set('m-cli-total',    fmt(cliTotal));
  set('m-cli-rec',      fmt(cliRec));
  set('m-cli-pend',     fmt(cliPend));
  set('m-cli-venc',     fmt(cliVenc));
  set('m-cli-total-n',  cli.length + ' faturas');
  set('m-cli-rec-n',    cli.filter(isPaid).length + ' recebidas');
  set('m-cli-pend-n',   cli.filter(i => !isPaid(i) && !isOverdue(i)).length + ' por receber');
  set('m-cli-venc-n',   cli.filter(isOverdue).length + ' em atraso');

  renderCashFlow();
  renderChartMensal();
  renderChartPasstas();

  // Recentes
  const recent = [...invoices].sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')).slice(0, 5);
  const recentEl = document.getElementById('dash-recent');
  if (recentEl) recentEl.innerHTML = recent.length === 0
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

  // Vencimentos
  const upcoming = invoices.filter(i => !isPaid(i) && i.vencimento && daysDiff(i.vencimento) !== null && daysDiff(i.vencimento) <= 14 && daysDiff(i.vencimento) >= 0)
    .sort((a, b) => (parseDate(a.vencimento) || 0) - (parseDate(b.vencimento) || 0)).slice(0, 6);
  const vencEl = document.getElementById('dash-venc');
  if (vencEl) vencEl.innerHTML = upcoming.length === 0
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
    const saidas   = invoices.filter(i => !isClient(i) && !isPaid(i) && i.vencimento)
      .filter(i => { const d = parseDate(i.vencimento); return d && d >= start && d <= end; })
      .reduce((s, i) => s + toNum(i.total), 0);
    const entradas = invoices.filter(i => isClient(i) && !isPaid(i) && i.vencimento)
      .filter(i => { const d = parseDate(i.vencimento); return d && d >= start && d <= end; })
      .reduce((s, i) => s + toNum(i.total), 0);
    return { label, saidas, entradas, net: entradas - saidas };
  });

  const el = document.getElementById('dash-cashflow');
  if (el) el.innerHTML = cf.map(({ label, saidas, entradas, net }) => {
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

// ─── Gráfico: 6 meses ─────────────────────────────────────────────────────────
function renderChartMensal() {
  const canvas = document.getElementById('chart-mensal');
  if (!canvas || typeof Chart === 'undefined') return;
  const now = new Date();
  const months = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`, label: d.toLocaleDateString('pt-PT', { month: 'short' }).replace('.',''), entradas: 0, saidas: 0 });
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
    data: { labels: months.map(m => m.label), datasets: [
      { label: 'Entradas', data: months.map(m => m.entradas), backgroundColor: 'rgba(27,107,69,.7)', borderRadius: 4 },
      { label: 'Saídas',   data: months.map(m => m.saidas),   backgroundColor: 'rgba(139,26,26,.7)', borderRadius: 4 },
    ]},
    options: { responsive: true, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, boxWidth: 12 } } }, scales: {
      x: { grid: { display: false }, ticks: { font: { size: 11 } } },
      y: { grid: { color: '#f0f0f0' }, ticks: { font: { size: 11 }, callback: v => v.toLocaleString('pt-PT') + ' €' } },
    }},
  });
}

// ─── Gráfico: pastas ──────────────────────────────────────────────────────────
function renderChartPasstas() {
  const canvas = document.getElementById('chart-pastas');
  if (!canvas || typeof Chart === 'undefined') return;
  const map = {};
  invoices.filter(i => !isClient(i)).forEach(inv => {
    const p = getPasta(inv.pastaId);
    const k = p ? p.nome : 'Sem pasta';
    map[k] = (map[k] || 0) + toNum(inv.total);
  });
  const labels = Object.keys(map);
  const values = Object.values(map);
  const colors = ['#1A3A5C','#1B6B45','#8B1A1A','#7A4F00','#4A2080','#0E6B8A','#2E6BA8','#2E8B57'];
  if (chartPasstas) chartPasstas.destroy();
  const legendEl = document.getElementById('chart-pastas-legend');
  if (labels.length === 0) { if (legendEl) legendEl.innerHTML = '<p style="color:var(--muted);font-size:12px">Sem dados.</p>'; return; }
  chartPasstas = new Chart(canvas, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderWidth: 2, borderColor: '#fff' }] },
    options: { responsive: true, plugins: { legend: { display: false } }, cutout: '60%' },
  });
  if (legendEl) legendEl.innerHTML = labels.map((l, i) => `
    <div style="display:flex;align-items:center;gap:5px;font-size:11px">
      <div style="width:10px;height:10px;border-radius:2px;background:${colors[i]};flex-shrink:0"></div>${l}
    </div>`).join('');
}

// ─── KPIs reutilizáveis ───────────────────────────────────────────────────────
function renderKPIs(data, containerId, tipo) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const total    = data.reduce((s, i) => s + toNum(i.total), 0);
  const pagos    = data.filter(isPaid);
  const pendentes = data.filter(i => !isPaid(i) && !isOverdue(i));
  const vencidas  = data.filter(isOverdue);
  const unicos    = [...new Set(data.map(i => i.entidade).filter(Boolean))].length;
  const media     = data.length > 0 ? total / data.length : 0;
  const isPagLabel = tipo === 'cliente' ? 'Recebido' : 'Pago';
  el.innerHTML = `
    <div class="kpi-grid">
      <div class="kpi"><div class="kpi-label">Total</div><div class="kpi-value c-blue">${fmt(total)}</div><div class="kpi-sub">${data.length} faturas</div></div>
      <div class="kpi"><div class="kpi-label">${isPagLabel}</div><div class="kpi-value c-green">${fmt(pagos.reduce((s,i)=>s+toNum(i.total),0))}</div><div class="kpi-sub">${pagos.length} faturas</div></div>
      <div class="kpi"><div class="kpi-label">Pendente</div><div class="kpi-value c-amber">${fmt(pendentes.reduce((s,i)=>s+toNum(i.total),0))}</div><div class="kpi-sub">${pendentes.length} faturas</div></div>
      <div class="kpi"><div class="kpi-label">Vencidas</div><div class="kpi-value c-red">${fmt(vencidas.reduce((s,i)=>s+toNum(i.total),0))}</div><div class="kpi-sub">${vencidas.length} faturas</div></div>
      <div class="kpi"><div class="kpi-label">${tipo === 'cliente' ? 'Clientes únicos' : 'Fornecedores únicos'}</div><div class="kpi-value">${unicos}</div><div class="kpi-sub">entidades</div></div>
      <div class="kpi"><div class="kpi-label">Média por fatura</div><div class="kpi-value">${fmt(media)}</div><div class="kpi-sub">valor médio</div></div>
    </div>`;
}

// ─── Tabela de fornecedores ───────────────────────────────────────────────────
function renderForn() {
  const estado = document.getElementById('ff-estado')?.value || '';
  const pasta  = document.getElementById('ff-pasta')?.value  || '';
  const search = (document.getElementById('ff-search')?.value || '').toLowerCase();
  const de     = document.getElementById('ff-de')?.value     || '';
  const ate    = document.getElementById('ff-ate')?.value    || '';

  const all  = invoices.filter(i => !isClient(i));
  let data   = [...all];
  if (estado === 'vencido') data = data.filter(isOverdue);
  else if (estado)          data = data.filter(i => i.estado === estado);
  if (pasta)  data = data.filter(i => String(i.pastaId || '') === pasta);
  if (search) data = data.filter(i => (i.entidade||'').toLowerCase().includes(search) || (i.numero||'').toLowerCase().includes(search));
  data = data.filter(i => inPeriod(i.emissao, de, ate));

  // KPIs
  renderKPIs(all, 'forn-kpis', 'fornecedor');

  const countEl = document.getElementById('forn-count');
  if (countEl) countEl.textContent = data.length + ' fatura' + (data.length !== 1 ? 's' : '');
  const body  = document.getElementById('forn-body');
  const empty = document.getElementById('forn-empty');
  if (data.length === 0) { if(body) body.innerHTML = ''; if(empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';

  if (body) body.innerHTML = data.sort((a, b) => (b.addedAt||'').localeCompare(a.addedAt||'')).map(inv => {
    const ri    = invoices.indexOf(inv);
    const p     = getPasta(inv.pastaId);
    const pChip = p ? `<span class="folder-chip" style="background:${p.cor.bg};color:${p.cor.text};border-color:${p.cor.border}">${p.icon} ${p.nome}</span>`
                    : '<span style="color:var(--muted);font-size:12px">—</span>';
    return `<tr>
      <td>${estadoBadge(inv)} ${dueBadge(inv)}</td>
      <td class="mono">${inv.numero||'—'}</td>
      <td><strong style="font-weight:500">${inv.entidade||'—'}</strong></td>
      <td class="mono" style="color:var(--muted)">${inv.nif||'—'}</td>
      <td style="color:var(--muted)">${inv.emissao||'—'}</td>
      <td style="color:var(--muted)">${inv.vencimento||'—'}</td>
      <td class="mono"><strong>${fmt(inv.total)}</strong></td>
      <td>${pChip}</td>
      <td><div style="display:flex;gap:3px">
        <button class="icon-btn" title="Ver"    onclick="viewInv(${ri})">👁</button>
        <button class="icon-btn" title="Estado" onclick="openWF(${ri})">⇄</button>
        <button class="icon-btn" title="Editar" onclick="editInv(${ri})">✎</button>
        <button class="icon-btn" title="Apagar" onclick="delInv(${ri})">✕</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ─── Tabela de clientes ───────────────────────────────────────────────────────
function renderCli() {
  const estado = document.getElementById('cf-estado')?.value || '';
  const pasta  = document.getElementById('cf-pasta')?.value  || '';
  const search = (document.getElementById('cf-search')?.value || '').toLowerCase();
  const de     = document.getElementById('cf-de')?.value     || '';
  const ate    = document.getElementById('cf-ate')?.value    || '';

  const all  = invoices.filter(isClient);
  let data   = [...all];
  if (estado === 'vencido')       data = data.filter(isOverdue);
  else if (estado === 'recebido') data = data.filter(i => i.estado === 'pago');
  else if (estado === 'pendente') data = data.filter(i => i.estado !== 'pago');
  if (pasta)  data = data.filter(i => String(i.pastaId || '') === pasta);
  if (search) data = data.filter(i => (i.entidade||'').toLowerCase().includes(search) || (i.numero||'').toLowerCase().includes(search));
  data = data.filter(i => inPeriod(i.emissao, de, ate));

  // KPIs
  renderKPIs(all, 'cli-kpis', 'cliente');

  const countEl = document.getElementById('cli-count');
  if (countEl) countEl.textContent = data.length + ' fatura' + (data.length !== 1 ? 's' : '');
  const body  = document.getElementById('cli-body');
  const empty = document.getElementById('cli-empty');
  if (data.length === 0) { if(body) body.innerHTML = ''; if(empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';

  if (body) body.innerHTML = data.sort((a, b) => (b.addedAt||'').localeCompare(a.addedAt||'')).map(inv => {
    const ri    = invoices.indexOf(inv);
    const p     = getPasta(inv.pastaId);
    const pChip = p ? `<span class="folder-chip" style="background:${p.cor.bg};color:${p.cor.text};border-color:${p.cor.border}">${p.icon} ${p.nome}</span>`
                    : '<span style="color:var(--muted);font-size:12px">—</span>';
    const badgeLbl = inv.estado === 'pago' ? '<span class="badge badge-recebido">Recebido</span>' : estadoBadge(inv);
    return `<tr>
      <td>${badgeLbl} ${dueBadge(inv)}</td>
      <td class="mono">${inv.numero||'—'}</td>
      <td><strong style="font-weight:500">${inv.entidade||'—'}</strong></td>
      <td class="mono" style="color:var(--muted)">${inv.nif||'—'}</td>
      <td style="color:var(--muted)">${inv.emissao||'—'}</td>
      <td style="color:var(--muted)">${inv.vencimento||'—'}</td>
      <td class="mono"><strong>${fmt(inv.total)}</strong></td>
      <td>${pChip}</td>
      <td><div style="display:flex;gap:3px">
        <button class="icon-btn" title="Ver"    onclick="viewInv(${ri})">👁</button>
        <button class="icon-btn" title="Estado" onclick="openWF(${ri})">⇄</button>
        <button class="icon-btn" title="Editar" onclick="editInv(${ri})">✎</button>
        <button class="icon-btn" title="Apagar" onclick="delInv(${ri})">✕</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ─── Alertas ──────────────────────────────────────────────────────────────────
function renderAlertas() {
  const alerts = invoices.filter(i => !isPaid(i) && i.vencimento && daysDiff(i.vencimento) !== null && daysDiff(i.vencimento) <= 7)
    .sort((a, b) => (parseDate(a.vencimento)||0) - (parseDate(b.vencimento)||0));
  const el = document.getElementById('alertas-list');
  if (!el) return;
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
          <div style="font-size:13px;font-weight:500">${inv.entidade||'—'} <span style="font-weight:400;color:var(--muted);font-size:12px">${inv.numero||''}</span></div>
          <div style="font-size:11px;color:var(--muted)">Vencimento: ${inv.vencimento} · ${isClient(inv)?'Cliente':'Fornecedor'}</div>
        </div>
      </div>
      <div style="display:flex;align-items:center;gap:12px">
        <div style="text-align:right"><div style="font-family:var(--mono);font-size:13px;font-weight:500">${fmt(inv.total)}</div>${dueBadge(inv)}</div>
        <button class="btn btn-primary btn-sm" onclick="openWF(${ri})">Marcar pago</button>
      </div>
    </div>`;
  }).join('');
}

// ─── Pastas ───────────────────────────────────────────────────────────────────
function renderPastas() {
  const grid  = document.getElementById('pasta-grid');
  const empty = document.getElementById('pasta-empty');
  if (!grid) return;
  if (pastas.length === 0) { grid.innerHTML = ''; if(empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';
  grid.innerHTML = pastas.map((p, idx) => {
    const ct = invoices.filter(i => i.pastaId === p.id).length;
    return `<div class="folder-card" style="border-color:${p.cor.border};background:${p.cor.bg}">
      <button class="fc-del icon-btn" onclick="delPasta(${idx})" title="Apagar">✕</button>
      <div class="fc-icon">${p.icon}</div>
      <div class="fc-name" style="color:${p.cor.text}">${p.nome}</div>
      <div class="fc-count">${ct} fatura${ct!==1?'s':''}</div>
    </div>`;
  }).join('');
}

// ─── Pesquisa global ──────────────────────────────────────────────────────────
function renderPesquisa() {
  const texto  = (document.getElementById('pesq-texto')?.value  || '').toLowerCase();
  const tipo   = document.getElementById('pesq-tipo')?.value    || '';
  const estado = document.getElementById('pesq-estado')?.value  || '';
  const de     = document.getElementById('pesq-de')?.value      || '';
  const ate    = document.getElementById('pesq-ate')?.value     || '';

  let data = [...invoices];
  if (tipo === 'fornecedor') data = data.filter(i => !isClient(i));
  if (tipo === 'cliente')    data = data.filter(i => isClient(i));
  if (estado === 'vencido')  data = data.filter(isOverdue);
  else if (estado)           data = data.filter(i => i.estado === estado);
  if (texto) data = data.filter(i =>
    (i.entidade||'').toLowerCase().includes(texto) ||
    (i.numero||'').toLowerCase().includes(texto) ||
    (i.descritivo||'').toLowerCase().includes(texto) ||
    (i.nif||'').toLowerCase().includes(texto));
  data = data.filter(i => inPeriod(i.emissao, de, ate));

  const body  = document.getElementById('pesq-body');
  const empty = document.getElementById('pesq-empty');
  if (!body) return;
  if (data.length === 0) { body.innerHTML = ''; if(empty) empty.style.display = 'block'; return; }
  if (empty) empty.style.display = 'none';

  body.innerHTML = data.sort((a, b) => (b.addedAt||'').localeCompare(a.addedAt||'')).map(inv => {
    const ri    = invoices.indexOf(inv);
    const p     = getPasta(inv.pastaId);
    const pChip = p ? `<span class="folder-chip" style="background:${p.cor.bg};color:${p.cor.text};border-color:${p.cor.border}">${p.icon} ${p.nome}</span>`
                    : '<span style="color:var(--muted);font-size:12px">—</span>';
    return `<tr>
      <td><span class="badge ${isClient(inv)?'badge-cliente':'badge-fornecedor'}">${isClient(inv)?'Cliente':'Fornecedor'}</span></td>
      <td>${estadoBadge(inv)} ${dueBadge(inv)}</td>
      <td class="mono">${inv.numero||'—'}</td>
      <td><strong style="font-weight:500">${inv.entidade||'—'}</strong></td>
      <td style="color:var(--muted)">${inv.emissao||'—'}</td>
      <td style="color:var(--muted)">${inv.vencimento||'—'}</td>
      <td class="mono"><strong>${fmt(inv.total)}</strong></td>
      <td>${pChip}</td>
      <td><div style="display:flex;gap:3px">
        <button class="icon-btn" title="Ver"    onclick="viewInv(${ri})">👁</button>
        <button class="icon-btn" title="Estado" onclick="openWF(${ri})">⇄</button>
        <button class="icon-btn" title="Apagar" onclick="delInv(${ri})">✕</button>
      </div></td>
    </tr>`;
  }).join('');
}

// ─── Init ─────────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  updateAlertBadge();
});
