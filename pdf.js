// ─── pdf.js ───────────────────────────────────────────────────────────────────
// Upload de PDF, parser local para Recibo Verde (AT) e fallback via API.
// Usa PDF.js (Mozilla) para extracção de texto fiável.

// PDF.js é carregado via CDN no index.html — não precisa de instalação.
// Versão usada: 3.x (legacy build compatível com browsers modernos)

// ─── Drag & drop ──────────────────────────────────────────────────────────────
function dragOver(e) { e.preventDefault(); document.getElementById('upload-zone').classList.add('drag'); }
function dragLeave()  { document.getElementById('upload-zone').classList.remove('drag'); }
function dropFile(e) {
  e.preventDefault();
  dragLeave();
  const f = e.dataTransfer.files[0];
  if (f?.type === 'application/pdf') handleFile(f);
  else toast('Apenas PDF', 'error');
}

// ─── Entrada principal ────────────────────────────────────────────────────────
// Guarda referência ao ficheiro PDF actual para preview
let _currentPDFFile = null;

async function handleFile(file) {
  document.getElementById('loading-ext').classList.add('show');
  document.getElementById('extracted-box').style.display = 'none';
  document.getElementById('dup-warn').style.display = 'none';

  // Mostra pré-visualização do PDF
  _currentPDFFile = file;
  showPdfPreview(file);

  try {
    const text = await readPDFText(file);
    let data = parseReciboVerde(text);

    if (!data.entidade && !data.numero) {
      toast('Não foi possível extrair os dados automaticamente. Preenche manualmente.', 'warn');
    }

    fillExtracted(data);
    checkDuplicate(data);
    document.getElementById('extracted-box').style.display = 'block';
  } catch (e) {
    toast('Erro na extração: ' + e.message, 'error');
    console.error(e);
  }
  document.getElementById('loading-ext').classList.remove('show');
}

// ─── Leitura de texto via PDF.js ──────────────────────────────────────────────
async function readPDFText(file) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const pages = [];
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const content = await page.getTextContent();
    // Junta os items de texto com espaço, preservando quebras de linha por bloco
    const pageText = content.items.map(item => item.str).join(' ');
    pages.push(pageText);
  }
  return pages.join('\n');
}

// ─── Parser local: Recibo Verde (AT) ─────────────────────────────────────────
function parseReciboVerde(text) {
  var numM    = text.match(/<(FR [A-Z0-9/]+)>/i);
  var numero  = numM ? numM[1].trim() : '';

  var emM     = text.match(/emitida em (\d{2}\/\d{2}\/\d{4})/i);
  var emissao = emM ? emM[1] : '';

  var vencimento = '';
  if (emissao) {
    var p  = emissao.split('/').map(Number);
    var dt = new Date(p[2], p[1]-1, p[0]);
    dt.setDate(dt.getDate() + 60);
    vencimento = String(dt.getDate()).padStart(2,'0') + '/' + String(dt.getMonth()+1).padStart(2,'0') + '/' + dt.getFullYear();
  }

  var nifM    = text.match(/(\d{9}) TRAVESSA/i);
  var nif     = nifM ? nifM[1] : '';

  var entM    = text.match(/\d{2}\/\d{2}\/\d{4} {2}([A-Z][A-Z &.-]+?) {2,}(?:MENTORES|ASSOCIA)/i);
  var entidade = entM ? entM[1].replace(/ +/g, ' ').trim() : '';

  var descM    = text.match(/TAXA IVA ([\s\S]+?) 1 Unidade/i);
  var descritivo = descM ? descM[1].replace(/ +/g, ' ').trim() : '';

  var baseM    = text.match(/Valor il[íi]quido +(\d+,\d{2})/i);
  var ivaM     = text.match(/TOTAIS DO DOCUMENTO[\s\S]*?\bIVA\b +(\d+,\d{2})/i);
  var retM     = text.match(/TOTAIS DO DOCUMENTO[\s\S]*?Reten[^\n]*?(\d+,\d{2}) /i);
  var totDocM  = text.match(/[^S]TOTAL DO DOCUMENTO +(\d+,\d{2})/i);
  var totPagM  = text.match(/TOTAL A PAGAR +(\d+,\d{2})/i);

  var fix = function(v) { return v ? v.replace(',', '.') : ''; };

  return {
    numero:     numero,
    entidade:   entidade,
    nif:        nif,
    emissao:    emissao,
    vencimento: vencimento,
    descritivo: descritivo,
    base:       fix(baseM   ? baseM[1]   : ''),
    iva:        fix(ivaM    ? ivaM[1]    : ''),
    retencao:   fix(retM    ? retM[1]    : ''),
    totalDoc:   fix(totDocM ? totDocM[1] : ''),
    total:      fix(totPagM ? totPagM[1] : '') || fix(totDocM ? totDocM[1] : ''),
  };
}

// ─── toBase64 (para fallback API) ────────────────────────────────────────────
function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ─── Preenche formulário ──────────────────────────────────────────────────────
function fillExtracted(data) {
  document.getElementById('f-num').value      = data.numero     || '';
  document.getElementById('f-ent').value      = data.entidade   || '';
  document.getElementById('f-nif').value      = data.nif        || '';
  document.getElementById('f-emissao').value  = data.emissao    || '';
  document.getElementById('f-venc').value     = data.vencimento || '';
  document.getElementById('f-desc').value     = data.descritivo || '';
  document.getElementById('f-base').value     = data.base       || '';
  document.getElementById('f-iva').value      = data.iva        || '';
  document.getElementById('f-retencao').value = data.retencao   || '';
  document.getElementById('f-totalDoc').value = data.totalDoc   || '';
  document.getElementById('f-total').value    = data.total      || '';
  document.getElementById('f-estado').value   = 'pendente';
}

// ─── Verificação de duplicado ─────────────────────────────────────────────────
function checkDuplicate(data) {
  const num = (data.numero   || '').trim().toLowerCase();
  const ent = (data.entidade || '').trim().toLowerCase();
  if (!num && !ent) return;
  const dup = invoices.find(i =>
    (num && (i.numero   || '').trim().toLowerCase() === num) ||
    (ent && (i.entidade || '').trim().toLowerCase() === ent
          && data.emissao && i.emissao === data.emissao)
  );
  if (dup) document.getElementById('dup-warn').style.display = 'block';
}

// ─── Guardar fatura do PDF ────────────────────────────────────────────────────
function saveFromPDF() {
  const tipo = document.getElementById('upload-tipo')?.value || document.querySelector('[name=novo-tipo]:checked')?.value || 'fornecedor';
  const inv  = buildInv({
    tipo,
    numero:     document.getElementById('f-num').value,
    entidade:   document.getElementById('f-ent').value,
    nif:        document.getElementById('f-nif').value,
    emissao:    document.getElementById('f-emissao').value,
    vencimento: document.getElementById('f-venc').value,
    base:       document.getElementById('f-base').value,
    iva:        document.getElementById('f-iva').value,
    total:      document.getElementById('f-total').value,
    estado:     document.getElementById('f-estado').value,
    pastaId:    document.getElementById('f-pasta').value || null,
    notas:      document.getElementById('f-notas').value,
  });
  invoices.push(inv);
  save();
  toast('Fatura guardada!', 'success');
  resetUpload();
  closeModal('modal-upload');
  nav(tipo === 'cliente' ? 'clientes' : 'fornecedores');
}

// ─── Pré-visualização do PDF ──────────────────────────────────────────────────
function showPdfPreview(file) {
  const url     = URL.createObjectURL(file);
  const preview = document.getElementById('pdf-preview');
  const empty   = document.getElementById('pdf-preview-empty');
  if (preview) { preview.src = url; preview.style.display = 'block'; }
  if (empty)   empty.style.display = 'none';
}

function closePdfPreview() {
  const preview = document.getElementById('pdf-preview');
  const empty   = document.getElementById('pdf-preview-empty');
  if (preview) { preview.src = ''; preview.style.display = 'none'; }
  if (empty)   empty.style.display = 'block';
}

function resetUpload() {
  document.getElementById('file-inp').value = '';
  document.getElementById('extracted-box').style.display = 'none';
  document.getElementById('dup-warn').style.display = 'none';
  closePdfPreview();
  _currentPDFFile = null;
}
