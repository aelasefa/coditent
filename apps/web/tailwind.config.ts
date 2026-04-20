import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{js,ts,jsx,tsx,mdx}", "./src/components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        md: {
          background: "#FFFBFE",
          foreground: "#1C1B1F",
          primary: "#6750A4",
          onPrimary: "#FFFFFF",
          secondaryContainer: "#E8DEF8",
          onSecondaryContainer: "#1D192B",
          tertiary: "#7D5260",
          surface: "#F3EDF7",
          surfaceLow: "#E7E0EC",
          outline: "#79747E",
          onSurfaceVariant: "#49454F",
        },
      },
      borderRadius: {
        "md-xs": "8px",
        "md-sm": "12px",
        md: "16px",
        "md-lg": "24px",
        "md-xl": "28px",
        "md-2xl": "32px",
        "md-hero": "48px",
      },
      boxShadow: {
        "md-sm": "0 1px 3px rgba(0, 0, 0, 0.08), 0 1px 2px rgba(0, 0, 0, 0.05)",
        "md-md": "0 6px 14px rgba(0, 0, 0, 0.12), 0 2px 6px rgba(0, 0, 0, 0.08)",
        "md-lg": "0 14px 30px rgba(0, 0, 0, 0.16), 0 6px 12px rgba(0, 0, 0, 0.08)",
      },
      transitionTimingFunction: {
        md: "cubic-bezier(0.2, 0, 0, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
