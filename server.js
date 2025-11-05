// ====== Imports ======
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
ffmpeg.setFfmpegPath(ffmpegPath.path);

import express from "express";
import fs from "fs";
import path from "path";
import cors from "cors";

const app = express();
const PORT = process.env.PORT || 3000;

// ====== Middleware ======
app.use(cors());
app.use(express.json({ limit: "10mb" }));

// ====== Homepage ======
app.get("/", (req, res) => {
  res.send("Hello from the ESP32 backend!");
});

// ====== Upload Route ======
app.post("/upload", (req, res) => {
  const imageData = req.body.image;
  if (!imageData) {
    return res.status(400).json({ error: "No image data received" });
  }

  // remove Base64 header
  const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  // save file
  const fileName = `photo_${Date.now()}.jpg`;
  const uploadDir = path.join(process.cwd(), "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });
  const filePath = path.join(uploadDir, fileName);
  fs.writeFileSync(filePath, buffer);

  console.log(`✅ Image saved: ${fileName}`);
  res.json({ message: "Image received", fileName });
});

// ====== Public Uploads ======
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ====== Make Video Route ======
app.get("/make-video", (req, res) => {
  const folder = path.join(process.cwd(), "uploads");
  const files = fs.readdirSync(folder)
    .filter(f => f.endsWith(".jpg"))
    .sort();

  if (files.length === 0) {
    return res.status(400).json({ error: "No images found to make a video." });
  }

  // create list for ffmpeg
  const listFile = path.join(folder, "frames.txt");
  const fileList = files.map(f => `file '${path.join(folder, f)}'`).join("\n");
  fs.writeFileSync(listFile, fileList);

  const output = path.join(folder, `clip_${Date.now()}.mp4`);

  ffmpeg()
    .input(listFile)
    .inputOptions(["-f concat", "-safe 0"])
    .outputOptions(["-vf", "fps=5", "-pix_fmt", "yuv420p"])
    .save(output)
    .on("end", () => {
      console.log("✅ Video created:", output);
      res.json({ message: "Video created", url: `/uploads/${path.basename(output)}` });
    })
    .on("error", (err) => {
      console.error("❌ FFmpeg error:", err);
      res.status(500).json({ error: err.message });
    });
});

// ====== Start Server ======
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
