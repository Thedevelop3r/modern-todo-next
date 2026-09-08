// csv.js - the small slice of RFC 4180 this app actually needs, both ways.

/** Quotes a value only when it has to be quoted, doubling any inner quote. */
function escapeCell(value) {
  if (value === null || value === undefined) return "";
  const text = value instanceof Date ? value.toISOString() : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/**
 * `columns` is a list of `{ key, header, get }`; `get` defaults to reading
 * `row[key]`, so simple columns need no function.
 */
function toCsv(rows, columns) {
  const header = columns.map((column) => escapeCell(column.header || column.key)).join(",");
  const body = rows.map((row) =>
    columns.map((column) => escapeCell(column.get ? column.get(row) : row[column.key])).join(",")
  );
  return [header, ...body].join("\r\n");
}

/**
 * Parses CSV into objects keyed by the header row. Handles quoted cells,
 * escaped quotes and newlines inside quotes; ignores a trailing blank line.
 */
function parseCsv(text) {
  const input = String(text || "").replace(/^﻿/, "");
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < input.length; i += 1) {
    const char = input[i];

    if (quoted) {
      if (char === '"') {
        if (input[i + 1] === '"') {
          cell += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cell += char;
      }
      continue;
    }

    if (char === '"') {
      quoted = true;
    } else if (char === ",") {
      row.push(cell);
      cell = "";
    } else if (char === "\n" || char === "\r") {
      // Swallow the \n of a \r\n pair rather than starting an empty row.
      if (char === "\r" && input[i + 1] === "\n") i += 1;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length) {
    row.push(cell);
    rows.push(row);
  }

  const [headerRow, ...dataRows] = rows.filter((entry) => entry.some((value) => value !== ""));
  if (!headerRow) return [];

  const headers = headerRow.map((header) => header.trim());
  return dataRows.map((entry) =>
    headers.reduce((object, header, index) => {
      object[header] = (entry[index] ?? "").trim();
      return object;
    }, {})
  );
}

module.exports = { toCsv, parseCsv };
