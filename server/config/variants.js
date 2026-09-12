// variants.js - the application variants, as the API sees them.
//
// The registry itself is JSON under shared/variants/, read by this file and by
// src/lib/variants.ts. One source, two runtimes - the same arrangement
// shared/themes.json already uses, and the reason a new variant is a JSON file
// rather than a patch across the codebase.
//
// The central rule: nothing branches on the variant id. Controllers and
// components ask the registry what a variant calls things and which extra
// fields it carries, and behave identically for all five.

const { z } = require("zod");

const index = require("../../shared/variants/index.json");

/** The closed set of field types. `VariantFields` renders exactly these seven. */
const FIELD_TYPES = ["string", "text", "number", "date", "enum", "boolean", "checklist"];

const VARIANTS = Object.fromEntries(
  index.variants.map((id) => [id, require(`../../shared/variants/${id}.json`)])
);

const VARIANT_IDS = index.variants;
const DEFAULT_VARIANT = index.default;

const isVariant = (id) => Object.prototype.hasOwnProperty.call(VARIANTS, id);

/** The variant record, falling back to the default rather than throwing. */
const variant = (id) => VARIANTS[id] || VARIANTS[DEFAULT_VARIANT];

/** A variant's extra fields for one scope, as declared in its JSON. */
const fieldsFor = (id, scope = "todo") => variant(id)[scope === "project" ? "projectFields" : "todoFields"] || [];

/**
 * One field definition into a zod schema.
 *
 * `nullish` throughout: an extra field is never required, because a todo can be
 * created before anyone knows what goes in it, and because switching variants
 * must never make an existing record invalid.
 */
function schemaForField(field) {
  switch (field.type) {
    case "number": {
      let number = z.coerce.number();
      if (typeof field.min === "number") number = number.min(field.min);
      if (typeof field.max === "number") number = number.max(field.max);
      return number;
    }
    case "date":
      // Stored as the ISO string the client sent: variantData is Mixed, and a
      // Date here would come back as a string on the next read anyway.
      return z
        .union([z.string(), z.null()])
        .transform((value) => (value === "" ? null : value))
        .refine((value) => value === null || !Number.isNaN(new Date(value).getTime()), "Enter a valid date");
    case "enum":
      return z.enum(field.options?.map((option) => option.value ?? option) || [""]);
    case "boolean":
      return z.boolean();
    case "checklist":
      return z
        .array(z.object({ title: z.string().trim().min(1).max(200), done: z.boolean().default(false) }))
        .max(50);
    case "text":
      return z.string().trim().max(field.max || 4000);
    case "string":
    default:
      return z.string().trim().max(field.max || 200);
  }
}

/**
 * The zod object for one variant's extra fields, built once at load.
 *
 * `.strip()` rather than `.strict()`: a client that sends a field the variant
 * dropped gets it ignored, not a 400 - the alternative breaks a form the moment
 * a field definition changes.
 */
function buildSchema(id, scope) {
  const shape = {};
  for (const field of fieldsFor(id, scope)) {
    shape[field.key] = schemaForField(field).nullish();
  }
  return z.object(shape).strip();
}

/**
 * Built on first use and cached against the field list it was built from.
 *
 * Not precomputed at load: the cache key is the `todoFields`/`projectFields`
 * array itself, so a registry edited in place - which is how the tests cover
 * field validation before any variant declares fields - rebuilds rather than
 * serving a stale schema.
 */
const SCHEMA_CACHE = new WeakMap();

function schemaFor(variantId, scope) {
  const fields = fieldsFor(variantId, scope);
  const cached = SCHEMA_CACHE.get(fields);
  if (cached) return cached;

  const schema = buildSchema(variantId, scope);
  SCHEMA_CACHE.set(fields, schema);
  return schema;
}

/**
 * Validate the incoming `variantData` against the active variant's fields.
 *
 * Returns the parsed values for that one variant. A payload naming another
 * variant is rejected rather than merged: it is a confused client, not an edit.
 */
function parseVariantData(data, { variantId, scope = "todo" }) {
  if (!data || typeof data !== "object") return null;

  const keys = Object.keys(data);
  if (!keys.length) return null;

  const unknown = keys.filter((key) => !isVariant(key));
  if (unknown.length) {
    const error = new Error(`Unknown variant: ${unknown[0]}`);
    error.statusCode = 400;
    throw error;
  }

  const foreign = keys.filter((key) => key !== variantId);
  if (foreign.length) {
    const error = new Error(`Cannot write ${foreign[0]} fields while using ${variantId}`);
    error.statusCode = 400;
    throw error;
  }

  const result = schemaFor(variantId, scope).safeParse(data[variantId] || {});
  if (!result.success) {
    // A zod throw here would surface as a 500: the error handler translates
    // Mongoose errors and reads `statusCode`, and knows nothing about zod
    // outside the validate() middleware.
    const issue = result.error.issues[0];
    const label = fieldsFor(variantId, scope).find((field) => field.key === issue.path[0])?.label || issue.path[0];
    const error = new Error(`${label}: ${issue.message}`);
    error.statusCode = 400;
    throw error;
  }

  const values = Object.fromEntries(Object.entries(result.data).filter(([, value]) => value !== undefined));
  return Object.keys(values).length ? values : null;
}

/**
 * The same values shaped for an insert.
 *
 * The one place a whole-object assignment is safe: a document being created has
 * no other variant's data to drop.
 */
function nestVariantData(data, options) {
  const values = parseVariantData(data, options);
  return values ? { [options.variantId]: values } : undefined;
}

/**
 * Validate one variant's sub-object and flatten it to dot paths.
 *
 * Dot paths are not a style choice. `variantData` is Mixed, so a whole-object
 * assignment is both how the *other* variants' data gets dropped and the form
 * Mongoose cannot see without `markModified`. Writing
 * `{"variantData.school.course": "Physics"}` is additive and persists; writing
 * `{variantData: {...}}` is neither.
 *
 * Returns `{}` when there is nothing to write, so a caller can spread it
 * unconditionally.
 */
function flattenVariantData(data, options) {
  const values = parseVariantData(data, options);
  if (!values) return {};

  const update = {};
  for (const [key, value] of Object.entries(values)) {
    update[`variantData.${options.variantId}.${key}`] = value;
  }
  return update;
}

/** Which variant is in force: the project's override, then the account's. */
const resolveVariant = ({ project, user }) =>
  variant(project?.applicationType || user?.preferences?.applicationType || DEFAULT_VARIANT).id;

module.exports = {
  VARIANTS,
  VARIANT_IDS,
  DEFAULT_VARIANT,
  FIELD_TYPES,
  isVariant,
  variant,
  fieldsFor,
  schemaForField,
  parseVariantData,
  nestVariantData,
  flattenVariantData,
  resolveVariant,
};
