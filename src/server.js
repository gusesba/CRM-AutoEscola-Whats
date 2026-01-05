const http = require("http");
const express = require("express");
const cors = require("cors");

const whatsappRoutes = require("./routes/whatsapp.routes");
const { initSocket } = require("./socket");

const app = express();
app.use(cors());
app.use(express.json());
app.use("/whatsapp", whatsappRoutes);

const server = http.createServer(app);
initSocket(server);

server.listen(3001, () => {
  console.log("Servidor rodando na porta 3001");
});
