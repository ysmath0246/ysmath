import { useState, useEffect } from "react";
 import {
   HashRouter,
   Routes,
   Route,
   NavLink,
   Navigate,
   useLocation
 } from 'react-router-dom';
import { db } from "./firebase";
import { doc, updateDoc } from "firebase/firestore";
import { getDocs, collection } from "firebase/firestore";

import LoginPage from "./pages/LoginPage.jsx";
import AttendancePage from "./pages/AttendancePage.jsx";
import PaymentPage from "./pages/PaymentPage.jsx";
import NoticesPage from "./pages/NoticesPage.jsx";
import NoticeDetailPage from "./pages/NoticeDetailPage.jsx";
import MyClassPage from "./pages/MyClassPage.jsx";
import EnrollPage from "./pages/EnrollPage.jsx";
import NewEnrollPage from "./pages/NewEnrollPage.jsx";
import React from "react";
import './App.css';

// ---- ErrorBoundary 정의 ----
class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }
  componentDidCatch(error, info) {
    // 콘솔에 상세 원인 남기기
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16 }}>
          문제가 발생했어요. 새로고침(F5)하거나, 우측 상단에서 ‘로그아웃’ 후 다시 로그인해 주세요.
        </div>
      );
    }
    return this.props.children;
  }
}

// ---- Firestore 날짜 안전 변환 유틸 ----
const toJSDate = (v) => {
  if (!v) return null;
  if (typeof v.toDate === "function") return v.toDate(); // Firestore Timestamp
  const d = new Date(v);
  return isNaN(d) ? null : d;
};
export default function App() {
  // 해시 라우터로 감싸면 새로고침해도 404 안 납니다(GH Pages 권장).
  return (
    <HashRouter>
   <ErrorBoundary>
     <AppContent />
   </ErrorBoundary>
 </HashRouter>
  );
}

function AppContent() {
  const [isLoggedIn, setIsLoggedIn] = useState(Boolean(localStorage.getItem("studentId")));
  const [showChangePw, setShowChangePw] = useState(false);
  const [newPw, setNewPw] = useState("");
  const location = useLocation();
  const [hasNewCommentOrBook, setHasNewCommentOrBook] = useState(false);


  useEffect(() => {
    const checkLogin = () => {
      setIsLoggedIn(Boolean(localStorage.getItem("studentId")));
    };
    window.addEventListener("storage", checkLogin);
    return () => {
      window.removeEventListener("storage", checkLogin);
    };
  }, []);

  useEffect(() => {
    setIsLoggedIn(Boolean(localStorage.getItem("studentId")));
  }, [location]);

 
useEffect(() => {
  const studentId = localStorage.getItem("studentId");
  if (!studentId) return;

  const checkNewItems = async () => {
    const today = new Date();
    const cutoff = new Date();
    cutoff.setDate(today.getDate() - 3); // 최근 3일 이내 기준

    const commentsSnap = await getDocs(collection(db, "comments"));
    const booksSnap = await getDocs(collection(db, "books"));

    const recentComment = commentsSnap.docs.some(doc => {
      const data = doc.data();
      return data.studentId === studentId &&
            (toJSDate(data.createdAt || data.completedDate) ?? new Date(0)) >= cutoff
    });

    const recentBook = booksSnap.docs.some(doc => {
      const data = doc.data();
      return data.studentId === studentId &&
            (toJSDate(data.createdAt || data.completedDate) ?? new Date(0)) >= cutoff
    });

    setHasNewCommentOrBook(recentComment || recentBook);
  };

  checkNewItems();
}, []);
  // ✅ 자동 로그아웃 타이머
  useEffect(() => {
    let timer;

    const resetTimer = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        localStorage.clear();
        setIsLoggedIn(false);
        window.location.hash = "#/login";
        alert("1시간 동안 활동이 없어 자동 로그아웃되었습니다.");
      }, 60 * 60 * 1000); // 1시간 = 3600000ms
    };

    if (isLoggedIn) {
      const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
      events.forEach(event => window.addEventListener(event, resetTimer));
      resetTimer();

      return () => {
        clearTimeout(timer);
        events.forEach(event => window.removeEventListener(event, resetTimer));
      };
    }
  }, [isLoggedIn]);

 async function handlePasswordChange() {
    const studentId = localStorage.getItem("studentId");
    if (!studentId || newPw.length !== 4) {
      alert("PIN은 4자리 숫자로 입력해야 합니다.");
      return;
    }
    try {
      await updateDoc(doc(db, "students", studentId), { pin: newPw });
      alert("PIN이 성공적으로 변경되었습니다.");
      setShowChangePw(false);
      setNewPw("");
    } catch (e) {
      console.error(e);
      alert("PIN 변경 중 오류가 발생했습니다.");
    }
  }



  return (
     <div className="app-shell page">
     
      {isLoggedIn && (
  <nav className="nav">
    <div className="nav-links" style={{ justifyContent: "center" }}>
      {["/attendance", "/payment", "/notices", "/myclass", "/enroll"].map((path) => (
        <NavLink
          key={path}
          to={path}
          style={({ isActive }) => ({
            margin: "0 0",               // 간격은 .nav-links gap으로 통일
            padding: "6px 12px",
            borderRadius: 6,
            textDecoration: "none",
            fontWeight: isActive ? "bold" : "normal",
            color: isActive ? "#fff" : "#333",
            backgroundColor: isActive ? "#007bff" : "#f5f5f7",
            position: "relative",
            display: "inline-flex",     // 배지 위치 안정
            alignItems: "center",
            whiteSpace: "nowrap",
          })}
        >
          {{
            "/attendance": "출석",
            "/payment": "결제",
            "/notices": "공지사항",
            "/myclass": (
              <>
                내아이수업현황
                {hasNewCommentOrBook && (
                  <span
                    className="pulse wiggle"
                    style={{
                      position: "absolute",
                      top: -8,
                      right: -12,
                      backgroundColor: "red",
                      color: "white",
                      borderRadius: "12px",
                      padding: "2px 6px",
                      fontSize: "10px",
                      fontWeight: "bold",
                      fontFamily: "'Segoe UI','Apple SD Gothic Neo',sans-serif",
                    }}
                  >
                    🔥 새글
                  </span>
                )}
              </>
            ),
            "/enroll": "수강신청",
          }[path]}
        </NavLink>
      ))}

      <button
        onClick={() => setShowChangePw(true)}
        style={{
          padding: "6px 12px",
          border: "none",
          borderRadius: 6,
          backgroundColor: "#f0f0f0",
          cursor: "pointer",
        }}
      >
        PIN 변경
      </button>

      <button
        onClick={() => {
          localStorage.clear();
          setIsLoggedIn(false);
          window.location.hash = "#/login";
        }}
        style={{
          padding: "6px 12px",
          border: "none",
          borderRadius: 6,
          backgroundColor: "#f0f0f0",
          cursor: "pointer",
        }}
      >
        로그아웃
      </button>
    </div>

    {showChangePw && (
      <div
        style={{
          position: "fixed",
          inset: 0,
          backgroundColor: "rgba(0,0,0,0.5)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <div className="modal" style={{ background: "#fff", padding: 20, borderRadius: 8 }}>
          <h2>PIN 변경</h2>
          <input
            type="text"
            maxLength={4}
            value={newPw}
            onChange={(e) => setNewPw(e.target.value.replace(/\D/g, ""))}
            placeholder="새 PIN (4자리)"
            style={{ width: "100%", padding: 8, margin: "12px 0" }}
          />
          <div style={{ textAlign: "right" }}>
            <button onClick={() => setShowChangePw(false)} style={{ marginRight: 8 }}>
              취소
            </button>
            <button onClick={handlePasswordChange}>변경</button>
          </div>
        </div>
      </div>
    )}
  </nav>
)}


     
 <Routes>
  {/* ① 빈 경로 → 로그인/공지로 분기 */}
  <Route
    index
    element={
      isLoggedIn
        ? <Navigate to="notices" replace />
        : <Navigate to="login"  replace />
    }
  />

  {/* ② 로그인 */}
  <Route path="login"
         element={<LoginPage onLoginSuccess={() => setIsLoggedIn(true)} />} />
<Route path="new-enroll" element={<NewEnrollPage />} />

  {/* ③ 주요 페이지 */}
  <Route path="attendance" element={isLoggedIn
    ? <AttendancePage /> : <Navigate to="login" replace />} />
  <Route path="payment"    element={isLoggedIn
    ? <PaymentPage />    : <Navigate to="login" replace />} />
  <Route path="notices"    element={isLoggedIn
    ? <NoticesPage />    : <Navigate to="login" replace />} />
  <Route path="notices/:id"element={isLoggedIn
    ? <NoticeDetailPage />: <Navigate to="login" replace />} />
  <Route path="myclass"    element={isLoggedIn
    ? <MyClassPage />    : <Navigate to="login" replace />} />
<Route path="enroll"     element={isLoggedIn
 ? <EnrollPage />     : <Navigate to="login" replace />} />
  {/* ④ 기타 경로는 빈 문자열(=basename)로 리다이렉트 */}
  <Route path="*" element={<Navigate to="/" replace />} />
</Routes>
    </div>
  );
}
