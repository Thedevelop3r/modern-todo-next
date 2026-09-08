import type { Config } from "tailwindcss";

/**
 * Colours map to the CSS variables declared in src/app/globals.css. The
 * `<alpha-value>` placeholder lets Tailwind opacity modifiers work on tokens,
 * e.g. `bg-primary/10`.
 */
const token = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

const config: Config = {
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/hooks/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/providers/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: token("bg"),
        surface: {
          DEFAULT: token("surface"),
          raised: token("surface-raised"),
          sunken: token("surface-sunken"),
        },
        border: {
          DEFAULT: token("border"),
          strong: token("border-strong"),
        },
        fg: {
          DEFAULT: token("fg"),
          muted: token("fg-muted"),
          subtle: token("fg-subtle"),
        },
        primary: {
          DEFAULT: token("primary"),
          fg: token("primary-fg"),
          soft: token("primary-soft"),
        },
        accent: {
          DEFAULT: token("accent"),
          soft: token("accent-soft"),
        },
        success: { DEFAULT: token("success"), soft: token("success-soft") },
        warning: { DEFAULT: token("warning"), soft: token("warning-soft") },
        danger: { DEFAULT: token("danger"), soft: token("danger-soft") },
        info: { DEFAULT: token("info"), soft: token("info-soft") },
        status: {
          pending: token("status-pending"),
          progress: token("status-progress"),
          completed: token("status-completed"),
        },
        priority: {
          none: token("priority-none"),
          low: token("priority-low"),
          medium: token("priority-medium"),
          high: token("priority-high"),
          urgent: token("priority-urgent"),
        },
        ring: token("ring"),
      },
      borderColor: {
        DEFAULT: token("border"),
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(var(--shadow-color) / 0.05)",
        sm: "0 1px 3px 0 rgb(var(--shadow-color) / 0.08), 0 1px 2px -1px rgb(var(--shadow-color) / 0.06)",
        md: "0 4px 12px -2px rgb(var(--shadow-color) / 0.10), 0 2px 6px -2px rgb(var(--shadow-color) / 0.06)",
        lg: "0 12px 28px -6px rgb(var(--shadow-color) / 0.16), 0 4px 10px -4px rgb(var(--shadow-color) / 0.08)",
        xl: "0 24px 56px -12px rgb(var(--shadow-color) / 0.24)",
        glow: "0 0 0 1px rgb(var(--primary) / 0.20), 0 8px 30px -8px rgb(var(--primary) / 0.45)",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic": "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
        "grid-fade":
          "linear-gradient(to bottom, rgb(var(--bg) / 0) 0%, rgb(var(--bg)) 100%)",
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        "slide-up": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        shimmer: {
          "100%": { transform: "translateX(100%)" },
        },
      },
      animation: {
        "fade-in": "fade-in 160ms ease-out",
        "slide-up": "slide-up 200ms cubic-bezier(0.16, 1, 0.3, 1)",
        shimmer: "shimmer 1.6s infinite",
      },
    },
  },
  plugins: [],
};
export default config;
