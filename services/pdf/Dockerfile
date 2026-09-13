# syntax=docker/dockerfile:1

# The PDF renderer, built and run as its own image. Build context is this
# directory - the service shares no code with the application, so an app change
# never invalidates this build and a template change never rebuilds the app.

ARG RUST_VERSION=1
# Builder and runtime must be the same Debian release: a binary linked against
# trixie's glibc refuses to start on bookworm.
ARG DEBIAN_RELEASE=trixie

# ----------------------------------------------------------------- builder ----
FROM rust:${RUST_VERSION}-slim-${DEBIAN_RELEASE} AS builder

WORKDIR /build

# Dependencies first: typst is the long compile and only the sources below change
# between builds. The registry cache mount keeps downloaded crates across builds
# even when this layer is invalidated by a Cargo.lock change.
COPY Cargo.toml Cargo.lock ./
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    mkdir src && echo "fn main() {}" > src/main.rs \
    && cargo build --release --locked \
    && rm -rf src

COPY . ./
# cargo skips a rebuild when only the mtime of the stub main.rs moved.
RUN --mount=type=cache,target=/usr/local/cargo/registry,sharing=locked \
    --mount=type=cache,target=/usr/local/cargo/git,sharing=locked \
    touch src/main.rs && cargo build --release --locked

# ----------------------------------------------------------------- runtime ----
# Fonts and templates are compiled into the binary (`include_bytes!` /
# `include_str!`), so the runtime needs nothing but a libc and a non-root user.
FROM debian:${DEBIAN_RELEASE}-slim

RUN useradd --system --uid 10001 --no-create-home renderer
COPY --from=builder /build/target/release/modern-todo-pdf /usr/local/bin/modern-todo-pdf
USER renderer

# Alone in a container, loopback would admit nobody at all. The port is still
# only reachable over the compose network - compose uses `expose`, never `ports`.
ENV PDF_SERVICE_HOST=0.0.0.0
ENV PDF_SERVICE_PORT=8787
EXPOSE 8787

# The renderer's graceful shutdown listens for ctrl-c only. As PID 1 a SIGTERM
# would be ignored and every stop would wait out the kill timeout.
STOPSIGNAL SIGINT

# GET /health needs no key. There is no curl in the slim image; bash's /dev/tcp
# is enough to tell a listening renderer from one that is not.
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD ["bash", "-c", "exec 3<>/dev/tcp/127.0.0.1/${PDF_SERVICE_PORT:-8787} && printf 'GET /health HTTP/1.0\\r\\n\\r\\n' >&3 && head -n1 <&3 | grep -q ' 200 '"]

CMD ["modern-todo-pdf"]
