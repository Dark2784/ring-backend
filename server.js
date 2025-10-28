const express = require("express");
const fs = require("fs");
const path = require("path");
const cors = require("cors"); // ✅ allow cross-origin access (for ESP32 + app)
const app = express();

// Use Render’s PORT if available (for online hosting)
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors()); // ✅ enables connections from anywhere
app.use(express.json({ limit: "10mb" }));

// ✅ Homepage route — fixes "Cannot GET /"
app.get("/", (req, res) => {
  res.send("Hello from the ESP32 backend!");
});

// ✅ Upload route — ESP32 will send photos here
app.post("/upload", (req, res) => {
  const imageData = req.body.image;
  if (!imageData) {
    return res.status(400).json({ error: "No image data received" });
  }

  // Remove Base64 header
  const base64Data = imageData.replace(/^data:image\/\w+;base64,/, "");
  const buffer = Buffer.from(base64Data, "base64");

  // Save to /uploads folder
  const fileName = `photo_${Date.now()}.jpg`;
  const filePath = path.join(__dirname, "uploads", fileName);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, buffer);

  console.log(`✅ Image saved: ${fileName}`);
  res.json({ message: "Image received", fileName });
});

// ✅ Serve saved images publicly
app.use("/uploads", express.static(path.join(__dirname, "uploads")));

// ✅ Start the server
app.listen(PORT, () => {
  console.log(`🚀 Server running on http://localhost:${PORT}`);
});

    