const express = require("express");
const { getSession } = require("../whatsapp/manager");
const {
  saveMedia,
  getCachedMedia,
} = require("../utils/mediaCache");
const multer = require("multer");
const fs = require("fs");
const { MessageMedia } = require("whatsapp-web.js");

function getMessageType(msg) {
  if (!msg.hasMedia) return "chat";
  if (msg.type === "image") return "image";
  if (msg.type === "video") return "video";
  if (msg.type === "audio" || msg.type === "ptt") return "audio";
  if (msg.type === "sticker") return "sticker";
  return "document";
}

const router = express.Router();

/**
 * LOGIN → QR CODE
 */
router.get("/:userId/login", (req, res) => {
  const { userId } = req.params;

  const session = getSession(userId);

  if (session.isReady()) {
    return res.json({
      status: "connected",
      message: "WhatsApp já conectado",
    });
  }

  const qr = session.getQr();

  if (!qr) {
    return res.json({
      status: "waiting",
      message: "QR ainda não disponível",
    });
  }

  res.json({
    status: "qr",
    qrCode: qr,
  });
});

function withTimeout(promise, ms, fallback = null) {
  return Promise.race([
    promise,
    new Promise((resolve) =>
      setTimeout(() => resolve(fallback), ms)
    ),
  ]);
}

/**
 * LISTAR CONVERSAS
 */
const profilePicCache = new Map();


router.get("/:userId/conversations", async (req, res) => {
  const { userId } = req.params;
  const session = getSession(userId);

  if (!session || !session.isReady()) {
    console.log(`[${userId}] ❌ WhatsApp não conectado`);
    return res.status(401).json({ error: "WhatsApp não conectado" });
  }

  console.log(`[${userId}] 🔄 Buscando conversas...`);

  try {
    const chats = await session.client.getChats();
    const total = chats.length;

    console.log(`[${userId}] 📦 ${total} chats encontrados`);

    const result = [];
    let processed = 0;

    const CONCURRENCY = 5;

    for (let i = 0; i < chats.length; i += CONCURRENCY) {
      const batch = chats.slice(i, i + CONCURRENCY);

      const batchResults = await Promise.all(
        batch.map(async (chat) => {
          const chatId = chat.id._serialized;

          let profilePicUrl = profilePicCache.get(chatId) ?? null;

          if (!profilePicCache.has(chatId)) {
            try {
              profilePicUrl = await withTimeout(
                session.client.getProfilePicUrl(chatId),
                3000, // ⏱️ 3s timeout
                null
              );

              profilePicCache.set(chatId, profilePicUrl);
            } catch (err) {
              console.error(
                `[${userId}] ⚠️ Avatar erro (${chatId}):`,
                err.message
              );
              profilePicCache.set(chatId, null);
            }
          }

          processed++;
          return {
            id: chatId,
            name: chat.name || chat.id.user,
            isGroup: chat.isGroup,
            unreadCount: chat.unreadCount ?? 0,
            profilePicUrl,
            lastMessage: chat.lastMessage
              ? {
                  body: chat.lastMessage.body,
                  timestamp: chat.lastMessage.timestamp,
                }
              : null,
          };
        })
      );

      result.push(...batchResults);

      const percent = Math.round((processed / total) * 100);
      console.log(
        `[${userId}] ⏳ Progresso: ${processed}/${total} (${percent}%)`
      );
    }

    console.log(`[${userId}] ✅ Conversas carregadas com sucesso`);
    res.json(result);
  } catch (err) {
    console.error(`[${userId}] ❌ Erro geral:`, err);
    res.status(500).json({ error: "Erro ao buscar conversas" });
  }
});


router.get("/:userId/messages/:chatId", async (req, res) => {
  const { userId, chatId } = req.params;
  const limit = Number(req.query.limit) || 50;

  const session = getSession(userId);

  if (!session || !session.isReady()) {
    return res.status(401).json({
      error: "WhatsApp não conectado",
    });
  }

  try {
    const chat = await session.client.getChatById(chatId);

    if (!chat) {
      return res.status(404).json({ error: "Chat não encontrado" });
    }

    const messages = await chat.fetchMessages({ limit });

    const result = messages.map((msg) => ({
      id: msg.id._serialized,
      body: msg.body,
      fromMe: msg.fromMe,
      timestamp: msg.timestamp,
      type: getMessageType(msg),
      hasMedia: msg.hasMedia,
      mediaUrl: msg.hasMedia
        ? `/whatsapp/${userId}/messages/${msg.id._serialized}/media`
        : null,
      author: msg.author || null,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar mensagens" });
  }
});

router.get("/:userId/messages/:messageId/media", async (req, res) => {
  const { userId, messageId } = req.params;

  const session = getSession(userId);
  if (!session || !session.isReady()) {
    return res.status(401).end();
  }

  try {
    // ✅ PRIORIDADE TOTAL AO CACHE
    const cached = getCachedMedia(messageId);
    if (cached) {
      res.setHeader("Content-Type", cached.mimetype);
      res.setHeader("Content-Disposition", "inline");
      return res.sendFile(cached.absolutePath);
    }

    // 🔽 Só tenta baixar se NÃO estiver no cache
    const msg = await session.client.getMessageById(messageId);

    if (!msg || !msg.hasMedia) {
      return res.status(404).end();
    }

    const media = await msg.downloadMedia();
    const saved = saveMedia(media, messageId);

    res.setHeader("Content-Type", saved.mimetype);
    res.setHeader("Content-Disposition", "inline");
    return res.sendFile(saved.absolutePath);
  } catch (err) {
    console.error("Erro ao servir mídia:", err);
    return res.status(500).end();
  }
});



router.post("/:userId/messages/:chatId", async (req, res) => {
  const { userId, chatId } = req.params;
  const { message } = req.body;

  const session = getSession(userId);

  if (!session || !session.isReady()) {
    return res.status(401).json({ error: "WhatsApp não conectado" });
  }

  if (!message) {
    return res.status(400).json({ error: "Mensagem inválida" });
  }

  try {
    const chat = await session.client.getChatById(chatId);
    await chat.sendMessage(message);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao enviar mensagem" });
  }
});

const upload = multer({ dest: "uploads/" });

router.post(
  "/:userId/messages/:chatId/media",
  upload.single("file"),
  async (req, res) => {
    const { userId, chatId } = req.params;
    const { caption } = req.body;
    const file = req.file;

    const session = getSession(userId);
    if (!session || !session.isReady()) {
      return res.status(401).json({ error: "WhatsApp não conectado" });
    }

    if (!file) {
      return res.status(400).json({ error: "Arquivo não enviado" });
    }

    try {
      const chat = await session.client.getChatById(chatId);

      const buffer = fs.readFileSync(file.path);
      const base64 = buffer.toString("base64");

      const media = new MessageMedia(
        file.mimetype,
        base64,
        file.originalname // 🔥 EXTREMAMENTE IMPORTANTE
      );

      // ✅ ENVIA E RECEBE A MENSAGEM REAL
      const sentMsg = await chat.sendMessage(media, { caption });

      // 🔥 AGORA SIM: salva no cache DEFINITIVO
      saveMedia(
        {
          data: fs.readFileSync(file.path, "base64"),
          mimetype: file.mimetype,
        },
        sentMsg.id._serialized
      );

      fs.unlinkSync(file.path); // limpa upload temporário

      res.json({
        success: true,
        messageId: sentMsg.id._serialized,
      });
    } catch (err) {
      console.error(err);
      res.status(500).json({ error: "Erro ao enviar mídia" });
    }
  }
);




module.exports = router;
