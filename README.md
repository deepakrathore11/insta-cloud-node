# InstaCloud

An Instagram-inspired social sharing app built with Node.js, Express, PostgreSQL, Redis, WebSockets, and Cloudinary. The responsive frontend lives in `public/index.html`.

## Features

- Account registration and login
- Responsive global photo feed showing recent public posts from every account, with cursor-based loading for older posts
- Explore page ranked by likes and recency
- Modern social-media layout
- Image uploads through signed Cloudinary requests
- Captions and hashtag extraction
- Persistent like state, comments, native share links, and hashtag search
- Real account search, follow/unfollow controls, and suggestions based on active accounts
- Stories with photo uploads, captions, a viewer, and automatic 24-hour expiry
- Redis-backed real-time notification infrastructure
- Mobile-friendly navigation and accessible form controls

## Requirements

- Node.js 18 or later
- PostgreSQL
- Redis
- A Cloudinary account

## Local setup

1. Copy `.env.example` to `.env`.
2. Add your PostgreSQL, Redis, Cloudinary, and JWT configuration values.
3. Install dependencies: `npm install`.
4. Start the server: `npm start`.
5. Open `http://localhost:8000`.

For development with automatic restarts, run `npm run dev`.

## Docker

```sh
docker build -t instacloud .
docker run -p 8000:8000 --env-file .env instacloud
```

## Deployment

Deploy the Node.js service on your preferred hosting provider. Set the environment variables from `.env.example` in the provider's secret/environment settings. Do not commit `.env` or credentials to source control.

## Security notes

Use a strong, unique `JWT_SECRET` in production. Keep database credentials and Cloudinary secrets private, enable HTTPS, and configure CORS for your production domain instead of allowing every origin.

