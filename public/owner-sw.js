// 사장님 업무 알림 서비스 워커 (FE-16 · B-26·B-27)
// 서버 푸시는 내용 없이 옵니다(BE-14). 그래서 고정 문구로 알림을 띄우고,
// 누르면 앱의 알림 목록으로 이동합니다. 고객 정보는 알림에 넣지 않습니다.
const DEFAULT_TITLE = "일로 · 새 업무 알림";
const DEFAULT_BODY = "확인할 업무가 있어요. 눌러서 알림 목록을 열어 주세요.";
const TARGET_PATH = "/owner/notifications";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  // 나중에 서버가 제목·내용을 보내 주면 그걸 쓰고, 없으면 고정 문구를 씁니다.
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch {
    data = {};
  }
  const title = typeof data.title === "string" ? data.title : DEFAULT_TITLE;
  const body = typeof data.body === "string" ? data.body : DEFAULT_BODY;
  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
      tag: "ilro-owner-work",
      renotify: true,
      data: { path: TARGET_PATH },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL(TARGET_PATH, self.location.origin).href;
  event.waitUntil(
    self.clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windows) => {
        // 이미 열린 사장님 화면이 있으면 그 창을 알림 목록으로 바꿉니다.
        for (const client of windows) {
          if (client.url.includes("/owner") && "focus" in client) {
            return client.focus().then((c) => c.navigate(url));
          }
        }
        return self.clients.openWindow(url);
      }),
  );
});
