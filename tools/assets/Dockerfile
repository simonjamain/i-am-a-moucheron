FROM node:22.16.0-bookworm-slim

WORKDIR /opt/assets
COPY package.json ./
# Exact direct dependencies; a committed lockfile is required before final acceptance.
RUN npm install --omit=dev --no-audit --no-fund
COPY cli.mjs test.mjs ./
USER node
WORKDIR /assets
ENTRYPOINT ["node", "/opt/assets/cli.mjs"]
CMD ["help"]
