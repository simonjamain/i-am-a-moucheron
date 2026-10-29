ARG NODE_IMAGE=node:24-bookworm-slim@sha256:c86ecead9e55a5210ac1727de38a4ca840bf03dcaf34dc9749addbf383b1920c
FROM ${NODE_IMAGE} AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && node -e "import('node-datachannel').then(m => { m.preload(); m.cleanup(); })"
COPY src ./src
COPY server ./server
COPY scripts/assemble.mjs ./scripts/assemble.mjs
COPY vendor ./vendor
RUN mkdir worker && node scripts/assemble.mjs

FROM ${NODE_IMAGE} AS runtime
LABEL org.opencontainers.image.title="i am a moucheron" \
      org.opencontainers.image.description="Multiplayer game server: RAM state and WebRTC UDP only"
WORKDIR /app
ENV NODE_ENV=production PORT=3000 UDP_PORT_BEGIN=41000 UDP_PORT_END=41099
COPY --from=build --chown=node:node /app/package.json ./package.json
COPY --from=build --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/src ./src
COPY --from=build --chown=node:node /app/server ./server
COPY --from=build --chown=node:node /app/worker/assets.js ./worker/assets.js
USER node
EXPOSE 3000/tcp 41000-41099/udp
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/healthz').then(r => { if (!r.ok) process.exit(1); }).catch(() => process.exit(1));"
ENTRYPOINT ["node"]
CMD ["server/index.js"]
