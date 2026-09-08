const { ApiError } = require("../utils/api-error");

/**
 * Runs a zod schema over one part of the request and replaces it with the
 * parsed (coerced, defaulted, stripped) result, so controllers can trust their
 * input. Rejects with a 400 carrying per-field messages.
 */
const validate = (schema, source = "body") => (req, res, next) => {
  const result = schema.safeParse(req[source]);

  if (!result.success) {
    const details = result.error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    }));
    return next(ApiError.badRequest(details[0]?.message || "Invalid request", details));
  }

  // req.query is a getter in Express 5 but writable in 4; assign defensively.
  if (source === "query") {
    req.validatedQuery = result.data;
  } else {
    req[source] = result.data;
  }
  next();
};

module.exports = { validate };
