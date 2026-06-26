// ─── sheets.js ────────────────────────────────────────────────────────────────
// Integração com Google Sheets via API REST.
// Usa JWT assinado com a chave da Service Account para autenticação.
// Não requer servidor — corre inteiramente no browser.

const SHEET_ID      = '16nMMi6Nhlxi8IQz2zqFdm226rAfFJwM4Jnnry4cPEQs';
const SHEET_FATURAS = 'Faturas';
const SHEET_PASTAS  = 'Pastas';

const HEADERS_FATURAS = [
  'id','addedAt','tipo','numero','entidade','nif','emissao','vencimento',
  'descritivo','base','iva','retencao','totalDoc','total','estado',
  'dataPagamento','pastaId','notas'
];
const HEADERS_PASTAS = ['id','nome','icon','cor'];

let sheetsToken    = null;
let sheetsTokenExp = 0;
let syncPending    = false;

// ─── Obter token OAuth via JWT ────────────────────────────────────────────────
async function getSheetsToken() {
  if (sheetsToken && Date.now() < sheetsTokenExp - 60000) return sheetsToken;
  if (!config.sheetsKey) return null;

  try {
    const key  = JSON.parse(config.sheetsKey);
    const now  = Math.floor(Date.now() / 1000);
    const claim = {
      iss: key.client_email,
      scope: 'https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive',
      aud: 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    };

    const header  = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    const payload = btoa(JSON.stringify(claim)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    const msg     = header + '.' + payload;

    // Importa a chave privada RSA
    const pemBody = key.private_key.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
    const derBuf  = Uint8Array.from(atob(pemBody), c => c.charCodeAt(0));
    const cryptoKey = await crypto.subtle.importKey(
      'pkcs8', derBuf,
      { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
      false, ['sign']
    );

    const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, new TextEncoder().encode(msg));
    const sig    = btoa(String.fromCharCode(...new Uint8Array(sigBuf))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    const jwt    = msg + '.' + sig;

    // Troca JWT por access token
    const resp = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`,
    });
    const data = await resp.json();
    if (!data.access_token) throw new Error('Token inválido: ' + JSON.stringify(data));
    sheetsToken    = data.access_token;
    sheetsTokenExp = Date.now() + (data.expires_in * 1000);
    return sheetsToken;
  } catch (e) {
    console.error('Erro ao obter token Sheets:', e);
    return null;
  }
}

// ─── Inicializar folhas se não existirem ──────────────────────────────────────
async function sheetsInit() {
  const token = await getSheetsToken();
  if (!token) return;

  // Verifica quais folhas existem
  const r    = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}`, { headers: { Authorization: 'Bearer ' + token } });
  const meta = await r.json();
  const existing = (meta.sheets || []).map(s => s.properties.title);

  // Cria as folhas que faltam via batchUpdate
  const toCreate = [];
  if (!existing.includes(SHEET_FATURAS)) toCreate.push(SHEET_FATURAS);
  if (!existing.includes(SHEET_PASTAS))  toCreate.push(SHEET_PASTAS);

  if (toCreate.length > 0) {
    await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}:batchUpdate`, {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        requests: toCreate.map(title => ({ addSheet: { properties: { title } } }))
      }),
    });
    console.log('[Sheets] batchUpdate resposta:', JSON.stringify(batchData).slice(0, 300));
  }

  // Escreve cabeçalhos se as folhas foram criadas agora
  if (!existing.includes(SHEET_FATURAS)) {
    await sheetsWrite(SHEET_FATURAS, [HEADERS_FATURAS]);
  }
  if (!existing.includes(SHEET_PASTAS)) {
    await sheetsWrite(SHEET_PASTAS, [HEADERS_PASTAS]);
  }
}

// ─── Ler dados da Sheet ───────────────────────────────────────────────────────
async function sheetsRead(sheet) {
  const token = await getSheetsToken();
  if (!token) return null;
  const r = await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${sheet}`,
    { headers: { Authorization: 'Bearer ' + token } }
  );
  const data = await r.json();
  return data.values || [];
}

// ─── Escrever todos os dados (substitui tudo) ─────────────────────────────────
async function sheetsWrite(sheet, rows) {
  const token = await getSheetsToken();
  if (!token) return;
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${sheet}?valueInputOption=RAW`,
    {
      method: 'PUT',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range: sheet, majorDimension: 'ROWS', values: rows }),
    }
  );
}

// ─── Append linha ─────────────────────────────────────────────────────────────
async function sheetsAppendRow(sheet, row, token, isHeader = false) {
  const t = token || await getSheetsToken();
  if (!t) return;
  await fetch(
    `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${sheet}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + t, 'Content-Type': 'application/json' },
      body: JSON.stringify({ range: sheet, majorDimension: 'ROWS', values: [row] }),
    }
  );
}

// ─── Converter fatura para linha ──────────────────────────────────────────────
function invToRow(inv) {
  return HEADERS_FATURAS.map(h => {
    const v = inv[h];
    return v === null || v === undefined ? '' : String(v);
  });
}

function rowToInv(row) {
  const inv = {};
  HEADERS_FATURAS.forEach((h, i) => { inv[h] = row[i] || ''; });
  inv.pastaId = inv.pastaId ? Number(inv.pastaId) : null;
  return inv;
}

function pastaToRow(p) {
  return [String(p.id), p.nome, p.icon, JSON.stringify(p.cor)];
}

function rowToPasta(row) {
  try {
    return { id: Number(row[0]), nome: row[1] || '', icon: row[2] || '📁', cor: JSON.parse(row[3] || '{}') };
  } catch { return null; }
}

// ─── Sincronizar: carregar da Sheet ──────────────────────────────────────────
async function sheetsLoad() {
  const token = await getSheetsToken();
  if (!token) { console.error('[Sheets] Falhou a obter token'); return false; }

  try {
    await sheetsInit();

    const [rowsFat, rowsPas] = await Promise.all([
      sheetsRead(SHEET_FATURAS),
      sheetsRead(SHEET_PASTAS),
    ]);


    // Faturas (ignora cabeçalho)
    if (rowsFat && rowsFat.length > 1) {
      invoices = rowsFat.slice(1).map(rowToInv).filter(i => i.id);
      localStorage.setItem('fv_invoices', JSON.stringify(invoices));
    }

    // Pastas (ignora cabeçalho)
    if (rowsPas && rowsPas.length > 1) {
      pastas = rowsPas.slice(1).map(rowToPasta).filter(Boolean);
      localStorage.setItem('fv_pastas', JSON.stringify(pastas));
    }

    return true;
  } catch (e) {
    console.error('Erro ao carregar da Sheet:', e);
    return false;
  }
}

// ─── Sincronizar: guardar na Sheet ────────────────────────────────────────────
async function sheetsSave() {
  const token = await getSheetsToken();
  if (!token) {
    // Sem Sheets configurado, guarda só em localStorage
    localStorage.setItem('fv_invoices', JSON.stringify(invoices));
    localStorage.setItem('fv_pastas',   JSON.stringify(pastas));
    return;
  }

  // Guarda localmente primeiro (imediato)
  localStorage.setItem('fv_invoices', JSON.stringify(invoices));
  localStorage.setItem('fv_pastas',   JSON.stringify(pastas));

  // Sincroniza com Sheets em background
  if (syncPending) return;
  syncPending = true;
  setTimeout(async () => {
    try {
      const rowsFat = [HEADERS_FATURAS, ...invoices.map(invToRow)];
      const rowsPas = [HEADERS_PASTAS,  ...pastas.map(pastaToRow)];
      await Promise.all([
        sheetsWrite(SHEET_FATURAS, rowsFat),
        sheetsWrite(SHEET_PASTAS,  rowsPas),
      ]);
      showSyncStatus('✓ Sincronizado');
    } catch (e) {
      console.error('Erro ao guardar na Sheet:', e);
      showSyncStatus('⚠ Erro ao sincronizar');
    }
    syncPending = false;
  }, 1000); // debounce 1s para não spammar
}

function showSyncStatus(msg) {
  let el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = msg;
  setTimeout(() => { if (el) el.textContent = ''; }, 3000);
}
