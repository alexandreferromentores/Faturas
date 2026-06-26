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

    // Se o parser local não reconheceu o documento e há API key, usa IA
    if (!data.entidade && !data.numero && config.apiKey) {
      const b64 = await toBase64(file);
      data = await extractPDFApi(b64, config.apiKey);
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

  // Número: "<FR ATSIRE01FR/22>"
  const numMatch = text.match(/<(FR\s+[A-Z0-9/]+)>/i);
  const numero   = numMatch ? numMatch[1].trim() : '';

  // Data de emissão
  const emissaoMatch = text.match(/emitida em\s+(\d{2}\/\d{2}\/\d{4})/i);
  const emissao      = emissaoMatch ? emissaoMatch[1] : '';

  // Vencimento: emissão + 60 dias
  let vencimento = '';
  if (emissao) {
    const parts = emissao.split('/').map(Number);
    const dt = new Date(parts[2], parts[1] - 1, parts[0]);
    dt.setDate(dt.getDate() + 60);
    vencimento = String(dt.getDate()).padStart(2,'0') + '/' + String(dt.getMonth()+1).padStart(2,'0') + '/' + dt.getFullYear();
  }

  // NIF: 9 dígitos antes de "TRAVESSA"
  const nifMatch = text.match(/(\d{9})\s+TRAVESSA/i);
  const nif      = nifMatch ? nifMatch[1] : '';

  // Entidade: entre data de realização e "MENTORES"
  // Texto: "29/11/2024  ANTONIO MANUEL BORGES DIAS PEREIRA DE JESUS  MENTORES"
  const entMatch = text.match(/\d{2}\/\d{2}\/\d{4}\s+([A-Z\u00C0-\u024F][A-Z\u00C0-\u024F\s]+?)\s{2,}(?:MENTORES|ASSOCIA)/i);
  const entidade = entMatch ? entMatch[1].replace(/\s+/g, ' ').trim() : '';

  // Descritivo: entre "TAXA IVA" e "1 Unidade"
  const descMatch = text.match(/TAXA\s+IVA\s+([\s\S]+?)\s+1\s+Unidade/i);
  const descritivo = descMatch ? descMatch[1].replace(/\s+/g, ' ').trim() : '';

  // Helper monetário: "Label   500,00 €"
  const money = function(label) {
    const r = new RegExp(label + '\\s+([\\d]+,[\\d]{2})\\s*\u20ac', 'i');
    const m = text.match(r);
    return m ? m[1].replace(',', '.') : '';
  };

  const base     = money('Valor il[\u00ed\u00ed]quido');
  const retencao = money('Reten[c\u00e7][a\u00e3]o na fonte IRS');
  const totalDoc = money('TOTAL DO DOCUMENTO');
  const total    = money('TOTAL A PAGAR') || totalDoc;

  // IVA nos totais: "IVA   115,00 €  Imposto"
  const ivaMatch = text.match(/TOTAIS DO DOCUMENTO[\s\S]*?IVA\s+([\d]+,[\d]{2})\s*\u20ac/i);
  const iva      = ivaMatch ? ivaMatch[1].replace(',', '.') : '';

  return { numero, entidade, nif, emissao, vencimento, descritivo, base, iva, retencao, totalDoc, total };
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

// ─── Fallback: extracção via API Anthropic ────────────────────────────────────
async function extractPDFApi(b64, apiKey) {
  const resp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 1000,
      messages: [{ role: 'user', content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: b64 } },
        { type: 'text', text: 'Analisa esta fatura. Responde APENAS com JSON válido sem markdown:\n{"numero":"","entidade":"","nif":"","emissao":"DD/MM/AAAA","vencimento":"DD/MM/AAAA ou vazio","base":"valor numérico","iva":"valor numérico","total":"valor numérico"}' },
      ]}],
    }),
  });
  if (!resp.ok) { const e = await resp.json(); throw new Error(e.error?.message || 'Erro API'); }
  const d = await resp.json();
  return JSON.parse(d.content[0].text.replace(/```json|```/g, '').trim());
}

// ─── Preenche formulário ──────────────────────────────────────────────────────
function fillExtracted(data) {
  document.getElementById('f-num').value     = data.numero     || '';
  document.getElementById('f-ent').value     = data.entidade   || '';
  document.getElementById('f-nif').value     = data.nif        || '';
  document.getElementById('f-emissao').value = data.emissao    || '';
  document.getElementById('f-venc').value    = data.vencimento || '';
  document.getElementById('f-base').value    = data.base       || '';
  document.getElementById('f-iva').value     = data.iva        || '';
  document.getElementById('f-total').value   = data.total      || '';
  document.getElementById('f-estado').value  = 'pendente';
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
