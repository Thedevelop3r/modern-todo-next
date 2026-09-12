// pdf.client.js - talking to the Rust renderer.
//
// The renderer is deliberately dumb: it holds no state, reads no database and
// accepts no URLs. Everything it needs travels in one JSON body, which is also
// why attachments are inlined rather than linked - handing it a URL would mean
// minting a credential for it and turning it into an SSRF surface.

const { htmlToDoc } = require("../utils/richtext-doc");
const { ApiError } = require("../utils/api-error");

const BASE_URL = () => process.env.PDF_SERVICE_URL || "http://127.0.0.1:8787";
const KEY = () => process.env.PDF_SERVICE_KEY || "";

/** A render that has not finished by now is not going to. */
const TIMEOUT_MS = Number(process.env.PDF_TIMEOUT_MS) || 20_000;

/**
 * After this many consecutive failures the breaker opens, so a renderer that is
 * down answers immediately instead of making every request wait for a timeout.
 */
const FAILURE_THRESHOLD = 5;
const COOLDOWN_MS = 30_000;

const breaker = { failures: 0, openedAt: 0 };

const isOpen = () =>
  breaker.failures >= FAILURE_THRESHOLD && Date.now() - breaker.openedAt < COOLDOWN_MS;

function recordSuccess() {
  breaker.failures = 0;
  breaker.openedAt = 0;
}

function recordFailure() {
  breaker.failures += 1;
  if (breaker.failures >= FAILURE_THRESHOLD) breaker.openedAt = Date.now();
}

/** Resets the breaker - used by tests, and after a deliberate restart. */
function resetBreaker() {
  breaker.failures = 0;
  breaker.openedAt = 0;
}

async function health() {
  try {
    const response = await fetch(`${BASE_URL()}/health`, { signal: AbortSignal.timeout(2000) });
    return response.ok;
  } catch {
    return false;
  }
}

/**
 * Render one document. Resolves to a Buffer of PDF bytes.
 *
 * Retries exactly once, and only on a connection error - a 4xx means the
 * payload is wrong and sending it again would fail identically.
 */
async function render(payload, { attempt = 0 } = {}) {
  if (!KEY()) throw ApiError.unavailable("PDF rendering is not configured");
  if (isOpen()) throw ApiError.unavailable("PDF rendering is temporarily unavailable");

  let response;
  try {
    response = await fetch(`${BASE_URL()}/render`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Key": KEY() },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    recordFailure();
    // A connection that never landed is worth one more try; a rejected one is not.
    if (attempt === 0) return render(payload, { attempt: 1 });
    throw ApiError.unavailable(
      error?.name === "TimeoutError" ? "PDF rendering timed out" : "PDF rendering is unavailable"
    );
  }

  if (!response.ok) {
    // A 4xx is our payload's fault and will not improve on a retry.
    if (response.status >= 500) recordFailure();
    else recordSuccess();

    const detail = await response
      .json()
      .then((body) => body?.error)
      .catch(() => null);

    if (response.status === 401) throw ApiError.unavailable("PDF rendering is misconfigured");
    throw ApiError.badRequest(detail || `PDF rendering failed (${response.status})`);
  }

  recordSuccess();
  return Buffer.from(await response.arrayBuffer());
}

/** Build the renderer's payload from a todo and its surroundings. */
function buildTodoPayload({ todo, project, user, theme, meta, variant = "general" }) {
  const fields = [
    { label: "Status", value: meta.statusLabel || todo.status || "" },
    { label: "Priority", value: meta.priorityLabel || todo.priority || "" },
    { label: "Due", value: meta.dueLabel || "" },
    { label: "Project", value: project?.name || "" },
  ];
  if (meta.startLabel) fields.push({ label: "Starts", value: meta.startLabel });
  if (todo.estimate !== null && todo.estimate !== undefined) {
    fields.push({ label: "Estimate", value: `${todo.estimate} points` });
  }
  if (todo.timeSpent) fields.push({ label: "Time spent", value: meta.timeLabel || `${todo.timeSpent} min` });

  // The active variant's own fields, already labelled and formatted by the
  // caller. Nothing here knows what a course or a ward is.
  for (const field of meta.variantFields || []) fields.push(field);

  return {
    requestId: meta.requestId || "",
    template: variant,
    theme,
    meta: {
      generatedAt: meta.generatedAt,
      generatedBy: user?.name || user?.email || "",
      reference: meta.reference,
      organization: project?.organizationName || "",
      version: meta.version || 1,
    },
    document: {
      kind: "todo",
      title: todo.title || "Untitled",
      titleRuns: todo.titleHtml ? htmlToDoc(todo.titleHtml).blocks.flatMap((b) => b.runs || []) : [],
      description: htmlToDoc(todo.descriptionHtml || ""),
      fields,
      // Values the variant asked to be printed prominently rather than in the
      // grid - see `pdfHighlights` in the registry.
      highlights: meta.highlights || [],
      // A handling marking, printed on every page by the templates that honour
      // it. The value is the variant's; this client only carries it.
      banner: meta.banner || "",
      // A standing notice the variant declares, printed by the templates that
      // honour it. Empty for every variant that declares none.
      notice: meta.notice || "",
      items: meta.items || [],
      itemHeadings: meta.itemHeadings || [],
      secondary: meta.secondary || [],
      secondaryHeadings: meta.secondaryHeadings || [],
      subtasks: (todo.subtasks || []).map((subtask) => ({ title: subtask.title, done: Boolean(subtask.done) })),
      tags: todo.tags || [],
      notes: meta.notes || [],
    },
  };
}

/** Build the renderer's payload from a project and the todos inside it. */
function buildProjectPayload({ project, todos = [], user, theme, meta, variant = "general" }) {
  const done = todos.filter((todo) => todo.status === "Completed").length;

  return {
    requestId: meta.requestId || "",
    template: variant,
    theme,
    meta: {
      generatedAt: meta.generatedAt,
      generatedBy: user?.name || user?.email || "",
      reference: meta.reference,
      organization: project?.organizationName || "",
      version: meta.version || 1,
    },
    document: {
      kind: "project",
      title: project?.name || "Untitled project",
      titleRuns: [],
      description: htmlToDoc(project?.descriptionHtml || ""),
      fields: [
        // What the variant calls its records - "Prep", "Cases", "Assignments".
        { label: meta.recordsLabel || "Todos", value: String(todos.length) },
        { label: "Completed", value: `${done} of ${todos.length}` },
        { label: "Status", value: project?.archived ? "Archived" : "Active" },
        { label: "Created", value: meta.createdLabel || "" },
        ...(meta.variantFields || []),
      ],
      highlights: meta.highlights || [],
      banner: meta.banner || "",
      notice: meta.notice || "",
      // The table of todos. Pre-formatted by the caller: the renderer knows no
      // status vocabulary and does no date arithmetic.
      items: todos,
      itemHeadings: meta.itemHeadings || [],
      // A second list where the variant generates one - a station's order sheet
      // beside its prep.
      secondary: meta.secondary || [],
      secondaryHeadings: meta.secondaryHeadings || [],
      subtasks: [],
      tags: [],
      notes: meta.notes || [],
    },
  };
}

module.exports = { render, health, buildTodoPayload, buildProjectPayload, resetBreaker, FAILURE_THRESHOLD };
