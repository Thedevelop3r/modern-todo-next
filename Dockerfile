# syntax=docker/dockerfile:1

# The production image for the Next.js pages and the Express API. It runs the
# prebuilt bundle only: nothing is compiled when a page is requested.
#
# The PDF renderer is not built here. It has its own image in services/pdf/, so
# the Rust compile never holds up an application build.

ARG NODE_VERSION=24

# ------------------------------------------------------------------- deps ----
FROM node:${NODE_VERSION}-slim AS deps

WORKDIR /app

# Yarn 4 is committed under .yarn/releases and pinned by `yarnPath` in
# .yarnrc.yml. The Yarn 1 that ships in the node image hands off to it, so there
# is no corepack step and nothing to download.
#
# `--immutable`: the lockfile is the build's input, so the image is reproducible
# and a yarn.lock out of step with package.json fails the build instead of being
# quietly rewritten. Only the manifests are copied, so a source change reuses
# this layer.
COPY package.json yarn.lock .yarnrc.yml ./
COPY .yarn/releases ./.yarn/releases
RUN --mount=type=cache,target=/root/.yarn/berry/cache \
  yarn install --immutable

# ------------------------------------------------------------------ build ----
FROM deps AS build

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

COPY . .
RUN yarn build

# The build needed devDependencies; running does not - and shipping them means
# shipping mongodb-memory-server, which downloads and runs a mongod of its own.
# The webpack cache, the tests and the mongod binary mongodb-memory-server left
# in node_modules/.cache (212 MB, which prune does not touch) are build-time only.
#
# `workspaces focus --production` is Yarn 4's `npm prune --omit=dev`: it
# reinstalls the project with dependencies only, from the same lockfile.
RUN --mount=type=cache,target=/root/.yarn/berry/cache \
  yarn workspaces focus --all --production \
  && rm -rf .next/cache server/__tests__ node_modules/.cache

# ---------------------------------------------------------------- runtime ----
FROM node:${NODE_VERSION}-slim AS runtime

WORKDIR /app

# ffmpeg and qpdf are the video/audio and PDF compressors; sharp ships its own
# binaries. Compression degrades gracefully without them, but the image is the
# one place we can guarantee they exist. First, so code changes reuse the layer.
RUN apt-get update \
  && apt-get install -y --no-install-recommends ffmpeg qpdf \
  && rm -rf /var/lib/apt/lists/*

# Baked in, not left to the environment: server.js starts the Next dev server -
# compiling pages on request - whenever NODE_ENV is not "production".
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Only what the server loads at runtime. src/ is compiled into .next, so the
# sources, build configs and tooling stay behind in the build stage.
#
# Everything is root-owned and so read-only to the app, with one exception:
# Next writes its runtime cache under .next, so that directory alone belongs to
# the `node` user. `--chown` on the copy, not a `chown -R` afterwards, which
# would duplicate every file into another layer.
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/next.config.js /app/server.js ./
COPY --from=build /app/server ./server
COPY --from=build /app/shared ./shared
COPY --from=build /app/public ./public
COPY --from=build --chown=node:node /app/.next ./.next

# Uploads and PDF scratch files go to /tmp, which any user can write. This
# matters because ffmpeg, qpdf and sharp are all run over uploaded files.
USER node

# Both the pages and the API are served from this one port. The renderer is a
# separate container reached over the internal compose network.
EXPOSE 3000

# /api/health reports the database connection too, so an instance that cannot
# reach mongo is reported unhealthy rather than merely alive.
HEALTHCHECK --interval=30s --timeout=3s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3000)+'/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# node as PID 1, not yarn: signals reach the shutdown handlers in server.js
# directly, and a clean stop exits 0 instead of yarn reporting the SIGTERM as a
# failed command. (The runtime has no Yarn release, and the start script would
# also need cross-env, a devDependency.)
CMD ["node", "server.js"]
