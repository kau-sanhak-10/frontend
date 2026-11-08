import Image from "next/image";
import Link from "next/link";
import styles from "./owner-inquiries.module.css";

type TabKey = "today" | "inquiries" | "schedule" | "business";

const TABS: { key: TabKey; label: string; href: string | null }[] = [
  { key: "today", label: "오늘", href: "/owner" },
  { key: "inquiries", label: "접수", href: "/owner/inquiries" },
  { key: "schedule", label: "일정", href: "/owner/schedule" },
  { key: "business", label: "업체", href: null },
];
const ICONS = {
  today: "home",
  inquiries: "inbox",
  schedule: "calendar-active",
  business: "shop",
};

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
            {current === "schedule" ? (
              <Image
                src={`/owner/schedule/${ICONS[tab.key]}.svg`}
                width={22}
                height={22}
                alt=""
              />
            ) : null}
            {tab.label}
          </Link>
        ) : (
          <span
            key={tab.key}
            className={`${styles.tabBarItem} ${styles.tabBarDisabled}`}
            aria-disabled="true"
            title="준비 중이에요"
          >
            {current === "schedule" ? (
              <Image
                src={`/owner/schedule/${ICONS[tab.key]}.svg`}
                width={22}
                height={22}
                alt=""
              />
            ) : null}
            {tab.label}
          </span>
        ),
      )}
    </nav>
  );
}
