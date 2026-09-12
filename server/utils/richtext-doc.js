// richtext-doc.js - sanitized HTML into the structured tree the renderer takes.
//
// Why convert here rather than in the PDF service: this file sits next to
// sanitize.js, which defines the only tags that can exist in the first place.
// Keeping the two together means the converter and the allowlist cannot drift,
// and it keeps an HTML parser - and therefore attacker-controlled markup - out
// of the renderer entirely. The service only ever sees a closed set of nodes.

const { htmlToText } = require("./sanitize");

/** Tags that become a mark on a run, rather than a node of their own. */
const MARK_TAGS = {
  strong: "strong",
  b: "strong",
  em: "em",
  i: "em",
  u: "underline",
  s: "strike",
  strike: "strike",
  code: "code",
  mark: "mark",
};

/** Tags that open a block. Everything else is inline or ignored. */
const BLOCK_TAGS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "blockquote", "pre"]);

const ENTITIES = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", "#39": "'", nbsp: " ",
};

const decode = (text) =>
  text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&([a-z#0-9]+);/gi, (entity, name) => ENTITIES[name.toLowerCase()] ?? entity);

/** Pull the style properties the sanitizer allows off a tag's attributes. */
function readStyle(attributes) {
  const style = /style\s*=\s*"([^"]*)"/i.exec(attributes)?.[1] || "";
  const read = (property) => {
    const match = new RegExp(`(?:^|;)\\s*${property}\\s*:\\s*([^;]+)`, "i").exec(style);
    return match ? match[1].trim() : undefined;
  };
  return {
    color: read("color"),
    size: read("font-size"),
    font: read("font-family"),
    align: read("text-align"),
  };
}

const readHref = (attributes) => /href\s*=\s*"([^"]*)"/i.exec(attributes)?.[1];

/** Alignment can arrive as a class as well as a style, per the sanitizer. */
function readAlign(attributes, style) {
  if (style.align) return style.align;
  const className = /class\s*=\s*"([^"]*)"/i.exec(attributes)?.[1] || "";
  const match = /text-(left|right|center|justify)/.exec(className);
  return match ? match[1] : undefined;
}

/**
 * Parse sanitized HTML into blocks of runs.
 *
 * This is a small hand-rolled walker rather than a DOM parser because the input
 * is not arbitrary HTML: sanitize.js has already reduced it to about twenty
 * tags with a fixed attribute set, and anything it did not recognise is gone.
 */
function htmlToDoc(html) {
  const blocks = [];
  if (!html) return { blocks, text: "" };

  // The stack of marks and styles currently open around the cursor.
  let open = [];
  let current = null; // the block being built
  let listStack = [];

  const styleOf = () => {
    const merged = {};
    for (const entry of open) {
      if (entry.color) merged.color = entry.color;
      if (entry.size) merged.size = entry.size;
      if (entry.font) merged.font = entry.font;
      if (entry.href) merged.href = entry.href;
    }
    return merged;
  };

  const marksOf = () => [...new Set(open.flatMap((entry) => (entry.mark ? [entry.mark] : [])))];

  const startBlock = (block) => {
    flushBlock();
    current = block;
  };

  const flushBlock = () => {
    if (!current) return;
    const hasText = (current.runs || []).some((run) => run.text.trim());
    if (hasText || current.type === "code") blocks.push(current);
    current = null;
  };

  const pushText = (raw) => {
    const text = decode(raw).replace(/\s+/g, " ");
    if (!text) return;

    // Text outside any block still belongs somewhere.
    if (!current) current = { type: "paragraph", runs: [] };
    if (current.type === "code") {
      current.text = (current.text || "") + text;
      return;
    }

    const target = listStack.length ? listStack[listStack.length - 1].item : current.runs;
    if (!target) return;

    const marks = marksOf();
    const style = styleOf();
    const last = target[target.length - 1];

    // Merge with the previous run when nothing about the formatting changed,
    // so a paragraph is a handful of runs rather than one per text node.
    const same =
      last &&
      last.marks.join("|") === marks.join("|") &&
      last.color === style.color &&
      last.size === style.size &&
      last.font === style.font &&
      last.href === style.href;

    if (same) last.text += text;
    else target.push({ text, marks, color: style.color, size: style.size, font: style.font, href: style.href });
  };

  const tokens = String(html).split(/(<[^>]+>)/);

  for (const token of tokens) {
    if (!token) continue;

    if (token[0] !== "<") {
      pushText(token);
      continue;
    }

    const closing = token[1] === "/";
    const name = (closing ? token.slice(2) : token.slice(1)).match(/^[a-z0-9]+/i)?.[0]?.toLowerCase();
    if (!name) continue;
    const attributes = token.slice(name.length + (closing ? 2 : 1), -1);

    if (name === "br") {
      pushText(" ");
      continue;
    }

    if (closing) {
      if (MARK_TAGS[name] || name === "span" || name === "a") {
        open.pop();
        continue;
      }
      if (name === "li") {
        continue;
      }
      if (name === "ul" || name === "ol") {
        const list = listStack.pop();
        if (list && list.block.items.length) {
          blocks.push(list.block);
        }
        continue;
      }
      if (BLOCK_TAGS.has(name)) flushBlock();
      continue;
    }

    // --- opening tags ---
    if (MARK_TAGS[name]) {
      open.push({ mark: MARK_TAGS[name] });
      continue;
    }
    if (name === "span") {
      open.push(readStyle(attributes));
      continue;
    }
    if (name === "a") {
      open.push({ ...readStyle(attributes), href: readHref(attributes) });
      continue;
    }
    if (name === "ul" || name === "ol") {
      flushBlock();
      const block = { type: "list", ordered: name === "ol", items: [] };
      listStack.push({ block, item: null });
      continue;
    }
    if (name === "li") {
      const list = listStack[listStack.length - 1];
      if (list) {
        list.item = [];
        list.block.items.push(list.item);
      }
      continue;
    }
    if (/^h[1-6]$/.test(name)) {
      const style = readStyle(attributes);
      startBlock({ type: "heading", level: Number(name[1]), runs: [], align: readAlign(attributes, style) });
      continue;
    }
    if (name === "blockquote") {
      startBlock({ type: "quote", runs: [] });
      continue;
    }
    if (name === "pre") {
      startBlock({ type: "code", text: "" });
      continue;
    }
    if (name === "p" || name === "div") {
      const style = readStyle(attributes);
      startBlock({ type: "paragraph", runs: [], align: readAlign(attributes, style) });
      continue;
    }
    // Anything else was either stripped by the sanitizer or carries no meaning.
  }

  // Close whatever the markup left open.
  while (listStack.length) {
    const list = listStack.pop();
    if (list.block.items.length) blocks.push(list.block);
  }
  flushBlock();

  // Empty items would render as stray bullets.
  for (const block of blocks) {
    if (block.type === "list") block.items = block.items.filter((item) => item.some((run) => run.text.trim()));
  }

  return {
    blocks: blocks.filter((block) => block.type !== "list" || block.items.length),
    // The mirror travels too, so the renderer can fall back to it.
    text: htmlToText(html),
  };
}

module.exports = { htmlToDoc };
