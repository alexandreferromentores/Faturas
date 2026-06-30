// ─── spotlight.js ────────────────────────────────────────────────────────────
// Grupo 3 (parte 2): Spotlight de pesquisa universal (Cmd+K), swipe mobile

// ─── Spotlight ────────────────────────────────────────────────────────────────
let _spotlightOpen = false;

function buildSpotlightHTML() {
  if (document.getElementById('spotlight-overlay')) return;

  const overlay = document.createElement('div');
  overlay.id = 'spotlight-overlay';
  overlay.style.cssText = `
    display: none; position: fixed; inset: 0; background: rgba(16,24,40,.55);
    z-index: 9000; align-items: flex-start; justify-content: center;
    padding-top: 12vh; backdrop-filter: blur(3px);
  `;
  overlay.innerHTML = `
    <div id="spotlight-box" style="background:var(--surface);border-radius:14px;width:600px;max-width:92vw;
        box-shadow:var(--shadow-xl);border:1px solid var(--border);overflow:hidden">
      <div style="display:flex;align-items:center;gap:10px;padding:16px 20px;border-bottom:1px solid var(--border)">
        <span style="font-size:18px;opacity:.5">🔍</span>
        <input id="spotlight-input" type="text" placeholder="Pesquisar faturas, ir para página, executar acção..."
          style="flex:1;border:none;box-shadow:none;font-size:15px;padding:0;outline:none;background:transparent">
        <kbd style="font-size:11px;color:var(--muted);background:var(--surface-2);padding:2px 7px;border-radius:5px">Esc</kbd>
      </div>
      <div id="spotlight-results" style="max-height:50vh;overflow-y:auto;padding:8px"></div>
    </div>
  `;
  document.body.appendChild(overlay);

  overlay.addEventListener('click', e => { if (e.target === overlay) closeSpotlight(); });

  const input = document.getElementById('spotlight-input');
  input.addEventListener('input', () => renderSpotlightResults(input.value));
  input.addEventListener('keydown', e => {
    if (e.key === 'Escape') { closeSpotlight(); return; }
    if (e.key === 'Enter') {
      const first = document.querySelector('.spotlight-item');
      if (first) first.click();
    }
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      const items = [...document.querySelectorAll('.spotlight-item')];
      const cur = items.findIndex(i => i.classList.contains('spotlight-active'));
      items.forEach(i => i.classList.remove('spotlight-active'));
      let next = e.key === 'ArrowDown' ? cur + 1 : cur - 1;
      if (next < 0) next = items.length - 1;
      if (next >= items.length) next = 0;
      items[next]?.classList.add('spotlight-active');
      items[next]?.scrollIntoView({ block: 'nearest' });
    }
  });
}

const SPOTLIGHT_COMMANDS = [
  { icon: '⊞', label: 'Ir para Dashboard',    action: () => nav('dashboard') },
  { icon: '🏢', label: 'Ir para Fornecedores', action: () => nav('fornecedores') },
  { icon: '👤', label: 'Ir para Clientes',     action: () => nav('clientes') },
  { icon: '📁', label: 'Ir para Pastas',       action: () => nav('pastas') },
  { icon: '🔔', label: 'Ir para Alertas',      action: () => nav('alertas') },
  { icon: '✦',  label: 'Ir para Assistente IA', action: () => nav('assistente') },
  { icon: '🏢', label: 'Ir para Empresa',      action: () => nav('empresa') },
  { icon: '⚙',  label: 'Ir para Configuração', action: () => nav('config') },
  { icon: '＋', label: 'Carregar Fatura — Fornecedor', action: () => { nav('fornecedores'); setTimeout(() => openUploadModal('fornecedor'), 150); } },
  { icon: '＋', label: 'Carregar Fatura — Cliente',     action: () => { nav('clientes'); setTimeout(() => openUploadModal('cliente'), 150); } },
  { icon: '📁', label: 'Nova Pasta',           action: () => { nav('pastas'); setTimeout(() => openModalPasta(), 150); } },
  { icon: '📊', label: 'Gerar Relatório Mensal', action: () => { nav('config'); setTimeout(() => openRelatorioModal(), 150); } },
  { icon: '🌙', label: 'Alternar Dark Mode',   action: () => toggleTheme() },
];

function renderSpotlightResults(query) {
  const el = document.getElementById('spotlight-results');
  const q = query.trim().toLowerCase();

  if (!q) {
    el.innerHTML = SPOTLIGHT_COMMANDS.map((c, i) => spotlightItemHTML(c.icon, c.label, '', i === 0)).join('');
    attachSpotlightHandlers(SPOTLIGHT_COMMANDS.map(c => c.action));
    return;
  }

  // Search invoices
  const matches = invoices.filter(inv =>
    (inv.entidade || '').toLowerCase().includes(q) ||
    (inv.numero || '').toLowerCase().includes(q) ||
    (inv.descritivo || '').toLowerCase().includes(q) ||
    (inv.nif || '').toLowerCase().includes(q)
  ).slice(0, 8);

  // Search commands
  const cmdMatches = SPOTLIGHT_COMMANDS.filter(c => c.label.toLowerCase().includes(q));

  let html = '';
  let actions = [];

  if (cmdMatches.length) {
    html += `<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;padding:8px 12px 4px">Acções</div>`;
    cmdMatches.forEach((c, i) => {
      html += spotlightItemHTML(c.icon, c.label, '', actions.length === 0);
      actions.push(c.action);
    });
  }

  if (matches.length) {
    html += `<div style="font-size:10px;font-weight:700;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;padding:8px 12px 4px">Faturas</div>`;
    matches.forEach(inv => {
      const idx = invoices.indexOf(inv);
      const icon = isClient(inv) ? '👤' : '🏢';
      const sub = `${inv.numero || ''} · ${fmt(inv.total)} · ${inv.estado || 'pendente'}`;
      html += spotlightItemHTML(icon, inv.entidade || 'Sem nome', sub, actions.length === 0);
      actions.push(() => { closeSpotlight(); viewInv(idx); });
    });
  }

  if (!cmdMatches.length && !matches.length) {
    html = `<div style="padding:24px;text-align:center;color:var(--muted);font-size:13px">Sem resultados para "${query}"</div>`;
  }

  el.innerHTML = html;
  attachSpotlightHandlers(actions);
}

function spotlightItemHTML(icon, label, sub, active) {
  return `<div class="spotlight-item ${active ? 'spotlight-active' : ''}" style="display:flex;align-items:center;gap:12px;padding:10px 12px;border-radius:8px;cursor:pointer">
    <span style="font-size:18px;width:24px;text-align:center;flex-shrink:0">${icon}</span>
    <div style="flex:1;min-width:0">
      <div style="font-size:13.5px;font-weight:500;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${label}</div>
      ${sub ? `<div style="font-size:11px;color:var(--muted)">${sub}</div>` : ''}
    </div>
  </div>`;
}

function attachSpotlightHandlers(actions) {
  document.querySelectorAll('.spotlight-item').forEach((el, i) => {
    el.addEventListener('mouseenter', () => {
      document.querySelectorAll('.spotlight-item').forEach(x => x.classList.remove('spotlight-active'));
      el.classList.add('spotlight-active');
    });
    el.addEventListener('click', () => {
      closeSpotlight();
      actions[i]?.();
    });
  });
}

function openSpotlight() {
  buildSpotlightHTML();
  const overlay = document.getElementById('spotlight-overlay');
  const input   = document.getElementById('spotlight-input');
  overlay.style.display = 'flex';
  input.value = '';
  renderSpotlightResults('');
  setTimeout(() => input.focus(), 50);
  _spotlightOpen = true;
}

function closeSpotlight() {
  const overlay = document.getElementById('spotlight-overlay');
  if (overlay) overlay.style.display = 'none';
  _spotlightOpen = false;
}

// Override Cmd+K to open spotlight instead of just search page
document.addEventListener('keydown', e => {
  if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
    e.preventDefault();
    e.stopImmediatePropagation();
    if (_spotlightOpen) closeSpotlight();
    else openSpotlight();
  }
}, true);

// CSS for spotlight active state
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    .spotlight-item.spotlight-active { background: var(--accent-light); }
    .spotlight-item:hover { background: var(--surface-2); }
  `;
  document.head.appendChild(style);
});

// ─── Swipe to mark as paid (mobile) ───────────────────────────────────────────
function attachSwipeToRow(tr, idx, isClientTable) {
  if (tr.dataset.swipeAttached) return;
  tr.dataset.swipeAttached = '1';

  let startX = 0, currentX = 0, isDragging = false;

  tr.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    isDragging = true;
    tr.style.transition = 'none';
  }, { passive: true });

  tr.addEventListener('touchmove', e => {
    if (!isDragging) return;
    currentX = e.touches[0].clientX - startX;
    if (currentX > 0 && currentX < 120) {
      tr.style.transform = `translateX(${currentX}px)`;
      tr.style.background = currentX > 60 ? 'var(--green-bg)' : '';
    }
  }, { passive: true });

  tr.addEventListener('touchend', () => {
    isDragging = false;
    tr.style.transition = 'transform .2s, background .2s';
    if (currentX > 60) {
      const inv = invoices[idx];
      invoices[idx].estado = 'pago';
      invoices[idx].dataPagamento = today();
      save();
      toast(isClientTable ? 'Marcado como recebido!' : 'Marcado como pago!', 'success');
      if (isClientTable) renderCli(); else renderForn();
      renderDashboard();
      updateAlertBadge();
    } else {
      tr.style.transform = 'translateX(0)';
      tr.style.background = '';
    }
    currentX = 0;
  });
}

window.addEventListener('load', function hookSwipe() {
  if (typeof window.renderForn !== 'function' || typeof window.renderCli !== 'function') {
    setTimeout(hookSwipe, 100);
    return;
  }
  // Only attach swipe on touch devices
  if (!('ontouchstart' in window)) return;

  const _rf = window.renderForn;
  const _rc = window.renderCli;

  window.renderForn = function() {
    _rf.apply(this, arguments);
    setTimeout(() => {
      document.querySelectorAll('#forn-body tr').forEach(tr => {
        const btn = tr.querySelector('.icon-btn');
        const match = btn?.getAttribute('onclick')?.match(/\((\d+)\)/);
        if (match) attachSwipeToRow(tr, parseInt(match[1]), false);
      });
    }, 70);
  };

  window.renderCli = function() {
    _rc.apply(this, arguments);
    setTimeout(() => {
      document.querySelectorAll('#cli-body tr').forEach(tr => {
        const btn = tr.querySelector('.icon-btn');
        const match = btn?.getAttribute('onclick')?.match(/\((\d+)\)/);
        if (match) attachSwipeToRow(tr, parseInt(match[1]), true);
      });
    }, 70);
  };
});
