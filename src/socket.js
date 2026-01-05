let io;

function initSocket(server) {
  io = require("socket.io")(server, {
    cors: {
      origin: "*",
    },
  });

  io.on("connection", (socket) => {
    console.log("Cliente conectado:", socket.id);

    socket.on("join", (userId) => {
      socket.join(userId);
    });

    socket.on("disconnect", () => {
      console.log("Cliente desconectado:", socket.id);
    });
  });
}

function emitMessage(userId, payload) {
  if (io) {
    io.to(userId).emit("message", payload);
  }
}

module.exports = { initSocket, emitMessage };
