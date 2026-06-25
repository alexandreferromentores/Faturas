// ─── Estado global ────────────────────────────────────────────────────────────
let invoices = JSON.parse(localStorage.getItem('fv_invoices') || '[]');
let pastas   = JSON.parse(localStorage.getItem('fv_pastas')   || '[]');
let config   = JSON.parse(localStorage.getItem('fv_config')   || '{}');
let chatHistory = [];

const PASTA_CORES = [
  { name: 'Azul',     bg: '#E8EEF5', text: '#1A3A5C', border: 'rgba(26,58,92,.3)'    },
  { name: 'Verde',    bg: '#E8F5EE', text: '#1B6B45', border: 'rgba(27,107,69,.3)'   },
  { name: 'Vermelho', bg: '#F5E8E8', text: '#8B1A1A', border: 'rgba(139,26,26,.3)'   },
  { name: 'Âmbar',   bg: '#FDF3DC', text: '#7A4F00', border: 'rgba(122,79,0,.3)'    },
  { name: 'Roxo',     bg: '#EEE8F8', text: '#4A2080', border: 'rgba(74,32,128,.3)'   },
  { name: 'Ciano',    bg: '#E0F4FA', text: '#0E6B8A', border: 'rgba(14,107,138,.3)'  },
];
let selectedPastaCor = 0;

// ─── Utilitários ──────────────────────────────────────────────────────────────
const fmt      = v  => (parseFloat(String(v).replace(',', '.')) || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';
const toNum    = v  => parseFloat(String(v).replace(',', '.')) || 0;
const today    = () => { const d = new Date(); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`; };
const parseDate = s => { if (!s) return null; const [d,m,y] = s.split('/'); if (!d||!m||!y) return null; const dt = new Date(+y, +m-1, +d); return isNaN(dt) ? null : dt; };
const daysDiff  = s => { const d = parseDate(s); if (!d) return null; return Math.ceil((d - new Date().setHours(0,0,0,0)) / 86400000); };
const save      = () => { localStorage.setItem('fv_invoices', JSON.stringify(invoices)); localStorage.setItem('fv_pastas', JSON.stringify(pastas)); };
const getPasta  = id => pastas.find(p => p.id === id) || null;
const isClient  = inv => inv.tipo === 'cliente';
const isPaid    = inv => inv.estado === 'pago';
const isOverdue = inv => { if (isPaid(inv)) return false; const d = daysDiff(inv.vencimento); return d !== null && d < 0; };

function dueBadge(inv) {
  if (isPaid(inv) || !inv.vencimento) return '';
  const d = daysDiff(inv.vencimento);
  if (d === null) return '';
  if (d < 0)  return `<span class="due-now">Venceu há ${-d}d</span>`;
  if (d === 0) return `<span class="due-now">Vence hoje</span>`;
  if (d <= 3)  return `<span class="due-soon">Vence em ${d}d</span>`;
  if (d <= 7)  return `<span class="due-ok">Vence em ${d}d</span>`;
  return '';
}

function estadoBadge(inv) {
  const wf = inv.estado || 'pendente';
  if (wf === 'pago')     return `<span class="badge badge-pago">${isClient(inv) ? 'Recebido' : 'Pago'}</span>`;
  if (wf === 'aprovada') return `<span class="badge badge-aprovada">Aprovada</span>`;
  if (wf === 'aguarda')  return `<span class="badge badge-aguarda">Ag. Aprovação</span>`;
  if (isOverdue(inv))    return `<span class="badge badge-vencido">Vencido</span>`;
  return `<span class="badge badge-pendente">Pendente</span>`;
}

// ─── Toast ────────────────────────────────────────────────────────────────────
function toast(msg, type = '') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast show ' + type;
  setTimeout(() => el.classList.remove('show'), 3000);
}

// ─── Navegação ────────────────────────────────────────────────────────────────
function nav(name) {
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');
  document.querySelectorAll('.nav-item').forEach(it => {
    if (it.getAttribute('onclick')?.includes("'" + name + "'")) it.classList.add('active');
  });
  if (name === 'dashboard')    renderDashboard();
  if (name === 'fornecedores') { populatePastaFilter('ff-pasta'); renderForn(); }
  if (name === 'clientes')     { populatePastaFilter('cf-pasta'); renderCli(); }
  if (name === 'pastas')       renderPastas();
  if (name === 'alertas')      renderAlertas();
  if (name === 'config')       loadConfig();
  if (name === 'assistente')   initChat();
  if (name === 'nova')         { populatePastaSelect('f-pasta'); resetUpload(); }
  updateAlertBadge();
}

// ─── Badge de alertas ────────────────────────────────────────────────────────
function updateAlertBadge() {
  const ct = invoices.filter(i => !isPaid(i) && i.vencimento && daysDiff(i.vencimento) !== null && daysDiff(i.vencimento) <= 7).length;
  const badge = document.getElementById('badge-alertas');
  if (ct > 0) { badge.textContent = ct; badge.style.display = ''; }
  else badge.style.display = 'none';
}

// ─── Dashboard ────────────────────────────────────────────────────────────────
function renderDashboard() {
  const fornecedores = invoices.filter(i => !isClient(i));
  const clientes     = invoices.filter(i => isClient(i));
  const aPagar    = fornecedores.filter(i => !isPaid(i)).reduce((s, i) => s + toNum(i.total), 0);
  const aReceber  = clientes.filter(i => !isPaid(i)).reduce((s, i) => s + toNum(i.total), 0);
  const pago      = fornecedores.filter(isPaid).reduce((s, i) => s + toNum(i.total), 0);
  const recebido  = clientes.filter(isPaid).reduce((s, i) => s + toNum(i.total), 0);

  document.getElementById('m-receber').textContent   = fmt(aReceber);
  document.getElementById('m-pagar').textContent     = fmt(aPagar);
  document.getElementById('m-recebido').textContent  = fmt(recebido);
  document.getElementById('m-pago').textContent      = fmt(pago);
  document.getElementById('m-receber-n').textContent = clientes.filter(i => !isPaid(i)).length + ' pendentes';
  document.getElementById('m-pagar-n').textContent   = fornecedores.filter(i => !isPaid(i)).length + ' pendentes';
  document.getElementById('m-recebido-n').textContent = clientes.filter(isPaid).length + ' recebidas';
  document.getElementById('m-pago-n').textContent    = fornecedores.filter(isPaid).length + ' pagas';

  // Faturas recentes
  const recent = [...invoices].sort((a, b) => (b.addedAt || '').localeCompare(a.addedAt || '')).slice(0, 5);
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
    .filter(i => !isPaid(i) && i.vencimento && daysDiff(i.vencimento) !== null && daysDiff(i.vencimento) <= 14 && daysDiff(i.vencimento) >= 0)
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

// ─── Fornecedores ────────────────────────────────────────────────────────────
function renderForn() {
  const estado = document.getElementById('ff-estado')?.value || '';
  const pasta  = document.getElementById('ff-pasta')?.value  || '';
  const search = (document.getElementById('ff-search')?.value || '').toLowerCase();

  let data = invoices.filter(i => !isClient(i));
  if (estado === 'vencido') data = data.filter(isOverdue);
  else if (estado)          data = data.filter(i => i.estado === estado);
  if (pasta)  data = data.filter(i => String(i.pastaId || '') === pasta);
  if (search) data = data.filter(i => (i.entidade || '').toLowerCase().includes(search) || (i.numero || '').toLowerCase().includes(search));

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

// ─── Clientes ────────────────────────────────────────────────────────────────
function renderCli() {
  const estado = document.getElementById('cf-estado')?.value || '';
  const pasta  = document.getElementById('cf-pasta')?.value  || '';
  const search = (document.getElementById('cf-search')?.value || '').toLowerCase();

  let data = invoices.filter(isClient);
  if (estado === 'vencido')   data = data.filter(isOverdue);
  else if (estado === 'recebido') data = data.filter(i => i.estado === 'pago');
  else if (estado === 'pendente') data = data.filter(i => i.estado !== 'pago');
  if (pasta)  data = data.filter(i => String(i.pastaId || '') === pasta);
  if (search) data = data.filter(i => (i.entidade || '').toLowerCase().includes(search) || (i.numero || '').toLowerCase().includes(search));

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

// ─── Alertas ─────────────────────────────────────────────────────────────────
function renderAlertas() {
  const alerts = invoices
    .filter(i => !isPaid(i) && i.vencimento && daysDiff(i.vencimento) !== null && daysDiff(i.vencimento) <= 7)
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
          <div style="font-size:13px;font-weight:500">${inv.entidade || '—'} <span style="font-weight:400;color:var(--muted);font-size:12px">${inv.numero || ''}</span></div>
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

function openModalPasta() {
  selectedPastaCor = 0;
  document.getElementById('p-cor-opts').innerHTML = PASTA_CORES.map((c, i) => `
    <div onclick="selectCor(${i})" id="cor-opt-${i}"
      style="width:26px;height:26px;border-radius:50%;background:${c.bg};border:2px solid ${i === 0 ? c.text : c.border};cursor:pointer"
      title="${c.name}"></div>`).join('');
  document.getElementById('p-nome').value = '';
  document.getElementById('modal-pasta').classList.add('show');
}

function selectCor(i) {
  selectedPastaCor = i;
  PASTA_CORES.forEach((c, j) => {
    const el = document.getElementById('cor-opt-' + j);
    if (el) el.style.border = '2px solid ' + (j === i ? c.text : c.border);
  });
}

function savePasta() {
  const nome = document.getElementById('p-nome').value.trim();
  if (!nome) { toast('Preenche o nome da pasta', 'error'); return; }
  pastas.push({ id: Date.now(), nome, icon: document.getElementById('p-icon').value, cor: PASTA_CORES[selectedPastaCor] });
  save();
  closeModal('modal-pasta');
  renderPastas();
  ['ff-pasta', 'cf-pasta'].forEach(populatePastaFilter);
  ['f-pasta', 'm-pasta'].forEach(populatePastaSelect);
  toast('Pasta criada!', 'success');
}

function delPasta(idx) {
  if (!confirm(`Apagar pasta "${pastas[idx].nome}"?`)) return;
  const id = pastas[idx].id;
  invoices = invoices.map(i => i.pastaId === id ? { ...i, pastaId: null } : i);
  pastas.splice(idx, 1);
  save();
  renderPastas();
  toast('Pasta apagada');
}

function populatePastaFilter(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Todas as pastas</option>' + pastas.map(p => `<option value="${p.id}">${p.icon} ${p.nome}</option>`).join('');
  sel.value = cur;
}

function populatePastaSelect(selId) {
  const sel = document.getElementById(selId);
  if (!sel) return;
  const cur = sel.value;
  sel.innerHTML = '<option value="">Sem pasta</option>' + pastas.map(p => `<option value="${p.id}">${p.icon} ${p.nome}</option>`).join('');
  sel.value = cur;
}

// ─── Upload de PDF ────────────────────────────────────────────────────────────
function dragOver(e) { e.preventDefault(); document.getElementById('upload-zone').classList.add('drag'); }
function dragLeave()  { document.getElementById('upload-zone').classList.remove('drag'); }
function dropFile(e)  { e.preventDefault(); dragLeave(); const f = e.dataTransfer.files[0]; if (f?.type === 'application/pdf') handleFile(f); else toast('Apenas PDF', 'error'); }

async function handleFile(file) {
  document.getElementById('loading-ext').classList.add('show');
  document.getElementById('extracted-box').style.display = 'none';
  document.getElementById('dup-warn').style.display = 'none';
  try {
    const text = await readPDFText(file);
    let data = parseReciboVerde(text);

    // Se o parser local não extraiu o essencial E há API key, tenta com IA
    if (!data.entidade && !data.numero && config.apiKey) {
      const b64 = btoa(text); // fallback: não é ideal mas evita segundo readFile
      const b64real = await toBase64(file);
      data = await extractPDFApi(b64real, config.apiKey);
    }

    fillExtracted(data);
    checkDuplicate(data);
    document.getElementById('extracted-box').style.display = 'block';
  } catch (e) {
    toast('Erro na extração: ' + e.message, 'error');
  }
  document.getElementById('loading-ext').classList.remove('show');
}

// ─── Parser local: Recibo Verde (AT) ─────────────────────────────────────────
// Funciona com Fatura-Recibo emitida pelo Portal das Finanças.
// Extrai campos por padrões de texto fixos do layout da AT.
function parseReciboVerde(text) {
  const get = (pattern, flags = 'i') => {
    const m = text.match(new RegExp(pattern, flags));
    return m ? m[1].trim() : '';
  };

  // Número da fatura: "FR ATSIRE01FR/22" dentro de <FR ...> ou <...>
  const numMatch = text.match(/<([^>]+)>/);
  const numero = numMatch ? numMatch[1].trim() : '';

  // Data de emissão: "emitida em DD/MM/AAAA"
  const emissao = get('emitida em (\\d{2}/\\d{2}/\\d{4})');

  // Prestador (fornecedor): linha depois de "NOME" na secção do transmitente.
  // O layout da AT tem: "NOME  [nome]\nDOMICÍLIO ..."
  const prestadorMatch = text.match(/DADOS DO TRANSMITENTE[\s\S]*?NOME\s+([A-ZÀÁÂÃÄÇÉÊÍÓÔÕÚÜ][^\n]+)/i);
  const entidade = prestadorMatch ? prestadorMatch[1].trim() : '';

  // NIF do prestador: linha "NÚMERO DE IDENTIFICAÇÃO FISCAL (NIF) - XXXXXXXXX"
  const nifMatch = text.match(/NIF\s*[\-–]\s*(\d{9})/i);
  const nif = nifMatch ? nifMatch[1] : '';

  // Valores — formato "500,00 €" ou "500,00€"
  const parseVal = label => {
    const m = text.match(new RegExp(label + '[\\s\\S]*?([\\d.,]+)\\s*€', 'i'));
    if (!m) return '';
    return m[1].replace(/\./g, '').replace(',', '.');
  };

  const base  = parseVal('Valor il[ií]quido');
  const iva   = parseVal('IVA\\s*\\n');

  // Total a pagar (após retenção IRS) — campo mais relevante para este tipo
  const totalPagarMatch = text.match(/TOTAL A PAGAR\s+([\d.,]+)\s*€/i);
  const totalDocMatch   = text.match(/TOTAL DO DOCUMENTO\s+([\d.,]+)\s*€/i);
  const total = totalPagarMatch
    ? totalPagarMatch[1].replace(/\./g, '').replace(',', '.')
    : totalDocMatch
      ? totalDocMatch[1].replace(/\./g, '').replace(',', '.')
      : '';

  // IVA — valor direto da linha de totais
  const ivaMatch = text.match(/\bIVA\b\s+([\d.,]+)\s*€/i);
  const ivaVal = ivaMatch ? ivaMatch[1].replace(/\./g, '').replace(',', '.') : '';

  return { numero, entidade, nif, emissao, vencimento: '', base, iva: ivaVal || iva, total };
}

// ─── Leitura de texto do PDF (sem biblioteca externa) ─────────────────────────
// Usa a API FileReader para ler o PDF como texto.
// Funciona para PDFs digitais (não scaneados).
function readPDFText(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => {
      // Extrai texto legível do PDF binário usando regex simples
      const raw = e.target.result;
      // Converte ArrayBuffer para string
      const bytes = new Uint8Array(raw);
      let str = '';
      for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
      // Extrai sequências de texto entre parênteses (formato PDF)
      const chunks = [];
      const re = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
      let m;
      while ((m = re.exec(str)) !== null) {
        const t = m[1]
          .replace(/\\n/g, '\n')
          .replace(/\\r/g, '\r')
          .replace(/\\t/g, '\t')
          .replace(/\\\\/g, '\\')
          .replace(/\\([^nrt\\()])/g, '$1');
        if (t.trim().length > 0) chunks.push(t);
      }
      res(chunks.join('\n'));
    };
    reader.onerror = rej;
    reader.readAsArrayBuffer(file);
  });
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ─── Extração via API (fallback para outros tipos de fatura) ──────────────────
async function extractPDFApi(b64, apiKey) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: 'Analisa esta fatura. Responde APENAS com JSON válido sem markdown:\n{"numero":"","entidade":"","nif":"","emissao":"DD/MM/AAAA","vencimento":"DD/MM/AAAA ou vazio","base":"valor numérico","iva":"valor numérico","total":"valor numérico"}' },
      ]}],
    }),
  });
  if (!resp.ok) { const e = await resp.json(); throw new Error(e.error?.message || 'Erro API'); }
  const d = await resp.json();
  return JSON.parse(d.content[0].text.replace(/```json|```/g, '').trim());
}

function fillExtracted(data) {
  document.getElementById('f-num').value    = data.numero    || '';
  document.getElementById('f-ent').value    = data.entidade  || '';
  document.getElementById('f-nif').value    = data.nif       || '';
  document.getElementById('f-emissao').value = data.emissao  || '';
  document.getElementById('f-venc').value   = data.vencimento || '';
  document.getElementById('f-base').value   = data.base      || '';
  document.getElementById('f-iva').value    = data.iva       || '';
  document.getElementById('f-total').value  = data.total     || '';
  document.getElementById('f-estado').value = 'pendente';
}

function checkDuplicate(data) {
  const num = (data.numero  || '').trim().toLowerCase();
  const ent = (data.entidade || '').trim().toLowerCase();
  if (!num && !ent) return;
  const dup = invoices.find(i =>
    (num && (i.numero || '').trim().toLowerCase() === num) ||
    (ent && (i.entidade || '').trim().toLowerCase() === ent && data.emissao && i.emissao === data.emissao)
  );
  if (dup) document.getElementById('dup-warn').style.display = 'block';
}

function saveFromPDF() {
  const tipo = document.querySelector('[name=novo-tipo]:checked').value;
  const inv  = buildInv({
    tipo,
    numero:     document.getElementById('f-num').value,
    entidade:   document.getElementById('f-ent').value,
    nif:        document.getElementById('f-nif').value,
    emissao:    document.getElementById('f-emissao').value,
    vencimento: document.getElementById('f-venc').value,
    base:       document.getElementById('f-base').value,
    iva:        document.getElementById('f-iva').value,
    total:      document.getElementById('f-total').value,
    estado:     document.getElementById('f-estado').value,
    pastaId:    document.getElementById('f-pasta').value || null,
    notas:      document.getElementById('f-notas').value,
  });
  invoices.push(inv);
  save();
  toast('Fatura guardada!', 'success');
  resetUpload();
  nav(tipo === 'cliente' ? 'clientes' : 'fornecedores');
}

function resetUpload() {
  document.getElementById('file-inp').value = '';
  document.getElementById('extracted-box').style.display = 'none';
  document.getElementById('dup-warn').style.display = 'none';
}

function buildInv(fields) {
  return {
    id: Date.now() + Math.random(),
    addedAt: new Date().toISOString(),
    ...fields,
    pastaId: fields.pastaId ? Number(fields.pastaId) : null,
  };
}

// ─── Introdução manual ────────────────────────────────────────────────────────
function openManual(tipo, editIdx) {
  populatePastaSelect('m-pasta');
  document.getElementById('m-tipo').value = tipo;
  document.getElementById('modal-manual-title').textContent =
    (editIdx !== undefined ? 'Editar' : 'Nova') + ' Fatura — ' + (tipo === 'cliente' ? 'Cliente' : 'Fornecedor');

  if (editIdx !== undefined) {
    const inv = invoices[editIdx];
    document.getElementById('m-edit-id').value   = editIdx;
    document.getElementById('m-ent').value       = inv.entidade  || '';
    document.getElementById('m-nif').value       = inv.nif       || '';
    document.getElementById('m-num').value       = inv.numero    || '';
    document.getElementById('m-emissao').value   = inv.emissao   || '';
    document.getElementById('m-venc').value      = inv.vencimento || '';
    document.getElementById('m-base').value      = inv.base      || '';
    document.getElementById('m-iva').value       = inv.iva       || '';
    document.getElementById('m-total').value     = inv.total     || '';
    document.getElementById('m-estado').value    = inv.estado    || 'pendente';
    document.getElementById('m-pasta').value     = inv.pastaId   || '';
    document.getElementById('m-notas').value     = inv.notas     || '';
  } else {
    document.getElementById('m-edit-id').value = '';
    ['m-ent','m-nif','m-num','m-emissao','m-venc','m-base','m-iva','m-total','m-notas'].forEach(id => document.getElementById(id).value = '');
    document.getElementById('m-estado').value = 'pendente';
    document.getElementById('m-pasta').value  = '';
  }
  document.getElementById('modal-manual').classList.add('show');
}

function editInv(idx) { openManual(invoices[idx].tipo, idx); }

function saveManual() {
  const editIdxRaw = document.getElementById('m-edit-id').value;
  const tipo = document.getElementById('m-tipo').value;
  const fields = {
    tipo,
    entidade:   document.getElementById('m-ent').value,
    nif:        document.getElementById('m-nif').value,
    numero:     document.getElementById('m-num').value,
    emissao:    document.getElementById('m-emissao').value,
    vencimento: document.getElementById('m-venc').value,
    base:       document.getElementById('m-base').value,
    iva:        document.getElementById('m-iva').value,
    total:      document.getElementById('m-total').value,
    estado:     document.getElementById('m-estado').value,
    pastaId:    document.getElementById('m-pasta').value ? Number(document.getElementById('m-pasta').value) : null,
    notas:      document.getElementById('m-notas').value,
  };
  if (!fields.entidade.trim()) { toast('Preenche a entidade', 'error'); return; }

  if (editIdxRaw !== '') {
    invoices[parseInt(editIdxRaw)] = { ...invoices[parseInt(editIdxRaw)], ...fields };
    toast('Fatura atualizada!', 'success');
  } else {
    const num = fields.numero.trim().toLowerCase();
    const ent = fields.entidade.trim().toLowerCase();
    const dup = num && invoices.find(i => (i.numero || '').trim().toLowerCase() === num && (i.entidade || '').trim().toLowerCase() === ent);
    if (dup && !confirm('Parece um duplicado. Guardar mesmo assim?')) return;
    invoices.push(buildInv(fields));
    toast('Fatura adicionada!', 'success');
  }
  save();
  closeModal('modal-manual');
  nav(tipo === 'cliente' ? 'clientes' : 'fornecedores');
}

function delInv(idx) {
  if (!confirm('Apagar esta fatura?')) return;
  invoices.splice(idx, 1);
  save();
  renderForn(); renderCli();
  toast('Fatura apagada');
  updateAlertBadge();
}

// ─── Workflow ─────────────────────────────────────────────────────────────────
const WF_FORN        = ['pendente', 'aguarda', 'aprovada', 'pago'];
const WF_FORN_LABELS = { pendente: 'Pendente', aguarda: 'Ag. Aprovação', aprovada: 'Aprovada', pago: 'Pago' };
const WF_CLI         = ['pendente', 'pago'];
const WF_CLI_LABELS  = { pendente: 'Pendente', pago: 'Recebido' };
let wfSelected = null;

function openWF(idx) {
  const inv    = invoices[idx];
  const isCli  = isClient(inv);
  const steps  = isCli ? WF_CLI  : WF_FORN;
  const labels = isCli ? WF_CLI_LABELS : WF_FORN_LABELS;
  wfSelected   = inv.estado || 'pendente';

  document.getElementById('wf-id').value    = idx;
  document.getElementById('wf-tipo').value  = inv.tipo;
  document.getElementById('wf-title').textContent = `Estado — ${inv.entidade || ''}`;
  document.getElementById('wf-steps').innerHTML = steps.map(s =>
    `<div class="wf-step ${s === wfSelected ? 'active' : ''}" onclick="selectWF('${s}', this)">${labels[s]}</div>`
  ).join('');
  document.getElementById('wf-date-row').style.display = wfSelected === 'pago' ? 'block' : 'none';
  document.getElementById('wf-date').value = today();
  document.getElementById('modal-wf').classList.add('show');
}

function selectWF(estado, el) {
  wfSelected = estado;
  document.querySelectorAll('.wf-step').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('wf-date-row').style.display = estado === 'pago' ? 'block' : 'none';
}

function saveWF() {
  const idx = parseInt(document.getElementById('wf-id').value);
  invoices[idx].estado = wfSelected;
  if (wfSelected === 'pago') invoices[idx].dataPagamento = document.getElementById('wf-date').value;
  save();
  closeModal('modal-wf');
  renderForn(); renderCli(); renderDashboard(); updateAlertBadge();
  toast('Estado atualizado!', 'success');
}

// ─── Assistente IA ────────────────────────────────────────────────────────────
function initChat() {
  const msgs = document.getElementById('chat-msgs');
  if (msgs.children.length === 0) {
    addChatMsg('ai', 'Olá! Sou o teu assistente financeiro. Pergunta-me sobre faturas pendentes, cash flow, vencimentos ou qualquer outra questão.');
  }
}

function addChatMsg(role, text) {
  const msgs = document.getElementById('chat-msgs');
  const div  = document.createElement('div');
  div.className   = 'chat-msg ' + role;
  div.textContent = text;
  msgs.appendChild(div);
  msgs.scrollTop = msgs.scrollHeight;
}

async function sendChat() {
  const inp = document.getElementById('chat-inp');
  const q   = inp.value.trim();
  if (!q) return;
  if (!config.apiKey) { toast('Configura a API Key primeiro', 'error'); return; }
  inp.value = '';
  addChatMsg('user', q);
  document.getElementById('chat-btn').disabled = true;
  chatHistory.push({ role: 'user', content: q });

  const fornecedores = invoices.filter(i => !isClient(i));
  const clientes     = invoices.filter(i => isClient(i));
  const aPagar   = fornecedores.filter(i => !isPaid(i)).reduce((s, i) => s + toNum(i.total), 0);
  const aReceber = clientes.filter(i => !isPaid(i)).reduce((s, i) => s + toNum(i.total), 0);
  const ctx = `Dados financeiros: A pagar: ${fmt(aPagar)} (${fornecedores.filter(i=>!isPaid(i)).length} faturas). A receber: ${fmt(aReceber)} (${clientes.filter(i=>!isPaid(i)).length} faturas). Vencidas: ${invoices.filter(isOverdue).length}. Pastas: ${pastas.map(p=>p.nome).join(', ') || 'nenhuma'}. Total faturas: ${invoices.length}.`;

  try {
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        system: 'És um assistente financeiro para gestão de faturas de uma PME portuguesa. Responde em português europeu, de forma concisa e direta. ' + ctx,
        messages: chatHistory,
      }),
    });
    const d     = await resp.json();
    const reply = d.content?.[0]?.text || 'Sem resposta.';
    chatHistory.push({ role: 'assistant', content: reply });
    addChatMsg('ai', reply);
  } catch (e) {
    addChatMsg('ai', 'Erro ao processar a pergunta.');
  }
  document.getElementById('chat-btn').disabled = false;
}

// ─── Modais ───────────────────────────────────────────────────────────────────
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

document.querySelectorAll('.modal-overlay').forEach(m => {
  m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
});

// ─── Configuração ─────────────────────────────────────────────────────────────
function loadConfig() {
  if (config.apiKey) {
    document.getElementById('cfg-key').value = config.apiKey;
    document.getElementById('cfg-status').textContent = '✓ API Key configurada';
  }
}

function saveConfig() {
  config.apiKey = document.getElementById('cfg-key').value.trim();
  localStorage.setItem('fv_config', JSON.stringify(config));
  document.getElementById('cfg-status').textContent = '✓ Guardado';
  toast('Configuração guardada!', 'success');
}

// ─── Exportar / Limpar ────────────────────────────────────────────────────────
function exportCSV() {
  const headers = ['Tipo','Número','Entidade','NIF','Emissão','Vencimento','Base','IVA','Total','Estado','Pasta','Notas'];
  const rows = invoices.map(i => {
    const p = getPasta(i.pastaId);
    return [i.tipo, i.numero, i.entidade, i.nif, i.emissao, i.vencimento, i.base, i.iva, i.total, i.estado, p ? p.nome : '', i.notas]
      .map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',');
  });
  const csv = [headers.join(','), ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'faturas.csv';
  a.click();
}

function clearAll() {
  if (!confirm('Apagar TODAS as faturas e pastas? Não pode ser desfeito.')) return;
  invoices = []; pastas = [];
  localStorage.removeItem('fv_invoices');
  localStorage.removeItem('fv_pastas');
  renderDashboard();
  updateAlertBadge();
  toast('Dados apagados');
}

// ─── Inicialização ────────────────────────────────────────────────────────────
renderDashboard();
updateAlertBadge();
