import styles from "./cv-processing-indicator.module.css";

export type CVProcessingPhase = "uploading" | "parsing" | "deleting";

interface CVProcessingIndicatorProps {
  phase: CVProcessingPhase;
  progress: number;
  filename: string;
}

export function CVProcessingIndicator({ phase, progress, filename }: CVProcessingIndicatorProps) {
  const uploadProgress = Math.min(100, Math.max(0, Math.round(progress)));
  const isParsing = phase === "parsing";
  const isDeleting = phase === "deleting";
  const title = isDeleting ? "Removing your CV" : isParsing ? "Reading your CV" : "Uploading your CV";
  const detail = isDeleting
    ? "This may take a few seconds."
    : isParsing
      ? "Finding skills, experience and education."
      : `${uploadProgress}% uploaded`;

  return (
    <section
      className={styles.root}
      data-phase={phase}
    >
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
        {isDeleting ? "Removing your CV. This may take a few seconds." : isParsing ? "CV uploaded. Reading your CV." : "Uploading your CV."}
      </p>
      <div className={styles.visual} aria-hidden="true">
        <div className={styles.scanner}>
          <div className={styles.paper}>
            <span className={styles.paperLabel}>CV</span>
            <span className={`${styles.paperLine} ${styles.paperLineStrong}`} />
            <span className={styles.paperLine} />
            <span className={`${styles.paperLine} ${styles.paperLineShort}`} />
            <span className={styles.paperDivider} />
            <span className={styles.paperLine} />
            <span className={`${styles.paperLine} ${styles.paperLineMedium}`} />
            <span className={`${styles.paperLine} ${styles.paperLineShort}`} />
          </div>
          {isDeleting ? (
            <>
              <span className={styles.shredderHead}><span /></span>
              <span className={styles.shreds}>
                <span /><span /><span /><span /><span /><span /><span />
              </span>
            </>
          ) : (
            <>
              <span className={styles.scanBeam} />
              <span className={styles.scannerBase} />
            </>
          )}
        </div>
      </div>

      <div className={styles.copy}>
        <p className={styles.eyebrow}>{isDeleting ? "Removing document" : isParsing ? "Step 2 of 2" : "Step 1 of 2"}</p>
        <h3>{title}</h3>
        <p className={styles.filename} title={filename}>{filename}</p>
        <p className={styles.detail}>{detail}</p>

        {!isDeleting ? <div className={styles.steps} aria-hidden="true">
          <span className={`${styles.step} ${styles.stepActive}`}>Upload</span>
          <span className={`${styles.step} ${isParsing ? styles.stepActive : ""}`}>Read</span>
        </div> : null}

        {isDeleting ? (
          <>
            <div className={`${styles.progressTrack} ${styles.indeterminateTrack}`} role="progressbar" aria-label="Removing CV">
              <span />
            </div>
            <p className={styles.waitNote}>Keep this page open while we remove the document.</p>
          </>
        ) : !isParsing ? (
          <div
            className={styles.progressTrack}
            role="progressbar"
            aria-label="CV upload progress"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={uploadProgress}
          >
            <span style={{ width: `${uploadProgress}%` }} />
          </div>
        ) : (
          <p className={styles.waitNote}>Keep this page open while we prepare the details for review.</p>
        )}
      </div>
    </section>
  );
}
