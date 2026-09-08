// middleware error handler

const { ApiError } = require("../utils/api-error");

/* eslint-disable no-unused-vars */
async function errorHandler(err, req, res, next) {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Something went wrong";
  let details = err.details;

  // Translate the driver/ODM failures that reach here into useful answers.
  if (err.name === "ValidationError" && err.errors) {
    statusCode = 400;
    details = Object.entries(err.errors).map(([path, e]) => ({ path, message: e.message }));
    message = details[0]?.message || "Validation failed";
  } else if (err.name === "CastError") {
    statusCode = 400;
    message = `Invalid ${err.path}`;
  } else if (err.code === 11000) {
    statusCode = 409;
    const field = Object.keys(err.keyValue || {})[0] || "value";
    message = `That ${field} is already registered`;
  }

  if (statusCode >= 500) {
    // The request id ties this stack to the access-log line for the same call.
    console.error(JSON.stringify({ level: "error", requestId: req.id, message, stack: err.stack }));
  }

  // Echoing the id gives a user something to quote in a bug report.
  const payload = { message, requestId: req.id };
  if (details) payload.details = details;
  res.status(statusCode).json(payload);
}

module.exports = { errorHandler, ApiError };
