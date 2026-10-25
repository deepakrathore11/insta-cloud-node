// Data services: PostgreSQL, Redis, and Cloudinary.
require("dotenv").config();
const { Pool } = require("pg");
const Redis = require("ioredis");
const cloudinary = require("cloudinary").v2;

const url = process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/instadb";
const pool = new Pool({
  connectionString: url,
  max: 5,
  ssl: /localhost|127\.0\.0\.1/.test(url) ? false : { rejectUnauthorized: false },
});

const redis = new Redis(process.env.REDIS_URL || "redis://localhost:6379", { maxRetriesPerRequest: 2 });
redis.on("error", () => {}); // Allow the app to start even if Redis is temporarily unavailable.

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true,
});

const SCHEMA = `
CREATE TABLE IF NOT EXISTS users(
  user_id SERIAL PRIMARY KEY,
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(120) UNIQUE NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  bio TEXT DEFAULT '',
  profile_pic_url TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS posts(
  post_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption TEXT DEFAULT '',
  hashtags TEXT[] DEFAULT '{}',
  likes_count INT NOT NULL DEFAULT 0 CHECK (likes_count >= 0),
  created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS follows(
  follower_id INT REFERENCES users ON DELETE CASCADE,
  following_id INT REFERENCES users ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(follower_id, following_id),
  CONSTRAINT prevent_self_follow CHECK (follower_id <> following_id));
CREATE TABLE IF NOT EXISTS likes(
  user_id INT REFERENCES users ON DELETE CASCADE,
  post_id INT REFERENCES posts ON DELETE CASCADE,
  created_at TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY(user_id, post_id));
CREATE TABLE IF NOT EXISTS comments(
  comment_id SERIAL PRIMARY KEY,
  post_id INT NOT NULL REFERENCES posts ON DELETE CASCADE,
  user_id INT NOT NULL REFERENCES users ON DELETE CASCADE,
  comment_text VARCHAR(500) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now());
CREATE TABLE IF NOT EXISTS stories(
  story_id SERIAL PRIMARY KEY,
  user_id INT NOT NULL REFERENCES users ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  caption VARCHAR(500) DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '24 hours'));
CREATE INDEX IF NOT EXISTS idx_posts_user_created ON posts(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_posts_hashtags_gin ON posts USING GIN (hashtags);
CREATE INDEX IF NOT EXISTS idx_follows_following_id ON follows(following_id);
CREATE INDEX IF NOT EXISTS idx_comments_post_created ON comments(post_id, created_at);
CREATE INDEX IF NOT EXISTS idx_stories_expires ON stories(expires_at DESC);
`;

const initDb = () => pool.query(SCHEMA);

module.exports = { pool, redis, cloudinary, initDb };

