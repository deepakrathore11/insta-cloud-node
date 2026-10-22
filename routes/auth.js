// Component 2: Authentication & Identity (bcrypt + JWT)
const router = require("express").Router();
const bcrypt = require("bcryptjs");
const { pool } = require("../db");
const { sign } = require("../middleware/auth");

router.post("/register", async (req, res) => {
  const { username, email, password } = req.body || {};
  if (!username || !email || !password) return res.status(400).json({ detail: "Sab fields bharo" });
  if (password.length < 6) return res.status(400).json({ detail: "Password kam se kam 6 characters ka rakho" });
  try {
    const hash = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      "INSERT INTO users(username,email,password_hash) VALUES($1,$2,$3) RETURNING user_id", [username, email, hash]);
    res.status(201).json({ id: rows[0].user_id, username });
  } catch (e) {
    if (e.code === "23505") return res.status(409).json({ detail: "Username ya email already exists" });
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

module.exports = router;
