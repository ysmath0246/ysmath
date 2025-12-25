// src/pages/NewEnrollPage.jsx
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

export default function NewEnrollPage() {
  // ── 기본 상태 ────────────────────────────────────────────────────────────────
  const [group, setGroup] = useState("elementary"); // elementary | middle
  const labelByGroup = { elementary: "초등부", middle: "중등부" };

  const schedules = useMemo(
    () => ({
      elementary: {
        월: ["2시30분"],
        화: ["3시", "4시"],
        수: ["2시", "3시", "4시"],
        목: ["3시", "4시"],
        금: ["3시", "4시"],
      },
      middle: {
        월: ["3시30분", "5시", "6시30분"],
        화: ["5시", "6시30분"],
        수: ["5시", "6시30분"],
        목: ["5시", "6시30분"],
        금: ["5시", "6시30분"],
      },
    }),
    []
  );
  const currentTable = schedules[group];

  // 인원수 집계용(선택사항: enrollments 컬렉션과 연동되어 있다면 실시간으로 표시)
  const [countsApplied, setCountsApplied] = useState({});
  const [countsWaitlist, setCountsWaitlist] = useState({});
  useEffect(() => {
    const qAll = query(collection(db, "enrollments"), where("group", "==", group));
    const unsub = onSnapshot(qAll, (snap) => {
      const a = {};
      const w = {};
      snap.forEach((d) => {
        const data = d.data();
        const key = `${data.day}|${data.time}`;
        if (data.status === "waitlist") w[key] = (w[key] || 0) + 1;
        else a[key] = (a[key] || 0) + 1;
      });
      setCountsApplied(a);
      setCountsWaitlist(w);
    });
    return () => unsub();
  }, [group]);

  // 표 선택 상태
  const [cursor, setCursor] = useState(null); // {day,time}|null
  const [selectedApplied, setSelectedApplied] = useState([]);   // [{day,time}]
  const [selectedWaitlist, setSelectedWaitlist] = useState([]); // [{day,time}]
  const keyOf = (d, t) => `${d}|${t}`;
  const existsIn = (arr, d, t) => arr.some((s) => s.day === d && s.time === t);

  const addApplied = () => {
  if (!cursor) return;
  const { day, time } = cursor;
  const k = keyOf(day, time);
  const currentCount = countsApplied[k] || 0; // waitlist 제외(=신청+예비)

  // 이미 신청에 있으면 제거(토글)
  if (existsIn(selectedApplied, day, time)) {
    setSelectedApplied(selectedApplied.filter((s) => !(s.day === day && s.time === time)));
    return;
  }

  // 상태/문구
  let status = "reserve";
  let message = "신규 신청으로 예비로 들어갑니다. 상담 후 승인됩니다. ";
  if (currentCount >= 6 && currentCount < 8) {
    status = "reserve";
    message = "현재 6명까지 신청되었습니다. 좀 더 대기시간이 길어질 수 있습니다.";
  } else if (currentCount >= 8) {
    status = "waitlist";
    message = "현재 정원이 가득 찼습니다. 대기로 신청하세요.";
  }

  if (status === "waitlist") {
    alert(message);
    addWaitlist();
    return;
  }

  // 최대 2개 제한
  if (selectedApplied.length >= 2) {
    alert("신청은 최대 2개까지 가능합니다.");
    return;
  }

  // 같은 요일은 교체
  const idxSame = selectedApplied.findIndex((s) => s.day === day);
  if (idxSame !== -1) {
    const next = [...selectedApplied];
    next[idxSame] = { day, time, status };
    setSelectedApplied(next);
  } else {
    setSelectedApplied([...selectedApplied, { day, time, status }]);
  }

  // 대기 중복 제거
  if (existsIn(selectedWaitlist, day, time)) {
    setSelectedWaitlist(selectedWaitlist.filter((s) => !(s.day === day && s.time === time)));
  }

  alert(message);
};


  const addWaitlist = () => {
    if (!cursor) return;
    const { day, time } = cursor;
    if (existsIn(selectedWaitlist, day, time)) {
      setSelectedWaitlist(selectedWaitlist.filter((s) => !(s.day === day && s.time === time)));
      return;
    }
    if (existsIn(selectedApplied, day, time)) {
      setSelectedApplied(selectedApplied.filter((s) => !(s.day === day && s.time === time)));
    }
    setSelectedWaitlist([...selectedWaitlist, { day, time }]);
  };

  const removeApplied = (d, t) =>
    setSelectedApplied(selectedApplied.filter((s) => !(s.day === d && s.time === t)));
  const removeWaitlist = (d, t) =>
    setSelectedWaitlist(selectedWaitlist.filter((s) => !(s.day === d && s.time === t)));

  // ── 신규 학생 폼 + 불러오기/저장 ────────────────────────────────────────────────
  const [studentName, setStudentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [birth6, setBirth6] = useState(""); // 생년월일 6자리
  const [loadMsg, setLoadMsg] = useState("");

  const normalizePhone = (p) => p.replace(/[^0-9]/g, "");
  const normalizeBirth6 = (b) => b.replace(/[^0-9]/g, "").slice(0, 6);

  const handleLoad = async () => {
    setLoadMsg("");
    const name = studentName.trim();
    const phone = normalizePhone(parentPhone);
    const b6 = normalizeBirth6(birth6);

    if (!name || b6.length !== 6 || phone.length < 7) {
      setLoadMsg("이름/생년월일6자리/학부모 연락처를 정확히 입력해 주세요.");
      return;
    }

    // 문서ID = 학생이름 (컬렉션: newstudent)
    const ref = doc(db, "newstudent", name);
    const snap = await getDoc(ref);

    if (!snap.exists()) {
      setLoadMsg("해당 학생 정보가 없습니다. [저장하기]로 새로 등록해 주세요.");
      setSelectedApplied([]); setSelectedWaitlist([]);
      return;
    }

    const data = snap.data() || {};
    const okBirth = (data.birth6 || "").toString() === b6;
    const okPhone = normalizePhone(data.parentPhone || "") === phone;

    if (!okBirth || !okPhone) {
      setLoadMsg("학생정보가 있지만 입력하신 연락처/생년월일과 일치하지 않습니다.");
      setSelectedApplied([]); setSelectedWaitlist([]);
      return;
    }

    // 불러오기 성공 → 기존 신청/대기 채우기
    const ap = Array.isArray(data.applied) ? data.applied : [];
    const wt = Array.isArray(data.waitlist) ? data.waitlist : [];
    setSelectedApplied(ap.map(({ day, time }) => ({ day, time })));
    setSelectedWaitlist(wt.map(({ day, time }) => ({ day, time })));
    setLoadMsg("불러오기 완료되었습니다.");
  };

  const handleSave = async () => {
    const name = studentName.trim();
    const phone = normalizePhone(parentPhone);
    const b6 = normalizeBirth6(birth6);

    if (!name) { alert("학생 이름을 입력해 주세요."); return; }
    if (b6.length !== 6) { alert("생년월일 6자리를 입력해 주세요."); return; }
    if (phone.length < 7) { alert("학부모 연락처를 정확히 입력해 주세요."); return; }
    if (selectedApplied.length === 0 && selectedWaitlist.length === 0) {
      const ok = confirm("신청/대기 선택이 없습니다. 학생 기본정보만 저장할까요?");
      if (!ok) return;
    }

    // 컬렉션: newstudent, 문서 ID = 학생이름
    const ref = doc(db, "newstudent", name);
   await setDoc(
  ref,
  {
    studentName: name,
    parentPhone: phone,
    birth6: b6,
    applied: selectedApplied.map(({ day, time, status }) => ({
      day,
      time,
      group,
      status,                               // applied | reserve
      label: status === "reserve" ? "신청(예비)" : "신청"
    })),
    waitlist: selectedWaitlist.map(({ day, time }) => ({
      day,
      time,
      group,
      status: "waitlist",
      label: "대기"
    })),
    updatedAt: serverTimestamp(),
  },
  { merge: true }
);


    alert("저장되었습니다.");
    setLoadMsg("저장 완료되었습니다.");
  };

  // ── 렌더 ──────────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 12 }}>신규 수강신청 (학생목록 저장/불러오기)</h2>

      {/* 학생 기본정보 입력 + 불러오기/저장 */}
      <div style={{ padding: 12, border: "1px solid #e5e7eb", borderRadius: 8, marginBottom: 12 }}>
        <div style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr 1fr" }}>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>학생 이름</div>
            <input
              value={studentName}
              onChange={(e) => setStudentName(e.target.value)}
              placeholder="예: 김예린"
              style={{ width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 8 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>학부모 연락처</div>
            <input
              value={parentPhone}
              onChange={(e) => setParentPhone(e.target.value)}
              placeholder="예: 01012345678(-없이)" 
              style={{ width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 8 }}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: "#6b7280" }}>생년월일 6자리</div>
            <input
              value={birth6}
              onChange={(e) => setBirth6(e.target.value.replace(/[^0-9]/g, "").slice(0, 6))}
              placeholder="예: 170806"
              inputMode="numeric"
              maxLength={6}
              style={{ width: "100%", padding: 8, border: "1px solid #d1d5db", borderRadius: 8 }}
            />
          </div>
        </div>

        <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
          <button
            onClick={handleLoad}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #6c757d",
              background: "#6c757d",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            불러오기
          </button>
          <button
            onClick={handleSave}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #0d6efd",
              background: "#0d6efd",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            저장하기
          </button>
        </div>

        {loadMsg && (
          <div style={{ marginTop: 8, color: "#374151" }}>
            {loadMsg}
          </div>
        )}
      </div>

      {/* 그룹 토글 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["elementary", "middle"].map((g) => {
          const active = g === group;
          return (
            <button
              key={g}
              onClick={() => { setGroup(g); setCursor(null); }}
              style={{
                padding: "8px 14px",
                borderRadius: 8,
                border: `1px solid ${active ? "#0d6efd" : "#ddd"}`,
                background: active ? "#0d6efd" : "#fff",
                color: active ? "#fff" : "#333",
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {labelByGroup[g]}
            </button>
          );
        })}
      </div>

      {/* 시간표 */}
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", minWidth: 560, borderCollapse: "collapse", border: "1px solid #e5e7eb" }}>
          <thead>
            <tr style={{ background: "#f8fafc" }}>
              <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #e5e7eb", width: 90 }}>요일</th>
              <th style={{ textAlign: "left", padding: "10px 12px", borderBottom: "1px solid #e5e7eb" }}>시간 (신청 / 대기)</th>
            </tr>
          </thead>
          <tbody>
            {Object.entries(currentTable).map(([day, times]) => (
              <tr key={day}>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9", fontWeight: 600 }}>{day}</td>
                <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                    {times.map((t) => {
                      const k = keyOf(day, t);
                      const aCnt = countsApplied[k] || 0;
                      const wCnt = countsWaitlist[k] || 0;
                      const isCursor = cursor && cursor.day === day && cursor.time === t;
                      const isAppliedSel = existsIn(selectedApplied, day, t);
                      const isWaitSel = existsIn(selectedWaitlist, day, t);
                      return (
                        <button
                          key={`${day}-${t}`}
                          onClick={() => setCursor(isCursor ? null : { day, time: t })}
                          style={{
                            padding: "8px 10px",
                            borderRadius: 8,
                            border: `1px solid ${isCursor ? "#0d6efd" : "#d1d5db"}`,
                            background: isCursor ? "#e7f1ff" : "#fff",
                            fontWeight: 600,
                            whiteSpace: "nowrap",
                            cursor: "pointer",
                          }}
                          title={`${day} ${t}`}
                        >
                          {t}
                          <span style={{ color: "#6b7280", marginLeft: 6 }}>
                            (신청 {aCnt} / 대기 {wCnt})
                          </span>
                          {isAppliedSel && <span style={{ marginLeft: 6, fontSize: 12, color: "#0d6efd" }}>• 신청선택</span>}
                          {isWaitSel && <span style={{ marginLeft: 6, fontSize: 12, color: "#6c757d" }}>• 대기선택</span>}
                        </button>
                      );
                    })}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 선택 조작 */}
      <div style={{ marginTop: 12, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
        <div style={{ minWidth: 220, color: "#374151" }}>
          {cursor ? (
            <span>선택: <b>{cursor.day}</b> <b>{cursor.time}</b></span>
          ) : (
            <span style={{ color: "#6b7280" }}>표에서 시간대를 먼저 선택하세요</span>
          )}
        </div>
        <button
          disabled={!cursor}
          onClick={addApplied}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #0d6efd",
            background: cursor ? "#0d6efd" : "#e5e7eb",
            color: cursor ? "#fff" : "#9ca3af",
            fontWeight: 700,
            cursor: cursor ? "pointer" : "not-allowed",
          }}
        >
          신청 추가(최대 2)
        </button>
        <button
          disabled={!cursor}
          onClick={addWaitlist}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #6c757d",
            background: cursor ? "#6c757d" : "#e5e7eb",
            color: cursor ? "##fff" : "#9ca3af",
            fontWeight: 700,
            cursor: cursor ? "pointer" : "not-allowed",
          }}
        >
          대기 추가(무제한)
        </button>
      </div>

      {/* 선택 목록 */}
      <div style={{ marginTop: 16, display: "grid", gap: 12, gridTemplateColumns: "1fr 1fr" }}>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>신청 선택(최대 2)</div>
          {selectedApplied.length === 0 ? (
            <div style={{ color: "#6b7280" }}>없음</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {selectedApplied.map(({ day, time, status }) => (
  <span
    key={`ap-${day}-${time}`}
    style={{
      padding: "6px 10px",
      borderRadius: 999,
      border: `1px solid ${status === "reserve" ? "#6c757d" : "#0d6efd"}`,
      background: status === "reserve" ? "#f1f1f1" : "#e7f1ff",
      display: "inline-flex",
      gap: 8
    }}
    title={status === "reserve" ? "신청(예비)" : "신청"}
  >
    {day} {time}{status === "reserve" ? " (예비)" : ""}
    <button
      onClick={() => removeApplied(day, time)}
      style={{ border: "none", background: "transparent", cursor: "pointer", color: status === "reserve" ? "#6c757d" : "#0d6efd", fontWeight: 700 }}
    >
      ×
    </button>
  </span>
))}

            </div>
          )}
        </div>
        <div>
          <div style={{ fontWeight: 700, marginBottom: 6 }}>대기 선택(무제한)</div>
          {selectedWaitlist.length === 0 ? (
            <div style={{ color: "#6b7280" }}>없음</div>
          ) : (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {selectedWaitlist.map(({ day, time }) => (
                <span
                  key={`wt-${day}-${time}`}
                  style={{ padding: "6px 10px", borderRadius: 999, border: "1px solid #6c757d", background: "#f1f1f1", display: "inline-flex", gap: 8 }}
                >
                  {day} {time}
                  <button
                    onClick={() => removeWaitlist(day, time)}
                    style={{ border: "none", background: "transparent", cursor: "pointer", color: "#6c757d", fontWeight: 700 }}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
