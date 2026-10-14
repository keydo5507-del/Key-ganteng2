const { Telegraf, Markup } = require('telegraf');
const axios = require('axios');
const FormData = require('form-data');
const fs = require('fs');
const path = require('path');
const config = require('../config');

const bot = new Telegraf(config.BOT_TOKEN);
const TEMP_DIR = '/tmp';

async function uploadToCatbox(filePath) {
  const form = new FormData();
  form.append('reqtype', 'fileupload');
  form.append('fileToUpload', fs.createReadStream(filePath));

  if (config.USERHASH) {
    form.append('userhash', config.USERHASH);
  }

  const response = await axios.post('https://catbox.moe/user/api.php', form, {
    headers: form.getHeaders(),
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
    timeout: 120000,
  });

  const result = (response.data || '').toString().trim();
  if (!result.startsWith('https://')) throw new Error(result || 'Upload gagal');
  return result;
}

function getFileInfo(msg) {
  if (msg.photo) {
    const p = msg.photo[msg.photo.length - 1];
    return { fileId: p.file_id, name: `${p.file_id}.jpg`, size: p.file_size || 0, type: 'photo' };
  }
  if (msg.video) return { fileId: msg.video.file_id, name: msg.video.file_name || 'video.mp4', size: msg.video.file_size || 0, type: 'video' };
  if (msg.document) return { fileId: msg.document.file_id, name: msg.document.file_name || 'file', size: msg.document.file_size || 0, type: 'document' };
  if (msg.audio) return { fileId: msg.audio.file_id, name: msg.audio.file_name || 'audio.mp3', size: msg.audio.file_size || 0, type: 'audio' };
  if (msg.voice) return { fileId: msg.voice.file_id, name: 'voice.ogg', size: msg.voice.file_size || 0, type: 'voice' };
  if (msg.animation) return { fileId: msg.animation.file_id, name: msg.animation.file_name || 'anim.gif', size: msg.animation.file_size || 0, type: 'animation' };
  if (msg.sticker) return { fileId: msg.sticker.file_id, name: 'sticker.webp', size: msg.sticker.file_size || 0, type: 'sticker' };
  return null;
}

bot.on(['photo', 'video', 'document', 'audio', 'voice', 'animation', 'sticker'], async (ctx) => {
  let statusMsg, filePath;
  try {
    const info = getFileInfo(ctx.message);
    if (!info) return ctx.reply('❌ Jenis file tidak didukung');

    if (info.size > config.MAX_FILE_SIZE) {
      return ctx.reply('❌ File terlalu besar (maks 200MB)');
    }

    statusMsg = await ctx.reply('⏳ Mengunduh file...');

    const link = await ctx.telegram.getFileLink(info.fileId);
    filePath = path.join(TEMP_DIR, info.name);

    const res = await axios({ url: link.href, responseType: 'stream', timeout: 60000 });
    const writer = fs.createWriteStream(filePath);
    res.data.pipe(writer);
    await new Promise((r, j) => { writer.on('finish', r); writer.on('error', j); });

    await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, '📤 Mengupload ke Catbox...');

    const catboxUrl = await uploadToCatbox(filePath);
    try { fs.unlinkSync(filePath); } catch (e) {}

    await ctx.telegram.editMessageText(
      ctx.chat.id,
      statusMsg.message_id,
      null,
      `✅ Upload berhasil!\n\n🔗 ${catboxUrl}\n📁 ${info.type}`,
      Markup.inlineKeyboard([[Markup.button.callback('🗑 Hapus', `del_${statusMsg.message_id}`)]])
    );
  } catch (err) {
    console.error(err);
    if (filePath) try { fs.unlinkSync(filePath); } catch (e) {}
    const msg = `❌ Gagal: ${err.message}`;
    if (statusMsg) {
      try { await ctx.telegram.editMessageText(ctx.chat.id, statusMsg.message_id, null, msg); }
      catch (e) { await ctx.reply(msg); }
    } else {
      await ctx.reply(msg);
    }
  }
});

bot.action(/del_(\d+)/, async (ctx) => {
  try {
    await ctx.telegram.deleteMessage(ctx.chat.id, parseInt(ctx.match[1]));
    await ctx.answerCbQuery('Dihapus');
  } catch (e) {
    await ctx.answerCbQuery('Gagal');
  }
});

bot.start((ctx) => ctx.reply('Halo! Kirim foto/video/dokumen untuk diupload ke Catbox.\n\nAtau buka web uploader-nya juga ya!'));
bot.help((ctx) => ctx.reply('Kirim saja file ke bot ini, nanti dapat link Catbox-nya.'));

module.exports = async (req, res) => {
  try {
    if (req.method === 'POST') {
      await bot.handleUpdate(req.body);
    }
    res.status(200).send('OK');
  } catch (err) {
    console.error(err);
    res.status(500).send('Error');
  }
};
