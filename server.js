// InstaCloud API gateway: CORS, rate limiting, and route registration.
const http = require("http");
const path = require("path");
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const { pool, redis, initDb } = require("./db");
const { verifyToken } = require("./middleware/auth");

const app = express();
const LIMIT = parseInt(process.env.RATE_LIMIT || "60", 10);
app.set("trust proxy", true);
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true })); // Supports URL-encoded login forms.

// Redis rate limiting: ratelimit:{ip}:{minute} -> INCR + EXPIRE 60.
app.use("/api", async (req, res, next) => {
  try {
    const key = `ratelimit:${req.ip}:${Math.floor(Date.now() / 60000)}`;
    const n = await redis.incr(key);
    if (n === 1) await redis.expire(key, 60);
    if (n > LIMIT) return res.status(429).json({ detail: "Too Many Requests" });
  } catch {}
  next();
});

app.use("/api/v1/auth", require("./routes/auth"));
app.use("/api/v1/users", require("./routes/users"));
app.use("/api/v1", require("./routes/posts"));
app.use("/api/v1", require("./routes/interactions"));
app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use(express.static(path.join(__dirname, "public")));

app.use((err, req, res, next) => { // Return API errors as JSON.
  console.error(err);
  res.status(500).json({ detail: "Server error: " + err.message });
});

// Real-time notifications: Redis Pub/Sub -> WebSocket.
const server = http.createServer(app);
const wss = new WebSocketServer({ noServer: true });
server.on("upgrade", (req, socket, head) => {
  const url = new URL(req.url, "http://localhost");
  const uid = verifyToken(url.searchParams.get("token") || "");
  if (url.pathname !== "/api/v1/ws/notifications" || !uid) return socket.destroy();
  wss.handleUpgrade(req, socket, head, (ws) => {
    const sub = redis.duplicate();
    sub.on("error", () => {});
    sub.subscribe(`notifications:user:${uid}`).catch(() => {});
    sub.on("message", (_ch, msg) => { if (ws.readyState === 1) ws.send(msg); });
    ws.on("close", () => sub.quit().catch(() => {}));
  });
});

const PORT = process.env.PORT || 8000;
initDb()
  .then(() => server.listen(PORT, () => console.log(`InstaCloud is running at http://localhost:${PORT}`)))
  .catch((e) => { console.error("Database connection failed. Check DATABASE_URL:", e.message); process.exit(1); });

