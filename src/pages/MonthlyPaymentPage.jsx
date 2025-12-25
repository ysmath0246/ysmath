// src/pages/MonthlyPaymentPage.jsx
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";

export default function MonthlyPaymentPage() {
  const studentId = (localStorage.getItem("studentId") || "").trim();
  const studentName = (localStorage.getItem("studentName") || "").trim();

  // ✅ viewMonth: 선택 월 (년도/달 이동)
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth() + 1); // 1~12

  const [rows, setRows] = useState([]); // 월결제 문서들
  const [openId, setOpenId] = useState(null); // 펼친 항목 id

  // 🔹 현 시간 기준 이번 달 key
  const nowKey = useMemo(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  }, []);

  // 🔹 선택 월 key
  const viewKey = useMemo(() => {
    return `${viewYear}-${String(viewMonth).padStart(2, "0")}`;
  }, [viewYear, viewMonth]);

  // ✅ monthly_payments 실시간 구독 (where만, 정렬은 앱에서)
  useEffect(() => {
    if (!studentId) return;

    const qy = query(
      collection(db, "monthly_payments"),
      where("studentId", "==", studentId)
    );

    const unsub = onSnapshot(
      qy,
      (snap) => {
        const arr = snap.docs.map((d) => ({
          id: d.id,
          ...d.data(),
        }));

        // ✅ month 내림차순 정렬 (문자열 "YYYY-MM" 이므로 compare 가능)
        arr.sort((a, b) => String(b.month || "").localeCompare(String(a.month || "")));

        setRows(arr);
      },
      (err) => {
        console.error("monthly_payments snapshot error:", err);
      }
    );

    return () => unsub();
  }, [studentId]);

  // ✅ 이번 달 문서(없을 수 있음)
  const currentDoc = useMemo(() => {
    return rows.find((r) => String(r.month || "") === nowKey) || null;
  }, [rows, nowKey]);

  // ✅ 선택 월(년도/달 이동) 기준으로 필터링한 리스트
  const filteredRows = useMemo(() => {
    // viewKey와 같은 달만 보여주기
    return rows.filter((r) => String(r.month || "") === viewKey);
  }, [rows, viewKey]);

  // ✅ 월 이동
  const prevMonth = () => {
    const d = new Date(viewYear, viewMonth - 2, 1); // JS month 0-based
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
  };
  const nextMonth = () => {
    const d = new Date(viewYear, viewMonth, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth() + 1);
  };

  if (!studentId || !studentName) {
    return (
      <div style={{ padding: 16 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 8 }}>월 결제</h1>
        <div style={{ color: "#6b7280" }}>자녀를 먼저 선택해 주세요.</div>
      </div>
    );
  }

  return (
    <div style={{ padding: 16, maxWidth: 820, margin: "0 auto" }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 6 }}>
        💳 월 수업료 결제 현황 — {studentName}
      </h1>

      <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
        2026년 3월부터 월제 기준으로 정리된 결제 내역과<br />
        할인 적용 여부를 한눈에 확인하실 수 있습니다.
      </div>

      {/* ✅ 년/월 이동 (요청사항) */}
      <div
        style={{
          marginTop: 14,
          marginBottom: 12,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
        }}
      >
        <button
          onClick={prevMonth}
          style={btnGhost}
        >
          ◀ 이전달
        </button>

        <div style={{ fontWeight: 900, fontSize: 16 }}>
          {viewYear}년 {viewMonth}월
          <span style={{ marginLeft: 10, fontSize: 12, color: "#6b7280", fontWeight: 700 }}>
            (이번달: {formatMonthLabel(nowKey)})
          </span>
        </div>

        <button
          onClick={nextMonth}
          style={btnGhost}
        >
          다음달 ▶
        </button>
      </div>

      {/* ✅ 이번 달 카드(현 시간 기준) */}
      {currentDoc ? (
        <CurrentMonthCard data={currentDoc} />
      ) : (
        <NoCurrentMonthCard nowKey={nowKey} />
      )}

      <div style={{ height: 12 }} />
      <div style={{ borderTop: "1px solid #e5e7eb" }} />
      <div style={{ height: 10 }} />

      <div style={{ fontWeight: 900, fontSize: 15, marginBottom: 8 }}>
        📂 월별 결제 내역 (선택한 달: {formatMonthLabel(viewKey)})
      </div>

      {/* ✅ 선택한 달에 데이터 없으면 안내 */}
      {filteredRows.length === 0 ? (
        <div style={{ color: "#6b7280", fontSize: 13, lineHeight: 1.6, padding: 12, border: "1px solid #e5e7eb", borderRadius: 12 }}>
          {formatMonthLabel(viewKey)} 기준 결제 내역이 없습니다.
        </div>
      ) : (
        <div style={{ display: "grid", gap: 10 }}>
          {filteredRows.map((row) => (
            <HistoryItem
              key={row.id}
              row={row}
              open={openId === row.id}
              onToggle={() => setOpenId(openId === row.id ? null : row.id)}
            />
          ))}
        </div>
      )}

      {/* ✅ 참고: 전체 월을 다 보려면 아래 주석 해제하고 filteredRows 대신 rows로 렌더하면 됨 */}
      {/* 
      <div style={{ marginTop: 14, fontWeight: 900 }}>전체 월별 내역</div>
      {rows.map(...)}
      */}
    </div>
  );
}

/* ───────────────────────────── 컴포넌트 ───────────────────────────── */

function CurrentMonthCard({ data }) {
  const monthKey = String(data.month || "");
  const summary = (data.summary || {});

  const baseTotal = summary.baseTotal;
  const discountTotal = summary.discountTotal;
  const finalTotal = summary.finalTotal;
  const status = String(summary.status || "pending");
  const memo = String(summary.memo || "");
  const updatedAt = formatDateTime(data.updatedAt);

  const isPaid = status === "paid" || status === "완료";
  const isPartial = status === "partial";

  const bgColor = isPaid ? "#ecfdf3" : isPartial ? "#eef2ff" : "#fffbeb";
  const borderColor = isPaid ? "#4ade80" : isPartial ? "#a5b4fc" : "#facc15";

  const statusText = isPaid ? "결제 완료" : isPartial ? "일부 결제" : "미결제 · 확인 필요";

  return (
    <div
      style={{
        width: "100%",
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        border: `1px solid ${borderColor}`,
        background: bgColor,
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 15 }}>📌 이번 달 결제 상태</div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8 }}>
        <StatusChip text={statusText} isPaid={isPaid} isPartial={isPartial} />
        {monthKey && (
          <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
            {formatMonthLabel(monthKey)}
          </div>
        )}
      </div>

      <div style={{ marginTop: 10, fontSize: 13, lineHeight: 1.55 }}>
        {baseTotal != null && <div>기본 수업료: {formatWon(baseTotal)}</div>}
        {discountTotal != null && (
          <div style={{ color: "#ef4444" }}>할인 합계: -{formatWon(discountTotal)}</div>
        )}
        {finalTotal != null && (
          <div style={{ marginTop: 4, fontWeight: 900, fontSize: 14 }}>
            이번 달 최종 결제 금액: {formatWon(finalTotal)}
          </div>
        )}
      </div>

      {discountTotal != null && Number(discountTotal) > 0 && (
        <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
          ※ 질병/여행 등 사전 안내된 결석에 대해 월 최대 2회까지 할인 규정이 적용됩니다.
        </div>
      )}

      {memo && (
        <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
          비고: {memo}
        </div>
      )}

      {updatedAt && (
        <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
          업데이트: {updatedAt}
        </div>
      )}

      <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
        ※ 결제 상태와 금액이 다를 경우 언제든지 학원으로 편하게 문의해 주세요.
      </div>
    </div>
  );
}

function NoCurrentMonthCard({ nowKey }) {
  return (
    <div
      style={{
        width: "100%",
        marginTop: 12,
        padding: 12,
        borderRadius: 12,
        border: "1px solid #bfdbfe",
        background: "#eff6ff",
      }}
    >
      <div style={{ fontWeight: 900, fontSize: 15 }}>📌 이번 달 결제 정보</div>
      <div style={{ marginTop: 8, fontSize: 13, lineHeight: 1.55 }}>
        {formatMonthLabel(nowKey)} 기준 결제 내역이 아직 저장되지 않았습니다.
      </div>
      <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
        ※ 결제를 이미 진행하셨다면 학원에서 확인 후 내역이 업데이트됩니다.
      </div>
    </div>
  );
}

function HistoryItem({ row, open, onToggle }) {
  const monthKey = String(row.month || "");
  const summary = (row.summary || {});
  const baseTotal = summary.baseTotal;
  const discountTotal = summary.discountTotal;
  const finalTotal = summary.finalTotal;
  const status = String(summary.status || "pending");
  const memo = String(summary.memo || "");
  const updatedAt = formatDateTime(row.updatedAt);

  const partialsRaw = row.partials;
  const partials = Array.isArray(partialsRaw) ? partialsRaw : [];

  const isPaid = status === "paid" || status === "완료";
  const isPartial = status === "partial";

  return (
    <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, background: "#fff" }}>
      <button
        onClick={onToggle}
        style={{
          width: "100%",
          textAlign: "left",
          border: "none",
          background: "transparent",
          padding: "12px 12px",
          cursor: "pointer",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ fontWeight: 900, fontSize: 13, flex: 1 }}>
            {monthKey ? formatMonthLabel(monthKey) : "기간 미지정"}
          </div>
          <StatusChip
            text={isPaid ? "결제 완료" : isPartial ? "일부 결제" : "미결제"}
            isPaid={isPaid}
            isPartial={isPartial}
            small
          />
        </div>

        <div style={{ marginTop: 6, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            {discountTotal != null && Number(discountTotal) > 0 && (
              <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 800 }}>
                할인: -{formatWon(discountTotal)}
              </span>
            )}
          </div>
          <div style={{ fontSize: 13, fontWeight: 900 }}>
            {finalTotal != null ? formatWon(finalTotal) : "-"}
          </div>
        </div>

        <div style={{ marginTop: 8, fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
          {open ? "접기 ▲" : "자세히 보기 ▼"}
        </div>
      </button>

      {open && (
        <div style={{ padding: "0 12px 12px 12px" }}>
          {/* 반별 상세 */}
          {partials.length > 0 && (
            <div>
              <div style={{ fontSize: 12, fontWeight: 900, marginBottom: 8 }}>
                • 반별 상세 내역
              </div>

              <div style={{ display: "grid", gap: 8 }}>
                {partials.map((p, idx) => (
                  <PartialCard key={idx} data={p} />
                ))}
              </div>
            </div>
          )}

          {/* 종합 비고 */}
          {memo && (
            <div style={{ marginTop: 10, fontSize: 12, color: "#6b7280" }}>
              종합 비고: {memo}
            </div>
          )}

          {/* 업데이트 */}
          {updatedAt && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
              업데이트: {updatedAt}
            </div>
          )}

          {/* (참고) baseTotal 표시 원하면 주석 해제 */}
          {baseTotal != null && (
            <div style={{ marginTop: 6, fontSize: 11, color: "#6b7280" }}>
              기본 합계: {formatWon(baseTotal)}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function PartialCard({ data }) {
  const classType = String(data.classType || "");
  const baseAmount = data.baseAmount;
  const discountAmount = data.discountAmount;
  const finalAmount = data.finalAmount;

  const discountPerUse = data.discountPerUse;
  const maxCount = data.maxDiscountCountPerMonth;
  const statusP = String(data.status || "pending");
  const memo = String(data.memo || "");

  const logsRaw = data.discountLogs;
  const logs = Array.isArray(logsRaw) ? logsRaw : [];

  const discountCount = data.discountCount ?? logs.length;
  const isPaidPartial = statusP === "paid" || statusP === "완료";

  return (
    <div style={{ background: "#f9fafb", borderRadius: 10, padding: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <div style={{ fontWeight: 900, fontSize: 12, flex: 1 }}>
          {classType || "반 이름 미지정"}
        </div>
        {isPaidPartial && (
          <div style={{ fontSize: 11, color: "#166534", fontWeight: 900 }}>
            결제 완료
          </div>
        )}
      </div>

      <div style={{ marginTop: 6, fontSize: 11, color: "#111827", display: "flex", gap: 10, flexWrap: "wrap" }}>
        {baseAmount != null && <span>기본: {formatWon(baseAmount)}</span>}
        {discountAmount != null && Number(discountAmount) > 0 && (
          <span style={{ color: "#ef4444" }}>할인: -{formatWon(discountAmount)}</span>
        )}
        {finalAmount != null && <span style={{ fontWeight: 900 }}>최종: {formatWon(finalAmount)}</span>}
      </div>

      {discountPerUse != null && Number(discountPerUse) > 0 && (
        <div style={{ marginTop: 6, fontSize: 10, color: "#6b7280" }}>
          1회당 할인: {formatWon(discountPerUse)} / 적용 {discountCount ?? 0}회
          {maxCount != null ? ` (월 최대 ${maxCount}회)` : ""}
        </div>
      )}

      {logs.length > 0 && (
        <div style={{ marginTop: 8 }}>
          <div style={{ fontSize: 11, fontWeight: 900, marginBottom: 6 }}>할인 적용 내역:</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {logs.map((lg, i) => {
              const date = String(lg.date || "");
              const reason = String(lg.reasonCategory || "기타");
              const amount = lg.amount;
              return (
                <span
                  key={i}
                  style={{
                    fontSize: 10,
                    color: "#6b7280",
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                    padding: "4px 8px",
                    borderRadius: 999,
                  }}
                >
                  {`${date || "-"} · ${reason} · -${formatWon(amount)}`}
                </span>
              );
            })}
          </div>
        </div>
      )}

      {memo && (
        <div style={{ marginTop: 6, fontSize: 10, color: "#6b7280" }}>
          비고: {memo}
        </div>
      )}
    </div>
  );
}

function StatusChip({ text, isPaid, isPartial, small = false }) {
  const bg = isPaid ? "#dcfce7" : isPartial ? "#e0e7ff" : "#ffedd5";
  const border = isPaid ? "#22c55e" : isPartial ? "#6366f1" : "#fb923c";
  const color = isPaid ? "#166534" : isPartial ? "#3730a3" : "#9a3412";

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        padding: small ? "3px 7px" : "4px 10px",
        borderRadius: 999,
        border: `1px solid ${border}`,
        background: bg,
        color,
        fontWeight: 900,
        fontSize: small ? 10 : 11,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );
}

/* ───────────────────────────── 유틸 ───────────────────────────── */

function formatWon(value) {
  if (value == null) return "-";
  let n = 0;
  if (typeof value === "number") n = value;
  else n = Number(String(value).replaceAll(",", "")) || 0;

  const s = Math.trunc(n).toString();
  const withComma = s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${withComma}원`;
}

function formatDateTime(v) {
  if (!v) return null;

  // Firestore Timestamp면 toDate()
  const dt = typeof v?.toDate === "function" ? v.toDate() : new Date(v);
  if (isNaN(dt.getTime())) return null;

  const y = dt.getFullYear();
  const m = String(dt.getMonth() + 1).padStart(2, "0");
  const d = String(dt.getDate()).padStart(2, "0");
  const hh = String(dt.getHours()).padStart(2, "0");
  const mm = String(dt.getMinutes()).padStart(2, "0");
  return `${y}-${m}-${d} ${hh}:${mm}`;
}

function formatMonthLabel(monthKey) {
  // "2026-03" -> "2026년 3월"
  try {
    const [yy, mm] = String(monthKey).split("-");
    const y = Number(yy);
    const m = Number(mm);
    if (y > 0 && m > 0) return `${y}년 ${m}월`;
  } catch {}
  return String(monthKey);
}

const btnGhost = {
  padding: "8px 10px",
  border: "1px solid #d1d5db",
  borderRadius: 12,
  background: "#fff",
  cursor: "pointer",
  fontWeight: 900,
};
