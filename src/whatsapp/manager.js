const path = require("path");
const fs = require("fs");
const createWhatsAppClient = require("./createClient");

const sessions = new Map();

/**
 * Retorna sessão existente ou cria nova
 */
function getSession(userId) {
  if (sessions.has(userId)) {
    const existing = sessions.get(userId);
    if (existing && typeof existing.isActive === "function" && !existing.isActive()) {
      sessions.delete(userId);
    }
  }
  if (!sessions.has(userId)) {
    const session = createWhatsAppClient(userId, {
      onInvalidated: async () => {
        await removeSession(userId);
      },
    });
    sessions.set(userId, session);
  }
  return sessions.get(userId);
}

/**
 * Remove sessão (logout)
 */
async function removeSession(userId) {
  const session = sessions.get(userId);
  if (session) {
    try {
      await session.client.logout();
    } catch (err) {
      console.error(`[${userId}] Falha ao fazer logout`, err);
      await session.client.destroy();
    }
    sessions.delete(userId);
  }

  const authPath = path.resolve(
    "./.wwebjs_auth",
    `session-${userId}`
  );
  await fs.promises.rm(authPath, {
    recursive: true,
    force: true,
  });
}

module.exports = {
  getSession,
  removeSession,
};
