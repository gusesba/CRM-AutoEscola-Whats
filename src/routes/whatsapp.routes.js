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

/**
 * LISTAR CONVERSAS
 */
router.get("/:userId/conversations", async (req, res) => {
  const { userId } = req.params;
  const session = getSession(userId);

  if (!session.isReady()) {
    return res.status(401).json({
      error: "WhatsApp não conectado",
    });
  }

  try {
    const chats = await session.client.getChats();

    const result = chats.map((chat) => ({
      id: chat.id._serialized,
      name: chat.name || chat.id.user,
      isGroup: chat.isGroup,
      unreadCount: chat.unreadCount,
      lastMessage: chat.lastMessage
        ? {
            body: chat.lastMessage.body,
            timestamp: chat.lastMessage.timestamp,
          }
        : null,
    }));

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
