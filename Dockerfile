# Deterministic build for Railway (no dependencies to install — pure static
# files served by a tiny Node server). Railway auto-detects this Dockerfile.
FROM node:20-alpine
WORKDIR /app
COPY . .
# Railway provides PORT at runtime; server.js reads process.env.PORT.
EXPOSE 3000
CMD ["node", "server.js"]
