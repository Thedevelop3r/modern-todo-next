"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Columns3,
  Command,
  Keyboard,
  Moon,
  Repeat,
  Search,
  Tags,
  Timer,
} from "lucide-react";
import { PublicShell } from "@/components/layout/PublicShell";
import { Badge, Button } from "@/components/ui";

const FEATURES = [
  { icon: CalendarDays, title: "Due dates that speak up", body: "Overdue, due today and due soon are colour-coded everywhere they appear." },
  { icon: Tags, title: "Tags and priorities", body: "Label anything, rank it none through urgent, and filter on both at once." },
  { icon: CheckCircle2, title: "Subtask checklists", body: "Break a todo into steps and watch the progress bar fill as you go." },
  { icon: Columns3, title: "Four ways to look", body: "List, grid, a drag-and-drop board, or a month calendar - your pick." },
  { icon: BarChart3, title: "Real insights", body: "Completion trends, status and priority breakdowns, and a daily streak." },
  { icon: Search, title: "Search that finds things", body: "Match titles, descriptions and tags, with the results highlighted." },
  { icon: Command, title: "Command palette", body: "Ctrl+K to jump anywhere or open any todo without touching the mouse." },
  { icon: Repeat, title: "Recurring todos", body: "Complete a daily or weekly todo and the next one schedules itself." },
  { icon: Moon, title: "A real dark mode", body: "Every surface, chart and badge is designed twice, not filtered once." },
];

const container = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
};

const item = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const } },
};

export default function Home() {
  return (
    <PublicShell>
      {/* Hero */}
      <section className="relative overflow-hidden">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 -top-40 h-[420px] bg-gradient-radial from-primary/20 via-transparent to-transparent blur-2xl"
        />

        <div className="relative mx-auto max-w-6xl px-4 pb-20 pt-16 sm:px-6 sm:pt-24">
          <motion.div initial="hidden" animate="visible" variants={container} className="mx-auto max-w-3xl text-center">
            <motion.div variants={item}>
              <Badge tone="primary" size="md">
                <Timer className="h-3 w-3" />
                Now with boards, calendar and insights
              </Badge>
            </motion.div>

            <motion.h1
              variants={item}
              className="mt-6 text-4xl font-semibold leading-[1.1] tracking-tight text-fg sm:text-6xl"
            >
              Manage your personal todos
              <span className="block bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
                with genuine ease.
              </span>
            </motion.h1>

            <motion.p variants={item} className="mx-auto mt-5 max-w-xl text-base leading-relaxed text-fg-muted sm:text-lg">
              Due dates, priorities, tags, subtasks and recurring work — in a fast, keyboard-friendly app
              that shows you what actually got done.
            </motion.p>

            <motion.div variants={item} className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <Link href="/register">
                <Button size="lg">
                  Get started free
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </Link>
              <Link href="/learn-more">
                <Button size="lg" variant="secondary">
                  See the features
                </Button>
              </Link>
            </motion.div>

            <motion.p variants={item} className="mt-4 text-xs text-fg-subtle">
              No credit card, no trial timer — it is a personal todo app.
            </motion.p>
          </motion.div>

          {/* Product preview */}
          <motion.div
            initial={{ opacity: 0, y: 28 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mx-auto mt-16 max-w-4xl"
          >
            <div className="overflow-hidden rounded-2xl border border-border bg-surface shadow-xl">
              <div className="flex items-center gap-1.5 border-b border-border bg-surface-sunken px-4 py-3">
                <span className="h-2.5 w-2.5 rounded-full bg-danger/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-warning/60" />
                <span className="h-2.5 w-2.5 rounded-full bg-success/60" />
                <span className="ml-3 text-xs text-fg-subtle">Modern Todo — Dashboard</span>
              </div>

              <div className="space-y-2.5 p-5">
                {[
                  { title: "Ship the analytics page", status: "In progress", tone: "text-status-progress", tags: ["work", "sprint"], done: 2, total: 3 },
                  { title: "Review pull requests", status: "Pending", tone: "text-status-pending", tags: ["work"], done: 0, total: 2 },
                  { title: "Plan the weekly groceries", status: "Completed", tone: "text-status-completed", tags: ["home"], done: 4, total: 4 },
                ].map((row, index) => (
                  <motion.div
                    key={row.title}
                    initial={{ opacity: 0, x: -12 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.55 + index * 0.12 }}
                    className="flex items-center gap-3 rounded-xl border border-border bg-surface-raised p-3.5"
                  >
                    <CheckCircle2 className={`h-5 w-5 shrink-0 ${row.tone}`} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-fg">{row.title}</p>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div className="h-1 w-24 overflow-hidden rounded-full bg-surface-sunken">
                          <div className="h-full rounded-full bg-primary" style={{ width: `${(row.done / row.total) * 100}%` }} />
                        </div>
                        <span className="text-[10px] text-fg-subtle">
                          {row.done}/{row.total}
                        </span>
                        {row.tags.map((tag) => (
                          <span key={tag} className="rounded-full bg-surface-sunken px-1.5 py-0.5 text-[10px] text-fg-muted">
                            #{tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <span className="shrink-0 text-xs text-fg-muted">{row.status}</span>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Features */}
      <section className="border-t border-border bg-surface/40">
        <div className="mx-auto max-w-6xl px-4 py-20 sm:px-6">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight text-fg">Everything a todo list should have</h2>
            <p className="mt-3 text-fg-muted">And the things most of them forget.</p>
          </div>

          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-80px" }}
            variants={container}
            className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
          >
            {FEATURES.map(({ icon: Icon, title, body }) => (
              <motion.div
                key={title}
                variants={item}
                className="rounded-xl border border-border bg-surface p-5 transition-all hover:border-border-strong hover:shadow-md"
              >
                <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-soft text-primary">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 font-semibold text-fg">{title}</h3>
                <p className="mt-1.5 text-sm leading-relaxed text-fg-muted">{body}</p>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Closing call to action */}
      <section className="border-t border-border">
        <div className="mx-auto max-w-3xl px-4 py-20 text-center sm:px-6">
          <span className="inline-flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-fg shadow-glow">
            <Keyboard className="h-6 w-6" />
          </span>
          <h2 className="mt-6 text-3xl font-semibold tracking-tight text-fg">Ready when you are</h2>
          <p className="mx-auto mt-3 max-w-md text-fg-muted">
            Create an account in a few seconds and start with your first todo.
          </p>
          <Link href="/register" className="mt-8 inline-block">
            <Button size="lg">
              Create your account
              <ArrowRight className="h-4 w-4" />
            </Button>
          </Link>
        </div>
      </section>
    </PublicShell>
  );
}
