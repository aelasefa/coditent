import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{js,ts,jsx,tsx,mdx}", "./src/components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        md: {
          background: "#06070B",
          foreground: "#F5F2FF",
          primary: "#8F75C7",
          onPrimary: "#FFFFFF",
          secondaryContainer: "#1D1730",
          onSecondaryContainer: "#DDD3FF",
          tertiary: "#4CB6C4",
          surface: "#0F1118",
          surfaceLow: "#0B0D14",
          outline: "#3A3450",
          onSurfaceVariant: "#B7B1CC",
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
        "md-sm": "0 1px 2px rgba(0, 0, 0, 0.52), 0 0 0 1px rgba(255, 255, 255, 0.03)",
        "md-md": "0 8px 20px rgba(0, 0, 0, 0.5), 0 0 0 1px rgba(255, 255, 255, 0.04)",
        "md-lg": "0 18px 42px rgba(0, 0, 0, 0.58), 0 0 0 1px rgba(255, 255, 255, 0.05)",
      },
      transitionTimingFunction: {
        md: "cubic-bezier(0.2, 0, 0, 1)",
      },
    },
  },
  plugins: [],
};

export default config;
