import React, { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import { collection, onSnapshot, query, where } from "firebase/firestore";

export default function BooksPage() {
  const [books, setBooks] = useState([]);
  const [sortKey, setSortKey] = useState(""); // grade | title | completedDate
  const [selectedYear, setSelectedYear] = useState(null); // null = 최초상태, "" = 전체보기
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

  // ✅ books 불러오기
  useEffect(() => {
    if (!studentId) return;
    const ref = query(collection(db, "books"), where("studentId", "==", studentId));
    return onSnapshot(ref, (qs) => {
      const myBooks = qs.docs.map((d) => ({ id: d.id, ...d.data() }));
      setBooks(myBooks);
    });
  }, [studentId]);

  // ✅ completedDate에서 연도 목록 추출
  const availableYears = useMemo(() => {
    const years = books
      .map((b) => {
        const date = String(b.completedDate || "");
        return /^\d{4}-\d{2}-\d{2}$/.test(date) ? date.slice(0, 4) : null;
      })
      .filter(Boolean);

    return [...new Set(years)].sort((a, b) => Number(b) - Number(a)); // 최신년도부터
  }, [books]);

  // ✅ 최초 1회만 최신 연도 자동 선택
  useEffect(() => {
    if (selectedYear === null && availableYears.length > 0) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  // ✅ 선택한 연도가 사라졌을 때만 최신 연도로 보정
  useEffect(() => {
    if (selectedYear === null || selectedYear === "") return;
    if (availableYears.length === 0) return;
    if (!availableYears.includes(selectedYear)) {
      setSelectedYear(availableYears[0]);
    }
  }, [availableYears, selectedYear]);

  // ✅ 선택 연도 기준 필터
  const filteredBooks = useMemo(() => {
    if (selectedYear === null) return [];
    if (selectedYear === "") return books; // 전체 보기

    return books.filter((b) => {
      const date = String(b.completedDate || "");
      return date.startsWith(selectedYear);
    });
  }, [books, selectedYear]);

  // ✅ 정렬
  const sortedBooks = useMemo(() => {
    const arr = [...filteredBooks];

    if (!sortKey) {
      // 기본은 완료일 빠른 순
      return arr.sort((a, b) => {
        const ad = String(a.completedDate || "9999-99-99");
        const bd = String(b.completedDate || "9999-99-99");
        return ad.localeCompare(bd);
      });
    }

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
        const ad = String(a.completedDate || "9999-99-99");
        const bd = String(b.completedDate || "9999-99-99");
        return ad.localeCompare(bd);
      }
      return 0;
    });
  }, [filteredBooks, sortKey]);

  // ✅ 현재 선택 연도의 index
  const currentYearIndex = useMemo(() => {
    if (!selectedYear) return -1;
    return availableYears.findIndex((y) => y === selectedYear);
  }, [availableYears, selectedYear]);

  const goPrevYear = () => {
    if (selectedYear === "" || selectedYear === null) return;
    if (currentYearIndex < availableYears.length - 1) {
      setSelectedYear(availableYears[currentYearIndex + 1]);
    }
  };

  const goNextYear = () => {
    if (selectedYear === "" || selectedYear === null) return;
    if (currentYearIndex > 0) {
      setSelectedYear(availableYears[currentYearIndex - 1]);
    }
  };

  const goLatestYear = () => {
    if (availableYears.length > 0) {
      setSelectedYear(availableYears[0]);
    }
  };

  // ✅ CSV 다운로드
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
    a.download = `문제집목록_${selectedYear || "전체"}_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const styles = {
    page: {
      maxWidth: 980,
      margin: "0 auto",
      padding: isMobile ? "16px 12px 60px" : "28px 14px 60px",
    },
    titleRow: {
      display: "flex",
      justifyContent: "space-between",
      alignItems: "center",
      gap: 10,
      flexWrap: "wrap",
      marginBottom: 12,
    },
    title: { fontSize: isMobile ? 18 : 22, fontWeight: 900, marginBottom: 0 },
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
    btnDisabled: {
      opacity: 0.4,
      cursor: "not-allowed",
    },
    pill: {
      fontSize: 12,
      padding: "4px 10px",
      borderRadius: 999,
      background: "#f3f4f6",
      color: "#374151",
    },

    // ✅ 연도 이동 바
    yearBar: {
      display: "flex",
      alignItems: "center",
      gap: 10,
      padding: isMobile ? "8px 10px" : "10px 14px",
      borderRadius: 14,
      background: "#f8fafc",
      border: "1px solid #e5e7eb",
      flexWrap: "wrap",
    },
    yearBtn: {
      width: 34,
      height: 34,
      borderRadius: 999,
      border: "1px solid #d1d5db",
      background: "#fff",
      fontSize: 16,
      fontWeight: 900,
      cursor: "pointer",
    },
    yearText: {
      minWidth: 92,
      textAlign: "center",
      fontSize: isMobile ? 15 : 16,
      fontWeight: 900,
      color: "#111827",
    },
    yearAllBtn: {
      height: 34,
      padding: "0 12px",
      borderRadius: 999,
      border: "1px solid #d1d5db",
      background: "#fff",
      fontSize: 13,
      fontWeight: 800,
      cursor: "pointer",
    },
    yearAllBtnActive: {
      background: "#2563eb",
      color: "#fff",
      border: "1px solid #2563eb",
    },
    yearLatestBtn: {
      height: 34,
      padding: "0 12px",
      borderRadius: 999,
      border: "1px solid #d1d5db",
      background: "#fff",
      fontSize: 13,
      fontWeight: 800,
      cursor: "pointer",
    },
    yearLatestBtnActive: {
      background: "#eff6ff",
      color: "#1d4ed8",
      border: "1px solid #bfdbfe",
    },

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

  const isPrevDisabled =
    selectedYear === "" ||
    selectedYear === null ||
    currentYearIndex === availableYears.length - 1 ||
    availableYears.length === 0;

  const isNextDisabled =
    selectedYear === "" ||
    selectedYear === null ||
    currentYearIndex <= 0 ||
    availableYears.length === 0;

  return (
    <div style={styles.page}>
      <div style={styles.titleRow}>
        <div style={styles.title}>
          📚 문제집 관리{" "}
          <span style={styles.pill}>
            {selectedYear === ""
              ? `전체 · 총 ${sortedBooks.length}개`
              : selectedYear
              ? `${selectedYear}년 · 총 ${sortedBooks.length}개`
              : "불러오는 중..."}
          </span>
        </div>

        <div style={styles.yearBar}>
          <button
            style={{
              ...styles.yearAllBtn,
              ...(selectedYear === "" ? styles.yearAllBtnActive : {}),
            }}
            onClick={() => setSelectedYear("")}
          >
            전체
          </button>

          <button
            style={{
              ...styles.yearLatestBtn,
              ...(selectedYear !== "" && selectedYear === availableYears[0]
                ? styles.yearLatestBtnActive
                : {}),
            }}
            onClick={goLatestYear}
            disabled={availableYears.length === 0}
          >
            최신년도
          </button>

          <button
            style={{
              ...styles.yearBtn,
              ...(isPrevDisabled ? styles.btnDisabled : {}),
            }}
            onClick={goPrevYear}
            disabled={isPrevDisabled}
          >
            ‹
          </button>

          <div style={styles.yearText}>
            {selectedYear === "" ? "전체 보기" : selectedYear ? `${selectedYear}년` : "-"}
          </div>

          <button
            style={{
              ...styles.yearBtn,
              ...(isNextDisabled ? styles.btnDisabled : {}),
            }}
            onClick={goNextYear}
            disabled={isNextDisabled}
          >
            ›
          </button>
        </div>
      </div>

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

      {selectedYear === null ? (
        <div style={styles.empty}>데이터를 불러오는 중입니다.</div>
      ) : sortedBooks.length === 0 ? (
        <div style={styles.empty}>
          {selectedYear === "" ? "등록된 데이터가 없습니다." : "해당 연도에 등록된 데이터가 없습니다."}
        </div>
      ) : isMobile ? (
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
                  <td style={styles.td}>{b.title || ""}</td>
                  <td style={styles.td}>{b.completedDate || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}