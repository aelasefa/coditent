"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AdminShell } from "@/components/admin/admin-shell";
import { PageHeader } from "@/components/shell/page-container";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { useToast } from "@/components/ui/toast";
import { SupportStatusBadge } from "@/components/support/support-button";
import { getAdminSupportReports, supportCategories, supportErrorMessage, supportStatuses, updateSupportReport, type AdminSupportTicket, type SupportStatus } from "@/lib/support";
import styles from "@/components/support/support.module.css";

export default function AdminSupportPage() {
  const [filter, setFilter] = useState<SupportStatus | "all">("open");
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<AdminSupportTicket | null>(null);
  const reports = useQuery({ queryKey: ["admin", "support", filter, offset], queryFn: () => getAdminSupportReports(filter, offset), retry: false });

  return <AdminShell>
    <div className="space-y-6">
      <PageHeader title="Support reports" description="Review issues from candidates and companies. Replies are visible to the person who reported the issue." />
      <div className="flex flex-wrap items-end justify-between gap-4">
        <Select label="Report status" value={filter} onChange={event => { setFilter(event.target.value as SupportStatus | "all"); setOffset(0); }}>
          <option value="all">All reports</option>
          {Object.entries(supportStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        <Button variant="outline" className="min-h-11" disabled={reports.isFetching} onClick={() => reports.refetch()}>Refresh</Button>
      </div>
      {reports.isPending ? <p role="status">Loading support reports…</p>
      : reports.isError ? <div role="alert" className="rounded-xl border border-border bg-surface p-6"><p>Couldn’t load reports. Try refreshing the list.</p></div>
      : <>
        <p className="text-sm text-muted-foreground">{reports.data.total} {reports.data.total === 1 ? "report" : "reports"}</p>
        {reports.data.tickets.length === 0 ? <div className="rounded-xl border border-dashed border-border bg-surface p-8 text-center"><h2 className="font-semibold">{filter === "all" ? "No reports yet" : `No ${supportStatuses[filter].toLowerCase()} reports`}</h2><p className="mt-2 text-sm text-muted-foreground">Issues sent through the Support button will appear here.</p></div>
        : <ul className="space-y-3" aria-label="Support reports">{reports.data.tickets.map(ticket => <li key={ticket.id} className={styles.report}>
          <div className={styles.reportHeader}><h2 className="font-semibold">{ticket.subject}</h2><SupportStatusBadge status={ticket.status} /></div>
          <p className="mt-2 text-sm text-muted-foreground">{ticket.reporter_name} · {ticket.reporter_email}{ticket.company_name ? ` · ${ticket.company_name}` : ` · ${ticket.reporter_role === "CANDIDATE" ? "Candidate" : "User"}`}</p>
          <p className="mt-1 text-xs text-muted-foreground">#{ticket.id.slice(0, 8)} · {supportCategories[ticket.category]} · {new Date(ticket.created_at).toLocaleString()}</p>
          <p className="mt-3 line-clamp-2 whitespace-pre-wrap break-words text-sm">{ticket.description}</p>
          <Button className="mt-3 min-h-11" variant="outline" onClick={() => setSelected(ticket)}>Review report</Button>
        </li>)}</ul>}
        {reports.data.total > 20 && <div className={styles.pagination}>
          <Button className="min-h-11" variant="outline" disabled={offset === 0 || reports.isFetching} onClick={() => setOffset(value => Math.max(0, value - 20))}>Previous</Button>
          <span className="text-sm">Page {offset / 20 + 1}</span>
          <Button className="min-h-11" variant="outline" disabled={offset + 20 >= reports.data.total || reports.isFetching} onClick={() => setOffset(value => value + 20)}>Next</Button>
        </div>}
      </>}
      {selected && <ReviewReport key={selected.id} ticket={selected} onClose={() => setSelected(null)} />}
    </div>
  </AdminShell>;
}

function ReviewReport({ ticket, onClose }: { ticket: AdminSupportTicket; onClose: () => void }) {
  const [status, setStatus] = useState(ticket.status);
  const [response, setResponse] = useState(ticket.response ?? "");
  const client = useQueryClient();
  const { toast } = useToast();
  const save = useMutation({
    mutationFn: () => updateSupportReport(ticket.id, status, response),
    onSuccess: () => {
      client.invalidateQueries({ queryKey: ["admin", "support"] });
      client.invalidateQueries({ queryKey: ["support", "mine"] });
      toast("Report updated", { variant: "success" });
      onClose();
    },
  });
  return <Dialog open title="Review report" description={`#${ticket.id.slice(0, 8)} · ${ticket.reporter_name}`} onClose={() => { if (!save.isPending) onClose(); }} size="xl">
    <form className={styles.form} onSubmit={event => { event.preventDefault(); if (!save.isPending) save.mutate(); }}>
      <div className={styles.report}>
        <h3 className="font-semibold">{ticket.subject}</h3>
        <p className="my-2 text-sm text-muted-foreground">{ticket.reporter_email}{ticket.company_name ? ` · ${ticket.company_name}` : ""}</p>
        <p className={styles.body}>{ticket.description}</p>
        {ticket.page_path && <p className="mt-3 break-all text-sm text-muted-foreground">Reported page: {ticket.page_path}</p>}
      </div>
      <Select label="Status" value={status} disabled={save.isPending} onChange={event => setStatus(event.target.value as SupportStatus)}>
        {Object.entries(supportStatuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </Select>
      <label className="text-sm font-medium">Reply to the reporter (optional)
        <textarea className={styles.textarea} value={response} onChange={event => setResponse(event.target.value)} disabled={save.isPending} rows={4} maxLength={2000} placeholder="Share a workaround, a progress update, or explain the fix." aria-describedby="support-reply-help" />
      </label>
      <p id="support-reply-help" className="text-sm text-muted-foreground">This reply appears in the reporter’s My reports view. Updating it replaces the previous reply.</p>
      {save.isError && <p role="alert" className="text-sm text-danger">{supportErrorMessage(save.error)}</p>}
      <Button type="submit" className="min-h-11" loading={save.isPending}>{save.isPending ? "Saving…" : "Save update"}</Button>
    </form>
  </Dialog>;
}
