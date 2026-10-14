import Link from "next/link";

export const metadata = {
  title: "Offline | CODITENT",
};

export default function OfflinePage() {
  return (
    <main id="main" className="mx-auto flex min-h-screen max-w-xl flex-col justify-center px-6 py-16 text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-primary">CODITENT</p>
      <h1 className="mt-3 text-3xl font-bold">You are offline</h1>
      <p className="mt-3 text-muted-foreground">
        Previously opened pages and static assets remain available. Reconnect to load current opportunities or submit changes.
      </p>
      <Link className="mt-6 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 font-semibold text-primary-foreground" href="/">
        Try the home page
      </Link>
    </main>
  );
}
