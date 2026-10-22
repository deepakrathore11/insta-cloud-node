// User profiles and social graph.
const router = require("express").Router();
const { pool } = require("../db");
const { auth } = require("../middleware/auth");

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

router.post("/:id/follow", auth, async (req, res) => {
  const target = parseInt(req.params.id, 10), me = req.user.user_id;
  if (target === me) return res.status(400).json({ detail: "You cannot follow your own account." });
  const del = await pool.query("DELETE FROM follows WHERE follower_id=$1 AND following_id=$2", [me, target]);
  if (del.rowCount) return res.json({ following: false });
  try {
    await pool.query("INSERT INTO follows(follower_id,following_id) VALUES($1,$2)", [me, target]);
    res.json({ following: true });
  } catch (e) {
    if (e.code === "23503") return res.status(404).json({ detail: "User not found" });
    throw e;
  }
});

module.exports = router;
