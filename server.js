// ====== Make Video Route (Fixed for Render) ======
app.get("/make-video", (req, res) => {
  const folder = path.join(process.cwd(), "uploads");

  // Read JPG files
  const files = fs.readdirSync(folder)
    .filter(f => f.endsWith(".jpg"))
    .sort();

  if (files.length === 0) {
    return res.status(400).json({ error: "No images found to make a video." });
  }

  // Create FFmpeg concat list using absolute POSIX paths
  const listFile = path.join(folder, "frames.txt");
  const listContent = files
    .map(f => `file '${path.join(folder, f).replace(/\\/g, "/")}'`)
    .join("\n");

  fs.writeFileSync(listFile, listContent);

  const output = path.join(folder, `clip_${Date.now()}.mp4`);

  ffmpeg()
    .input(listFile)
    .inputOptions(["-f", "concat", "-safe", "0"])
    .outputOptions(["-vf", "fps=5", "-pix_fmt", "yuv420p"])
    .save(output)
    .on("start", cmd => console.log("FFmpeg:", cmd))
    .on("end", () => {
      console.log("🎥 Video created:", output);
      res.json({
        message: "Video created",
        url: `/uploads/${path.basename(output)}`
      });
    })
    .on("error", err => {
      console.error("❌ FFmpeg error:", err);
      res.status(500).json({ error: err.message });
    });
});
