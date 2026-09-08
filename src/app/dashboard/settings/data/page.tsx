"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Database,
  Download,
  FileJson,
  FileSpreadsheet,
  Sparkles,
  Upload,
} from "lucide-react";
import {
  Button,
  Card,
  CardContent,
  Field,
  NativeSelect,
  PageTransition,
  Textarea,
  useToast,
} from "@/components/ui";
import { Section, SettingsTabs } from "@/components/settings/SettingsSection";
import {
  useExportAccount,
  useExportTodos,
  useImportTodos,
  useSampleData,
} from "@/hooks/useAccount";
import { formatDate } from "@/lib/date";

const MAX_FILE_BYTES = 1_000_000;

export default function DataSettingsPage() {
  const toast = useToast();
  const exportTodos = useExportTodos();
  const exportAccount = useExportAccount();
  const importTodos = useImportTodos();
  const sampleData = useSampleData();

  const [format, setFormat] = React.useState<"json" | "csv">("json");
  const [data, setData] = React.useState("");
  const [skipDuplicates, setSkipDuplicates] = React.useState(true);
  const [summary, setSummary] = React.useState<ImportSummary | null>(null);

  const download = (run: () => Promise<unknown>, what: string) =>
    run()
      .then(() => toast.success(`${what} downloaded`))
      .catch((error: Error) => toast.error("Export failed", { description: error.message }));

  const readFile = async (file?: File) => {
    if (!file) return;
    if (file.size > MAX_FILE_BYTES) {
      toast.error("That file is too big", { description: "The limit is 1 MB of text." });
      return;
    }
    setData(await file.text());
    setFormat(file.name.toLowerCase().endsWith(".csv") ? "csv" : "json");
    setSummary(null);
  };

  const run = (dryRun: boolean) => {
    if (!data.trim()) {
      toast.error("Paste a file or choose one first");
      return;
    }
    importTodos.mutate(
      { format, data, dryRun, skipDuplicates },
      {
        onSuccess: (result) => {
          setSummary(result);
          if (!result.dryRun) {
            toast.success(`${result.created} todo${result.created === 1 ? "" : "s"} imported`, {
              description: result.projectsCreated
                ? `${result.projectsCreated} project${result.projectsCreated === 1 ? "" : "s"} created too.`
                : undefined,
            });
            setData("");
          }
        },
        onError: (error: Error) => {
          setSummary(null);
          toast.error("Import failed", { description: error.message });
        },
      }
    );
  };

  return (
    <PageTransition className="mx-auto max-w-2xl space-y-5">
      <SettingsTabs />

      <Section
        icon={<Download className="h-4.5 w-4.5" />}
        title="Export"
        description="Your data, in a file you keep. Nothing here leaves your browser afterwards."
      >
        <div className="grid gap-2 sm:grid-cols-2">
          <Button variant="secondary" onClick={() => download(() => exportTodos.mutateAsync("json"), "JSON export")}>
            <FileJson className="h-4 w-4" />
            Todos as JSON
          </Button>
          <Button variant="secondary" onClick={() => download(() => exportTodos.mutateAsync("csv"), "CSV export")}>
            <FileSpreadsheet className="h-4 w-4" />
            Todos as CSV
          </Button>
        </div>

        <div className="rounded-lg border border-border bg-surface-sunken p-3">
          <p className="text-xs text-fg-muted">
            A full account export adds projects, comments, activity, templates, saved views, trash and
            the audit log. It never contains your password or two-factor secret.
          </p>
          <Button
            className="mt-3"
            size="sm"
            variant="outline"
            loading={exportAccount.isPending}
            onClick={() => download(() => exportAccount.mutateAsync(), "Account export")}
          >
            <Database className="h-4 w-4" />
            Export everything
          </Button>
        </div>
      </Section>

      <Section
        icon={<Upload className="h-4.5 w-4.5" />}
        title="Import"
        description="Preview first, then import. A preview writes nothing."
      >
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Format" htmlFor="import-format">
            <NativeSelect
              id="import-format"
              value={format}
              onChange={(e) => {
                setFormat(e.target.value as "json" | "csv");
                setSummary(null);
              }}
            >
              <option value="json">JSON</option>
              <option value="csv">CSV</option>
            </NativeSelect>
          </Field>

          <Field label="File" htmlFor="import-file" hint="Or paste below">
            <input
              id="import-file"
              type="file"
              accept=".json,.csv,text/csv,application/json"
              onChange={(e) => readFile(e.target.files?.[0])}
              className="block w-full text-sm text-fg-muted file:mr-3 file:rounded-lg file:border-0 file:bg-surface-sunken file:px-3 file:py-2 file:text-sm file:font-medium file:text-fg hover:file:bg-border"
            />
          </Field>
        </div>

        <Field label="Contents" htmlFor="import-data">
          <Textarea
            id="import-data"
            rows={6}
            spellCheck={false}
            value={data}
            onChange={(e) => {
              setData(e.target.value);
              setSummary(null);
            }}
            placeholder={
              format === "csv"
                ? "title,description,status,priority,tags,dueDate…"
                : '[{ "title": "Pay rent", "priority": "high", "tags": ["home"] }]'
            }
            className="font-mono text-xs"
          />
        </Field>

        <label className="flex items-center gap-2 text-sm text-fg-muted">
          <input
            type="checkbox"
            checked={skipDuplicates}
            onChange={(e) => setSkipDuplicates(e.target.checked)}
            className="h-4 w-4 rounded border-border text-primary"
          />
          Skip todos whose title already exists
        </label>

        <div className="flex flex-wrap justify-end gap-2">
          <Button variant="secondary" loading={importTodos.isPending} onClick={() => run(true)}>
            Preview
          </Button>
          <Button
            loading={importTodos.isPending}
            disabled={!summary?.dryRun || !summary.willCreate}
            onClick={() => run(false)}
          >
            <Upload className="h-4 w-4" />
            {summary?.dryRun && summary.willCreate
              ? `Import ${summary.willCreate} todo${summary.willCreate === 1 ? "" : "s"}`
              : "Import"}
          </Button>
        </div>

        {summary && <ImportReport summary={summary} />}
      </Section>

      <Section
        icon={<Sparkles className="h-4.5 w-4.5" />}
        title="Sample data"
        description="Two projects and a handful of todos, for an empty account."
      >
        <Button
          variant="secondary"
          loading={sampleData.isPending}
          onClick={() =>
            sampleData.mutate(undefined, {
              onSuccess: (result) =>
                toast.success("Sample data added", {
                  description: `${result.todos} todos across ${result.projects} projects.`,
                }),
              onError: (error: Error) => toast.error("Could not add sample data", { description: error.message }),
            })
          }
        >
          <Sparkles className="h-4 w-4" />
          Add sample data
        </Button>
      </Section>
    </PageTransition>
  );
}

/** What the API said would happen, or did. */
function ImportReport({ summary }: { summary: ImportSummary }) {
  return (
    <Card>
      <CardContent className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold text-fg">
          {summary.dryRun ? (
            <>
              <AlertTriangle className="h-4 w-4 text-warning" />
              Preview — nothing has been written
            </>
          ) : (
            <>
              <CheckCircle2 className="h-4 w-4 text-success" />
              Imported
            </>
          )}
        </div>

        <dl className="grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
          {[
            { label: "Rows", value: summary.total },
            { label: summary.dryRun ? "Will create" : "Created", value: summary.dryRun ? summary.willCreate : summary.created },
            { label: "Duplicates", value: summary.duplicates },
            { label: "Rejected", value: summary.invalid },
          ].map((stat) => (
            <div key={stat.label} className="rounded-lg bg-surface-sunken px-3 py-2">
              <dt className="text-xs text-fg-subtle">{stat.label}</dt>
              <dd className="text-lg font-semibold tabular-nums text-fg">{stat.value}</dd>
            </div>
          ))}
        </dl>

        {summary.preview.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-fg-subtle">
              First rows
            </p>
            <ul className="divide-y divide-border rounded-lg border border-border">
              {summary.preview.map((row, index) => (
                <li key={index} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 flex-1 truncate text-fg">{row.title}</span>
                  <span className="shrink-0 text-xs text-fg-subtle">
                    {row.project ? `${row.project} · ` : ""}
                    {row.priority}
                    {row.dueDate ? ` · ${formatDate(row.dueDate)}` : ""}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {summary.rejected.length > 0 && (
          <div>
            <p className="mb-1.5 text-xs font-semibold uppercase tracking-wide text-danger">Rejected rows</p>
            <ul className="space-y-1 text-sm">
              {summary.rejected.map((row) => (
                <li key={row.line} className="rounded-lg bg-danger-soft px-3 py-2 text-danger">
                  <span className="font-medium">Row {row.line}</span>
                  {row.title ? ` — "${row.title}"` : ""}: {row.issues.join(", ")}
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
