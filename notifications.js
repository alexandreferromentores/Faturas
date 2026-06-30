// ─── notifications.js ────────────────────────────────────────────────────────
// Grupo 4: notificações do browser para faturas a vencer

// ─── Pedir permissão ───────────────────────────────────────────────────────────
function requestNotificationPermission() {
  if (!('Notification' in window)) {
    toast('O teu browser não suporta notificações', 'error');
    return;
  }
  if (Notification.permission === 'granted') {
    toast('Notificações já estão activas!', 'success');
    checkAndNotify();
    return;
  }
  if (Notification.permission === 'denied') {
    toast('Notificações bloqueadas. Activa nas definições do browser.', 'error');
    return;
  }
  Notification.requestPermission().then(perm => {
    if (perm === 'granted') {
      toast('Notificações activadas!', 'success');
      localStorage.setItem('fv_notif_enabled', '1');
      checkAndNotify();
    } else {
      toast('Permissão de notificações negada', 'error');
    }
  });
}

// ─── Verificar e notificar faturas a vencer hoje/amanhã ──────────────────────
function checkAndNotify() {
  if (Notification.permission !== 'granted') return;
  if (localStorage.getItem('fv_notif_enabled') !== '1') return;

  const today = new Date().toISOString().slice(0, 10);
  const lastCheck = localStorage.getItem('fv_notif_last_check');
  if (lastCheck === today) return; // já notificou hoje

  const dueTodayOrSoon = invoices.filter(inv => {
    if (isPaid(inv) || !inv.vencimento) return false;
    const d = daysDiff(inv.vencimento);
    return d !== null && d >= 0 && d <= 1;
  });

  if (dueTodayOrSoon.length === 0) {
    localStorage.setItem('fv_notif_last_check', today);
    return;
  }

  const todayCount = dueTodayOrSoon.filter(i => daysDiff(i.vencimento) === 0).length;
  const tomorrowCount = dueTodayOrSoon.length - todayCount;

  let body = '';
  if (todayCount > 0) body += `${todayCount} fatura${todayCount !== 1 ? 's' : ''} vence${todayCount === 1 ? '' : 'm'} hoje. `;
  if (tomorrowCount > 0) body += `${tomorrowCount} vence${tomorrowCount === 1 ? '' : 'm'} amanhã.`;

  const totalValue = dueTodayOrSoon.reduce((s, i) => s + toNum(i.total), 0);

  const notification = new Notification('💰 Faturas a vencer', {
    body: body + ` Total: ${fmt(totalValue)}`,
    icon: '📄',
    tag: 'faturas-vencimento',
    requireInteraction: false,
  });

  notification.onclick = () => {
    window.focus();
    nav('alertas');
    notification.close();
  };

  localStorage.setItem('fv_notif_last_check', today);
}

// ─── Toggle de notificações na página de Configuração ────────────────────────
function addNotificationToggleToConfig() {
  const configCard = document.querySelector('#page-config .card');
  if (!configCard || document.getElementById('notif-section')) return;

  const section = document.createElement('div');
  section.id = 'notif-section';
  section.style.cssText = 'margin-bottom:24px';

  const isGranted = 'Notification' in window && Notification.permission === 'granted';
  const isEnabled = localStorage.getItem('fv_notif_enabled') === '1';

  section.innerHTML = `
    <div style="font-size:14px;font-weight:600;margin-bottom:10px;padding-bottom:8px;border-bottom:1px solid var(--border)">Notificações</div>
    <p style="font-size:13px;color:var(--muted);margin-bottom:12px">
      Recebe um aviso no browser quando uma fatura vence hoje ou amanhã. Funciona apenas com a app aberta numa aba.
    </p>
    <div style="display:flex;gap:10px;align-items:center">
      <button class="btn btn-primary" id="notif-enable-btn" onclick="requestNotificationPermission()">
        ${isGranted && isEnabled ? '✓ Notificações Activas' : '🔔 Activar Notificações'}
      </button>
      ${isGranted && isEnabled ? '<button class="btn btn-ghost btn-sm" onclick="disableNotifications()">Desactivar</button>' : ''}
    </div>
  `;

  // Insert before the first existing section
  configCard.insertBefore(section, configCard.firstChild);
}

function disableNotifications() {
  localStorage.removeItem('fv_notif_enabled');
  toast('Notificações desactivadas');
  loadConfig();
  addNotificationToggleToConfig();
}

// ─── Hook into loadConfig to inject the toggle ───────────────────────────────
window.addEventListener('load', function hookNotifConfig() {
  if (typeof window.loadConfig !== 'function') {
    setTimeout(hookNotifConfig, 100);
    return;
  }
  const _origLoadConfig = window.loadConfig;
  window.loadConfig = function() {
    _origLoadConfig.apply(this, arguments);
    setTimeout(addNotificationToggleToConfig, 50);
  };
});

// ─── Verificar periodicamente (a cada 30 min enquanto app está aberta) ────────
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(checkAndNotify, 3000); // verifica pouco depois de abrir
  setInterval(checkAndNotify, 30 * 60 * 1000); // depois a cada 30 min
});
