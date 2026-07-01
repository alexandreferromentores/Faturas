// ─── drive.js ────────────────────────────────────────────────────────────────
// Cloudinary: upload e gestão de PDFs e comprovativos.

const CLOUDINARY_CLOUD_NAME   = 'cjzaofkl';
const CLOUDINARY_UPLOAD_PRESET = 'ml_default';

async function uploadToDrive(file, filename) {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  formData.append('public_id', 'invoiced-faturas/' + filename.replace('.pdf', ''));
  formData.append('resource_type', 'raw');
  formData.append('access_mode', 'public');

  const resp = await fetch(
    `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/raw/upload`,
    { method: 'POST', body: formData }
  );

  if (!resp.ok) {
    const e = await resp.json();
    throw new Error(e.error?.message || 'Erro Cloudinary');
  }

  const result = await resp.json();
  return { id: result.public_id, url: result.secure_url };
}

async function deleteFromDrive(fileId) {
  // Delete via browser não é suportado sem expor o API Secret
  console.log('Cloudinary: ficheiro', fileId, 'marcado para remoção manual.');
}
