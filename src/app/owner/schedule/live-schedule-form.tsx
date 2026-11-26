"use client";

import Link from "next/link";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { ApiError } from "@/lib/api";
import { createClientId } from "@/lib/customer-consultation";
import {
  ownerScheduleRequest,
  scheduleClock,
  scheduleDate,
  scheduleIso,
  scheduleIssue,
  type ScheduleDetail,
  type ScheduleItem,
} from "@/lib/owner-schedule-api";
import { getWorkTypes, searchOwnerLocation } from "@/lib/owner-settings-api";
import { workCategories, type WorkType } from "@/lib/owner-settings";
import type { LoadResult } from "@/lib/owner-inquiries/types";
import { useLoad } from "../_components/use-load";
import auth from "../_components/owner-auth.module.css";
import styles from "./schedule.module.css";

type Address = { address: string; lat: number; lng: number };
type FormDataFromServer = {
  reservation?: ScheduleDetail;
  workTypes?: WorkType[];
};
type Confirmation = "outside" | "block-conflict";

export function LiveScheduleForm({
  token,
  mode,
  item,
  date,
  open,
  onSaved,
  onPending,
  onError,
}: {
  token: string;
  mode: "visit" | "block" | "change" | "cancel";
  item?: ScheduleItem;
  date: string;
  open: (mode: "visit" | "block") => void;
  onSaved: (date: string, message: string) => void;
  onPending: (pending: boolean) => void;
  onError: (error: unknown) => void;
}) {
  const reservationId = item?.serverId;
  const formData = useCallback(async (): Promise<
    LoadResult<FormDataFromServer>
  > => {
    try {
      if (mode === "visit")
        return {
          ok: true,
          data: await getWorkTypes(token, AbortSignal.timeout(8000)),
        };
      if (mode === "block") return { ok: true, data: {} };
      const reservation = await ownerScheduleRequest<ScheduleDetail>(
        token,
        `reservations/${reservationId}`,
      );
      if (
        reservation?.reservationId !== reservationId ||
        !Number.isSafeInteger(reservation.version) ||
        !Number.isFinite(Date.parse(reservation.startAt)) ||
        !Number.isFinite(Date.parse(reservation.endAt))
      ) {
        throw new Error("예약을 확인하지 못했어요.");
      }
      return { ok: true, data: { reservation } };
    } catch (error) {
      onError(error);
      return { ok: false, code: "LOAD_FAILED" };
    }
  }, [mode, reservationId, token, onError]);
  const { result, reload } = useLoad(formData);
  const [day, setDay] = useState(item ? scheduleDate(item.startAt) : date);
  const [start, setStart] = useState(
    item ? scheduleClock(item.startAt) : "14:00",
  );
  const [endDay, setEndDay] = useState(item ? scheduleDate(item.endAt) : date);
  const [end, setEnd] = useState(item ? scheduleClock(item.endAt) : "19:00");
  const [query, setQuery] = useState("");
  const [addresses, setAddresses] = useState<Address[]>([]);
  const [address, setAddress] = useState<Address | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchMessage, setSearchMessage] = useState("");
  const search = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const attempt = useRef<{ body: string; key: string } | null>(null);
  const [message, setMessage] = useState("");
  const [confirmation, setConfirmation] = useState<Confirmation | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [uncertain, setUncertain] = useState(false);

  useEffect(() => () => search.current?.abort(), []);

  const options = result?.ok
    ? result.data.workTypes?.filter(
        (type): type is WorkType & { workTypeId: number } =>
          type.isActive &&
          typeof type.workTypeId === "number" &&
          Number.isSafeInteger(type.workTypeId) &&
          type.workTypeId > 0,
      )
    : undefined;
  const current = result?.ok ? result.data.reservation : undefined;
  const editable = current?.status === "CONFIRMED";
  const canSubmit =
    mode === "block" || (mode === "visit" ? !!options?.length : editable);

  function clearMessage() {
    setConfirmation(null);
    setConfirmed(false);
    setMessage("");
  }

  async function searchAddress() {
    if (!query.trim()) {
      setSearchMessage("도로명이나 지번을 입력해 주세요.");
      return;
    }
    search.current?.abort();
    const controller = new AbortController();
    search.current = controller;
    setAddresses([]);
    setSearchMessage("");
    setSearching(true);
    try {
      const matches = (
        await searchOwnerLocation(
          token,
          "addresses",
          query,
          AbortSignal.any([controller.signal, AbortSignal.timeout(8000)]),
        )
      ).filter((match): match is Address => "address" in match);
      if (!controller.signal.aborted) {
        setAddresses(matches);
        if (!matches.length)
          setSearchMessage(
            "검색 결과가 없어요. 도로명이나 지번을 다시 입력해 주세요.",
          );
      }
    } catch (error) {
      if (!controller.signal.aborted) {
        onError(error);
        setSearchMessage("주소를 불러오지 못했어요. 다시 검색해 주세요.");
      }
    } finally {
      if (!controller.signal.aborted) setSearching(false);
    }
  }

  async function mutate(
    path: string,
    method: "POST" | "PUT" | "DELETE",
    body: object | undefined,
    nextDate: string,
    success: string,
    key?: string,
  ) {
    if (sending.current || uncertain) return;
    sending.current = true;
    setBusy(true);
    onPending(true);
    setMessage("");
    try {
      await ownerScheduleRequest(token, path, { method, body, key });
      onSaved(nextDate, success);
    } catch (error) {
      onError(error);
      if (
        error instanceof ApiError &&
        error.code === "SLOT_UNAVAILABLE" &&
        mode === "visit" &&
        (error.result as { reason?: string } | null)?.reason ===
          "OUTSIDE_BUSINESS_HOURS" &&
        !confirmed
      ) {
        setConfirmation("outside");
        setMessage(
          "영업시간 밖이에요. 이 시간에 예약할지 한 번 더 확인해 주세요.",
        );
      } else if (
        error instanceof ApiError &&
        error.code === "BLOCK_CONFLICTS_RESERVATION" &&
        path.startsWith("blocks") &&
        method !== "DELETE" &&
        !confirmed
      ) {
        setConfirmation("block-conflict");
        setMessage(
          "확정 예약과 겹쳐요. 차단 시간을 저장해도 기존 예약은 유지돼요.",
        );
      } else {
        const unknown =
          !(error instanceof ApiError) ||
          error.status >= 500 ||
          error.code === "INVALID_RESPONSE";
        if (unknown && !key && method === "POST") {
          setUncertain(true);
          setMessage(
            "저장 여부를 확인하지 못했어요. 일정으로 돌아가 반영됐는지 먼저 확인해 주세요.",
          );
        } else {
          setMessage(scheduleIssue(error));
        }
      }
    } finally {
      sending.current = false;
      setBusy(false);
      onPending(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (
      !canSubmit ||
      sending.current ||
      uncertain ||
      (confirmation && !confirmed)
    )
      return;
    const data = new FormData(event.currentTarget);
    const value = (key: string) => String(data.get(key) ?? "").trim();
    const startAt = scheduleIso(day, start);
    if (mode !== "cancel" && !Number.isFinite(Date.parse(startAt))) return;
    if (mode === "visit") {
      const customerPhone = value("phone").replace(/[ -]/g, "");
      const workTypeId = Number(value("workTypeId"));
      if (
        !/^010\d{8}$/.test(customerPhone) ||
        !address ||
        !options?.some((work) => work.workTypeId === workTypeId)
      ) {
        setMessage(
          "휴대전화번호와 작업 종류, 검색한 방문 주소를 확인해 주세요.",
        );
        return;
      }
      const body = {
        customerPhone,
        customerName: value("name") || null,
        ...address,
        workTypeId,
        startAt,
        acknowledgeOutsideHours: confirmation === "outside" && confirmed,
      };
      const serialized = JSON.stringify(body);
      if (attempt.current?.body !== serialized)
        attempt.current = { body: serialized, key: createClientId() };
      await mutate(
        "reservations",
        "POST",
        body,
        day,
        "방문 예약을 저장했어요.",
        attempt.current.key,
      );
    } else if (mode === "block") {
      const endAt = scheduleIso(endDay, end);
      if (!(Date.parse(endAt) > Date.parse(startAt))) {
        setMessage("종료 시간은 시작 시간보다 늦어야 해요.");
        return;
      }
      await mutate(
        item ? `blocks/${reservationId}` : "blocks",
        item ? "PUT" : "POST",
        {
          startAt,
          endAt,
          reason: value("reason") || null,
          acknowledgeConflicts: confirmation === "block-conflict" && confirmed,
        },
        day,
        "예약 불가 시간을 저장했어요.",
      );
    } else if (mode === "change" && current) {
      const request = current.activeChange;
      await mutate(
        `reservations/${reservationId}/proposals`,
        "POST",
        {
          changeId: request?.changeId ?? null,
          proposedStartAt: startAt,
          applyAddressChange:
            !!request?.proposed?.address && data.has("acceptAddress"),
          note: value("reason") || null,
          baseVersion: current.version,
        },
        scheduleDate(Date.parse(current.startAt)),
        "변경을 제안했어요. 고객이 수락하기 전까지 기존 예약은 유지돼요.",
      );
    } else if (current) {
      const reason = value("reason");
      if (!reason) {
        setMessage("취소 사유를 입력해 주세요.");
        return;
      }
      await mutate(
        `reservations/${reservationId}/cancel`,
        "POST",
        { version: current.version, reason },
        scheduleDate(Date.parse(current.startAt)),
        "예약을 취소했어요.",
      );
    }
  }

  return (
    <form
      className={auth.form}
      onSubmit={submit}
      onChange={() => {
        if (!uncertain) clearMessage();
      }}
    >
      {!item && (mode === "visit" || mode === "block") && (
        <div className={styles.formSwitch} aria-label="일정 추가 유형">
          <button
            type="button"
            aria-pressed={mode === "visit"}
            disabled={busy}
            onClick={() => open("visit")}
          >
            방문 예약
          </button>
          <button
            type="button"
            aria-pressed={mode === "block"}
            disabled={busy}
            onClick={() => open("block")}
          >
            시간 비우기
          </button>
        </div>
      )}
      <fieldset className={styles.liveFields} disabled={busy}>
        {result === null && (
          <p className={auth.info} role="status">
            예약 정보를 불러오고 있어요.
          </p>
        )}
        {result && !result.ok && (
          <p className={auth.notice} role="alert">
            예약 정보를 불러오지 못했어요.{" "}
            <button
              type="button"
              className={styles.secondary}
              onClick={() => void reload()}
            >
              다시 불러오기
            </button>
          </p>
        )}
        {current && (
          <p className={auth.info}>
            현재 예약 · {scheduleDate(Date.parse(current.startAt))}{" "}
            {scheduleClock(Date.parse(current.startAt))}–
            {scheduleClock(Date.parse(current.endAt))}
            {!editable && " · 변경하거나 취소할 수 없어요."}
          </p>
        )}
        {mode !== "cancel" && (
          <>
            <label className={auth.field}>
              <span className={auth.label}>날짜</span>
              <input
                className={auth.input}
                type="date"
                value={day}
                required
                onChange={(e) => {
                  if (endDay === day) setEndDay(e.target.value);
                  setDay(e.target.value);
                }}
              />
            </label>
            <label className={auth.field}>
              <span className={auth.label}>시작 시간</span>
              <input
                className={auth.input}
                type="time"
                value={start}
                required
                onChange={(e) => setStart(e.target.value)}
              />
            </label>
            {mode === "block" && (
              <div className={styles.twoColumns}>
                <label className={auth.field}>
                  <span className={auth.label}>종료 날짜</span>
                  <input
                    className={auth.input}
                    type="date"
                    value={endDay}
                    required
                    onChange={(e) => setEndDay(e.target.value)}
                  />
                </label>
                <label className={auth.field}>
                  <span className={auth.label}>종료 시간</span>
                  <input
                    className={auth.input}
                    type="time"
                    value={end}
                    required
                    onChange={(e) => setEnd(e.target.value)}
                  />
                </label>
              </div>
            )}
          </>
        )}
        {mode === "visit" ? (
          <>
            <label className={auth.field}>
              <span className={auth.label}>작업 종류</span>
              <select
                required
                className={auth.input}
                name="workTypeId"
                defaultValue=""
              >
                <option value="" disabled>
                  작업 종류를 선택해 주세요
                </option>
                {options?.map((work) => (
                  <option key={work.workTypeId} value={work.workTypeId}>
                    {workCategories[work.workCategory]} · {work.durationMinutes}
                    분
                  </option>
                ))}
              </select>
            </label>
            {result?.ok && !options?.length && (
              <p className={auth.info}>
                선택할 수 있는 작업이 없어요.{" "}
                <Link href="/owner/settings">업체 설정 확인</Link>
              </p>
            )}
            <label className={auth.field}>
              <span className={auth.label}>고객 이름 (선택)</span>
              <input className={auth.input} name="name" maxLength={50} />
            </label>
            <label className={auth.field}>
              <span className={auth.label}>고객 휴대전화번호</span>
              <input
                className={auth.input}
                name="phone"
                type="tel"
                autoComplete="off"
                maxLength={20}
                required
              />
            </label>
            <label className={auth.field}>
              <span className={auth.label}>방문 주소</span>
              <input
                className={auth.input}
                value={query}
                maxLength={100}
                onChange={(e) => {
                  search.current?.abort();
                  setSearching(false);
                  setQuery(e.target.value);
                  setAddress(null);
                  setAddresses([]);
                  setSearchMessage("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                    e.preventDefault();
                    void searchAddress();
                  }
                }}
              />
            </label>
            <button
              type="button"
              className={styles.secondary}
              disabled={searching}
              onClick={() => void searchAddress()}
            >
              {searching ? "검색 중…" : "주소 검색"}
            </button>
            {searchMessage && (
              <p className={auth.notice} role="status">
                {searchMessage}
              </p>
            )}
            {addresses.map((match) => (
              <button
                className={styles.secondary}
                key={`${match.address}:${match.lat}:${match.lng}`}
                type="button"
                onClick={() => {
                  setAddress(match);
                  setAddresses([]);
                  clearMessage();
                }}
              >
                {match.address}
              </button>
            ))}
            {address && (
              <p className={auth.info} role="status">
                선택한 주소 · {address.address}
              </p>
            )}
          </>
        ) : (
          <label className={auth.field}>
            <span className={auth.label}>
              {mode === "cancel" ? "취소 사유" : "사유 (선택)"}
            </span>
            <input
              className={auth.input}
              name="reason"
              maxLength={mode === "block" ? 100 : 255}
              required={mode === "cancel"}
              defaultValue={mode === "block" ? (item?.memo ?? "") : ""}
            />
          </label>
        )}
        {mode === "change" && (
          <>
            {current?.activeChange?.proposed?.address && (
              <label className={styles.confirm}>
                <input
                  type="checkbox"
                  name="acceptAddress"
                  defaultChecked={current.activeChange.status === "PROPOSED"}
                />{" "}
                고객이 요청한 주소 반영: {current.activeChange.proposed.address}
              </label>
            )}
            <p className={auth.info}>
              고객이 수락하기 전까지 기존 방문 시간은 그대로예요.
            </p>
          </>
        )}
        {mode === "block" && (
          <p className={auth.hint}>
            이미 확정된 방문은 자동으로 취소되지 않아요.
          </p>
        )}
        {message && (
          <p className={auth.notice} role="alert">
            {message}
          </p>
        )}
        {confirmation && (
          <label className={styles.confirm}>
            <input
              type="checkbox"
              checked={confirmed}
              onChange={(e) => {
                e.stopPropagation();
                setConfirmed(e.target.checked);
              }}
            />
            {confirmation === "outside"
              ? "영업시간 밖인 것을 확인했어요."
              : "기존 예약을 유지하고 차단 시간을 추가해요."}
          </label>
        )}
        <button
          className={styles.primary}
          type="submit"
          disabled={
            busy || uncertain || !canSubmit || (!!confirmation && !confirmed)
          }
        >
          {busy
            ? "저장 중…"
            : {
                visit: "예약 저장",
                block: "차단 시간 저장",
                change: "변경 시간 제안",
                cancel: "예약 취소",
              }[mode]}
        </button>
        {mode === "block" && item && (
          <button
            className={styles.secondary}
            type="button"
            onClick={() =>
              void mutate(
                `blocks/${reservationId}`,
                "DELETE",
                undefined,
                date,
                "차단 시간을 해제했어요.",
              )
            }
          >
            차단 시간 해제
          </button>
        )}
      </fieldset>
    </form>
  );
}
