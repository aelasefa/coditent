export const categories = [
  {
    emoji: "⚡",
    label: "Engineering",
    slug: "engineering",
    desc: "Frontend, backend, mobile & more",
    bg: "linear-gradient(135deg, #3730a3, #4f46e5)",
  },
  {
    emoji: "🎨",
    label: "Design",
    slug: "design",
    desc: "Product, UX, brand & visual",
    bg: "linear-gradient(135deg, #86198f, #a21caf)",
  },
  {
    emoji: "📊",
    label: "Data & BI",
    slug: "data",
    desc: "Analytics, ML & data engineering",
    bg: "linear-gradient(135deg, #0e7490, #0891b2)",
  },
  {
    emoji: "🔁",
    label: "Operations",
    slug: "operations",
    desc: "Recruiting, sales & support",
    bg: "linear-gradient(135deg, #065f46, #059669)",
  },
  {
    emoji: "🤝",
    label: "Success",
    slug: "success",
    desc: "Customer success & onboarding",
    bg: "linear-gradient(135deg, #92400e, #d97706)",
  },
  {
    emoji: "🚀",
    label: "All roles",
    slug: "all",
    desc: "Browse every open position",
    bg: "linear-gradient(135deg, #4c1d95, #7c3aed)",
  },
] as const;

export type CategorySlug = (typeof categories)[number]["slug"];