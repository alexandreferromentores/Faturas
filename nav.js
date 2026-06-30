// ─── nav.js ─────────────────────────────────────────────────────────────────
// Navegação com persistência via hash URL (#fornecedores, #dashboard, etc.)

const VALID_PAGES = ['dashboard','alertas','fornecedores','clientes','pesquisa','pastas','config','empresa'];

function nav(name) {
  if (!VALID_PAGES.includes(name)) name = 'dashboard';

  history.replaceState(null, '', '#' + name);

  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));

  const pg = document.getElementById('page-' + name);
  if (pg) pg.classList.add('active');

  document.querySelectorAll('.nav-item').forEach(it => {
    if (it.getAttribute('onclick')?.includes("'" + name + "'")) it.classList.add('active');
  });

  const callbacks = {
    dashboard:    () => { renderDashboard(); renderCalendar(); },
    fornecedores: () => { populatePastaFilter('ff-pasta'); renderForn(); },
    clientes:     () => { populatePastaFilter('cf-pasta'); renderCli(); },
    pastas:       () => renderPastas(),
    alertas:      () => renderAlertas(),
    config:       () => loadConfig(),
    pesquisa:     () => renderPesquisa(),
    empresa:      () => loadEmpresa(),
  };
  callbacks[name]?.();
  updateAlertBadge();
}

document.addEventListener('DOMContentLoaded', () => {
  const hash = location.hash.replace('#', '');
  nav(VALID_PAGES.includes(hash) ? hash : 'dashboard');
});

window.addEventListener('popstate', () => {
  const hash = location.hash.replace('#', '');
  nav(VALID_PAGES.includes(hash) ? hash : 'dashboard');
});
