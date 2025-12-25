// src/pages/NoticesPage.jsx
import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";

const MAX_VISIBLE_NOTICES = 8; // 학부모에게 보여줄 최대 공지 개수(원하면 5로 다시)

function plainToHtml(text = "") {
  if (!text) return "";
  return text
    .split("\n")
    .map((line) => line || "&nbsp;")
    .join("<br />");
}

export default function NoticesPage() {
  const [notices, setNotices] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [noticeDetails, setNoticeDetails] = useState({}); // id -> { html, plain }

  const [upcomingHolidays, setUpcomingHolidays] = useState([]);
  const [pastHolidays, setPastHolidays] = useState([]);
  const [showPastHolidays, setShowPastHolidays] = useState(false);

  useEffect(() => {
    // ✅ 공지 가져오기
    (async () => {
      const snap = await getDocs(collection(db, "notices"));

      const list = snap.docs.map((d) => {
        const data = d.data() || {};
        return {
          id: d.id,
          title: (data.title || "").toString(),
          date: (data.date || "").toString(),
          showOnParents:
            data.showOnParents === undefined ? true : Boolean(data.showOnParents),

          // ✅ 우선순위/고정 관련 (필드명 혼용 방어)
          // - mainOrder가 있으면 그걸 우선순위로 사용 (작을수록 위)
          // - priority가 있으면 보조로 사용
          mainOrder:
            typeof data.mainOrder === "number"
              ? data.mainOrder
              : typeof data.priority === "number"
              ? data.priority
              : 9999,

          // 혹시 쓰고 있던 고정 로직도 유지하고 싶으면:
          isPinned: data.isPinned === true,
        };
      });

      // ✅ 학부모 노출: showOnParents !== false
      const filtered = list.filter((n) => n.showOnParents !== false);

      // ✅ 정렬: (1) 상단고정 → (2) mainOrder(우선순위) → (3) 날짜 최신순
      filtered.sort((a, b) => {
        const pinA = a.isPinned ? 1 : 0;
        const pinB = b.isPinned ? 1 : 0;
        if (pinA !== pinB) return pinB - pinA;

        const oa = a.mainOrder ?? 9999;
        const ob = b.mainOrder ?? 9999;
        if (oa !== ob) return oa - ob;

        const da = a.date || "";
        const dbb = b.date || "";
        return dbb.localeCompare(da);
      });

      setNotices(filtered.slice(0, MAX_VISIBLE_NOTICES));
    })();

    // ✅ 휴일 가져오기 (다가오는 / 지난 휴일)
    (async () => {
      const snap = await getDocs(collection(db, "holidays"));
      const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      const raw = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() || {}) }))
        .filter((h) => !!h.date);

      const upcoming = raw
        .filter((h) => (h.date || "").toString() >= todayStr)
        .sort((a, b) =>
          (a.date || "").toString().localeCompare((b.date || "").toString())
        );

      const past = raw
        .filter((h) => (h.date || "").toString() < todayStr)
        .sort((a, b) =>
          (b.date || "").toString().localeCompare((a.date || "").toString())
        );

      setUpcomingHolidays(upcoming);
      setPastHolidays(past);
    })();
  }, []);

  const toggleExpand = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }

    // 아직 내용 안 가져온 공지면 한 번만 불러오기
    if (!noticeDetails[id]) {
      const snap = await getDoc(doc(db, "notices", id));
      if (snap.exists()) {
        const data = snap.data() || {};

        const contentHtml = (data.contentHtml || "").toString();
        const contentPlain = (data.contentPlain || "").toString();
        const oldContent = (data.content || "").toString();

        const finalPlain = contentPlain || oldContent;
        let finalHtml = contentHtml;

        if (!finalHtml) {
          finalHtml = plainToHtml(finalPlain);
        }

        setNoticeDetails((prev) => ({
          ...prev,
          [id]: { html: finalHtml, plain: finalPlain },
        }));
      }
    }

    setExpandedId(id);
  };

  return (
    <div style={{ maxWidth: 820, margin: "0 auto", padding: 16 }}>
      {/* 🟦 휴일 안내 카드 (예쁘게) */}
      <div
        style={{
          background: "linear-gradient(135deg, #f0f9ff, #e0f2fe)",
          padding: "16px 18px",
          borderRadius: 14,
          marginBottom: 22,
          border: "1px solid #bae6fd",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
          <span style={{ fontSize: 20, marginRight: 6 }}>📅</span>
          <h2 style={{ fontSize: 18, fontWeight: 800, margin: 0 }}>
            휴일 안내
          </h2>
        </div>

        {/* 다가오는 휴일 */}
        {upcomingHolidays.length > 0 ? (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {upcomingHolidays.map((h) => (
              <div
                key={h.id}
                style={{
                  padding: "6px 12px",
                  borderRadius: 999,
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  fontSize: 13,
                  display: "flex",
                  gap: 6,
                  alignItems: "center",
                }}
              >
                <span style={{ fontWeight: 700 }}>
                  {(h.name || "휴일").toString()}
                </span>
                <span style={{ color: "#dc2626", fontSize: 12 }}>
                  {(h.date || "").toString()}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            예정된 휴일이 없습니다.
          </p>
        )}

        {/* 지난 휴일 */}
        {pastHolidays.length > 0 && (
          <div style={{ marginTop: 12 }}>
            <button
              onClick={() => setShowPastHolidays((v) => !v)}
              style={{
                fontSize: 12,
                background: "transparent",
                border: "none",
                color: "#2563eb",
                cursor: "pointer",
                padding: 0,
                fontWeight: 700,
              }}
            >
              {showPastHolidays ? "지난 휴일 접기 ▲" : "지난 휴일 보기 ▼"}
            </button>

            {showPastHolidays && (
              <div
                style={{
                  marginTop: 8,
                  display: "flex",
                  flexWrap: "wrap",
                  gap: 6,
                }}
              >
                {pastHolidays.map((h) => (
                  <div
                    key={h.id}
                    style={{
                      fontSize: 12,
                      padding: "4px 10px",
                      borderRadius: 999,
                      background: "#f8fafc",
                      border: "1px solid #e5e7eb",
                      color: "#6b7280",
                    }}
                  >
                    {(h.name || "휴일").toString()} · {(h.date || "").toString()}
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🟧 공지 타이틀 */}
      <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
        <h1 style={{ fontSize: 22, fontWeight: 900, margin: 0 }}>📣 공지사항</h1>
        <span style={{ fontSize: 12, color: "#6b7280" }}>
          
        </span>
      </div>

      {notices.length === 0 && (
        <p style={{ fontSize: 14, color: "#6b7280", marginTop: 10 }}>
          현재 학부모용으로 노출되는 공지사항이 없습니다.
        </p>
      )}

      {/* 공지 카드 리스트 */}
      <div style={{ marginTop: 14, display: "flex", flexDirection: "column", gap: 12 }}>
        {notices.map((n) => {
          const isExpanded = expandedId === n.id;
          const detail = noticeDetails[n.id];

          const isImportant = typeof n.mainOrder === "number" && n.mainOrder < 9999;

          return (
            <div
              key={n.id}
              style={{
                padding: "14px 16px",
                borderRadius: 14,
                background: "#fff",
                border: "1px solid #e5e7eb",
                boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
              }}
            >
              {/* 제목줄 */}
              <div
                onClick={() => toggleExpand(n.id)}
                style={{
                  cursor: "pointer",
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 10,
                }}
              >
                <div style={{ flex: 1 }}>
                  {n.isPinned && (
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 11,
                        background: "#fff7ed",
                        color: "#ea580c",
                        borderRadius: 999,
                        padding: "2px 8px",
                        marginRight: 6,
                        border: "1px solid #fed7aa",
                        fontWeight: 800,
                      }}
                    >
                      상단고정
                    </span>
                  )}

                  {isImportant && (
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 11,
                        background: "#eff6ff",
                        color: "#2563eb",
                        borderRadius: 999,
                        padding: "2px 8px",
                        marginRight: 6,
                        border: "1px solid #bfdbfe",
                        fontWeight: 800,
                      }}
                    >
                      중요
                    </span>
                  )}

                  <span style={{ fontSize: 15, fontWeight: 700 }}>{n.title}</span>
                </div>

                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 12, color: "#9ca3af", whiteSpace: "nowrap" }}>
                    {n.date}
                  </span>
                  <span style={{ fontSize: 12, color: "#6b7280" }}>
                    {isExpanded ? "▲" : "▼"}
                  </span>
                </div>
              </div>

              {/* 내용 */}
              {isExpanded && (
                <div
                  style={{
                    marginTop: 10,
                    paddingTop: 10,
                    borderTop: "1px dashed #e5e7eb",
                    fontSize: 14,
                    lineHeight: 1.7,
                    color: "#111827",
                  }}
                >
                  {detail ? (
                    <div dangerouslySetInnerHTML={{ __html: detail.html }} />
                  ) : (
                    <div style={{ fontSize: 13, color: "#6b7280" }}>불러오는 중...</div>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
