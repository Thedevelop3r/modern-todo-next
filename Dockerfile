# syntax=docker/dockerfile:1

ARG NODE_VERSION=24
ARG RUST_VERSION=1

# ---------------------------------------------------------------- renderer ----
# The PDF service is one static-ish binary with its fonts and templates baked in
# (`include_bytes!` / `include_str!`), so nothing from this stage ships except
# the executable itself.
FROM rust:${RUST_VERSION}-slim AS pdf-builder

WORKDIR /build

# Dependencies first: typst is a long compile and only the sources below change
# between builds.
COPY services/pdf/Cargo.toml services/pdf/Cargo.lock ./
RUN mkdir src && echo "fn main() {}" > src/main.rs && cargo build --release && rm -rf src

COPY services/pdf/ ./
# cargo skips a rebuild when only the mtime of the stub main.rs moved.
RUN touch src/main.rs && cargo build --release

# ------------------------------------------------------------- application ----
FROM node:${NODE_VERSION}-slim

WORKDIR /app

# ffmpeg and qpdf are the video/audio and PDF compressors; sharp ships its own
# binaries. Compression degrades gracefully without them, but the image is the
# one place we can guarantee they exist.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg qpdf \
  && rm -rf /var/lib/apt/lists/*

# `npm ci` rather than `npm install`: the lockfile is the build's input, so the
# image is reproducible instead of resolving fresh versions on each build.
COPY package*.json ./
RUN npm ci

COPY . .

COPY --from=pdf-builder /build/target/release/modern-todo-pdf /usr/local/bin/modern-todo-pdf

# server.js spawns the renderer as a child process and kills it on shutdown, so
# there is no supervisor here. Set PDF_SERVICE_SPAWN=0 and point PDF_SERVICE_URL
# elsewhere to run it as its own service instead.
ENV PDF_SERVICE_BIN=/usr/local/bin/modern-todo-pdf

# Both the pages and the API are served from this one port. The renderer binds
# 127.0.0.1 only and is never exposed.
EXPOSE 3000

ENV NODE_ENV=production

# build
RUN npm run build

# The build needed devDependencies; running does not - and shipping them means
# shipping mongodb-memory-server, which downloads and runs a mongod of its own.
RUN npm prune --omit=dev

# Everything above ran as root. Nothing below needs to: the process only reads
# its own code and writes to the upload scratch directory under /tmp. This
# matters because ffmpeg, qpdf and sharp are all run over uploaded files.
RUN chown -R node:node /app
USER node

# /api/health reports the database connection too, so an instance that cannot
# reach mongo is reported unhealthy rather than merely alive.
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# node as PID 1, not npm: signals reach the shutdown handlers in server.js
# directly, and a clean stop exits 0 instead of npm reporting the SIGTERM as a
# failed command.
# CMD ["node", "server.js"]
CMD ["npm", "run", "start"]
