# syntax=docker/dockerfile:1

ARG NODE_VERSION=20.11.0

FROM node:${NODE_VERSION}-alpine

# bcrypt builds a native addon; alpine needs a toolchain for it.
RUN apk add --no-cache python3 make g++

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY . .

# Both the pages and the API are served from this one port.
EXPOSE 3000

CMD ["npm", "run", "dev"]
