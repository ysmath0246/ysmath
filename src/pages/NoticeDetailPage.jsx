// src/pages/NoticeDetailPage.jsx
import { useState, useEffect } from "react";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";
import { useParams, Link } from "react-router-dom";

export default function NoticeDetailPage() {
  const { id } = useParams();
  const [notice, setNotice] = useState(null);

  useEffect(() => {
    (async () => {
      const snap = await getDoc(doc(db, "notices", id));
      if (snap.exists()) {
        setNotice({ id: snap.id, ...snap.data() });
      }
    })();
  }, [id]);

  if (!notice) return <p>공지사항을 불러오는 중…</p>;

  return (
    <div
      className="container"
      style={{ maxWidth: 800, margin: "0 auto", padding: "16px" }}
    >
      <h1 style={{ fontSize: 22, fontWeight: "bold", marginBottom: 8 }}>
        {notice.title}
      </h1>
      <p style={{ fontSize: 13, color: "#6b7280", marginBottom: 16 }}>
        <strong>날짜:</strong> {notice.date}
      </p>

      {/* ✅ HTML로 저장된 공지를 예쁘게 렌더링 */}
      <div
        style={{
          marginTop: 12,
          fontSize: 14,
          color: "#111827",
          lineHeight: 1.7,
          whiteSpace: "normal",
        }}
        dangerouslySetInnerHTML={{
          __html: notice.content || "",
        }}
      />

      <p style={{ marginTop: 24 }}>
        <Link to="/notices" style={{ fontSize: 14, color: "#2563eb" }}>
          ← 목록으로 돌아가기
        </Link>
      </p>
    </div>
  );
}
