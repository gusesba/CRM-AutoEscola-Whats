const express = require("express");
const cors = require("cors");
const whatsappRoutes = require("./routes/whatsapp.routes");

const app = express();

app.use(cors());
app.use(express.json());

app.use("/whatsapp", whatsappRoutes);

module.exports = app;
