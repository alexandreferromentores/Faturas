// ─── invoices.js ───────────────────────────────────────────────
// ─── invoices.js ──────────────────────────────────────────────────────────────
// CRUD de faturas, workflow de estados, pastas e comprovativos.

// ─── Apagar fatura ────────────────────────────────────────────────────────────
async function delInv(idx) {
  const inv = invoices[idx];
  const confirmed = await confirmDialog(
    `Apagar a fatura <strong>${inv.numero || inv.entidade}</strong>?<br><br>
     Esta acção não pode ser desfeita. A fatura será removida da app e do Google Sheets.`
  );
  if (!confirmed) return;

  // Apaga ficheiros do Drive se existirem
  if (inv.faturaId) deleteFromDrive(inv.faturaId).catch(() => {});
  if (inv.comprovavitoId) deleteFromDrive(inv.comprovavitoId).catch(() => {});

  // Apaga do Sheets
  if (config.sheetsKey && inv.id) sheetsDeleteRow(inv.id).catch(() => {});

  invoices.splice(idx, 1);
  save();
  renderForn(); renderCli();
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
      .forEach(id => { const el = document.getElementById(id); if(el) el.value = ''; });
    document.getElementById('m-estado').value = 'pendente';
    document.getElementById('m-pasta').value  = '';
  }
  openModal('modal-manual');
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
    if (checkDuplicateFields(fields)) return;
    invoices.push(buildInv(fields));
    toast('Fatura adicionada!', 'success');
  }

  save();
  closeModal('modal-manual');
  nav(tipo === 'cliente' ? 'clientes' : 'fornecedores');
}

// ─── Verificação de duplicado ─────────────────────────────────────────────────
function checkDuplicateFields(fields) {
  const num = (fields.numero   || '').trim().toLowerCase();
  const ent = (fields.entidade || '').trim().toLowerCase();
  if (!num && !ent) return false;
  const dup = invoices.find(i =>
    (num && (i.numero || '').trim().toLowerCase() === num) ||
    (ent && (i.entidade || '').trim().toLowerCase() === ent && fields.emissao && i.emissao === fields.emissao)
  );
  if (dup) {
    showDuplicateAlert(`Fatura <strong>${dup.numero || dup.entidade}</strong> já existe com a mesma data de emissão.`);
    return true;
  }
  return false;
}

// ─── Detalhe de fatura ────────────────────────────────────────────────────────
let _currentDetailIdx = null;

function viewInv(idx) {
  _currentDetailIdx = idx;
  const inv = invoices[idx];
  const p   = getPasta(inv.pastaId);

  document.getElementById('detail-title').textContent = inv.entidade || '—';
  document.getElementById('detail-body').innerHTML = `
    <div class="detail-grid">
      <div class="detail-field"><div class="detail-label">Número</div><div class="detail-val mono">${inv.numero || '—'}</div></div>
      <div class="detail-field"><div class="detail-label">Tipo</div><div class="detail-val">${isClient(inv) ? '👤 Cliente' : '🏢 Fornecedor'}</div></div>
      <div class="detail-field"><div class="detail-label">NIF</div><div class="detail-val mono">${inv.nif || '—'}</div></div>
      <div class="detail-field"><div class="detail-label">Estado</div><div class="detail-val">${estadoBadge(inv)} ${dueBadge(inv)}</div></div>
      <div class="detail-field"><div class="detail-label">Data de Emissão</div><div class="detail-val">${inv.emissao || '—'}</div></div>
      <div class="detail-field"><div class="detail-label">Data de Vencimento</div><div class="detail-val">${inv.vencimento || '—'}</div></div>
      ${inv.descritivo ? `<div class="detail-field full"><div class="detail-label">Descritivo</div><div class="detail-val" style="white-space:normal;line-height:1.5">${inv.descritivo}</div></div>` : ''}
      <div class="detail-field"><div class="detail-label">Valor Ilíquido</div><div class="detail-val mono">${inv.base ? fmt(inv.base) : '—'}</div></div>
      <div class="detail-field"><div class="detail-label">IVA</div><div class="detail-val mono">${inv.iva ? fmt(inv.iva) : '—'}</div></div>
      ${inv.retencao ? `<div class="detail-field"><div class="detail-label">Retenção IRS</div><div class="detail-val mono">${fmt(inv.retencao)}</div></div>` : ''}
      ${inv.totalDoc ? `<div class="detail-field"><div class="detail-label">Total Documento</div><div class="detail-val mono">${fmt(inv.totalDoc)}</div></div>` : ''}
      <div class="detail-field"><div class="detail-label">Total a Pagar</div><div class="detail-val mono" style="font-size:18px;font-weight:700;color:var(--accent)">${fmt(inv.total)}</div></div>
      ${p ? `<div class="detail-field"><div class="detail-label">Pasta</div><div class="detail-val"><span class="folder-chip" style="background:${p.cor.bg};color:${p.cor.text};border-color:${p.cor.border}">${p.icon} ${p.nome}</span></div></div>` : ''}
      ${inv.notas ? `<div class="detail-field full"><div class="detail-label">Notas</div><div class="detail-val" style="color:var(--muted)">${inv.notas}</div></div>` : ''}
      ${inv.dataPagamento ? `<div class="detail-field"><div class="detail-label">Data de Pagamento</div><div class="detail-val">${inv.dataPagamento}</div></div>` : ''}
    </div>
    ${inv.faturaUrl ? `
      <div class="detail-pdf-row">
        <div style="display:flex;align-items:center;gap:8px"><span style="font-size:18px">📄</span><div><div style="font-size:13px;font-weight:600">PDF da Fatura</div><div style="font-size:11px;color:var(--muted)">Guardado no Google Drive</div></div></div>
        <a href="${inv.faturaUrl}" target="_blank" class="btn btn-primary btn-sm">Ver PDF</a>
      </div>` : ''}
    <div class="detail-actions">
      <button class="btn btn-primary btn-sm" onclick="closeModal('modal-detail');openWF(${idx})">⇄ Alterar Estado</button>
      <button class="btn btn-ghost btn-sm" onclick="closeModal('modal-detail');editInv(${idx})">✎ Editar</button>
      <button class="btn btn-danger btn-sm" onclick="closeModal('modal-detail');delInv(${idx})">✕ Apagar</button>
    </div>`;

  refreshComprovavitoUI(inv);
  openModal('modal-detail');
}

// ─── Comprovativo ─────────────────────────────────────────────────────────────
function refreshComprovavitoUI(inv) {
  const existente = document.getElementById('comprovativo-existente');
  const upload    = document.getElementById('comprovativo-upload');
  const link      = document.getElementById('comprovativo-link');
  const loading   = document.getElementById('comp-loading');
  if (!existente) return;
  if (loading) loading.style.display = 'none';
  if (inv.comprovavitoUrl) {
    existente.style.display = 'block';
    if (upload) upload.style.display = 'none';
    if (link) link.href = inv.comprovavitoUrl;
  } else {
    existente.style.display = 'none';
    if (upload) upload.style.display = 'block';
  }
}

async function uploadComprovativo(file) {
  if (!file || _currentDetailIdx === null) return;
  if (!config.sheetsKey) { toast('Configura o Google Sheets primeiro', 'error'); return; }
  const loading = document.getElementById('comp-loading');
  const upload  = document.getElementById('comprovativo-upload');
  if (loading) loading.style.display = 'inline-flex';
  if (upload)  upload.style.display  = 'none';
  try {
    const inv      = invoices[_currentDetailIdx];
    const filename = `${(inv.numero || 'fatura').replace(/[^a-zA-Z0-9_-]/g,'_')}_${(inv.entidade||'').replace(/[^a-zA-Z0-9_-]/g,'_').slice(0,20)}_comprovativo.pdf`;
    const result   = await uploadToDrive(file, filename);
    if (inv.comprovavitoId) deleteFromDrive(inv.comprovavitoId).catch(() => {});
    invoices[_currentDetailIdx].comprovavitoUrl = result.url;
    invoices[_currentDetailIdx].comprovavitoId  = result.id;
    save();
    refreshComprovavitoUI(invoices[_currentDetailIdx]);
    toast('Comprovativo carregado!', 'success');
  } catch (e) {
    if (loading) loading.style.display = 'none';
    if (upload)  upload.style.display  = 'block';
    toast('Erro ao carregar: ' + e.message, 'error');
  }
}

async function removeComprovativo() {
  if (_currentDetailIdx === null) return;
  const ok = await confirmDialog('Remover o comprovativo de pagamento?');
  if (!ok) return;
  const inv = invoices[_currentDetailIdx];
  if (inv.comprovavitoId) deleteFromDrive(inv.comprovavitoId).catch(() => {});
  delete invoices[_currentDetailIdx].comprovavitoUrl;
  delete invoices[_currentDetailIdx].comprovavitoId;
  save();
  refreshComprovavitoUI(invoices[_currentDetailIdx]);
  toast('Comprovativo removido');
}

// ─── Pastas ───────────────────────────────────────────────────────────────────
let selectedPastaCor    = 0;
let _pastaReturnSelect  = null;

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
  openModal('modal-pasta');
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
  pastas.push({ id: Date.now(), nome, icon: document.getElementById('p-icon').value, cor: PASTA_CORES[selectedPastaCor] });
  save();
  closeModal('modal-pasta');
  renderPastas();
  ['ff-pasta', 'cf-pasta'].forEach(populatePastaFilter);
  ['f-pasta', 'm-pasta'].forEach(populatePastaSelect);
  if (_pastaReturnSelect) {
    const newPasta = pastas[pastas.length - 1];
    const sel = document.getElementById(_pastaReturnSelect);
    if (sel) { populatePastaSelect(_pastaReturnSelect); sel.value = String(newPasta.id); }
    _pastaReturnSelect = null;
  }
  toast('Pasta criada!', 'success');
}

async function delPasta(idx) {
  const p  = pastas[idx];
  const ct = invoices.filter(i => i.pastaId === p.id).length;
  const msg = ct > 0
    ? `A pasta <strong>${p.nome}</strong> tem <strong>${ct} fatura${ct !== 1 ? 's' : ''}</strong>.<br><br>Ao apagar, as faturas ficarão sem pasta mas não serão eliminadas.`
    : `Apagar a pasta <strong>${p.nome}</strong>?`;
  const ok = await confirmDialog(msg);
  if (!ok) return;
  invoices = invoices.map(i => i.pastaId === p.id ? { ...i, pastaId: null } : i);
  pastas.splice(idx, 1);
  save();
  renderPastas();
  toast('Pasta apagada');
}

// ─── Workflow ─────────────────────────────────────────────────────────────────
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
  openModal('modal-wf');
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
