// ─── pdf.js ───────────────────────────────────────────────────────────────────
// Upload de PDF, parser local para Recibo Verde (AT) e fallback via API.
// Usa PDF.js (Mozilla) para extracção de texto fiável.

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

// ─── Entrada principal (MODO DEBUG) ──────────────────────────────────────────
// Mostra o texto extraído pelo PDF.js para diagnóstico.
// Quando o parser estiver a funcionar, substituir por a versão normal.
async function handleFile(file) {
  document.getElementById('loading-ext').classList.add('show');
  document.getElementById('extracted-box').style.display = 'none';
  document.getElementById('dup-warn').style.display = 'none';
  try {
    const text = await readPDFText(file);

    // DEBUG: mostra o texto extraído numa caixa temporária
    let debugBox = document.getElementById('debug-box');
    if (!debugBox) {
      debugBox = document.createElement('div');
      debugBox.id = 'debug-box';
      debugBox.style.cssText = 'background:#f0f0f0;border:1px solid #ccc;padding:16px;margin:16px 0;font-family:monospace;font-size:11px;white-space:pre-wrap;max-height:400px;overflow-y:auto;border-radius:6px';
      document.getElementById('page-nova').appendChild(debugBox);
    }
    debugBox.textContent = '=== TEXTO EXTRAÍDO DO PDF ===\n\n' + text;

  } catch (e) {
    toast('Erro: ' + e.message, 'error');
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
    const pageText = content.items.map(item => item.str).join(' ');
    pages.push(pageText);
  }
  return pages.join('\n');
}

// ─── Parser local: Recibo Verde (AT) ─────────────────────────────────────────
function parseReciboVerde(text) {
  const numMatch = text.match(/<([^>]{3,40})>/);
  const numero   = numMatch ? numMatch[1].trim() : '';

  const emissaoMatch = text.match(/emitida em\s+(\d{2}\/\d{2}\/\d{4})/i);
  const emissao      = emissaoMatch ? emissaoMatch[1] : '';

  const prestadorMatch = text.match(/NOME\s+([A-ZÀÁÂÃÄÇÉÊÍÓÔÕÚÜ][^]+?)\s+DOM[IÍ]C[IÍ]LIO/i);
  const entidade       = prestadorMatch ? prestadorMatch[1].replace(/\s+/g, ' ').trim() : '';

  const nifMatch = text.match(/(?:NIF|FISCAL)\s*[)\-–:]\s*(\d{9})/i);
  const nif      = nifMatch ? nifMatch[1] : '';

  const money = pattern => {
    const m = text.match(new RegExp(pattern + '[^\\d]*([\\d]+[.,][\\d]{2})', 'i'));
    return m ? m[1].replace('.', '').replace(',', '.') : '';
  };

  const base  = money('Valor il[ií]quido');
  const ivaTotsMatch = text.match(/\bIVA\b\s+([\d]+[.,][\d]{2})\s*€?/i);
  const iva   = ivaTotsMatch ? ivaTotsMatch[1].replace('.', '').replace(',', '.') : '';
  const total = money('TOTAL A PAGAR') || money('TOTAL DO DOCUMENTO');

  return { numero, entidade, nif, emissao, vencimento: '', base, iva, total };
}

// ─── toBase64 ─────────────────────────────────────────────────────────────────
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
  const tipo = document.querySelector('[name=novo-tipo]:checked').value;
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
  nav(tipo === 'cliente' ? 'clientes' : 'fornecedores');
}

function resetUpload() {
  document.getElementById('file-inp').value = '';
  document.getElementById('extracted-box').style.display = 'none';
  document.getElementById('dup-warn').style.display = 'none';
}
