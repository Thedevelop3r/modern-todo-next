// pdf.routes.js - the four PDF endpoints, mounted under a subject's router.
//
// Todos and projects get identical routes over the same controller, so they are
// declared once here and mounted twice. The alternative - the same eight
// handlers copied into two route files - is how the two quietly drift apart.

const crypto = require("node:crypto");

const { asyncTryCatchWrapper } = require("../wrapper/async-trycatch");
const { PdfController } = require("../controller");
const { jobRegistry, RENDER_JOB } = require("../services/job-registry");

/** A v4 UUID, the only shape a client-supplied job id may take. */
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/**
 * Declare /:id/pdfs on `router` for one kind of subject.
 *
 * Mount this before the router's own `/:id` handlers: Express matches in
 * declaration order, and a late mount would be fine here only by accident of
 * path length.
 */
function mountPdfRoutes(router, kind) {
  router.get(
    "/:id/pdfs",
    asyncTryCatchWrapper(async (req, res) => {
      res.status(200).json(await PdfController.list({ kind, refId: req.params.id, userId: req.user._id }));
    })
  );

  /**
   * Start a render. Answers 202 with the job id rather than waiting: a render
   * takes the better part of a second and the client watches the same SSE
   * stream an upload uses, so holding the request open would buy nothing and
   * cost a connection.
   */
  router.post(
    "/:id/pdfs",
    asyncTryCatchWrapper(async (req, res) => {
      const supplied = req.get("X-Job-Id");
      const jobId = supplied && UUID.test(supplied) ? supplied : crypto.randomUUID();

      // Ownership is checked here, inside the request, so a subject that is not
      // the caller's still answers 404 rather than 202 and a silent failure.
      const subject = await PdfController.subject({ kind, refId: req.params.id, userId: req.user._id });

      jobRegistry.start({
        jobId,
        ownerId: req.user._id,
        filename: `${subject.name || subject.title || "document"}.pdf`,
        totalBytes: 0,
        phases: RENDER_JOB,
        state: "rendering",
      });

      // Deliberately not awaited - the response is the job id. Failures reach
      // the client over the events stream, which is also where progress lives.
      PdfController.generate({
        kind,
        refId: req.params.id,
        userId: req.user._id,
        user: req.user,
        jobId,
        requestId: req.id,
      }).catch((error) => {
        console.warn(`pdf generation failed (${req.id}): ${error.message}`);
      });

      res.status(202).json({ jobId, version: subject.pdfVersionSeq + 1 });
    })
  );

  /** The bytes, as a download. Streamed by the file controller, Range and all. */
  router.get(
    "/:id/pdfs/:pdfId",
    asyncTryCatchWrapper(async (req, res) => {
      await PdfController.stream({
        kind,
        refId: req.params.id,
        pdfId: req.params.pdfId,
        userId: req.user._id,
        req,
        res,
        // Inline is what the preview iframe needs; ?download=1 forces the dialog.
        download: req.query.download === "1" || req.query.download === "true",
      });
    })
  );

  router.delete(
    "/:id/pdfs/:pdfId",
    asyncTryCatchWrapper(async (req, res) => {
      res.status(200).json(
        await PdfController.destroy({
          kind,
          refId: req.params.id,
          pdfId: req.params.pdfId,
          userId: req.user._id,
        })
      );
    })
  );
}

module.exports = { mountPdfRoutes };
