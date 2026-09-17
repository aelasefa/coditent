"use client";

import { useRef } from "react";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import styles from "./candidate-pages.module.css";

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
  onGenerate: () => void;
  generating: boolean;
}

export function FilterBar({ filters, onChange, onGenerate, generating }: FilterBarProps) {
  const searchRef = useRef<HTMLInputElement>(null);
  const hasFilters = Boolean(filters.query || filters.field || filters.region || filters.type !== "ALL" || filters.sort !== "match");

  return (
    <div className={styles.discoverToolbar}>
      <div className={styles.toolbarSearch}>
        <Input
          ref={searchRef}
          label="Search opportunities"
          placeholder="Role, skill or company"
          value={filters.query}
          onChange={(e) => onChange({ ...filters, query: e.target.value })}
          autoComplete="off"
          className={filters.query ? "pr-10" : undefined}
        />
        {filters.query ? <button type="button" aria-label="Clear search" onClick={() => { onChange({ ...filters, query: "" }); searchRef.current?.focus(); }} className="absolute right-3 top-9 rounded p-1 text-muted-foreground hover:text-foreground">×</button> : null}
      </div>
      <div className={styles.toolbarPair}>
        <Input label="Field" placeholder="Any field" value={filters.field} onChange={(e) => onChange({ ...filters, field: e.target.value })} />
        <Input label="Region" placeholder="Any region" value={filters.region} onChange={(e) => onChange({ ...filters, region: e.target.value })} />
      </div>
      <div className={styles.toolbarPair}>
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
      <div className={styles.toolbarActions}>
        <Button variant="secondary" size="sm" onClick={onGenerate} loading={generating}>
          Analyze matches
        </Button>
        {hasFilters ? <button type="button" onClick={() => onChange({ query: "", field: "", region: "", type: "ALL", sort: "match" })} className="text-xs font-semibold text-primary hover:underline">Clear filters</button> : null}
        <span>Uses your profile field and city when left blank.</span>
      </div>
    </div>
  );
}
