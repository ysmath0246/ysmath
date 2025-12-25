// src/pages/PaymentPage.jsx

import React, { useState, useEffect, useRef } from "react";
import { db } from "../firebase";
import {
  doc,
  setDoc,
  onSnapshot,
  collection,
  getDocs,
  getDoc,
} from "firebase/firestore";

export default function PaymentPage() {
  // 학생 ID는 로컬스토리지에서 가져옵니다.
  const studentId = localStorage.getItem("studentId");

  // routines 구독 시, 최초 1회만 todayStr 기준으로 index 설정용 ref
  const hasInitialized = useRef(false);

  // 컴포넌트 상태
  const [student, setStudent] = useState(null);            // 학생 정보
  const [sessions, setSessions] = useState([]);            // 전체 lessons 배열
  const [currentRoutineIndex, setCurrentRoutineIndex] = useState(0);  // 현재 보고 있는 루틴 인덱스
  const [selectedPayments, setSelectedPayments] = useState({});       // 루틴별 선택된 결제방법
 const [isPaid, setIsPaid] = useState(false);             // ✅ 현재 루틴 결제완료 여부

  // 지원하는 결제 방법 목록
  const paymentMethods = ["계좌이체", "결제선생", "카드"];

  // 1) 학생 정보 실시간 구독 (PIN, schedules 등)
  useEffect(() => {
    if (!studentId) return;
    const unsub = onSnapshot(
      doc(db, "students", studentId),
      (snap) => {
        if (snap.exists()) {
          setStudent({ id: snap.id, ...snap.data() });
        }
      }
    );
    return () => unsub();
  }, [studentId]);

  // 2) 루틴별 결제 방법 구독
  useEffect(() => {
    if (!studentId) return;
    const unsub = onSnapshot(
      collection(db, "payments"),
      (qs) => {
        const map = {};
        qs.docs.forEach((d) => {
          const data = d.data();
          if (data.studentId === studentId) {
            map[data.routineNumber] = data.paymentMethod;
          }
        });
        setSelectedPayments(map);
      }
    );
    return () => unsub();
  }, [studentId]);



  // 4) 전체 루틴 실시간 구독 (새 routines 구조 기준) + 최초 1회만 today 기준 루틴 인덱스 설정
  useEffect(() => {
    if (!studentId) return;

    const unsubRoutine = onSnapshot(
      collection(db, "routines"),
      async (qs) => {
        // 1) 이 학생이 포함된 루틴 문서만 모으기
        const docsForStudent = qs.docs.filter((d) => {
          const data = d.data();
          return data.students && data.students[studentId];
        });

        if (docsForStudent.length === 0) {
          setSessions([]);
          return;
        }

        // 2) 각 문서에서 sessions 꺼내서 하나의 lessons 배열로 만들기
        let lessons = [];
        docsForStudent.forEach((d) => {
          const data = d.data();
          const st = data.students[studentId];
          const rn = st.routineNumber || data.routineNumber || 1;
          const sessionsObj = st.sessions || {};

          const arr = Object.values(sessionsObj).sort(
            (a, b) => (a.session || 0) - (b.session || 0)
          );

          arr.forEach((s) => {
            lessons.push({
              date: s.date,
              session: s.session,
              routineNumber: rn,
            });
          });
        });

        // 3) attendance 컬렉션에서 상태/시간 붙이기
        const dates = Array.from(new Set(lessons.map((l) => l.date)));
        const studentName = (student && student.name) || null;
        
        const attendanceEntries = await Promise.all(
          dates.map(async (date) => {
            const snap = await getDoc(doc(db, "attendance", date));
            if (!snap.exists()) return [date, {}];
            const data = snap.data();
            const rec =
              data[studentId] ||
              (studentName && data[studentName]) ||
              {};
            return [date, rec];
          })
        );

        const attendanceMap = Object.fromEntries(attendanceEntries);

        const lessonsWithStatus = lessons.map((l) => ({
          ...l,
          status: attendanceMap[l.date]?.status || "",
          time: attendanceMap[l.date]?.time || "",
        }));

        setSessions(lessonsWithStatus);

        // 4) 최초 1회만 오늘 날짜 기준으로 currentRoutineIndex 계산
        if (!hasInitialized.current) {
          hasInitialized.current = true;
          const todayStr = new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"

          const routineMap = {};
          lessonsWithStatus.forEach((item) => {
            const num = item.routineNumber || 1;
            if (!routineMap[num]) routineMap[num] = [];
            routineMap[num].push(item);
          });

          const routinesArrayLocal = Object.values(routineMap).sort(
            (a, b) => a[0].routineNumber - b[0].routineNumber
          );

          const idx = routinesArrayLocal.findIndex((group) =>
            group.some((l) => l.date === todayStr)
          );
         // 최신 루틴(숫자 큰 게 첫 번째)이 기본 표시되게
setCurrentRoutineIndex(0);

        }
      }
    );

    return () => unsubRoutine();
  }, [studentId, student]);
  // 결제방법 선택 핸들러
  const handlePaymentSelect = async (method, routineNum) => {
    // UI 업데이트
    setSelectedPayments((prev) => ({
      ...prev,
      [routineNum]: method,
    }));

    // Firestore에 저장
    await setDoc(
      doc(db, "payments", `${studentId}_routine_${routineNum}`),
      {
        studentId,
        routineNumber: routineNum,
        paymentMethod: method,
        paymentComplete: false,
        updatedAt: new Date().toISOString(),
      },
      { merge: true }
    );
  };



  // sessions → routineNumber별 그룹핑
  const routineGroups = {};
  sessions.forEach((s) => {
    const num = s.routineNumber || 1;
    if (!routineGroups[num]) routineGroups[num] = [];
    routineGroups[num].push(s);
  });
 // 최신 루틴(숫자 큰 것) 먼저 표시
const routinesArray = Object.values(routineGroups).sort(
  (a, b) => b[0].routineNumber - a[0].routineNumber
);


  // 현재 보고 있는 루틴과 루틴 번호
  const currentRoutine = routinesArray[currentRoutineIndex] || [];
 const routineNumber =
  currentRoutine[0]?.routineNumber ?? currentRoutineIndex + 1;



// 현재 보고 있는 루틴의 결제완료 여부를 payment_completed에서 직접 조회
useEffect(() => {
  // student 또는 routineNumber가 아직 없으면 패스
  if (!student || !routineNumber) {
    setIsPaid(false);
    return;
  }

  const docId = `${student.name}_${routineNumber}`; // 예: "김승우_10"

  const fetchPaymentComplete = async () => {
    try {
      const snap = await getDoc(doc(db, "payment_completed", docId));
      if (!snap.exists()) {
        // 문서 자체가 없으면 결제 전
        setIsPaid(false);
        return;
      }
      const data = snap.data();
      setIsPaid(!!data.paymentComplete);
    } catch (e) {
      console.error("payment_completed 조회 오류:", e);
      setIsPaid(false);
    }
  };

  fetchPaymentComplete();
}, [student, routineNumber]);

  // 🔻 모든 훅 정의가 끝난 뒤에 로딩 체크
  if (!student) return <p>로딩 중…</p>;

  return (
    <div className="container-wide" style={{ textAlign: "center" }}>
      {/* 1️⃣ 학생 이름 + 루틴 번호 */}
      <h1 style={{ fontSize: 20, marginBottom: 16 }}>
        👀 {student.name}님의 수업 루틴 {routineNumber}회차
      </h1>

      {/* 2️⃣ 결제 완료 여부 */}
      <p style={{ fontSize: 18, marginBottom: 16 }}>
  {isPaid
    ? "✅ 결제완료 되었습니다."
    : "⚠️ 아직 결제전입니다. 수업시작일 전에 결제 부탁드립니다."}
</p>

    
        

      {/* 4️⃣ 결제 방법 선택 버튼 */}
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        marginBottom: 24,
      }}>
        <h3 style={{ margin: 0, fontSize: 16, fontWeight: "bold" }}>결제방법선택</h3>
        {paymentMethods.map((m) => (
          <button
            key={m}
            onClick={() => handlePaymentSelect(m, routineNumber)}
            style={{
              padding: "4px 8px",
              background: m === "계좌이체" ? "#4caf50"
                        : m === "결제선생" ? "#2196f3"
                        : "#f44336",
              color: "white",
              borderRadius: 4,
              minWidth: 80,
            }}
          >
            {m}
          </button>
        ))}
      </div>

     
  {/* 5️⃣ 현재 선택된 결제방법 + 화살표 내용 */}
  <p style={{ fontSize: 16, marginBottom: 16 }}>
    ✅ 현재 선택된 결제방법: {selectedPayments[routineNumber] || "없음"}
    {selectedPayments[routineNumber] === "카드" && (
      <span style={{ display: "block", marginTop: 8, fontSize: 14, color: "#555" }}>
        ➡️ 마지막 수업일이나 다음 수업시작일 전에 보내주세요
      </span>
    )}
    {selectedPayments[routineNumber] === "결제선생" && (
      <span style={{ display: "block", marginTop: 8, fontSize: 14, color: "#555" }}>
        ➡️ 다음수업시작일 5일 전 보내드리겠습니다.
      </span>
    )}
    {selectedPayments[routineNumber] === "계좌이체" && (
      <span style={{ display: "block", marginTop: 8, fontSize: 14, color: "#555" }}>
        ➡️ 3333-31-6107963 카카오뱅크 *교재비계좌와 다릅니다
      </span>
    )}
  </p>

      {/* ◀ 이전 / 다음 버튼 */}
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 24 }}>
        <button
          onClick={() => setCurrentRoutineIndex((i) => Math.max(i - 1, 0))}
          disabled={currentRoutineIndex === 0}
          style={{
            padding: "8px 16px",
            background: currentRoutineIndex === 0 ? "#ccc" : "#1565c0",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: currentRoutineIndex === 0 ? "default" : "pointer",
          }}
        >
          이전
        </button>
        <button
          onClick={() => setCurrentRoutineIndex((i) => Math.min(i + 1, routinesArray.length - 1))}
          disabled={currentRoutineIndex >= routinesArray.length - 1}
          style={{
            padding: "8px 16px",
            background: currentRoutineIndex >= routinesArray.length - 1 ? "#ccc" : "#1565c0",
            color: "white",
            border: "none",
            borderRadius: 4,
            cursor: currentRoutineIndex >= routinesArray.length - 1 ? "default" : "pointer",
          }}
        >
          다음
        </button>
      </div>

      {/* 6️⃣ 현재 루틴의 상세 테이블 */}
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr>
            <th style={{ border: "1px solid #ccc", padding: 8 }}>회차</th>
            <th style={{ border: "1px solid #ccc", padding: 8 }}>날짜</th>
            <th style={{ border: "1px solid #ccc", padding: 8 }}>상태</th>
            <th style={{ border: "1px solid #ccc", padding: 8 }}>시간</th>
          </tr>
        </thead>
                <tbody>
          {currentRoutine.map((s, idx) => {
            // ✅ 앞쪽에 나온 이월 개수
            const carryCountBefore = currentRoutine
              .slice(0, idx)
              .reduce(
                (cnt, prev) => cnt + (prev.status === "carryover" ? 1 : 0),
                0
              );

            const isCarry = s.status === "carryover";
            // ✅ 이월이면 X, 아니면 앞에 나온 이월 개수만큼 회차에서 빼서 이어지게
            const displaySession = isCarry
              ? "X"
              : (s.session || idx + 1) - carryCountBefore;

            return (
              <tr key={idx}>
                {/* 회차 */}
                <td
                  style={{
                    border: "1px solid #ccc",
                    padding: 8,
                    textAlign: "center",
                  }}
                >
                  {displaySession}
                </td>

                {/* 날짜: 이월이면 가운데 줄 */}
                <td
                  style={{
                    border: "1px solid #ccc",
                    padding: 8,
                    textAlign: "center",
                  }}
                >
                  <span
                    style={
                      isCarry
                        ? {
                            textDecoration: "line-through",
                            color: "#999",
                          }
                        : {}
                    }
                  >
                    {s.date}
                  </span>
                </td>

                {/* 상태 */}
                <td
                  style={{
                    border: "1px solid #ccc",
                    padding: 8,
                    textAlign: "center",
                  }}
                >
                  {s.status}
                </td>

                {/* 시간 */}
                <td
                  style={{
                    border: "1px solid #ccc",
                    padding: 8,
                    textAlign: "center",
                  }}
                >
                  {s.time || "-"}
                </td>
              </tr>
            );
          })}

          {currentRoutine.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: 16, textAlign: "center", color: "#888" }}>
                루틴 정보가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
