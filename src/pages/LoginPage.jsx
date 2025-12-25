// src/pages/LoginPage.jsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { db } from "../firebase";
import { collection, getDocs, addDoc, serverTimestamp } from "firebase/firestore";
import { Link } from "react-router-dom";

export default function LoginPage({ onLoginSuccess }) {
  const [userId, setUserId] = useState("");      // 예: 170806예린
  const [password, setPassword] = useState("");  // 예: 0668 (엄마번호 뒤4)
  const [error, setError] = useState("");
  const navigate = useNavigate();

  // 아이디: 앞 6자 숫자 + 뒤에 이름(한글/영문 1~4글자 정도)
  const parseId = (id) => {
    const raw = (id || "").toString().trim();
    const birth6 = raw.slice(0, 6).replace(/[^0-9]/g, "");
    const name = raw.slice(6).replace(/[^A-Za-z가-힣]/g, "");
    return { birth6, name };
  };

  const handleLogin = async () => {
    setError("");

    // 1) 입력값 정제/검증
    const id = (userId || "").replace(/\s+/g, "");
    const pwd = (password || "").replace(/[^0-9]/g, "").slice(0, 4);

    const { birth6, name } = parseId(id);

    if (birth6.length !== 6 || !name) {
      setError("아이디를 ‘생년월일6자리+이름’으로 입력해 주세요. 예: 170806예린");
      return;
    }
    if (pwd.length !== 4) {
      setError("비밀번호는 학부모 전화번호 뒤 4자리입니다.");
      return;
    }

    try {
      // 2) students 전체 조회 후 클라이언트에서 필터 (학원 규모에서는 이게 제일 간단)
      const snap = await getDocs(collection(db, "students"));

      // 매칭 기준:
      //  - birth의 끝 6자리 === birth6
      //  - name === 입력한 이름(완전일치)  ※ 외자도 그대로 1글자
      //  - parentPhone(학부모번호) 끝 4자리 === pwd
      const candidates = [];
      snap.forEach((docSnap) => {
        const data = docSnap.data() || {};
        const sName = (data.name || "").toString().trim();
        const sBirth = (data.birth || "").toString().replace(/[^0-9]/g, "");
        const sBirth6 = sBirth.slice(-6);
        const phone = (data.parentPhone || data.parent_phone || data.momPhone || "").toString();
        const phoneLast4 = phone.replace(/[^0-9]/g, "").slice(-4);

        if (sBirth6 === birth6 && sName === name && phoneLast4 === pwd) {
          candidates.push({ id: docSnap.id, data });
        }
      });

      if (candidates.length === 0) {
        setError("정보가 일치하지 않습니다. 아이디(생년월일+이름)와 비밀번호(학부모번호 뒤4자리)를 확인해 주세요.");
        return;
      }

      // 3) 성공 처리 (동명이인/중복까지 걸러진 상태)
      const chosen = candidates[0];
      localStorage.setItem("studentId", chosen.id);
      localStorage.setItem("studentName", chosen.data.name || "");
  // ✅ 학부모 로그인 기록 저장 (parentLogins 컬렉션)
      try {
        await addDoc(collection(db, "parentLogins"), {
          studentId: chosen.id,
          studentName: chosen.data.name || "",
          loginTime: serverTimestamp(),   // Firestore 서버시간
        });
      } catch (logErr) {
        console.error("parentLogins 기록 중 오류:", logErr);
        // 굳이 alert는 안 띄우고, 로그인은 계속 진행
      }
      if (onLoginSuccess) onLoginSuccess();
      // 로그인 후 이동할 기본 경로 (원하는 곳으로 바꿔도 됨)
      navigate("/attendance");
    } catch (e) {
      console.error(e);
      setError("로그인 중 오류가 발생했습니다.");
    }
  };

  return (
    <div style={{ maxWidth: 380, margin: "40px auto", padding: 16 }}>
      <h1 style={{ fontSize: 22, fontWeight: 800, marginBottom: 12 }}>학부모 로그인</h1>

      <label style={{ display: "block", fontWeight: 600, marginTop: 8 }}>아이디</label>
      <input
        value={userId}
        onChange={(e) => setUserId(e.target.value)}
        placeholder="예: 170806조예린 (생년월일6자리+이름)"
        style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}
      />

      <label style={{ display: "block", fontWeight: 600, marginTop: 12 }}>비밀번호</label>
      <input
        value={password}
        onChange={(e) => setPassword(e.target.value.replace(/[^0-9]/g, "").slice(0, 4))}
        placeholder="학부모 전화번호 뒤 4자리"
        inputMode="numeric"
        maxLength={4}
        style={{ width: "100%", padding: 10, borderRadius: 8, border: "1px solid #d1d5db" }}
      />

      <button
        onClick={handleLogin}
        style={{
          width: "100%",
          padding: 12,
          borderRadius: 10,
          marginTop: 16,
          fontWeight: 800,
          border: "1px solid #0d6efd",
          background: "#0d6efd",
          color: "#fff",
          cursor: "pointer",
        }}
      >
        로그인
      </button>

      {error && <div style={{ color: "#dc3545", marginTop: 8 }}>{error}</div>}

      <div style={{ marginTop: 12, fontSize: 12, color: "#6b7280", lineHeight: 1.5 }}>
        • 예시: 2017-08-06 출생 &quot;조예린&quot; → 아이디 <b>170806조예린</b>, 비밀번호 <b>엄마번호 뒤 4자리</b><br />
      
      </div>

    

    </div>
  );
}
