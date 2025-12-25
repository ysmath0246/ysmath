// src/pages/NoticesPage.jsx
import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, getDocs, doc, getDoc } from "firebase/firestore";

const MAX_VISIBLE_NOTICES = 5; // 학부모에게 보여줄 최대 공지 개수

// 🔹 plain 텍스트를 HTML(<br />) 형태로 바꿔주는 함수
function plainToHtml(text = "") {
  if (!text) return "";
  // 특수문자까지 다 escape 하려면 라이브러리 필요하지만,
  // 여기서는 줄바꿈만 처리해도 충분해서 간단히 사용
  return text
    .split("\n")
    .map((line) => line || "&nbsp;")
    .join("<br />");
}

export default function NoticesPage() {
  const [notices, setNotices] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  // id -> { html, plain }
  const [noticeDetails, setNoticeDetails] = useState({});

  const [upcomingHolidays, setUpcomingHolidays] = useState([]);
  const [pastHolidays, setPastHolidays] = useState([]);
  const [showPastHolidays, setShowPastHolidays] = useState(false);

  useEffect(() => {
    // ✅ 공지 가져오기
    (async () => {
      const snap = await getDocs(collection(db, "notices"));

      const list = snap.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          title: data.title || "",
          date: data.date || "",
          showOnParents: data.showOnParents, // true / false / undefined
          isPinned: data.isPinned === true,
          priority:
            typeof data.priority === "number" ? data.priority : 9999,
        };
      });

      // 🔍 기본값: showOnParents 가 false 가 아니면 다 보임 (undefined = 보임)
      const filtered = list.filter((n) => n.showOnParents !== false);

      // 📌 정렬: 상단 고정 → priority → 날짜(최신순)
      filtered.sort((a, b) => {
        const pinA = a.isPinned ? 1 : 0;
        const pinB = b.isPinned ? 1 : 0;
        if (pinA !== pinB) return pinB - pinA;

        const pa = a.priority ?? 9999;
        const pb = b.priority ?? 9999;
        if (pa !== pb) return pa - pb;

        const da = a.date || "";
        const dbb = b.date || "";
        return dbb.localeCompare(da);
      });

      setNotices(filtered.slice(0, MAX_VISIBLE_NOTICES));
    })();

    // ✅ 휴일 가져오기 (다가오는 / 지난 휴일 분리)
    (async () => {
      const snap = await getDocs(collection(db, "holidays"));
      const todayStr = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

      const raw = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((h) => !!h.date);

      // 다가오는 휴일 (오늘 포함 이후)
      const upcoming = raw
        .filter((h) => (h.date || "").toString() >= todayStr)
        .sort((a, b) =>
          (a.date || "").toString().localeCompare((b.date || "").toString())
        );

      // 지난 휴일 (과거 → 최근순)
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
        const data = snap.data();

        const contentHtml = (data.contentHtml || "").toString();
        const contentPlain = (data.contentPlain || "").toString();
        const oldContent = (data.content || "").toString();

        let finalPlain = contentPlain || oldContent;
        let finalHtml = contentHtml;

        // contentHtml 이 없으면 plain → <br />로 바꿔서 HTML처럼 보여주기
        if (!finalHtml) {
          finalHtml = plainToHtml(finalPlain);
        }

        setNoticeDetails((prev) => ({
          ...prev,
          [id]: {
            html: finalHtml,
            plain: finalPlain,
          },
        }));
      }
    }

    setExpandedId(id);
  };

  return (
    <div
      className="container"
      style={{ maxWidth: 800, margin: "0 auto", padding: "16px" }}
    >
      {/* 🟦 다가오는 휴일 박스 (항상 맨 위) */}
      <div
        style={{
          background: "#f9fafb",
          padding: "12px 14px",
          borderRadius: 8,
          marginBottom: 18,
          border: "1px solid #e5e7eb",
        }}
      >
        <h2
          style={{
            fontSize: 18,
            fontWeight: 600,
            marginBottom: 6,
            display: "flex",
            alignItems: "center",
            gap: 6,
          }}
        >
          <span>📅</span> <span>다가오는 휴일 안내</span>
        </h2>
        {upcomingHolidays.length > 0 ? (
          <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
            {upcomingHolidays.map((h) => (
              <li
                key={h.id}
                style={{
                  marginBottom: 4,
                  fontSize: 14,
                  display: "flex",
                  justifyContent: "space-between",
                }}
              >
                <span>{h.name}</span>
                <span style={{ color: "#dc2626", marginLeft: 8 }}>
                  {h.date}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p style={{ fontSize: 13, color: "#6b7280", margin: 0 }}>
            예정된 휴일이 없습니다.
          </p>
        )}

        {/* 🔻 지난 휴일 토글 버튼 + 내용 */}
        {pastHolidays.length > 0 && (
          <div style={{ marginTop: 10 }}>
            <button
              type="button"
              onClick={() => setShowPastHolidays((v) => !v)}
              style={{
                fontSize: 12,
                padding: "4px 8px",
                borderRadius: 4,
                border: "1px solid #d1d5db",
                background: "white",
                cursor: "pointer",
              }}
            >
              {showPastHolidays ? "지난 휴일 접기 ▲" : "지난 휴일 보기 ▼"}
            </button>

            {showPastHolidays && (
              <div
                style={{
                  marginTop: 8,
                  maxHeight: 160,
                  overflowY: "auto",
                  borderTop: "1px dashed #e5e7eb",
                  paddingTop: 6,
                }}
              >
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {pastHolidays.map((h) => (
                    <li
                      key={h.id}
                      style={{
                        marginBottom: 3,
                        fontSize: 13,
                        display: "flex",
                        justifyContent: "space-between",
                        color: "#6b7280",
                      }}
                    >
                      <span>{h.name}</span>
                      <span style={{ marginLeft: 8 }}>{h.date}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>

      {/* 🟧 공지 리스트 (상세 포함) */}
      <h1
        style={{
          fontSize: 22,
          fontWeight: 700,
          marginBottom: 10,
        }}
      >
        📣 공지사항
      </h1>

      {notices.length === 0 && (
        <p style={{ fontSize: 14, color: "#6b7280" }}>
          현재 학부모용으로 노출되는 공지사항이 없습니다.
        </p>
      )}

      <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
        {notices.map((n) => {
          const isExpanded = expandedId === n.id;
          const detail = noticeDetails[n.id];

          return (
            <li
              key={n.id}
              style={{
                margin: "6px 0",
                borderBottom: "1px solid #e5e7eb",
                padding: "8px 4px 10px",
              }}
            >
              {/* 제목 줄 */}
              <div
                onClick={() => toggleExpand(n.id)}
                style={{
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: 15,
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <span style={{ flex: 1 }}>
                  {n.isPinned && (
                    <span
                      style={{
                        display: "inline-block",
                        fontSize: 11,
                        color: "#f97316",
                        border: "1px solid #fed7aa",
                        borderRadius: 4,
                        padding: "2px 4px",
                        marginRight: 6,
                      }}
                    >
                      상단고정
                    </span>
                  )}
                  {n.title}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "#6b7280",
                    whiteSpace: "nowrap",
                  }}
                >
                  {n.date}
                </span>
              </div>

              {/* 펼쳐진 내용 */}
              {isExpanded && (
                <div style={{ marginTop: 8 }}>
                  {detail ? (
                    <div
                      style={{
                        fontSize: 14,
                        color: "#111827",
                        lineHeight: 1.6,
                      }}
                      dangerouslySetInnerHTML={{ __html: detail.html }}
                    />
                  ) : (
                    <span style={{ fontSize: 13, color: "#6b7280" }}>
                      불러오는 중...
                    </span>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}
