const { Client, LocalAuth } = require("whatsapp-web.js");
const { emitMessage } = require("../socket");
const qrcode = require("qrcode");
const { saveMedia } = require("../utils/mediaCache");

function getMessageType(msg) {
  if (!msg.hasMedia) return "chat";
  if (msg.type === "image") return "image";
  if (msg.type === "video") return "video";
  if (msg.type === "audio" || msg.type === "ptt") return "audio";
  if (msg.type === "sticker") return "sticker";
  return "document";
}

function isStatusBroadcast(msg) {
  return msg.from === "status@broadcast" || msg.to === "status@broadcast";
}

async function getChatName(msg) {
  try {
    const chat = await msg.getChat();
    if (!chat) return null;
    if (chat.isGroup) return chat.name;
    return (
      chat.name ||
      chat?.contact?.pushname ||
      chat?.contact?.name ||
      msg.notifyName ||
      null
    );
  } catch (err) {
    console.warn("Falha ao obter nome do chat", err);
    return null;
  }
}

async function sendBackupMessage(payload) {
  const backupUrl = process.env.WHATSAPP_BACKUP_URL;

  if (!backupUrl) {
    console.warn("WHATSAPP_BACKUP_URL não definido. Backup ignorado.");
    return;
  }

  if (typeof fetch !== "function") {
    console.error("fetch não disponível no ambiente. Backup ignorado.");
    return;
  }

  try {
    const response = await fetch(backupUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      console.error(
        `Falha ao enviar backup (${response.status}). ${responseText}`
      );
    }
  } catch (err) {
    console.error("Erro ao enviar backup para o backend", err);
  }
}


function createWhatsAppClient(userId, options = {}) {
  const { onInvalidated } = options;
  let qrCodeBase64 = null;
  let ready = false;
  let active = true;
  let invalidated = false;

  const invalidate = (reason) => {
    if (invalidated) return;
    invalidated = true;
    ready = false;
    active = false;
    if (typeof onInvalidated === "function") {
      Promise.resolve(onInvalidated(reason)).catch((err) => {
        console.error(`[${userId}] Falha ao invalidar sessão`, err);
      });
    } else {
      client.destroy().catch((err) => {
        console.error(`[${userId}] Falha ao destruir cliente`, err);
      });
    }
  };

  const client = new Client({
    authStrategy: new LocalAuth({
      clientId: userId, // 🔥 chave do multi-usuário
    }),
    puppeteer: {
      headless: true,
      args: ["--no-sandbox", "--disable-setuid-sandbox"],
    },
  });

  client.on("qr", async (qr) => {
    qrCodeBase64 = await qrcode.toDataURL(qr);
    ready = false;
    console.log(`[${userId}] QR Code gerado`);
  });

  client.on("ready", () => {
    if (invalidated) return;
    ready = true;
    active = true;
    qrCodeBase64 = null;
    console.log(`[${userId}] WhatsApp conectado`);
  });

  client.on("auth_failure", (msg) => {
    ready = false;
    console.error(`[${userId}] Falha auth`, msg);
    invalidate("auth_failure");
  });

  client.on("disconnected", (reason) => {
    ready = false;
    console.warn(`[${userId}] WhatsApp desconectado`, reason);
    invalidate(reason);
  });

  client.on("message_create", async (msg) => {
    if (!msg.fromMe) return; // 🔑 chave da correção
    if (isStatusBroadcast(msg)) return;
    console.log("Mensagem enviada");

    let mediaUrl = null;
    if (msg.hasMedia) {
    // ⚠️ você NÃO deve mandar base64 pelo socket
      // Salve em disco / S3 / CDN
      mediaUrl = `/whatsapp/${userId}/messages/${msg.id._serialized}/media`;
    }

    const chatName = await getChatName(msg);
  
    emitMessage(userId, {
      chatId: msg.to,
      message: {
        id: msg.id._serialized,
        body: msg.body,
        fromMe: true,
        timestamp: msg.timestamp,
        type: getMessageType(msg),
        hasMedia: msg.hasMedia,
        mediaUrl,
      },
    });

    await sendBackupMessage({
      userId,
      chatId: msg.to,
      chatName,
      message: {
        id: msg.id._serialized,
        body: msg.body,
        fromMe: true,
        timestamp: msg.timestamp,
        type: getMessageType(msg),
        hasMedia: msg.hasMedia,
        mediaUrl,
      },
    });
  });

  client.on("message", async (msg) => {    
    if (isStatusBroadcast(msg)) return;
    console.log("Nova mensagem recebida");

    let mediaUrl = null;

    if (msg.hasMedia) {

      // ⚠️ você NÃO deve mandar base64 pelo socket
      // Salve em disco / S3 / CDN
      mediaUrl = `/whatsapp/${userId}/messages/${msg.id._serialized}/media`;
    }

    const chatName = await getChatName(msg);

    emitMessage(userId, {
      chatId: msg.from,
      message: {
        id: msg.id._serialized,
        body: msg.body,
        fromMe: false,
        timestamp: msg.timestamp,
        type: getMessageType(msg),
        hasMedia: msg.hasMedia,
        mediaUrl,
      },
    });

    await sendBackupMessage({
      userId,
      chatId: msg.from,
      chatName,
      message: {
        id: msg.id._serialized,
        body: msg.body,
        fromMe: false,
        timestamp: msg.timestamp,
        type: getMessageType(msg),
        hasMedia: msg.hasMedia,
        mediaUrl,
      },
    });
  });

  client.initialize();

  return {
    client,
    getQr: () => qrCodeBase64,
    isReady: () => ready,
    isActive: () => active,
  };
}

module.exports = createWhatsAppClient;
