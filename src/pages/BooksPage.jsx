import { useState, useEffect, useMemo } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

export default function BooksPage() {
  console.log("📚 바뀜 감지!")
  const [books, setBooks] = useState([]);
  const [sortKey, setSortKey] = useState("");
  const studentId = localStorage.getItem("studentId");

  useEffect(() => {
    const ref = collection(db, "books");
    return onSnapshot(ref, (qs) => {
     const allBooks = qs.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      const myBooks = allBooks.filter((b) => b.studentId === studentId);
      setBooks(myBooks);
    });
  }, [studentId]);

  // 정렬된 책 목록
  
  const sortedBooks = useMemo(() => {
    if (!sortKey) return books;
     const arr = [...books];
 return arr.sort((a, b) => {
   // sortKey에 따라 비교 로직…
   if (sortKey === "grade")        return a.grade - b.grade;
   else if (sortKey === "title")   return a.title.localeCompare(b.title);
   else if (sortKey === "completedDate") return a.completedDate.localeCompare(b.completedDate);
   return 0;
 });

  }, [books, sortKey]);

  const handleDownload = () => {
    const headers = ["번호", "이름", "학년", "책 제목", "완료일"];
    const rows = sortedBooks.map((b, idx) => [idx + 1, b.name, b.grade, b.title, b.completedDate]);
    let csv = headers.join(",") + "\n";
    rows.forEach((r) => {
      csv += r.join(",") + "\n";
    });

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `문제집목록_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
 <div className="container">
      <h1 style={{ fontSize: "24px", marginBottom: "20px" }}>
        📚 문제집 관리 (총 갯수: {books.length})
      </h1>

      <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "16px" }}>
        <button
          onClick={handleDownload}
          style={{
            padding: "8px 16px",
            backgroundColor: "#007bff",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          엑셀 다운로드
        </button>
        <button
          onClick={() => setSortKey("grade")}
          style={{
            padding: "8px 12px",
            marginLeft: "4px",
            backgroundColor: "#28a745",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          학년 정렬
        </button>
        <button
          onClick={() => setSortKey("title")}
          style={{
            padding: "8px 12px",
            backgroundColor: "#17a2b8",
            color: "#fff",
            border: "none",
            borderRadius: "4px",
            cursor: "pointer",
          }}
        >
          문제집 정렬
        </button>
        <button
          onClick={() => setSortKey("completedDate")}
          style={{
            padding: "8px 12px",
            backgroundColor: "#ffc107",
            color: "#000",
            border: "none",
           borderRadius: "4px",
            cursor: "pointer",
          }}
        >
         완료일 정렬
        </button>
      </div>

      <table style={{ width: "100%", borderCollapse: "collapse", marginTop: "20px" }}>
        <thead>
          <tr>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>번호</th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>이름</th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>학년</th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>책 제목</th>
            <th style={{ border: "1px solid #ccc", padding: "8px" }}>완료일</th>
          </tr>
        </thead>
        <tbody>
          {sortedBooks.length > 0 ? (
            sortedBooks.map((b, idx) => (
              <tr key={b.id}>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>{idx + 1}</td>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>{b.name}</td>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>{b.grade}</td>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>{b.title}</td>
                <td style={{ border: "1px solid #ccc", padding: "8px" }}>{b.completedDate}</td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan="5" style={{ border: "1px solid #ccc", padding: "8px", textAlign: "center" }}>
                등록된 데이터가 없습니다.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
