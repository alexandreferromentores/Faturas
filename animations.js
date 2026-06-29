// ─── animations.js ───────────────────────────────────────────────────────────
// Grupo 1: contadores animados, skeleton loading, barras de progresso cash flow

// ─── Contador animado ─────────────────────────────────────────────────────────
function animateCounter(el, targetStr) {
  if (!el) return;
  const isEuro  = targetStr.includes('€');
  const target  = parseFloat(targetStr.replace(/[^\d.,]/g, '').replace(',', '.')) || 0;
  const duration = 600;
  const start    = performance.now();
  const startVal = 0;

  function update(now) {
    const elapsed  = now - start;
    const progress = Math.min(elapsed / duration, 1);
    // Ease out cubic
    const ease = 1 - Math.pow(1 - progress, 3);
    const current = startVal + (target - startVal) * ease;

    const formatted = current.toLocaleString('pt-PT', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    el.textContent = isEuro ? formatted + ' €' : String(Math.round(current));

    if (progress < 1) requestAnimationFrame(update);
    else {
      el.textContent = targetStr;
      el.classList.add('metric-animated');
      setTimeout(() => el.classList.remove('metric-animated'), 400);
    }
  }
  requestAnimationFrame(update);
}

// Patch: intercept metric value updates to animate them
const _origSet = (id, val) => {
  const el = document.getElementById(id);
  if (el) el.textContent = val;
};

function setAnimated(id, val) {
  const el = document.getElementById(id);
  if (!el) return;
  if (val.includes('€') || /^\d/.test(val)) {
    animateCounter(el, val);
  } else {
    el.textContent = val;
  }
}

// ─── Skeleton loading ─────────────────────────────────────────────────────────
function showSkeleton(tbodyId, rows = 5) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  tbody.innerHTML = Array(rows).fill('').map(() => `
    <tr>
      <td><div class="skeleton sk-badge"></div></td>
      <td><div class="skeleton sk-md"></div></td>
      <td><div class="skeleton sk-lg"></div></td>
      <td><div class="skeleton sk-sm"></div></td>
      <td><div class="skeleton sk-sm"></div></td>
      <td><div class="skeleton sk-sm"></div></td>
      <td><div class="skeleton sk-md"></div></td>
      <td><div class="skeleton sk-sm"></div></td>
      <td></td>
    </tr>`).join('');
}

function showSkeletonMetrics(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.add('skeleton');
      el.style.minWidth = '80px';
      el.style.minHeight = '28px';
      el.textContent = '';
    }
  });
}

function clearSkeletonMetrics(ids) {
  ids.forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.classList.remove('skeleton');
      el.style.minWidth = '';
      el.style.minHeight = '';
    }
  });
}

// ─── Cash flow com barras de progresso ───────────────────────────────────────
// Override renderCashFlow to add progress bars
const _origCashFlow = typeof renderCashFlow === 'function' ? renderCashFlow : null;

function renderCashFlowAnimated() {
  const now = new Date();
  const periods = [
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
  if (!el) return;

  el.innerHTML = periods.map(({ label, saidas, entradas, net }) => {
    const pos   = net >= 0;
    const col   = pos ? 'var(--green)' : 'var(--red)';
    const bg    = pos ? 'var(--green-bg)' : 'var(--red-bg)';
    const brd   = pos ? 'var(--green-border)' : 'var(--red-border)';
    const total = saidas + entradas || 1;
    const entPct = Math.round((entradas / total) * 100);
    const saiPct = Math.round((saidas / total) * 100);

    return `<div style="background:${bg};border:1px solid ${brd};border-radius:var(--r-lg);padding:16px 18px">
      <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:8px">${label}</div>
      <div style="font-family:var(--mono);font-size:22px;font-weight:700;color:${col};margin-bottom:12px">${net >= 0 ? '+' : ''}${fmt(net)}</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:3px;display:flex;justify-content:space-between">
        <span>Entradas</span><span style="font-weight:600;color:var(--green)">${fmt(entradas)}</span>
      </div>
      <div class="cf-bar-track">
        <div class="cf-bar-fill cf-bar-pago" id="cf-ent-${label.replace(/\s/g,'')}" style="width:0%"></div>
      </div>
      <div style="font-size:11px;color:var(--muted);margin-top:8px;margin-bottom:3px;display:flex;justify-content:space-between">
        <span>Saídas</span><span style="font-weight:600;color:var(--red)">${fmt(saidas)}</span>
      </div>
      <div class="cf-bar-track">
        <div class="cf-bar-fill cf-bar-pend" id="cf-sai-${label.replace(/\s/g,'')}" style="width:0%"></div>
      </div>
    </div>`;
  }).join('');

  // Animate bars after render
  setTimeout(() => {
    periods.forEach(({ label, saidas, entradas }) => {
      const total = saidas + entradas || 1;
      const entEl = document.getElementById('cf-ent-' + label.replace(/\s/g,''));
      const saiEl = document.getElementById('cf-sai-' + label.replace(/\s/g,''));
      if (entEl) entEl.style.width = Math.round((entradas / total) * 100) + '%';
      if (saiEl) saiEl.style.width = Math.round((saidas   / total) * 100) + '%';
    });
  }, 100);
}

// ─── Patch renderDashboard to use animations ──────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Override renderCashFlow globally
  if (typeof renderCashFlow !== 'undefined') {
    window.renderCashFlow = renderCashFlowAnimated;
  }

  // Patch metric setters to animate
  const metricIds = [
    'm-forn-total','m-forn-pago','m-forn-pend','m-forn-venc',
    'm-cli-total','m-cli-rec','m-cli-pend','m-cli-venc',
  ];

  // Observe metric value changes and animate
  metricIds.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const observer = new MutationObserver(() => {
      el.classList.remove('metric-animated');
      void el.offsetWidth; // force reflow
      el.classList.add('metric-animated');
      setTimeout(() => el.classList.remove('metric-animated'), 400);
    });
    observer.observe(el, { characterData: true, childList: true, subtree: true });
  });
});

// ─── Show skeletons while loading ────────────────────────────────────────────
const _origRenderForn = typeof renderForn !== 'undefined' ? renderForn : null;
const _origRenderCli  = typeof renderCli  !== 'undefined' ? renderCli  : null;

// Wrap renderForn and renderCli to show skeleton briefly
function wrapWithSkeleton(originalFn, tbodyId) {
  return function() {
    showSkeleton(tbodyId, 3);
    setTimeout(() => originalFn.apply(this, arguments), 80);
  };
}

// Apply patches after all scripts load
window.addEventListener('load', () => {
  if (typeof renderCashFlow !== 'undefined') {
    window.renderCashFlow = renderCashFlowAnimated;
  }
  // Trigger re-render if on dashboard
  const hash = location.hash.replace('#','');
  if (hash === 'dashboard' || !hash) {
    setTimeout(() => renderCashFlowAnimated(), 200);
  }
});
