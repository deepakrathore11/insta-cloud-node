// Posts and timeline feed using signed Cloudinary uploads and a Redis sorted set.
const router = require("express").Router();
const { pool, redis, cloudinary } = require("../db");
const { auth } = require("../middleware/auth");
const { fanOut } = require("../workers/fanout");

const ser = (p) => ({
  post_id: p.post_id, username: p.username, image_url: p.image_url, caption: p.caption,
  hashtags: p.hashtags || [], likes_count: p.likes_count, created_at: p.created_at,
});

// Provide a signed upload so the browser can send images directly to Cloudinary.
router.get("/posts/upload-signature", auth, (req, res) => {
  const cfg = cloudinary.config();
  const params = { timestamp: Math.round(Date.now() / 1000), folder: "instacloud" };
  const signature = cloudinary.utils.api_sign_request(params, cfg.api_secret);
  res.json({ ...params, signature, api_key: cfg.api_key, cloud_name: cfg.cloud_name });
});

router.post("/posts", auth, async (req, res) => {
  const { image_url, caption = "" } = req.body || {};
  if (!/^https:\/\/res\.cloudinary\.com\//.test(image_url || ""))
    return res.status(400).json({ detail: "image_url must be a valid Cloudinary URL." });
  // Limit image dimensions and let Cloudinary optimize quality and format.
  const url = image_url.replace("/upload/", "/upload/w_800,h_800,c_limit,q_auto,f_auto/");
  const tags = [...new Set([...caption.matchAll(/#(\w+)/g)].map((m) => m[1].toLowerCase()))].sort();
  const { rows } = await pool.query(
    `INSERT INTO posts(user_id,image_url,caption,hashtags) VALUES($1,$2,$3,$4)
     RETURNING *, extract(epoch from created_at) AS ts`, [req.user.user_id, url, caption, tags]);
  const p = rows[0];
  fanOut(p.post_id, req.user.user_id, Number(p.ts)).catch(() => {}); // Run feed fan-out in the background so the request can return immediately.
  res.status(201).json(ser({ ...p, username: req.user.username }));
});

router.get("/feed", auth, async (_req, res) => {
  // Global public feed: show the latest posts from every account, not only followed accounts.
  // Query PostgreSQL directly so new posts appear on the next feed refresh without stale Redis results.
  const { rows } = await pool.query(
    `SELECT p.*, u.username FROM posts p
     JOIN users u USING(user_id)
     ORDER BY p.created_at DESC LIMIT 50`
  );
  res.json({ source: "postgres-global", posts: rows.map(ser) });
});

router.get("/posts/tag/:tag", async (req, res) => { // This query can use the GIN hashtag index.
  const { rows } = await pool.query(
    `SELECT p.*, u.username FROM posts p JOIN users u USING(user_id)
     WHERE p.hashtags @> ARRAY[$1]::text[] ORDER BY p.created_at DESC LIMIT 30`, [req.params.tag.toLowerCase()]);
  res.json(rows.map(ser));
});

module.exports = router;
