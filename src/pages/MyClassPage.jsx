// src/pages/MyClassPage.jsx
import { useEffect, useState } from "react";
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

  // ───────────────────────────────────────────────
  // ✅ localStorage 변화 감지 (아이 변경 페이지 없어도 반영되게)
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

    // 혹시 이름이 비어있으면 students에서 조회
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

    // ✅ 탭 안의 하위 컴포넌트들이 localStorage를 기준으로 다시 읽게 유도
    // (필요하면 CommentPage/BooksPage 쪽에서 studentId를 useEffect deps로 읽도록 추가하면 더 완벽)
  };

  const shell = {
    maxWidth: 980,
    margin: "0 auto",
    padding: 16,
  };

  const card = {
    border: "1px solid #e5e7eb",
    borderRadius: 14,
    background: "white",
    boxShadow: "0 6px 18px rgba(0,0,0,0.06)",
  };

  const tabBtn = (active) => ({
    padding: "10px 14px",
    borderRadius: 12,
    border: "1px solid " + (active ? "#2563eb" : "#e5e7eb"),
    background: active ? "#2563eb" : "#f9fafb",
    color: active ? "white" : "#111827",
    cursor: "pointer",
    fontWeight: 900,
    fontSize: 14,
  });

  return (
    <div style={shell}>
      {/* 헤더 + 아이 선택 */}
      <div style={{ ...card, padding: 14, marginBottom: 14 }}>
        <div
          style={{
            display: "flex",
            gap: 10,
            alignItems: "center",
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ fontSize: 22, fontWeight: 900 }}>📚 내 아이 수업 현황</div>
            <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
              {selectedStudentName
                ? `현재 선택: ${selectedStudentName}`
                : "학생 선택이 필요합니다."}
            </div>
          </div>

          {children.length > 0 && (
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 12, color: "#6b7280" }}>아이 선택</span>
              <select
                value={selectedStudentId}
                onChange={(e) => changeChild(e.target.value)}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                  background: "white",
                  fontWeight: 900,
                  cursor: "pointer",
                  minWidth: 180,
                }}
              >
                {children.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>

              {/* 필요하면 아이 변경 페이지로도 이동 가능 */}
              <button
                onClick={() => (window.location.hash = "#/select-child")}
                style={{
                  padding: "10px 12px",
                  borderRadius: 12,
                  border: "1px solid #d1d5db",
                  background: "#f3f4f6",
                  cursor: "pointer",
                  fontWeight: 900,
                }}
              >
                아이 변경
              </button>
            </div>
          )}
        </div>

        {/* 탭 버튼 */}
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          <button onClick={() => setTab("comments")} style={tabBtn(tab === "comments")}>
            📝 코멘트
          </button>
          <button onClick={() => setTab("books")} style={tabBtn(tab === "books")}>
            ✅ 문제집
          </button>
        </div>
      </div>

      {/* 컨텐츠 */}
      <div style={{ ...card, padding: 14 }}>
        {tab === "comments" && <CommentPage key={`comments_${selectedStudentId}`} />}
        {tab === "books" && <BooksPage key={`books_${selectedStudentId}`} />}
      </div>
    </div>
  );
}
