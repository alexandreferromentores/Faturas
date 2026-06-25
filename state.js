// ─── state.js ─────────────────────────────────────────────────────────────────
// Dados globais, constantes e funções utilitárias partilhadas por todos os módulos.

// ─── Dados persistidos ────────────────────────────────────────────────────────
let invoices = JSON.parse(localStorage.getItem('fv_invoices') || '[]');
let pastas   = JSON.parse(localStorage.getItem('fv_pastas')   || '[]');
let config   = JSON.parse(localStorage.getItem('fv_config')   || '{}');

// ─── Constantes ───────────────────────────────────────────────────────────────
const PASTA_CORES = [
  { name: 'Azul',     bg: '#E8EEF5', text: '#1A3A5C', border: 'rgba(26,58,92,.3)'   },
  { name: 'Verde',    bg: '#E8F5EE', text: '#1B6B45', border: 'rgba(27,107,69,.3)'  },
  { name: 'Vermelho', bg: '#F5E8E8', text: '#8B1A1A', border: 'rgba(139,26,26,.3)'  },
  { name: 'Âmbar',   bg: '#FDF3DC', text: '#7A4F00', border: 'rgba(122,79,0,.3)'   },
  { name: 'Roxo',     bg: '#EEE8F8', text: '#4A2080', border: 'rgba(74,32,128,.3)'  },
  { name: 'Ciano',    bg: '#E0F4FA', text: '#0E6B8A', border: 'rgba(14,107,138,.3)' },
];

// ─── Guardar no localStorage ──────────────────────────────────────────────────
function save() {
  localStorage.setItem('fv_invoices', JSON.stringify(invoices));
  localStorage.setItem('fv_pastas',   JSON.stringify(pastas));
}

// ─── Utilitários de formatação ────────────────────────────────────────────────
const fmt = v =>
  (parseFloat(String(v).replace(',', '.')) || 0)
    .toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + ' €';

const toNum = v => parseFloat(String(v).replace(',', '.')) || 0;

const today = () => {
  const d = new Date();
  return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${d.getFullYear()}`;
};

// ─── Utilitários de datas ─────────────────────────────────────────────────────
const parseDate = s => {
  if (!s) return null;
  const [d, m, y] = s.split('/');
  if (!d || !m || !y) return null;
  const dt = new Date(+y, +m - 1, +d);
  return isNaN(dt) ? null : dt;
};

const daysDiff = s => {
  const d = parseDate(s);
  if (!d) return null;
  return Math.ceil((d - new Date().setHours(0, 0, 0, 0)) / 86400000);
};

// ─── Utilitários de faturas ───────────────────────────────────────────────────
const getPasta  = id  => pastas.find(p => p.id === id) || null;
const isClient  = inv => inv.tipo === 'cliente';
const isPaid    = inv => inv.estado === 'pago';
const isOverdue = inv => {
  if (isPaid(inv)) return false;
  const d = daysDiff(inv.vencimento);
  return d !== null && d < 0;
};

// ─── HTML helpers para badges ─────────────────────────────────────────────────
function dueBadge(inv) {
  if (isPaid(inv) || !inv.vencimento) return '';
  const d = daysDiff(inv.vencimento);
  if (d === null) return '';
  if (d < 0)   return `<span class="due-now">Venceu há ${-d}d</span>`;
  if (d === 0)  return `<span class="due-now">Vence hoje</span>`;
  if (d <= 3)   return `<span class="due-soon">Vence em ${d}d</span>`;
  if (d <= 7)   return `<span class="due-ok">Vence em ${d}d</span>`;
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

// ─── Badge de alertas na navegação ───────────────────────────────────────────
function updateAlertBadge() {
  const ct = invoices.filter(i =>
    !isPaid(i) && i.vencimento && daysDiff(i.vencimento) !== null && daysDiff(i.vencimento) <= 7
  ).length;
  const badge = document.getElementById('badge-alertas');
  if (ct > 0) { badge.textContent = ct; badge.style.display = ''; }
  else badge.style.display = 'none';
}

// ─── Modais ───────────────────────────────────────────────────────────────────
function closeModal(id) { document.getElementById(id).classList.remove('show'); }

document.addEventListener('DOMContentLoaded', () => {
  document.querySelectorAll('.modal-overlay').forEach(m => {
    m.addEventListener('click', e => { if (e.target === m) m.classList.remove('show'); });
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
  });
});
