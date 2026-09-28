FROM --platform=$BUILDPLATFORM node:22-bookworm-slim AS web-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY web/package.json ./web/
COPY server/package.json ./server/
RUN npm install --workspace web --include-workspace-root --no-audit --no-fund
COPY web/ ./web/
RUN npm -w web run build

FROM node:22-bookworm-slim AS server-build
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/
RUN npm install --workspace server --include-workspace-root --no-audit --no-fund
COPY server/ ./server/
RUN npm -w server run build

FROM node:22-bookworm-slim AS runner
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data \
    TZ=Asia/Shanghai
WORKDIR /app
COPY package.json package-lock.json ./
COPY server/package.json ./server/
COPY web/package.json ./web/
RUN npm install --omit=dev --workspace server --include-workspace-root --no-audit --no-fund \
  && npm cache clean --force
COPY --from=server-build /app/server/dist ./server/dist
COPY --from=web-build /app/web/dist ./web/dist
VOLUME ["/data"]
EXPOSE 8080
HEALTHCHECK --interval=60s --timeout=5s --start-period=10s \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server/dist/index.js"]
