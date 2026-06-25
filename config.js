// ─── config.js ────────────────────────────────────────────────────────────────
// Configuração da API Key, exportação de dados e limpeza.

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

// ─── Exportar CSV ─────────────────────────────────────────────────────────────
function exportCSV() {
  const headers = ['Tipo','Número','Entidade','NIF','Emissão','Vencimento','Base','IVA','Total','Estado','Pasta','Notas'];
  const rows = invoices.map(i => {
    const p = getPasta(i.pastaId);
    return [
      i.tipo, i.numero, i.entidade, i.nif,
      i.emissao, i.vencimento, i.base, i.iva,
      i.total, i.estado, p ? p.nome : '', i.notas,
    ].map(v => `"${(v || '').toString().replace(/"/g, '""')}"`).join(',');
  });
  const csv = [headers.join(','), ...rows].join('\n');
  const a   = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = 'faturas.csv';
  a.click();
}

// ─── Apagar tudo ──────────────────────────────────────────────────────────────
function clearAll() {
  if (!confirm('Apagar TODAS as faturas e pastas? Não pode ser desfeito.')) return;
  invoices = [];
  pastas   = [];
  localStorage.removeItem('fv_invoices');
  localStorage.removeItem('fv_pastas');
  renderDashboard();
  updateAlertBadge();
  toast('Dados apagados');
}
