import styles from "./owner-auth.module.css";

type StatusPanelProps = {
  title: string;
  body: string;
  tone?: "info" | "error";
  icon?: React.ReactNode;
  children?: React.ReactNode;
};

/** 아이콘 + 제목 + 안내 문구 묶음 (피그마 Mobile / State Panel) */
export function StatusPanel({
  title,
  body,
  tone = "info",
  icon = "!",
  children,
}: StatusPanelProps) {
  return (
    <section className={styles.panel} aria-live="polite">
      <span
        className={`${styles.panelIcon} ${tone === "error" ? styles.panelIconError : ""}`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <h2 className={styles.panelTitle}>{title}</h2>
      <p className={styles.panelBody}>{body}</p>
      {children}
    </section>
  );
}
