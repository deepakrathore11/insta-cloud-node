const jwt = require("jsonwebtoken");
const { pool } = require("../db");

const SECRET = process.env.JWT_SECRET || "change-me";

const sign = (id) => jwt.sign({ sub: String(id) }, SECRET, { expiresIn: `${process.env.TOKEN_MIN || 60}m` });

function verifyToken(token) {
  try { return parseInt(jwt.verify(token, SECRET).sub, 10); } catch { return null; }
}

async function auth(req, res, next) {
  const uid = verifyToken((req.headers.authorization || "").replace("Bearer ", ""));
  if (!uid) return res.status(401).json({ detail: "Invalid or expired token" });
  const { rows } = await pool.query("SELECT user_id, username FROM users WHERE user_id=$1", [uid]);
  if (!rows[0]) return res.status(401).json({ detail: "User not found" });
  req.user = rows[0];
  next();
}

module.exports = { sign, verifyToken, auth };
