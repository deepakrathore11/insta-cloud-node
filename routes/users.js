// User profiles and social graph.
const router = require("express").Router();
const { pool, redis } = require("../db");
const { auth } = require("../middleware/auth");

router.get("/suggestions", auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.user_id AS id, u.username, u.profile_pic_url,
       (SELECT count(*) FROM follows f WHERE f.following_id=u.user_id)::int AS followers
     FROM users u
     WHERE u.user_id <> $1
       AND NOT EXISTS (SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=u.user_id)
     ORDER BY (SELECT count(*) FROM posts p WHERE p.user_id=u.user_id) DESC, u.created_at DESC
     LIMIT 8`, [req.user.user_id]);
  res.json(rows);
});

router.get("/search", auth, async (req, res) => {
  const query = String(req.query.q || "").trim().replace(/^@/, "").slice(0, 50);
  if (!query) return res.json([]);
  const { rows } = await pool.query(
    `SELECT u.user_id AS id, u.username, u.profile_pic_url,
      EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=u.user_id) AS following
     FROM users u WHERE u.user_id <> $1 AND u.username ILIKE $2
     ORDER BY u.username LIMIT 10`, [req.user.user_id, `%${query}%`]);
  res.json(rows);
});

router.get("/:username/posts", auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT p.*, u.username, u.profile_pic_url,
       EXISTS(SELECT 1 FROM likes l WHERE l.post_id=p.post_id AND l.user_id=$1) AS liked_by_me,
       EXISTS(SELECT 1 FROM follows f WHERE f.follower_id=$1 AND f.following_id=p.user_id) AS following,
       (SELECT count(*) FROM comments c WHERE c.post_id=p.post_id)::int AS comments_count
     FROM posts p JOIN users u USING(user_id)
     WHERE u.username=$2 ORDER BY p.created_at DESC, p.post_id DESC LIMIT 120`,
    [req.user.user_id, req.params.username]);
  res.json(rows.map(post => ({
    post_id: post.post_id, user_id: post.user_id, username: post.username,
    profile_pic_url: post.profile_pic_url, image_url: post.image_url, caption: post.caption,
    hashtags: post.hashtags || [], likes_count: post.likes_count, created_at: post.created_at,
    liked_by_me: Boolean(post.liked_by_me), following: Boolean(post.following), comments_count: Number(post.comments_count || 0),
  })));
});

router.get("/:username", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT u.user_id AS id, u.username, u.bio, u.profile_pic_url,
      (SELECT count(*) FROM follows WHERE following_id=u.user_id)::int AS followers,
      (SELECT count(*) FROM follows WHERE follower_id=u.user_id)::int AS following,
      (SELECT count(*) FROM posts WHERE user_id=u.user_id)::int AS posts
     FROM users u WHERE u.username=$1`, [req.params.username]);
  if (!rows[0]) return res.status(404).json({ detail: "User not found" });
  res.json(rows[0]);
});

router.get("/:username/following", auth, async (req, res) => {
  const { rows } = await pool.query(
    `SELECT EXISTS(SELECT 1 FROM follows f JOIN users u ON u.user_id=f.following_id
      WHERE f.follower_id=$1 AND u.username=$2) AS following`, [req.user.user_id, req.params.username]);
  res.json(rows[0]);
});

router.post("/:id/follow", auth, async (req, res) => {
  const target = parseInt(req.params.id, 10), me = req.user.user_id;
  if (!Number.isInteger(target)) return res.status(400).json({ detail: "Invalid user id." });
  if (target === me) return res.status(400).json({ detail: "You cannot follow your own account." });
  const exists = await pool.query("SELECT 1 FROM users WHERE user_id=$1", [target]);
  if (!exists.rowCount) return res.status(404).json({ detail: "User not found" });
  const del = await pool.query("DELETE FROM follows WHERE follower_id=$1 AND following_id=$2", [me, target]);
  if (del.rowCount) return res.json({ following: false });
  const inserted = await pool.query("INSERT INTO follows(follower_id,following_id) VALUES($1,$2) ON CONFLICT DO NOTHING", [me, target]);
  if (inserted.rowCount) {
    const actor = (await pool.query("SELECT username FROM users WHERE user_id=$1", [me])).rows[0];
    redis.publish(`notifications:user:${target}`, JSON.stringify({ text: `${actor.username} started following you` })).catch(() => {});
  }
  res.json({ following: true });
});

module.exports = router;

