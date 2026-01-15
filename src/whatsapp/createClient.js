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


function createWhatsAppClient(userId) {
  let qrCodeBase64 = null;
  let ready = false;

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
    ready = true;
    qrCodeBase64 = null;
    console.log(`[${userId}] WhatsApp conectado`);
  });

  client.on("auth_failure", (msg) => {
    ready = false;
    console.error(`[${userId}] Falha auth`, msg);
  });

  client.on("disconnected", (reason) => {
    ready = false;
    console.warn(`[${userId}] WhatsApp desconectado`, reason);
  });

  client.on("message_create", async (msg) => {
    if (!msg.fromMe) return; // 🔑 chave da correção
    console.log("Mensagem enviada");

    let mediaUrl = null;
    if (msg.hasMedia) {
    // ⚠️ você NÃO deve mandar base64 pelo socket
      // Salve em disco / S3 / CDN
      mediaUrl = `/whatsapp/${userId}/messages/${msg.id._serialized}/media`;
    }
  
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
  });

  client.on("message", async (msg) => {    
    console.log("Nova mensagem recebida");

    let mediaUrl = null;

    if (msg.hasMedia) {

      // ⚠️ você NÃO deve mandar base64 pelo socket
      // Salve em disco / S3 / CDN
      mediaUrl = `/whatsapp/${userId}/messages/${msg.id._serialized}/media`;
    }

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
  });

  client.initialize();

  return {
    client,
    getQr: () => qrCodeBase64,
    isReady: () => ready,
  };
}

module.exports = createWhatsAppClient;
