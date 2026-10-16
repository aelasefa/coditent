import { cn } from "@/lib/cn";
import styles from "./twinkling-stars.module.css";

export function TwinklingStars({ className }: { className?: string }) {
  return (
    <div className={cn(styles.field, className)} aria-hidden="true">
      {Array.from({ length: 18 }, (_, index) => (
        <span key={index} className={styles.star} />
      ))}
    </div>
  );
}
