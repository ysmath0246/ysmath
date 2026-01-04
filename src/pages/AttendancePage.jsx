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

  // ✅ 토요일 포함 토글(기본 OFF) / 일요일은 항상 제외
  const [includeSat, setIncludeSat] = useState(false);

  // ✅ 모바일 감지 (가로 길어서 보기 불편한 거 해결용)
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 640px)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = (e) => setIsMobile(e.matches);
    // 최신/구형 브라우저 대응
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    setIsMobile(mq.matches);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  // ───────────────────────────────────────────────
  // ✅ "아이 변경(select-child)" 했을 때 localStorage 변화를 감지해서 state 갱신
  useEffect(() => {
    const syncFromStorage = () => {
      setSelectedStudentId(localStorage.getItem("studentId") || "");
      setSelectedStudentName((localStorage.getItem("studentName") || "").trim());
    };

    window.addEventListener("storage", syncFromStorage);
    window.addEventListener("hashchange", syncFromStorage);

    const t = setInterval(syncFromStorage, 800);
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
  // ✅ 아이 변경(드롭다운)
  const changeChild = async (newId) => {
    if (!newId) return;

    const found = children.find((c) => c.id === newId);
    let nm = (found?.name || "").trim();

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

  // ✅ 월별 + (일요일 제외, 토요일은 includeSat일 때만)
  const myLogsThisMonth = useMemo(() => {
    const ym = `${viewYear}-${String(viewMonth + 1).padStart(2, "0")}`;
    return myLogsAll
      .filter((r) => r.date.startsWith(ym))
      .filter((r) => {
        const d = new Date(r.date + "T00:00:00");
        const dow = d.getDay(); // 0=일, 6=토
        if (dow === 0) return false; // 일요일은 항상 숨김
        if (dow === 6) return includeSat; // 토요일은 토글일 때만
        return true; // 월~금
      });
  }, [myLogsAll, viewYear, viewMonth, includeSat]);

  // ───────────────────────────────────────────────
  // 달력(월~금 기본, 토요일 옵션)
  const weekLabels = includeSat ? ["월", "화", "수", "목", "금", "토"] : ["월", "화", "수", "목", "금"];
  const colCount = includeSat ? 6 : 5;

  const monthMatrix = useMemo(() => {
    const first = new Date(viewYear, viewMonth, 1);
    const days = [];

    const firstDow = first.getDay();
    const start = new Date(first);
    const offsetToMonday = (firstDow + 6) % 7; // 월요일 기준
    start.setDate(first.getDate() - offsetToMonday);

    const maxDow = includeSat ? 6 : 5; // 월(1)~금(5) / 토(6) 옵션

    for (let w = 0; w < 6; w++) {
      const weekRow = [];
      const cur = new Date(start);
      cur.setDate(start.getDate() + w * 7);
      for (let d = 0; d < 7; d++) {
        const day = new Date(cur);
        day.setDate(cur.getDate() + d);
        const dow = day.getDay();
        if (dow >= 1 && dow <= maxDow) weekRow.push(new Date(day));
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
  }, [viewYear, viewMonth, includeSat]);

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

  // ✅ 모바일용 공통 스타일
  const pageWrap = {
    padding: isMobile ? 10 : 16,
    maxWidth: 980,
    margin: "0 auto",
  };

  const headerWrap = {
    display: "flex",
    gap: isMobile ? 10 : 10,
    alignItems: isMobile ? "stretch" : "center",
    justifyContent: "space-between",
    marginBottom: 12,
    flexDirection: isMobile ? "column" : "row",
  };

  const rightControls = {
    display: "flex",
    gap: 8,
    alignItems: "center",
    justifyContent: isMobile ? "stretch" : "flex-end",
    flexDirection: isMobile ? "column" : "row",
  };

  const controlRow = {
    display: "flex",
    gap: 8,
    alignItems: "center",
    justifyContent: isMobile ? "space-between" : "flex-end",
    flexWrap: "wrap",
  };

  const selectStyle = {
    padding: "10px 12px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    background: "white",
    fontWeight: 800,
    cursor: "pointer",
    width: isMobile ? "100%" : "auto",
  };

  const buttonStyle = (bg = "white") => ({
    padding: isMobile ? "10px 12px" : "8px 12px",
    border: "1px solid #d1d5db",
    borderRadius: 12,
    background: bg,
    cursor: "pointer",
    fontWeight: 900,
    width: isMobile ? "100%" : "auto",
  });

  const smallBtn = {
    padding: "7px 10px",
    border: "1px solid #d1d5db",
    borderRadius: 999,
    background: "white",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 12,
    whiteSpace: "nowrap",
  };

  const calendarGap = isMobile ? 6 : 10;
  const cellMinH = isMobile ? 64 : 86;
  const cellPad = isMobile ? 8 : 10;

  return (
    <div style={pageWrap}>
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
                  fontWeight: 900,
                }}
              >
                닫기
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 상단 헤더 */}
      <div style={headerWrap}>
        <div>
          <div style={{ fontSize: isMobile ? 20 : 22, fontWeight: 900 }}>
            📌 출석 확인
          </div>
          <div style={{ color: "#6b7280", fontSize: 13, marginTop: 4, lineHeight: 1.4 }}>
            {selectedStudentName
              ? `현재 선택: ${selectedStudentName}`
              : "학생 선택이 필요합니다."}
            {children.length > 1 && (
              <span style={{ marginLeft: 8, color: "#10b981", fontWeight: 800 }}>
                (실시간 업데이트 중)
              </span>
            )}
          </div>
        </div>

        {children.length > 0 && (
          <div style={rightControls}>
            <div style={controlRow}>
              <span style={{ fontSize: 12, color: "#6b7280", minWidth: 44 }}>
                아이 선택
              </span>
              <select
                value={selectedStudentId}
                onChange={(e) => changeChild(e.target.value)}
                style={selectStyle}
              >
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={() => (window.location.hash = "#/select-child")}
              style={buttonStyle("#f9fafb")}
            >
              아이 변경
            </button>
          </div>
        )}
      </div>

      {/* 달력 카드 */}
      <div style={{ ...card, padding: isMobile ? 12 : 14, marginBottom: 14 }}>
        {/* 달력 상단 컨트롤: 모바일에서 줄바꿈 + 토요일 토글 */}
        <div
          style={{
            display: "flex",
            alignItems: isMobile ? "stretch" : "center",
            justifyContent: "space-between",
            marginBottom: 10,
            gap: 8,
            flexDirection: isMobile ? "column" : "row",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <button onClick={prevMonth} style={buttonStyle("white")}>
              ◀
            </button>

            <div style={{ fontWeight: 900, fontSize: 16, textAlign: "center", flex: 1 }}>
              {monthTitle}
            </div>

            <button onClick={nextMonth} style={buttonStyle("white")}>
              ▶
            </button>
          </div>

          {/* ✅ 토요일 포함 토글 (기본 OFF) */}
          <div
            style={{
              display: "flex",
              gap: 8,
              justifyContent: isMobile ? "stretch" : "flex-end",
              flexWrap: "wrap",
            }}
          >
            <button
              onClick={() => setIncludeSat((v) => !v)}
              style={{
                ...smallBtn,
                background: includeSat ? "#111827" : "white",
                color: includeSat ? "white" : "#111827",
                borderColor: includeSat ? "#111827" : "#d1d5db",
                width: isMobile ? "100%" : "auto",
              }}
              title="토요일 보강이 있는 달만 켜주세요"
            >
              {includeSat ? "토요일 포함 ON" : "토요일 포함 OFF"}
            </button>
          </div>
        </div>

        {/* 요일 헤더 */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: `repeat(${colCount}, 1fr)`,
            gap: calendarGap,
            paddingBottom: 10,
            borderBottom: "1px solid #f1f5f9",
            fontWeight: 900,
            color: "#6b7280",
            fontSize: 13,
          }}
        >
          {weekLabels.map((w) => (
            <div key={w} style={{ textAlign: "center" }}>
              {w}
            </div>
          ))}
        </div>

        {/* 달력 본문 */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr", gap: calendarGap, marginTop: 10 }}>
          {monthMatrix.map((week, idx) => (
            <div
              key={idx}
              style={{
                display: "grid",
                gridTemplateColumns: `repeat(${colCount}, 1fr)`,
                gap: calendarGap,
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


                  const hhmm = (t) => {
    const s = (t || "").toString().trim();
    if (!s) return "";
    // "16:05:12" 같은 경우 대비 -> 앞 5글자만
    return s.length >= 5 ? s.slice(0, 5) : s;
  };

  const timePill = (text, color) => (
    <span
      style={{
        display: "inline-block",
        fontSize: isMobile ? 11 : 12,
        fontWeight: 900,
        color,
        background: `${color}14`, // 살짝 투명 배경
        padding: "2px 8px",
        borderRadius: 999,
        lineHeight: 1.2,
        whiteSpace: "nowrap",
      }}
    >
      {text}
    </span>
  );


  
                return (
                  <div
                    key={ymd}
                    title={isHoliday ? `${ymd} • ${holidayMap[ymd]}` : ymd}
                    style={{
                      minHeight: cellMinH,
                      border: `1px solid ${isHoliday ? "#fecaca" : "#e5e7eb"}`,
                      borderRadius: 14,
                      padding: cellPad,
                      background: inMonth
                        ? isHoliday
                          ? "#fff1f2"
                          : hasAttend
                          ? "#ecfeff"
                          : "white"
                        : "#fafafa",
                      opacity: inMonth ? 1 : 0.55,
                      overflow: "hidden",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "baseline",
                        justifyContent: "space-between",
                        marginBottom: 6,
                        gap: 6,
                      }}
                    >
                      <div
                        style={{
                          fontWeight: 900,
                          fontSize: isMobile ? 13 : 14,
                          color: isHoliday ? "#ef4444" : "#111827",
                        }}
                      >
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
                            maxWidth: "75%",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {holidayMap[ymd]}
                        </span>
                      )}
                    </div>

                  {myRecord ? (
  (() => {
    const tIn = hhmm(myRecord.time);
    const tOut = hhmm(myRecord.departureTime);

    // 둘 다 없으면 "기록 없음"과 동일하게 처리
    if (!tIn && !tOut) {
      return (
        <div style={{ fontSize: isMobile ? 11 : 12, color: "#9ca3af" }}>
          기록 없음
        </div>
      );
    }

    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 6,
          alignItems: "flex-start",
          marginTop: 2,
        }}
      >
        {tIn ? timePill(tIn, "#0284c7") : null}
        {tOut ? timePill(tOut, "#16a34a") : null}
      </div>
    );
  })()
) : (
  <div style={{ fontSize: isMobile ? 11 : 12, color: "#9ca3af" }}>
    기록 없음
  </div>
)}

                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 기록 카드 */}
      <div style={{ ...card, padding: isMobile ? 12 : 14 }}>
        <div
          style={{
            display: "flex",
            alignItems: isMobile ? "stretch" : "center",
            justifyContent: "space-between",
            marginBottom: 10,
            gap: 10,
            flexDirection: isMobile ? "column" : "row",
          }}
        >
          <div style={{ fontSize: isMobile ? 16 : 18, fontWeight: 900 }}>
            📋 내 출석 기록 (입실/하원)
          </div>

          <div style={{ display: "flex", gap: 6, alignItems: "center", justifyContent: "flex-end" }}>
            <button onClick={prevMonth} style={smallBtn}>
              ◀
            </button>
            <span style={{ fontWeight: 900 }}>{monthTitle}</span>
            <button onClick={nextMonth} style={smallBtn}>
              ▶
            </button>
          </div>
        </div>

        {myLogsThisMonth.length === 0 ? (
          <div style={{ color: "#6b7280" }}>해당 월의 출석 기록이 없습니다.</div>
        ) : isMobile ? (
          // ✅ 모바일: 카드형 리스트(옆으로 길어지는 표 제거)
          <div style={{ display: "grid", gap: 10 }}>
            {myLogsThisMonth
              .slice()
              .sort((a, b) => b.date.localeCompare(a.date))
              .map((row) => (
                <div
                  key={row.date}
                  style={{
                    border: "1px solid #e5e7eb",
                    borderRadius: 14,
                    padding: 12,
                    background: "white",
                  }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                    <div style={{ fontWeight: 900 }}>
                      {row.date}
                      {holidayMap[row.date] && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: "#ef4444", fontWeight: 900 }}>
                          {holidayMap[row.date]}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
                      {row.status || "-"}
                    </div>
                  </div>

                  <div style={{ marginTop: 8, display: "grid", gap: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#0284c7", fontWeight: 900 }}>입실</span>
                      <span style={{ fontWeight: 900 }}>{row.time || "-"}</span>
                    </div>
                    <div style={{ display: "flex", justifyContent: "space-between" }}>
                      <span style={{ color: "#16a34a", fontWeight: 900 }}>하원</span>
                      <span style={{ fontWeight: 900 }}>{row.departureTime || "-"}</span>
                    </div>
                  </div>
                </div>
              ))}
          </div>
        ) : (
          // ✅ PC: 표 유지
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
                        <span style={{ fontWeight: 900 }}>{row.date}</span>
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
