import Link from "next/link";
import styles from "./owner-inquiries.module.css";

type TabKey = "today" | "inquiries" | "schedule" | "business";

const TABS: { key: TabKey; label: string; href: string | null }[] = [
  { key: "today", label: "오늘", href: "/owner" },
  { key: "inquiries", label: "접수", href: "/owner/inquiries" },
  // 일정·업체 화면은 다른 작업에서 만듭니다.
  { key: "schedule", label: "일정", href: null },
  { key: "business", label: "업체", href: null },
];

/** 사장님 화면 아래 탭 (피그마 Mobile / Navigation) */
export function OwnerTabBar({ current }: { current: TabKey }) {
  return (
    <nav className={styles.tabBar} aria-label="사장님 메뉴">
      {TABS.map((tab) =>
        tab.href ? (
          <Link
            key={tab.key}
            href={tab.href}
            className={styles.tabBarItem}
            aria-current={tab.key === current ? "page" : undefined}
          >
            {tab.label}
          </Link>
        ) : (
          <span
            key={tab.key}
            className={`${styles.tabBarItem} ${styles.tabBarDisabled}`}
            aria-disabled="true"
            title="준비 중이에요"
          >
            {tab.label}
          </span>
        ),
      )}
    </nav>
  );
}
