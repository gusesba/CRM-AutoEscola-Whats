const { Client, LocalAuth } = require("whatsapp-web.js");
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

  client.initialize();

  return {
    client,
    getQr: () => qrCodeBase64,
    isReady: () => ready,
  };
}

module.exports = createWhatsAppClient;
