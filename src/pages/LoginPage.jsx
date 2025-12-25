// src/pages/LoginPage.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

const onlyDigits = (v) => (v || "").toString().replace(/[^0-9]/g, "");
const last8 = (phoneDigits) => phoneDigits.slice(-8);

export default function LoginPage() {
  const [phone, setPhone] = useState("");      // 01012345678
  const [password, setPassword] = useState(""); // 부모 비번(처음엔 뒤8)
  const [error, setError] = useState("");
  const navigate = useNavigate();

  const handleLogin = async () => {
    setError("");

    const phoneDigits = onlyDigits(phone);
    const pwd = (password || "").trim();

    if (phoneDigits.length !== 11 || !phoneDigits.startsWith("010")) {
      setError("아이디는 학부모 전화번호 11자리(010...)로 입력해 주세요.");
      return;
    }
    if (pwd.length < 6) {
      setError("비밀번호를 입력해 주세요. (초기 비번은 전화번호 뒤 8자리)");
      return;
    }

    try {
      const parentRef = doc(db, "parents", phoneDigits);
      const parentSnap = await getDoc(parentRef);

      // 1) parents 문서 없으면: students에서 자녀 찾고 parents 자동 생성
      let parentData = null;

      if (!parentSnap.exists()) {
        // students에서 parentPhone == phoneDigits 조회
        const q = query(collection(db, "students"), where("parentPhone", "==", phoneDigits));
        const ss = await getDocs(q);

        const childIds = [];
        ss.forEach((d) => childIds.push(d.id));

        if (childIds.length === 0) {
          setError("등록된 정보가 없습니다. (상담/등록 완료 후 로그인 가능합니다.)");
          return;
        }

        const initialPwd = last8(phoneDigits);

        await setDoc(parentRef, {
          phone: phoneDigits,
          password: initialPwd,
          mustChangePassword: true,
          children: childIds,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        parentData = {
          phone: phoneDigits,
          password: initialPwd,
          mustChangePassword: true,
          children: childIds,
        };
      } else {
        parentData = parentSnap.data();
      }

      // 2) 비밀번호 확인
      if (!parentData?.password || parentData.password !== pwd) {
        setError("비밀번호가 일치하지 않습니다.");
        return;
      }

      // 3) 로그인 세션 저장
      localStorage.setItem("parentPhone", phoneDigits);
      localStorage.setItem("mustChangePassword", parentData.mustChangePassword ? "1" : "0");

      // 4) 첫 로그인: 비번 변경 강제
      if (parentData.mustChangePassword) {
        navigate("/change-password");
        return;
      }

      // 5) 자녀 선택(다자녀)
      const children = parentData.children || [];
      if (children.length <= 1) {
        if (children[0]) localStorage.setItem("studentId", children[0]);
        navigate("/attendance");
      } else {
        navigate("/select-child");
      }
    } catch (e) {
      console.error(e);
      setError("로그인 중 오류가 발생했습니다.");
    }
  };

  return (
    <div style={{ maxWidth: 420, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>학부모 로그인</h1>

      <label style={{ display: "block", fontWeight: 700, marginTop: 8 }}>아이디(학부모 전화번호)</label>
      <input
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        placeholder="예: 01012345678"
        inputMode="numeric"
        style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
      />

      <label style={{ display: "block", fontWeight: 700, marginTop: 12 }}>비밀번호</label>
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value)}
        placeholder="초기 비번: 전화번호 뒤 8자리"
        style={{ width: "100%", padding: 10, borderRadius: 10, border: "1px solid #d1d5db" }}
      />

      <button
        onClick={handleLogin}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 12,
          marginTop: 16,
          fontWeight: 900,
          border: "1px solid #0d6efd",
          background: "#0d6efd",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        로그인
      </button>

      {error && <div style={{ color: "#dc3545", marginTop: 10, fontWeight: 600 }}>{error}</div>}

      <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280", lineHeight: 1.6 }}>
        • 초기 비밀번호는 <b>전화번호 뒤 8자리</b>입니다.<br />
        • 첫 로그인 후 비밀번호 변경 화면으로 이동합니다.
      </div>
    </div>
  );
}
