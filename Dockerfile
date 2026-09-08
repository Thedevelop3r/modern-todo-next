# syntax=docker/dockerfile:1

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-slim

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Both the pages and the API are served from this one port.
EXPOSE 3000

# build
RUN npm run build

CMD ["npm", "run", "start"]