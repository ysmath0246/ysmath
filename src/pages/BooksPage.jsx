import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";

export default function BooksPage() {
  const [books, setBooks] = useState([]);
  const [sortKey, setSortKey] = useState(""); // grade | title | completedDate
  const studentId = localStorage.getItem("studentId");

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

  // ✅ books 불러오기: where(studentId==...)
  useEffect(() => {
    if (!studentId) return;
    const ref = query(collection(db, "books"), where("studentId", "==", studentId));
    return onSnapshot(ref, (qs) => {
      const myBooks = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBooks(myBooks);
    });
  }, [studentId]);

  // ✅ 정렬
  const sortedBooks = useMemo(() => {
    if (!sortKey) return books;

    const arr = [...books];
    return arr.sort((a, b) => {
      if (sortKey === "grade") {
        const ag = Number(a.grade || 0);
        const bg = Number(b.grade || 0);
        return ag - bg;
      }
      if (sortKey === "title") {
        return String(a.title || "").localeCompare(String(b.title || ""));
      }
      if (sortKey === "completedDate") {
        // YYYY-MM-DD 문자열 기준 정렬 (없으면 뒤로)
        const ad = String(a.completedDate || "9999-99-99");
        const bd = String(b.completedDate || "9999-99-99");
        return ad.localeCompare(bd);
      }
      return 0;
    });
  }, [books, sortKey]);

  // ✅ CSV 다운로드 (이름 제외)
  const handleDownload = () => {
    const headers = ["번호", "학년", "책 제목", "완료일"];
    const rows = sortedBooks.map((b, idx) => [
      idx + 1,
      b.grade ?? "",
      (b.title || "").replaceAll("\n", " "),
      b.completedDate ?? "",
    ]);

    let csv = headers.join(",") + "\n";
    rows.forEach((r) => {
      csv += r.map((x) => `"${String(x).replaceAll('"', '""')}"`).join(",") + "\n";
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `문제집목록_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const styles = {
    page: {
      maxWidth: 980,
      margin: "0 auto",
      padding: isMobile ? "16px 12px 60px" : "28px 14px 60px",
    },
    title: { fontSize: isMobile ? 18 : 22, fontWeight: 900, marginBottom: 12 },
    toolbar: {
      display: "flex",
      flexWrap: "wrap",
      gap: 8,
      alignItems: "center",
      marginBottom: 14,
    },
    btn: {
      padding: isMobile ? "10px 12px" : "8px 12px",
      borderRadius: 12,
      border: "1px solid #e5e7eb",
      background: "#fff",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 700,
    },
    btnPrimary: {
      padding: isMobile ? "10px 12px" : "8px 12px",
      borderRadius: 12,
      border: "1px solid #2563eb",
      background: "#2563eb",
      color: "#fff",
      cursor: "pointer",
      fontSize: 13,
      fontWeight: 800,
    },
    pill: {
      fontSize: 12,
      padding: "4px 10px",
      borderRadius: 999,
      background: "#f3f4f6",
      color: "#374151",
    },

    // ✅ 모바일 카드
    list: { display: "grid", gap: 10, marginTop: 10 },
    card: {
      background: "#fff",
      border: "1px solid #eef2f7",
      borderRadius: 16,
      padding: 12,
      boxShadow: "0 6px 18px rgba(15, 23, 42, 0.06)",
    },
    bookTitle: { fontSize: 15, fontWeight: 900, color: "#0f172a" },
    metaRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8, alignItems: "center" },
    meta: {
      fontSize: 12,
      padding: "4px 10px",
      borderRadius: 999,
      background: "#eff6ff",
      border: "1px solid #dbeafe",
      color: "#1d4ed8",
    },
    metaGray: {
      fontSize: 12,
      padding: "4px 10px",
      borderRadius: 999,
      background: "#f3f4f6",
      color: "#374151",
    },

    // ✅ PC 테이블
    tableWrap: {
      overflowX: "auto",
      borderRadius: 14,
      border: "1px solid #eef2f7",
      marginTop: 14,
      background: "#fff",
    },
    table: { width: "100%", borderCollapse: "separate", borderSpacing: 0, minWidth: 640 },
    th: {
      textAlign: "left",
      fontSize: 12,
      color: "#6b7280",
      padding: "12px 12px",
      borderBottom: "1px solid #eef2f7",
      background: "#f8fafc",
    },
    td: { fontSize: 13, padding: "12px 12px", borderBottom: "1px solid #f1f5f9" },

    empty: { padding: 16, textAlign: "center", color: "#6b7280", fontSize: 14 },
  };

  return (
    <div style={styles.page}>
      <div style={styles.title}>📚 문제집 관리 <span style={styles.pill}>총 {books.length}개</span></div>

      <div style={styles.toolbar}>
        <button style={styles.btnPrimary} onClick={handleDownload}>
          엑셀(CSV) 다운로드
        </button>
        <button style={styles.btn} onClick={() => setSortKey("grade")}>
          학년 정렬
        </button>
        <button style={styles.btn} onClick={() => setSortKey("title")}>
          문제집 정렬
        </button>
        <button style={styles.btn} onClick={() => setSortKey("completedDate")}>
          완료일 정렬
        </button>
        <button style={styles.btn} onClick={() => setSortKey("")}>
          정렬 해제
        </button>
      </div>

      {sortedBooks.length === 0 ? (
        <div style={styles.empty}>등록된 데이터가 없습니다.</div>
      ) : isMobile ? (
        // ✅ 모바일: 카드형 (이름 컬럼 없음)
        <div style={styles.list}>
          {sortedBooks.map((b, idx) => (
            <div key={b.id} style={styles.card}>
              <div style={styles.bookTitle}>
                {idx + 1}. {b.title || "-"}
              </div>

              <div style={styles.metaRow}>
                <span style={styles.meta}>학년: {b.grade ?? "-"}</span>
                <span style={styles.metaGray}>완료일: {b.completedDate || "-"}</span>
              </div>
            </div>
          ))}
        </div>
      ) : (
        // ✅ PC: 표 (이름 컬럼 제거)
        <div style={styles.tableWrap}>
          <table style={styles.table}>
            <thead>
              <tr>
                <th style={styles.th}>번호</th>
                <th style={styles.th}>학년</th>
                <th style={styles.th}>책 제목</th>
                <th style={styles.th}>완료일</th>
              </tr>
            </thead>
            <tbody>
              {sortedBooks.map((b, idx) => (
                <tr key={b.id}>
                  <td style={styles.td}>{idx + 1}</td>
                  <td style={styles.td}>{b.grade ?? ""}</td>
                  <td style={styles.td}>{b.title}</td>
                  <td style={styles.td}>{b.completedDate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
