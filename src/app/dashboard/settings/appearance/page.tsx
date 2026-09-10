"use client";

import * as React from "react";
import { Check, Loader2, Palette, RotateCcw, Type, Wand2 } from "lucide-react";
import { useTheme } from "next-themes";
import {
  Button,
  Field,
  Input,
  PageTransition,
  SegmentedControl,
  Switch,
  useToast,
} from "@/components/ui";
import { Section, SettingsTabs } from "@/components/settings/SettingsSection";
import { useMe, useUpdatePreferences } from "@/hooks/useAuth";
import { UI_SCALES, UI_SCALE_ORDER } from "@/components/layout/UiScale";
import { DEFAULT_FONT_LABEL, DEFAULT_THEME_ID, THEME_COLLECTIONS, themeById, themesIn, type ThemeCollection } from "@/lib/themes";
import { api } from "@/lib/api";
import { cn } from "@/lib/utils";

const PANGRAM = "The quick brown fox jumps over the lazy dog";

const MODE_OPTIONS = [
  { value: "light" as const, label: "Light" },
  { value: "system" as const, label: "System" },
  { value: "dark" as const, label: "Dark" },
];

const COLLECTION_HINT: Record<ThemeCollection | "all", string> = {
  all: "Every theme, in one grid.",
  men: "Deeper, cooler, lower-contrast colour.",
  women: "Warmer, softer, more saturated colour.",
  other: "Neutrals, classics and accessibility options.",
};

/**
 * One theme in the gallery.
 *
 * The swatches are the real thing: `data-theme` is set on the card itself, so
 * the tokens inside resolve from src/app/themes.css exactly as they would if
 * the theme were applied to the whole page. There is nothing to keep in sync.
 */
function ThemeCard({
  theme,
  selected,
  dark,
  onSelect,
}: {
  theme: { id: string; name: string; font: string };
  selected: boolean;
  dark: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "group rounded-xl border p-1 text-left transition-all focus-visible:ring-2 focus-visible:ring-ring",
        selected ? "border-primary ring-2 ring-primary/40" : "border-border hover:border-border-strong"
      )}
    >
      {/* The preview is its own theme scope; `dark` mirrors the live mode. */}
      <div data-theme={theme.id} className={cn("overflow-hidden rounded-lg border border-border", dark && "dark")}>
        <div className="space-y-2 bg-bg p-3">
          <div className="flex items-center gap-1.5">
            <span className="h-5 w-5 rounded-full bg-primary" />
            <span className="h-5 w-5 rounded-full bg-accent" />
            <span className="h-5 w-5 rounded-full bg-success" />
            <span className="h-5 w-5 rounded-full bg-warning" />
          </div>
          <div className="space-y-1.5 rounded-md border border-border bg-surface p-2">
            <span className="block h-1.5 w-3/4 rounded-full bg-fg/80" />
            <span className="block h-1.5 w-1/2 rounded-full bg-fg-muted/60" />
            <span className="block h-1.5 w-2/3 rounded-full bg-border-strong" />
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 px-2 py-1.5">
        <span className="truncate text-xs font-medium text-fg">{theme.name}</span>
        {selected ? (
          <Check className="h-3.5 w-3.5 shrink-0 text-primary" />
        ) : (
          <span className="truncate text-[10px] text-fg-subtle">{theme.font || DEFAULT_FONT_LABEL}</span>
        )}
      </div>
    </button>
  );
}

/**
 * The font field. Suggestions come from the committed family list, but a typed
 * name is never rejected out of hand - it is checked against Google directly,
 * so a family added after that list was generated still works.
 */
function FontPicker({
  value,
  onApply,
}: {
  value: string;
  onApply: (family: string) => void;
}) {
  const [query, setQuery] = React.useState(value);
  const [suggestions, setSuggestions] = React.useState<Array<{ family: string; category: string }>>([]);
  const [open, setOpen] = React.useState(false);
  const [checking, setChecking] = React.useState(false);
  const [error, setError] = React.useState("");
  const [preview, setPreview] = React.useState(value);

  React.useEffect(() => {
    setQuery(value);
    setPreview(value);
    setError("");
  }, [value]);

  // Debounced so a fast typist makes one request, not one per keystroke.
  React.useEffect(() => {
    const term = query.trim();
    if (!term || term === value) {
      setSuggestions([]);
      return;
    }
    const timer = setTimeout(() => {
      api
        .searchFonts(term)
        .then(setSuggestions)
        .catch(() => setSuggestions([]));
    }, 200);
    return () => clearTimeout(timer);
  }, [query, value]);

  const apply = async (family: string) => {
    const name = family.trim();
    setOpen(false);
    setError("");

    if (!name) {
      onApply("");
      return;
    }

    setChecking(true);
    try {
      await api.checkFont(name);
      setPreview(name);
      onApply(name);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setChecking(false);
    }
  };

  return (
    <div className="space-y-3">
      <Field label="Font family" error={error} htmlFor="font-family">
        <div className="relative">
          <Input
            id="font-family"
            value={query}
            placeholder={DEFAULT_FONT_LABEL}
            autoComplete="off"
            invalid={Boolean(error)}
            onChange={(e) => {
              setQuery(e.target.value);
              setOpen(true);
              setError("");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                apply(query);
              }
              if (e.key === "Escape") setOpen(false);
            }}
            onBlur={() => setTimeout(() => setOpen(false), 150)}
          />
          {checking && (
            <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-fg-subtle" />
          )}

          {open && suggestions.length > 0 && (
            <ul className="absolute z-20 mt-1 max-h-60 w-full overflow-y-auto scrollbar-thin rounded-lg border border-border bg-surface-raised p-1 shadow-lg">
              {suggestions.map((font) => (
                <li key={font.family}>
                  <button
                    type="button"
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => apply(font.family)}
                    className="flex w-full items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-left text-sm text-fg hover:bg-surface-sunken"
                  >
                    <span className="truncate">{font.family}</span>
                    <span className="shrink-0 text-[10px] uppercase tracking-wide text-fg-subtle">{font.category}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </Field>

      <p className="text-xs text-fg-muted">
        Any Google Fonts family works - type a name and press Enter, even if it is not in the list. Fonts are served
        through this app, never fetched from Google by your browser.
      </p>

      {/* A font is only ever previewed after it has been applied, so FontEffect
          has already loaded it through the proxy - there is nothing to load here. */}
      <div className="rounded-lg border border-border bg-surface-sunken p-4">
        <p
          className="text-lg text-fg"
          style={preview ? { fontFamily: `"${preview}", var(--font-sans)` } : undefined}
        >
          {PANGRAM}
        </p>
        <p
          className="mt-1 text-sm text-fg-muted"
          style={preview ? { fontFamily: `"${preview}", var(--font-sans)` } : undefined}
        >
          {preview || DEFAULT_FONT_LABEL} · 0123456789
        </p>
      </div>

      {value && (
        <Button variant="ghost" size="sm" onClick={() => apply("")}>
          <RotateCcw className="h-3.5 w-3.5" />
          Back to {DEFAULT_FONT_LABEL}
        </Button>
      )}
    </div>
  );
}

export default function AppearanceSettingsPage() {
  const toast = useToast();
  const { data: user } = useMe();
  const { theme, setTheme } = useTheme();
  const updatePreferences = useUpdatePreferences();
  const [collection, setCollection] = React.useState<ThemeCollection | "all">("all");

  const preferences = user?.preferences;
  const themeId = preferences?.themeId || DEFAULT_THEME_ID;
  const fontFamily = preferences?.fontFamily || "";

  const savePreference = (patch: Partial<Preferences>) => {
    updatePreferences.mutate(patch, {
      onError: (error) => toast.error("Could not save preference", { description: (error as Error).message }),
    });
  };

  // The cards preview in whichever mode the app is currently showing.
  const [dark, setDark] = React.useState(false);
  React.useEffect(() => {
    const root = document.documentElement;
    const sync = () => setDark(root.classList.contains("dark"));
    sync();
    const observer = new MutationObserver(sync);
    observer.observe(root, { attributes: true, attributeFilter: ["class"] });
    return () => observer.disconnect();
  }, []);

  const themes = themesIn(collection);

  return (
    <PageTransition className="mx-auto max-w-2xl space-y-5">
      <SettingsTabs />

      <Section
        icon={<Palette className="h-4 w-4" />}
        title="Theme"
        description="50 palettes, each with a light and a dark version. Your light/dark choice in the topbar still applies."
      >
        <div>
          <p className="mb-2 text-sm font-medium text-fg">Mode</p>
          <SegmentedControl
            value={(theme as ThemePreference) || "system"}
            onChange={(value) => {
              setTheme(value);
              savePreference({ theme: value });
            }}
            options={MODE_OPTIONS}
          />
        </div>

        <div className="space-y-1.5">
          <SegmentedControl
            value={collection}
            onChange={setCollection}
            options={THEME_COLLECTIONS}
            className="flex-wrap"
          />
          <p className="text-xs text-fg-muted">{COLLECTION_HINT[collection]}</p>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {themes.map((theme) => (
            <ThemeCard
              key={theme.id}
              theme={theme}
              dark={dark}
              selected={theme.id === themeId}
              onSelect={() => savePreference({ themeId: theme.id })}
            />
          ))}
        </div>

        {themeById(themeId).font && themeById(themeId).font !== fontFamily && (
          <Button
            variant="secondary"
            size="sm"
            onClick={() => savePreference({ fontFamily: themeById(themeId).font })}
          >
            <Wand2 className="h-3.5 w-3.5" />
            Use {themeById(themeId).name}&apos;s font ({themeById(themeId).font})
          </Button>
        )}
      </Section>

      <Section
        icon={<Type className="h-4 w-4" />}
        title="Font"
        description="Applies everywhere. Code and numbers keep their monospace face."
      >
        <FontPicker value={fontFamily} onApply={(family) => savePreference({ fontFamily: family })} />
      </Section>

      <Section
        icon={<Type className="h-4 w-4" />}
        title="Size and density"
        description="Saved to your account, so they follow you between devices."
      >
        <div>
          <p className="mb-2 text-sm font-medium text-fg">Text and interface size</p>
          <SegmentedControl
            value={preferences?.uiScale || "normal"}
            onChange={(value) => savePreference({ uiScale: value })}
            options={UI_SCALE_ORDER.map((scale) => ({ value: scale, label: UI_SCALES[scale].label }))}
          />
          <p className="mt-1.5 text-xs text-fg-muted">
            Everything in the app is rem-based, so text and spacing scale together. Applies straight away.
          </p>
        </div>

        <label className="flex items-center justify-between gap-4">
          <span>
            <span className="block text-sm font-medium text-fg">Compact cards</span>
            <span className="block text-xs text-fg-muted">Fit more todos on screen at once.</span>
          </span>
          <Switch
            checked={preferences?.density === "compact"}
            onCheckedChange={(checked) => savePreference({ density: checked ? "compact" : "comfortable" })}
            label="Compact cards"
          />
        </label>
      </Section>
    </PageTransition>
  );
}
