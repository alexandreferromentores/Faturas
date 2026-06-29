// ─── nav.js ───────────────────────────────────────────────
// ─── nav.js ───────────────────────────────────────────────────────────────────
// Navegação com persistência via hash URL (#fornecedores, #dashboard, etc.)

const VALID_PAGES = ['dashboard','alertas','fornecedores','clientes','pesquisa','pastas','assistente','config','empresa'];

function nav(name) {
  if (!VALID_PAGES.includes(name)) name = 'dashboard';

  // Actualiza URL hash sem reload
  history.replaceState(null, '', '#' + name);

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(it => {
    if (it.getAttribute('onclick')?.includes("'" + name + "'")) it.classList.add('active');
  });

  // Callbacks por página
  const callbacks = {
    dashboard:    () => { renderDashboard(); renderCalendar(); },
    fornecedores: () => { populatePastaFilter('ff-pasta'); renderForn(); },
    clientes:     () => { populatePastaFilter('cf-pasta'); renderCli(); },
    pastas:       () => renderPastas(),
    alertas:      () => renderAlertas(),
    config:       () => loadConfig(),
    assistente:   () => initChat(),
    pesquisa:     () => renderPesquisa(),
    empresa:      () => loadEmpresa(),
  };
  callbacks[name]?.();
  updateAlertBadge();
}

// Restaura a página ao carregar com base no hash
document.addEventListener('DOMContentLoaded', () => {
  const hash = location.hash.replace('#', '');
  nav(VALID_PAGES.includes(hash) ? hash : 'dashboard');
});

// Suporte ao botão Back/Forward do browser
window.addEventListener('popstate', () => {
  const hash = location.hash.replace('#', '');
  nav(VALID_PAGES.includes(hash) ? hash : 'dashboard');
});



// ── Dropdown logic ────────────────────────────────────────────────────────────
function toggleDropdown(id) {
  const menu = document.getElementById(id + '-menu');
  document.querySelectorAll('.btn-dropdown-menu').forEach(m => { if (m !== menu) m.classList.remove('show'); });
  menu.classList.toggle('show');
}
function closeDropdowns() {
  document.querySelectorAll('.btn-dropdown-menu').forEach(m => m.classList.remove('show'));
}
document.addEventListener('click', e => { if (!e.target.closest('.btn-dropdown')) closeDropdowns(); });

// ── Upload modal ─────────────────────────────────────────────────────────────
function openUploadModal(tipo) {
  document.getElementById('upload-tipo').value = tipo;
  document.getElementById('upload-modal-title').textContent = tipo === 'cliente' ? 'Carregar Fatura de Cliente' : 'Carregar Fatura de Fornecedor';
  populatePastaSelect('f-pasta');
  resetUpload();
  document.getElementById('modal-upload').classList.add('show');
}
function closeUploadModal() {
  document.getElementById('modal-upload').classList.remove('show');
  resetUpload();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── DARK MODE ──────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function toggleTheme() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const newTheme = isDark ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('fv_theme', newTheme);
  document.getElementById('theme-btn').textContent = newTheme === 'dark' ? '☀️' : '🌙';
}

(function initTheme() {
  const saved = localStorage.getItem('fv_theme') || 'light';
  document.documentElement.setAttribute('data-theme', saved);
  document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('theme-btn');
    if (btn) btn.textContent = saved === 'dark' ? '☀️' : '🌙';
  });
})();

// ═══════════════════════════════════════════════════════════════════════════════
// ── EMPRESA ────────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
let empresa = JSON.parse(localStorage.getItem('fv_empresa') || '{}');

function loadEmpresa() {
  document.getElementById('emp-nome').value        = empresa.nome        || '';
  document.getElementById('emp-nif').value         = empresa.nif         || '';
  document.getElementById('emp-email').value       = empresa.email       || '';
  document.getElementById('emp-tel').value         = empresa.tel         || '';
  document.getElementById('emp-morada').value      = empresa.morada      || '';
  document.getElementById('emp-iva-regime').value  = empresa.ivaRegime   || '';
  document.getElementById('emp-cae').value         = empresa.cae         || '';
  document.getElementById('emp-iban').value        = empresa.iban        || '';
  document.getElementById('emp-ano-fiscal').value  = empresa.anoFiscal   || new Date().getFullYear();
  document.getElementById('emp-cont-nome').value   = empresa.contNome    || '';
  document.getElementById('emp-cont-email').value  = empresa.contEmail   || '';
  document.getElementById('emp-cont-tel').value    = empresa.contTel     || '';
  document.getElementById('emp-cont-nif').value    = empresa.contNif     || '';
  document.getElementById('emp-notas').value       = empresa.notas       || '';

  // Logo
  if (empresa.logo) {
    const prev = document.getElementById('emp-logo-preview');
    if (prev) prev.innerHTML = `<img src="${empresa.logo}" style="width:100%;height:100%;object-fit:contain;border-radius:4px">`;
  }
}

function saveEmpresa() {
  empresa = {
    nome:       document.getElementById('emp-nome').value.trim(),
    nif:        document.getElementById('emp-nif').value.trim(),
    email:      document.getElementById('emp-email').value.trim(),
    tel:        document.getElementById('emp-tel').value.trim(),
    morada:     document.getElementById('emp-morada').value.trim(),
    ivaRegime:  document.getElementById('emp-iva-regime').value,
    cae:        document.getElementById('emp-cae').value.trim(),
    iban:       document.getElementById('emp-iban').value.trim(),
    anoFiscal:  document.getElementById('emp-ano-fiscal').value.trim(),
    contNome:   document.getElementById('emp-cont-nome').value.trim(),
    contEmail:  document.getElementById('emp-cont-email').value.trim(),
    contTel:    document.getElementById('emp-cont-tel').value.trim(),
    contNif:    document.getElementById('emp-cont-nif').value.trim(),
    notas:      document.getElementById('emp-notas').value.trim(),
    logo:       empresa.logo || '',
  };
  localStorage.setItem('fv_empresa', JSON.stringify(empresa));
  updateCompanyBadge();
  toast('Perfil da empresa guardado!', 'success');
}

function loadLogo(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    empresa.logo = e.target.result;
    const prev = document.getElementById('emp-logo-preview');
    if (prev) prev.innerHTML = `<img src="${empresa.logo}" style="width:100%;height:100%;object-fit:contain;border-radius:4px">`;
    toast('Logo carregado — guarda para confirmar', '');
  };
  reader.readAsDataURL(file);
}

function updateCompanyBadge() {
  const badge = document.getElementById('company-badge');
  const nameEl = document.getElementById('company-name-nav');
  const nifEl  = document.getElementById('company-nif-nav');
  if (!badge) return;
  if (empresa.nome) {
    badge.style.display = 'flex';
    nameEl.textContent  = empresa.nome.slice(0, 24) + (empresa.nome.length > 24 ? '…' : '');
    nifEl.textContent   = empresa.nif ? 'NIF ' + empresa.nif : '';
  } else {
    badge.style.display = 'none';
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── AUTO-ASSOCIAÇÃO DE PASTA ────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function autoMatchPasta(entidade, descritivo) {
  if (!pastas.length) return null;
  const hay = (entidade + ' ' + descritivo).toLowerCase();
  let best = null, bestScore = 0;
  for (const p of pastas) {
    const words = p.nome.toLowerCase().split(/[\s\-_/]+/).filter(w => w.length > 2);
    let score = 0;
    for (const w of words) { if (hay.includes(w)) score += w.length * 2; }
    if (score > bestScore) { bestScore = score; best = p; }
  }
  return bestScore >= 4 ? best : null;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── CALENDÁRIO ──────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
let calYear  = new Date().getFullYear();
let calMonth = new Date().getMonth();

const MONTH_NAMES = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
const DAY_NAMES   = ['Seg','Ter','Qua','Qui','Sex','Sáb','Dom'];

function renderCalendar() {
  const titleEl  = document.getElementById('cal-title');
  const headerEl = document.getElementById('cal-header');
  const gridEl   = document.getElementById('cal-grid');
  if (!titleEl || !headerEl || !gridEl) return;

  titleEl.textContent = MONTH_NAMES[calMonth] + ' ' + calYear;

  headerEl.innerHTML = DAY_NAMES.map(d =>
    `<div class="cal-day-name">${d}</div>`
  ).join('');

  const firstDay = new Date(calYear, calMonth, 1).getDay();
  const offset   = firstDay === 0 ? 6 : firstDay - 1;
  const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
  const today    = new Date();

  // Build map of due dates
  const dueMap = {};
  invoices.filter(i => !isPaid(i) && i.vencimento).forEach(inv => {
    const d = parseDate(inv.vencimento);
    if (!d || d.getFullYear() !== calYear || d.getMonth() !== calMonth) return;
    const key = d.getDate();
    if (!dueMap[key]) dueMap[key] = [];
    dueMap[key].push(inv);
  });

  let cells = '';
  for (let i = 0; i < offset; i++) cells += '<div class="cal-cell empty"></div>';

  for (let day = 1; day <= daysInMonth; day++) {
    const isToday = day === today.getDate() && calMonth === today.getMonth() && calYear === today.getFullYear();
    const items   = dueMap[day] || [];
    const hasItems = items.length > 0;
    const classes = ['cal-cell', isToday ? 'today' : '', hasItems ? 'has-items' : ''].filter(Boolean).join(' ');
    const chips   = items.slice(0, 2).map(i =>
      `<div class="cal-inv-chip ${isClient(i) ? 'client' : ''}">${(i.entidade || '').slice(0, 12)}</div>`
    ).join('');
    const more = items.length > 2 ? `<div style="font-size:9px;color:var(--red);font-weight:700;margin-top:2px">+${items.length - 2}</div>` : '';
    cells += `<div class="${classes}">
      <div class="cal-day-num">${day}</div>
      ${chips}${more}
    </div>`;
  }

  gridEl.innerHTML = cells;
}

function calPrev() { calMonth--; if (calMonth < 0) { calMonth = 11; calYear--; } renderCalendar(); }
function calNext() { calMonth++; if (calMonth > 11) { calMonth = 0; calYear++; } renderCalendar(); }

// ═══════════════════════════════════════════════════════════════════════════════
// ── HEALTH SCORE ────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function renderHealthScore() {
  const el = document.getElementById('health-score-bar');
  if (!el || !invoices.length) { if (el) el.style.display = 'none'; return; }

  const total    = invoices.reduce((s, i) => s + toNum(i.total), 0);
  const vencidas = invoices.filter(isOverdue).reduce((s, i) => s + toNum(i.total), 0);
  const pendentes = invoices.filter(i => !isPaid(i) && !isOverdue(i)).reduce((s, i) => s + toNum(i.total), 0);

  const overdueRatio  = total > 0 ? vencidas / total : 0;
  const pendingRatio  = total > 0 ? pendentes / total : 0;

  let score, color, bg, border, label, sub;
  if (overdueRatio > 0.3) {
    score = 'Crítico'; color = 'var(--red)'; bg = 'var(--red-bg)'; border = 'var(--red-border)';
    sub = `${fmt(vencidas)} em faturas vencidas (${Math.round(overdueRatio*100)}% do total)`;
  } else if (overdueRatio > 0.1 || pendingRatio > 0.5) {
    score = 'Atenção'; color = 'var(--amber)'; bg = 'var(--amber-bg)'; border = 'var(--amber-border)';
    sub = overdueRatio > 0.1 ? `${fmt(vencidas)} em faturas vencidas` : `${fmt(pendentes)} pendente de pagamento`;
  } else {
    score = 'Saudável'; color = 'var(--green)'; bg = 'var(--green-bg)'; border = 'var(--green-border)';
    sub = 'Situação financeira sob controlo';
  }

  el.style.cssText = `display:flex;align-items:center;gap:10px;padding:14px 18px;border-radius:var(--r);background:${bg};border:1px solid ${border};margin-bottom:20px`;
  el.innerHTML = `
    <div style="width:12px;height:12px;border-radius:50%;background:${color};flex-shrink:0"></div>
    <div>
      <div style="font-size:13px;font-weight:700;color:${color}">Saúde Financeira: ${score}</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">${sub}</div>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── RELATÓRIO MENSAL PDF ────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
function openRelatorioModal() {
  const now = new Date();
  const selMes = document.getElementById('rel-mes');
  const selAno = document.getElementById('rel-ano');
  if (!selMes || !selAno) return;
  selMes.value = now.getMonth();

  // Populate years
  const years = [...new Set(invoices.map(i => { const p = (i.emissao||'').split('/'); return p[2]; }).filter(Boolean))];
  if (!years.includes(String(now.getFullYear()))) years.push(String(now.getFullYear()));
  years.sort().reverse();
  selAno.innerHTML = years.map(y => `<option value="${y}" ${y == now.getFullYear() ? 'selected' : ''}>${y}</option>`).join('');

  openModal('modal-relatorio');
}

function gerarRelatorioPDF() {
  const mes = parseInt(document.getElementById('rel-mes').value);
  const ano = parseInt(document.getElementById('rel-ano').value);
  const mesNome = MONTH_NAMES[mes] + ' ' + ano;
  const mesKey  = `${ano}-${String(mes+1).padStart(2,'0')}`;

  const fInvs = invoices.filter(i => !isClient(i)).filter(i => {
    const p = (i.emissao||'').split('/'); return p.length >= 3 && `${p[2]}-${p[1]}` === mesKey;
  });
  const fCli = invoices.filter(isClient).filter(i => {
    const p = (i.emissao||'').split('/'); return p.length >= 3 && `${p[2]}-${p[1]}` === mesKey;
  });

  const totalFat  = fInvs.reduce((s,i) => s + toNum(i.total), 0);
  const totalPago = fInvs.filter(isPaid).reduce((s,i) => s + toNum(i.total), 0);
  const totalPend = fInvs.filter(i => !isPaid(i)).reduce((s,i) => s + toNum(i.total), 0);
  const totalEmit = fCli.reduce((s,i) => s + toNum(i.total), 0);
  const totalRec  = fCli.filter(isPaid).reduce((s,i) => s + toNum(i.total), 0);

  const byPasta = {};
  fInvs.forEach(i => { const p = getPasta(i.pastaId); const k = p ? p.nome : 'Sem pasta'; byPasta[k] = (byPasta[k]||0) + toNum(i.total); });
  const topPastas = Object.entries(byPasta).sort((a,b) => b[1]-a[1]).slice(0, 5);

  const fRows = fInvs.map(i => `<tr><td>${i.entidade||''}</td><td>${i.numero||''}</td><td>${i.emissao||''}</td><td style="text-align:right">${fmt(i.total)}</td><td style="color:${isPaid(i)?'#22C55E':'#F59E0B'}">${isPaid(i)?'Pago':'Pendente'}</td></tr>`).join('');
  const cRows = fCli.map(i => `<tr><td>${i.entidade||''}</td><td>${i.numero||''}</td><td>${i.emissao||''}</td><td style="text-align:right">${fmt(i.total)}</td><td style="color:${isPaid(i)?'#22C55E':'#F59E0B'}">${isPaid(i)?'Recebido':'Pendente'}</td></tr>`).join('');
  const now = new Date().toLocaleDateString('pt-PT');

  const ivaLabel = {'normal':'Regime Normal','isento':'Isento (art. 53º CIVA)','retalhistas':'Pequenos Retalhistas','margem':'Regime da Margem'}[empresa.ivaRegime||''] || '';
  const htmlReport = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Resumo ${mesNome}</title>
<style>body{font-family:Arial,sans-serif;padding:32px;color:#111;font-size:13px}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:24px 0 8px;color:#1A3A5C;border-bottom:2px solid #1A3A5C;padding-bottom:4px}p{color:#666;font-size:12px;margin:0 0 16px}table{width:100%;border-collapse:collapse;margin-bottom:16px}th{background:#1A3A5C;color:#fff;padding:7px 10px;text-align:left;font-size:11px}td{padding:7px 10px;border-bottom:1px solid #eee;font-size:12px}tr:nth-child(even)td{background:#f9f9f9}.kpis{display:grid;grid-template-columns:repeat(5,1fr);gap:12px;margin-bottom:24px}.kpi{background:#f4f4f8;border-radius:8px;padding:12px;text-align:center}.kpi-val{font-size:16px;font-weight:800;color:#1A3A5C}.kpi-label{font-size:10px;color:#888;text-transform:uppercase;margin-top:4px}.footer{margin-top:32px;font-size:11px;color:#aaa;text-align:center}.company-header{display:flex;align-items:center;gap:16px;margin-bottom:20px;padding-bottom:16px;border-bottom:2px solid #1A3A5C}.company-logo{width:60px;height:60px;object-fit:contain}</style>
</head><body>
<div class="company-header">
  ${empresa.logo ? `<img src="${empresa.logo}" class="company-logo">` : ''}
  <div>
    <h1 style="margin:0 0 2px">${empresa.nome || 'Relatório Mensal'}</h1>
    <p style="margin:0">${[empresa.nif ? 'NIF '+empresa.nif : '', empresa.cae ? 'CAE '+empresa.cae : '', ivaLabel].filter(Boolean).join(' · ')}</p>
    <p style="margin:2px 0 0">${[empresa.morada, empresa.email, empresa.tel].filter(Boolean).join(' · ')}</p>
  </div>
</div>
<h2 style="margin-top:0">Resumo — ${mesNome}</h2>
<p>Gerado em ${now}${empresa.contNome ? ' · Contabilista: '+empresa.contNome : ''}</p>
<div class="kpis">
  <div class="kpi"><div class="kpi-val">${fmt(totalFat)}</div><div class="kpi-label">Faturado</div></div>
  <div class="kpi"><div class="kpi-val">${fmt(totalPago)}</div><div class="kpi-label">Pago</div></div>
  <div class="kpi"><div class="kpi-val">${fmt(totalPend)}</div><div class="kpi-label">Pendente</div></div>
  <div class="kpi"><div class="kpi-val">${fmt(totalEmit)}</div><div class="kpi-label">Emitido</div></div>
  <div class="kpi"><div class="kpi-val">${fmt(totalRec)}</div><div class="kpi-label">Recebido</div></div>
</div>
${topPastas.length > 0 ? `<h2>Gastos por Pasta</h2><table><thead><tr><th>Pasta</th><th style="text-align:right">Total</th></tr></thead><tbody>${topPastas.map(([k,v]) => `<tr><td>${k}</td><td style="text-align:right">${fmt(v)}</td></tr>`).join('')}</tbody></table>` : ''}
${fInvs.length > 0 ? `<h2>Faturas de Fornecedor (${fInvs.length})</h2><table><thead><tr><th>Fornecedor</th><th>Nº Fatura</th><th>Data</th><th style="text-align:right">Valor</th><th>Estado</th></tr></thead><tbody>${fRows}</tbody></table>` : ''}
${fCli.length > 0 ? `<h2>Faturas de Cliente (${fCli.length})</h2><table><thead><tr><th>Cliente</th><th>Nº Fatura</th><th>Data</th><th style="text-align:right">Valor</th><th>Estado</th></tr></thead><tbody>${cRows}</tbody></table>` : ''}
<div class="footer">Faturas App · ${now}</div>
</body></html>`;

  const w = window.open('', '_blank');
  w.document.write(htmlReport);
  w.document.close();
  setTimeout(() => w.print(), 600);
  closeModal('modal-relatorio');
  toast('A abrir relatório para impressão/PDF...', 'success');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── UPLOAD EM LOTE ──────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
async function handleFiles(files) {
  if (!files || files.length === 0) return;
  if (files.length === 1) { handleFile(files[0]); return; }

  // Multiple files — batch process
  const tipo = document.getElementById('upload-tipo')?.value || 'fornecedor';
  const prog = document.getElementById('upload-progress');
  const bar  = document.getElementById('up-bar');
  const pct  = document.getElementById('up-pct');
  const lbl  = document.getElementById('up-label');
  const nameEl = document.getElementById('up-name');

  if (prog) prog.classList.add('show');
  let processed = 0;

  for (const file of Array.from(files)) {
    if (file.type !== 'application/pdf') continue;
    if (lbl) lbl.textContent = `A processar ${processed + 1} de ${files.length}`;
    if (nameEl) nameEl.textContent = '📄 ' + file.name;

    try {
      const text = await readPDFText(file);
      const data = parseReciboVerde(text);

      // Auto-match pasta
      const pasta = autoMatchPasta(data.entidade || '', data.descritivo || '');
      const inv = buildInv({
        tipo,
        numero:     data.numero     || '',
        entidade:   data.entidade   || '',
        nif:        data.nif        || '',
        emissao:    data.emissao    || '',
        vencimento: data.vencimento || '',
        descritivo: data.descritivo || '',
        base:       data.base       || '',
        iva:        data.iva        || '',
        retencao:   data.retencao   || '',
        totalDoc:   data.totalDoc   || '',
        total:      data.total      || '',
        estado:     'pendente',
        pastaId:    pasta ? pasta.id : null,
      });

      // Upload PDF to Drive
      if (config.sheetsKey) {
        try {
          const filename = `${(data.numero||'fatura').replace(/[^a-zA-Z0-9_-]/g,'_')}_fatura.pdf`;
          const result = await uploadToDrive(file, filename);
          inv.faturaUrl = result.url;
          inv.faturaId  = result.id;
        } catch(e) { console.warn('Drive upload failed:', e.message); }
      }

      invoices.push(inv);
    } catch(e) { console.warn('Failed to process', file.name, e.message); }

    processed++;
    const p = Math.round((processed / files.length) * 100);
    if (bar) bar.style.width = p + '%';
    if (pct) pct.textContent = p + '%';
  }

  save();
  if (prog) { setTimeout(() => prog.classList.remove('show'), 1500); }
  closeModal('modal-upload');
  toast(`${processed} fatura${processed !== 1 ? 's' : ''} importada${processed !== 1 ? 's' : ''}!`, 'success');
  nav(tipo === 'cliente' ? 'clientes' : 'fornecedores');
  updateAlertBadge();
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── ONBOARDING ──────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
const OB_STEPS = [
  { icon: '🏢', title: 'Define a tua empresa',    desc: 'Vai a "Empresa" no menu e preenche o NIF, nome e email. Estes dados aparecem nos relatórios.' },
  { icon: '📁', title: 'Cria pastas',              desc: 'No separador Pastas, cria categorias como "EDP", "Contabilidade". As faturas são associadas automaticamente.' },
  { icon: '⬆',  title: 'Carrega faturas',          desc: 'Em Fornecedores ou Clientes, usa o botão "Carregar". Podes carregar múltiplos PDFs de uma vez.' },
  { icon: '⚙',  title: 'Configura o Google Sheets', desc: 'Em Configuração, cola o JSON da Service Account para guardar os dados na cloud.' },
  { icon: '✦',  title: 'Usa o Assistente IA',      desc: 'O Assistente responde perguntas sobre cash flow, faturas em atraso, vencimentos e muito mais.' },
];
let obStep = 0;

function startOnboarding() {
  if (localStorage.getItem('fv_ob_done')) return;
  obStep = 0;
  renderObStep();
  document.getElementById('onboarding-overlay').classList.add('show');
}

function renderObStep() {
  const s = OB_STEPS[obStep];
  document.getElementById('ob-icon').textContent  = s.icon;
  document.getElementById('ob-title').textContent = s.title;
  document.getElementById('ob-desc').textContent  = s.desc;
  document.getElementById('ob-btn').textContent   = obStep === OB_STEPS.length - 1 ? 'Começar ✓' : 'Próximo →';
  document.getElementById('ob-dots').innerHTML    = OB_STEPS.map((_, i) =>
    `<div class="onboarding-dot ${i === obStep ? 'active' : ''}"></div>`
  ).join('');
}

function nextOnboarding() {
  obStep++;
  if (obStep >= OB_STEPS.length) { skipOnboarding(); return; }
  renderObStep();
}

function skipOnboarding() {
  localStorage.setItem('fv_ob_done', '1');
  document.getElementById('onboarding-overlay').classList.remove('show');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── INICIALIZAÇÃO ───────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════
document.addEventListener('DOMContentLoaded', () => {
  updateCompanyBadge();
  // Start onboarding for new users
  if (!localStorage.getItem('fv_ob_done') && invoices.length === 0) {
    setTimeout(startOnboarding, 800);
  }
});
