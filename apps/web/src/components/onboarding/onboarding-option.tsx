import styles from "./onboarding-option.module.css";

interface OnboardingOptionProps {
  title: string;
  description?: string;
  selected: boolean;
  multiple?: boolean;
  onSelect: () => void;
}

export function OnboardingOption({
  title,
  description,
  selected,
  multiple = false,
  onSelect,
}: OnboardingOptionProps) {
  return (
    <button
      type="button"
      className={selected ? styles.selected : styles.option}
      role={multiple ? "checkbox" : "radio"}
      aria-checked={selected}
      onClick={onSelect}
    >
      <span className={styles.indicator} aria-hidden>
        {selected ? "✓" : ""}
      </span>
      <span>
        <span className={styles.title}>{title}</span>
        {description ? <span className={styles.description}>{description}</span> : null}
      </span>
    </button>
  );
}
