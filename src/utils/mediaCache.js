const fs = require("fs");
const path = require("path");

const CACHE = new Map();

function saveMedia(media, messageId) {
  const buffer = Buffer.from(media.data, "base64");
  const ext = media.mimetype.split("/")[1] || "bin";

  let folder = "documents";
  if (media.mimetype.startsWith("image/")) folder = "images";
  else if (media.mimetype.startsWith("video/")) folder = "videos";
  else if (media.mimetype.startsWith("audio/")) folder = "audios";
  else if (media.mimetype === "image/webp") folder = "stickers";

  const dir = path.join(__dirname, "..", "media", folder);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  const filename = `${messageId}.${ext}`;
  const absolutePath = path.join(dir, filename);

  if (!fs.existsSync(absolutePath)) {
    fs.writeFileSync(absolutePath, buffer);
  }

  CACHE.set(messageId, {
    absolutePath,
    mimetype: media.mimetype,
  });

  return { absolutePath, mimetype: media.mimetype };
}

function getCachedMedia(messageId) {
  return CACHE.get(messageId) || null;
}

module.exports = {
  saveMedia,
  getCachedMedia,
};
