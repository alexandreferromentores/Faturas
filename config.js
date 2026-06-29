// ─── config.js ───────────────────────────────────────────────
// ─── config.js ────────────────────────────────────────────────────────────────
// Configuração da API Key, exportação de dados e limpeza.

function loadConfig() {
  if (config.apiKey) {
    document.getElementById('cfg-key').value = config.apiKey;
    document.getElementById('cfg-status').textContent = '✓ API Key configurada';
  }
  if (config.sheetsKey) {
    document.getElementById('cfg-sheets').value = config.sheetsKey;
    document.getElementById('cfg-sheets-status').textContent = '✓ Google Sheets configurado';
  }
}

function saveConfig() {
  config.apiKey    = document.getElementById('cfg-key').value.trim();
  config.sheetsKey = document.getElementById('cfg-sheets').value.trim();
  localStorage.setItem('fv_config', JSON.stringify(config));
  document.getElementById('cfg-status').textContent = '✓ Guardado';
  toast('Configuração guardada!', 'success');
}

async function testSheets() {
  const btn = document.getElementById('cfg-sheets-test');
  btn.disabled = true;
  btn.textContent = 'A testar…';
  try {
    const ok = await sheetsLoad();
    if (ok) {
      document.getElementById('cfg-sheets-status').textContent = '✓ Ligação bem sucedida! Dados carregados.';
      toast('Google Sheets ligado!', 'success');
      renderDashboard();
      updateAlertBadge();
    } else {
      document.getElementById('cfg-sheets-status').textContent = '✗ Erro — verifica o JSON';
      toast('Erro ao ligar ao Sheets', 'error');
    }
  } catch(e) {
    document.getElementById('cfg-sheets-status').textContent = '✗ ' + e.message;
    toast('Erro: ' + e.message, 'error');
  }
  btn.disabled = false;
  btn.textContent = 'Testar ligação';
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

// ─── Relatório Mensal ─────────────────────────────────────────────────────────
function exportRelatorio() {
  const meses = {};

  invoices.forEach(inv => {
    const parts = (inv.emissao || '').split('/');
    if (parts.length < 3) return;
    const key   = `${parts[2]}-${parts[1]}`;
    const label = `${parts[1]}/${parts[2]}`;
    if (!meses[key]) meses[key] = { label, entradas: 0, saidas: 0, iva: 0, retencoes: 0, faturas: [] };
    const m = meses[key];
    if (isClient(inv)) m.entradas += toNum(inv.total);
    else               m.saidas   += toNum(inv.total);
    m.iva       += toNum(inv.iva);
    m.retencoes += toNum(inv.retencao);
    m.faturas.push(inv);
  });

  const sortedKeys = Object.keys(meses).sort();
  const linhas = [];
  linhas.push('Mês,Entradas (€),Saídas (€),Saldo (€),IVA Total (€),Retenções IRS (€),Nº Faturas');

  sortedKeys.forEach(k => {
    const m = meses[k];
    const saldo = m.entradas - m.saidas;
    linhas.push([
      m.label,
      m.entradas.toFixed(2),
      m.saidas.toFixed(2),
      saldo.toFixed(2),
      m.iva.toFixed(2),
      m.retencoes.toFixed(2),
      m.faturas.length,
    ].join(','));
  });

  linhas.push('');
  linhas.push('--- DETALHE ---');
  linhas.push('Mês,Tipo,Número,Entidade,NIF,Emissão,Vencimento,Ilíquido,IVA,Retenção IRS,Total Doc,Total Pagar,Estado,Descritivo');

  sortedKeys.forEach(k => {
    meses[k].faturas.forEach(inv => {
      const parts = (inv.emissao || '').split('/');
      const label = parts.length === 3 ? `${parts[1]}/${parts[2]}` : '';
      linhas.push([
        label,
        isClient(inv) ? 'Cliente' : 'Fornecedor',
        inv.numero    || '',
        inv.entidade  || '',
        inv.nif       || '',
        inv.emissao   || '',
        inv.vencimento || '',
        inv.base      || '',
        inv.iva       || '',
        inv.retencao  || '',
        inv.totalDoc  || '',
        inv.total     || '',
        inv.estado    || '',
        (inv.descritivo || '').replace(/,/g, ';'),
      ].map(v => `"${String(v).replace(/"/g,'""')}"`).join(','));
    });
  });

  const csv = linhas.join('\n');
  const a   = document.createElement('a');
  a.href     = URL.createObjectURL(new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' }));
  a.download = `relatorio_faturas_${new Date().toISOString().slice(0,7)}.csv`;
  a.click();
}
