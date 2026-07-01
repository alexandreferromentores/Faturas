// ─── drive.js ────────────────────────────────────────────────────────────────
// Google Drive: upload e gestão de PDFs e comprovativos.

const DRIVE_FOLDER_ID = '1ixLRPks-cemMB1f5SfvWp16IamA0FvTO';

async function uploadToDrive(file, filename) {
  const token = await getSheetsToken();
  if (!token) throw new Error('Sem autenticação');

  const metadata = JSON.stringify({
    name: filename,
    parents: [DRIVE_FOLDER_ID],
  });

  const boundary = 'faturas_boundary_' + Date.now();
  const fileData = await file.arrayBuffer();

  const body = new Blob([
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`,
    `--${boundary}\r\nContent-Type: application/pdf\r\n\r\n`,
    fileData,
    `\r\n--${boundary}--`,
  ]);

  // supportsAllDrives=true permite upload para pastas partilhadas com Service Accounts
  const resp = await fetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,webViewLink&supportsAllDrives=true',
    {
      method: 'POST',
      headers: {
        Authorization: 'Bearer ' + token,
        'Content-Type': `multipart/related; boundary=${boundary}`,
      },
      body,
    }
  );

  if (!resp.ok) {
    const e = await resp.json();
    throw new Error(e.error?.message || 'Erro Drive');
  }

  const result = await resp.json();

  // Torna o ficheiro público para visualização
  await fetch(`https://www.googleapis.com/drive/v3/files/${result.id}/permissions?supportsAllDrives=true`, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'reader', type: 'anyone' }),
  });

  return { id: result.id, url: result.webViewLink };
}

async function deleteFromDrive(fileId) {
  const token = await getSheetsToken();
  if (!token) return;
  await fetch(`https://www.googleapis.com/drive/v3/files/${fileId}?supportsAllDrives=true`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + token },
  });
}
