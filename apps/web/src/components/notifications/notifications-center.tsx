"use client";

import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { FiBell, FiCheck, FiChevronLeft, FiChevronRight } from "react-icons/fi";

import { Button } from "@/components/ui/button";
import {
  getNotificationPreferences,
  listNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  updateNotificationPreferences,
} from "@/lib/api";
import type { NotificationPreferences, ProductNotification } from "@/lib/types";


const preferenceRows: Array<{
  key: keyof Pick<NotificationPreferences, "application_updates" | "assessment_updates" | "interview_updates" | "message_updates">;
  label: string;
  description: string;
}> = [
  { key: "application_updates", label: "Application updates", description: "Stage changes, decisions, and hiring progress." },
  { key: "assessment_updates", label: "Assessment updates", description: "New assignments and completed reviews." },
  { key: "interview_updates", label: "Interview updates", description: "Interview scheduling and changes." },
  { key: "message_updates", label: "Message updates", description: "New direct and recruitment messages." },
];

function notificationDate(value: string): string {
  return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function NotificationLink({ item, onRead }: { item: ProductNotification; onRead: (id: string) => void }) {
  const content = (
    <div className="flex gap-3">
      <span className={`mt-1 flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${item.read_at ? "bg-muted text-muted-foreground" : "bg-primary/10 text-primary"}`}>
        {item.read_at ? <FiCheck aria-hidden="true" /> : <FiBell aria-hidden="true" />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block font-semibold text-foreground">{item.title}</span>
        <span className="mt-1 block text-sm leading-6 text-muted-foreground">{item.body}</span>
        <span className="mt-2 block text-xs text-muted-foreground">{notificationDate(item.created_at)}</span>
      </span>
    </div>
  );
  const className = `block rounded-xl border p-4 text-left transition hover:border-primary/40 ${item.read_at ? "border-border-subtle bg-surface" : "border-primary/25 bg-primary/[0.03]"}`;
  if (item.action_url) {
    return <Link className={className} href={item.action_url} onClick={() => onRead(item.id)}>{content}</Link>;
  }
  return <button type="button" className={`${className} w-full`} onClick={() => onRead(item.id)}>{content}</button>;
}

export function NotificationsCenter() {
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const notificationsQ = useQuery({
    queryKey: ["notifications", page, unreadOnly],
    queryFn: () => listNotifications(page, unreadOnly),
  });
  const preferencesQ = useQuery({ queryKey: ["notification-preferences"], queryFn: getNotificationPreferences });

  const refreshNotifications = () => {
    void queryClient.invalidateQueries({ queryKey: ["notifications"] });
    void queryClient.invalidateQueries({ queryKey: ["notification-unread"] });
  };
  const readMut = useMutation({ mutationFn: markNotificationRead, onSuccess: refreshNotifications });
  const readAllMut = useMutation({ mutationFn: markAllNotificationsRead, onSuccess: refreshNotifications });
  const preferencesMut = useMutation({
    mutationFn: updateNotificationPreferences,
    onSuccess: (value) => queryClient.setQueryData(["notification-preferences"], value),
  });

  const updatePreference = (key: typeof preferenceRows[number]["key"], enabled: boolean) => {
    const current = preferencesQ.data;
    if (!current) return;
    preferencesMut.mutate({
      application_updates: current.application_updates,
      assessment_updates: current.assessment_updates,
      interview_updates: current.interview_updates,
      message_updates: current.message_updates,
      [key]: enabled,
    });
  };

  const data = notificationsQ.data;
  const pageCount = Math.max(1, Math.ceil((data?.total ?? 0) / (data?.limit ?? 25)));
  return (
    <div className="mx-auto max-w-4xl space-y-6 py-8">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-primary">Activity center</p>
          <h1 className="mt-2 text-3xl font-semibold text-foreground">Notifications</h1>
          <p className="mt-2 text-sm text-muted-foreground">Important hiring activity, assessments, interviews, and messages in one place.</p>
        </div>
        <Button type="button" variant="secondary" disabled={!data?.unread || readAllMut.isPending} onClick={() => readAllMut.mutate()}>
          Mark all as read
        </Button>
      </div>

      <section className="rounded-2xl border border-border-subtle bg-surface p-5" aria-labelledby="notification-preferences-heading">
        <div>
          <h2 id="notification-preferences-heading" className="font-semibold text-foreground">In-app preferences</h2>
          <p className="mt-1 text-sm text-muted-foreground">These choices are enforced when new events are created. Security and account notices cannot be disabled.</p>
        </div>
        {preferencesQ.isLoading ? <p className="mt-4 text-sm text-muted-foreground">Loading preferences…</p> : null}
        {preferencesQ.isError ? <p role="alert" className="mt-4 text-sm text-danger">Preferences could not be loaded.</p> : null}
        {preferencesQ.data ? (
          <div className="mt-4 divide-y divide-border-subtle">
            {preferenceRows.map((row) => (
              <label key={row.key} className="flex cursor-pointer items-center justify-between gap-4 py-3">
                <span><span className="block text-sm font-medium text-foreground">{row.label}</span><span className="block text-xs text-muted-foreground">{row.description}</span></span>
                <input
                  type="checkbox"
                  className="h-5 w-5 accent-primary"
                  checked={preferencesQ.data[row.key]}
                  disabled={preferencesMut.isPending}
                  onChange={(event) => updatePreference(row.key, event.target.checked)}
                />
              </label>
            ))}
          </div>
        ) : null}
      </section>

      <section className="space-y-4" aria-labelledby="notification-list-heading">
        <div className="flex items-center justify-between gap-3">
          <h2 id="notification-list-heading" className="font-semibold text-foreground">Recent activity {data ? `(${data.unread} unread)` : ""}</h2>
          <label className="flex items-center gap-2 text-sm text-muted-foreground"><input type="checkbox" checked={unreadOnly} onChange={(event) => { setUnreadOnly(event.target.checked); setPage(1); }} /> Unread only</label>
        </div>
        {notificationsQ.isLoading ? <p role="status" className="rounded-xl border border-border-subtle bg-surface p-5 text-sm text-muted-foreground">Loading notifications…</p> : null}
        {notificationsQ.isError ? <div role="alert" className="rounded-xl border border-danger/30 bg-danger-background p-5 text-sm text-danger">Notifications could not be loaded. <button className="underline" onClick={() => void notificationsQ.refetch()}>Try again</button></div> : null}
        {data?.notifications.length === 0 ? <div className="rounded-xl border border-dashed border-border p-8 text-center"><FiBell className="mx-auto text-2xl text-muted-foreground" /><p className="mt-3 font-medium text-foreground">You’re all caught up</p><p className="mt-1 text-sm text-muted-foreground">New activity will appear here.</p></div> : null}
        <div className="space-y-3">
          {data?.notifications.map((item) => <NotificationLink key={item.id} item={item} onRead={(id) => { if (!item.read_at) readMut.mutate(id); }} />)}
        </div>
        {pageCount > 1 ? (
          <div className="flex items-center justify-center gap-3 pt-2">
            <Button type="button" variant="ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}><FiChevronLeft aria-hidden="true" /> Previous</Button>
            <span className="text-sm text-muted-foreground">Page {page} of {pageCount}</span>
            <Button type="button" variant="ghost" disabled={page >= pageCount} onClick={() => setPage((value) => value + 1)}>Next <FiChevronRight aria-hidden="true" /></Button>
          </div>
        ) : null}
      </section>
    </div>
  );
}
