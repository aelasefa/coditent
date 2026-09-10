import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: ["./src/app/**/*.{js,ts,jsx,tsx,mdx}", "./src/components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        background: "var(--background)",
        surface: {
          DEFAULT: "var(--surface)",
          secondary: "var(--surface-secondary)",
          hover: "var(--surface-hover)",
        },
        foreground: {
          DEFAULT: "var(--foreground)",
          secondary: "var(--foreground-secondary)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        border: {
          DEFAULT: "var(--border)",
          subtle: "var(--border-subtle)",
          strong: "var(--border-strong)",
        },
        primary: {
          DEFAULT: "var(--primary)",
          hover: "var(--primary-hover)",
          active: "var(--primary-active)",
          foreground: "var(--primary-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        success: {
          DEFAULT: "var(--success)",
          background: "var(--success-background)",
        },
        warning: {
          DEFAULT: "var(--warning)",
          background: "var(--warning-background)",
        },
        danger: {
          DEFAULT: "var(--danger)",
          background: "var(--danger-background)",
        },
        info: {
          DEFAULT: "var(--info)",
          background: "var(--info-background)",
        },
        // Legacy aliases — deprecated, resolve to semantic tokens
        md: {
          background: "var(--background)",
          foreground: "var(--foreground)",
          primary: "var(--primary)",
          onPrimary: "var(--primary-foreground)",
          secondaryContainer: "var(--surface-secondary)",
          onSecondaryContainer: "var(--foreground-secondary)",
          tertiary: "var(--accent)",
          surface: "var(--surface)",
          surfaceLow: "var(--surface-secondary)",
          outline: "var(--border)",
          onSurfaceVariant: "var(--muted-foreground)",
        },
      },
      borderRadius: {
        sm: "var(--radius-sm)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-2xl)",
        "3xl": "var(--radius-3xl)",
        "md-xs": "var(--radius-sm)",
        "md-sm": "var(--radius-lg)",
        "md-lg": "var(--radius-3xl)",
        "md-xl": "28px",
        "md-2xl": "32px",
        "md-hero": "48px",
      },
      boxShadow: {
        sm: "0 1px 2px var(--shadow-color)",
        md: "0 8px 24px var(--shadow-color)",
        lg: "0 18px 48px var(--shadow-color)",
        "md-sm": "0 1px 2px var(--shadow-color)",
        "md-md": "0 8px 24px var(--shadow-color)",
        "md-lg": "0 18px 48px var(--shadow-color)",
      },
      transitionDuration: {
        fast: "150ms",
        normal: "220ms",
        slow: "400ms",
      },
      transitionTimingFunction: {
        md: "cubic-bezier(0.2, 0, 0, 1)",
        standard: "cubic-bezier(0.22, 1, 0.36, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
