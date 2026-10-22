# InstaCloud (Node.js version)
Express + PostgreSQL (Neon) + Redis (Upstash) + Cloudinary. Frontend: public/index.html

Local: .env banao (.env.example se) -> npm install -> npm start -> http://localhost:8000
Docker: docker build -t insta-node . && docker run -p 8000:8000 --env-file .env insta-node
Deploy: GitHub pe push -> Render -> New Web Service -> Runtime: Node (Build: npm install, Start: npm start) -> Environment me .env ki keys daalo.
