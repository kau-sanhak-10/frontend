// 접수함·상세에서 쓰는 날짜·시간 표시 (화면 없이 테스트할 수 있는 순수 함수)

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function sameDay(a: Date, b: Date) {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

/** 시:분 (예: 09:42) */
export function formatClock(time: number): string {
  const d = new Date(time);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 월.일 (예: 10.20) */
export function formatMonthDay(time: number): string {
  const d = new Date(time);
  return `${d.getMonth() + 1}.${pad(d.getDate())}`;
}

/** 접수 시각. 오늘이면 '오늘 09:42', 어제면 '어제 16:10', 그 전이면 '10.18 14:00' */
export function formatReceivedAt(time: number, now: number): string {
  const d = new Date(time);
  const today = new Date(now);
  if (sameDay(d, today)) return `오늘 ${formatClock(time)}`;
  const yesterday = new Date(now);
  yesterday.setDate(today.getDate() - 1);
  if (sameDay(d, yesterday)) return `어제 ${formatClock(time)}`;
  return `${formatMonthDay(time)} ${formatClock(time)}`;
}

/** 방문 시간 범위. 오늘이면 '오늘 14:00–15:00', 아니면 '10.21 14:00–15:00' */
export function formatVisitRange(
  startAt: number,
  endAt: number,
  now: number,
): string {
  const day = sameDay(new Date(startAt), new Date(now))
    ? "오늘"
    : formatMonthDay(startAt);
  return `${day} ${formatClock(startAt)}–${formatClock(endAt)}`;
}
