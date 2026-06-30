// ─── drag-drop.js ────────────────────────────────────────────────────────────
// Grupo 3 (parte 1): arrastar faturas para pastas, editar estado inline na tabela

// ─── Drag & drop: arrastar fatura para pasta ─────────────────────────────────
let _draggedInvIdx = null;

function makeRowsDraggable(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.querySelectorAll('tr').forEach(tr => {
    if (tr.dataset.draggable) return;
    tr.dataset.draggable = '1';
    tr.setAttribute('draggable', 'true');

    tr.addEventListener('dragstart', e => {
      const btn = tr.querySelector('.icon-btn[title="Ver"], .icon-btn');
      const match = btn?.getAttribute('onclick')?.match(/\((\d+)\)/);
      _draggedInvIdx = match ? parseInt(match[1]) : null;
      tr.style.opacity = '0.4';
      e.dataTransfer.effectAllowed = 'move';
    });

    tr.addEventListener('dragend', () => {
      tr.style.opacity = '1';
      _draggedInvIdx = null;
      document.querySelectorAll('.folder-chip-target').forEach(el => el.classList.remove('folder-chip-target'));
    });
  });
}

function makePastaChipsDroppable() {
  // Pasta select chips in filters become drop targets (small visual hint)
  document.querySelectorAll('.folder-card').forEach(card => {
    if (card.dataset.droppable) return;
    card.dataset.droppable = '1';

    card.addEventListener('dragover', e => {
      if (_draggedInvIdx === null) return;
      e.preventDefault();
      card.classList.add('folder-drop-hover');
    });
    card.addEventListener('dragleave', () => {
      card.classList.remove('folder-drop-hover');
    });
    card.addEventListener('drop', e => {
      e.preventDefault();
      card.classList.remove('folder-drop-hover');
      if (_draggedInvIdx === null) return;

      const delBtn = card.querySelector('.fc-del');
      const match = delBtn?.getAttribute('onclick')?.match(/\((\d+)\)/);
      const pastaIdx = match ? parseInt(match[1]) : null;
      if (pastaIdx === null) return;

      const pasta = pastas[pastaIdx];
      if (!pasta) return;

      invoices[_draggedInvIdx].pastaId = pasta.id;
      save();
      toast(`Fatura movida para ${pasta.icon} ${pasta.nome}`, 'success');
      renderForn(); renderCli();
      _draggedInvIdx = null;
    });
  });
}

// ─── Editar estado inline (clique directo no badge para ciclar) ──────────────
function attachInlineStateEdit(tbodyId, isClientTable) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;

  tbody.querySelectorAll('tr').forEach(tr => {
    const stateCell = tr.querySelector('td:first-child');
    if (!stateCell || stateCell.dataset.inlineEdit) return;
    stateCell.dataset.inlineEdit = '1';
    stateCell.style.cursor = 'pointer';
    stateCell.title = 'Clique direito para alterar rapidamente o estado';

    stateCell.addEventListener('contextmenu', e => {
      e.preventDefault();
      e.stopPropagation();

      const btn = tr.querySelector('.icon-btn');
      const match = btn?.getAttribute('onclick')?.match(/\((\d+)\)/);
      const idx = match ? parseInt(match[1]) : null;
      if (idx === null) return;

      // Cycle through states quickly
      const inv = invoices[idx];
      const states = isClientTable ? ['pendente', 'pago'] : ['pendente', 'aguarda', 'aprovada', 'pago'];
      const curIdx = states.indexOf(inv.estado || 'pendente');
      const nextState = states[(curIdx + 1) % states.length];

      invoices[idx].estado = nextState;
      if (nextState === 'pago') invoices[idx].dataPagamento = today();
      save();

      const label = isClientTable && nextState === 'pago' ? 'Recebido' : nextState;
      toast(`Estado alterado: ${label}`, 'success');

      if (isClientTable) renderCli(); else renderForn();
      renderDashboard();
      updateAlertBadge();
    });
  });
}

// ─── Hook into render functions ───────────────────────────────────────────────
window.addEventListener('load', function hookDragDrop() {
  if (typeof window.renderForn !== 'function' || typeof window.renderCli !== 'function') {
    setTimeout(hookDragDrop, 100);
    return;
  }

  const _rf = window.renderForn;
  const _rc = window.renderCli;
  const _rp = window.renderPastas;

  window.renderForn = function() {
    _rf.apply(this, arguments);
    setTimeout(() => {
      makeRowsDraggable('forn-body');
      attachInlineStateEdit('forn-body', false);
    }, 60);
  };

  window.renderCli = function() {
    _rc.apply(this, arguments);
    setTimeout(() => {
      makeRowsDraggable('cli-body');
      attachInlineStateEdit('cli-body', true);
    }, 60);
  };

  if (_rp) {
    window.renderPastas = function() {
      _rp.apply(this, arguments);
      setTimeout(makePastaChipsDroppable, 60);
    };
  }
});

// ─── CSS extra para drop hover ─────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const style = document.createElement('style');
  style.textContent = `
    .folder-drop-hover {
      border-color: var(--accent) !important;
      background: var(--accent-light) !important;
      transform: scale(1.03);
    }
    tbody tr[draggable="true"] { cursor: grab; }
    tbody tr[draggable="true"]:active { cursor: grabbing; }
  `;
  document.head.appendChild(style);
});
