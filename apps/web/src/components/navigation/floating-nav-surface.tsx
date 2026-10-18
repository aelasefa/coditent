import styles from "./floating-nav-surface.module.css";

interface FloatingNavSurfaceProps {
  scrolled?: boolean;
}

export function FloatingNavSurface({ scrolled = false }: FloatingNavSurfaceProps) {
  return (
    <span
      aria-hidden="true"
      className={`${styles.surface} ${scrolled ? styles.surfaceScrolled : ""}`}
    />
  );
}
