// src/pages/ChangePasswordPage.jsx
import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { doc, getDoc, updateDoc, serverTimestamp } from "firebase/firestore";

export default function ChangePasswordPage() {
  const [newPwd, setNewPwd] = useState("");
  const [newPwd2, setNewPwd2] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  const parentPhone = localStorage.getItem("parentPhone") || "";

  useEffect(() => {
    (async () => {
      if (!parentPhone) {
        navigate("/login");
        return;
      }
      setLoading(false);
    })();
  }, [parentPhone, navigate]);

  const handleSave = async () => {
    setError("");

    if (!parentPhone) {
      setError("로그인이 필요합니다.");
      return;
    }
    if (newPwd.length < 8) {
      setError("비밀번호는 최소 8자 이상으로 설정해 주세요.");
      return;
    }
    if (newPwd !== newPwd2) {
      setError("비밀번호가 서로 일치하지 않습니다.");
      return;
    }

    try {
      const parentRef = doc(db, "parents", parentPhone);
      const snap = await getDoc(parentRef);

      if (!snap.exists()) {
        setError("등록된 정보가 없습니다. 원장님께 문의해 주세요.");
        return;
      }

      await updateDoc(parentRef, {
        password: newPwd,
        mustChangePassword: false,
        updatedAt: serverTimestamp(),
      });

      localStorage.setItem("mustChangePassword", "0");

      const data = snap.data() || {};
      const children = data.children || [];

      if (children.length <= 1) {
        if (children[0]) localStorage.setItem("studentId", children[0]);
        navigate("/attendance");
      } else {
        navigate("/select-child");
      }
    } catch (e) {
      console.error(e);
      setError("비밀번호 변경 중 오류가 발생했습니다.");
    }
  };

  if (loading) return null;

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 900, marginBottom: 10 }}>비밀번호 변경</h1>
      <div style={{ fontSize: 13, color: "#6b7280", lineHeight: 1.6 }}>
        보안을 위해 <b>첫 로그인 후 비밀번호 변경이 필요</b>합니다.<br />
        (최소 8자 이상 권장)
      </div>

      <label style={{ display: "block", fontWeight: 700, marginTop: 14 }}>새 비밀번호</label>
      <input
        value={newPwd}
        onChange={(e) => setNewPwd(e.target.value)}
        placeholder="8자 이상"
        style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
      />

      <label style={{ display: "block", fontWeight: 700, marginTop: 10 }}>새 비밀번호 확인</label>
      <input
        value={newPwd2}
        onChange={(e) => setNewPwd2(e.target.value)}
        placeholder="한 번 더 입력"
        style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
      />

      <button
        onClick={handleSave}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 12,
          marginTop: 16,
          fontWeight: 900,
          border: "1px solid #16a34a",
          background: "#16a34a",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        저장하고 계속하기
      </button>

      {error && <div style={{ color: "#dc3545", marginTop: 10, fontWeight: 700 }}>{error}</div>}
    </div>
  );
}
