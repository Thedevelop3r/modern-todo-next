/**
 * Test harness: an in-memory MongoDB plus a supertest agent per user, so tests
 * exercise the real Express app (validation, auth, controllers) end to end.
 *
 * Set MONGO_TEST_URL to run against a real MongoDB instead of downloading the
 * mongodb-memory-server binary.
 */

process.env.NODE_ENV = "test";
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret-value";
process.env.DISABLE_RATE_LIMIT = process.env.DISABLE_RATE_LIMIT || "true";

const mongoose = require("mongoose");
const request = require("supertest");

let memoryServer = null;

async function connect() {
  let uri = process.env.MONGO_TEST_URL;

  if (!uri) {
    const { MongoMemoryServer } = require("mongodb-memory-server");
    memoryServer = await MongoMemoryServer.create();
    uri = memoryServer.getUri();
  }

  await mongoose.connect(uri);
}

async function disconnect() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop();
}

async function reset() {
  // Every collection in the database, not just the ones with a model: GridFS
  // creates files.files and files.chunks on first use, and leftover chunks
  // would otherwise leak from one test into the next.
  const collections = await mongoose.connection.db.collections();
  await Promise.all(collections.map((collection) => collection.deleteMany({})));
}

/** The Express API mounted exactly as the custom server mounts it. */
function makeApp() {
  const express = require("express");
  const { apiApp } = require("../app");
  const app = express();
  app.use("/api", apiApp);
  return app;
}

/**
 * Registers and logs in a user, returning an agent that carries their cookie -
 * the natural way to assert that one user cannot touch another's data.
 */
async function makeUser(app, overrides = {}) {
  const suffix = Math.random().toString(36).slice(2, 8);
  const credentials = {
    name: overrides.name || `Test User ${suffix}`,
    email: overrides.email || `user-${suffix}@example.com`,
    password: overrides.password || "password123",
  };

  const agent = request.agent(app);
  await agent.post("/api/user/register").send(credentials).expect(201);
  const login = await agent.post("/api/user/login").send({
    email: credentials.email,
    password: credentials.password,
  });

  return { agent, credentials, user: login.body };
}

const createTodo = (agent, overrides = {}) =>
  agent
    .post("/api/todo")
    .send({ title: "A todo", ...overrides })
    .expect(201)
    .then((res) => res.body);

module.exports = { connect, disconnect, reset, makeApp, makeUser, createTodo, request };
