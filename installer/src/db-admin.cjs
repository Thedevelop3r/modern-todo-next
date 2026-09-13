// Run by the installer's background supervisor, with the application's own
// MongoDB driver.
//
//   create-user  makes the one user the application connects as. MongoDB's
//                localhost exception allows that only while no user exists.
//   shutdown     stops the database cleanly. On Windows there is no signal
//                for that.
"use strict";

const path = require("node:path");

const { MongoClient } = require(
  require.resolve("mongodb", { paths: [process.cwd(), path.join(process.cwd(), "node_modules", "mongoose")] })
);

const { DB_PORT: port, DB_USER: user, DB_PASSWORD: password } = process.env;
const host = `127.0.0.1:${port}`;
const options = { serverSelectionTimeoutMS: 15000, directConnection: true };

const authenticatedUrl = () =>
  `mongodb://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}/?authSource=admin`;

/** Run on every start: cheap, and right whatever state the database is in. */
async function createUser() {
  const client = new MongoClient(`mongodb://${host}/`, options);
  await client.connect();
  try {
    await client.db("admin").command({
      createUser: user,
      pwd: password,
      // The localhost exception accepts nothing narrower than root for the
      // first user. The database only listens on 127.0.0.1, and this password
      // sits beside the application's own settings either way.
      roles: [{ role: "root", db: "admin" }],
    });
    console.log("user created");
    return;
  } catch (error) {
    // 13: a user exists, so the exception is closed. It may well be ours.
    if (error.code !== 13 && error.code !== 51003) throw error;
  } finally {
    await client.close();
  }

  const check = new MongoClient(authenticatedUrl(), options);
  try {
    await check.connect();
    await check.db("admin").command({ ping: 1 });
    console.log("user already exists");
  } catch (error) {
    throw new Error(`the database has users, but the password in source/.env does not match them (${error.message})`);
  } finally {
    await check.close();
  }
}

async function shutdown() {
  const client = new MongoClient(authenticatedUrl(), options);
  await client.connect();
  // The server drops the connection as it goes down, so success looks like an error.
  await client.db("admin").command({ shutdown: 1 }).catch(() => {});
  await client.close().catch(() => {});
}

const actions = { "create-user": createUser, shutdown };
const action = actions[process.argv[2]];
if (!action) {
  console.error(`unknown action: ${process.argv[2]}`);
  process.exit(2);
}
action().then(
  () => process.exit(0),
  (error) => {
    console.error(error.message);
    process.exit(1);
  }
);
