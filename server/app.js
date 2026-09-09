// app.js - the Express sub-application mounted at /api by the custom server.
//
// Note that this app is mounted, not listened on: paths declared here are
// relative to /api, and middleware registered here applies only to API
// requests, never to the Next.js pages served alongside them.

const express = require("express");
const helmet = require("helmet");
const cookieParser = require("cookie-parser");

const { checkinLogger, errorHandler, notFound } = require("./middleware");
const { asyncTryCatchWrapper } = require("./wrapper/async-trycatch");
const { router } = require("./routes");

const apiApp = express();

// security
apiApp.disable("x-powered-by");
apiApp.use(helmet());
apiApp.use(cookieParser());
// content parsing
// 1mb, because an import posts a whole file as a string.
apiApp.use(express.json({ limit: "1mb" }));
apiApp.use(express.urlencoded({ extended: true }));
// REST activity logger
apiApp.use(checkinLogger);

apiApp.get(
  "/",
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json({ message: "Hello World!" });
  })
);

/**
 * Liveness *and* readiness in one: `status` is "ok" only when the database is
 * actually connected, so a load balancer can use it to take a broken instance
 * out of rotation. Deliberately unauthenticated and free of account data.
 */
apiApp.get(
  "/health",
  asyncTryCatchWrapper(async (req, res) => {
    const { Mongoose } = require("./db.config");
    const states = ["disconnected", "connected", "connecting", "disconnecting"];
    const state = Mongoose.connection?.readyState ?? 0;
    const database = states[state] || "unknown";
    const healthy = state === 1;

    res.status(healthy ? 200 : 503).json({
      status: healthy ? "ok" : "degraded",
      version: require("../package.json").version,
      environment: process.env.NODE_ENV || "development",
      uptimeSeconds: Math.round(process.uptime()),
      database,
      time: new Date().toISOString(),
      requestId: req.id,
    });
  })
);

apiApp.use("/", router);

// error handler
apiApp.use(errorHandler);
apiApp.use(notFound);

module.exports = { apiApp };
