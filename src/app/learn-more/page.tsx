"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  Archive,
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckSquare,
  Columns3,
  Command,
  Copy,
  Filter,
  Keyboard,
  ListChecks,
  Moon,
  Pin,
  Repeat,
  RotateCcw,
  Search,
  Shield,
  SlidersHorizontal,
  Tags,
  Trash2,
  Undo2,
  Zap,
} from "lucide-react";
import { PublicShell } from "@/components/layout/PublicShell";
import { Button } from "@/components/ui";

const GROUPS = [
  {
    title: "Organise the work",
    items: [
      { icon: CalendarDays, title: "Due dates", body: "Set a date and every view tells you what is overdue, due today, or coming up." },
      { icon: Zap, title: "Priorities", body: "Five levels from none to urgent, colour-coded and sortable." },
      { icon: Tags, title: "Tags", body: "Free-form labels with a stable colour each, plus autocomplete from tags you already use." },
      { icon: ListChecks, title: "Subtasks", body: "Break a todo into steps and track completion with a live progress bar." },
      { icon: Pin, title: "Pinning", body: "Pinned todos rise to the top of every list, whatever the sort order." },
      { icon: Repeat, title: "Recurring todos", body: "Daily, weekly or monthly - completing one schedules the next automatically." },
    ],
  },
  {
    title: "Find and change it fast",
    items: [
      { icon: Search, title: "Search", body: "Matches titles, descriptions and tags, and highlights the hits in the results." },
      { icon: Filter, title: "Filters", body: "Combine status, priority, tags and due windows. The filter lives in the URL, so the view is shareable." },
      { icon: SlidersHorizontal, title: "Sorting", body: "By created, updated, due date, priority or title, ascending or descending." },
      { icon: CheckSquare, title: "Bulk actions", body: "Select many todos and set status, set priority, tag, pin, archive or delete in one go." },
      { icon: Copy, title: "Duplicate", body: "Copy a todo with its tags and subtasks, reset and ready to run again." },
      { icon: Undo2, title: "Undo", body: "Deletes and archives apply instantly and offer an undo before you have moved on." },
    ],
  },
  {
    title: "See it your way",
    items: [
      { icon: Columns3, title: "Board view", body: "Three status columns; drag a card across to change its status." },
      { icon: CalendarDays, title: "Calendar view", body: "A month grid of everything with a due date. Click any day to add one." },
      { icon: BarChart3, title: "Analytics", body: "Completion trend, status and priority breakdowns, most-used tags, and a daily streak." },
      { icon: Moon, title: "Dark mode", body: "Designed as its own theme - surfaces, charts and badges all get their own values." },
    ],
  },
  {
    title: "Keep it safe and quick",
    items: [
      { icon: Archive, title: "Archive", body: "Retire a todo without deleting it. Restore it whenever you like." },
      { icon: Trash2, title: "Trash", body: "Deleted todos wait here with everything intact until you empty it." },
      { icon: RotateCcw, title: "Restore", body: "Recovering from the trash brings the todo back with its original identity." },
      { icon: Command, title: "Command palette", body: "Ctrl+K searches your todos and jumps to any page." },
      { icon: Keyboard, title: "Shortcuts", body: "n for new, / to search, g then d for the dashboard, ? for the full list." },
      { icon: Shield, title: "Sensible security", body: "Hashed passwords, an HttpOnly session cookie, rate-limited sign-in, and validation on every route." },
    ],
  },
];

export default function LearnMorePage() {
  return (
    <PublicShell>
      <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
          className="mx-auto max-w-2xl text-center"
        >
          <h1 className="text-4xl font-semibold tracking-tight text-fg">Every feature, in one place</h1>
          <p className="mt-4 text-fg-muted">
            A personal todo app that takes the boring parts seriously — filtering, keyboard control,
            and knowing what you actually finished.
          </p>
        </motion.div>

        <div className="mt-16 space-y-14">
          {GROUPS.map((group, groupIndex) => (
            <section key={group.title}>
              <h2 className="text-sm font-semibold uppercase tracking-wide text-fg-subtle">{group.title}</h2>
              <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map(({ icon: Icon, title, body }, index) => (
                  <motion.div
                    key={title}
                    initial={{ opacity: 0, y: 12 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ duration: 0.35, delay: (index % 3) * 0.05 + groupIndex * 0.02 }}
                    className="rounded-xl border border-border bg-surface p-5"
                  >
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                      <Icon className="h-4 w-4" />
                    </span>
                    <h3 className="mt-3.5 font-semibold text-fg">{title}</h3>
                    <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{body}</p>
                  </motion.div>
                ))}
              </div>
            </section>
          ))}
        </div>

        <div className="mt-20 rounded-2xl border border-border bg-surface p-10 text-center">
          <h2 className="text-2xl font-semibold tracking-tight text-fg">Give it a try</h2>
          <p className="mx-auto mt-2.5 max-w-md text-fg-muted">
            Everything above is in the app right now. Make an account and see.
          </p>
          <Link href="/register" className="mt-7 inline-block">
            <Button size="lg">
              Get started
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>
    </PublicShell>
  );
}
