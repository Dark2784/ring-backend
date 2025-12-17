import express from "express";
import cors from "cors";
import fs from "fs";
import path from "path";
import crypto from "crypto";

const app = express();
const PORT = process.env.PORT || 3000;

// ===== Config =====
const MEDIA_ROOT = path.join(process.cwd(), "media");
const CLIPS_ROOT = path.join(MEDIA_ROOT, "clips");

// bigger limit because frames can be large base64
app.use(cors());
app.use(express.json({ limit: "20mb" }));

// Ensure base folders exist
fs.mkdirSync(CLIPS_ROOT, { recursive: true });

// Serve media publicly
app.use("/media", express.static(MEDIA_ROOT));

// ===== Helpers =====
function nowIso() {
  return new Date().toISOString();
}

function makeClipId() {
  // short, unique, URL-safe
  return crypto.randomBytes(8).toString("hex");
}

function clipPaths(clipId) {
  const clipDir = path.join(CLIPS_ROOT, clipId);
  const framesDir = path.join(clipDir, "frames");
  const metaFile = path.join(clipDir, "clip.json");
  const audioFile = path.join(clipDir, "audio.wav"); // we’ll standardize to wav later
  const videoFile = path.join(clipDir, "clip.mp4");  // reserved for later
  return { clipDir, framesDir, metaFile, audioFile, videoFile };
}

function readMeta(metaFile) {
  if (!fs.existsSync(metaFile)) return null;
  return JSON.parse(fs.readFileSync(metaFile, "utf-8"));
}

function writeMeta(metaFile, meta) {
  fs.writeFileSync(metaFile, JSON.stringify(meta, null, 2));
}

function listFrames(framesDir) {
  if (!fs.existsSync(framesDir)) return [];
  return fs.readdirSync(framesDir)
    .filter(f => f.toLowerCase().endsWith(".jpg"))
    .sort();
}

// ===== Routes =====
app.get("/", (req, res) => {
  res.send("ESP32 Clip Backend is running.");
});

// Start a new clip (button press or motion)
app.post("/clip/start", (req, res) => {
  const { reason = "unknown", deviceId = "device-1" } = req.body || {};

  const clipId = makeClipId();
  const { clipDir, framesDir, metaFile } = clipPaths(clipId);

  fs.mkdirSync(framesDir, { recursive: true });

  const meta = {
    clipId,
    deviceId,
    reason,              // "button" | "motion" | etc
    startedAt: nowIso(),
    endedAt: null,
    frameCount: 0,
    hasAudio: false,
    hasVideo: false
  };

  writeMeta(metaFile, meta);

  res.json({
    message: "Clip started",
    clipId,
    uploadFrameUrl: `/clip/${clipId}/frame`,
    uploadAudioUrl: `/clip/${clipId}/audio`,
    endUrl: `/clip/${clipId}/end`
  });
});

// Upload one frame to a clip
// body: { image: "data:image/jpeg;base64,....", index?: number }
app.post("/clip/:clipId/frame", (req, res) => {
  const { clipId } = req.params;
  const { image, index } = req.body || {};

  if (!image) return res.status(400).json({ error: "Missing image" });

  const { framesDir, metaFile } = clipPaths(clipId);
  const meta = readMeta(metaFile);
  if (!meta) return res.status(404).json({ error: "Clip not found" });

  fs.mkdirSync(framesDir, { recursive: true });

  // Strip header if present
  const base64Data = image.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  // Use provided index if you want stable ordering from ESP32
  // else auto-increment based on meta.frameCount
  const nextIndex = Number.isInteger(index) ? index : (meta.frameCount + 1);
  const fileName = `frame_${String(nextIndex).padStart(6, "0")}.jpg`;
  const filePath = path.join(framesDir, fileName);

  fs.writeFileSync(filePath, buffer);

  meta.frameCount = Math.max(meta.frameCount, nextIndex);
  writeMeta(metaFile, meta);

  res.json({
    message: "Frame saved",
    clipId,
    fileName,
    url: `/media/clips/${clipId}/frames/${fileName}`
  });
});

// Upload audio (optional, later you’ll send WAV base64)
// body: { audio: "data:audio/wav;base64,...." } OR raw base64 string
app.post("/clip/:clipId/audio", (req, res) => {
  const { clipId } = req.params;
  const { audio } = req.body || {};

  if (!audio) return res.status(400).json({ error: "Missing audio" });

  const { audioFile, metaFile } = clipPaths(clipId);
  const meta = readMeta(metaFile);
  if (!meta) return res.status(404).json({ error: "Clip not found" });

  const base64Data = audio.replace(/^data:audio\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  fs.writeFileSync(audioFile, buffer);

  meta.hasAudio = true;
  writeMeta(metaFile, meta);

  res.json({
    message: "Audio saved",
    clipId,
    url: `/media/clips/${clipId}/audio.wav`
  });
});

// End a clip
app.post("/clip/:clipId/end", (req, res) => {
  const { clipId } = req.params;
  const { metaFile, framesDir } = clipPaths(clipId);

  const meta = readMeta(metaFile);
  if (!meta) return res.status(404).json({ error: "Clip not found" });

  const frames = listFrames(framesDir);

  meta.endedAt = nowIso();
  meta.frameCount = frames.length; // normalize to real count
  writeMeta(metaFile, meta);

  res.json({ message: "Clip ended", clipId, frameCount: frames.length });
});

// Get one clip metadata + list of frames
app.get("/clip/:clipId", (req, res) => {
  const { clipId } = req.params;
  const { metaFile, framesDir, audioFile, videoFile } = clipPaths(clipId);

  const meta = readMeta(metaFile);
  if (!meta) return res.status(404).json({ error: "Clip not found" });

  const frames = listFrames(framesDir);

  res.json({
    ...meta,
    frames: frames.map(f => ({
      fileName: f,
      url: `/media/clips/${clipId}/frames/${f}`
    })),
    audioUrl: fs.existsSync(audioFile) ? `/media/clips/${clipId}/audio.wav` : null,
    videoUrl: fs.existsSync(videoFile) ? `/media/clips/${clipId}/clip.mp4` : null
  });
});

// List all clips (newest first)
app.get("/clips", (req, res) => {
  const dirs = fs.readdirSync(CLIPS_ROOT, { withFileTypes: true })
    .filter(d => d.isDirectory())
    .map(d => d.name);

  const clips = dirs
    .map(clipId => {
      const { metaFile, framesDir } = clipPaths(clipId);
      const meta = readMeta(metaFile);
      if (!meta) return null;
      const frames = listFrames(framesDir);
      return {
        ...meta,
        frameCount: frames.length,
        preview: frames.length
          ? `/media/clips/${clipId}/frames/${frames[frames.length - 1]}`
          : null
      };
    })
    .filter(Boolean)
    .sort((a, b) => (b.startedAt || "").localeCompare(a.startedAt || ""));

  res.json(clips);
});

app.listen(PORT, () => {
  console.log(`🚀 Clip backend running on http://localhost:${PORT}`);
});
