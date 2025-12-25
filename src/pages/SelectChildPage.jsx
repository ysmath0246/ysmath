// src/pages/SelectChildPage.jsx
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc } from "firebase/firestore";

export default function SelectChildPage() {
  const [children, setChildren] = useState([]);
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const parentPhone = localStorage.getItem("parentPhone") || "";
  const mustChange = localStorage.getItem("mustChangePassword") === "1";

  useEffect(() => {
    (async () => {
      if (!parentPhone) {
        navigate("/login");
        return;
      }
      if (mustChange) {
        navigate("/change-password");
        return;
      }

      try {
        const parentRef = doc(db, "parents", parentPhone);
        const snap = await getDoc(parentRef);
        if (!snap.exists()) {
          setError("부모 정보가 없습니다. 다시 로그인해 주세요.");
          return;
        }
        const data = snap.data() || {};
        const childIds = data.children || [];

        // 학생 이름은 students 문서에서 읽어오기(간단히 id만 써도 되지만 UX 위해)
        const items = [];
        for (const cid of childIds) {
          const sSnap = await getDoc(doc(db, "students", cid));
          const sData = sSnap.exists() ? sSnap.data() : {};
          items.push({ id: cid, name: sData.name || "이름없음" });
        }

        setChildren(items);
      } catch (e) {
        console.error(e);
        setError("자녀 정보를 불러오지 못했습니다.");
      }
    })();
  }, [parentPhone, mustChange, navigate]);

  const choose = (id) => {
    localStorage.setItem("studentId", id);
    navigate("/attendance");
  };

  const logout = () => {
    localStorage.removeItem("parentPhone");
    localStorage.removeItem("studentId");
    localStorage.removeItem("mustChangePassword");
    navigate("/login");
  };

  return (
    <div style={{ maxWidth: 520, margin: "40px auto", padding: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h1 style={{ fontSize: 22, fontWeight: 900 }}>자녀 선택</h1>
        <button onClick={logout} style={{ border: "1px solid #d1d5db", background: "#fff", borderRadius: 10, padding: "8px 10px", cursor: "pointer" }}>
          로그아웃
        </button>
      </div>

      {error && <div style={{ color: "#dc3545", marginTop: 10, fontWeight: 700 }}>{error}</div>}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0,1fr))", gap: 12, marginTop: 14 }}>
        {children.map((c) => (
          <button
            key={c.id}
            onClick={() => choose(c.id)}
            style={{
              textAlign: "left",
              padding: 14,
              borderRadius: 14,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
              boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
            }}
          >
            <div style={{ fontSize: 16, fontWeight: 900 }}>{c.name}</div>
            <div style={{ marginTop: 6, fontSize: 12, color: "#6b7280" }}>이 아이로 들어가기 →</div>
          </button>
        ))}
      </div>
    </div>
  );
}
