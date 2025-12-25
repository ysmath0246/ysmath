// src/pages/AttendancePage.jsx
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot } from "firebase/firestore";

/**
 * Firestore 컬렉션 구조 (예시)
 * attendance
 *  ├─ 2025-10-30 (doc)
 *  │    ├─ "김예린": { time: "17:00", departureTime: "18:30", status: "onTime" }
 *  │    └─ ...
 *  └─ 2025-10-29 (doc)
 *       └─ ...
 *
 * holidays
 *  ├─ <autoId> (doc)
 *  │    ├─ date: "YYYY-MM-DD"
 *  │    └─ name: "어린이날"
 */

export default function AttendancePage() {
  // 로그인 정보
  const studentName = (localStorage.getItem("studentName") || "").trim();

  // 출석 데이터 (날짜문서 → 학생이름 → 레코드)
  const [attendanceByDate, setAttendanceByDate] = useState({}); // { "YYYY-MM-DD": { "홍길동": {time, departureTime, status}, ... } }

  // 휴일 데이터
  const [holidayMap, setHolidayMap] = useState({}); // { "YYYY-MM-DD": "휴일명" }

  // 달력 상태 (월 이동 가능, 토/일 숨김)
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth()); // 0~11

  // ───────────────────────────────────────────────
  // Firestore 구독: attendance 전체를 실시간 반영
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "attendance"), (snap) => {
      const acc = {};
      snap.forEach((docSnap) => {
        const dateId = docSnap.id; // "YYYY-MM-DD"
        const data = docSnap.data() || {};
        acc[dateId] = data;
      });
      setAttendanceByDate(acc);
    });
    return () => unsub();
  }, []);

  // Firestore 구독: holidays (휴일) 실시간 반영
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "holidays"), (snap) => {
      const m = {};
      snap.forEach((docSnap) => {
        const d = docSnap.data() || {};
        const date = (d.date || "").toString();
        const name = (d.name || "").toString();
        if (date) m[date] = name || "휴일";
      });
      setHolidayMap(m);
    });
    return () => unsub();
  }, []);

  // 내 기록만 추출해서 날짜 내림차순으로
  const myLogsAll = useMemo(() => {
    if (!studentName) return [];
    return Object.entries(attendanceByDate)
      .map(([date, perDay]) => {
        const rec = perDay?.[studentName];
        if (!rec) return null;
        return {
          date,
          time: rec.time || "",
          departureTime: rec.departureTime || "",
          status: rec.status || "",
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.date.localeCompare(a.date));
  }, [attendanceByDate, studentName]);

  // 현재 달(viewYear/viewMonth)만 필터링한 표 데이터
  const myLogsThisMonth = useMemo(() => {
    const ym = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
    return myLogsAll.filter((r) => r.date.startsWith(ym));
  }, [myLogsAll, viewYear, viewMonth]);

  // ───────────────────────────────────────────────
  // 달력 계산 (토/일 숨김: 월~금만 그리기)
  const monthMatrix = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const days = [];

    // 시작 지점: 해당 월의 첫 "월요일" 찾기
    const firstDow = first.getDay(); // 0:일 ~ 6:토
    const start = new Date(first);
    const offsetToMonday = (firstDow + 6) % 7; // 월(1) 기준
    start.setDate(first.getDate() - offsetToMonday);

    // 6주 * 5일(월~금) = 최대 30칸
    for (let w = 0; w < 6; w++) {
      const weekRow = [];
      const cur = new Date(start);
      cur.setDate(start.getDate() + w * 7);
      for (let d = 0; d < 7; d++) {
        const day = new Date(cur);
        day.setDate(cur.getDate() + d);
        const dow = day.getDay();
        if (dow >= 1 && dow <= 5) {
          weekRow.push(new Date(day));
        }
      }
      // 현재 월에 월~금이 하나라도 포함되면 유지
      if (weekRow.some((d) => d.getMonth() === viewMonth || (d.getMonth() !== viewMonth && d.getDate() <= 7))) {
        days.push(weekRow);
      }
    }

    // 마지막 주가 전부 다음달이면 제거
    while (days.length && days[days.length - 1].every((d) => d.getMonth() !== viewMonth)) {
      days.pop();
    }

    return days; // [[Date(월),Date(화),...,Date(금)], ...]
  }, [viewYear, viewMonth]);

  // 날짜 포맷: YYYY-MM-DD
  const toYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

  // 달력 타이틀
  const monthTitle = `${viewYear}년 ${String(viewMonth + 1).padStart(2, "0")}월`;

  const prevMonth = () => {
    const d = new Date(viewYear, viewMonth - 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };
  const nextMonth = () => {
    const d = new Date(viewYear, viewMonth + 1, 1);
    setViewYear(d.getFullYear());
    setViewMonth(d.getMonth());
  };

  return (
    <div style={{ padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 8 }}>출석 확인</h1>
      <div style={{ color: "#6b7280", marginBottom: 12 }}>
        {studentName ? `학생: ${studentName}` : "로그인 정보가 없습니다."}
      </div>

      {/* ── 달력(월~금만) + 휴일 표시 ───────────────────────────────────── */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 8, padding: 12, marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <button
            onClick={prevMonth}
            style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", cursor: "pointer" }}
          >
            ◀
          </button>
          <div style={{ fontWeight: 800 }}>{monthTitle}</div>
          <button
            onClick={nextMonth}
            style={{ padding: "6px 10px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", cursor: "pointer" }}
          >
            ▶
          </button>
        </div>

        {/* 요일 헤더: 월~금만 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 8,
            paddingBottom: 8,
            borderBottom: "1px solid #f1f5f9",
            fontWeight: 700,
            color: "#6b7280",
          }}
        >
          {["월", "화", "수", "목", "금"].map((w) => (
            <div key={w} style={{ textAlign: "center" }}>{w}</div>
          ))}
        </div>

        {/* 주/일 렌더: 토/일 없음 + 휴일 빨간 강조 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 8, marginTop: 8 }}>
          {monthMatrix.map((week, idx) => (
            <div key={idx} style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
              {week.map((d) => {
                const ymd = toYMD(d);
                const inMonth = d.getMonth() === viewMonth;
                const myRecord = attendanceByDate?.[ymd]?.[studentName];
                const isHoliday = !!holidayMap[ymd];

                return (
                  <div
                    key={ymd}
                    title={isHoliday ? `${ymd} • ${holidayMap[ymd]}` : ymd}
                    style={{
                      minHeight: 72,
                      border: `1px solid ${isHoliday ? "#fecaca" : "#e5e7eb"}`, // 휴일이면 연한 레드 테두리
                      borderRadius: 8,
                      padding: 8,
                      background: inMonth ? (isHoliday ? "#fff1f2" : "#fff") : "#fafafa", // 휴일이면 연한 레드 배경
                      opacity: inMonth ? 1 : 0.6,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "baseline", gap: 6, marginBottom: 4 }}>
                      <div style={{ fontWeight: 800, color: isHoliday ? "#ef4444" : "#111827" }}>
                        {d.getDate()}
                      </div>
                      {isHoliday && (
                        <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 700 }}>
                          {holidayMap[ymd]}
                        </span>
                      )}
                    </div>

                    {/* 내 기록 표시 */}
                    {myRecord ? (
                      <div style={{ fontSize: 12, color: "#111827" }}>
                        <div>입실: {myRecord.time || "-"}</div>
                        <div>하원: {myRecord.departureTime || "-"}</div>
                      </div>
                    ) : (
                      <div style={{ fontSize: 12, color: "#9ca3af" }}>기록 없음</div>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* ── 내 출석(입실/하원) 표 — 현재 달(viewYear/viewMonth)만 ─────────────── */}
      <div style={{ textAlign: "left" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
          <h2 style={{ fontSize: 18, margin: 0 }}>내 출석 기록 (입실/하원)</h2>
          {/* 표 상단에도 월 네비게이션 동일하게 배치 (달력과 같은 상태 사용) */}
          <div>
            <button
              onClick={prevMonth}
              style={{ padding: "4px 10px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", cursor: "pointer", marginRight: 6 }}
            >
              ◀
            </button>
            <span style={{ fontWeight: 700 }}>{monthTitle}</span>
            <button
              onClick={nextMonth}
              style={{ padding: "4px 10px", border: "1px solid #d1d5db", borderRadius: 8, background: "#fff", cursor: "pointer", marginLeft: 6 }}
            >
              ▶
            </button>
          </div>
        </div>

        {myLogsThisMonth.length === 0 ? (
          <div style={{ color: "#6b7280" }}>해당 월의 출석 기록이 없습니다.</div>
        ) : (
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
            <thead>
              <tr style={{ background: "#f8fafc" }}>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e5e7eb" }}>날짜</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e5e7eb" }}>입실</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e5e7eb" }}>하원</th>
                <th style={{ textAlign: "left", padding: "8px", borderBottom: "1px solid #e5e7eb" }}>상태</th>
              </tr>
            </thead>
            <tbody>
              {myLogsThisMonth
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((row) => (
                  <tr key={row.date}>
                    <td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>
                      {row.date}
                      {holidayMap[row.date] && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: "#ef4444", fontWeight: 700 }}>
                          ({holidayMap[row.date]})
                        </span>
                      )}
                    </td>
                    <td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>{row.time || "-"}</td>
                    <td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>{row.departureTime || "-"}</td>
                    <td style={{ padding: "8px", borderBottom: "1px solid #f1f5f9" }}>{row.status || "-"}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
