// Authentication and identity using bcrypt and JWT.
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { sign } = require("../middleware/auth");

router.post("/register", async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ detail: "Please complete all required fields." });
  if (password.length < 6) return res.status(400).json({ detail: "Password must be at least 6 characters long." });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users(username,email,password_hash) VALUES($1,$2,$3) RETURNING user_id", [username, email, hash]);
    res.status(201).json({ id: rows[0].user_id, username });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ detail: "That username or email address is already in use." });
    throw e;
  }
});

router.post("/login", async (req, res) => {
  const { username, password } = req.body || {};
  const { rows } = await pool.query("SELECT user_id, password_hash FROM users WHERE username=$1", [username || ""]);
  if (!rows[0] || !(await bcrypt.compare(password || "", rows[0].password_hash)))
    return res.status(401).json({ detail: "Wrong username or password" });
  res.json({ access_token: sign(rows[0].user_id), token_type: "bearer" });
});

router.get("/me", require("../middleware/auth").auth, async (req, res) => {
  const { rows } = await pool.query(
    "SELECT user_id AS id, username, email, bio, profile_pic_url FROM users WHERE user_id=$1", [req.user.user_id]);
  res.json(rows[0]);
});

module.exports = router;

