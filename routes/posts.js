// Posts and timeline feed using signed Cloudinary uploads and a Redis sorted set.
const router = require("express").Router();
const { pool, redis, cloudinary } = require("../db");
const { auth } = require("../middleware/auth");
const { fanOut } = require("../workers/fanout");

const ser = (p) => ({
  post_id: p.post_id, username: p.username, profile_pic_url: p.profile_pic_url, image_url: p.image_url, caption: p.caption,
  user_id: p.user_id,
  hashtags: p.hashtags || [], likes_count: p.likes_count, created_at: p.created_at,
  liked_by_me: Boolean(p.liked_by_me), following: Boolean(p.following), comments_count: Number(p.comments_count || 0),
});

const postSelect = `SELECT p.*, u.username, u.profile_pic_url,
  to_char(p.created_at AT TIME ZONE 'UTC','YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_created_at,
  EXISTS(SELECT 1 FROM likes l WHERE l.post_id=p.post_id AND l.user_id=$1) AS liked_by_me,
  EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=p.user_id) AS following,
  (SELECT count(*) FROM comments c WHERE c.post_id=p.post_id)::int AS comments_count
  FROM posts p JOIN users u USING(user_id)`;

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
  if (typeof caption !== "string" || caption.length > 2200) return res.status(400).json({ detail: "Captions must be 2,200 characters or fewer." });
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

router.get("/feed", auth, async (req, res) => {
  const limit = Math.min(Math.max(parseInt(req.query.limit || "20", 10) || 20, 1), 50);
  const before = req.query.before ? String(req.query.before) : null;
  const beforeId = req.query.before_id ? parseInt(req.query.before_id, 10) : null;
  if (before && Number.isNaN(Date.parse(before))) return res.status(400).json({ detail: "Invalid feed cursor." });
  if (req.query.before_id && (!Number.isInteger(beforeId) || beforeId < 1)) return res.status(400).json({ detail: "Invalid feed cursor." });
  // Global, newest-first public feed. Timestamp cursor pagination prevents duplicate rows while scrolling.
  const { rows } = await pool.query(
    `${postSelect}
     WHERE ($2::timestamptz IS NULL OR (p.created_at,p.post_id) < ($2::timestamptz,$3::int))
     ORDER BY p.created_at DESC, p.post_id DESC LIMIT $4`, [req.user.user_id, before, beforeId, limit + 1]
  );
  const hasMore = rows.length > limit; if (hasMore) rows.pop();
  res.json({ source: "postgres-global", posts: rows.map(ser), next_cursor: hasMore ? { created_at: rows[rows.length - 1].cursor_created_at, post_id: rows[rows.length - 1].post_id } : null });
});

router.get("/explore", auth, async (req, res) => {
  const { rows } = await pool.query(
    `${postSelect}
     ORDER BY p.likes_count DESC, p.created_at DESC, p.post_id DESC LIMIT 60`, [req.user.user_id]);
  res.json({ posts: rows.map(ser) });
});

router.get("/posts/tag/:tag", auth, async (req, res) => { // This query can use the GIN hashtag index.
  const { rows } = await pool.query(
    `${postSelect}
     WHERE p.hashtags @> ARRAY[$2]::text[] ORDER BY p.created_at DESC LIMIT 30`, [req.user.user_id, req.params.tag.toLowerCase()]);
  res.json(rows.map(ser));
});

router.get("/stories", auth, async (req, res) => {
  await pool.query("DELETE FROM stories WHERE expires_at <= now()");
  const { rows } = await pool.query(
    `SELECT s.story_id, s.image_url, s.caption, s.created_at, s.expires_at,
       u.user_id AS user_id, u.username, u.profile_pic_url
     FROM stories s JOIN users u USING(user_id)
     WHERE s.expires_at > now()
     ORDER BY (s.user_id=$1) DESC, s.created_at DESC`, [req.user.user_id]);
  const grouped = new Map();
  for (const story of rows) {
    if (!grouped.has(story.user_id)) grouped.set(story.user_id, { user_id: story.user_id, username: story.username, profile_pic_url: story.profile_pic_url, stories: [] });
    grouped.get(story.user_id).stories.push(story);
  }
  res.json([...grouped.values()]);
});

router.get("/stories/upload-signature", auth, (req, res) => {
  const cfg = cloudinary.config();
  const params = { timestamp: Math.round(Date.now() / 1000), folder: "instacloud/stories" };
  const signature = cloudinary.utils.api_sign_request(params, cfg.api_secret);
  res.json({ ...params, signature, api_key: cfg.api_key, cloud_name: cfg.cloud_name });
});

router.post("/stories", auth, async (req, res) => {
  const { image_url, caption = "" } = req.body || {};
  if (!/^https:\/\/res\.cloudinary\.com\//.test(image_url || "")) return res.status(400).json({ detail: "image_url must be a valid Cloudinary URL." });
  if (typeof caption !== "string" || caption.length > 500) return res.status(400).json({ detail: "Story captions must be 500 characters or fewer." });
  const { rows } = await pool.query(
    `INSERT INTO stories(user_id,image_url,caption) VALUES($1,$2,$3)
     RETURNING story_id,image_url,caption,created_at,expires_at`, [req.user.user_id, image_url, caption.trim()]);
  res.status(201).json({ ...rows[0], username: req.user.username });
});

router.delete("/stories/:id", auth, async (req, res) => {
  const result = await pool.query("DELETE FROM stories WHERE story_id=$1 AND user_id=$2", [parseInt(req.params.id, 10), req.user.user_id]);
  if (!result.rowCount) return res.status(404).json({ detail: "Story not found." });
  res.status(204).end();
});

module.exports = router;

