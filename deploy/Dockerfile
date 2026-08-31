# Alternative to the systemd unit, if the VPS already runs Docker.
#
#   docker build -f deploy/Dockerfile -t nodea-daemon .
#   docker run -d --name nodea-daemon --restart unless-stopped \
#     --memory 512m --cpus 0.5 \
#     --env-file /etc/nodea/nodea.env nodea-daemon
#
# No ports are published: the daemon dials out and never listens, so it cannot collide with
# anything already bound on the host.
FROM node:22-alpine

WORKDIR /app

# The full tree, not --omit=dev: the daemon runs through `tsx` and reads config through `dotenv`,
# and both are devDependencies. --ignore-scripts skips the solidity toolchain's postinstall, which
# this image has no use for.
COPY package.json package-lock.json ./
RUN npm ci --ignore-scripts

# Only what the daemon actually imports. `src/lib/nodea` is the shared SDK; the rest of src/ is the
# web app and has no business in this image.
COPY agent ./agent
COPY scripts ./scripts
COPY src/lib/nodea ./src/lib/nodea
COPY deployments ./deployments
COPY tsconfig.hardhat.json ./

# Unprivileged, and the image carries no keys - they arrive via --env-file at run time.
USER node

CMD ["npx", "tsx", "agent/node-daemon.ts"]
