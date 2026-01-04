// src/pages/EnrollPage.jsx
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  query,
  where,
  onSnapshot,
  getDoc,
  getDocs,
  writeBatch,
  doc,
  serverTimestamp,
} from "firebase/firestore";

export default function EnrollPage() {
  // 탭:
  // "intensive" | "elementary" | "middle" | "high" | "advanced"
  const [group, setGroup] = useState("intensive");

  // ✅ 모바일 감지
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 640px)").matches;
  });

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = (e) => setIsMobile(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    setIsMobile(mq.matches);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  // ✅ 부모/아이
  const parentPhone = localStorage.getItem("parentPhone") || "";
  const [childList, setChildList] = useState([]); // [{id,name}]
  const [studentId, setStudentId] = useState(
    localStorage.getItem("studentId") || ""
  );
  const [studentName, setStudentName] = useState(
    (localStorage.getItem("studentName") || "").trim()
  );

  // 선택 상태 (초/중등 신청 선택)
  const [selectedApplied, setSelectedApplied] = useState([]); // [{day,time,status?}]

  // 인원수 집계 (초/중등 enrollments 컬렉션 기준) - 화면에는 노출 X
  const [countsApplied, setCountsApplied] = useState({}); // key: `${day}|${time}`
  const [countsReserve, setCountsReserve] = useState({}); // reserve

  // 저장된 문서 실시간 표시용 (enrollments_by_student/{학생이름}) - 초/중등만
  const [savedApplied, setSavedApplied] = useState([]); // [{day,time,group,status,label}]
  const [lastUpdated, setLastUpdated] = useState(null);

  // ✅ 수강신청 전체 설정 (초/중등만) - settings/enrollments
  const [enrollConfig, setEnrollConfig] = useState({
    isOpen: true,
    reserveOnly: false,
  });

  // ✅ 중등부 클리닉 (정기만)
  const weekdays = ["월", "화", "수", "목", "금"];
  const CLINIC_BLOCKS = [
    { id: "A", label: "A반 (5시 ~ 7시)", timeRange: "5시 ~ 7시" },
    { id: "B", label: "B반 (7시 ~ 9시)", timeRange: "7시 ~ 9시" },
  ];
  const CLINIC_REGULAR_LIMIT = 5;

  const [clinicRegular, setClinicRegular] = useState(null); // {day, blockId}
  const [clinicCountsRegular, setClinicCountsRegular] = useState({}); // key: `${day}|${blockId}`
  const [savedClinic, setSavedClinic] = useState(null); // {regular, ...}

  // ✅ 집중연산반(화수목) 3/4/5시 (정원 8) - 화면에는 숫자 노출 X
  const OP_DAY = "화수목";
  const OP_TIMES = ["3시", "4시", "5시"];
  const OP_LIMIT = 8;

  const [operationChoice, setOperationChoice] = useState(""); // "3시"|"4시"|"5시"
  const [savedOperation, setSavedOperation] = useState(null);
  const [opCounts, setOpCounts] = useState({}); // key: time -> count

  // ✅ 집중학습반(26년1월) - 화/수/목 x 3/4/5시 = 9칸
  // ✅ 선택: 1개/2개/3개 모두 가능
  // ✅ 같은 요일 중복 선택 불가(같은 요일 클릭하면 교체)
  // ✅ 정원 8 - 화면에는 숫자 노출 X
  const INT_DAYS = ["화", "수", "목"];
  const INT_TIMES = ["3시", "4시", "5시"];
  const INT_LIMIT = 8;

  const [intensiveSelected, setIntensiveSelected] = useState([]); // [{day,time}]
  const [savedIntensive, setSavedIntensive] = useState([]); // [{day,time}]
  const [intensiveCounts, setIntensiveCounts] = useState({}); // key: `${day}|${time}` -> count
  const [intensiveUpdatedAt, setIntensiveUpdatedAt] = useState(null);

  // ✅ 고등부(26년3월) - 요일만 선택(최대 4개), 정원 6(요일별) - 화면 숫자 노출 X
  const HIGH_DAYS = ["월", "화", "목", "금"];
  const HIGH_LIMIT = 6;

  const [highSelectedDays, setHighSelectedDays] = useState([]); // ["월","화",...]
  const [savedHighDays, setSavedHighDays] = useState([]); // ["월","화",...]
  const [highCounts, setHighCounts] = useState({}); // key: day -> count
  const [highUpdatedAt, setHighUpdatedAt] = useState(null);

  // ✅ 심화경시반(26년3월) - 신청/신청취소만 (전체 인원수 화면 노출 X)
  const [advApplied, setAdvApplied] = useState(false);
  const [savedAdvApplied, setSavedAdvApplied] = useState(false);
  const [advCounts, setAdvCounts] = useState(0); // 내부용(노출 X)
  const [advUpdatedAt, setAdvUpdatedAt] = useState(null);

  // 시간표 (초/중등)
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

  const labelByGroup = {
    intensive: "집중학습반(26년1월)",
    elementary: "초등부(26년3월)",
    middle: "중등부(26년3월)", // ✅ 중등부 안에 클리닉 포함(추가 제공)으로 처리
    high: "고등부(26년3월)",
    advanced: "심화경시반(26년3월)",
  };

  const currentTable =
    group === "elementary" || group === "middle" ? schedules[group] : null;

  // ===== helpers =====
  const keyOf = (d, t) => `${d}|${t}`;
  const existsIn = (arr, d, t) => arr.some((s) => s.day === d && s.time === t);
  const clinicKey = (day, blockId) => `${day}|${blockId}`;

  // ✅ 모바일에서 30분 표기 때문에 세로로 커지는 문제 해결: 표시용 포맷
  const displayTime = (t) => {
    if (!t) return "";
    // "3시30분" -> "3:30", "2시30분" -> "2:30"
    const m = String(t).match(/^(\d+)시30분$/);
    if (m) return `${m[1]}:30`;
    // "6시30분" -> "6:30"
    const m2 = String(t).match(/^(\d+)시30분$/);
    if (m2) return `${m2[1]}:30`;
    // "2시" -> "2시"
    return String(t);
  };

  // ✅ 정원 6 문구 (초/중등) - 숫자 노출 없이 상태만
  const appliedLabel6 = (appliedCnt) => {
    if (appliedCnt >= 6) return { text: "마감", tone: "danger" };
    if (appliedCnt >= 4) return { text: "임박", tone: "warn" };
    return { text: "접수중", tone: "ok" };
  };

  // ✅ 정원 8 문구 (집중학습/집중연산) - 숫자 노출 없이 상태만
  const appliedLabel8 = (cnt) => {
    if (cnt >= 8) return { text: "마감", tone: "danger" };
    if (cnt >= 4) return { text: "임박", tone: "warn" };
    return { text: "접수중", tone: "ok" };
  };

  // ✅ 고등부 정원 6 문구
  const appliedLabel6High = (cnt) => {
    if (cnt >= 6) return { text: "마감", tone: "danger" };
    if (cnt >= 4) return { text: "임박", tone: "warn" };
    return { text: "접수중", tone: "ok" };
  };

  // ✅ 점(●) 기반 상태 색상
  const toneColor = (tone) => {
    if (tone === "danger") return "#ef4444";
    if (tone === "warn") return "#f59e0b";
    return "#22c55e";
  };

  // ✅ 범례용 (텍스트+점)
  const StatusLegend = ({ text, tone }) => (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        fontSize: 12,
        fontWeight: 900,
        color: "#111827",
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: 8,
          height: 8,
          borderRadius: 999,
          background: toneColor(tone),
          display: "inline-block",
        }}
      />
      {text}
    </span>
  );

  // ✅ 카드 안에서는 "글씨" 줄여서: 점만 표시 (폭/높이 절약)
  const StatusDotMini = ({ tone }) => (
    <span
      style={{
        width: 8,
        height: 8,
        borderRadius: 999,
        background: toneColor(tone),
        display: "inline-block",
        flex: "0 0 auto",
      }}
    />
  );

  // ===== UI 스타일 =====
  const shell = {
    padding: isMobile ? 10 : 16,
    maxWidth: 980,
    margin: "0 auto",
  };

  const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    background: "#fff",
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
  };

  // ✅ 버튼(시간칩) - 모바일을 더 촘촘하게 (3개 한 줄용)
  const btnChip = (active, disabled = false) => ({
    padding: isMobile ? "10px 8px" : "11px 12px",
    borderRadius: isMobile ? 12 : 14,
    border: `1px solid ${active ? "#2563eb" : "#e5e7eb"}`,
    background: active ? "#eef5ff" : "#fff",
    fontWeight: 900,
    cursor: disabled ? "not-allowed" : "pointer",
    opacity: disabled ? 0.55 : 1,
    textAlign: "left",
    width: "100%",
    transition: "transform 0.06s ease",
  });

  // ✅ 상단 select
  const selectStyle = {
    padding: isMobile ? "12px 12px" : "10px 12px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    background: "white",
    fontWeight: 900,
    cursor: "pointer",
    width: isMobile ? "100%" : "auto",
    minWidth: isMobile ? "auto" : 180,
  };

  // ✅ 탭 버튼: 모바일은 "한 줄 가로 스크롤"
  const tabBar = {
    display: "flex",
    gap: 8,
    marginBottom: 12,
    overflowX: isMobile ? "auto" : "visible",
    WebkitOverflowScrolling: "touch",
    paddingBottom: isMobile ? 4 : 0,
  };

  const tabBtn = (active) => ({
    padding: isMobile ? "9px 12px" : "10px 14px",
    borderRadius: 12,
    border: `1px solid ${active ? "#2563eb" : "#e5e7eb"}`,
    background: active ? "#2563eb" : "#fff",
    color: active ? "#fff" : "#111827",
    fontWeight: 900,
    cursor: "pointer",
    whiteSpace: "nowrap",
    flex: "0 0 auto",
  });

  // ====== 아이 목록 불러오기 ======
  useEffect(() => {
    (async () => {
      if (!parentPhone) return;
      try {
        const pSnap = await getDoc(doc(db, "parents", parentPhone));
        if (!pSnap.exists()) {
          setChildList([]);
          return;
        }
        const ids = pSnap.data()?.children || [];
        const items = [];
        for (const cid of ids) {
          try {
            const sSnap = await getDoc(doc(db, "students", cid));
            const nm = sSnap.exists()
              ? (sSnap.data()?.name || "").toString().trim()
              : "";
            items.push({ id: cid, name: nm || "이름없음" });
          } catch {
            items.push({ id: cid, name: "이름없음" });
          }
        }
        items.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
        setChildList(items);

        if (!studentId && items.length) {
          const first = items[0];
          localStorage.setItem("studentId", first.id);
          localStorage.setItem("studentName", first.name);
          setStudentId(first.id);
          setStudentName(first.name);
        }
      } catch (e) {
        console.error("childList 로딩 오류:", e);
        setChildList([]);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [parentPhone]);

  // ✅ 아이 변경 (상태 싹 초기화)
  const changeChild = async (newId) => {
    if (!newId) return;
    const found = childList.find((c) => c.id === newId);
    let nm = (found?.name || "").trim();

    if (!nm) {
      try {
        const sSnap = await getDoc(doc(db, "students", newId));
        if (sSnap.exists()) nm = (sSnap.data()?.name || "").toString().trim();
      } catch {}
    }

    localStorage.setItem("studentId", newId);
    if (nm) localStorage.setItem("studentName", nm);

    setStudentId(newId);
    setStudentName(nm);

    setSelectedApplied([]);
    setSavedApplied([]);
    setLastUpdated(null);

    setClinicRegular(null);
    setSavedClinic(null);

    setOperationChoice("");
    setSavedOperation(null);

    setIntensiveSelected([]);
    setSavedIntensive([]);
    setIntensiveUpdatedAt(null);

    setHighSelectedDays([]);
    setSavedHighDays([]);
    setHighUpdatedAt(null);

    setAdvApplied(false);
    setSavedAdvApplied(false);
    setAdvUpdatedAt(null);
  };

  // ====== 수강신청 설정 실시간 (settings/enrollments) ======
  useEffect(() => {
    const ref = doc(db, "settings", "enrollments");
    const unsub = onSnapshot(
      ref,
      (snap) => {
        if (!snap.exists()) return;
        const data = snap.data() || {};
        setEnrollConfig({
          isOpen:
            data.isOpen !== undefined && data.isOpen !== null
              ? !!data.isOpen
              : true,
          reserveOnly:
            data.reserveOnly !== undefined && data.reserveOnly !== null
              ? !!data.reserveOnly
              : false,
        });
      },
      (err) => console.error("수강신청 설정 구독 오류:", err)
    );
    return () => unsub();
  }, []);

  // ====== 신청/예비 인원 수 실시간 구독 (elementary/middle만) ======
  useEffect(() => {
    if (group !== "elementary" && group !== "middle") {
      setCountsApplied({});
      setCountsReserve({});
      return;
    }

    const qAll = query(collection(db, "enrollments"), where("group", "==", group));
    const unsub = onSnapshot(qAll, (snap) => {
      const applied = {};
      const reserve = {};
      snap.forEach((d) => {
        const data = d.data();
        const key = `${data.day}|${data.time}`;
        if (data.status === "reserve") reserve[key] = (reserve[key] || 0) + 1;
        else if (data.status === "waitlist") return;
        else applied[key] = (applied[key] || 0) + 1;
      });
      setCountsApplied(applied);
      setCountsReserve(reserve);
    });
    return () => unsub();
  }, [group]);

  // ====== 학생 이름이 결정되면 enrollments_by_student/{학생이름} 구독 (초/중등만) ======
  useEffect(() => {
    if (!studentName.trim()) {
      setSavedApplied([]);
      setSelectedApplied([]);
      setLastUpdated(null);
      return;
    }

    const ref = doc(db, "enrollments_by_student", studentName.trim());
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        const appliedList = Array.isArray(data.applied) ? data.applied : [];
        setSavedApplied(appliedList);
        setLastUpdated(data.updatedAt?.toDate?.() || null);
        setSelectedApplied(
          appliedList.map(({ day, time, status }) => ({ day, time, status }))
        );
      } else {
        setSavedApplied([]);
        setSelectedApplied([]);
        setLastUpdated(null);
      }
    });
    return () => unsub();
  }, [studentName]);

  // ====== 중등부 클리닉: middle_clinic_days/{studentId} 구독 ======
  useEffect(() => {
    if (!studentId) {
      setSavedClinic(null);
      setClinicRegular(null);
      return;
    }

    const ref = doc(db, "middle_clinic_days", studentId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setSavedClinic(null);
        setClinicRegular(null);
        return;
      }
      const data = snap.data() || {};
      setSavedClinic(data);
      setClinicRegular(data.regular || null);
    });
    return () => unsub();
  }, [studentId]);

  // ====== 중등부 클리닉 전체 인원 집계 (화면 노출 X) ======
  useEffect(() => {
    const qAll = collection(db, "middle_clinic_days");
    const unsub = onSnapshot(qAll, (snap) => {
      const regCounts = {};
      snap.forEach((d) => {
        const data = d.data() || {};
        if (data.regular && data.regular.day && data.regular.blockId) {
          const k = clinicKey(data.regular.day, data.regular.blockId);
          regCounts[k] = (regCounts[k] || 0) + 1;
        }
      });
      setClinicCountsRegular(regCounts);
    });
    return () => unsub();
  }, []);

  const isRegularFull = (day, blockId, ignoreSelf = false) => {
    const k = clinicKey(day, blockId);
    let count = clinicCountsRegular[k] || 0;

    if (
      ignoreSelf &&
      savedClinic?.regular &&
      savedClinic.regular.day === day &&
      savedClinic.regular.blockId === blockId
    ) {
      count -= 1;
    }
    return count >= CLINIC_REGULAR_LIMIT;
  };

  // =========================
  // ✅ 집중연산반: 학생 저장값 구독 (operation_by_student/{studentId}) ======
  useEffect(() => {
    if (!studentId) {
      setSavedOperation(null);
      setOperationChoice("");
      return;
    }

    const ref = doc(db, "operation_by_student", studentId);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data() || {};
        setSavedOperation(data);
        setOperationChoice(data.time || "");
      } else {
        setSavedOperation(null);
        setOperationChoice("");
      }
    });

    return () => unsub();
  }, [studentId]);

  // ====== ✅ 집중연산반: 전체 인원 집계 (화면 노출 X) ======
  useEffect(() => {
    const ref = collection(db, "operation_enrollments");
    const unsub = onSnapshot(ref, (snap) => {
      const c = {};
      snap.forEach((d) => {
        const data = d.data() || {};
        const t = data.time;
        if (!t) return;
        c[t] = (c[t] || 0) + 1;
      });
      setOpCounts(c);
    });
    return () => unsub();
  }, []);

  // =========================
  // ✅ 집중학습반 구독/집계
  // =========================
  useEffect(() => {
    if (!studentId) {
      setSavedIntensive([]);
      setIntensiveSelected([]);
      setIntensiveUpdatedAt(null);
      return;
    }

    const ref = doc(db, "intensive_by_student", studentId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setSavedIntensive([]);
        setIntensiveSelected([]);
        setIntensiveUpdatedAt(null);
        return;
      }
      const data = snap.data() || {};
      const arr = Array.isArray(data.applied) ? data.applied : [];
      setSavedIntensive(arr);
      setIntensiveSelected(arr);
      setIntensiveUpdatedAt(data.updatedAt?.toDate?.() || null);
    });
    return () => unsub();
  }, [studentId]);

  useEffect(() => {
    const ref = collection(db, "intensive_enrollments");
    const unsub = onSnapshot(ref, (snap) => {
      const c = {};
      snap.forEach((d) => {
        const data = d.data() || {};
        if (!data.day || !data.time) return;
        const k = keyOf(data.day, data.time);
        c[k] = (c[k] || 0) + 1;
      });
      setIntensiveCounts(c);
    });
    return () => unsub();
  }, []);

  const toggleIntensiveSlot = (day, time) => {
    const already = existsIn(intensiveSelected, day, time);
    if (already) {
      setIntensiveSelected(
        intensiveSelected.filter((s) => !(s.day === day && s.time === time))
      );
      return;
    }

    const idxSameDay = intensiveSelected.findIndex((s) => s.day === day);
    if (idxSameDay !== -1) {
      const next = [...intensiveSelected];
      next[idxSameDay] = { day, time };
      setIntensiveSelected(next);
      return;
    }

    if (intensiveSelected.length >= 3) {
      alert("집중학습반은 최대 3개까지만 선택할 수 있습니다.");
      return;
    }

    setIntensiveSelected([...intensiveSelected, { day, time }]);
  };

  const saveIntensive = async () => {
    if (!studentId || !studentName.trim()) {
      alert("학생 정보 로딩 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    if (intensiveSelected.length < 1 || intensiveSelected.length > 3) {
      alert("집중학습반은 1개 ~ 3개를 선택해 주세요.");
      return;
    }

    for (const { day, time } of intensiveSelected) {
      const k = keyOf(day, time);
      const current = intensiveCounts[k] || 0;

      const alreadyMine = savedIntensive.some((s) => s.day === day && s.time === time);
      const adjusted = alreadyMine ? current - 1 : current;

      if (adjusted >= INT_LIMIT) {
        alert(`${day} ${time} 시간은 마감되었습니다.`);
        return;
      }
    }

    const batch = writeBatch(db);

    const refByStudent = doc(db, "intensive_by_student", studentId);
    batch.set(
      refByStudent,
      {
        studentId,
        studentName: studentName.trim(),
        applied: intensiveSelected.map((s) => ({ day: s.day, time: s.time })),
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const qMe = query(
      collection(db, "intensive_enrollments"),
      where("studentId", "==", studentId)
    );
    const prev = await getDocs(qMe);
    prev.forEach((snap) => batch.delete(snap.ref));

    intensiveSelected.forEach(({ day, time }) => {
      const id = `${studentId}|${day}|${time}`;
      const refEnroll = doc(db, "intensive_enrollments", id);
      batch.set(refEnroll, {
        studentId,
        studentName: studentName.trim(),
        day,
        time,
        createdAt: serverTimestamp(),
      });
    });

    await batch.commit();
    alert("집중학습반 신청이 저장되었습니다.");
  };

  // =========================
  // ✅ 고등부 구독/집계
  // =========================
  useEffect(() => {
    if (!studentId) {
      setSavedHighDays([]);
      setHighSelectedDays([]);
      setHighUpdatedAt(null);
      return;
    }

    const ref = doc(db, "high_by_student", studentId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setSavedHighDays([]);
        setHighSelectedDays([]);
        setHighUpdatedAt(null);
        return;
      }
      const data = snap.data() || {};
      const arr = Array.isArray(data.days) ? data.days : [];
      setSavedHighDays(arr);
      setHighSelectedDays(arr);
      setHighUpdatedAt(data.updatedAt?.toDate?.() || null);
    });
    return () => unsub();
  }, [studentId]);

  useEffect(() => {
    const ref = collection(db, "high_enrollments");
    const unsub = onSnapshot(ref, (snap) => {
      const c = {};
      snap.forEach((d) => {
        const data = d.data() || {};
        const day = data.day;
        if (!day) return;
        c[day] = (c[day] || 0) + 1;
      });
      setHighCounts(c);
    });
    return () => unsub();
  }, []);

  const toggleHighDay = (day) => {
    if (highSelectedDays.includes(day)) {
      setHighSelectedDays(highSelectedDays.filter((d) => d !== day));
      return;
    }
    if (highSelectedDays.length >= 4) {
      alert("고등부는 최대 4개 요일까지 선택할 수 있습니다.");
      return;
    }
    setHighSelectedDays([...highSelectedDays, day]);
  };

  const saveHigh = async () => {
    if (!studentId || !studentName.trim()) {
      alert("학생 정보 로딩 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    for (const day of highSelectedDays) {
      const current = highCounts[day] || 0;
      const alreadyMine = savedHighDays.includes(day);
      const adjusted = alreadyMine ? current - 1 : current;

      if (adjusted >= HIGH_LIMIT) {
        alert(`${day}요일은 마감되었습니다.`);
        return;
      }
    }

    const batch = writeBatch(db);

    const refByStudent = doc(db, "high_by_student", studentId);
    batch.set(
      refByStudent,
      {
        studentId,
        studentName: studentName.trim(),
        days: highSelectedDays,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const qMe = query(
      collection(db, "high_enrollments"),
      where("studentId", "==", studentId)
    );
    const prev = await getDocs(qMe);
    prev.forEach((snap) => batch.delete(snap.ref));

    highSelectedDays.forEach((day) => {
      const id = `${studentId}|${day}`;
      const refEnroll = doc(db, "high_enrollments", id);
      batch.set(refEnroll, {
        studentId,
        studentName: studentName.trim(),
        day,
        createdAt: serverTimestamp(),
      });
    });

    await batch.commit();
    alert("고등부 신청이 저장되었습니다.");
  };

  // =========================
  // ✅ 심화경시반 구독/집계 (전체 인원수는 화면 미노출)
  // =========================
  useEffect(() => {
    if (!studentId) {
      setSavedAdvApplied(false);
      setAdvApplied(false);
      setAdvUpdatedAt(null);
      return;
    }

    const ref = doc(db, "advanced_by_student", studentId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setSavedAdvApplied(false);
        setAdvApplied(false);
        setAdvUpdatedAt(null);
        return;
      }
      const data = snap.data() || {};
      const applied = !!data.applied;
      setSavedAdvApplied(applied);
      setAdvApplied(applied);
      setAdvUpdatedAt(data.updatedAt?.toDate?.() || null);
    });
    return () => unsub();
  }, [studentId]);

  useEffect(() => {
    const ref = collection(db, "advanced_enrollments");
    const unsub = onSnapshot(ref, (snap) => {
      setAdvCounts(snap.size || 0);
    });
    return () => unsub();
  }, []);

  const saveAdvanced = async (nextApplied) => {
    if (!studentId || !studentName.trim()) {
      alert("학생 정보 로딩 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }

    const batch = writeBatch(db);

    const refByStudent = doc(db, "advanced_by_student", studentId);
    batch.set(
      refByStudent,
      {
        studentId,
        studentName: studentName.trim(),
        applied: !!nextApplied,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const id = `${studentId}`;
    const refEnroll = doc(db, "advanced_enrollments", id);

    if (nextApplied) {
      batch.set(refEnroll, {
        studentId,
        studentName: studentName.trim(),
        createdAt: serverTimestamp(),
      });
    } else {
      batch.delete(refEnroll);
    }

    await batch.commit();
    alert(nextApplied ? "심화경시반 신청이 저장되었습니다." : "심화경시반 신청이 취소되었습니다.");
  };

  // ====== ✅ 초등부/중등부 선택 로직 ======
  // ✅ 초등부: 최대 2개 / 같은 요일 중복 불가(같은 요일 클릭하면 교체)
  const toggleElementarySlot = (day, time) => {
    if (existsIn(selectedApplied, day, time)) {
      setSelectedApplied(
        selectedApplied.filter((s) => !(s.day === day && s.time === time))
      );
      return;
    }

    const idxSameDay = selectedApplied.findIndex((s) => s.day === day);
    if (idxSameDay !== -1) {
      const next = [...selectedApplied];
      next[idxSameDay] = { day, time };
      setSelectedApplied(next);
      return;
    }

    if (selectedApplied.length >= 2) {
      alert("초등부는 신청 시간대를 최대 2개까지만 선택할 수 있습니다.");
      return;
    }

    setSelectedApplied([...selectedApplied, { day, time }]);
  };

  // ✅ 중등부: 최대 2개 / 같은 요일 중복 불가(같은 요일 클릭하면 교체)
  const toggleMiddleSlot = (day, time) => {
    if (existsIn(selectedApplied, day, time)) {
      setSelectedApplied(
        selectedApplied.filter((s) => !(s.day === day && s.time === time))
      );
      return;
    }

    const idxSameDay = selectedApplied.findIndex((s) => s.day === day);
    if (idxSameDay !== -1) {
      const next = [...selectedApplied];
      next[idxSameDay] = { day, time };
      setSelectedApplied(next);
      return;
    }

    if (selectedApplied.length >= 2) {
      alert("중등부는 신청 시간대를 최대 2개까지만 선택할 수 있습니다.");
      return;
    }
    setSelectedApplied([...selectedApplied, { day, time }]);
  };

  const removeApplied = (day, time) =>
    setSelectedApplied(selectedApplied.filter((s) => !(s.day === day && s.time === time)));

  // ====== 중등부 클리닉 선택/저장 ======
  const handleSelectRegularDay = (day) => {
    setClinicRegular((prev) => ({
      day,
      blockId: prev?.blockId || "A",
    }));
  };

  const handleSelectRegularBlock = (blockId) => {
    if (!clinicRegular?.day) {
      alert("먼저 요일을 선택해 주세요.");
      return;
    }
    setClinicRegular((prev) => ({
      ...(prev || { day: weekdays[0] }),
      blockId,
    }));
  };

  const saveRegularClinic = async () => {
    if (!studentId || !studentName.trim()) {
      alert("학생 정보 로딩 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (!clinicRegular || !clinicRegular.day || !clinicRegular.blockId) {
      alert("클리닉 요일과 반(A/B)을 선택해 주세요.");
      return;
    }

    const { day, blockId } = clinicRegular;

    if (isRegularFull(day, blockId, true)) {
      alert("해당 요일/반의 클리닉 정원이 마감되었습니다.");
      return;
    }

    const batch = writeBatch(db);
    const ref = doc(db, "middle_clinic_days", studentId);

    batch.set(
      ref,
      {
        studentId,
        studentName: studentName.trim(),
        regular: { day, blockId },
        extra: null,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();
    alert("클리닉 신청이 저장되었습니다.");
  };

  // ✅ 클리닉 저장 취소(삭제) 버튼용 (선택사항)
  const clearClinic = async () => {
    if (!studentId) return;
    if (!confirm("저장된 클리닉을 삭제할까요?")) return;
    const batch = writeBatch(db);
    batch.delete(doc(db, "middle_clinic_days", studentId));
    await batch.commit();
    alert("클리닉이 삭제되었습니다.");
  };

  // ====== ✅ 집중연산반 저장 ======
  const saveOperation = async () => {
    if (!studentId || !studentName.trim()) {
      alert("학생 정보 로딩 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (!operationChoice) {
      alert("집중연산반 시간을 선택해 주세요.");
      return;
    }

    const currentCount = opCounts[operationChoice] || 0;

    let adjustedCount = currentCount;
    if (savedOperation?.time === operationChoice) adjustedCount = currentCount - 1;

    if (adjustedCount >= OP_LIMIT) {
      alert("해당 시간은 마감되었습니다.");
      return;
    }

    const batch = writeBatch(db);

    const refByStudent = doc(db, "operation_by_student", studentId);
    batch.set(
      refByStudent,
      {
        studentId,
        studentName: studentName.trim(),
        day: OP_DAY,
        time: operationChoice,
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    const qMe = query(
      collection(db, "operation_enrollments"),
      where("studentId", "==", studentId)
    );
    const prev = await getDocs(qMe);
    prev.forEach((snap) => batch.delete(snap.ref));

    const id = `${studentId}|${OP_DAY}|${operationChoice}`;
    const refEnroll = doc(db, "operation_enrollments", id);
    batch.set(refEnroll, {
      studentId,
      studentName: studentName.trim(),
      day: OP_DAY,
      time: operationChoice,
      createdAt: serverTimestamp(),
    });

    await batch.commit();
    alert("집중연산반 신청이 저장되었습니다.");
  };

  // ====== 수강신청 저장 (초/중등) ======
  const saveSelections = async () => {
    if (group !== "elementary" && group !== "middle") return;

    if (!enrollConfig.isOpen) {
      alert("현재 수강신청이 마감되었습니다.");
      return;
    }

    if (!studentName.trim()) {
      alert("학생 정보 로딩 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (selectedApplied.length === 0) {
      alert("선택된 시간대가 없습니다.");
      return;
    }

    if (selectedApplied.length > 2) {
      alert("한 번에 최대 2개까지만 선택할 수 있습니다.");
      return;
    }

    let appliedForSave = [...selectedApplied];
    let hasError = false;
    let errorMsg = "";

    const nextApplied = [];
    selectedApplied.forEach(({ day, time }) => {
      const k = keyOf(day, time);
      const currentApplied = countsApplied[k] || 0;
      const currentReserve = countsReserve[k] || 0;

      let status;

      if (enrollConfig.reserveOnly) {
        if (currentReserve >= 10) {
          hasError = true;
          errorMsg += `${day} ${time} 시간은 예비 신청이 모두 마감되었습니다.\n`;
          return;
        }
        status = "reserve";
      } else {
        if (currentApplied < 6) status = "applied";
        else if (currentReserve < 10) status = "reserve";
        else {
          hasError = true;
          errorMsg += `${day} ${time} 시간은 신청 및 예비가 모두 마감되었습니다.\n`;
          return;
        }
      }

      nextApplied.push({ day, time, status });
    });

    if (hasError) {
      alert(errorMsg || "정원이 가득 찬 시간대가 있습니다. 다시 선택해 주세요.");
      return;
    }
    appliedForSave = nextApplied;

    const batch = writeBatch(db);

    const refStudent = doc(db, "enrollments_by_student", studentName.trim());
    batch.set(refStudent, {
      studentName: studentName.trim(),
      applied: appliedForSave.map(({ day, time, status }) => ({
        day,
        time,
        group,
        status: status === "reserve" ? "reserve" : "applied",
        label: status === "reserve" ? "신청(예비)" : "신청",
      })),
      waitlist: [],
      updatedAt: serverTimestamp(),
    });

    const qMe = query(
      collection(db, "enrollments"),
      where("studentName", "==", studentName.trim())
    );
    const prev = await getDocs(qMe);
    prev.forEach((snap) => batch.delete(snap.ref));

    appliedForSave.forEach(({ day, time, status }) => {
      const safeStatus = status === "reserve" ? "reserve" : "applied";
      const id = `${studentName.trim()}|${group}|${day}|${time}|${safeStatus}`;
      const r = doc(db, "enrollments", id);
      batch.set(r, {
        studentName: studentName.trim(),
        group,
        day,
        time,
        status: safeStatus,
        createdAt: serverTimestamp(),
      });
    });

    await batch.commit();
    setSelectedApplied(appliedForSave);
    alert("저장되었습니다.");
  };

  // ✅ 상단 “저장 요약”
  const confirmedLines = (() => {
    const lines = [];

    if (savedIntensive?.length) {
      const txt = savedIntensive.map((s) => `${s.day} ${s.time}`).join(", ");
      lines.push(`🟦 집중학습반: ${txt} (신청)`);
    }

    const elem = savedApplied.filter((x) => x.group === "elementary");
    const mid = savedApplied.filter((x) => x.group === "middle");

    if (elem.length) {
      const txt = elem
        .map(
          (s) => `${s.day} ${s.time}${s.status === "reserve" ? " (예비)" : " (신청)"}`
        )
        .join(", ");
      lines.push(`🟩 초등부: ${txt}`);
    }

    if (mid.length) {
      const txt = mid
        .map(
          (s) => `${s.day} ${s.time}${s.status === "reserve" ? " (예비)" : " (신청)"}`
        )
        .join(", ");
      lines.push(`🟨 중등부: ${txt}`);
    }

    if (savedClinic?.regular?.day && savedClinic?.regular?.blockId) {
      const blockTxt = savedClinic.regular.blockId === "A" ? "A(5~7)" : "B(7~9)";
      lines.push(`🟧 중등클리닉: ${savedClinic.regular.day} ${blockTxt} (신청)`);
    }

    if (savedHighDays?.length) {
      lines.push(`🟥 고등부: ${savedHighDays.join(", ")} (신청)`);
    }

    if (savedAdvApplied) {
      lines.push(`🟪 심화경시반: 신청 완료`);
    }

    if (!lines.length) lines.push("✅ 아직 저장된 신청이 없습니다.");
    return lines;
  })();

  // ✅ 탭
  const tabs = ["intensive", "elementary", "middle", "high", "advanced"];

  // =========================
  // ✅ 모바일용 렌더링 유틸 (여기 핵심 변경!)
  // =========================
  const MobileDayCard = ({ day, children }) => (
    <div
      style={{
        border: "1px solid #e5e7eb",
        borderRadius: 14,
        padding: 10, // ✅ 더 촘촘
        background: "#fff",
      }}
    >
      <div
        style={{
          fontWeight: 900,
          marginBottom: 8,
          fontSize: 13, // ✅ 조금 작게
        }}
      >
        {day}
      </div>
      {children}
    </div>
  );

  // ✅ 모바일 그리드: 3개 한 줄!
  const MobileGrid = ({ children }) => (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(3, 1fr)", // ✅ 2 -> 3
        gap: 8, // ✅ 10 -> 8
      }}
    >
      {children}
    </div>
  );

  // ✅ 상단 상태(초/중등) 점 표시용
  const enrollTopStatus = (() => {
    if (!enrollConfig.isOpen) return { text: "완전 마감(초/중등)", tone: "danger" };
    if (enrollConfig.reserveOnly) return { text: "예비 접수(초/중등)", tone: "warn" };
    return { text: "접수중(초/중등)", tone: "ok" };
  })();

  // ✅ 공통: 모바일 카드 안 내용(시간 + 점만)으로 슬림하게
  const MobileChipInner = ({ timeText, tone }) => (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 8,
      }}
    >
      <div
        style={{
          fontWeight: 900,
          fontSize: 15, // ✅ 18 -> 15
          lineHeight: 1,
          whiteSpace: "nowrap",
          letterSpacing: -0.2,
        }}
      >
        {timeText}
      </div>
      <StatusDotMini tone={tone} />
    </div>
  );

  return (
    <div style={shell}>
      {/* ✅ 상단 카드 */}
      <div style={{ ...card, padding: isMobile ? 12 : 14, marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: isMobile ? "stretch" : "center",
            gap: 10,
            flexWrap: "wrap",
            flexDirection: isMobile ? "column" : "row",
          }}
        >
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900 }}>수강신청</div>
            <div
              style={{
                marginTop: 6,
                fontSize: 13,
                color: "#374151",
                lineHeight: 1.65,
              }}
            >
              {confirmedLines.map((t, idx) => (
                <div key={idx} style={{ whiteSpace: "pre-wrap" }}>
                  {t}
                </div>
              ))}
            </div>
          </div>

          {childList.length > 0 && (
            <div style={{ width: isMobile ? "100%" : "auto" }}>
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900, marginBottom: 6 }}>
                아이 선택
              </div>
              <select
                value={studentId}
                onChange={(e) => changeChild(e.target.value)}
                style={selectStyle}
              >
                {childList.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        {/* ✅ 초/중등 상태 + 범례(모바일 가독성↑ / 카드 안 글씨↓) */}
        <div
          style={{
            marginTop: 10,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "center",
              flexWrap: "wrap",
              fontSize: 12,
            }}
          >
            <StatusLegend text="접수중" tone="ok" />
            <StatusLegend text="임박" tone="warn" />
            <StatusLegend text="마감" tone="danger" />
          </div>

          <div
            style={{
              border: "1px solid #e5e7eb",
              background: "#fff",
              borderRadius: 999,
              padding: "8px 12px",
              boxShadow: "0 2px 10px rgba(0,0,0,0.04)",
            }}
          >
            <StatusLegend text={enrollTopStatus.text} tone={enrollTopStatus.tone} />
          </div>
        </div>
      </div>

      {/* ✅ 탭 */}
      <div style={tabBar}>
        {tabs.map((g) => {
          const active = group === g;
          return (
            <button key={g} onClick={() => setGroup(g)} style={tabBtn(active)}>
              {labelByGroup[g]}
            </button>
          );
        })}
      </div>

      {/* =========================
          ✅ 집중학습반
      ========================= */}
      {group === "intensive" ? (
        <div style={{ ...card, padding: isMobile ? 12 : 14 }}>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
              flexWrap: "wrap",
            }}
          >
            <div>
              <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 6 }}>
                집중학습반(26년1월)
              </div>
              <div style={{ fontSize: 12, color: "#6b7280" }}>
                ✅ 9개 중 <b>1개 ~ 3개</b> 선택 / 같은 요일 중복 불가
              </div>
            </div>
            {!isMobile && (
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900 }}>
                {intensiveUpdatedAt ? `업데이트: ${intensiveUpdatedAt.toLocaleString()}` : ""}
              </div>
            )}
          </div>

          {isMobile ? (
            <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
              {INT_DAYS.map((day) => (
                <MobileDayCard key={day} day={`${day}요일`}>
                  <MobileGrid>
                    {INT_TIMES.map((t) => {
                      const k = keyOf(day, t);
                      const cnt = intensiveCounts[k] || 0;
                      const label = appliedLabel8(cnt);

                      const isSel = existsIn(intensiveSelected, day, t);
                      const full =
                        cnt >= INT_LIMIT &&
                        !savedIntensive.some((s) => s.day === day && s.time === t);

                      return (
                        <button
                          key={`${day}-${t}`}
                          onClick={() => {
                            if (full) return alert("해당 시간은 마감되었습니다.");
                            toggleIntensiveSlot(day, t);
                          }}
                          disabled={full}
                          style={btnChip(isSel, full)}
                        >
                          <MobileChipInner timeText={displayTime(t)} tone={label.tone} />
                        </button>
                      );
                    })}
                  </MobileGrid>
                </MobileDayCard>
              ))}
            </div>
          ) : (
            <div style={{ marginTop: 14, overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 560,
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        borderBottom: "1px solid #e5e7eb",
                        fontWeight: 900,
                        width: 90,
                      }}
                    >
                      요일
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        borderBottom: "1px solid #e5e7eb",
                        fontWeight: 900,
                      }}
                    >
                      시간 (상태)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {INT_DAYS.map((day) => (
                    <tr key={day}>
                      <td
                        style={{
                          padding: "10px 12px",
                          borderBottom: "1px solid #f1f5f9",
                          fontWeight: 900,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {day}
                      </td>
                      <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                          {INT_TIMES.map((t) => {
                            const k = keyOf(day, t);
                            const cnt = intensiveCounts[k] || 0;
                            const label = appliedLabel8(cnt);

                            const isSel = existsIn(intensiveSelected, day, t);
                            const full =
                              cnt >= INT_LIMIT &&
                              !savedIntensive.some((s) => s.day === day && s.time === t);

                            return (
                              <button
                                key={`${day}-${t}`}
                                onClick={() => {
                                  if (full) return alert("해당 시간은 마감되었습니다.");
                                  toggleIntensiveSlot(day, t);
                                }}
                                disabled={full}
                                style={{ ...btnChip(isSel, full), minWidth: 190 }}
                              >
                                <div
                                  style={{
                                    display: "flex",
                                    justifyContent: "space-between",
                                    gap: 10,
                                    alignItems: "center",
                                  }}
                                >
                                  <div style={{ fontWeight: 900, fontSize: 16 }}>{t}</div>
                                  <StatusLegend text={label.text} tone={label.tone} />
                                </div>
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
          )}

          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 10,
              alignItems: isMobile ? "stretch" : "center",
              flexWrap: "wrap",
              flexDirection: isMobile ? "column" : "row",
            }}
          >
            <div style={{ fontWeight: 900 }}>
              신청 선택:{" "}
              {intensiveSelected.length ? (
                <span>
                  {intensiveSelected.map((s) => `${s.day} ${s.time}`).join(", ")}{" "}
                  <span style={{ color: "#6b7280", fontWeight: 900 }}>
                    ({intensiveSelected.length}개)
                  </span>
                </span>
              ) : (
                <span style={{ color: "#6b7280" }}>없음</span>
              )}
            </div>

            <button
              onClick={saveIntensive}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #2563eb",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 900,
                cursor: "pointer",
                width: isMobile ? "100%" : "auto",
              }}
            >
              집중학습반 저장
            </button>

            {isMobile && intensiveUpdatedAt && (
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900 }}>
                업데이트: {intensiveUpdatedAt.toLocaleString()}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* =========================
          ✅ 고등부
      ========================= */}
      {group === "high" ? (
        <div style={{ ...card, padding: isMobile ? 12 : 14 }}>
          <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 6 }}>고등부(26년3월)</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
            월/화/목/금 중 선택 (최대 4개)
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: isMobile ? "repeat(2, 1fr)" : "repeat(4, minmax(160px, 1fr))",
              gap: 10,
            }}
          >
            {HIGH_DAYS.map((day) => {
              const cnt = highCounts[day] || 0;
              const label = appliedLabel6High(cnt);

              const full = cnt >= HIGH_LIMIT && !savedHighDays.includes(day);
              const active = highSelectedDays.includes(day);

              return (
                <button
                  key={day}
                  onClick={() => {
                    if (full) return alert(`${day}요일은 마감되었습니다.`);
                    toggleHighDay(day);
                  }}
                  disabled={full}
                  style={btnChip(active, full)}
                >
                  {isMobile ? (
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                      <div style={{ fontWeight: 900, fontSize: 15, whiteSpace: "nowrap" }}>{day}요일</div>
                      <StatusDotMini tone={label.tone} />
                    </div>
                  ) : (
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                      <div style={{ fontWeight: 900, fontSize: 18 }}>{day}요일</div>
                      <StatusLegend text={label.text} tone={label.tone} />
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 10,
              alignItems: isMobile ? "stretch" : "center",
              flexWrap: "wrap",
              flexDirection: isMobile ? "column" : "row",
            }}
          >
            <div style={{ fontWeight: 900 }}>
              선택:{" "}
              {highSelectedDays.length ? (
                <span>
                  {highSelectedDays.join(", ")}{" "}
                  <span style={{ color: "#6b7280" }}>({highSelectedDays.length}개)</span>
                </span>
              ) : (
                <span style={{ color: "#6b7280" }}>없음</span>
              )}
            </div>

            <button
              onClick={saveHigh}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #2563eb",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 900,
                cursor: "pointer",
                width: isMobile ? "100%" : "auto",
              }}
            >
              고등부 저장
            </button>

            {highUpdatedAt && (
              <div style={{ fontSize: 12, color: "#6b7280", fontWeight: 900 }}>
                업데이트: {highUpdatedAt.toLocaleString()}
              </div>
            )}
          </div>
        </div>
      ) : null}

      {/* =========================
          ✅ 심화경시반
      ========================= */}
      {group === "advanced" ? (
        <div style={{ ...card, padding: isMobile ? 12 : 14 }}>
          <div style={{ fontSize: 16, fontWeight: 900, marginBottom: 6 }}>
            심화경시반(26년3월)
          </div>
          <div style={{ fontSize: 12, color: "#6b7280", marginBottom: 12 }}>
            신청 / 신청취소 버튼만 저장됩니다.
          </div>

          <div
            style={{
              display: "flex",
              gap: 10,
              alignItems: "stretch",
              flexWrap: "wrap",
              flexDirection: isMobile ? "column" : "row",
            }}
          >
            <button
              onClick={() => {
                setAdvApplied(true);
                saveAdvanced(true);
              }}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #2563eb",
                background: advApplied ? "#2563eb" : "#fff",
                color: advApplied ? "#fff" : "#111827",
                fontWeight: 900,
                cursor: "pointer",
                width: isMobile ? "100%" : "auto",
              }}
            >
              신청
            </button>

            <button
              onClick={() => {
                setAdvApplied(false);
                saveAdvanced(false);
              }}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #e5e7eb",
                background: "#fff",
                color: "#111827",
                fontWeight: 900,
                cursor: "pointer",
                width: isMobile ? "100%" : "auto",
              }}
            >
              신청취소
            </button>

            <span
              style={{
                fontSize: 12,
                fontWeight: 900,
                color: savedAdvApplied ? "#166534" : "#6b7280",
                background: savedAdvApplied ? "#dcfce7" : "#f3f4f6",
                border: "1px solid #e5e7eb",
                padding: "10px 12px",
                borderRadius: 12,
                display: "inline-flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              {savedAdvApplied ? "현재 상태: 신청" : "현재 상태: 미신청"}
            </span>
          </div>
        </div>
      ) : null}

      {/* =========================
          ✅ 초등/중등 (모바일: 카드+그리드 3열 + 카드 안 글씨 최소화)
      ========================= */}
      {group === "elementary" || group === "middle" ? (
        <div style={{ ...card, padding: isMobile ? 12 : 14 }}>
          {/* ✅ 모바일 UI */}
          {isMobile ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              {currentTable &&
                Object.entries(currentTable).map(([day, times]) => (
                  <MobileDayCard key={day} day={`${day}요일`}>
                    <MobileGrid>
                      {times.map((t) => {
                        const k = keyOf(day, t);
                        const appliedCnt = countsApplied[k] || 0;
                        const label = appliedLabel6(appliedCnt);

                        const isSelected = existsIn(selectedApplied, day, t);

                        const isAppliedFull = appliedCnt >= 6;
                        const isReserveFull = (countsReserve[k] || 0) >= 10;

                        const disabledCompletely = !enrollConfig.isOpen
                          ? true
                          : !enrollConfig.reserveOnly
                          ? isAppliedFull && isReserveFull
                          : isReserveFull;

                        return (
                          <button
                            key={`${day}-${t}`}
                            onClick={() => {
                              if (!enrollConfig.isOpen) return alert("현재 수강신청이 마감되었습니다.");
                              if (group === "elementary") toggleElementarySlot(day, t);
                              else toggleMiddleSlot(day, t);
                            }}
                            disabled={disabledCompletely}
                            style={btnChip(isSelected, disabledCompletely)}
                          >
                            <MobileChipInner timeText={displayTime(t)} tone={label.tone} />
                          </button>
                        );
                      })}
                    </MobileGrid>
                  </MobileDayCard>
                ))}
            </div>
          ) : (
            // ✅ PC UI (표)
            <div style={{ overflowX: "auto" }}>
              <table
                style={{
                  width: "100%",
                  borderCollapse: "collapse",
                  minWidth: 560,
                  border: "1px solid #e5e7eb",
                  borderRadius: 12,
                  overflow: "hidden",
                }}
              >
                <thead>
                  <tr style={{ background: "#f8fafc" }}>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        borderBottom: "1px solid #e5e7eb",
                        fontWeight: 900,
                        width: 90,
                      }}
                    >
                      요일
                    </th>
                    <th
                      style={{
                        textAlign: "left",
                        padding: "10px 12px",
                        borderBottom: "1px solid #e5e7eb",
                        fontWeight: 900,
                      }}
                    >
                      시간 (상태)
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {currentTable &&
                    Object.entries(currentTable).map(([day, times]) => (
                      <tr key={day}>
                        <td
                          style={{
                            padding: "10px 12px",
                            borderBottom: "1px solid #f1f5f9",
                            fontWeight: 900,
                            whiteSpace: "nowrap",
                          }}
                        >
                          {day}
                        </td>
                        <td style={{ padding: "10px 12px", borderBottom: "1px solid #f1f5f9" }}>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
                            {times.map((t) => {
                              const k = keyOf(day, t);
                              const appliedCnt = countsApplied[k] || 0;
                              const label = appliedLabel6(appliedCnt);

                              const isSelected = existsIn(selectedApplied, day, t);

                              const isAppliedFull = appliedCnt >= 6;
                              const isReserveFull = (countsReserve[k] || 0) >= 10;

                              const disabledCompletely = !enrollConfig.isOpen
                                ? true
                                : !enrollConfig.reserveOnly
                                ? isAppliedFull && isReserveFull
                                : isReserveFull;

                              return (
                                <button
                                  key={`${day}-${t}`}
                                  onClick={() => {
                                    if (!enrollConfig.isOpen)
                                      return alert("현재 수강신청이 마감되었습니다.");
                                    if (group === "elementary") toggleElementarySlot(day, t);
                                    else toggleMiddleSlot(day, t);
                                  }}
                                  disabled={disabledCompletely}
                                  style={{ ...btnChip(isSelected, disabledCompletely), minWidth: 180 }}
                                >
                                  <div
                                    style={{
                                      display: "flex",
                                      justifyContent: "space-between",
                                      gap: 10,
                                      alignItems: "center",
                                    }}
                                  >
                                    <div style={{ fontSize: 16, fontWeight: 900 }}>{t}</div>
                                    <StatusLegend text={label.text} tone={label.tone} />
                                  </div>
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
          )}

          {/* 저장 영역 */}
          <div
            style={{
              marginTop: 14,
              display: "flex",
              gap: 10,
              alignItems: isMobile ? "stretch" : "center",
              flexWrap: "wrap",
              flexDirection: isMobile ? "column" : "row",
            }}
          >
            <div style={{ color: "#374151", fontWeight: 900 }}>
              선택:{" "}
              {selectedApplied.length ? (
                <span>
                  {selectedApplied.map((s) => `${s.day} ${s.time}`).join(", ")}{" "}
                  <span style={{ color: "#6b7280" }}>({selectedApplied.length}개)</span>
                </span>
              ) : (
                <span style={{ color: "#6b7280" }}>없음</span>
              )}
            </div>

            <button
              onClick={saveSelections}
              style={{
                padding: "12px 14px",
                borderRadius: 12,
                border: "1px solid #2563eb",
                background: "#2563eb",
                color: "#fff",
                fontWeight: 900,
                cursor: "pointer",
                width: isMobile ? "100%" : "auto",
              }}
            >
              저장
            </button>
          </div>

          {/* 선택 목록 */}
          <div style={{ marginTop: 14 }}>
            <div style={{ fontWeight: 900, marginBottom: 8 }}>신청 선택(최대 2)</div>
            {selectedApplied.length === 0 ? (
              <div style={{ color: "#6b7280" }}>없음</div>
            ) : (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                {selectedApplied.map(({ day, time, status }) => (
                  <span
                    key={`ap-${day}-${time}`}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 999,
                      border: `1px solid ${status === "reserve" ? "#9ca3af" : "#2563eb"}`,
                      background: status === "reserve" ? "#f3f4f6" : "#eef5ff",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: 10,
                      fontWeight: 900,
                      fontSize: 13,
                    }}
                  >
                    {day} {displayTime(time)} {status === "reserve" ? "(예비)" : ""}
                    <button
                      onClick={() => removeApplied(day, time)}
                      title="제거"
                      style={{
                        border: "none",
                        background: "transparent",
                        cursor: "pointer",
                        fontWeight: 900,
                        color: status === "reserve" ? "#6b7280" : "#2563eb",
                      }}
                    >
                      ×
                    </button>
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* ✅✅ 중등부일 때만: "클리닉 추가(선택)" 섹션 */}
          {group === "middle" ? (
            <div style={{ marginTop: 14 }}>
              <div
                style={{
                  padding: 12,
                  borderRadius: 14,
                  border: "1px solid #e5e7eb",
                  background: "#f9fafb",
                }}
              >
                <div style={{ fontWeight: 900, fontSize: 14, marginBottom: 6 }}>
  클리닉(추가/선택형) 💰 추가금 없음
</div>

<div
  style={{
    fontSize: 12,
    color: "#6b7280",
    lineHeight: 1.6,
    marginBottom: 12,
  }}
>
  <span style={{ color: "#16a34a", fontWeight: 600 }}>
    ✔ 숙제 완벽 → 집에서 숙제 대체 가능
  </span>

  <br />

  <span style={{ color: "#e11d48", fontWeight: 700 }}>
    ❗ 숙제 미흡 / 이해 부족 → 클리닉 등원 권장
  </span>

  <br />

  <span style={{ color: "#2563eb", fontWeight: 600 }}>
    목적 :
  </span>{" "}
  <b style={{ color: "#1f2937" }}>
    미완성 숙제 정리 / 개념 누락 보완 / 시험 대비 안정화
  </b>
</div>


                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 6, fontWeight: 900 }}>
                    요일 선택
                  </div>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 8 }}>
                    {weekdays.map((day) => {
                      const active = clinicRegular?.day === day;
                      return (
                        <button
                          key={day}
                          onClick={() => handleSelectRegularDay(day)}
                          style={{
                            padding: "10px 8px",
                            borderRadius: 12,
                            border: active ? "1px solid #2563eb" : "1px solid #e5e7eb",
                            background: active ? "#eef5ff" : "#ffffff",
                            cursor: "pointer",
                            fontWeight: 900,
                            fontSize: 13,
                          }}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 12, color: "#4b5563", marginBottom: 6, fontWeight: 900 }}>
                    반 선택
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                      gap: 8,
                    }}
                  >
                    {CLINIC_BLOCKS.map((b) => {
                      const active = clinicRegular?.blockId === b.id;
                      const full = clinicRegular?.day && isRegularFull(clinicRegular.day, b.id, true);

                      return (
                        <button
                          key={b.id}
                          onClick={() => handleSelectRegularBlock(b.id)}
                          disabled={full}
                          style={{
                            padding: "12px 12px",
                            borderRadius: 12,
                            border: active ? "1px solid #2563eb" : "1px solid #e5e7eb",
                            background: active ? "#eef5ff" : "#ffffff",
                            cursor: full ? "not-allowed" : "pointer",
                            opacity: full ? 0.6 : 1,
                            fontWeight: 900,
                            textAlign: "left",
                          }}
                        >
                          <div
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: 10,
                              alignItems: "center",
                            }}
                          >
                            <span>{b.label}</span>
                            <span style={{ fontSize: 12, fontWeight: 900, color: full ? "#ef4444" : "#6b7280" }}>
                              {full ? "마감" : "선택"}
                            </span>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    onClick={saveRegularClinic}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "1px solid #2563eb",
                      background: "#2563eb",
                      color: "white",
                      fontWeight: 900,
                      cursor: "pointer",
                      width: isMobile ? "100%" : "auto",
                    }}
                  >
                    클리닉 저장
                  </button>

                  <button
                    onClick={clearClinic}
                    style={{
                      padding: "12px 14px",
                      borderRadius: 12,
                      border: "1px solid #e5e7eb",
                      background: "#fff",
                      color: "#111827",
                      fontWeight: 900,
                      cursor: "pointer",
                      width: isMobile ? "100%" : "auto",
                    }}
                  >
                    클리닉 삭제
                  </button>
                </div>

                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 12,
                    border: "1px solid #e5e7eb",
                    background: "#fff",
                  }}
                >
                  <div style={{ fontWeight: 900, marginBottom: 6 }}>저장된 클리닉</div>
                  {savedClinic?.regular ? (
                    <div style={{ color: "#111827", fontWeight: 900 }}>
                      {savedClinic.regular.day}{" "}
                      {savedClinic.regular.blockId === "A" ? "A(5~7)" : "B(7~9)"}
                    </div>
                  ) : (
                    <div style={{ color: "#6b7280" }}>저장된 클리닉이 없습니다.</div>
                  )}
                </div>
              </div>
            </div>
          ) : null}

          {/* 저장된 내용 */}
          <div
            style={{
              marginTop: 14,
              padding: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              background: "#f9fafb",
            }}
          >
            <div style={{ fontWeight: 900, marginBottom: 8 }}>
              저장된 내용 {studentName ? `: ${studentName}` : ""}
            </div>
            {!studentName ? (
              <div style={{ color: "#6b7280" }}>학생 정보 로딩 중…</div>
            ) : (
              <>
                <div style={{ marginBottom: 4 }}>
                  <b>신청:</b>{" "}
                  {savedApplied.length ? (
                    savedApplied
                      .map((s) => {
                        const g = s.group === "elementary" ? "초등부" : "중등부";
                        const tag =
                          s.status === "reserve" || s?.label === "신청(예비)" ? " (예비)" : "";
                        return `${g} ${s.day} ${displayTime(s.time)}${tag}`;
                      })
                      .join(", ")
                  ) : (
                    <span style={{ color: "#6b7280" }}>없음</span>
                  )}
                </div>

                {lastUpdated && (
                  <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>
                    업데이트: {lastUpdated.toLocaleString()}
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
