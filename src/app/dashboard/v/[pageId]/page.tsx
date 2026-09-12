"use client";

import * as React from "react";
import Link from "next/link";
import { notFound, useParams } from "next/navigation";
import { LayoutGrid } from "lucide-react";
import {
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  PageTransition,
  Progress,
  Skeleton,
} from "@/components/ui";
import { StatusBadge } from "@/components/todo/TodoBits";
import { VariantIcon } from "@/components/variant/VariantIcon";
import { EvidenceList } from "@/components/variant/EvidenceList";
import { VariantNotice } from "@/components/variant/VariantNotice";
import { useTodos } from "@/hooks/useTodos";
import { useVariant } from "@/hooks/useVariant";
import { belowPar, findPage, groupByField, scoreSummary, type Grouped, type VariantPage } from "@/lib/variants";
import { formatDate } from "@/lib/date";

/**
 * Every page a variant adds, rendered by kind.
 *
 * There is one route for all of them and no page component is variant-specific:
 * the registry says which field groups a list and which fields carry the marks,
 * and the renderers below are parameterised by those keys. A variant that needs
 * a genuinely new shape adds a *kind* here - never a branch on the variant id.
 */
export default function VariantPageRoute() {
  const params = useParams<{ pageId: string }>();
  const { variant } = useVariant();
  const page = findPage(variant, params.pageId);

  // A page from a variant the account no longer runs is simply not a page.
  if (!page) return <UnknownPage />;

  return <VariantPageBody page={page} variantId={variant.id} />;
}

function UnknownPage() {
  return (
    <PageTransition className="mx-auto max-w-4xl">
      <EmptyState
        icon={<LayoutGrid className="h-6 w-6" />}
        title="That page belongs to another application type"
        description="Switch application type in settings to see it again."
        action={
          <Link href="/dashboard/settings/application">
            <Button variant="secondary">Application settings</Button>
          </Link>
        }
      />
    </PageTransition>
  );
}

function PageHeader({ page }: { page: VariantPage }) {
  return (
    <div className="flex items-start gap-3">
      <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-soft text-primary">
        <VariantIcon name={page.icon} className="h-4 w-4" />
      </span>
      <div>
        <h1 className="text-lg font-semibold tracking-tight text-fg">{page.label}</h1>
        {page.description && <p className="mt-0.5 text-xs text-fg-muted">{page.description}</p>}
      </div>
    </div>
  );
}

/** One renderer per kind, so a page fetches only what it actually shows. */
function VariantPageBody({ page, variantId }: { page: VariantPage; variantId: string }) {
  if (page.kind === "files") {
    return (
      <PageTransition className="mx-auto max-w-4xl space-y-5">
        <PageHeader page={page} />
        <VariantNotice />
        <EvidenceList />
      </PageTransition>
    );
  }

  if (page.kind === "stock") return <StockPageBody page={page} variantId={variantId} />;

  return <GroupedPageBody page={page} variantId={variantId} />;
}

function StockPageBody({ page, variantId }: { page: VariantPage; variantId: string }) {
  const { lower } = useVariant();
  const { data, isLoading } = useTodos({ limit: 100, page: 1, archived: false });
  const todos = data?.data || [];

  // Only what is actually short, grouped by whoever fills it.
  const short = belowPar(todos, variantId, { parField: page.parField, onHandField: page.onHandField });
  const groups = groupByField(
    short.map((line) => line.record),
    variantId,
    page.groupBy,
    page.emptyLabel || "Unassigned"
  );
  const byId = new Map(short.map((line) => [line.record._id, line]));

  return (
    <PageTransition className="mx-auto max-w-4xl space-y-5">
      <PageHeader page={page} />
      <VariantNotice />

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 2 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<VariantIcon name={page.icon} className="h-6 w-6" />}
          title="Nothing is below par"
          description={`Give a ${lower("todo")} a par level and a count on hand to see it here when it runs short.`}
        />
      ) : (
        groups.map((group) => (
          <Card key={group.key || "__unset"}>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-fg">{group.label}</h2>
                <span className="text-xs text-fg-muted">{group.items.length} to order</span>
              </div>

              <ul className="divide-y divide-border">
                {group.items.map((todo) => {
                  const line = byId.get(todo._id);
                  return (
                    <li key={todo._id} className="flex items-center gap-3 py-2">
                      <Link
                        href={`/dashboard/todo/${todo._id}`}
                        className="min-w-0 flex-1 truncate text-sm text-fg hover:text-primary hover:underline"
                      >
                        {todo.title}
                      </Link>
                      <span className="shrink-0 text-xs tabular-nums text-fg-muted">
                        {line?.onHand} / {line?.par}
                      </span>
                      <Badge tone="warning">order {line?.shortfall}</Badge>
                    </li>
                  );
                })}
              </ul>
            </CardContent>
          </Card>
        ))
      )}
    </PageTransition>
  );
}

function GroupedPageBody({ page, variantId }: { page: VariantPage; variantId: string }) {
  const { t, lower } = useVariant();
  // One page's worth of everything: these views group rather than paginate.
  const { data, isLoading } = useTodos({ limit: 100, page: 1, archived: false });
  const todos = data?.data || [];

  const groups = groupByField(todos, variantId, page.groupBy, page.emptyLabel || "Unassigned");

  return (
    <PageTransition className="mx-auto max-w-4xl space-y-5">
      <PageHeader page={page} />

      <VariantNotice />

      {/* The whole-set summary a gradebook is actually read for. */}
      {page.kind === "scoreboard" && groups.length > 0 && (
        <OverallSummary groups={groups} page={page} variantId={variantId} />
      )}

      {isLoading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, index) => (
            <Skeleton key={index} className="h-28 rounded-xl" />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <EmptyState
          icon={<VariantIcon name={page.icon} className="h-6 w-6" />}
          title={`No ${lower("todo", "many")} yet`}
          description={`Create one and give it a ${page.groupBy} to see it here.`}
          action={
            <Link href="/dashboard/create-todo">
              <Button>New {lower("todo")}</Button>
            </Link>
          }
        />
      ) : (
        groups.map((group) => (
          <GroupCard key={group.key || "__unset"} group={group} page={page} variantId={variantId} label={t("todo", "many")} />
        ))
      )}
    </PageTransition>
  );
}

function OverallSummary({
  groups,
  page,
  variantId,
}: {
  groups: Array<Grouped<Todo>>;
  page: VariantPage;
  variantId: string;
}) {
  const fields = { scoreField: page.scoreField, maxField: page.maxField, weightField: page.weightField };
  const overall = scoreSummary(
    groups.flatMap((group) => group.items),
    variantId,
    fields
  );

  // Each group's own average, so one enormous course does not swamp the rest.
  const perGroup = groups
    .map((group) => scoreSummary(group.items, variantId, fields).percent)
    .filter((percent): percent is number => percent !== null);

  const mean = perGroup.length
    ? Math.round((perGroup.reduce((total, percent) => total + percent, 0) / perGroup.length) * 10) / 10
    : null;

  return (
    <Card>
      <CardContent className="grid gap-4 sm:grid-cols-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Overall</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">
            {overall.percent === null ? "—" : `${overall.percent}%`}
          </p>
          <p className="text-xs text-fg-muted">Every marked piece, weighted</p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Average per group</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">{mean === null ? "—" : `${mean}%`}</p>
          <p className="text-xs text-fg-muted">
            {perGroup.length} of {groups.length} with a mark
          </p>
        </div>
        <div>
          <p className="text-xs font-medium uppercase tracking-wide text-fg-subtle">Outstanding</p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-fg">{overall.outstanding}</p>
          <p className="text-xs text-fg-muted">{overall.marked} marked so far</p>
        </div>
      </CardContent>
    </Card>
  );
}

function GroupCard({
  group,
  page,
  variantId,
  label,
}: {
  group: Grouped<Todo>;
  page: VariantPage;
  variantId: string;
  label: string;
}) {
  const summary =
    page.kind === "scoreboard"
      ? scoreSummary(group.items, variantId, {
          scoreField: page.scoreField,
          maxField: page.maxField,
          weightField: page.weightField,
        })
      : null;

  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-sm font-semibold text-fg">{group.label}</h2>
          <span className="text-xs text-fg-muted">
            {group.items.length} {label.toLowerCase()}
          </span>
        </div>

        {summary && (
          <div className="space-y-2 rounded-lg bg-surface-sunken p-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <span className="text-2xl font-semibold tabular-nums text-fg">
                {/* Nothing marked is not zero, and must not read as zero. */}
                {summary.percent === null ? "—" : `${summary.percent}%`}
              </span>
              <span className="text-xs text-fg-muted">
                {summary.marked} marked · {summary.outstanding} outstanding
              </span>
            </div>

            {summary.totalWeight > 0 && (
              <div className="space-y-1">
                <Progress
                  value={Math.min(100, (summary.weightMarked / summary.totalWeight) * 100)}
                  tone="primary"
                />
                <p className="text-xs text-fg-subtle">
                  {summary.weightMarked} of {summary.totalWeight} weight marked
                </p>
              </div>
            )}
          </div>
        )}

        <ul className="divide-y divide-border">
          {group.items.map((todo) => (
            <li key={todo._id} className="flex items-center gap-3 py-2">
              <StatusBadge status={todo.status} />
              <Link
                href={`/dashboard/todo/${todo._id}`}
                className="min-w-0 flex-1 truncate text-sm text-fg hover:text-primary hover:underline"
              >
                {todo.title}
              </Link>
              {page.kind === "scoreboard" && <ScoreCell todo={todo} page={page} variantId={variantId} />}
              {todo.dueDate && <span className="shrink-0 text-xs text-fg-muted">{formatDate(todo.dueDate)}</span>}
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function ScoreCell({ todo, page, variantId }: { todo: Todo; page: VariantPage; variantId: string }) {
  const data = todo.variantData?.[variantId] || {};
  const score = data[page.scoreField || "score"];
  const max = data[page.maxField || "maxScore"];
  const weight = data[page.weightField || "weight"];

  if (typeof score !== "number" || typeof max !== "number" || max <= 0) {
    return <Badge tone="neutral">Unmarked</Badge>;
  }

  const percent = Math.round((score / max) * 100);
  return (
    <span className="flex shrink-0 items-center gap-2">
      <span className="text-xs tabular-nums text-fg-muted">
        {score}/{max}
      </span>
      <Badge tone={percent >= 70 ? "success" : percent >= 50 ? "warning" : "danger"}>{percent}%</Badge>
      {typeof weight === "number" && weight > 0 && (
        <span className="text-xs tabular-nums text-fg-subtle">{weight}%</span>
      )}
    </span>
  );
}
