// Pdf.controller.js - generating, listing and deleting rendered documents.
//
// A generated PDF is two records: the bytes, stored through the same GridFS
// path as any upload (so it counts against the quota and streams with Range
// like everything else), and a GeneratedPdf row holding the version number and
// what it was rendered from. They are created and deleted together; a version
// pointing at bytes that are gone is worse than no version at all.

const crypto = require("node:crypto");
const fsp = require("node:fs/promises");
const path = require("node:path");

const { GeneratedPdf, StoredFile, Todo, Project, User } = require("../models");
const { ApiError } = require("../utils/api-error");
const { deleteBytes } = require("../utils/gridfs");
const { FileController } = require("./File.controller");
const { StorageController } = require("./Storage.controller");
const { tempDir } = require("../services/storage-sweep");
const { jobRegistry, RENDER_JOB } = require("../services/job-registry");
const pdfClient = require("../services/pdf.client");
const { FILE_FLAGS } = require("../config/storage");
const { variant: variantFor, fieldsFor, DEFAULT_VARIANT } = require("../config/variants");

const PALETTES = require("../../shared/themes.generated.json").palettes;

/** Which model owns each subject, and what the filename stem calls it. */
const SUBJECTS = {
  todo: { model: Todo, prefix: "TODO", label: "Todo" },
  project: { model: Project, prefix: "PROJ", label: "Project" },
};

/**
 * Status and priority words come from the variant, not from here.
 *
 * A restaurant's "To prep" and a school's "Not started" are the same status;
 * printing one vocabulary on every PDF would undo the whole registry. "None"
 * still renders as a dash - an absent priority is not a word.
 */
const statusLabel = (variantId, status) => variantFor(variantId).statusLabels?.[status] || status || "";

const priorityLabel = (variantId, priority) =>
  priority && priority !== "none" ? variantFor(variantId).priorityLabels?.[priority] || priority : "—";

/** "12 Sep 2026, 14:30" - readable in any locale that reads Latin script. */
const formatDateTime = (value) =>
  value
    ? new Date(value).toLocaleString("en-GB", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

const formatDate = (value) =>
  value ? new Date(value).toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) : "";

/** The stem users already see as "Reference" on the detail page. */
const reference = (id) => String(id).slice(-6);

/** `20260912-1430`, in UTC, so two machines agree on the name. */
function timestampStem(date) {
  const iso = new Date(date).toISOString();
  return `${iso.slice(0, 4)}${iso.slice(5, 7)}${iso.slice(8, 10)}-${iso.slice(11, 13)}${iso.slice(14, 16)}`;
}

/** Lowercase, hyphenated, ASCII, 40 characters - safe in any downloads folder. */
function slug(title) {
  return (
    String(title || "")
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40)
      .replace(/-+$/, "") || "untitled"
  );
}

/**
 * TODO-6f3a1b-v03-20260912-1430-quarterly-safety-review.pdf
 *
 * Sorts naturally in a downloads folder, says what it came from, is unambiguous
 * across versions, and carries no more of the record than its title.
 */
function pdfFilename({ kind, id, version, at, title }) {
  const { prefix } = SUBJECTS[kind];
  const number = String(version).padStart(2, "0");
  return `${prefix}-${reference(id)}-v${number}-${timestampStem(at)}-${slug(title)}.pdf`;
}

/**
 * The hash behind "up to date with the current todo".
 *
 * Only the content is hashed - not the timestamp, the version or the request
 * id - or every render would differ from every other one and the hint would be
 * noise.
 */
function snapshotHash(payload) {
  const { document, theme, template } = payload;
  const stable = { document, theme, template, organization: payload.meta?.organization || "" };
  return crypto.createHash("sha256").update(JSON.stringify(stable)).digest("hex");
}

/** One variant field's stored value as the text a PDF prints. */
function formatFieldValue(field, value) {
  if (value === null || value === undefined || value === "") return "";

  switch (field.type) {
    case "boolean":
      return value ? "Yes" : "No";
    case "date":
      return formatDate(value);
    case "enum":
      return field.options?.find((option) => (option.value ?? option) === value)?.label || String(value);
    case "checklist": {
      const items = Array.isArray(value) ? value : [];
      return items.length ? `${items.filter((item) => item.done).length} of ${items.length} done` : "";
    }
    default:
      return String(value);
  }
}

/**
 * The variant's own fields for one record, split into the grid and the band.
 *
 * Which keys are elevated is declared in the registry (`pdfHighlights`), not
 * decided here: this function is the same for every variant, and a variant that
 * elevates nothing simply gets an empty band.
 */
function variantFieldsFor({ variantId, scope, record }) {
  const definitions = fieldsFor(variantId, scope);
  if (!definitions.length) return { fields: [], highlights: [], banner: "" };

  const stored = record.variantData?.[variantId] || {};
  const elevated = variantFor(variantId).pdfHighlights || [];
  const bannerKey = variantFor(variantId).pdfBannerField || null;

  const fields = [];
  for (const definition of definitions) {
    // Elevated and banner values print elsewhere; repeating them in the grid
    // would say the same thing twice on one page.
    if (elevated.includes(definition.key) || definition.key === bannerKey) continue;
    // An empty grid field is noise; an empty highlight is not - see below.
    const value = formatFieldValue(definition, stored[definition.key]);
    if (value) fields.push({ label: definition.label, value });
  }

  // In the order the registry lists them, not the order the fields happen to be
  // defined in: the band is a sentence ("42 out of 50, worth 15%") and the
  // variant is the thing that knows how it reads. A blank value still prints -
  // an unmarked assignment saying nothing under "Score" is information.
  const highlights = elevated
    .map((key) => definitions.find((definition) => definition.key === key))
    .filter(Boolean)
    .map((definition) => ({ label: definition.label, value: formatFieldValue(definition, stored[definition.key]) }));

  // The handling marking, if this variant declares one. It is a field like any
  // other; what makes it a banner is the registry naming it, not its value.
  const bannerField = bannerKey ? definitions.find((definition) => definition.key === bannerKey) : null;
  const banner = bannerField ? formatFieldValue(bannerField, stored[bannerField.key]) : "";

  return { fields, highlights, banner };
}

/** Bytes as a person reads them, for a manifest row. */
const humanSize = (bytes) => {
  if (!bytes) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(units.length - 1, Math.floor(Math.log(bytes) / Math.log(1024)));
  const value = bytes / 1024 ** index;
  return `${index === 0 ? value : Math.round(value * 10) / 10} ${units[index]}`;
};

/**
 * The attachments on a record, as a manifest.
 *
 * Only the variants that ask for it get one - `capabilities` says which - but
 * nothing here is variant-specific: it is the same attachment list every record
 * already has, printed with the checksum each file was stored under so a
 * printed sheet can be checked against the bytes years later.
 */
async function manifestFor({ kind, refId, userId }) {
  const files = await StoredFile.find({
    ownerId: userId,
    "scope.kind": kind,
    "scope.refId": refId,
    state: "ready",
    source: "upload",
  })
    .sort({ createdAt: 1 })
    .select("filename kind storedSize checksum createdAt")
    .lean();

  return files.map((file) => ({
    title: file.filename,
    status: file.kind,
    priority: humanSize(file.storedSize),
    // The first twelve hex characters are plenty to check a sheet against a
    // file, and a full sha256 does not fit in a printed column.
    due: (file.checksum || "").slice(0, 12),
  }));
}

/**
 * The order sheet for a set of records: everything below its par level.
 *
 * The same rule the Orders page uses, and for the same reason - a record with
 * no par level is not stock and is left out, while a missing count is zero,
 * which is exactly the case an order sheet exists for.
 */
function orderLines({ variantId, records }) {
  const definitions = fieldsFor(variantId, "todo");
  const par = definitions.find((field) => field.key === "parLevel");
  const onHand = definitions.find((field) => field.key === "onHand");
  if (!par || !onHand) return [];

  return records
    .map((record) => {
      const stored = record.variantData?.[variantId] || {};
      const target = stored.parLevel;
      if (typeof target !== "number" || target <= 0) return null;

      const count = typeof stored.onHand === "number" ? stored.onHand : 0;
      if (count >= target) return null;

      return {
        title: record.title,
        status: String(stored.supplier || ""),
        priority: `${count} / ${target}`,
        due: String(Math.round((target - count) * 100) / 100),
      };
    })
    .filter(Boolean)
    .sort((a, b) => Number(b.due) - Number(a.due));
}

/** The account's palette as resolved hex, which is all the renderer can use. */
function themeFor(user) {
  const palette = PALETTES[user?.preferences?.themeId] || PALETTES.indigo;
  // A PDF is printed on white paper far more often than it is read on a screen,
  // so it always takes the light half of the palette - a dark theme would burn
  // a page of toner and read worse in every viewer's default.
  return palette?.light || {};
}

class Pdf {
  /** The subject, or a 404 that does not say whether it exists for someone else. */
  static async subject({ kind, refId, userId }) {
    const entry = SUBJECTS[kind];
    if (!entry) throw ApiError.badRequest("Unknown document type");

    const record = await entry.model.findOne({ _id: refId, ownerId: userId });
    if (!record) throw ApiError.notFound(`${entry.label} not found`);
    return record;
  }

  /** One subject's versions, newest first. */
  static async list({ kind, refId, userId }) {
    await Pdf.subject({ kind, refId, userId });

    const versions = await GeneratedPdf.find({
      ownerId: userId,
      "subject.kind": kind,
      "subject.refId": refId,
    })
      .sort({ version: -1 })
      .lean();

    // The hash of what a render *now* would produce, so the client can say
    // whether the newest version still matches the record.
    const current = await Pdf.currentHash({ kind, refId, userId });
    return versions.map((version) => ({ ...version, current: version.snapshotHash === current }));
  }

  /** Build the payload a render would use right now, without rendering it. */
  static async payloadFor({ kind, refId, userId, user, version = 1, requestId = "" }) {
    const record = await Pdf.subject({ kind, refId, userId });
    const account = user || (await User.findById(userId).select("name email preferences"));
    const theme = themeFor(account);

    if (kind === "project") {
      // A project's own variant wins over the account's, exactly as it does
      // everywhere else; the template comes from the registry, not a branch.
      const variantKey = variantFor(
        record.applicationType || account?.preferences?.applicationType || DEFAULT_VARIANT
      ).id;
      const variant = variantFor(variantKey).pdfTemplate;
      const todos = await Todo.find({ ownerId: userId, projectId: refId, archived: false })
        .sort({ order: 1, createdAt: 1 })
        .limit(200)
        .select("title status priority dueDate")
        .lean();

      const variantExtras = variantFieldsFor({ variantId: variantKey, scope: "project", record });

      // A station prints its prep and the order it generates on one sheet; a
      // variant that does not declare `ordering` prints only the first.
      const orders = variantFor(variantKey).capabilities?.includes("ordering")
        ? orderLines({
            variantId: variantKey,
            records: await Todo.find({ ownerId: userId, projectId: refId, archived: false })
              .select("title variantData")
              .lean(),
          })
        : [];

      return pdfClient.buildProjectPayload({
        project: record,
        todos: todos.map((todo) => ({
          title: todo.title,
          status: statusLabel(variantKey, todo.status),
          priority: priorityLabel(variantKey, todo.priority),
          due: formatDate(todo.dueDate),
        })),
        user: account,
        theme,
        variant,
        meta: {
          requestId,
          generatedAt: formatDateTime(Date.now()),
          createdLabel: formatDate(record.createdAt),
          reference: reference(refId),
          version,
          recordsLabel: variantFor(variantKey).terms?.todo?.many || "Todos",
          variantFields: variantExtras.fields,
          highlights: variantExtras.highlights,
          banner: variantExtras.banner,
          notice: variantFor(variantKey).notice?.body || "",
          secondary: orders,
          secondaryHeadings: orders.length ? ["Item", "Supplier", "On hand / par", "Order"] : [],
        },
      });
    }

    const project = record.projectId
      ? await Project.findOne({ _id: record.projectId, ownerId: userId })
          .select("name organizationName applicationType")
          .lean()
      : null;

    const variantKey = variantFor(
      project?.applicationType || account?.preferences?.applicationType || DEFAULT_VARIANT
    ).id;
    const variant = variantFor(variantKey).pdfTemplate;
    const variantExtras = variantFieldsFor({ variantId: variantKey, scope: "todo", record });

    // A manifest is printed only where the variant says its documents carry
    // one - every other variant's PDF is unchanged.
    const manifest = variantFor(variantKey).capabilities?.includes("custody")
      ? await manifestFor({ kind: "todo", refId, userId })
      : [];

    return pdfClient.buildTodoPayload({
      todo: record,
      project,
      user: account,
      theme,
      variant,
      meta: {
        requestId,
        generatedAt: formatDateTime(Date.now()),
        reference: reference(refId),
        version,
        statusLabel: statusLabel(variantKey, record.status),
        priorityLabel: priorityLabel(variantKey, record.priority),
        dueLabel: formatDate(record.dueDate),
        startLabel: formatDate(record.startDate),
        timeLabel: record.timeSpent ? `${Math.round((record.timeSpent / 60) * 10) / 10} h` : "",
        variantFields: variantExtras.fields,
        highlights: variantExtras.highlights,
        banner: variantExtras.banner,
        notice: variantFor(variantKey).notice?.body || "",
        items: manifest,
        itemHeadings: manifest.length ? ["Exhibit", "Type", "Size", "Checksum"] : [],
      },
    });
  }

  /** What a render right now would hash to. Used for the up-to-date hint. */
  static async currentHash({ kind, refId, userId, user }) {
    const payload = await Pdf.payloadFor({ kind, refId, userId, user });
    return snapshotHash(payload);
  }

  /**
   * Render one version and store it.
   *
   * The version number is allocated with $inc on the subject *before* the
   * render: counting existing rows would hand two near-simultaneous clicks the
   * same number, and a version is cheap to burn but expensive to duplicate.
   */
  static async generate({ kind, refId, userId, user, jobId, requestId = "" }) {
    const entry = SUBJECTS[kind];
    if (!entry) throw ApiError.badRequest("Unknown document type");

    const allocated = await entry.model.findOneAndUpdate(
      { _id: refId, ownerId: userId },
      { $inc: { pdfVersionSeq: 1 } },
      { new: true }
    );
    if (!allocated) throw ApiError.notFound(`${entry.label} not found`);

    const version = allocated.pdfVersionSeq;
    const generatedAt = new Date();
    const payload = await Pdf.payloadFor({ kind, refId, userId, user, version, requestId });
    const filename = pdfFilename({ kind, id: refId, version, at: generatedAt, title: allocated.name || allocated.title });

    jobRegistry.update(jobId, { phase: "render", determinate: false, state: "rendering" });

    const startedAt = Date.now();
    let bytes;
    try {
      bytes = await pdfClient.render(payload);
    } catch (error) {
      // The bar is watching this job; a renderer that is down has to end it.
      jobRegistry.finish(jobId, { state: "failed", error: String(error.message).slice(0, 300) });
      throw error;
    }
    const renderMs = Date.now() - startedAt;

    const scratch = tempDir();
    const tempFile = path.join(scratch, `${jobId}.pdf`);
    let reservationHeld = false;
    let stored = null;

    try {
      await fsp.writeFile(tempFile, bytes);
      await StorageController.reserve(userId, bytes.length);
      reservationHeld = true;

      stored = await StoredFile.create({
        ownerId: userId,
        scope: { kind, refId },
        kind: "pdf",
        source: "generated",
        filename,
        mime: "application/pdf",
        originalSize: bytes.length,
        // Already as small as typst makes it; running qpdf over it would spend
        // CPU to save nothing.
        compression: { requested: false, note: "generated" },
        flags: FILE_FLAGS.INLINE_SAFE | FILE_FLAGS.PROBED,
        variant: payload.template,
        jobId,
        state: "storing",
      });

      jobRegistry.update(jobId, { phase: "store", fraction: 0, determinate: true, state: "storing", fileId: stored._id });

      const gridfsId = await FileController.writeBytes({
        source: tempFile,
        stored,
        onProgress: (written) =>
          jobRegistry.update(jobId, { phase: "store", fraction: written / bytes.length, determinate: true }),
      });

      stored.gridfsId = gridfsId;
      stored.storedSize = bytes.length;
      stored.checksum = crypto.createHash("sha256").update(bytes).digest("hex");
      stored.state = "ready";
      await stored.save();

      // Reserved exactly what was written, so nothing is owed either way.
      reservationHeld = false;

      const record = await GeneratedPdf.create({
        ownerId: userId,
        subject: { kind, refId },
        fileId: stored._id,
        version,
        variant: payload.template,
        template: payload.template,
        filename,
        sizeBytes: bytes.length,
        snapshotHash: snapshotHash(payload),
        snapshotTitle: String(allocated.name || allocated.title || "").slice(0, 200),
        generatedBy: { userId, name: user?.name || user?.email || "" },
        generatedAt,
        renderMs,
      });

      jobRegistry.finish(jobId, { fileId: stored._id, state: "ready" });
      return record;
    } catch (error) {
      if (stored) {
        await deleteBytes(stored.gridfsId).catch(() => {});
        await StoredFile.deleteOne({ _id: stored._id });
      }
      if (reservationHeld) await StorageController.release(userId, bytes.length);
      jobRegistry.finish(jobId, { state: "failed", error: String(error.message).slice(0, 300) });
      throw error;
    } finally {
      await fsp.unlink(tempFile).catch(() => {});
    }
  }

  /** One version's record, scoped to its subject so an id cannot be borrowed. */
  static async show({ kind, refId, pdfId, userId }) {
    const record = await GeneratedPdf.findOne({
      _id: pdfId,
      ownerId: userId,
      "subject.kind": kind,
      "subject.refId": refId,
    });
    if (!record) throw ApiError.notFound("That version does not exist");
    return record;
  }

  /** Stream one version's bytes, through the same path every file download takes. */
  static async stream({ kind, refId, pdfId, userId, req, res, download = true }) {
    const record = await Pdf.show({ kind, refId, pdfId, userId });
    await FileController.stream({ fileId: record.fileId, userId, req, res, download });
  }

  /**
   * Delete one version for good.
   *
   * Versions are never pruned automatically - keeping ten is the owner's call,
   * and so is losing one. The number is not reused: v4 stays taken even once
   * v4 is gone, so a file already in someone's downloads folder is never
   * ambiguous.
   */
  static async destroy({ kind, refId, pdfId, userId }) {
    const record = await Pdf.show({ kind, refId, pdfId, userId });

    // Bytes first: the reverse leaves chunks nothing can reach and no quota
    // ever credits back.
    const file = await StoredFile.findOne({ _id: record.fileId, ownerId: userId });
    if (file) {
      await deleteBytes(file.gridfsId).catch(() => {});
      await StoredFile.deleteOne({ _id: file._id });
      await StorageController.reconcile(userId, -(file.storedSize || 0));
    }
    await GeneratedPdf.deleteOne({ _id: record._id });

    return { deleted: true, version: record.version, freedBytes: file?.storedSize || 0 };
  }
}

module.exports = {
  PdfController: Pdf,
  // Exported for the tests that cover them directly.
  pdfFilename,
  snapshotHash,
  slug,
};
