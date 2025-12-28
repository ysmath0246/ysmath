// src/App.jsx
import { useState, useEffect } from "react";
import {
  HashRouter,
  Routes,
  Route,
  NavLink,
  Navigate,
  useLocation,
} from "react-router-dom";

import { db } from "./firebase";
import { getDocs, collection } from "firebase/firestore";

import LoginPage from "./pages/LoginPage.jsx";
import AttendancePage from "./pages/AttendancePage.jsx";

// ✅ (예전/횟수제 결제 내역 페이지) - 기존 PaymentPage.jsx를 "지난 결제 내역"으로 사용
import PaymentPage from "./pages/PaymentPage.jsx";

// ✅ 공지/내아이/수강신청
import NoticesPage from "./pages/NoticesPage.jsx";
import MyClassPage from "./pages/MyClassPage.jsx";
import EnrollPage from "./pages/EnrollPage.jsx";

// ✅ 월제 결제 메인 페이지 (새로 추가)
import MonthlyPaymentPage from "./pages/MonthlyPaymentPage.jsx";

// ✅ 새로 추가되는 페이지 2개
import ChangePasswordPage from "./pages/ChangePasswordPage.jsx";
import SelectChildPage from "./pages/SelectChildPage.jsx";

import React from "react";
import "./App.css";

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
    console.error("ErrorBoundary caught:", error, info);
  }
  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 16 }}>
          문제가 발생했어요. 새로고침(F5)하거나, 우측 상단에서 ‘로그아웃’ 후 다시
          로그인해 주세요.
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
  return (
    // ✅✅ 핵심1) GitHub Pages에서 /ysmath/ 아래로 깔려있으니 basename 지정!
    <HashRouter basename="/ysmath">
      <ErrorBoundary>
        <AppContent />
      </ErrorBoundary>
    </HashRouter>
  );
}

function AppContent() {
  const location = useLocation();

  // ✅ 새 로그인 상태 기준 (부모 계정 기준)
  const [isParentLoggedIn, setIsParentLoggedIn] = useState(
    Boolean(localStorage.getItem("parentPhone"))
  );
  const [mustChangePw, setMustChangePw] = useState(
    localStorage.getItem("mustChangePassword") === "1"
  );
  const [hasStudentSelected, setHasStudentSelected] = useState(
    Boolean(localStorage.getItem("studentId"))
  );

  const [hasNewCommentOrBook, setHasNewCommentOrBook] = useState(false);

  // storage 이벤트 반영
  useEffect(() => {
    const checkLogin = () => {
      setIsParentLoggedIn(Boolean(localStorage.getItem("parentPhone")));
      setMustChangePw(localStorage.getItem("mustChangePassword") === "1");
      setHasStudentSelected(Boolean(localStorage.getItem("studentId")));
    };
    window.addEventListener("storage", checkLogin);
    return () => window.removeEventListener("storage", checkLogin);
  }, []);

  // 라우트 변경 시 localStorage 상태 반영
  useEffect(() => {
    setIsParentLoggedIn(Boolean(localStorage.getItem("parentPhone")));
    setMustChangePw(localStorage.getItem("mustChangePassword") === "1");
    setHasStudentSelected(Boolean(localStorage.getItem("studentId")));
  }, [location]);

  // 최근 3일 새 글/완북 체크 (학생 선택된 상태에서만)
  useEffect(() => {
    const studentId = localStorage.getItem("studentId");
    if (!studentId) return;

    const checkNewItems = async () => {
      const today = new Date();
      const cutoff = new Date();
      cutoff.setDate(today.getDate() - 3);

      const commentsSnap = await getDocs(collection(db, "comments"));
      const booksSnap = await getDocs(collection(db, "books"));

      const recentComment = commentsSnap.docs.some((doc) => {
        const data = doc.data();
        return (
          data.studentId === studentId &&
          (toJSDate(data.createdAt || data.completedDate) ?? new Date(0)) >= cutoff
        );
      });

      const recentBook = booksSnap.docs.some((doc) => {
        const data = doc.data();
        return (
          data.studentId === studentId &&
          (toJSDate(data.createdAt || data.completedDate) ?? new Date(0)) >= cutoff
        );
      });

      setHasNewCommentOrBook(recentComment || recentBook);
    };

    checkNewItems();
  }, [hasStudentSelected]);

  const logout = () => {
    localStorage.clear();
    setIsParentLoggedIn(false);
    setMustChangePw(false);
    setHasStudentSelected(false);
    window.location.hash = "#/login";
  };

  // ✅ 라우트 가드(공통)
  const guard = (element) => {
    if (!isParentLoggedIn) return <Navigate to="login" replace />;
    if (mustChangePw) return <Navigate to="change-password" replace />;
    if (!hasStudentSelected) return <Navigate to="select-child" replace />;
    return element;
  };

  return (
    <div className="app-shell page">
      {/* ✅ 상단 네비: 부모 로그인 완료 + 비번 변경 완료 이후에만 보여줌 */}
      {isParentLoggedIn && !mustChangePw && (
        <nav className="nav">
          <div className="nav-links" style={{ justifyContent: "center" }}>
            {[
              "/attendance",
              "/payment", // ✅ 월제 결제가 여기로
              "/notices",
              "/myclass",
              "/enroll",
            ].map((path) => (
              <NavLink
                key={path}
                to={path}
                style={({ isActive }) => ({
                  margin: "0 0",
                  padding: "6px 12px",
                  borderRadius: 6,
                  textDecoration: "none",
                  fontWeight: isActive ? "bold" : "normal",
                  color: isActive ? "#fff" : "#333",
                  backgroundColor: isActive ? "#007bff" : "#f5f5f7",
                  position: "relative",
                  display: "inline-flex",
                  alignItems: "center",
                  whiteSpace: "nowrap",
                })}
              >
                {{
                  "/attendance": "출석",
                  "/payment": "결제", // ✅ 월제(메인)
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
                            fontFamily:
                              "'Segoe UI','Apple SD Gothic Neo',sans-serif",
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

            {/* ✅ 부모 비밀번호 변경 */}
            <button
              onClick={() => {
                window.location.hash = "#/change-password";
              }}
              style={{
                padding: "6px 12px",
                border: "none",
                borderRadius: 6,
                backgroundColor: "#f0f0f0",
                cursor: "pointer",
              }}
            >
              비밀번호 변경
            </button>

            <button
              onClick={logout}
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
        </nav>
      )}

      <Routes>
        {/* ① index 분기: ✅ 무조건 공지사항이 첫 화면 */}
        <Route
          index
          element={
            !isParentLoggedIn ? (
              <Navigate to="login" replace />
            ) : mustChangePw ? (
              <Navigate to="change-password" replace />
            ) : !hasStudentSelected ? (
              <Navigate to="select-child" replace />
            ) : (
              <Navigate to="notices" replace />
            )
          }
        />

        {/* ② 로그인/비번변경/자녀선택 */}
        <Route path="login" element={<LoginPage />} />
        <Route
          path="change-password"
          element={
            !isParentLoggedIn ? (
              <Navigate to="login" replace />
            ) : (
              <ChangePasswordPage />
            )
          }
        />
        <Route
          path="select-child"
          element={
            !isParentLoggedIn ? (
              <Navigate to="login" replace />
            ) : mustChangePw ? (
              <Navigate to="change-password" replace />
            ) : (
              <SelectChildPage />
            )
          }
        />

        {/* ③ 주요 페이지 (학생 선택까지 끝난 상태에서만) */}
        <Route path="attendance" element={guard(<AttendancePage />)} />

        {/* ✅ 결제 메인 = 월제 페이지 */}
        <Route path="payment" element={guard(<MonthlyPaymentPage />)} />

        {/* ✅ 지난 결제 내역(예전 횟수제) 페이지 */}
        <Route path="payment-history" element={guard(<PaymentPage />)} />

        <Route path="notices" element={guard(<NoticesPage />)} />
        <Route path="myclass" element={guard(<MyClassPage />)} />
        <Route path="enroll" element={guard(<EnrollPage />)} />

        {/* ✅✅ 핵심2) 어떤 주소로 와도 “해시 루트”로 보내기 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}
