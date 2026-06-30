// ─── intelligence.js ─────────────────────────────────────────────────────────
// Previsão de cash flow, detecção de anomalias, categorização automática.

// ─── Previsão de cash flow baseada em histórico ──────────────────────────────
// Analisa os últimos 3-6 meses para prever o próximo mês
function predictNextMonthCashFlow() {
  const now = new Date();
  const monthsBack = 4;
  const monthlyTotals = [];

  for (let i = 1; i <= monthsBack; i++) {
    const targetMonth = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${targetMonth.getFullYear()}-${String(targetMonth.getMonth()+1).padStart(2,'0')}`;

    const monthInvoices = invoices.filter(inv => {
      const parts = (inv.emissao || '').split('/');
      if (parts.length < 3) return false;
      return `${parts[2]}-${parts[1]}` === key;
    });

    const entradas = monthInvoices.filter(isClient).reduce((s, i) => s + toNum(i.total), 0);
    const saidas   = monthInvoices.filter(i => !isClient(i)).reduce((s, i) => s + toNum(i.total), 0);

    monthlyTotals.push({ entradas, saidas, net: entradas - saidas });
  }

  if (monthlyTotals.length < 2) return null; // dados insuficientes

  // Média móvel simples ponderada (mais peso aos meses recentes)
  const weights = monthlyTotals.map((_, i) => monthlyTotals.length - i);
  const totalWeight = weights.reduce((a, b) => a + b, 0);

  const predictedEntradas = monthlyTotals.reduce((s, m, i) => s + m.entradas * weights[i], 0) / totalWeight;
  const predictedSaidas   = monthlyTotals.reduce((s, m, i) => s + m.saidas * weights[i], 0) / totalWeight;

  // Calcula tendência (crescente/decrescente) comparando primeiro e último período
  const trend = monthlyTotals[0].net - monthlyTotals[monthlyTotals.length - 1].net;

  return {
    predictedEntradas,
    predictedSaidas,
    predictedNet: predictedEntradas - predictedSaidas,
    trend,
    confidence: monthlyTotals.length >= 3 ? 'média' : 'baixa',
    basedOnMonths: monthlyTotals.length,
  };
}

function renderCashFlowPrediction() {
  const container = document.getElementById('dash-prediction');
  if (!container) return;

  const pred = predictNextMonthCashFlow();
  if (!pred) {
    container.innerHTML = '<p style="color:var(--muted);font-size:13px">Dados insuficientes para previsão (precisa de pelo menos 2 meses de histórico).</p>';
    return;
  }

  const nextMonth = new Date();
  nextMonth.setMonth(nextMonth.getMonth() + 1);
  const monthName = nextMonth.toLocaleDateString('pt-PT', { month: 'long' });

  const trendIcon = pred.trend > 0 ? '📈' : pred.trend < 0 ? '📉' : '➡️';
  const trendLabel = pred.trend > 0 ? 'tendência de subida' : pred.trend < 0 ? 'tendência de descida' : 'estável';
  const netColor = pred.predictedNet >= 0 ? 'var(--green)' : 'var(--red)';

  container.innerHTML = `
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:14px">
      <div style="font-size:13px;font-weight:600">Previsão para ${monthName}</div>
      <span style="font-size:11px;color:var(--muted);background:var(--surface-2);padding:2px 8px;border-radius:99px">Confiança: ${pred.confidence}</span>
    </div>
    <div class="three-col">
      <div style="background:var(--green-bg);border:1px solid var(--green-border);border-radius:var(--r-lg);padding:14px 16px">
        <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Entradas Previstas</div>
        <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--green)">${fmt(pred.predictedEntradas)}</div>
      </div>
      <div style="background:var(--red-bg);border:1px solid var(--red-border);border-radius:var(--r-lg);padding:14px 16px">
        <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Saídas Previstas</div>
        <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:var(--red)">${fmt(pred.predictedSaidas)}</div>
      </div>
      <div style="background:var(--accent-light);border:1px solid var(--accent-border);border-radius:var(--r-lg);padding:14px 16px">
        <div style="font-size:11px;font-weight:600;color:var(--muted);text-transform:uppercase;margin-bottom:6px">Saldo Previsto ${trendIcon}</div>
        <div style="font-family:var(--mono);font-size:18px;font-weight:700;color:${netColor}">${pred.predictedNet >= 0 ? '+' : ''}${fmt(pred.predictedNet)}</div>
      </div>
    </div>
    <div style="font-size:11px;color:var(--muted);margin-top:10px">Baseado em ${pred.basedOnMonths} meses de histórico · ${trendLabel}</div>
  `;
}

// ─── Detecção de anomalias ────────────────────────────────────────────────────
// Compara cada nova fatura com a média histórica do mesmo fornecedor
function detectAnomaly(entidade, valor) {
  if (!entidade || !valor) return null;

  const historico = invoices.filter(i =>
    (i.entidade || '').toLowerCase().trim() === entidade.toLowerCase().trim()
  );

  if (historico.length < 2) return null; // sem histórico suficiente

  const valores = historico.map(i => toNum(i.total));
  const media = valores.reduce((a, b) => a + b, 0) / valores.length;
  const desvio = Math.sqrt(valores.reduce((s, v) => s + Math.pow(v - media, 2), 0) / valores.length);

  const valorAtual = toNum(valor);
  const diferenca = valorAtual - media;
  const percentagem = media > 0 ? (diferenca / media) * 100 : 0;

  // Considera anomalia se desviar mais de 50% da média (e desvio padrão não for zero)
  if (Math.abs(percentagem) > 50 && historico.length >= 2) {
    return {
      isAnomaly: true,
      media,
      valorAtual,
      percentagem: Math.round(percentagem),
      direction: diferenca > 0 ? 'acima' : 'abaixo',
    };
  }

  return { isAnomaly: false, media, valorAtual, percentagem: Math.round(percentagem) };
}

function showAnomalyWarning(entidade, valor) {
  const result = detectAnomaly(entidade, valor);
  const container = document.getElementById('anomaly-warning');
  if (!container) return;

  if (!result || !result.isAnomaly) {
    container.style.display = 'none';
    return;
  }

  container.style.display = 'flex';
  container.innerHTML = `
    <div style="font-size:18px;flex-shrink:0">⚠️</div>
    <div>
      <div style="font-size:12px;font-weight:700;color:var(--amber)">Valor fora do padrão habitual</div>
      <div style="font-size:11px;color:var(--muted);margin-top:2px">
        Este valor está ${Math.abs(result.percentagem)}% ${result.direction} da média histórica deste fornecedor (${fmt(result.media)}).
      </div>
    </div>
  `;
}

// Hook: verifica anomalia ao preencher o formulário com dados extraídos
window.addEventListener('load', function hookAnomalyCheck() {
  if (typeof window.fillExtracted !== 'function') {
    setTimeout(hookAnomalyCheck, 100);
    return;
  }
  const _origFill = window.fillExtracted;
  window.fillExtracted = function(data) {
    _origFill.apply(this, arguments);
    if (data.entidade && data.total) {
      setTimeout(() => showAnomalyWarning(data.entidade, data.total), 100);
    }
  };
});

// ─── Categorização automática por tipo de despesa ────────────────────────────
const EXPENSE_CATEGORIES = {
  'Eletricidade/Energia':  ['edp', 'galp', 'energia', 'eletricidade', 'eletrica'],
  'Água':                  ['água', 'aguas', 'epal'],
  'Telecomunicações':      ['nos', 'meo', 'vodafone', 'telecom', 'internet', 'telefone'],
  'Software/SaaS':         ['software', 'licença', 'subscrição', 'saas', 'cloud', 'microsoft', 'google', 'adobe'],
  'Formação':              ['formação', 'curso', 'workshop', 'ufcd', 'forestcort'],
  'Contabilidade':         ['contabilidade', 'contabilista', 'tcoc'],
  'Marketing':             ['marketing', 'publicidade', 'ads', 'anúncio'],
  'Combustível/Transporte':['combustível', 'gasolina', 'gasóleo', 'galp', 'portagem', 'transporte'],
  'Material de Escritório':['material', 'papelaria', 'escritório'],
  'Aluguer':               ['renda', 'aluguer', 'arrendamento'],
  'Seguros':               ['seguro', 'seguradora'],
  'Serviços Profissionais':['consultoria', 'advogado', 'jurídico', 'serviços'],
};

function autoDetectCategory(entidade, descritivo) {
  const hay = ((entidade || '') + ' ' + (descritivo || '')).toLowerCase();
  for (const [categoria, keywords] of Object.entries(EXPENSE_CATEGORIES)) {
    if (keywords.some(kw => hay.includes(kw))) return categoria;
  }
  return 'Outros';
}

// Adiciona campo de categoria automaticamente ao guardar (não-intrusivo)
window.addEventListener('load', function hookCategorization() {
  if (typeof window.buildInv !== 'function') {
    setTimeout(hookCategorization, 100);
    return;
  }
  const _origBuildInv = window.buildInv;
  window.buildInv = function(fields) {
    if (!fields.categoria) {
      fields.categoria = autoDetectCategory(fields.entidade, fields.descritivo);
    }
    return _origBuildInv.apply(this, arguments);
  };
});

// ─── Gráfico de despesas por categoria no dashboard ──────────────────────────
let chartCategorias = null;

function renderChartCategorias() {
  const canvas = document.getElementById('chart-categorias');
  if (!canvas || typeof Chart === 'undefined') return;

  const map = {};
  invoices.filter(i => !isClient(i)).forEach(inv => {
    const cat = inv.categoria || autoDetectCategory(inv.entidade, inv.descritivo);
    map[cat] = (map[cat] || 0) + toNum(inv.total);
  });

  const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]).slice(0, 8);
  const labels = sorted.map(([k]) => k);
  const values = sorted.map(([, v]) => v);
  const colors = ['#1849A9','#027A48','#B42318','#B54708','#5925DC','#026AA2','#DB2777','#65A30D'];

  if (chartCategorias) chartCategorias.destroy();

  const legendEl = document.getElementById('chart-categorias-legend');
  if (labels.length === 0) {
    if (legendEl) legendEl.innerHTML = '<p style="color:var(--muted);font-size:12px">Sem dados ainda.</p>';
    return;
  }

  chartCategorias = new Chart(canvas, {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: values, backgroundColor: colors.slice(0, labels.length), borderRadius: 4 }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        x: { grid: { color: '#f0f0f0' }, ticks: { callback: v => v.toLocaleString('pt-PT') + ' €', font: { size: 10 } } },
        y: { grid: { display: false }, ticks: { font: { size: 11 } } },
      },
    },
  });
}

// ─── Hook into dashboard render ───────────────────────────────────────────────
window.addEventListener('load', function hookDashboardExtras() {
  if (typeof window.renderDashboard !== 'function') {
    setTimeout(hookDashboardExtras, 100);
    return;
  }
  const _origRenderDashboard = window.renderDashboard;
  window.renderDashboard = function() {
    _origRenderDashboard.apply(this, arguments);
    setTimeout(() => {
      renderCashFlowPrediction();
      renderChartCategorias();
    }, 50);
  };
});
