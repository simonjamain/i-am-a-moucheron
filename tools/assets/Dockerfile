FROM node:22.16.0-bookworm-slim

WORKDIR /opt/assets
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --no-audit --no-fund
COPY cli.mjs test.mjs test-t01-optimizer.mjs ./
USER node
WORKDIR /assets
ENTRYPOINT ["node", "/opt/assets/cli.mjs"]
CMD ["help"]
