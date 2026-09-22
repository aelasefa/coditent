import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Applications — Coditent",
};

export default function ApplicationsLayout({ children }: { children: React.ReactNode }) {
  return children;
}
