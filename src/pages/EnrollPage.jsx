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
  // 상단 탭: "elementary" | "middle" | "middleClinic" | "operation"
  const [group, setGroup] = useState("elementary");

  // studentId / 이름
  const [studentId, setStudentId] = useState("");
  const [studentName, setStudentName] = useState("");

  // 표에서 클릭한 현재 커서 슬롯
  const [cursor, setCursor] = useState(null); // { day, time } | null

  // 선택 상태 (화면 아래 "신청 선택" 칩)
  const [selectedApplied, setSelectedApplied] = useState([]); // [{day,time,status?}]

  // 인원수 집계 (enrollments 컬렉션 기준)
  const [countsApplied, setCountsApplied] = useState({}); // key: `${day}|${time}` -> applied(정원)
  const [countsReserve, setCountsReserve] = useState({}); // 예비

  // 저장된 문서 실시간 표시용 (enrollments_by_student/{학생이름})
  const [savedApplied, setSavedApplied] = useState([]); // [{day,time,group,status,label}]
  const [lastUpdated, setLastUpdated] = useState(null);

  // ✅ 수강신청 전체 설정 (열림 / 예비만 / 완전마감)
  const [enrollConfig, setEnrollConfig] = useState({
    isOpen: true, // true면 접수 중, false면 완전 마감
    reserveOnly: false, // true면 "예비만 접수"
  });

  // ✅ 연산반 희망조사 상태
  const operationOptions = [
    {
      id: "opt1",
      label: "연산반(화·수·목) + 수업 1번(주 1회) 13 + 13 = 26만원",
    },
    {
      id: "opt2",
      label: "연산반(화·수·목) + 수업 2번(주 2회) 13 + 25 = 38만원",
    },
    {
      id: "opt3",
      label: "연산반(화·수·목)만 : 15만원",
    },
  ];
  const labelByOperationId = operationOptions.reduce((acc, o) => {
    acc[o.id] = o.label;
    return acc;
  }, {});

  const [operationChoice, setOperationChoice] = useState(""); // 현재 선택
  const [savedOperation, setSavedOperation] = useState(null); // {studentId, studentName, choice, updatedAt}

  // ✅ 중등부 클리닉 (정기/보강 + A/B반)
  const weekdays = ["월", "화", "수", "목", "금"];
  const CLINIC_BLOCKS = [
    { id: "A", label: "A반 (5시 ~ 7시)", timeRange: "5시 ~ 7시" },
    { id: "B", label: "B반 (7시 ~ 9시)", timeRange: "7시 ~ 9시" },
  ];
  const CLINIC_REGULAR_LIMIT = 5; // 정기클리닉 정원
  const CLINIC_EXTRA_LIMIT = 3; // 보강클리닉 추가 정원

  const [clinicRegular, setClinicRegular] = useState(null); // {day, blockId}
  const [clinicExtra, setClinicExtra] = useState(null); // {day, blockId}
  const [clinicCountsRegular, setClinicCountsRegular] = useState({}); // key: `${day}|${blockId}`
  const [clinicCountsExtra, setClinicCountsExtra] = useState({});
  const [savedClinic, setSavedClinic] = useState(null); // {regular, extra, ...}

  // 시간표
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
    elementary: "초등부",
    middle: "중등부",
    middleClinic: "중등부 클리닉(정기/보강)",
    operation: "연산반 희망조사",
  };

  // 연산반/클리닉 탭일 때는 시간표를 사용하지 않음
  const currentTable =
    group === "elementary" || group === "middle" ? schedules[group] : null;

  // ====== 공통 헬퍼 ======
  const keyOf = (d, t) => `${d}|${t}`;
  const existsIn = (arr, d, t) => arr.some((s) => s.day === d && s.time === t);
  const clinicKey = (day, blockId) => `${day}|${blockId}`;

  const isRegularFull = (day, blockId, ignoreSelf = false) => {
    const k = clinicKey(day, blockId);
    let count = clinicCountsRegular[k] || 0;

    if (
      ignoreSelf &&
      savedClinic?.regular &&
      savedClinic.regular.day === day &&
      savedClinic.regular.blockId === blockId
    ) {
      // 이미 그 자리에 있던 학생이면 1명은 자기라서 여유 1명 있다고 보는 효과
      count -= 1;
    }
    return count >= CLINIC_REGULAR_LIMIT;
  };

  const isExtraFull = (day, blockId, ignoreSelf = false) => {
    const k = clinicKey(day, blockId);
    let count = clinicCountsExtra[k] || 0;

    if (
      ignoreSelf &&
      savedClinic?.extra &&
      savedClinic.extra.day === day &&
      savedClinic.extra.blockId === blockId
    ) {
      count -= 1;
    }
    return count >= CLINIC_EXTRA_LIMIT;
  };

  // ====== 초기: studentId로 학생 이름 1회 조회 ======
  useEffect(() => {
    const sid = localStorage.getItem("studentId");
    if (!sid) return;
    setStudentId(sid);
    getDoc(doc(db, "students", sid))
      .then((snap) => {
        const data = snap.data();
        if (data?.name) setStudentName(String(data.name));
      })
      .catch(() => {});
  }, []);

  // (A-1) 수강신청 설정 실시간 (settings/enrollments)
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
      (err) => {
        console.error("수강신청 설정 구독 오류:", err);
      }
    );
    return () => unsub();
  }, []);

  // (B) 신청/예비 인원 수 실시간 구독 (현재 group이 elementary/middle일 때만 의미 있음)
  useEffect(() => {
    if (group === "operation" || group === "middleClinic") {
      setCountsApplied({});
      setCountsReserve({});
      return;
    }

    const qAll = query(
      collection(db, "enrollments"),
      where("group", "==", group)
    );
    const unsub = onSnapshot(qAll, (snap) => {
      const applied = {};
      const reserve = {};
      snap.forEach((d) => {
        const data = d.data();
        const key = `${data.day}|${data.time}`;

        if (data.status === "reserve") {
          reserve[key] = (reserve[key] || 0) + 1;
        } else if (data.status === "waitlist") {
          // 예전 '대기' 데이터는 무시
          return;
        } else {
          // status 없거나 "applied" → 신청(정원)
          applied[key] = (applied[key] || 0) + 1;
        }
      });
      setCountsApplied(applied);
      setCountsReserve(reserve);
    });
    return () => unsub();
  }, [group]);

  // (C) 학생 이름이 결정되면 enrollments_by_student/{학생이름}를 실시간 구독
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

        // ✅ 아래 선택 칸에 바로 반영 (재접속해도 보이게)
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

  // (D) 연산반 희망조사: operation_survey/{studentId} 구독
  useEffect(() => {
    if (!studentId) {
      setSavedOperation(null);
      setOperationChoice("");
      return;
    }

    const ref = doc(db, "operation_survey", studentId);
    const unsub = onSnapshot(ref, (snap) => {
      if (snap.exists()) {
        const data = snap.data();
        setSavedOperation(data);
        setOperationChoice(data.choice || "");
      } else {
        setSavedOperation(null);
        setOperationChoice("");
      }
    });

    return () => unsub();
  }, [studentId]);

  // (E) 중등부 클리닉: middle_clinic_days/{studentId} 구독
  useEffect(() => {
    if (!studentId) {
      setSavedClinic(null);
      setClinicRegular(null);
      setClinicExtra(null);
      return;
    }

    const ref = doc(db, "middle_clinic_days", studentId);
    const unsub = onSnapshot(ref, (snap) => {
      if (!snap.exists()) {
        setSavedClinic(null);
        setClinicRegular(null);
        setClinicExtra(null);
        return;
      }
      const data = snap.data() || {};
      setSavedClinic(data);
      setClinicRegular(data.regular || null);
      setClinicExtra(data.extra || null);
    });

    return () => unsub();
  }, [studentId]);

  // (F) 중등부 클리닉 전체 인원 집계 (정기/보강 각각)
  useEffect(() => {
    const qAll = collection(db, "middle_clinic_days");
    const unsub = onSnapshot(qAll, (snap) => {
      const regCounts = {};
      const extraCounts = {};

      snap.forEach((d) => {
        const data = d.data() || {};
        if (data.regular && data.regular.day && data.regular.blockId) {
          const k = clinicKey(data.regular.day, data.regular.blockId);
          regCounts[k] = (regCounts[k] || 0) + 1;
        }
        if (data.extra && data.extra.day && data.extra.blockId) {
          const k = clinicKey(data.extra.day, data.extra.blockId);
          extraCounts[k] = (extraCounts[k] || 0) + 1;
        }
      });

      setClinicCountsRegular(regCounts);
      setClinicCountsExtra(extraCounts);
    });

    return () => unsub();
  }, []);

  // ====== 초등부/중등부 시간 선택 로직 ======

  // 초등부: 표에서 직접 두 개까지 선택 + 조합(월/수, 화/목, 수/금) 강제
  const toggleElementarySlot = (day, time) => {
    const validPairs = [
      ["월", "수"],
      ["화", "목"],
      ["수", "금"],
    ];

    // 이미 선택되어 있으면 제거
    if (existsIn(selectedApplied, day, time)) {
      setSelectedApplied(
        selectedApplied.filter((s) => !(s.day === day && s.time === time))
      );
      return;
    }

    // ⭐ 0개 선택된 상태 → 첫 번째 선택은 항상 허용
    if (selectedApplied.length === 0) {
      setSelectedApplied([{ day, time }]);
      return;
    }

    // ⭐ 1개 선택된 상태
    if (selectedApplied.length === 1) {
      const first = selectedApplied[0];

      // 같은 요일이면 시간만 교체
      if (first.day === day) {
        setSelectedApplied([{ day, time }]);
        return;
      }

      // 두 요일 조합이 유효한지 검사
      const sortedDays = [first.day, day].sort().join("");
      const isValid = validPairs.some(
        (pair) => pair.slice().sort().join("") === sortedDays
      );

      if (!isValid) {
        alert("초등부는 '월/수', '화/목', '수/금' 조합만 선택할 수 있습니다.");
        return;
      }

      // 유효하면 두 번째 요일 추가
      setSelectedApplied([first, { day, time }]);
      return;
    }

    // ⭐ 이미 2개 선택된 상태
    if (selectedApplied.length >= 2) {
      // 같은 요일이면 시간만 교체 허용
      const idxSameDay = selectedApplied.findIndex((s) => s.day === day);
      if (idxSameDay !== -1) {
        const next = [...selectedApplied];
        next[idxSameDay] = { day, time };
        setSelectedApplied(next);
        return;
      }

      // 제3의 요일을 추가하려는 경우 → 허용 안 함
      alert("초등부는 한 번에 '월/수', '화/목', '수/금' 한 조합만 선택할 수 있습니다.");
      return;
    }
  };

  // 중등부: 요일 제한 없이 최대 2개까지 선택 (표 클릭만으로 토글)
  const toggleMiddleSlot = (day, time) => {
    // 이미 선택되어 있으면 제거
    if (existsIn(selectedApplied, day, time)) {
      setSelectedApplied(
        selectedApplied.filter((s) => !(s.day === day && s.time === time))
      );
      return;
    }

    // 최대 2개 제한
    if (selectedApplied.length >= 2) {
      alert("중등부는 신청 시간대를 최대 2개까지만 선택할 수 있습니다.");
      return;
    }

    // 그냥 추가 (요일 제한 없음)
    setSelectedApplied([...selectedApplied, { day, time }]);
  };

  const removeApplied = (day, time) =>
    setSelectedApplied(
      selectedApplied.filter((s) => !(s.day === day && s.time === time))
    );

  // ====== 중등부 클리닉 선택/저장 로직 ======
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

  const handleSelectExtraDay = (day) => {
    setClinicExtra((prev) => ({
      day,
      blockId: prev?.blockId || "A",
    }));
  };

  const handleSelectExtraBlock = (blockId) => {
    if (!clinicExtra?.day) {
      alert("먼저 요일을 선택해 주세요.");
      return;
    }
    setClinicExtra((prev) => ({
      ...(prev || { day: weekdays[0] }),
      blockId,
    }));
  };

  // 정기 클리닉 저장
  const saveRegularClinic = async () => {
    if (!studentId || !studentName.trim()) {
      alert("학생 정보 로딩 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (!clinicRegular || !clinicRegular.day || !clinicRegular.blockId) {
      alert("정기 클리닉 요일과 반(A/B)을 선택해 주세요.");
      return;
    }

    const { day, blockId } = clinicRegular;

    if (isRegularFull(day, blockId, true)) {
      alert("해당 요일/반의 정기 클리닉 정원이 마감되었습니다.");
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
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();
    alert("정기 클리닉 신청이 저장되었습니다.");
  };

  // 보강(추가) 클리닉 저장
  const saveExtraClinic = async () => {
    if (!studentId || !studentName.trim()) {
      alert("학생 정보 로딩 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (!clinicExtra || !clinicExtra.day || !clinicExtra.blockId) {
      alert("보강 클리닉 요일과 반(A/B)을 선택해 주세요.");
      return;
    }

    const { day, blockId } = clinicExtra;

    if (isExtraFull(day, blockId, true)) {
      alert("해당 요일/반의 보강 클리닉 정원이 마감되었습니다.");
      return;
    }

    const batch = writeBatch(db);
    const ref = doc(db, "middle_clinic_days", studentId);

    batch.set(
      ref,
      {
        studentId,
        studentName: studentName.trim(),
        extra: { day, blockId },
        updatedAt: serverTimestamp(),
      },
      { merge: true }
    );

    await batch.commit();
    alert("보강 클리닉(추가) 신청이 저장되었습니다.");
  };

  // ====== 수강신청 저장 (enrollments / enrollments_by_student) ======
  const saveSelections = async () => {
    if (group === "operation" || group === "middleClinic") return; // 연산/클리닉 탭에서는 사용 안 함

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

    // 저장용 변수 (초등/중등 공통 틀)
    let appliedForSave = [...selectedApplied];

    // 에러 누적
    let hasError = false;
    let errorMsg = "";

    // ⭐ 초등부 요일 개수 & 인원에 따른 status 자동 배정
    if (group === "elementary") {
      const selectedDays = selectedApplied.map((s) => s.day); // ex: ["월","수"]

      if (selectedDays.length !== 2) {
        alert(
          "초등부는 요일 2개를 선택해 주세요. (월/수, 화/목, 수/금 중 한 조합)"
        );
        return;
      }

      const nextApplied = [];

      selectedApplied.forEach(({ day, time }) => {
        const k = keyOf(day, time);
        const currentApplied = countsApplied[k] || 0; // 이미 확정 신청된 인원 수
        const currentReserve = countsReserve[k] || 0; // 이미 예비 인원 수

        let status;

        // 🌟 '예비만' 상태일 때는 무조건 예비로만 (10명까지)
        if (enrollConfig.reserveOnly) {
          if (currentReserve >= 10) {
            hasError = true;
            errorMsg += `${day} ${time} 시간은 예비 신청이 모두 마감되었습니다.\n`;
            return;
          }
          status = "reserve";
        } else {
          // 정상 접수: 6명까지 신청, 그 이후 예비(10명까지)
          if (currentApplied < 6) {
            status = "applied"; // 정원
          } else if (currentReserve < 10) {
            status = "reserve"; // 예비
          } else {
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
    }
    // ⭐ 중등부: 요일 제한 없이 인원에 따라 status 자동 배정
    else if (group === "middle") {
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
          if (currentApplied < 6) {
            status = "applied";
          } else if (currentReserve < 10) {
            status = "reserve";
          } else {
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
    }

    const batch = writeBatch(db);

    // 1) 학생별 요약문서(enrollments_by_student/{학생이름}) 덮어쓰기
    const refStudent = doc(db, "enrollments_by_student", studentName.trim());
    batch.set(refStudent, {
      studentName: studentName.trim(),
      applied: appliedForSave.map(({ day, time, status }) => ({
        day,
        time,
        group,
        status: status === "reserve" ? "reserve" : "applied", // applied | reserve
        label: status === "reserve" ? "신청(예비)" : "신청",
      })),
      // ✅ 대기 제도 폐지 → 빈 배열로 덮어쓰기
      waitlist: [],
      updatedAt: serverTimestamp(),
    });

    // 2) 이 학생의 기존 enrollments 엔트리 모두 삭제
    const qMe = query(
      collection(db, "enrollments"),
      where("studentName", "==", studentName.trim())
    );
    const prev = await getDocs(qMe);
    prev.forEach((snap) => batch.delete(snap.ref));

    // 3) 새 선택을 enrollments에 재기록 (인원수 실시간 집계용)
    appliedForSave.forEach(({ day, time, status }) => {
      const safeStatus = status === "reserve" ? "reserve" : "applied";
      const id = `${studentName.trim()}|${group}|${day}|${time}|${safeStatus}`;
      const r = doc(db, "enrollments", id);
      batch.set(r, {
        studentName: studentName.trim(),
        group,
        day,
        time,
        status: safeStatus, // applied | reserve
        createdAt: serverTimestamp(),
      });
    });

    await batch.commit();

    // ✅ 저장 직후, 아래 선택칸에도 바로 반영
    setSelectedApplied(appliedForSave);

    alert("저장되었습니다.");
  };

  // ====== 연산반 희망조사 저장 (operation_survey/{studentId}) ======
  const saveOperationSurvey = async () => {
    if (!studentId || !studentName.trim()) {
      alert("학생 정보 로딩 중입니다. 잠시 후 다시 시도해 주세요.");
      return;
    }
    if (!operationChoice) {
      alert("연산반 희망 옵션을 선택해 주세요.");
      return;
    }

    const batch = writeBatch(db);
    const ref = doc(db, "operation_survey", studentId);

    batch.set(ref, {
      studentId,
      studentName: studentName.trim(),
      choice: operationChoice,
      updatedAt: serverTimestamp(),
    });

    await batch.commit();
    alert("연산반 희망 조사가 저장되었습니다.");
  };

  // ====== 렌더 ======
  return (
    <div style={{ padding: 16 }}>
      <h2 style={{ marginBottom: 12 }}>수강신청</h2>

      {/* 📌 상단 상태 뱃지 */}
      <div
        style={{
          marginBottom: 8,
          display: "flex",
          justifyContent: "flex-end",
        }}
      >
        <span
          style={{
            fontSize: 11,
            padding: "4px 10px",
            borderRadius: 999,
            border: "1px solid #e5e7eb",
            backgroundColor: enrollConfig.isOpen
              ? enrollConfig.reserveOnly
                ? "#fef3c7"
                : "#dcfce7"
              : "#fee2e2",
            color: enrollConfig.isOpen
              ? enrollConfig.reserveOnly
                ? "#92400e"
                : "#166534"
              : "#b91c1c",
          }}
        >
          {enrollConfig.isOpen ? (
            enrollConfig.reserveOnly ? (
              "현재 상태: 수강신청 마감, 예비만 접수"
            ) : (
              "현재 상태: 수강신청 접수 중"
            )
          ) : (
            "현재 상태: 수강신청 완전 마감"
          )}
        </span>
      </div>

      {/* 📌 안내문 영역 */}
      <div
        style={{
          marginBottom: 16,
          padding: 12,
          borderRadius: 8,
          border: "1px solid #e5e7eb",
          background: "#f9fafb",
          fontSize: 13,
          lineHeight: 1.5,
          color: "#374151",
        }}
      >
        <p style={{ marginBottom: 6 }}>
          이번 신청은 당장 다음 달이 아닌, <b>2026년 3월 진급 이후</b> 시간표입니다.
        </p>
        <p style={{ marginBottom: 6 }}>
          <b>초등부</b>는 <b>월/수, 화/목, 수/금</b> 중에서 한 조합을 선택해 주시면 됩니다.
          (시간표에서 요일 2개를 선택하신 뒤, 아래 <b>저장</b> 버튼을 눌러 주세요.)
        </p>
        <p style={{ marginBottom: 8 }}>
          각 시간대의 <b>정원은 6명</b>이며, 그 이후에는 <b>예비(최대 10명)</b>로만
          신청이 가능합니다. 정원 6명이 채워진 시간대에는{" "}
          <b>“신청 마감되었습니다.”</b> 문구가 표시됩니다.
        </p>

        <hr
          style={{
            border: "none",
            borderTop: "1px dashed #e5e7eb",
            margin: "8px 0",
          }}
        />

        <p style={{ marginBottom: 6 }}>
          <b>📚 중등 정규 수업 및 클리닉(추가 학습) 안내</b>
        </p>
        <p style={{ marginBottom: 6 }}>
          중등반의 <b>정규 수업</b>은 위 시간표에서 요일과 시간을 선택해 신청해 주시면 됩니다.
        </p>
        <p style={{ marginBottom: 6 }}>
          정규 수업과 별도로, 숙제 미이행 보완·학습 태도 보완·개념 반복 및 문제풀이 강화를 위해{" "}
          <b>추가로 등원하는 클리닉(추가 학습) 시간</b>이 있습니다.
        </p>
        <p style={{ marginBottom: 6 }}>
          클리닉은 <b>정기 클리닉</b>과 <b>보강(추가) 클리닉</b>으로 나뉘며,
          각 요일·반(A/B)에 대해 정기 클리닉은 <b>최대 {CLINIC_REGULAR_LIMIT}명</b>,
          보강 클리닉은 추가로 <b>{CLINIC_EXTRA_LIMIT}명</b>까지 가능합니다.
        </p>
        <p style={{ marginBottom: 8 }}>
          상단 탭의 <b>‘중등부 클리닉(정기/보강)’</b> 메뉴에서 정기/보강 클리닉을
          각각 선택·저장하실 수 있습니다.
        </p>

        <p style={{ marginBottom: 6 }}>
          <b>🧠 연산반 운영 및 수요조사 안내</b>
        </p>
        <p style={{ marginBottom: 6 }}>
          연산반은 별도로 <b>추가 운영되는 반</b>으로,
          수요 파악을 위해 상단 탭의 <b>‘연산반 희망조사’</b> 메뉴를 통해
          희망하시는 구성을 선택해 주시면 큰 도움이 됩니다.
        </p>
        <p style={{ marginBottom: 0 }}>
          항상 자녀의 성장을 함께 고민하고 노력하겠습니다.
        </p>
      </div>

      {/* 상단 탭: 초등부 / 중등부 / 중등부 클리닉 / 연산반 희망조사 */}
      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
        {["elementary", "middle", "middleClinic", "operation"].map((g) => {
          const active = group === g;
          return (
            <button
              key={g}
              onClick={() => {
                setGroup(g);
                setCursor(null);
              }}
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

      {/* ====== 연산반 희망조사 탭 ====== */}
      {group === "operation" ? (
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 12,
            background: "#fdfdfd",
          }}
        >
          <h3 style={{ marginBottom: 10, fontSize: 16 }}>연산반 희망조사</h3>
          <p style={{ fontSize: 13, color: "#4b5563", marginBottom: 6 }}>
            아래에서 희망하시는 연산반 수업 방식을 선택해 주세요.
          </p>
          <p style={{ fontSize: 13, color: "#4b5563", marginBottom: 10 }}>
            연산반은 <b>추가로 운영</b>되며, <b>화·수·목 주 3회</b> 진행됩니다.
            각 수업은 <b>50분 수업</b>으로, <b>3시 타임 / 4시 타임</b> 중에서 편성되며{" "}
            <b>최대 정원은 8명</b>입니다.
          </p>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 8,
              marginBottom: 12,
            }}
          >
            {operationOptions.map((opt) => (
              <label
                key={opt.id}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  padding: "8px 10px",
                  borderRadius: 8,
                  border:
                    operationChoice === opt.id
                      ? "1px solid #0d6efd"
                      : "1px solid #e5e7eb",
                  background: operationChoice === opt.id ? "#e7f1ff" : "#ffffff",
                  cursor: "pointer",
                  fontSize: 13,
                  color: "#111827",
                }}
              >
                <input
                  type="radio"
                  name="operation_choice"
                  value={opt.id}
                  checked={operationChoice === opt.id}
                  onChange={() => setOperationChoice(opt.id)}
                />
                <span>{opt.label}</span>
              </label>
            ))}
          </div>

          <button
            onClick={saveOperationSurvey}
            style={{
              padding: "8px 12px",
              borderRadius: 8,
              border: "1px solid #0d6efd",
              background: "#0d6efd",
              color: "#fff",
              fontWeight: 700,
              cursor: "pointer",
              marginBottom: 12,
            }}
          >
            연산반 희망 저장
          </button>

          <div
            style={{
              padding: 10,
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#f9fafb",
              fontSize: 13,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 4 }}>
              저장된 연산반 희망 {studentName ? `: ${studentName}` : ""}
            </div>
            {savedOperation ? (
              <>
                <div style={{ marginBottom: 4 }}>
                  선택:{" "}
                  <b>
                    {labelByOperationId[savedOperation.choice] ||
                      "알 수 없는 옵션"}
                  </b>
                </div>
                {savedOperation.updatedAt?.toDate && (
                  <div style={{ fontSize: 12, color: "#6b7280" }}>
                    업데이트:{" "}
                    {savedOperation.updatedAt.toDate().toLocaleString()}
                  </div>
                )}
              </>
            ) : (
              <div style={{ color: "#6b7280" }}>
                아직 저장된 연산반 희망이 없습니다.
              </div>
            )}
          </div>
        </div>
      ) : group === "middleClinic" ? (
        /* ====== 중등부 클리닉(정기/보강) 탭 ====== */
        <div
          style={{
            border: "1px solid #e5e7eb",
            borderRadius: 8,
            padding: 12,
            background: "#fdfdfd",
          }}
        >
          <h3 style={{ marginBottom: 10, fontSize: 16 }}>
            중등부 클리닉(정기 / 보강)
          </h3>
          <p style={{ fontSize: 13, color: "#4b5563", marginBottom: 6 }}>
            중등 정규 수업 외에 클리닉 시간에 추가로 등원하여 공부할 수 있습니다.
          </p>
          <p style={{ fontSize: 13, color: "#4b5563", marginBottom: 10 }}>
            <b>정기 클리닉</b>은 매주 동일한 요일/시간(5~7시, 7~9시)에 꾸준히 참여하는 클리닉이며,
            <b> 보강 클리닉</b>은 필요 시 추가로 참여하는 보충 클리닉입니다.
          </p>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr",
              gap: 16,
            }}
          >
            {/* 정기 클리닉 */}
            <div
              style={{
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                padding: 10,
                background: "#f9fafb",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  marginBottom: 8,
                  fontSize: 14,
                }}
              >
                정기 클리닉 신청 (요일 + A/B반 선택)
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  marginBottom: 8,
                }}
              >
                각 요일·반(A/B)별로 정기 클리닉 정원은{" "}
                <b>{CLINIC_REGULAR_LIMIT}명</b>입니다.
              </div>

              {/* 요일 선택 */}
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 12,
                    marginBottom: 4,
                    color: "#4b5563",
                  }}
                >
                  요일 선택
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {weekdays.map((day) => {
                    const active = clinicRegular?.day === day;
                    return (
                      <button
                        key={`reg-day-${day}`}
                        onClick={() => handleSelectRegularDay(day)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: active
                            ? "1px solid #0d6efd"
                            : "1px solid #e5e7eb",
                          background: active ? "#e7f1ff" : "#ffffff",
                          cursor: "pointer",
                          fontSize: 13,
                          minWidth: 40,
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 반 선택 */}
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 12,
                    marginBottom: 4,
                    color: "#4b5563",
                  }}
                >
                  반 선택
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {CLINIC_BLOCKS.map((b) => {
                    const active = clinicRegular?.blockId === b.id;
                    const currentKey =
                      clinicRegular?.day && b.id
                        ? clinicKey(clinicRegular.day, b.id)
                        : null;
                    const currentCount = currentKey
                      ? clinicCountsRegular[currentKey] || 0
                      : 0;
                    const full =
                      clinicRegular?.day &&
                      isRegularFull(clinicRegular.day, b.id, true);

                    return (
                      <button
                        key={`reg-block-${b.id}`}
                        onClick={() => handleSelectRegularBlock(b.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: active
                            ? "1px solid #0d6efd"
                            : "1px solid #e5e7eb",
                          background: active ? "#e7f1ff" : "#ffffff",
                          cursor: full ? "not-allowed" : "pointer",
                          fontSize: 12,
                          opacity: full ? 0.6 : 1,
                          whiteSpace: "nowrap",
                        }}
                        disabled={full}
                        title={
                          currentKey
                            ? `현재 정기 ${currentCount}명 / 정원 ${CLINIC_REGULAR_LIMIT}명`
                            : undefined
                        }
                      >
                        {b.label}
                        {currentKey && (
                          <span
                            style={{
                              marginLeft: 4,
                              fontSize: 11,
                              color: "#6b7280",
                            }}
                          >
                            ({currentCount}/{CLINIC_REGULAR_LIMIT})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={saveRegularClinic}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #0d6efd",
                  background: "#0d6efd",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                정기 클리닉 저장
              </button>

              {/* 저장된 정기 클리닉 표시 */}
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "#4b5563",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  현재 저장된 정기 클리닉
                  {studentName ? ` (${studentName})` : ""}
                </div>
                {savedClinic?.regular ? (
                  <div>
                    {savedClinic.regular.day}요일{" "}
                    {savedClinic.regular.blockId === "A"
                      ? "A반 (5시~7시)"
                      : "B반 (7시~9시)"}
                  </div>
                ) : (
                  <div style={{ color: "#9ca3af" }}>저장된 정기 클리닉이 없습니다.</div>
                )}
              </div>
            </div>

            {/* 보강(추가) 클리닉 */}
            <div
              style={{
                borderRadius: 8,
                border: "1px solid #e5e7eb",
                padding: 10,
                background: "#ffffff",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  marginBottom: 8,
                  fontSize: 14,
                }}
              >
                보강(추가) 클리닉 신청
              </div>
              <div
                style={{
                  fontSize: 12,
                  color: "#6b7280",
                  marginBottom: 8,
                }}
              >
                정기 클리닉과 별도로, 필요 시 추가로 참여하는 클리닉입니다.{" "}
                각 요일·반(A/B)별로 보강 클리닉은{" "}
                <b>최대 {CLINIC_EXTRA_LIMIT}명</b>까지 가능합니다.
              </div>

              {/* 요일 선택 */}
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 12,
                    marginBottom: 4,
                    color: "#4b5563",
                  }}
                >
                  요일 선택
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {weekdays.map((day) => {
                    const active = clinicExtra?.day === day;
                    return (
                      <button
                        key={`ex-day-${day}`}
                        onClick={() => handleSelectExtraDay(day)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: active
                            ? "1px solid #0d6efd"
                            : "1px solid #e5e7eb",
                          background: active ? "#e7f1ff" : "#ffffff",
                          cursor: "pointer",
                          fontSize: 13,
                          minWidth: 40,
                        }}
                      >
                        {day}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* 반 선택 */}
              <div style={{ marginBottom: 8 }}>
                <div
                  style={{
                    fontSize: 12,
                    marginBottom: 4,
                    color: "#4b5563",
                  }}
                >
                  반 선택
                </div>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  {CLINIC_BLOCKS.map((b) => {
                    const active = clinicExtra?.blockId === b.id;
                    const currentKey =
                      clinicExtra?.day && b.id
                        ? clinicKey(clinicExtra.day, b.id)
                        : null;
                    const currentCount = currentKey
                      ? clinicCountsExtra[currentKey] || 0
                      : 0;
                    const full =
                      clinicExtra?.day &&
                      isExtraFull(clinicExtra.day, b.id, true);

                    return (
                      <button
                        key={`ex-block-${b.id}`}
                        onClick={() => handleSelectExtraBlock(b.id)}
                        style={{
                          padding: "6px 10px",
                          borderRadius: 999,
                          border: active
                            ? "1px solid #0d6efd"
                            : "1px solid #e5e7eb",
                          background: active ? "#e7f1ff" : "#ffffff",
                          cursor: full ? "not-allowed" : "pointer",
                          fontSize: 12,
                          opacity: full ? 0.6 : 1,
                          whiteSpace: "nowrap",
                        }}
                        disabled={full}
                        title={
                          currentKey
                            ? `현재 보강 ${currentCount}명 / 정원 ${CLINIC_EXTRA_LIMIT}명`
                            : undefined
                        }
                      >
                        {b.label}
                        {currentKey && (
                          <span
                            style={{
                              marginLeft: 4,
                              fontSize: 11,
                              color: "#6b7280",
                            }}
                          >
                            ({currentCount}/{CLINIC_EXTRA_LIMIT})
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>

              <button
                onClick={saveExtraClinic}
                style={{
                  padding: "8px 12px",
                  borderRadius: 8,
                  border: "1px solid #0d6efd",
                  background: "#0d6efd",
                  color: "#fff",
                  fontWeight: 700,
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                보강 클리닉 저장
              </button>

              {/* 저장된 보강 클리닉 표시 */}
              <div
                style={{
                  marginTop: 10,
                  fontSize: 12,
                  color: "#4b5563",
                }}
              >
                <div style={{ fontWeight: 600, marginBottom: 4 }}>
                  현재 저장된 보강 클리닉
                  {studentName ? ` (${studentName})` : ""}
                </div>
                {savedClinic?.extra ? (
                  <div>
                    {savedClinic.extra.day}요일{" "}
                    {savedClinic.extra.blockId === "A"
                      ? "A반 (5시~7시)"
                      : "B반 (7시~9시)"}
                  </div>
                ) : (
                  <div style={{ color: "#9ca3af" }}>
                    저장된 보강 클리닉이 없습니다.
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* ====== 일반 수강신청 탭(초등/중등) ====== */}

          {/* 표 */}
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                minWidth: 560,
                border: "1px solid #e5e7eb",
              }}
            >
              <thead>
                <tr style={{ background: "#f8fafc" }}>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderBottom: "1px solid #e5e7eb",
                      fontWeight: 700,
                      width: 90,
                      whiteSpace: "nowrap",
                    }}
                  >
                    요일
                  </th>
                  <th
                    style={{
                      textAlign: "left",
                      padding: "10px 12px",
                      borderBottom: "1px solid #e5e7eb",
                      fontWeight: 700,
                    }}
                  >
                    시간 (신청 / 예비)
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
                          borderBottom: "1px solid #f1f59",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                        }}
                      >
                        {day}
                      </td>
                      <td
                        style={{
                          padding: "10px 12px",
                          borderBottom: "1px solid #f1f5f9",
                        }}
                      >
                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 8,
                          }}
                        >
                          {times.map((t) => {
                            const k = keyOf(day, t);
                            const appliedCnt = countsApplied[k] || 0; // 확정 신청
                            const reserveCnt = countsReserve[k] || 0; // 예비

                            const isCursor =
                              cursor && cursor.day === day && cursor.time === t;
                            const isAppliedSel = existsIn(
                              selectedApplied,
                              day,
                              t
                            );

                            const isAppliedFull = appliedCnt >= 6;
                            const isReserveFull = reserveCnt >= 10;

                            const disabledCompletely =
                              !enrollConfig.isOpen
                                ? true
                                : !enrollConfig.reserveOnly
                                ? isAppliedFull && isReserveFull
                                : isReserveFull;

                            return (
                              <button
                                key={`${day}-${t}`}
                                onClick={() => {
                                  if (!enrollConfig.isOpen) {
                                    alert("현재 수강신청이 마감되었습니다.");
                                    return;
                                  }

                                  if (!enrollConfig.reserveOnly) {
                                    // 정상 접수: 신청+예비 모두 마감된 경우만 막기
                                    if (isAppliedFull && isReserveFull) {
                                      alert(
                                        "해당 시간은 신청 및 예비가 모두 마감되었습니다."
                                      );
                                      return;
                                    }
                                  } else {
                                    // 예비만 받는 상태
                                    if (isReserveFull) {
                                      alert(
                                        "해당 시간 예비 신청이 모두 마감되었습니다."
                                      );
                                      return;
                                    }
                                  }

                                  setCursor({ day, time: t });

                                  // 초등부: 조합 제한 + 최대 2개
                                  if (group === "elementary") {
                                    toggleElementarySlot(day, t);
                                  }
                                  // 중등부: 요일 제한 없이 최대 2개
                                  else if (group === "middle") {
                                    toggleMiddleSlot(day, t);
                                  }
                                }}
                                disabled={disabledCompletely}
                                style={{
                                  padding: "8px 10px",
                                  borderRadius: 8,
                                  border: `1px solid ${
                                    isAppliedSel || isCursor
                                      ? "#0d6efd"
                                      : "#d1d5db"
                                  }`,
                                  background: isAppliedSel
                                    ? "#e7f1ff"
                                    : isCursor
                                    ? "#f3f4ff"
                                    : "#fff",
                                  color: disabledCompletely
                                    ? "#9ca3af"
                                    : "#111827",
                                  fontWeight: 600,
                                  cursor: disabledCompletely
                                    ? "not-allowed"
                                    : "pointer",
                                  whiteSpace: "nowrap",
                                  opacity: disabledCompletely ? 0.6 : 1,
                                  textAlign: "left",
                                }}
                                title={`${day} ${t}`}
                              >
                                <div>{t}</div>
                                <div
                                  style={{
                                    color: "#6b7280",
                                    fontWeight: 500,
                                    marginTop: 2,
                                    fontSize: 11,
                                  }}
                                >
                                  신청 {appliedCnt} / 예비 {reserveCnt}
                                  {isAppliedFull && (
                                    <span
                                      style={{
                                        marginLeft: 4,
                                        color: "#b91c1c",
                                      }}
                                    >
                                      신청 마감되었습니다.
                                    </span>
                                  )}
                                  {!isAppliedFull &&
                                    enrollConfig.reserveOnly && (
                                      <span
                                        style={{
                                          marginLeft: 4,
                                          color: "#92400e",
                                        }}
                                      >
                                        (예비만 접수)
                                      </span>
                                    )}
                                </div>
                                {isAppliedSel && (
                                  <div
                                    style={{
                                      marginTop: 2,
                                      fontSize: 11,
                                      color: "#0d6efd",
                                    }}
                                  >
                                    • 신청선택됨
                                  </div>
                                )}
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

          {/* 커서 대상 + 저장 버튼 */}
          <div
            style={{
              marginTop: 12,
              display: "flex",
              gap: 8,
              alignItems: "center",
              flexWrap: "wrap",
            }}
          >
            <div style={{ minWidth: 220, color: "#374151" }}>
              {cursor ? (
                <span>
                  선택 대상: <b>{cursor.day}</b> <b>{cursor.time}</b>
                </span>
              ) : (
                <span style={{ color: "#6b7280" }}>
                  표에서 시간대를 먼저 선택하세요
                </span>
              )}
            </div>

            {/* 저장 버튼 (학생이름 자동) */}
            <button
              onClick={saveSelections}
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
              저장
            </button>
          </div>

          {/* 현재 선택 목록 */}
          <div
            style={{
              marginTop: 16,
              display: "grid",
              gap: 12,
              gridTemplateColumns: "1fr",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                신청 선택(최대 2)
              </div>
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
                        border: `1px solid ${
                          status === "reserve" ? "#6c757d" : "#0d6efd"
                        }`, // 예비=회색
                        background:
                          status === "reserve" ? "#f1f1f1" : "#e7f1ff", // 예비=연회색
                        display: "inline-flex",
                        alignItems: "center",
                        gap: 8,
                      }}
                      title={status === "reserve" ? "신청(예비)" : "신청"}
                    >
                      {day} {time}
                      {status === "reserve" ? " (예비)" : ""}
                      <button
                        onClick={() => removeApplied(day, time)}
                        title="제거"
                        style={{
                          border: "none",
                          background: "transparent",
                          cursor: "pointer",
                          fontWeight: 700,
                          color:
                            status === "reserve" ? "#6c757d" : "#0d6efd",
                        }}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* 저장된 내용(실시간 표시) */}
          <div
            style={{
              marginTop: 20,
              padding: 12,
              border: "1px solid #e5e7eb",
              borderRadius: 8,
            }}
          >
            <div style={{ fontWeight: 700, marginBottom: 8 }}>
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
                        const g =
                          s.group === "elementary" ? "초등부" : "중등부";
                        const tag =
                          s.status === "reserve" ||
                          s?.label === "신청(예비)"
                            ? " (예비)"
                            : "";
                        return `${g} ${s.day} ${s.time}${tag}`;
                      })
                      .join(", ")
                  ) : (
                    <span style={{ color: "#6b7280" }}>없음</span>
                  )}
                </div>

                {lastUpdated && (
                  <div
                    style={{
                      marginTop: 6,
                      fontSize: 12,
                      color: "#6b7280",
                    }}
                  >
                    업데이트: {lastUpdated.toLocaleString()}
                  </div>
                )}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}
