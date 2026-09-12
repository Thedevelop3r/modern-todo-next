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

COPY package*.json ./
RUN npm install

COPY . .

COPY --from=pdf-builder /build/target/release/modern-todo-pdf /usr/local/bin/modern-todo-pdf

# server.js spawns the renderer as a child process and kills it on shutdown, so
# there is no supervisor here. Set PDF_SERVICE_SPAWN=0 and point PDF_SERVICE_URL
# elsewhere to run it as its own service instead.
ENV PDF_SERVICE_BIN=/usr/local/bin/modern-todo-pdf

# Both the pages and the API are served from this one port. The renderer binds
# 127.0.0.1 only and is never exposed.
EXPOSE 3000

# build
RUN npm run build

CMD ["npm", "run", "start"]
