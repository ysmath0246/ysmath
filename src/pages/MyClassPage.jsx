// src/pages/MyClassPage.jsx
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

import BooksPage from "./BooksPage";
import CommentPage from "./CommentsPage";

export default function MyClassPage() {
  const [tab, setTab] = useState("comments");

  const parentPhone = localStorage.getItem("parentPhone") || "";

  // ✅ 현재 선택된 아이 (localStorage 연동)
  const [selectedStudentId, setSelectedStudentId] = useState(
    localStorage.getItem("studentId") || ""
  );
  const [selectedStudentName, setSelectedStudentName] = useState(
    (localStorage.getItem("studentName") || "").trim()
  );

  // ✅ 부모의 자녀 목록
  const [children, setChildren] = useState([]); // [{id,name}]

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

  // ───────────────────────────────────────────────
  // ✅ localStorage 변화 감지 (아이 변경 반영)
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
  // ✅ 부모 children 불러오기
  useEffect(() => {
    (async () => {
      if (!parentPhone) return;

      try {
        const pSnap = await getDoc(doc(db, "parents", parentPhone));
        if (!pSnap.exists()) {
          setChildren([]);
          return;
        }

        const childIds = pSnap.data()?.children || [];
        const items = [];

        for (const cid of childIds) {
          try {
            const sSnap = await getDoc(doc(db, "students", cid));
            const name = sSnap.exists()
              ? (sSnap.data()?.name || "").toString().trim()
              : "";
            items.push({ id: cid, name: name || "이름없음" });
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
  // ✅ 드롭다운에서 아이 변경
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
  // styles
  const shell = useMemo(
    () => ({
      maxWidth: 980,
      margin: "0 auto",
      padding: isMobile ? 10 : 16,
    }),
    [isMobile]
  );

  const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    background: "white",
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
  };

  const tabBtn = (active) => ({
    padding: isMobile ? "10px 12px" : "10px 14px",
    borderRadius: 12,
    border: "1px solid " + (active ? "#2563eb" : "#e5e7eb"),
    background: active ? "#2563eb" : "#f9fafb",
    color: active ? "white" : "#111827",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 14,
    // ✅ 모바일에서 2개 버튼이 반반으로 딱 떨어지게
    width: isMobile ? "calc(50% - 4px)" : "auto",
  });

  const label = {
    fontSize: 12,
    color: "#6b7280",
    fontWeight: 800,
    whiteSpace: "nowrap",
  };

  const selectStyle = {
    padding: isMobile ? "12px 12px" : "10px 12px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    background: "white",
    fontWeight: 900,
    cursor: "pointer",
    width: isMobile ? "100%" : 220,
    minWidth: isMobile ? "auto" : 180,
  };

  const actionBtn = {
    padding: isMobile ? "12px 12px" : "10px 12px",
    borderRadius: 12,
    border: "1px solid #d1d5db",
    background: "#f3f4f6",
    cursor: "pointer",
    fontWeight: 900,
    width: isMobile ? "100%" : "auto",
  };

  return (
    <div style={shell}>
      {/* 헤더 + 아이 선택 */}
      <div style={{ ...card, padding: isMobile ? 12 : 14, marginBottom: 12 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: isMobile ? "stretch" : "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
            flexDirection: isMobile ? "column" : "row",
          }}
        >
          {/* 왼쪽 타이틀 */}
          <div>
            <div style={{ fontSize: isMobile ? 18 : 22, fontWeight: 900 }}>
              📚 내 아이 수업 현황
            </div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              {selectedStudentName
                ? `현재 선택: ${selectedStudentName}`
                : "학생 선택이 필요합니다."}
            </div>
          </div>

          {/* 오른쪽(모바일에서는 아래로 스택) */}
          {children.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 8,
                alignItems: isMobile ? "stretch" : "center",
                flexDirection: isMobile ? "column" : "row",
                width: isMobile ? "100%" : "auto",
              }}
            >
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={label}>아이 선택</span>
              </div>

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

              <button
                onClick={() => (window.location.hash = "#/select-child")}
                style={actionBtn}
              >
                아이 변경
              </button>
            </div>
          )}
        </div>

        {/* 탭 버튼 (모바일: 2열 딱 정리) */}
        <div
          style={{
            display: "flex",
            gap: 8,
            marginTop: 12,
            flexWrap: "wrap",
            width: "100%",
          }}
        >
          <button
            onClick={() => setTab("comments")}
            style={tabBtn(tab === "comments")}
          >
            📝 코멘트
          </button>
          <button onClick={() => setTab("books")} style={tabBtn(tab === "books")}>
            ✅ 문제집
          </button>
        </div>
      </div>

      {/* 컨텐츠 */}
      <div style={{ ...card, padding: isMobile ? 12 : 14 }}>
        {tab === "comments" && <CommentPage key={`comments_${selectedStudentId}`} />}
        {tab === "books" && <BooksPage key={`books_${selectedStudentId}`} />}
      </div>
    </div>
  );
}
