// Component 4: Post & Timeline Feed (signed Cloudinary upload + Redis ZSET feed)
const router = require("express").Router();
const { pool, redis, cloudinary } = require("../db");
const { auth } = require("../middleware/auth");
const { fanOut } = require("../workers/fanout");

const ser = (p) => ({
  post_id: p.post_id, username: p.username, image_url: p.image_url, caption: p.caption,
  hashtags: p.hashtags || [], likes_count: p.likes_count, created_at: p.created_at,
});

// Browser ko signed permission, taaki image seedha Cloudinary par jaye
router.get("/posts/upload-signature", auth, (req, res) => {
  const cfg = cloudinary.config();
  const params = { timestamp: Math.round(Date.now() / 1000), folder: "instacloud" };
  const signature = cloudinary.utils.api_sign_request(params, cfg.api_secret);
  res.json({ ...params, signature, api_key: cfg.api_key, cloud_name: cfg.cloud_name });
});

router.post("/posts", auth, async (req, res) => {
  const { image_url, caption = "" } = req.body || {};
  if (!/^https:\/\/res\.cloudinary\.com\//.test(image_url || ""))
    return res.status(400).json({ detail: "image_url Cloudinary ka hona chahiye" });
  // 800x800 fit, auto quality, auto format (WebP/AVIF)
  const url = image_url.replace("/upload/", "/upload/w_800,h_800,c_limit,q_auto,f_auto/");
  const tags = [...new Set([...caption.matchAll(/#(\w+)/g)].map((m) => m[1].toLowerCase()))].sort();
  const { rows } = await pool.query(
    `INSERT INTO posts(user_id,image_url,caption,hashtags) VALUES($1,$2,$3,$4)
     RETURNING *, extract(epoch from created_at) AS ts`, [req.user.user_id, url, caption, tags]);
  const p = rows[0];
  fanOut(p.post_id, req.user.user_id, Number(p.ts)).catch(() => {}); // background, user ko wait nahi karna
  res.status(201).json(ser({ ...p, username: req.user.username }));
});

router.get("/feed", auth, async (req, res) => {
  const uid = req.user.user_id, key = `feed:user:${uid}`;
  let source = "redis", ids = [];
  try { ids = (await redis.zrevrange(key, 0, 19)).map(Number); } catch {}
  if (!ids.length) { // cache miss -> PostgreSQL, phir Redis warm karo
    source = "postgres";
    const { rows } = await pool.query(
      `SELECT post_id, extract(epoch from created_at) AS ts FROM posts
       WHERE user_id=$1 OR user_id IN (SELECT following_id FROM follows WHERE follower_id=$1)
       ORDER BY created_at DESC LIMIT 200`, [uid]);
    if (rows.length) {
      try { await redis.zadd(key, ...rows.flatMap((r) => [Number(r.ts), String(r.post_id)])); } catch {}
    }
    ids = rows.slice(0, 20).map((r) => r.post_id);
  }
  if (!ids.length) return res.json({ source, posts: [] });
  const { rows } = await pool.query(
    "SELECT p.*, u.username FROM posts p JOIN users u USING(user_id) WHERE p.post_id = ANY($1::int[])", [ids]);
  const byId = new Map(rows.map((p) => [p.post_id, p]));
  res.json({ source, posts: ids.filter((i) => byId.has(i)).map((i) => ser(byId.get(i))) });
});

router.get("/posts/tag/:tag", async (req, res) => { // GIN index use hota hai
  const { rows } = await pool.query(
    `SELECT p.*, u.username FROM posts p JOIN users u USING(user_id)
     WHERE p.hashtags @> ARRAY[$1]::text[] ORDER BY p.created_at DESC LIMIT 30`, [req.params.tag.toLowerCase()]);
  res.json(rows.map(ser));
});

module.exports = router;
