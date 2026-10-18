import Link from "next/link";
import Image from "next/image";
import { Logo } from "@/components/ui/logo";
import styles from "./not-found.module.css";

export default function NotFound() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link href="/" aria-label="Coditent home" className={styles.logoLink}>
          <Logo size="md" />
        </Link>
      </header>

      <section className={styles.layout} aria-labelledby="not-found-title">
        <div className={styles.copy}>
          <p className={styles.eyebrow}>404 · Path not found</p>
          <h1 id="not-found-title" className={styles.title}>
            This path <span>wandered off.</span>
          </h1>
          <p className={styles.description}>
            The page may have moved, or the address might be incomplete. Let&apos;s get you back to a useful place.
          </p>
          <div className={styles.actions}>
            <Link href="/" className={styles.primaryAction}>
              Return home
            </Link>
            <Link href="/offers/all" className={styles.secondaryAction}>
              Browse opportunities
            </Link>
          </div>
        </div>

        <div className={styles.artwork} aria-hidden="true">
          <picture className={styles.picture}>
            <source media="(prefers-reduced-motion: reduce)" srcSet="/images/system/404-cat-static.svg" />
            <Image
              className={styles.image}
              src="/images/system/404-cat.svg"
              alt=""
              width="950"
              height="847"
              unoptimized
              fetchPriority="high"
            />
          </picture>
        </div>
      </section>
    </main>
  );
}
