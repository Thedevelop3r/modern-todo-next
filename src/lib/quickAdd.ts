import { addDays, endOfDay, nextDay, parse, isValid, type Day } from "date-fns";

/**
 * Parses a one-line todo into structured fields.
 *
 *   "pay rent tomorrow !high #home @Website ~3"
 *   → title "pay rent", due tomorrow, priority high, tag home, project Website, estimate 3
 *
 * Tokens are stripped from the title as they are consumed, so what remains is
 * the human-readable task. Unknown tokens are left in the title untouched -
 * this must never swallow text it does not understand.
 */

export type QuickAddResult = {
  title: string;
  dueDate: string | null;
  priority: TodoPriority | null;
  tags: string[];
  projectName: string | null;
  estimate: number | null;
  /** Human-readable summary of what was recognised, for the live hint. */
  matched: Array<{ kind: string; label: string }>;
};

const PRIORITY_WORDS: Record<string, TodoPriority> = {
  "1": "urgent",
  "2": "high",
  "3": "medium",
  "4": "low",
  urgent: "urgent",
  high: "high",
  med: "medium",
  medium: "medium",
  low: "low",
};

const WEEKDAYS: Record<string, Day> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
  sun: 0,
  mon: 1,
  tue: 2,
  tues: 2,
  wed: 3,
  thu: 4,
  thur: 4,
  thurs: 4,
  fri: 5,
  sat: 6,
};

/** Date phrases, longest first so "next week" wins over "week". */
function matchDate(text: string): { date: Date; matchedText: string } | null {
  const lower = text.toLowerCase();
  const now = new Date();

  const phrases: Array<[RegExp, () => Date]> = [
    [/\bday after tomorrow\b/, () => addDays(now, 2)],
    [/\bnext week\b/, () => addDays(now, 7)],
    [/\bnext month\b/, () => addDays(now, 30)],
    [/\btomorrow\b/, () => addDays(now, 1)],
    [/\btoday\b/, () => now],
    [/\btonight\b/, () => now],
    [/\bin (\d{1,3}) days?\b/, () => now],
    [/\bin (\d{1,2}) weeks?\b/, () => now],
  ];

  for (const [pattern, resolve] of phrases) {
    const match = lower.match(pattern);
    if (!match) continue;

    // The "in N days/weeks" forms need the captured number.
    if (match[1]) {
      const amount = parseInt(match[1], 10);
      const days = pattern.source.includes("weeks") ? amount * 7 : amount;
      return { date: addDays(now, days), matchedText: match[0] };
    }
    return { date: resolve(), matchedText: match[0] };
  }

  // "next friday" / "on friday" / bare "friday"
  const weekday = lower.match(/\b(?:next |on )?(sunday|monday|tuesday|wednesday|thursday|friday|saturday|sun|mon|tues?|wed|thur?s?|fri|sat)\b/);
  if (weekday) {
    const day = WEEKDAYS[weekday[1]];
    if (day !== undefined) return { date: nextDay(now, day), matchedText: weekday[0] };
  }

  // Explicit dates: 2030-05-01 or 5/1
  const iso = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (iso) {
    const parsed = parse(iso[1], "yyyy-MM-dd", new Date());
    if (isValid(parsed)) return { date: parsed, matchedText: iso[0] };
  }

  return null;
}

export function parseQuickAdd(input: string): QuickAddResult {
  let working = ` ${input} `;
  const matched: QuickAddResult["matched"] = [];

  // --- tags: #tag ---
  const tags: string[] = [];
  // The lookahead matters: without it "#a-very-long-tag-beyond-the-limit" would
  // be silently truncated into a tag plus leftover text in the title.
  working = working.replace(/\s#([\w-]{1,24})(?=\s|$)/g, (_full, tag: string) => {
    const clean = tag.toLowerCase();
    if (!tags.includes(clean)) tags.push(clean);
    return " ";
  });
  tags.forEach((tag) => matched.push({ kind: "tag", label: `#${tag}` }));

  // --- project: @Name or @"Two Words" ---
  let projectName: string | null = null;
  working = working.replace(/\s@(?:"([^"]{1,60})"|([\w-]{1,60})(?=\s|$))/, (_full, quoted: string, bare: string) => {
    projectName = (quoted || bare).trim();
    return " ";
  });
  if (projectName) matched.push({ kind: "project", label: `@${projectName}` });

  // --- priority: !high / !1 ---
  let priority: TodoPriority | null = null;
  working = working.replace(/\s!(\w{1,10})(?=\s|$)/, (full, word: string) => {
    const resolved = PRIORITY_WORDS[word.toLowerCase()];
    if (!resolved) return full; // leave unknown tokens alone
    priority = resolved;
    return " ";
  });
  if (priority) matched.push({ kind: "priority", label: `${priority} priority` });

  // --- estimate: ~3 ---
  let estimate: number | null = null;
  working = working.replace(/\s~(\d{1,4})\b/, (_full, value: string) => {
    estimate = parseInt(value, 10);
    return " ";
  });
  if (estimate !== null) matched.push({ kind: "estimate", label: `${estimate} pts` });

  // --- due date ---
  let dueDate: string | null = null;
  const dateMatch = matchDate(working);
  if (dateMatch) {
    dueDate = endOfDay(dateMatch.date).toISOString();
    // Remove only the first occurrence, case-insensitively.
    const index = working.toLowerCase().indexOf(dateMatch.matchedText);
    if (index >= 0) {
      working = working.slice(0, index) + " " + working.slice(index + dateMatch.matchedText.length);
    }
    matched.push({ kind: "due", label: dateMatch.matchedText.trim() });
  }

  const title = working.replace(/\s+/g, " ").trim();

  return { title, dueDate, priority, tags, projectName, estimate, matched };
}
