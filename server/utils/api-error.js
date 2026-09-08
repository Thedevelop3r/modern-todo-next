/**
 * Error carrying an HTTP status, so error-handler.js can answer with something
 * better than a blanket 500.
 */
class ApiError extends Error {
  constructor(statusCode, message, details) {
    super(message);
    this.name = "ApiError";
    this.statusCode = statusCode;
    if (details) this.details = details;
  }

  static badRequest(message = "Bad request", details) {
    return new ApiError(400, message, details);
  }
  static unauthorized(message = "Please authenticate") {
    return new ApiError(401, message);
  }
  static forbidden(message = "Forbidden") {
    return new ApiError(403, message);
  }
  static notFound(message = "Not found") {
    return new ApiError(404, message);
  }
  static conflict(message = "Already exists") {
    return new ApiError(409, message);
  }
  static tooMany(message = "Too many requests") {
    return new ApiError(429, message);
  }
}

module.exports = { ApiError };
