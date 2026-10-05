"use client";

import { useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FiCheckCircle, FiHelpCircle } from "react-icons/fi";
import { Dialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { getMe } from "@/lib/api";
import { getMySupportReports, submitSupportReport, supportCategories, supportErrorMessage, supportStatuses, type SupportCategory, type SupportStatus } from "@/lib/support";
import styles from "./support.module.css";

export function SupportStatusBadge({ status }: { status: SupportStatus }) {
  return <span className={styles.status} data-status={status}>{supportStatuses[status]}</span>;
}

export function SupportButton() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<"new" | "history">("new");
  const [subject, setSubject] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState<SupportCategory>("technical");
  const [pagePath, setPagePath] = useState(pathname);
  const [includePage, setIncludePage] = useState(true);
  const [offset, setOffset] = useState(0);
  const [validation, setValidation] = useState("");
  const requestId = useRef<string | null>(null);
  const subjectRef = useRef<HTMLInputElement>(null);
  const client = useQueryClient();
  const me = useQuery({ queryKey: ["me"], queryFn: getMe, enabled: open, staleTime: 60_000 });
  const reports = useQuery({
    queryKey: ["support", "mine", me.data?.id, offset],
    queryFn: () => getMySupportReports(offset),
    enabled: open && view === "history" && !!me.data?.id,
    staleTime: 0,
    refetchInterval: 30_000,
    retry: false,
  });
  const send = useMutation({
    mutationFn: submitSupportReport,
    onSuccess: () => {
      setSubject(""); setDescription(""); setCategory("technical");
      requestId.current = null;
      setOffset(0);
      client.invalidateQueries({ queryKey: ["support", "mine"] });
    },
  });
  const close = () => { if (!send.isPending) setOpen(false); };

  return <>
    <div className={styles.spacer} aria-hidden="true" />
    <button className={styles.trigger} type="button" aria-haspopup="dialog" onClick={() => {
      if (!subject && !description) setPagePath(pathname);
      setOpen(true);
    }}><FiHelpCircle aria-hidden="true" /><span>Support</span></button>
    <Dialog open={open} onClose={close} title="Support" description="Tell us what went wrong so we can help." initialFocusRef={view === "new" && !send.isSuccess ? subjectRef : undefined}>
      <div className={styles.switcher} aria-label="Support views">
        <Button type="button" className="min-h-11" variant={view === "new" ? "primary" : "outline"} aria-pressed={view === "new"} disabled={send.isPending} onClick={() => setView("new")}>Report an issue</Button>
        <Button type="button" className="min-h-11" variant={view === "history" ? "primary" : "outline"} aria-pressed={view === "history"} disabled={send.isPending} onClick={() => setView("history")}>My reports</Button>
      </div>
      {view === "new" ? send.isSuccess ? (
        <div className="space-y-4" role="status">
          <FiCheckCircle className="h-8 w-8 text-success" aria-hidden="true" />
          <h3 className="font-semibold">Your report has been received</h3>
          <p className="text-sm text-muted-foreground">Reference #{send.data.id.slice(0, 8)}. Our team can now review it. You’ll find updates and replies in My reports.</p>
          <div className="flex flex-wrap gap-2">
            <Button className="min-h-11" onClick={() => setView("history")}>View my reports</Button>
            <Button className="min-h-11" variant="outline" onClick={() => { send.reset(); setPagePath(pathname); }}>Report another issue</Button>
          </div>
        </div>
      ) : (
        <form className={styles.form} onSubmit={event => {
          event.preventDefault();
          if (send.isPending) return;
          if (subject.trim().length < 5 || description.trim().length < 20) {
            setValidation("Add a subject of at least 5 characters and details of at least 20 characters."); return;
          }
          setValidation("");
          requestId.current ??= crypto.randomUUID();
          send.mutate({ request_id: requestId.current, subject: subject.trim(), description: description.trim(), category, page_path: includePage ? pagePath.slice(0, 500) : null });
        }}>
          <Input ref={subjectRef} label="Subject" placeholder="For example, I can’t upload my resume" required minLength={5} maxLength={160} value={subject} onChange={event => setSubject(event.target.value)} disabled={send.isPending} />
          <Select label="What is this about?" value={category} onChange={event => setCategory(event.target.value as SupportCategory)} disabled={send.isPending}>
            {Object.entries(supportCategories).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
          <label className="text-sm font-medium">What happened? <span aria-hidden="true">*</span>
            <textarea className={styles.textarea} required minLength={20} maxLength={5000} rows={5} value={description} onChange={event => setDescription(event.target.value)} disabled={send.isPending} placeholder="What were you trying to do? What happened instead? Include any steps to reproduce the issue." aria-describedby="support-details-help" />
          </label>
          <p id="support-details-help" className="text-sm text-muted-foreground">Please don’t include passwords, verification codes, or payment details.</p>
          <label className="flex min-h-11 items-start gap-2 text-sm text-muted-foreground">
            <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={includePage} onChange={event => setIncludePage(event.target.checked)} disabled={send.isPending} />
            <span className="min-w-0">Include this page: <span className="break-all">{pagePath}</span></span>
          </label>
          {(validation || send.isError) && <p role="alert" className="text-sm text-danger">{validation || supportErrorMessage(send.error)}</p>}
          <Button type="submit" className="min-h-11 w-full" loading={send.isPending}>{send.isPending ? "Sending report…" : "Send report"}</Button>
        </form>
      ) : (
        <div className="space-y-3">
          {me.isError || reports.isError ? <div role="alert" className="space-y-3"><p className="text-sm">We couldn’t load your reports. Please try again.</p><Button variant="outline" className="min-h-11" onClick={() => me.isError ? me.refetch() : reports.refetch()}>Retry</Button></div>
          : reports.isPending ? <p role="status" className="text-sm text-muted-foreground">Loading your reports…</p>
          : reports.data.tickets.length === 0 ? <p className="text-sm text-muted-foreground">You haven’t sent any reports yet. If something goes wrong, use Report an issue to let us know.</p>
          : reports.data.tickets.map(ticket => <article key={ticket.id} className={styles.report}>
            <div className={styles.reportHeader}><h3 className="text-sm font-semibold">{ticket.subject}</h3><SupportStatusBadge status={ticket.status} /></div>
            <p className="mt-2 text-xs text-muted-foreground">#{ticket.id.slice(0, 8)} · {new Date(ticket.created_at).toLocaleDateString()}</p>
            <details className="mt-3"><summary className="cursor-pointer py-2 text-sm font-medium">Your report</summary><p className={styles.body}>{ticket.description}</p></details>
            {ticket.response && <div className={styles.response}><h4 className="mb-1 text-sm font-semibold">Support reply</h4><p className={styles.body}>{ticket.response}</p></div>}
          </article>)}
          {reports.data && reports.data.total > 10 && <div className={styles.pagination}>
            <Button className="min-h-11" variant="outline" disabled={offset === 0 || reports.isFetching} onClick={() => setOffset(value => Math.max(0, value - 10))}>Previous</Button>
            <span className="text-sm">Page {offset / 10 + 1}</span>
            <Button className="min-h-11" variant="outline" disabled={offset + 10 >= reports.data.total || reports.isFetching} onClick={() => setOffset(value => value + 10)}>Next</Button>
          </div>}
        </div>
      )}
    </Dialog>
  </>;
}
