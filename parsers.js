// ─── parsers.js ──────────────────────────────────────────────────────────────
// Parsers adicionais para tipos de fatura comuns em Portugal,
// além do Recibo Verde já suportado em pdf.js.
// Cada parser tenta reconhecer o seu formato; se não reconhecer, devolve null
// e o sistema tenta o próximo (ou cai para a API como último recurso).

// ─── Parser: Fatura genérica com layout "Total / IVA / Base" comum ──────────
function parseFaturaGenerica(text) {
  // Detecta layout típico de faturas de software de facturação (Moloni, InvoiceXpress, etc.)
  // Procura por padrões comuns: "Fatura FT", "Fatura-Recibo FR", número + data + total

  const numM = text.match(/\b(F[TCR]?\s?[A-Z]*\s?\d{4}\/\d+)\b/i) ||
               text.match(/\bN[º°]?\s*(?:de\s*)?(?:Fatura|Documento)[:\s]+([\w\/\-]+)/i);
  if (!numM) return null; // não reconhece este formato

  const numero = numM[1] || numM[0];

  // Data de emissão: vários formatos possíveis
  const dateM = text.match(/(?:Data(?:\s*de)?\s*(?:Emiss[ãa]o)?[:\s]+)(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i) ||
                text.match(/\b(\d{2}\/\d{2}\/\d{4})\b/);
  const emissao = dateM ? dateM[1].replace(/-/g, '/') : '';

  // Entidade — procura depois de "Cliente:" ou "Fornecedor:" ou similar, ou primeira linha em maiúsculas
  const entM = text.match(/(?:Cliente|Fornecedor|Adquirente)[:\s]+([A-ZÀ-Ú][^\n]{4,60})/i);
  const entidade = entM ? entM[1].trim() : '';

  // NIF — 9 dígitos próximos da palavra NIF/Contribuinte
  const nifM = text.match(/(?:NIF|N[º°]?\s*Contribuinte)[:\s]*(\d{9})/i);
  const nif = nifM ? nifM[1] : '';

  // Total — geralmente a última ocorrência de "Total" seguida de valor
  const totalMatches = [...text.matchAll(/Total(?:\s*(?:a\s*pagar|do\s*documento|geral))?[:\s]+([\d.,]+)\s*€?/gi)];
  const total = totalMatches.length
    ? totalMatches[totalMatches.length - 1][1].replace(/\./g, '').replace(',', '.')
    : '';

  // IVA
  const ivaM = text.match(/IVA(?:\s*\d+\s*%)?[:\s]+([\d.,]+)\s*€?/i);
  const iva = ivaM ? ivaM[1].replace(/\./g, '').replace(',', '.') : '';

  // Base / valor sem IVA
  const baseM = text.match(/(?:Base\s*Tribut[áa]vel|Valor\s*S\/?\s*IVA|Subtotal)[:\s]+([\d.,]+)\s*€?/i);
  const base = baseM ? baseM[1].replace(/\./g, '').replace(',', '.') : '';

  if (!numero && !total) return null;

  return {
    numero, entidade, nif, emissao, vencimento: '',
    descritivo: '', base, iva, retencao: '', totalDoc: total, total,
  };
}

// ─── Parser: Fatura de serviços públicos (EDP, água, gás, telecom) ───────────
function parseFaturaServicos(text) {
  // Layout típico: "Período de consumo", "Valor a pagar", número de cliente
  const isUtility = /EDP|Galp|NOS|MEO|Vodafone|Águas|EPAL|consumo/i.test(text);
  if (!isUtility) return null;

  const numM = text.match(/(?:N[º°]?\s*(?:de\s*)?Fatura)[:\s]+([\w\/\-]+)/i);
  const numero = numM ? numM[1] : '';

  const dateM = text.match(/(?:Data\s*(?:de\s*)?Emiss[ãa]o)?[:\s]*(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
  const emissao = dateM ? dateM[1].replace(/-/g, '/') : '';

  const vencM = text.match(/(?:Data\s*(?:Limite\s*)?(?:de\s*)?Pagamento|Vencimento)[:\s]+(\d{2}[\/\-]\d{2}[\/\-]\d{4})/i);
  const vencimento = vencM ? vencM[1].replace(/-/g, '/') : '';

  const totalM = text.match(/(?:Valor\s*a\s*Pagar|Total\s*a\s*Pagar)[:\s]+([\d.,]+)\s*€?/i);
  const total = totalM ? totalM[1].replace(/\./g, '').replace(',', '.') : '';

  // Identifica a entidade pela marca encontrada
  const brandM = text.match(/(EDP|Galp|NOS|MEO|Vodafone|Águas[\w\s]*|EPAL)/i);
  const entidade = brandM ? brandM[1] : '';

  if (!total) return null;

  return {
    numero, entidade, nif: '', emissao, vencimento,
    descritivo: 'Fatura de serviços', base: '', iva: '', retencao: '', totalDoc: total, total,
  };
}

// ─── Tentar todos os parsers disponíveis em sequência ────────────────────────
// Esta função substitui a chamada directa a parseReciboVerde em handleFile,
// tentando vários formatos antes de recorrer à API.
function tryAllParsers(text) {
  const parsers = [
    { name: 'Recibo Verde',    fn: typeof parseReciboVerde === 'function' ? parseReciboVerde : null },
    { name: 'Fatura Genérica', fn: parseFaturaGenerica },
    { name: 'Serviços Públicos', fn: parseFaturaServicos },
  ];

  for (const p of parsers) {
    if (!p.fn) continue;
    try {
      const result = p.fn(text);
      // Considera válido se conseguiu extrair pelo menos número ou entidade ou total
      if (result && (result.numero || result.entidade || result.total)) {
        console.log(`[Parser] Reconhecido como: ${p.name}`);
        return result;
      }
    } catch (e) {
      console.warn(`[Parser] Erro em ${p.name}:`, e.message);
    }
  }
  return null;
}

// ─── Hook: substitui o parser único pela cadeia de parsers ───────────────────
window.addEventListener('load', function hookMultiParser() {
  if (typeof window.handleFile !== 'function') {
    setTimeout(hookMultiParser, 100);
    return;
  }

  // Patch handleFile para usar tryAllParsers em vez de só parseReciboVerde
  const _origHandleFile = window.handleFile;
  window.handleFile = async function(file) {
    document.getElementById('loading-ext').classList.add('show');
    document.getElementById('extracted-box').style.display = 'none';
    document.getElementById('dup-warn').style.display = 'none';

    if (typeof _currentPDFFile !== 'undefined') window._currentPDFFile = file;
    if (typeof showPdfPreview === 'function') showPdfPreview(file);

    try {
      const text = await readPDFText(file);
      let data = tryAllParsers(text);

      if (!data) {
        data = { numero: '', entidade: '', nif: '', emissao: '', vencimento: '', descritivo: '', base: '', iva: '', retencao: '', totalDoc: '', total: '' };
        toast('Não foi possível extrair dados automaticamente. Preenche manualmente.', 'warn');
      }

      fillExtracted(data);

      if (data.entidade || data.descritivo) {
        const matched = typeof autoMatchPasta === 'function' ? autoMatchPasta(data.entidade || '', data.descritivo || '') : null;
        if (matched) {
          const sel = document.getElementById('f-pasta');
          if (sel) { populatePastaSelect('f-pasta'); sel.value = String(matched.id); }
          toast('Pasta sugerida: ' + matched.icon + ' ' + matched.nome, '');
        }
      }

      checkDuplicate(data);
      document.getElementById('extracted-box').style.display = 'block';
    } catch (e) {
      toast('Erro na extração: ' + e.message, 'error');
      console.error(e);
    }
    document.getElementById('loading-ext').classList.remove('show');
  };
});
