// ─── invoices.js ──────────────────────────────────────────────────────────────
// Lógica de faturas: criar, editar, apagar, validar e workflow de estados.

// ─── Construtor de fatura ─────────────────────────────────────────────────────
function buildInv(fields) {
  return {
    id: Date.now() + Math.random(),
    addedAt: new Date().toISOString(),
    ...fields,
    pastaId: fields.pastaId ? Number(fields.pastaId) : null,
  };
}

// ─── Validação ────────────────────────────────────────────────────────────────
function validateInv(fields) {
  const erros = [];
  if (!fields.entidade?.trim()) erros.push('Entidade');
  if (!fields.numero?.trim())   erros.push('Número de fatura');
  if (!fields.emissao?.trim())  erros.push('Data de emissão');
  if (!fields.total?.toString().trim()) erros.push('Total');
  if (erros.length) {
    toast('Campos obrigatórios: ' + erros.join(', '), 'error');
    return false;
  }
  return true;
}

// ─── Apagar fatura ────────────────────────────────────────────────────────────
function delInv(idx) {
  if (!confirm('Apagar esta fatura?')) return;
  invoices.splice(idx, 1);
  save();
  renderForn();
  renderCli();
  toast('Fatura apagada');
  updateAlertBadge();
}

// ─── Modal de introdução manual ───────────────────────────────────────────────
function openManual(tipo, editIdx) {
  populatePastaSelect('m-pasta');
  document.getElementById('m-tipo').value = tipo;
  document.getElementById('modal-manual-title').textContent =
    (editIdx !== undefined ? 'Editar' : 'Nova') + ' Fatura — ' +
    (tipo === 'cliente' ? 'Cliente' : 'Fornecedor');

  if (editIdx !== undefined) {
    const inv = invoices[editIdx];
    document.getElementById('m-edit-id').value  = editIdx;
    document.getElementById('m-ent').value      = inv.entidade   || '';
    document.getElementById('m-nif').value      = inv.nif        || '';
    document.getElementById('m-num').value      = inv.numero     || '';
    document.getElementById('m-emissao').value  = inv.emissao    || '';
    document.getElementById('m-venc').value     = inv.vencimento || '';
    document.getElementById('m-desc').value     = inv.descritivo || '';
    document.getElementById('m-base').value     = inv.base       || '';
    document.getElementById('m-iva').value      = inv.iva        || '';
    document.getElementById('m-retencao').value = inv.retencao   || '';
    document.getElementById('m-totalDoc').value = inv.totalDoc   || '';
    document.getElementById('m-total').value    = inv.total      || '';
    document.getElementById('m-estado').value   = inv.estado     || 'pendente';
    document.getElementById('m-pasta').value    = inv.pastaId    || '';
    document.getElementById('m-notas').value    = inv.notas      || '';
  } else {
    document.getElementById('m-edit-id').value = '';
    ['m-ent','m-nif','m-num','m-emissao','m-venc','m-desc',
     'm-base','m-iva','m-retencao','m-totalDoc','m-total','m-notas']
      .forEach(id => document.getElementById(id).value = '');
    document.getElementById('m-estado').value = 'pendente';
    document.getElementById('m-pasta').value  = '';
  }
  document.getElementById('modal-manual').classList.add('show');
}

function editInv(idx) { openManual(invoices[idx].tipo, idx); }

// ─── Guardar fatura manual ────────────────────────────────────────────────────
function saveManual() {
  const editIdxRaw = document.getElementById('m-edit-id').value;
  const tipo = document.getElementById('m-tipo').value;
  const fields = {
    tipo,
    entidade:   document.getElementById('m-ent').value,
    nif:        document.getElementById('m-nif').value,
    numero:     document.getElementById('m-num').value,
    emissao:    document.getElementById('m-emissao').value,
    vencimento: document.getElementById('m-venc').value,
    descritivo: document.getElementById('m-desc').value,
    base:       document.getElementById('m-base').value,
    iva:        document.getElementById('m-iva').value,
    retencao:   document.getElementById('m-retencao').value,
    totalDoc:   document.getElementById('m-totalDoc').value,
    total:      document.getElementById('m-total').value,
    estado:     document.getElementById('m-estado').value,
    pastaId:    document.getElementById('m-pasta').value
                  ? Number(document.getElementById('m-pasta').value) : null,
    notas:      document.getElementById('m-notas').value,
  };

  if (!validateInv(fields)) return;

  if (editIdxRaw !== '') {
    invoices[parseInt(editIdxRaw)] = { ...invoices[parseInt(editIdxRaw)], ...fields };
    toast('Fatura atualizada!', 'success');
  } else {
    const num = fields.numero.trim().toLowerCase();
    const ent = fields.entidade.trim().toLowerCase();
    const dup = num && invoices.find(i =>
      (i.numero || '').trim().toLowerCase() === num &&
      (i.entidade || '').trim().toLowerCase() === ent);
    if (dup && !confirm('Parece um duplicado. Guardar mesmo assim?')) return;
    invoices.push(buildInv(fields));
    toast('Fatura adicionada!', 'success');
  }

  save();
  closeModal('modal-manual');
  nav(tipo === 'cliente' ? 'clientes' : 'fornecedores');
}

// ─── Detalhe de fatura ────────────────────────────────────────────────────────
function viewInv(idx) {
  const inv = invoices[idx];
  const p   = getPasta(inv.pastaId);
  document.getElementById('detail-title').textContent = inv.entidade || '—';
  document.getElementById('detail-body').innerHTML = `
    <div class="form-grid">
      <div class="form-group"><label>Número</label><div style="font-family:var(--mono);font-size:13px;padding:8px 0">${inv.numero || '—'}</div></div>
      <div class="form-group"><label>Tipo</label><div style="padding:8px 0">${isClient(inv) ? '👤 Cliente' : '🏢 Fornecedor'}</div></div>
      <div class="form-group"><label>NIF</label><div style="font-family:var(--mono);font-size:13px;padding:8px 0">${inv.nif || '—'}</div></div>
      <div class="form-group"><label>Estado</label><div style="padding:8px 0">${estadoBadge(inv)} ${dueBadge(inv)}</div></div>
      <div class="form-group"><label>Data de Emissão</label><div style="padding:8px 0">${inv.emissao || '—'}</div></div>
      <div class="form-group"><label>Data de Vencimento</label><div style="padding:8px 0">${inv.vencimento || '—'}</div></div>
      ${inv.descritivo ? `<div class="form-group full"><label>Descritivo</label><div style="padding:8px 0;font-size:13px;color:var(--text)">${inv.descritivo}</div></div>` : ''}
      <div class="form-group"><label>Valor Ilíquido</label><div style="font-family:var(--mono);padding:8px 0">${inv.base ? fmt(inv.base) : '—'}</div></div>
      <div class="form-group"><label>IVA</label><div style="font-family:var(--mono);padding:8px 0">${inv.iva ? fmt(inv.iva) : '—'}</div></div>
      ${inv.retencao ? `<div class="form-group"><label>Retenção IRS</label><div style="font-family:var(--mono);padding:8px 0">${fmt(inv.retencao)}</div></div>` : ''}
      ${inv.totalDoc ? `<div class="form-group"><label>Total Documento</label><div style="font-family:var(--mono);padding:8px 0">${fmt(inv.totalDoc)}</div></div>` : ''}
      <div class="form-group"><label>Total a Pagar</label><div style="font-family:var(--mono);font-size:16px;font-weight:600;color:var(--accent);padding:8px 0">${fmt(inv.total)}</div></div>
      ${p ? `<div class="form-group"><label>Pasta</label><div style="padding:8px 0"><span class="folder-chip" style="background:${p.cor.bg};color:${p.cor.text};border-color:${p.cor.border}">${p.icon} ${p.nome}</span></div></div>` : ''}
      ${inv.notas ? `<div class="form-group full"><label>Notas</label><div style="padding:8px 0;font-size:13px;color:var(--muted)">${inv.notas}</div></div>` : ''}
      ${inv.dataPagamento ? `<div class="form-group"><label>Data de Pagamento</label><div style="padding:8px 0">${inv.dataPagamento}</div></div>` : ''}
    </div>
    ${inv.faturaUrl ? `<div style="margin-top:12px;padding:10px 14px;background:var(--accent-light);border:1px solid var(--accent-border);border-radius:var(--r);display:flex;align-items:center;justify-content:space-between"><span style="font-size:13px;font-weight:500">📄 PDF da Fatura</span><a href="${inv.faturaUrl}" target="_blank" class="btn btn-primary btn-sm">Ver PDF</a></div>` : ''}
    <div style="display:flex;gap:10px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
      <button class="btn btn-primary btn-sm" onclick="closeModal('modal-detail');openWF(${idx})">⇄ Alterar Estado</button>
      <button class="btn btn-ghost btn-sm" onclick="closeModal('modal-detail');editInv(${idx})">✎ Editar</button>
      <button class="btn btn-danger btn-sm" onclick="closeModal('modal-detail');delInv(${idx})">✕ Apagar</button>
    </div>`;
  document.getElementById('modal-detail').classList.add('show');
}

// ─── Pastas ───────────────────────────────────────────────────────────────────
let selectedPastaCor = 0;

// ─── Abrir modal de pasta a partir do formulário de fatura ───────────────────
// Guarda qual select deve ser actualizado depois de criar a pasta
let _pastaReturnSelect = null;

function openModalPastaInline(selectId) {
  _pastaReturnSelect = selectId;
  openModalPasta();
}

function openModalPasta() {
  selectedPastaCor = 0;
  document.getElementById('p-cor-opts').innerHTML = PASTA_CORES.map((c, i) => `
    <div onclick="selectCor(${i})" id="cor-opt-${i}"
      style="width:26px;height:26px;border-radius:50%;background:${c.bg};
             border:2px solid ${i === 0 ? c.text : c.border};cursor:pointer"
      title="${c.name}"></div>`).join('');
  document.getElementById('p-nome').value = '';
  document.getElementById('modal-pasta').classList.add('show');
}

function selectCor(i) {
  selectedPastaCor = i;
  PASTA_CORES.forEach((c, j) => {
    const el = document.getElementById('cor-opt-' + j);
    if (el) el.style.border = '2px solid ' + (j === i ? c.text : c.border);
  });
}

function savePasta() {
  const nome = document.getElementById('p-nome').value.trim();
  if (!nome) { toast('Preenche o nome da pasta', 'error'); return; }
  pastas.push({
    id: Date.now(),
    nome,
    icon: document.getElementById('p-icon').value,
    cor:  PASTA_CORES[selectedPastaCor],
  });
  save();
  closeModal('modal-pasta');
  renderPastas();
  ['ff-pasta', 'cf-pasta'].forEach(populatePastaFilter);
  ['f-pasta',  'm-pasta'].forEach(populatePastaSelect);
  toast('Pasta criada!', 'success');

  // Se veio de um formulário, selecciona a nova pasta automaticamente
  if (_pastaReturnSelect) {
    const newPasta = pastas[pastas.length - 1];
    const sel = document.getElementById(_pastaReturnSelect);
    if (sel) sel.value = String(newPasta.id);
    _pastaReturnSelect = null;
  }
}

function delPasta(idx) {
  if (!confirm(`Apagar pasta "${pastas[idx].nome}"?`)) return;
  const id = pastas[idx].id;
  invoices = invoices.map(i => i.pastaId === id ? { ...i, pastaId: null } : i);
  pastas.splice(idx, 1);
  save();
  renderPastas();
  toast('Pasta apagada');
}

// ─── Workflow de estados ──────────────────────────────────────────────────────
const WF_FORN        = ['pendente', 'aguarda', 'aprovada', 'pago'];
const WF_FORN_LABELS = { pendente: 'Pendente', aguarda: 'Ag. Aprovação', aprovada: 'Aprovada', pago: 'Pago' };
const WF_CLI         = ['pendente', 'pago'];
const WF_CLI_LABELS  = { pendente: 'Pendente', pago: 'Recebido' };
let wfSelected = null;

function openWF(idx) {
  const inv    = invoices[idx];
  const isCli  = isClient(inv);
  const steps  = isCli ? WF_CLI        : WF_FORN;
  const labels = isCli ? WF_CLI_LABELS : WF_FORN_LABELS;
  wfSelected   = inv.estado || 'pendente';

  document.getElementById('wf-id').value   = idx;
  document.getElementById('wf-tipo').value = inv.tipo;
  document.getElementById('wf-title').textContent = `Estado — ${inv.entidade || ''}`;
  document.getElementById('wf-steps').innerHTML = steps.map(s =>
    `<div class="wf-step ${s === wfSelected ? 'active' : ''}" onclick="selectWF('${s}', this)">${labels[s]}</div>`
  ).join('');
  document.getElementById('wf-date-row').style.display = wfSelected === 'pago' ? 'block' : 'none';
  document.getElementById('wf-date').value = today();
  document.getElementById('modal-wf').classList.add('show');
}

function selectWF(estado, el) {
  wfSelected = estado;
  document.querySelectorAll('.wf-step').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  document.getElementById('wf-date-row').style.display = estado === 'pago' ? 'block' : 'none';
}

function saveWF() {
  const idx = parseInt(document.getElementById('wf-id').value);
  invoices[idx].estado = wfSelected;
  if (wfSelected === 'pago') invoices[idx].dataPagamento = document.getElementById('wf-date').value;
  save();
  closeModal('modal-wf');
  renderForn(); renderCli(); renderDashboard(); updateAlertBadge();
  toast('Estado atualizado!', 'success');
}

// ─── Comprovativo de pagamento ────────────────────────────────────────────────
let _currentDetailIdx = null;

// Actualiza o modal de detalhe para mostrar/esconder comprovativo
function refreshComprovavitoUI(inv) {
  const existente = document.getElementById('comprovativo-existente');
  const upload    = document.getElementById('comprovativo-upload');
  const link      = document.getElementById('comprovativo-link');
  const loading   = document.getElementById('comp-loading');
  if (!existente) return;
  loading.style.display = 'none';
  if (inv.comprovavitoUrl) {
    existente.style.display = 'block';
    upload.style.display    = 'none';
    link.href               = inv.comprovavitoUrl;
  } else {
    existente.style.display = 'none';
    upload.style.display    = 'block';
  }
}

// Override viewInv to track current index and show comprovativo UI
const _origViewInv = typeof viewInv === 'function' ? viewInv : null;

function viewInv(idx) {
  _currentDetailIdx = idx;
  const inv = invoices[idx];
  const p   = getPasta(inv.pastaId);
  document.getElementById('detail-title').textContent = inv.entidade || '—';
  document.getElementById('detail-body').innerHTML = `
    <div class="form-grid">
      <div class="form-group"><label>Número</label><div style="font-family:var(--mono);font-size:13px;padding:8px 0">${inv.numero || '—'}</div></div>
      <div class="form-group"><label>Tipo</label><div style="padding:8px 0">${isClient(inv) ? '👤 Cliente' : '🏢 Fornecedor'}</div></div>
      <div class="form-group"><label>NIF</label><div style="font-family:var(--mono);font-size:13px;padding:8px 0">${inv.nif || '—'}</div></div>
      <div class="form-group"><label>Estado</label><div style="padding:8px 0">${estadoBadge(inv)} ${dueBadge(inv)}</div></div>
      <div class="form-group"><label>Data de Emissão</label><div style="padding:8px 0">${inv.emissao || '—'}</div></div>
      <div class="form-group"><label>Data de Vencimento</label><div style="padding:8px 0">${inv.vencimento || '—'}</div></div>
      ${inv.descritivo ? `<div class="form-group full"><label>Descritivo</label><div style="padding:8px 0;font-size:13px">${inv.descritivo}</div></div>` : ''}
      <div class="form-group"><label>Valor Ilíquido</label><div style="font-family:var(--mono);padding:8px 0">${inv.base ? fmt(inv.base) : '—'}</div></div>
      <div class="form-group"><label>IVA</label><div style="font-family:var(--mono);padding:8px 0">${inv.iva ? fmt(inv.iva) : '—'}</div></div>
      ${inv.retencao ? `<div class="form-group"><label>Retenção IRS</label><div style="font-family:var(--mono);padding:8px 0">${fmt(inv.retencao)}</div></div>` : ''}
      ${inv.totalDoc ? `<div class="form-group"><label>Total Documento</label><div style="font-family:var(--mono);padding:8px 0">${fmt(inv.totalDoc)}</div></div>` : ''}
      <div class="form-group"><label>Total a Pagar</label><div style="font-family:var(--mono);font-size:16px;font-weight:600;color:var(--accent);padding:8px 0">${fmt(inv.total)}</div></div>
      ${p ? `<div class="form-group"><label>Pasta</label><div style="padding:8px 0"><span class="folder-chip" style="background:${p.cor.bg};color:${p.cor.text};border-color:${p.cor.border}">${p.icon} ${p.nome}</span></div></div>` : ''}
      ${inv.notas ? `<div class="form-group full"><label>Notas</label><div style="padding:8px 0;font-size:13px;color:var(--muted)">${inv.notas}</div></div>` : ''}
      ${inv.dataPagamento ? `<div class="form-group"><label>Data de Pagamento</label><div style="padding:8px 0">${inv.dataPagamento}</div></div>` : ''}
    </div>
    ${inv.faturaUrl ? `<div style="margin-top:12px;padding:10px 14px;background:var(--accent-light);border:1px solid var(--accent-border);border-radius:var(--r);display:flex;align-items:center;justify-content:space-between"><span style="font-size:13px;font-weight:500">📄 PDF da Fatura</span><a href="${inv.faturaUrl}" target="_blank" class="btn btn-primary btn-sm">Ver PDF</a></div>` : ''}
    <div style="display:flex;gap:10px;margin-top:16px;padding-top:16px;border-top:1px solid var(--border)">
      <button class="btn btn-primary btn-sm" onclick="closeModal('modal-detail');openWF(${idx})">⇄ Alterar Estado</button>
      <button class="btn btn-ghost btn-sm" onclick="closeModal('modal-detail');editInv(${idx})">✎ Editar</button>
      <button class="btn btn-danger btn-sm" onclick="closeModal('modal-detail');delInv(${idx})">✕ Apagar</button>
    </div>`;
  refreshComprovavitoUI(inv);
  document.getElementById('modal-detail').classList.add('show');
}

async function uploadComprovativo(file) {
  if (!file || _currentDetailIdx === null) return;
  if (!config.sheetsKey) { toast('Configura o Google Sheets primeiro', 'error'); return; }

  const loading = document.getElementById('comp-loading');
  const upload  = document.getElementById('comprovativo-upload');
  loading.style.display = 'inline-flex';
  upload.style.display  = 'none';

  try {
    const inv      = invoices[_currentDetailIdx];
    const filename = `${inv.numero || 'fatura'}_${inv.entidade || ''}_comprovativo.pdf`.replace(/[^a-zA-Z0-9_\-\.]/g, '_');
    const result   = await uploadToDrive(file, filename);

    // Remove ficheiro antigo do Drive se existir
    if (inv.comprovavitoId) {
      await deleteFromDrive(inv.comprovavitoId).catch(() => {});
    }

    invoices[_currentDetailIdx].comprovavitoUrl = result.url;
    invoices[_currentDetailIdx].comprovavitoId  = result.id;
    save();
    refreshComprovavitoUI(invoices[_currentDetailIdx]);
    toast('Comprovativo carregado!', 'success');
  } catch (e) {
    loading.style.display = 'none';
    upload.style.display  = 'block';
    toast('Erro ao carregar: ' + e.message, 'error');
  }
}

async function removeComprovativo() {
  if (_currentDetailIdx === null) return;
  if (!confirm('Remover comprovativo?')) return;
  const inv = invoices[_currentDetailIdx];
  if (inv.comprovavitoId) {
    await deleteFromDrive(inv.comprovavitoId).catch(() => {});
  }
  delete invoices[_currentDetailIdx].comprovavitoUrl;
  delete invoices[_currentDetailIdx].comprovavitoId;
  save();
  refreshComprovavitoUI(invoices[_currentDetailIdx]);
  toast('Comprovativo removido');
}
