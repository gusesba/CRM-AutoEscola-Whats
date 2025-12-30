const createWhatsAppClient = require("./createClient");

const sessions = new Map();

/**
 * Retorna sessão existente ou cria nova
 */
function getSession(userId) {
  if (!sessions.has(userId)) {
    const session = createWhatsAppClient(userId);
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
    await session.client.destroy();
    sessions.delete(userId);
  }
}

module.exports = {
  getSession,
  removeSession,
};
