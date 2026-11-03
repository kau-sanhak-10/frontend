import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout } from "node:timers/promises";

// 빌드된 초기 화면의 경로·링크·설치 자산 확인. 실제 인증·예약 검증과는 별개다.
const listener = createServer();
await new Promise((resolve, reject) => {
  listener.once("error", reject);
  listener.listen(0, "127.0.0.1", resolve);
});
const port = listener.address().port;
await new Promise((resolve) => listener.close(resolve));
const server = spawn(
  process.execPath,
  [
    "node_modules/next/dist/bin/next",
    "start",
    "--hostname",
    "127.0.0.1",
    "--port",
    String(port),
  ],
  {
    cwd: process.cwd(),
    env: { ...process.env, CUSTOMER_PREVIEW_ENABLED: "false" },
    stdio: ["ignore", "pipe", "pipe"],
  },
);
let logs = "";
server.stdout.on("data", (chunk) => (logs += chunk));
server.stderr.on("data", (chunk) => (logs += chunk));
const base = `http://127.0.0.1:${port}`;

try {
  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error(logs);
    try {
      ready = (await fetch(base)).ok;
    } catch {
      // 서버 시작 중 연결 거절만 재시도한다.
    }
    if (ready) break;
    await setTimeout(200);
  }
  assert.ok(ready, `초기 화면 서버 시작 실패: ${logs}`);
  const home = await (await fetch(base)).text();
  assert.match(home, /<html[^>]*lang="ko"/);
  assert.match(home, /name="viewport"/);
  assert.match(home, /href="\/manifest.webmanifest"/);
  for (const [role, title] of Object.entries({
    customer: "고객 문의",
    owner: "사장님 관리",
    admin: "운영 관리",
  })) {
    assert.ok(home.includes(`href="/${role}"`), `${role} 진입 링크 누락`);
    const response = await fetch(`${base}/${role}`);
    assert.equal(response.status, 200);
    const html = await response.text();
    assert.ok(html.includes(title), `${role} 화면 구분 실패`);
    assert.ok(html.includes('href="/"'), `${role} 홈 복귀 링크 누락`);
    assert.ok(
      html.includes(
        role === "customer"
          ? "후속 작업에서 연결합니다"
          : "구현되지 않았습니다",
      ),
      "미구현 기능을 제공 중으로 표시함",
    );
  }
  assert.equal((await fetch(`${base}/unknown-role`)).status, 404);
  assert.equal((await fetch(`${base}/customer/preview`)).status, 404);
  assert.equal(
    (await fetch(`${base}/customer/preview?state=ready`)).status,
    404,
  );
  const manifest = await (await fetch(`${base}/manifest.webmanifest`)).json();
  assert.equal(manifest.start_url, "/owner");
  assert.equal(manifest.display, "standalone");
  for (const icon of manifest.icons) {
    const response = await fetch(new URL(icon.src, base));
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type"), /^image\//);
  }
  console.log(
    "FE-01 통과: 역할별 진입·홈 복귀·404·모바일 viewport·manifest·설치 아이콘",
  );
} finally {
  if (server.exitCode === null) {
    server.kill();
    await new Promise((resolve) => server.once("exit", resolve));
  }
}
