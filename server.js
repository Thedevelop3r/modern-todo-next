// server.js - Next.js custom server
//
// One process, one port: Express owns /api/* (the todo API) and Next.js owns
// every other request (pages, static assets, HMR). Because both are served from
// the same origin there is no CORS layer and no cross-site cookie handling.

require("dotenv").config();

const http = require("http");
const express = require("express");
const next = require("next");

const { DatabaseConnection } = require("./server/db.config");
const { apiApp } = require("./server/app");
const { Tools } = require("./server/utils/tools");
const { runStorageSweep } = require("./server/services/storage-sweep");
const { jobRegistry } = require("./server/services/job-registry");
const { startPdfService, stopPdfService } = require("./server/services/pdf-service");

const dev = process.env.NODE_ENV !== "production";
const hostname = process.env.HOSTNAME || "localhost";
const port = parseInt(process.env.PORT || "3000", 10);

const nextApp = next({ dev, hostname, port });
const nextHandler = nextApp.getRequestHandler();

async function main() {
  Tools.Fancy.Display("Starting application");
  console.log("environment:", dev ? "development" : "production");
  console.log("port:", port);

  const dbConnection = new DatabaseConnection();
  await dbConnection.connect();
  Tools.Fancy.Display("Database connected");

  // Uploads that were in flight when this process last stopped cannot be
  // resumed, so they are cleared before anything can read a stale counter.
  const swept = await runStorageSweep();
  if (swept.files || swept.temps) {
    console.log(`storage sweep: ${swept.files} interrupted file(s), ${swept.temps} temp file(s) removed`);
  }

  // The renderer is a child of this process, so it lives and dies with it.
  startPdfService();

  await nextApp.prepare();

  const server = express();
  server.disable("x-powered-by");

  // The API. Mounted first so /api/* never reaches the Next.js handler.
  server.use("/api", apiApp);

  // Everything else - pages, _next assets, HMR - belongs to Next.js.
  server.all("*", (req, res) => nextHandler(req, res));

  const httpServer = http.createServer(server);

  const shutdown = async (signal) => {
    Tools.Fancy.Display(`Received ${signal}, shutting down`);
    httpServer.close();
    // Kill any ffmpeg still running and close the progress streams, before the
    // database they would try to write to disappears.
    jobRegistry.abortAll();
    stopPdfService();
    await dbConnection.disconnect();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  httpServer.listen(port, () => {
    Tools.Fancy.Display(`Server listening on http://${hostname}:${port}`);
  });
}

main().catch((err) => {
  Tools.Fancy.DisplayError("Failed to start application:", err);
  process.exit(1);
});
