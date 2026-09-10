"use client";

import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";

export interface DiscoverFilters {
  query: string;
  field: string;
  region: string;
  type: "ALL" | "JOB" | "INTERNSHIP";
  sort: "match" | "newest";
}

interface FilterBarProps {
  filters: DiscoverFilters;
  onChange: (f: DiscoverFilters) => void;
  fields: string[];
  regions: string[];
  onGenerate: () => void;
  generating: boolean;
}

export function FilterBar({ filters, onChange, fields, regions, onGenerate, generating }: FilterBarProps) {
  const activeChips: Array<{ key: string; label: string; clear: () => void }> = [];
  if (filters.field) activeChips.push({ key: "field", label: filters.field, clear: () => onChange({ ...filters, field: "" }) });
  if (filters.region) activeChips.push({ key: "region", label: filters.region, clear: () => onChange({ ...filters, region: "" }) });
  if (filters.type !== "ALL")
    activeChips.push({
      key: "type",
      label: filters.type === "JOB" ? "Job" : "Internship",
      clear: () => onChange({ ...filters, type: "ALL" }),
    });

  return (
    <div className="space-y-3">
      <Input
        label="Search opportunities"
        placeholder="Search roles, skills or companies"
        value={filters.query}
        onChange={(e) => onChange({ ...filters, query: e.target.value })}
        autoComplete="off"
      />
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Select
          aria-label="Field"
          label="Field"
          value={filters.field}
          onChange={(e) => onChange({ ...filters, field: e.target.value })}
        >
          <option value="">All fields</option>
          {fields.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Region"
          label="Region"
          value={filters.region}
          onChange={(e) => onChange({ ...filters, region: e.target.value })}
        >
          <option value="">All regions</option>
          {regions.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </Select>
        <Select
          aria-label="Opportunity type"
          label="Type"
          value={filters.type}
          onChange={(e) => onChange({ ...filters, type: e.target.value as DiscoverFilters["type"] })}
        >
          <option value="ALL">All types</option>
          <option value="JOB">Job</option>
          <option value="INTERNSHIP">Internship</option>
        </Select>
        <Select
          aria-label="Sort"
          label="Sort"
          value={filters.sort}
          onChange={(e) => onChange({ ...filters, sort: e.target.value as DiscoverFilters["sort"] })}
        >
          <option value="match">Best match</option>
          <option value="newest">Newest</option>
        </Select>
      </div>
      {activeChips.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5" aria-label="Active filters">
          {activeChips.map((c) => (
            <button
              key={c.key}
              type="button"
              onClick={c.clear}
              aria-label={`Remove filter ${c.label}`}
              className="inline-flex items-center gap-1 rounded-full bg-surface-secondary px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-hover"
            >
              {c.label} <span aria-hidden>×</span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => onChange({ ...filters, field: "", region: "", type: "ALL", query: "" })}
            className="text-xs font-semibold text-primary hover:underline"
          >
            Clear all
          </button>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" onClick={onGenerate} loading={generating}>
          Refresh recommendations
        </Button>
        <Badge variant="neutral">AI ranked</Badge>
      </div>
    </div>
  );
}
