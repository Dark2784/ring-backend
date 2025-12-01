// ====== Imports ======
import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";

import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "@ffmpeg-installer/ffmpeg";
ffmpeg.setFfmpegPath(ffmpegPath.path);

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

  // Remove Base64 header
  const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  // Ensure uploads folder exists
  const uploadDir = path.join(process.cwd(), "uploads");
  fs.mkdirSync(uploadDir, { recursive: true });

  // Save file
  const fileName = `photo_${Date.now()}.jpg`;
  const filePath = path.join(uploadDir, fileName);
  fs.writeFileSync(filePath, buffer);

  console.log(`✅ Image saved: ${fileName}`);
  res.json({ message: "Image received", fileName });
});

// ====== Public Uploads ======
app.use("/uploads", express.static(path.join(process.cwd(), "uploads")));

// ====== Make Video Route (Render FIXED) ======
app.get("/make-video", (req, res) => {
  const folder = path.join(process.cwd(), "uploads");

  // Load all JPG images
  const files = fs.readdirSync(folder)
    .filter(f => f.toLowerCase().endsWith(".jpg"))
    .sort();

  console.log("📁 Found files:", files);

  if (files.length < 2) {
    return res.status(400).json({ error: "Need at least 2 images to make video." });
  }

  // Create FFmpeg frame list (absolute UNIX paths)
  const listFile = path.join(folder, "frames.txt");
  const listContent = files
    .map(f => `file '${path.join(folder, f).replace(/\\/g, "/")}'`)
    .join("\n");

  fs.writeFileSync(listFile, listContent);

  console.log("📝 frames.txt written:\n", listContent);

  const output = path.join(folder, `clip_${Date.now()}.mp4`);
  console.log("🎬 Output video:", output);

  ffmpeg()
    .input(listFile)
    .inputOptions(["-f", "concat", "-safe", "0"])
    .outputOptions(["-vf", "fps=6", "-pix_fmt", "yuv420p"])
    .save(output)
    .on("start", cmd => console.log("🔧 FFmpeg command:", cmd))
    .on("end", () => {
      console.log("🎥 Video created");
      res.json({ message: "Video created", url: `/uploads/${path.basename(output)}` });
    })
    .on("error", err => {
      console.error("❌ FFmpeg error:", err);
      res.status(500).json({ error: err.message });
    });
});

// ====== Start Server ======
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});
