const express = require("express");
const { getSession } = require("../whatsapp/manager");

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
      type: msg.type,
      hasMedia: msg.hasMedia,
      author: msg.author || null,
    }));

    res.json(result);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Erro ao buscar mensagens" });
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



module.exports = router;
