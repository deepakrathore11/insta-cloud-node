// Likes, comments, and real-time notifications using Redis Pub/Sub.
const router = require("express").Router();
const { pool, redis } = require("../db");
const { auth } = require("../middleware/auth");

async function notify(ownerId, me, text) {
  if (ownerId === me.user_id) return;
  try { await redis.publish(`notifications:user:${ownerId}`, JSON.stringify({ text: `${me.username} ${text}` })); } catch {}
}

router.post("/posts/:id/like", auth, async (req, res) => {
  const pid = parseInt(req.params.id, 10), me = req.user.user_id;
  const post = (await pool.query("SELECT user_id FROM posts WHERE post_id=$1", [pid])).rows[0];
  if (!post) return res.status(404).json({ detail: "Post not found" });
  const del = await pool.query("DELETE FROM likes WHERE user_id=$1 AND post_id=$2", [me, pid]);
  let liked = false, q;
  if (del.rowCount) {
    q = await pool.query("UPDATE posts SET likes_count=GREATEST(likes_count-1,0) WHERE post_id=$1 RETURNING likes_count", [pid]);
  } else {
    await pool.query("INSERT INTO likes(user_id,post_id) VALUES($1,$2)", [me, pid]); // The composite primary key prevents duplicate likes.
    q = await pool.query("UPDATE posts SET likes_count=likes_count+1 WHERE post_id=$1 RETURNING likes_count", [pid]);
    liked = true;
    notify(post.user_id, req.user, "liked your post");
  }
  res.json({ liked, likes_count: q.rows[0].likes_count });
});

router.post("/posts/:id/comments", auth, async (req, res) => {
  const pid = parseInt(req.params.id, 10), text = ((req.body || {}).text || "").trim();
  if (!text || text.length > 500) return res.status(400).json({ detail: "A comment must contain between 1 and 500 characters." });
  const post = (await pool.query("SELECT user_id FROM posts WHERE post_id=$1", [pid])).rows[0];
  if (!post) return res.status(404).json({ detail: "Post not found" });
  const { rows } = await pool.query(
    "INSERT INTO comments(post_id,user_id,comment_text) VALUES($1,$2,$3) RETURNING comment_id", [pid, req.user.user_id, text]);
  notify(post.user_id, req.user, "commented on your post");
  res.status(201).json({ comment_id: rows[0].comment_id, text });
});

router.get("/posts/:id/comments", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT c.comment_id, u.username, c.comment_text AS text FROM comments c
     JOIN users u USING(user_id) WHERE c.post_id=$1 ORDER BY c.created_at`, [parseInt(req.params.id, 10)]);
  res.json(rows);
});

module.exports = router;
