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
apiApp.use(express.json());
apiApp.use(express.urlencoded({ extended: true }));
// REST activity logger
apiApp.use(checkinLogger);

apiApp.get(
  "/",
  asyncTryCatchWrapper(async (req, res) => {
    res.status(200).json({ message: "Hello World!" });
  })
);

apiApp.use("/", router);

// error handler
apiApp.use(errorHandler);
apiApp.use(notFound);

module.exports = { apiApp };
