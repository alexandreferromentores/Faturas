// ─── interactions.js ─────────────────────────────────────────────────────────
// Grupo 2: clicar na linha abre detalhe, filtro por badge, atalhos de teclado

// ─── Clicar na linha da tabela abre o detalhe ────────────────────────────────
// Patch renderForn e renderCli para tornar as linhas clicáveis
// Espera o load completo para garantir que as funções originais já existem
window.addEventListener('load', function patchTableRows() {
  if (typeof window.renderForn !== 'function' || typeof window.renderCli !== 'function') {
    // Tenta novamente um pouco depois se ainda não estiverem prontas
    setTimeout(patchTableRows, 100);
    return;
  }

  const _origRenderForn = window.renderForn;
  const _origRenderCli  = window.renderCli;
  const _origRenderPesq = window.renderPesquisa;

  function makeRowsClickable(tbodyId) {
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;
    tbody.querySelectorAll('tr').forEach(tr => {
      if (tr.dataset.clickable) return;
      tr.dataset.clickable = '1';
      tr.style.cursor = 'pointer';

      tr.addEventListener('click', e => {
        if (e.target.closest('button') || e.target.closest('a')) return;
        const viewBtn = tr.querySelector('.icon-btn[title="Ver"]');
        if (viewBtn) {
          viewBtn.click();
        } else {
          const btn = tr.querySelector('.icon-btn');
          if (btn) {
            const match = btn.getAttribute('onclick')?.match(/\((\d+)\)/);
            if (match) viewInv(parseInt(match[1]));
          }
        }
      });
    });
  }

  window.renderForn = function() {
    _origRenderForn.apply(this, arguments);
    setTimeout(() => makeRowsClickable('forn-body'), 50);
  };

  window.renderCli = function() {
    _origRenderCli.apply(this, arguments);
    setTimeout(() => makeRowsClickable('cli-body'), 50);
  };

  if (_origRenderPesq) {
    window.renderPesquisa = function() {
      _origRenderPesq.apply(this, arguments);
      setTimeout(() => makeRowsClickable('pesq-body'), 50);
    };
  }
});

// ─── Filtro rápido por clique no badge de estado ──────────────────────────────
// Clica num badge "Vencido" numa linha e filtra a tabela por esse estado
(function patchBadgeFilter() {
  document.addEventListener('click', e => {
    const badge = e.target.closest('.badge, .due-now, .due-soon');
    if (!badge) return;

    // Find which table we're in
    const row = badge.closest('tr');
    if (!row) return;
    const tbody = row.closest('tbody');
    if (!tbody) return;

    const tbodyId = tbody.id;
    let filterEl, renderFn;

    if (tbodyId === 'forn-body') {
      filterEl = document.getElementById('ff-estado');
      renderFn = window.renderForn;
    } else if (tbodyId === 'cli-body') {
      filterEl = document.getElementById('cf-estado');
      renderFn = window.renderCli;
    } else {
      return;
    }

    if (!filterEl) return;

    // Map badge class to filter value
    const cls = badge.className;
    let estado = '';
    if (cls.includes('badge-vencido') || cls.includes('due-now')) estado = 'vencido';
    else if (cls.includes('badge-pago') || cls.includes('badge-recebido')) estado = 'pago';
    else if (cls.includes('badge-pendente')) estado = 'pendente';
    else if (cls.includes('badge-aprovada')) estado = 'aprovada';
    else if (cls.includes('badge-aguarda'))  estado = 'aguarda';
    else if (cls.includes('due-soon') || cls.includes('due-ok')) estado = 'pendente';

    if (!estado) return;

    e.stopPropagation(); // prevent row click

    // Toggle: if already filtered by this, clear it
    if (filterEl.value === estado) {
      filterEl.value = '';
      toast('Filtro removido', '');
    } else {
      filterEl.value = estado;
      toast('A filtrar por: ' + filterEl.options[filterEl.selectedIndex]?.text, '');
    }
    renderFn?.();
  });
})();

// ─── Atalhos de teclado ───────────────────────────────────────────────────────
(function setupKeyboardShortcuts() {
  // Map of key → action
  const shortcuts = {
    'f': () => nav('fornecedores'),
    'c': () => nav('clientes'),
    'd': () => nav('dashboard'),
    'p': () => nav('pastas'),
    'a': () => nav('alertas'),
    'e': () => nav('empresa'),
    '/': () => {
      nav('pesquisa');
      setTimeout(() => document.getElementById('pesq-texto')?.focus(), 100);
    },
    'Escape': () => {
      // Close any open modal
      document.querySelectorAll('.modal-overlay.show, .upload-modal-overlay.show')
        .forEach(m => m.classList.remove('show'));
    },
  };

  document.addEventListener('keydown', e => {
    // Don't trigger if typing in an input, textarea, select, or contenteditable
    const tag = document.activeElement?.tagName;
    const isEditable = document.activeElement?.isContentEditable;
    if (['INPUT','TEXTAREA','SELECT'].includes(tag) || isEditable) return;

    // Don't trigger if any modal is open — shortcuts are dashboard-only
    const modalOpen = document.querySelector('.modal-overlay.show, .upload-modal-overlay.show');
    if (modalOpen && e.key !== 'Escape') return;

    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const action = shortcuts[e.key.toLowerCase()];
    if (action) {
      e.preventDefault();
      action();
    }
  });

  // Cmd+K / Ctrl+K → pesquisa
  document.addEventListener('keydown', e => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      nav('pesquisa');
      setTimeout(() => document.getElementById('pesq-texto')?.focus(), 100);
    }
  });
})();

// ─── Tooltip de atalhos ───────────────────────────────────────────────────────
// Mostra dica na primeira vez
(function showShortcutHint() {
  if (localStorage.getItem('fv_shortcuts_seen')) return;
  setTimeout(() => {
    const el = document.createElement('div');
    el.style.cssText = `
      position: fixed; bottom: 24px; left: 50%; transform: translateX(-50%);
      background: var(--text); color: #fff; padding: 10px 18px; border-radius: 99px;
      font-size: 12px; font-weight: 500; z-index: 9998; opacity: 0;
      transition: opacity .4s; white-space: nowrap; box-shadow: var(--shadow-lg);
    `;
    el.innerHTML = '⌨️ Atalhos: <kbd style="background:rgba(255,255,255,.15);padding:1px 6px;border-radius:4px">F</kbd> Fornecedores · <kbd style="background:rgba(255,255,255,.15);padding:1px 6px;border-radius:4px">C</kbd> Clientes · <kbd style="background:rgba(255,255,255,.15);padding:1px 6px;border-radius:4px">D</kbd> Dashboard · <kbd style="background:rgba(255,255,255,.15);padding:1px 6px;border-radius:4px">/</kbd> Pesquisa';
    document.body.appendChild(el);
    setTimeout(() => el.style.opacity = '1', 100);
    setTimeout(() => {
      el.style.opacity = '0';
      setTimeout(() => el.remove(), 400);
    }, 5000);
    localStorage.setItem('fv_shortcuts_seen', '1');
  }, 2000);
})();

// ─── Row hover highlight mais forte ──────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    tbody tr[data-clickable]:hover td { color: var(--text) !important; }
    tbody tr[data-clickable]:hover td strong { color: var(--accent) !important; }
    tbody tr[data-clickable] { position: relative; }
    tbody tr[data-clickable]::before {
      content: '';
      position: absolute;
      left: 0; top: 0; bottom: 0;
      width: 3px;
      background: var(--accent);
      opacity: 0;
      transition: opacity .15s;
      border-radius: 0 2px 2px 0;
    }
    tbody tr[data-clickable]:hover::before { opacity: 1; }
  `;
  document.head.appendChild(style);
});
