const axios = require('axios');
const formidable = require('formidable');
const fs = require('fs');
const FormData = require('form-data');
const conf = require('../config');

async function uploadToCatbox(filePath, fileName) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', fs.createReadStream(filePath), fileName);

  if (conf.USERHASH) {
    form.append('userhash', conf.USERHASH);
  }

  const response = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 120000,
  });

  const result = (response.data || '').toString().trim();
  if (!result.startsWith('https://')) {
    throw new Error(result || 'Upload gagal');
  }
  return result;
}

async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const form = formidable({
      maxFileSize: conf.MAX_FILE_SIZE,
      keepExtensions: true,
    });

    const [fields, files] = await form.parse(req);
    const file = files.file?.[0];

    if (!file) {
      return res.status(400).json({ error: 'Tidak ada file yang diupload' });
    }

    const link = await uploadToCatbox(file.filepath, file.originalFilename || 'file');

    try { fs.unlinkSync(file.filepath); } catch (e) {}

    return res.status(200).json({
      success: true,
      url: link,
      filename: file.originalFilename,
      size: file.size,
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({
      success: false,
      error: err.message || 'Upload gagal',
    });
  }
}

handler.config = {
  api: {
    bodyParser: false,
  },
};

module.exports = handler;
