# C-Klausurtrainer — Container für Coolify (Build Pack: Dockerfile)
FROM node:22-alpine

WORKDIR /app
COPY . .

ENV NODE_ENV=production
ENV PORT=3000
# Nutzer-Stände: in Coolify unbedingt ein persistentes Volume auf
# /app/data-store mounten, sonst sind die Stats nach jedem Redeploy weg!
ENV DATA_DIR=/app/data-store

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health || exit 1

CMD ["node", "server.js"]
