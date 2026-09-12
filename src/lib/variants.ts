import { DEFAULT_VARIANT_ID, VARIANT_CATALOGUE } from "./variants.generated.ts";

/**
 * The application variants.
 *
 * One account runs the app as General, School, Law Enforcement, Hospital or
 * Restaurant. Exactly three things vary: the words on screen, the extra fields
 * a record carries, and its presentation (icon, PDF template, seed templates).
 *
 * **No component branches on the variant id.** Components ask this registry
 * what things are called and which fields exist, and render generically - the
 * moment a variant needs a component change, the registry is wrong. That rule
 * is what keeps a new variant a JSON file rather than a patch across the app.
 *
 * This module is pure, so it is covered by `npm run test:web`.
 */

/** The closed set of field types. VariantFields renders exactly these seven. */
export type VariantFieldType = "string" | "text" | "number" | "date" | "enum" | "boolean" | "checklist";

export type VariantFieldOption = { value: string; label: string };

export type VariantField = {
  key: string;
  label: string;
  type: VariantFieldType;
  hint?: string;
  placeholder?: string;
  /** `enum` only. */
  options?: VariantFieldOption[];
  /** `number` bounds, or the maximum length of a `string`/`text`. */
  min?: number;
  max?: number;
};

export type TermKey = "todo" | "project" | "template" | "tag";
export type Term = { one: string; many: string };

/**
 * A page a variant adds to the sidebar.
 *
 * The `kind` is what keeps this generic: a page is rendered by one of a small
 * set of renderers, parameterised by field keys from the same registry. A
 * variant that needs a genuinely new shape adds a *kind* - it never adds a page
 * component of its own, and nothing renders by looking at the variant id.
 *
 * - `group`      one list per distinct value of `groupBy`.
 * - `scoreboard` `group`, plus the weighted score each group has earned.
 * - `files`      the stored files, each with the trail of what happened to it.
 * - `stock`      `group`, narrowed to what is below its par level.
 */
export type VariantPageKind = "group" | "scoreboard" | "files" | "stock";

export type VariantPage = {
  id: string;
  label: string;
  icon: string;
  kind: VariantPageKind;
  description?: string;
  /** The todo field whose value defines a group. */
  groupBy: string;
  /** What to call records that have no value for it. */
  emptyLabel?: string;
  /** `scoreboard` only: which fields carry the marks. */
  scoreField?: string;
  maxField?: string;
  weightField?: string;
  /** `stock` only: which fields carry the target and the count. */
  parField?: string;
  onHandField?: string;
};

/**
 * A standing notice a variant shows wherever its work is done.
 *
 * Declared here rather than written into a component because it is a property
 * of the variant, not of any one page - and because a notice that lives in one
 * component is a notice that will be missed on the next page someone adds.
 */
export type VariantNotice = { title: string; body: string };

export type Variant = {
  id: string;
  label: string;
  description: string;
  /** Resolved through a static record in VariantIcon - never a dynamic import. */
  icon: string;
  capabilities: string[];
  notice?: VariantNotice;
  terms: Record<TermKey, Term>;
  statusLabels: Record<TodoStatus, string>;
  priorityLabels: Record<TodoPriority, string>;
  /** Which `.typ` template the renderer uses for this variant's documents. */
  pdfTemplate: string;
  /** Field keys the PDF prints as a prominent band rather than in the grid. */
  pdfHighlights: string[];
  /** The field whose value is printed on every page as a handling marking. */
  pdfBannerField?: string;
  todoFields: VariantField[];
  projectFields: VariantField[];
  pages: VariantPage[];
  seedTemplates: Array<{ name: string; title: string; description?: string }>;
};

export const VARIANTS: Variant[] = VARIANT_CATALOGUE;

export const VARIANT_IDS: string[] = VARIANTS.map((variant) => variant.id);

export const DEFAULT_VARIANT = DEFAULT_VARIANT_ID;

const BY_ID = new Map(VARIANTS.map((variant) => [variant.id, variant]));

/** The variant record. An unknown id falls back rather than throwing: a stored
 *  preference from a build that knew more variants must not break the app. */
export function getVariant(id?: string | null): Variant {
  return (id && BY_ID.get(id)) || (BY_ID.get(DEFAULT_VARIANT) as Variant);
}

/** Which variant is in force: the project's override, then the account's. */
export function resolveVariant(
  user?: { preferences?: { applicationType?: string } } | null,
  project?: { applicationType?: string | null } | null
): Variant {
  return getVariant(project?.applicationType || user?.preferences?.applicationType);
}

/**
 * What this variant calls something.
 *
 * `term(variant, "todo", "many")` is the only way a label reaches the screen -
 * "Todos" is hardcoded nowhere.
 */
export function term(variant: Variant, key: TermKey, count: "one" | "many" = "one"): string {
  return variant.terms[key]?.[count] || getVariant(DEFAULT_VARIANT).terms[key][count];
}

/** The same word in lower case, for mid-sentence use ("No todos yet"). */
export const lowerTerm = (variant: Variant, key: TermKey, count: "one" | "many" = "one") =>
  term(variant, key, count).toLowerCase();

export const statusLabel = (variant: Variant, status: TodoStatus) =>
  variant.statusLabels[status] || getVariant(DEFAULT_VARIANT).statusLabels[status];

export const priorityLabel = (variant: Variant, priority: TodoPriority) =>
  variant.priorityLabels[priority] || getVariant(DEFAULT_VARIANT).priorityLabels[priority];

export const variantFields = (variant: Variant, scope: "todo" | "project" = "todo") =>
  scope === "project" ? variant.projectFields : variant.todoFields;

/**
 * Variants other than the active one that this record carries data for.
 *
 * Switching variants hides fields; it never deletes them. The detail page shows
 * what is still there, which is the visible proof nothing was lost.
 */
export function dormantVariants(
  variantData: Record<string, Record<string, unknown>> | undefined | null,
  activeId: string
): Array<{ variant: Variant; values: Record<string, unknown> }> {
  if (!variantData) return [];

  return Object.entries(variantData)
    .filter(([id, values]) => id !== activeId && values && Object.keys(values).length > 0)
    .map(([id, values]) => ({ variant: getVariant(id), values: values as Record<string, unknown> }));
}

// ------------------------------------------------------- variant pages ----

/** A record's value for one variant field, whichever variant is in force. */
export const fieldValue = (record: { variantData?: VariantData }, variantId: string, key: string) =>
  record.variantData?.[variantId]?.[key];

export const variantPages = (variant: Variant): VariantPage[] => variant.pages || [];

export const findPage = (variant: Variant, id: string) => variantPages(variant).find((page) => page.id === id);

export type Grouped<T> = { key: string; label: string; items: T[] };

/**
 * Group records by one variant field.
 *
 * Groups come back in first-seen order, with the unset group always last - it
 * is a leftovers pile, not a peer of the real ones.
 */
export function groupByField<T extends { variantData?: VariantData }>(
  records: T[],
  variantId: string,
  key: string,
  emptyLabel = "Unassigned"
): Array<Grouped<T>> {
  const groups = new Map<string, Grouped<T>>();

  for (const record of records) {
    const raw = fieldValue(record, variantId, key);
    const label = raw === null || raw === undefined || raw === "" ? emptyLabel : String(raw);
    const groupKey = label === emptyLabel ? "" : label;

    const existing = groups.get(groupKey);
    if (existing) existing.items.push(record);
    else groups.set(groupKey, { key: groupKey, label, items: [record] });
  }

  const ordered = [...groups.values()];
  return [...ordered.filter((group) => group.key !== ""), ...ordered.filter((group) => group.key === "")];
}

export type ScoreSummary = {
  /** Records carrying a mark out of a maximum. */
  marked: number;
  outstanding: number;
  /** 0-100, or null when nothing is marked yet. */
  percent: number | null;
  /** The share of the group's declared weight that has been marked, 0-100. */
  weightMarked: number;
  totalWeight: number;
};

const numberOrNull = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : null);

/**
 * The weighted score for a set of records.
 *
 * Weighted by each record's declared weight where it has one, and evenly
 * otherwise - a course that only weights half its assignments still gets an
 * honest number rather than none. Records with no maximum are not marks at all
 * and count only as outstanding.
 */
export function scoreSummary(
  records: Array<{ variantData?: VariantData }>,
  variantId: string,
  fields: { scoreField?: string; maxField?: string; weightField?: string }
): ScoreSummary {
  const scoreKey = fields.scoreField || "score";
  const maxKey = fields.maxField || "maxScore";
  const weightKey = fields.weightField || "weight";

  let weighted = 0;
  let weightUsed = 0;
  let marked = 0;
  let outstanding = 0;
  let totalWeight = 0;
  let weightMarked = 0;

  for (const record of records) {
    const score = numberOrNull(fieldValue(record, variantId, scoreKey));
    const max = numberOrNull(fieldValue(record, variantId, maxKey));
    const weight = numberOrNull(fieldValue(record, variantId, weightKey));

    if (weight !== null) totalWeight += weight;

    // A score without a maximum cannot become a percentage, so it is not a mark.
    if (score === null || max === null || max <= 0) {
      outstanding += 1;
      continue;
    }

    marked += 1;
    if (weight !== null) weightMarked += weight;

    const share = weight !== null && weight > 0 ? weight : 1;
    weighted += (score / max) * share;
    weightUsed += share;
  }

  return {
    marked,
    outstanding,
    percent: weightUsed > 0 ? Math.round((weighted / weightUsed) * 1000) / 10 : null,
    weightMarked: Math.round(weightMarked * 10) / 10,
    totalWeight: Math.round(totalWeight * 10) / 10,
  };
}

export type StockLine<T> = { record: T; par: number; onHand: number; shortfall: number };

/**
 * What is below its par level, worst shortfall first.
 *
 * A record with no par level is not stock - it is left out rather than treated
 * as a par of zero, which would put every ordinary task on the order sheet. A
 * missing count *is* zero, though: nothing on hand is exactly the case an order
 * sheet exists for.
 */
export function belowPar<T extends { variantData?: VariantData }>(
  records: T[],
  variantId: string,
  fields: { parField?: string; onHandField?: string }
): Array<StockLine<T>> {
  const parKey = fields.parField || "parLevel";
  const onHandKey = fields.onHandField || "onHand";

  const lines: Array<StockLine<T>> = [];

  for (const record of records) {
    const par = fieldValue(record, variantId, parKey);
    if (typeof par !== "number" || !Number.isFinite(par) || par <= 0) continue;

    const raw = fieldValue(record, variantId, onHandKey);
    const onHand = typeof raw === "number" && Number.isFinite(raw) ? raw : 0;
    if (onHand >= par) continue;

    lines.push({ record, par, onHand, shortfall: Math.round((par - onHand) * 100) / 100 });
  }

  return lines.sort((a, b) => b.shortfall - a.shortfall);
}
