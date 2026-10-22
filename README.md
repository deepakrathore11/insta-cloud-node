# InstaCloud

An Instagram-inspired social sharing app built with Node.js, Express, PostgreSQL, Redis, WebSockets, and Cloudinary. The responsive frontend lives in `public/index.html`.

## Features

- Account registration and login
- Responsive global photo feed showing the latest public posts from every account
- Feed is available to signed-in users and refreshes from PostgreSQL so new public posts appear on reload
- Modern social-media layout
- Image uploads through signed Cloudinary requests
- Captions and hashtag extraction
- Like and comment interactions
- Redis-backed feed caching and real-time notification infrastructure
- Mobile-friendly navigation and accessible form controls

Some interface elements, including stories, suggested profiles, bookmarks, and notification panels, are currently visual placeholders and are not connected to backend features.

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
