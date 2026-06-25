// ─── invoices.js ──────────────────────────────────────────────────────────────
// Lógica de faturas: criar, editar, apagar e workflow de estados.

// ─── Construtor de fatura ─────────────────────────────────────────────────────
function buildInv(fields) {
  return {
    id: Date.now() + Math.random(),
    addedAt: new Date().toISOString(),
    ...fields,
    pastaId: fields.pastaId ? Number(fields.pastaId) : null,
  };
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
    document.getElementById('m-base').value     = inv.base       || '';
    document.getElementById('m-iva').value      = inv.iva        || '';
    document.getElementById('m-total').value    = inv.total      || '';
    document.getElementById('m-estado').value   = inv.estado     || 'pendente';
    document.getElementById('m-pasta').value    = inv.pastaId    || '';
    document.getElementById('m-notas').value    = inv.notas      || '';
  } else {
    document.getElementById('m-edit-id').value = '';
    ['m-ent','m-nif','m-num','m-emissao','m-venc','m-base','m-iva','m-total','m-notas']
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
    base:       document.getElementById('m-base').value,
    iva:        document.getElementById('m-iva').value,
    total:      document.getElementById('m-total').value,
    estado:     document.getElementById('m-estado').value,
    pastaId:    document.getElementById('m-pasta').value
                  ? Number(document.getElementById('m-pasta').value) : null,
    notas:      document.getElementById('m-notas').value,
  };

  if (!fields.entidade.trim()) { toast('Preenche a entidade', 'error'); return; }

  if (editIdxRaw !== '') {
    invoices[parseInt(editIdxRaw)] = { ...invoices[parseInt(editIdxRaw)], ...fields };
    toast('Fatura atualizada!', 'success');
  } else {
    // Verificação de duplicado
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

// ─── Pastas ───────────────────────────────────────────────────────────────────
let selectedPastaCor = 0;

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
