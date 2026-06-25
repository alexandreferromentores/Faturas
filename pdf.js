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

// ─── Entrada principal ────────────────────────────────────────────────────────
async function handleFile(file) {
  document.getElementById('loading-ext').classList.add('show');
  document.getElementById('extracted-box').style.display = 'none';
  document.getElementById('dup-warn').style.display = 'none';
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
    pages.push(content.items.map(item => item.str).join(' '));
  }
  return pages.join(' ');
}

// ─── Parser local: Recibo Verde (AT) ─────────────────────────────────────────
// Baseado no layout real extraído do PDF.js.
// O texto é uma linha contínua — os padrões reflectem isso.
function parseReciboVerde(text) {

  // ── Número da fatura ────────────────────────────────────────────────────────
  // Formato: "<FR ATSIRE01FR/22>"
  const numMatch = text.match(/<(FR\s+[^>]{2,40})>/i);
  const numero   = numMatch ? numMatch[1].trim() : '';

  // ── Data de emissão ─────────────────────────────────────────────────────────
  const emissaoMatch = text.match(/emitida em\s+(\d{2}\/\d{2}\/\d{4})/i);
  const emissao      = emissaoMatch ? emissaoMatch[1] : '';

  // ── Data de vencimento: emissão + 60 dias ───────────────────────────────────
  let vencimento = '';
  if (emissao) {
    const [d, m, y] = emissao.split('/').map(Number);
    const dt = new Date(y, m - 1, d);
    dt.setDate(dt.getDate() + 60);
    vencimento = `${String(dt.getDate()).padStart(2,'0')}/${String(dt.getMonth()+1).padStart(2,'0')}/${dt.getFullYear()}`;
  }

  // ── NIF do prestador ────────────────────────────────────────────────────────
  // O NIF do prestador aparece antes de "TRAVESSA" (morada do adquirente)
  // Formato: "SBR 169277895 TRAVESSA"
  const nifMatch = text.match(/\b(\d{9})\s+TRAVESSA/i);
  const nif      = nifMatch ? nifMatch[1] : '';

  // ── Prestador (fornecedor) ──────────────────────────────────────────────────
  // O nome aparece depois da data de realização dos serviços e antes de "MENTORES"
  // Formato: "29/11/2024  ANTONIO MANUEL BORGES DIAS PEREIRA DE JESUS  MENTORES"
  const dataRealizacao = emissao; // normalmente igual à data de emissão
  const prestMatch = text.match(
    new RegExp(dataRealizacao.replace(/\//g, '\\/') +
      '\\s+([A-ZÀÁÂÃÄÇÉÊÍÓÔÕÚÜ][A-ZÀÁÂÃÄÇÉÊÍÓÔÕÚÜ\\s]+?)\\s+(?:MENTORES|ASSOCIA)', 'i')
  );
  // Fallback: captura entre o NIF e "MENTORES"
  const prestFallback = text.match(
    /\b\d{9}\s+(?:TRAVESSA[^A-Z]*?)\s*([A-ZÀÁÂÃÄÇÉÊÍÓÔÕÚÜ][A-ZÀÁÂÃÄÇÉÊÍÓÔÕÚÜ\s]+?)\s+(?:MENTORES|ASSOCIA)/i
  );
  const entidade = prestMatch
    ? prestMatch[1].replace(/\s+/g, ' ').trim()
    : prestFallback
      ? prestFallback[1].replace(/\s+/g, ' ').trim()
      : '';

  // ── Descritivo ──────────────────────────────────────────────────────────────
  // Aparece depois de "TAXA IVA" e antes de "OUT -" ou similar
  // Formato: "TAXA IVA OUT - UFCD4552-Forestecort Serviço Serviços de formação (...)"
  const descMatch = text.match(/TAXA\s+IVA\s+([\w\s\-,.()\u00C0-\u024F]{10,200?}?)\s+(?:S\/IVA|C\/IVA|\d+,\d{2}\s*€)/i);
  const descritivo = descMatch ? descMatch[1].replace(/\s+/g, ' ').trim() : '';

  // ── Helper: extrai valor monetário após label ────────────────────────────────
  const money = (pattern) => {
    const m = text.match(new RegExp(pattern + '[^\\d]*([\\d]+[,.]\\d{2})', 'i'));
    return m ? m[1].replace(/\./g, '').replace(',', '.') : '';
  };

  // ── Valores ─────────────────────────────────────────────────────────────────
  const base     = money('Valor il[ií]quido');
  // IVA: apanhar o valor depois de "IVA" mas antes de "Imposto do Selo"
  const ivaMatch = text.match(/\bIVA\b\s+([\d]+[,.][\d]{2})\s*€\s*Imposto/i);
  const iva      = ivaMatch ? ivaMatch[1].replace(',', '.') : money('\\bIVA\\b[^%\\d]{0,10}(?!\\d+\\s*%)');
  const retencao = money('Reten[çc][aã]o na fonte IRS');
  const totalDoc = money('TOTAL DO DOCUMENTO');
  const total    = money('TOTAL A PAGAR') || totalDoc;

  return { numero, entidade, nif, emissao, vencimento, descritivo, base, iva, retencao, totalDoc, total };
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
        { type: 'text', text: 'Analisa esta fatura. Responde APENAS com JSON válido sem markdown:\n{"numero":"","entidade":"","nif":"","emissao":"DD/MM/AAAA","vencimento":"DD/MM/AAAA","descritivo":"","base":"valor numérico","iva":"valor numérico","retencao":"valor numérico","totalDoc":"valor numérico","total":"valor numérico"}' },
      ]}],
    }),
  });
  if (!resp.ok) { const e = await resp.json(); throw new Error(e.error?.message || 'Erro API'); }
  const d = await resp.json();
  return JSON.parse(d.content[0].text.replace(/```json|```/g, '').trim());
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
  const tipo = document.querySelector('[name=novo-tipo]:checked').value;
  const inv  = buildInv({
    tipo,
    numero:     document.getElementById('f-num').value,
    entidade:   document.getElementById('f-ent').value,
    nif:        document.getElementById('f-nif').value,
    emissao:    document.getElementById('f-emissao').value,
    vencimento: document.getElementById('f-venc').value,
    descritivo: document.getElementById('f-desc').value,
    base:       document.getElementById('f-base').value,
    iva:        document.getElementById('f-iva').value,
    retencao:   document.getElementById('f-retencao').value,
    totalDoc:   document.getElementById('f-totalDoc').value,
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
