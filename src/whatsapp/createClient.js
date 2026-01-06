const { Client, LocalAuth } = require("whatsapp-web.js");
const { emitMessage } = require("../socket");
const qrcode = require("qrcode");

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
    console.error(`[${userId}] Falha auth`, msg);
  });

  client.on("message_create", (msg) => {
    if (!msg.fromMe) return; // 🔑 chave da correção
    console.log("Mensagem enviada");
    emitMessage(userId, {
      chatId: msg.to,
      message: {
        id: msg.id._serialized,
        body: msg.body,
        fromMe: true,
        timestamp: msg.timestamp,
        type: msg.type,
        hasMedia: msg.hasMedia,
      },
    });
  });

  client.on("message", (msg) => {
    console.log("Nova mensagem recebida");
    emitMessage(userId, {
      chatId: msg.from,
      message: {
        id: msg.id._serialized,
        body: msg.body,
        fromMe: false,
        timestamp: msg.timestamp,
        type: msg.type,
        hasMedia: msg.hasMedia,
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
