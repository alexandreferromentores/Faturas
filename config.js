// ─── drive.js ────────────────────────────────────────────────────────────────
// Google Drive: upload e gestão de PDFs e comprovativos.

// ─── Google Drive: upload de ficheiros ────────────────────────────────────────
// ID da pasta partilhada no Google Drive pessoal
const DRIVE_FOLDER_ID = '1ixLRPks-cemMB1f5SfvWp16IamA0FvTO';

async function getDriveFolderId() {
  return DRIVE_FOLDER_ID;
}

async function uploadToDrive(file, filename) {
  const token    = await getSheetsToken();
  if (!token) throw new Error('Sem autenticação');
  const folderId = await getDriveFolderId();
  if (!folderId) throw new Error('Não foi possível criar pasta no Drive');

  // Upload multipart
  const metadata = JSON.stringify({ name: filename, parents: [folderId] });
  const boundary = 'faturas_boundary_' + Date.now();
  const fileData  = await file.arrayBuffer();

  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    fileData,
    `\r\n--${boundary}--`,
  ]);

  const resp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink',
    {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token, 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    }
  );
  if (!resp.ok) { const e = await resp.json(); throw new Error(e.error?.message || 'Erro Drive'); }
  const result = await resp.json();

  // Torna o ficheiro público para visualização
  await fetch(`https://www.googleapis.com/drive/v3/files/${result.id}/permissions`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  return { id: result.id, url: result.webViewLink };
}

async function deleteFromDrive(fileId) {
  const token = await getSheetsToken();
  if (!token) return;
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + token },
  });
}
