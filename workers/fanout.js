// Component 6: Background worker - post_id ko followers ke Redis feed (ZSET) me push karta hai
const { pool, redis } = require("../db");

async function fanOut(postId, userId, ts) {
  const { rows } = await pool.query("SELECT follower_id FROM follows WHERE following_id=$1", [userId]);
  const pipe = redis.pipeline();
  for (const id of [...rows.map((r) => r.follower_id), userId]) {
    const key = `feed:user:${id}`;
    pipe.zadd(key, ts, String(postId));
    pipe.zremrangebyrank(key, 0, -201); // sirf latest 200 posts
  }
  await pipe.exec();
}

module.exports = { fanOut };
