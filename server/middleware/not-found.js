
async function notFound(req, res, next) {
  res.status(404).json({
    message: "Not Found",
    requestId: req.id,
  });
}

module.exports = { notFound: notFound };
