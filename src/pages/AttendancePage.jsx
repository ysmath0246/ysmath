// src/pages/AttendancePage.jsx
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, doc, getDoc } from "firebase/firestore";

/**
 * attendance/{YYYY-MM-DD} 문서 안에
 *  "학생이름": { time, departureTime, status }
 * 형태로 저장된 구조 기준
 */

export default function AttendancePage() {
  const parentPhone = localStorage.getItem("parentPhone") || "";

  // ✅ localStorage -> state (아이 변경 반영 위해 state로 관리)
  const [selectedStudentId, setSelectedStudentId] = useState(
    localStorage.getItem("studentId") || ""
  );
  const [selectedStudentName, setSelectedStudentName] = useState(
    (localStorage.getItem("studentName") || "").trim()
  );

  // ✅ 부모의 전체 자녀 목록(학생 id, name)
  const [children, setChildren] = useState([]); // [{id,name}]
  // ✅ 실시간 팝업
  const [popup, setPopup] = useState(null);

  // 출석 데이터(전체)
  const [attendanceByDate, setAttendanceByDate] = useState({});
  // 휴일
  const [holidayMap, setHolidayMap] = useState({});

  // 달력 상태
  const [viewYear, setViewYear] = useState(() => new Date().getFullYear());
  const [viewMonth, setViewMonth] = useState(() => new Date().getMonth()); // 0~11

  // ───────────────────────────────────────────────
  // ✅ "아이 변경(select-child)" 했을 때 localStorage 변화를 감지해서 state 갱신
  useEffect(() => {
    const syncFromStorage = () => {
      setSelectedStudentId(localStorage.getItem("studentId") || "");
      setSelectedStudentName((localStorage.getItem("studentName") || "").trim());
    };

    // 같은 탭에서 localStorage 바뀌면 storage 이벤트가 안 뜨는 경우가 많아서
    // ✅ hashchange(라우팅)도 같이 감지 + 주기적으로 한 번 더 확인(가벼운 폴링)
    window.addEventListener("storage", syncFromStorage);
    window.addEventListener("hashchange", syncFromStorage);

    const t = setInterval(syncFromStorage, 800); // 너무 잦지 않게
    return () => {
      window.removeEventListener("storage", syncFromStorage);
      window.removeEventListener("hashchange", syncFromStorage);
      clearInterval(t);
    };
  }, []);

  // ───────────────────────────────────────────────
  // ✅ 선택된 studentName이 비어있으면 students/{studentId}에서 읽어오기
  useEffect(() => {
    (async () => {
      if (selectedStudentName) return;
      if (!selectedStudentId) return;
      try {
        const sSnap = await getDoc(doc(db, "students", selectedStudentId));
        if (sSnap.exists()) {
          const nm = (sSnap.data()?.name || "").toString().trim();
          if (nm) {
            setSelectedStudentName(nm);
            localStorage.setItem("studentName", nm);
          }
        }
      } catch (e) {
        console.error("selected studentName 불러오기 오류:", e);
      }
    })();
  }, [selectedStudentId, selectedStudentName]);

  // ───────────────────────────────────────────────
  // ✅ 부모 children 목록 불러오기 (parents/{parentPhone}.children)
  useEffect(() => {
    (async () => {
      if (!parentPhone) return;
      try {
        const pSnap = await getDoc(doc(db, "parents", parentPhone));
        if (!pSnap.exists()) {
          setChildren([]);
          return;
        }
        const data = pSnap.data() || {};
        const childIds = data.children || [];

        const items = [];
        for (const cid of childIds) {
          try {
            const sSnap = await getDoc(doc(db, "students", cid));
            const sData = sSnap.exists() ? sSnap.data() : {};
            items.push({
              id: cid,
              name: (sData.name || "").toString().trim() || "이름없음",
            });
          } catch {
            items.push({ id: cid, name: "이름없음" });
          }
        }

        // 이름 기준 정렬(보기 좋게)
        items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setChildren(items);
      } catch (e) {
        console.error("children 로딩 오류:", e);
        setChildren([]);
      }
    })();
  }, [parentPhone]);

  // ───────────────────────────────────────────────
  // ✅ attendance 전체 실시간
  useEffect(() => {
    const unsub = onSnapshot(collection(db, "attendance"), (snap) => {
      const acc = {};
      snap.forEach((docSnap) => {
        acc[docSnap.id] = docSnap.data() || {};
      });
      setAttendanceByDate(acc);
    });
    return () => unsub();
  }, []);

  // ✅ holidays 실시간
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

  // ───────────────────────────────────────────────
  // ✅ 다자녀 전체 실시간 팝업: 오늘 attendance 문서에서 "자녀 이름들" 전부 감시
  useEffect(() => {
    if (!children.length) return;

    const getKSTDateId = () => {
      const now = new Date();
      const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
      return kst.toISOString().slice(0, 10);
    };

    const today = getKSTDateId();
    const perDay = attendanceByDate?.[today] || {};

    for (const c of children) {
      const nm = (c.name || "").trim();
      if (!nm) continue;

      const rec = perDay?.[nm];
      const time = (rec?.time || "").toString().trim();
      const dep = (rec?.departureTime || "").toString().trim();
      const status = (rec?.status || "").toString().trim();

      const key = `lastSeen_${nm}`;
      let last = {};
      try {
        last = JSON.parse(localStorage.getItem(key) || "{}");
      } catch {
        last = {};
      }

      const prevTime = (last.time || "").toString().trim();
      const prevDep = (last.departureTime || "").toString().trim();

      if (time && time !== prevTime) {
        setPopup({
          title: `${nm} 출석`,
          message: `${time} 출석하였습니다 ✅ ${status ? `(${status})` : ""}`,
        });
      }
      if (dep && dep !== prevDep) {
        setPopup({
          title: `${nm} 하원`,
          message: `${dep} 하원하였습니다 😊`,
        });
      }

      localStorage.setItem(key, JSON.stringify({ time, departureTime: dep }));
    }
  }, [attendanceByDate, children]);

  // ───────────────────────────────────────────────
  // ✅ 여기에서 아이 변경(드롭다운)
  const changeChild = async (newId) => {
    if (!newId) return;

    // 이름 찾기
    const found = children.find((c) => c.id === newId);
    let nm = (found?.name || "").trim();

    // 혹시 children에 이름이 비어있으면 students에서 조회
    if (!nm) {
      try {
        const sSnap = await getDoc(doc(db, "students", newId));
        if (sSnap.exists()) nm = (sSnap.data()?.name || "").toString().trim();
      } catch {}
    }

    localStorage.setItem("studentId", newId);
    if (nm) localStorage.setItem("studentName", nm);
    setSelectedStudentId(newId);
    setSelectedStudentName(nm);
  };

  // ───────────────────────────────────────────────
  // ✅ 화면에 보여줄 “선택된 아이” 기록
  const myLogsAll = useMemo(() => {
    if (!selectedStudentName) return [];
    return Object.entries(attendanceByDate)
      .map(([date, perDay]) => {
        const rec = perDay?.[selectedStudentName];
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
  }, [attendanceByDate, selectedStudentName]);

  const myLogsThisMonth = useMemo(() => {
    const ym = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
    return myLogsAll.filter((r) => r.date.startsWith(ym));
  }, [myLogsAll, viewYear, viewMonth]);

  // ───────────────────────────────────────────────
  // 달력(월~금)
  const monthMatrix = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const days = [];

    const firstDow = first.getDay();
    const start = new Date(first);
    const offsetToMonday = (firstDow + 6) % 7;
    start.setDate(first.getDate() - offsetToMonday);

    for (let w = 0; w < 6; w++) {
      const weekRow = [];
      const cur = new Date(start);
      cur.setDate(start.getDate() + w * 7);
      for (let d = 0; d < 7; d++) {
        const day = new Date(cur);
        day.setDate(cur.getDate() + d);
        const dow = day.getDay();
        if (dow >= 1 && dow <= 5) weekRow.push(new Date(day));
      }
      if (
        weekRow.some(
          (d) =>
            d.getMonth() === viewMonth ||
            (d.getMonth() !== viewMonth && d.getDate() <= 7)
        )
      ) {
        days.push(weekRow);
      }
    }
    while (
      days.length &&
      days[days.length - 1].every((d) => d.getMonth() !== viewMonth)
    ) {
      days.pop();
    }
    return days;
  }, [viewYear, viewMonth]);

  const toYMD = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    return `${y}-${m}-${dd}`;
  };

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

  const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    background: "white",
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
  };

  return (
    <div style={{ padding: 16, maxWidth: 980, margin: "0 auto" }}>
      {/* ✅ 실시간 팝업 */}
      {popup && (
        <div
          style={{
            position: "fixed",
            left: 0,
            right: 0,
            top: 12,
            display: "flex",
            justifyContent: "center",
            zIndex: 999999,
            pointerEvents: "none",
          }}
        >
          <div
            style={{
              pointerEvents: "auto",
              minWidth: 260,
              maxWidth: 460,
              background: "#111827",
              color: "white",
              padding: "12px 14px",
              borderRadius: 14,
              boxShadow: "0 10px 25px rgba(0,0,0,0.25)",
            }}
            onClick={() => setPopup(null)}
          >
            <div style={{ fontWeight: 900, fontSize: 15 }}>{popup.title}</div>
            <div style={{ marginTop: 6, fontSize: 13, opacity: 0.92 }}>
              {popup.message}
            </div>
            <div style={{ marginTop: 10, textAlign: "right" }}>
              <button
                onClick={() => setPopup(null)}
                style={{
                  border: "1px solid rgba(255,255,255,0.2)",
                  background: "transparent",
                  color: "white",
                  borderRadius: 10,
                  padding: "6px 10px",
                  cursor: "pointer",
                }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상단 헤더 */}
      <div
        style={{
          display: "flex",
          gap: 10,
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 12,
        }}
      >
        <div>
          <div style={{ fontSize: 22, fontWeight: 900 }}>📌 출석 확인</div>
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 2 }}>
            {selectedStudentName
              ? `현재 선택: ${selectedStudentName}`
              : "학생 선택이 필요합니다."}
            {children.length > 1 && (
              <span style={{ marginLeft: 8, color: "#10b981", fontWeight: 700 }}>
                (다자녀 실시간 감시중)
              </span>
            )}
          </div>
        </div>

        {/* ✅ 다자녀면 드롭다운으로 바로 변경 */}
        {children.length > 0 && (
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <span style={{ fontSize: 12, color: "#6b7280" }}>아이 선택</span>
            <select
              value={selectedStudentId}
              onChange={(e) => changeChild(e.target.value)}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid #d1d5db",
                background: "white",
                fontWeight: 700,
                cursor: "pointer",
              }}
            >
              {children.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <button
              onClick={() => (window.location.hash = "#/select-child")}
              style={{
                padding: "8px 10px",
                borderRadius: 12,
                border: "1px solid #d1d5db",
                background: "#f9fafb",
                cursor: "pointer",
                fontWeight: 800,
              }}
            >
              아이 변경
            </button>
          </div>
        )}
      </div>

      {/* 달력 카드 */}
      <div style={{ ...card, padding: 14, marginBottom: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <button
            onClick={prevMonth}
            style={{
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 12,
              background: "white",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            ◀
          </button>

          <div style={{ fontWeight: 900, fontSize: 16 }}>{monthTitle}</div>

          <button
            onClick={nextMonth}
            style={{
              padding: "8px 12px",
              border: "1px solid #d1d5db",
              borderRadius: 12,
              background: "white",
              cursor: "pointer",
              fontWeight: 800,
            }}
          >
            ▶
          </button>
        </div>

        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(5, 1fr)",
            gap: 10,
            paddingBottom: 10,
            borderBottom: "1px solid #f1f5f9",
            fontWeight: 800,
            color: "#6b7280",
          }}
        >
          {["월", "화", "수", "목", "금"].map((w) => (
            <div key={w} style={{ textAlign: "center" }}>
              {w}
            </div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: 10, marginTop: 10 }}>
          {monthMatrix.map((week, idx) => (
            <div
              key={idx}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(5, 1fr)",
                gap: 10,
              }}
            >
              {week.map((d) => {
                const ymd = toYMD(d);
                const inMonth = d.getMonth() === viewMonth;
                const myRecord =
                  selectedStudentName
                    ? attendanceByDate?.[ymd]?.[selectedStudentName]
                    : null;
                const isHoliday = !!holidayMap[ymd];

                const hasAttend = !!(myRecord?.time || myRecord?.departureTime);

                return (
                  <div
                    key={ymd}
                    title={isHoliday ? `${ymd} • ${holidayMap[ymd]}` : ymd}
                    style={{
                      minHeight: 86,
                      border: `1px solid ${isHoliday ? "#fecaca" : "#e5e7eb"}`,
                      borderRadius: 14,
                      padding: 10,
                      background: inMonth
                        ? isHoliday
                          ? "#fff1f2"
                          : hasAttend
                          ? "#ecfeff"
                          : "white"
                        : "#fafafa",
                      opacity: inMonth ? 1 : 0.55,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        marginBottom: 6,
                      }}
                    >
                      <div style={{ fontWeight: 900, fontSize: 14, color: isHoliday ? "#ef4444" : "#111827" }}>
                        {d.getDate()}
                      </div>

                      {isHoliday && (
                        <span
                          style={{
                            fontSize: 11,
                            color: "#ef4444",
                            fontWeight: 900,
                            background: "rgba(239,68,68,0.10)",
                            padding: "2px 8px",
                            borderRadius: 999,
                          }}
                        >
                          {holidayMap[ymd]}
                        </span>
                      )}
                    </div>

                    {myRecord ? (
                      <div style={{ fontSize: 12, color: "#111827", lineHeight: 1.5 }}>
                        <div>
                          <span style={{ color: "#0284c7", fontWeight: 800 }}>입실</span>{" "}
                          {myRecord.time || "-"}
                        </div>
                        <div>
                          <span style={{ color: "#16a34a", fontWeight: 800 }}>하원</span>{" "}
                          {myRecord.departureTime || "-"}
                        </div>
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

      {/* 표 카드 */}
      <div style={{ ...card, padding: 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 10,
          }}
        >
          <div style={{ fontSize: 18, fontWeight: 900 }}>
            📋 내 출석 기록 (입실/하원)
          </div>

          <div>
            <button
              onClick={prevMonth}
              style={{
                padding: "6px 10px",
                border: "1px solid #d1d5db",
                borderRadius: 10,
                background: "white",
                cursor: "pointer",
                marginRight: 6,
                fontWeight: 800,
              }}
            >
              ◀
            </button>
            <span style={{ fontWeight: 900 }}>{monthTitle}</span>
            <button
              onClick={nextMonth}
              style={{
                padding: "6px 10px",
                border: "1px solid #d1d5db",
                borderRadius: 10,
                background: "white",
                cursor: "pointer",
                marginLeft: 6,
                fontWeight: 800,
              }}
            >
              ▶
            </button>
          </div>
        </div>

        {myLogsThisMonth.length === 0 ? (
          <div style={{ color: "#6b7280" }}>해당 월의 출석 기록이 없습니다.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 14 }}>
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th style={th}>날짜</th>
                  <th style={th}>입실</th>
                  <th style={th}>하원</th>
                  <th style={th}>상태</th>
                </tr>
              </thead>
              <tbody>
                {myLogsThisMonth
                  .slice()
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map((row) => (
                    <tr key={row.date}>
                      <td style={td}>
                        <span style={{ fontWeight: 800 }}>{row.date}</span>
                        {holidayMap[row.date] && (
                          <span style={{ marginLeft: 8, fontSize: 12, color: "#ef4444", fontWeight: 900 }}>
                            ({holidayMap[row.date]})
                          </span>
                        )}
                      </td>
                      <td style={td}>{row.time || "-"}</td>
                      <td style={td}>{row.departureTime || "-"}</td>
                      <td style={td}>{row.status || "-"}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

const th = {
  textAlign: "left",
  padding: "10px 10px",
  borderBottom: "1px solid #e5e7eb",
  color: "#374151",
  fontSize: 13,
  fontWeight: 900,
};

const td = {
  padding: "10px 10px",
  borderBottom: "1px solid #f1f5f9",
};
