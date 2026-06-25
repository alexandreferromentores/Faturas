// ─── pdf.js ───────────────────────────────────────────────────────────────────
// Upload de PDF, parser local para Recibo Verde (AT) e fallback via API.

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
  }
  document.getElementById('loading-ext').classList.remove('show');
}

// ─── Parser local: Recibo Verde (AT) ─────────────────────────────────────────
// Funciona com Fatura-Recibo emitida pelo Portal das Finanças.
// Extrai campos por padrões de texto fixos do layout da AT.
// Para adicionar suporte a outros tipos, cria uma função parseXxx(text)
// e chama-a em handleFile antes do fallback para API.
function parseReciboVerde(text) {
  // Número da fatura: "FR ATSIRE01FR/22" dentro de <...>
  const numMatch = text.match(/<([^>]+)>/);
  const numero   = numMatch ? numMatch[1].trim() : '';

  // Data de emissão: "emitida em DD/MM/AAAA"
  const emissaoMatch = text.match(/emitida em (\d{2}\/\d{2}\/\d{4})/i);
  const emissao      = emissaoMatch ? emissaoMatch[1] : '';

  // Prestador (fornecedor): nome depois de "NOME" na secção do transmitente
  const prestadorMatch = text.match(/DADOS DO TRANSMITENTE[\s\S]*?NOME\s+([A-ZÀÁÂÃÄÇÉÊÍÓÔÕÚÜ][^\n]+)/i);
  const entidade       = prestadorMatch ? prestadorMatch[1].trim() : '';

  // NIF do prestador: "NIF) - 169277895"
  const nifMatch = text.match(/NIF\s*[\-–]\s*(\d{9})/i);
  const nif      = nifMatch ? nifMatch[1] : '';

  // Helper para extrair valor monetário após um label
  const parseVal = label => {
    const m = text.match(new RegExp(label + '[\\s\\S]*?([\\d.,]+)\\s*€', 'i'));
    return m ? m[1].replace(/\./g, '').replace(',', '.') : '';
  };

  const base = parseVal('Valor il[ií]quido');

  // IVA — linha de totais
  const ivaMatch = text.match(/\bIVA\b\s+([\d.,]+)\s*€/i);
  const iva      = ivaMatch ? ivaMatch[1].replace(/\./g, '').replace(',', '.') : '';

  // Total a pagar (já com retenção IRS descontada) ou Total do Documento
  const totalPagarMatch = text.match(/TOTAL A PAGAR\s+([\d.,]+)\s*€/i);
  const totalDocMatch   = text.match(/TOTAL DO DOCUMENTO\s+([\d.,]+)\s*€/i);
  const total = totalPagarMatch
    ? totalPagarMatch[1].replace(/\./g, '').replace(',', '.')
    : totalDocMatch
      ? totalDocMatch[1].replace(/\./g, '').replace(',', '.')
      : '';

  return { numero, entidade, nif, emissao, vencimento: '', base, iva, total };
}

// ─── Leitura de texto do PDF (sem biblioteca externa) ────────────────────────
// Funciona para PDFs digitais. Não funciona com PDFs scaneados (imagens).
function readPDFText(file) {
  return new Promise((res, rej) => {
    const reader = new FileReader();
    reader.onload = e => {
      const bytes = new Uint8Array(e.target.result);
      let str = '';
      for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
      // Extrai strings entre parênteses (formato interno PDF)
      const chunks = [];
      const re = /\(([^)\\]*(?:\\.[^)\\]*)*)\)/g;
      let m;
      while ((m = re.exec(str)) !== null) {
        const t = m[1]
          .replace(/\\n/g,  '\n')
          .replace(/\\r/g,  '\r')
          .replace(/\\t/g,  '\t')
          .replace(/\\\\/g, '\\')
          .replace(/\\([^nrt\\()])/g, '$1');
        if (t.trim().length > 0) chunks.push(t);
      }
      res(chunks.join('\n'));
    };
    reader.onerror = rej;
    reader.readAsArrayBuffer(file);
  });
}

function toBase64(file) {
  return new Promise((res, rej) => {
    const r = new FileReader();
    r.onload = () => res(r.result.split(',')[1]);
    r.onerror = rej;
    r.readAsDataURL(file);
  });
}

// ─── Extração via API (fallback para outros tipos de fatura) ──────────────────
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

// ─── Preenche o formulário com os dados extraídos ─────────────────────────────
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

// ─── Verifica duplicado ───────────────────────────────────────────────────────
function checkDuplicate(data) {
  const num = (data.numero   || '').trim().toLowerCase();
  const ent = (data.entidade || '').trim().toLowerCase();
  if (!num && !ent) return;
  const dup = invoices.find(i =>
    (num && (i.numero   || '').trim().toLowerCase() === num) ||
    (ent && (i.entidade || '').trim().toLowerCase() === ent && data.emissao && i.emissao === data.emissao)
  );
  if (dup) document.getElementById('dup-warn').style.display = 'block';
}

// ─── Guarda fatura vinda do PDF ───────────────────────────────────────────────
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
