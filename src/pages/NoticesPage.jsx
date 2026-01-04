// ✅ src/pages/NoticesPage.jsx
import { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import { collection, getDocs, doc, getDoc, setDoc } from "firebase/firestore";

// 이번달 공지 몇 개까지 보여줄지
const MAX_VISIBLE_CURRENT_NOTICES_MOBILE = 6;
const MAX_VISIBLE_CURRENT_NOTICES_DESKTOP = 10;

// 상단(필독/중요) 몇 개까지 보여줄지
const MAX_VISIBLE_TOP_NOTICES_MOBILE = 6;
const MAX_VISIBLE_TOP_NOTICES_DESKTOP = 10;

function plainToHtml(text = "") {
  if (!text) return "";
  return text
    .split("\n")
    .map((line) => line || "&nbsp;")
    .join("<br />");
}

function getLocalYYYYMM() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  return `${y}-${m}`; // YYYY-MM
}

export default function NoticesPage() {
  const parentPhone = localStorage.getItem("parentPhone") || "";

  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 640px)").matches;
  });

  // 공지
  const [notices, setNotices] = useState([]);
  const [expandedId, setExpandedId] = useState(null);
  const [noticeDetails, setNoticeDetails] = useState({}); // id -> { html, plain }
  const [loadingNotices, setLoadingNotices] = useState(true);

  // 휴일
  const [holidays, setHolidays] = useState([]);
  const [showPastHolidays, setShowPastHolidays] = useState(false);
  const [loadingHolidays, setLoadingHolidays] = useState(true);

  // 지난 공지 보기(토글)
  const [showPastNotices, setShowPastNotices] = useState(false);

  // 공지 알림 ON/OFF (부모별)
  const [noticeAlertEnabled, setNoticeAlertEnabled] = useState(true);
  const [savingAlert, setSavingAlert] = useState(false);

  // 모바일 감지
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 640px)");
    const onChange = (e) => setIsMobile(e.matches);
    if (mq.addEventListener) mq.addEventListener("change", onChange);
    else mq.addListener(onChange);
    setIsMobile(mq.matches);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener("change", onChange);
      else mq.removeListener(onChange);
    };
  }, []);

  // 부모의 공지알림 설정 읽기
  useEffect(() => {
    (async () => {
      if (!parentPhone) return;
      try {
        const pSnap = await getDoc(doc(db, "parents", parentPhone));
        if (pSnap.exists()) {
          const data = pSnap.data() || {};
          const v =
            data.noticeAlertEnabled === undefined
              ? true
              : Boolean(data.noticeAlertEnabled);
          setNoticeAlertEnabled(v);
        } else {
          setNoticeAlertEnabled(true);
        }
      } catch {
        setNoticeAlertEnabled(true);
      }
    })();
  }, [parentPhone]);

  // 공지 + 휴일 가져오기
  useEffect(() => {
    // 공지
    (async () => {
      setLoadingNotices(true);
      try {
        const snap = await getDocs(collection(db, "notices"));
        const list = snap.docs.map((d) => {
          const data = d.data() || {};

          // ✅ 여기 핵심!! showInParentMain
          // - 필드 없으면(예전 공지) 기본 노출 true
          // - false면 학부모 화면에서 완전 숨김
          const showInParentMain =
            data.showInParentMain === undefined ? true : Boolean(data.showInParentMain);

          return {
            id: d.id,
            title: (data.title || "").toString(),
            date: (data.date || "").toString(), // YYYY-MM-DD 권장

            // ✅ 학부모 메인 노출 여부
            showInParentMain,

            // ✅ mainOrder 숫자 있으면 "필독/중요 공지" 대상
            mainOrder:
              typeof data.mainOrder === "number"
                ? data.mainOrder
                : typeof data.priority === "number"
                ? data.priority
                : undefined,

            isPinned: data.isPinned === true,
          };
        });

        // ✅ showInParentMain이 false면 아예 안 보이게!
        const filtered = list.filter((n) => n.showInParentMain === true);

        // 기본 정렬(분리 후 각각 정렬하지만, 일단 최신순)
        filtered.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setNotices(filtered);
      } catch (e) {
        console.error("notices 로딩 오류:", e);
        setNotices([]);
      } finally {
        setLoadingNotices(false);
      }
    })();

    // 휴일
    (async () => {
      setLoadingHolidays(true);
      try {
        const snap = await getDocs(collection(db, "holidays"));
        const raw = snap.docs
          .map((d) => ({ id: d.id, ...(d.data() || {}) }))
          .filter((h) => !!h.date);

        raw.sort((a, b) =>
          (a.date || "").toString().localeCompare((b.date || "").toString())
        );
        setHolidays(raw);
      } catch (e) {
        console.error("holidays 로딩 오류:", e);
        setHolidays([]);
      } finally {
        setLoadingHolidays(false);
      }
    })();
  }, []);

  const currentYM = useMemo(() => getLocalYYYYMM(), []);
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);

  // 휴일: 이번달 + 지난 휴일
  const { upcomingThisMonth, pastHolidays } = useMemo(() => {
    const thisMonth = [];
    const past = [];
    for (const h of holidays) {
      const dt = (h.date || "").toString();
      if (!dt) continue;
      if (dt.startsWith(currentYM)) thisMonth.push(h);
      if (dt < todayStr) past.push(h);
    }

    thisMonth.sort((a, b) =>
      (a.date || "").toString().localeCompare((b.date || "").toString())
    );
    past.sort((a, b) =>
      (b.date || "").toString().localeCompare((a.date || "").toString())
    );

    const limitedThisMonth = isMobile ? thisMonth.slice(0, 6) : thisMonth.slice(0, 12);
    return { upcomingThisMonth: limitedThisMonth, pastHolidays: past };
  }, [holidays, currentYM, todayStr, isMobile]);

  // ✅ 원하는 순서대로 분리:
  // 1) 필독/중요(mainOrder 있는 것)
  // 2) 이번달 공지(mainOrder 없는 것만)
  // 3) 지난 공지(mainOrder 없는 것만)
  const { topNotices, currentNotices, pastNotices, topIdSet } = useMemo(() => {
    const top = [];
    const inMonth = [];
    const past = [];

    for (const n of notices) {
      const hasMain = typeof n.mainOrder === "number";
      const isThisMonth = (n.date || "").startsWith(currentYM);

      if (hasMain) top.push(n);
      else if (isThisMonth) inMonth.push(n);
      else past.push(n);
    }

    // 상단(필독/중요) 정렬: mainOrder 작은 순 → 같으면 최신순
    top.sort((a, b) => {
      const oa = a.mainOrder ?? 9999;
      const ob = b.mainOrder ?? 9999;
      if (oa !== ob) return oa - ob;
      return (b.date || "").localeCompare(a.date || "");
    });

    // 이번달/지난 공지는 최신순
    inMonth.sort((a, b) => (b.date || "").localeCompare(a.date || ""));
    past.sort((a, b) => (b.date || "").localeCompare(a.date || ""));

    const maxTop = isMobile ? MAX_VISIBLE_TOP_NOTICES_MOBILE : MAX_VISIBLE_TOP_NOTICES_DESKTOP;
    const maxMonth = isMobile
      ? MAX_VISIBLE_CURRENT_NOTICES_MOBILE
      : MAX_VISIBLE_CURRENT_NOTICES_DESKTOP;

    const topSliced = top.slice(0, maxTop);
    const set = new Set(topSliced.map((x) => x.id));

    return {
      topNotices: topSliced,
      currentNotices: inMonth.slice(0, maxMonth),
      pastNotices: past,
      topIdSet: set,
    };
  }, [notices, currentYM, isMobile]);

  // 상세 1회 로딩
  const ensureDetailLoaded = async (id) => {
    if (noticeDetails[id]) return;
    try {
      const snap = await getDoc(doc(db, "notices", id));
      if (snap.exists()) {
        const data = snap.data() || {};
        const contentHtml = (data.contentHtml || "").toString();
        const contentPlain = (data.contentPlain || "").toString();
        const oldContent = (data.content || "").toString();

        const finalPlain = contentPlain || oldContent;
        let finalHtml = contentHtml;
        if (!finalHtml) finalHtml = plainToHtml(finalPlain);

        setNoticeDetails((prev) => ({
          ...prev,
          [id]: { html: finalHtml, plain: finalPlain },
        }));
      } else {
        setNoticeDetails((prev) => ({
          ...prev,
          [id]: { html: "내용이 없습니다.", plain: "내용이 없습니다." },
        }));
      }
    } catch (e) {
      console.error("notice detail 로딩 오류:", e);
      setNoticeDetails((prev) => ({
        ...prev,
        [id]: { html: "내용을 불러오지 못했습니다.", plain: "" },
      }));
    }
  };

  const toggleExpand = async (id) => {
    if (expandedId === id) {
      setExpandedId(null);
      return;
    }
    await ensureDetailLoaded(id);
    setExpandedId(id);
  };

  // 공지 알림 토글 저장
  const toggleNoticeAlert = async () => {
    if (!parentPhone) {
      alert("부모 정보가 없습니다. 다시 로그인해주세요.");
      return;
    }
    const next = !noticeAlertEnabled;
    setSavingAlert(true);
    try {
      await setDoc(
        doc(db, "parents", parentPhone),
        { noticeAlertEnabled: next },
        { merge: true }
      );
      setNoticeAlertEnabled(next);
    } catch (e) {
      console.error("공지 알림 설정 저장 오류:", e);
      alert("저장에 실패했어요. 잠시 후 다시 시도해주세요.");
    } finally {
      setSavingAlert(false);
    }
  };

  // 스타일
  const wrap = { maxWidth: 820, margin: "0 auto", padding: isMobile ? 10 : 16 };

  const sectionTitleRow = {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 10,
    flexDirection: isMobile ? "column" : "row",
  };

  const pillBtn = (active) => ({
    border: "1px solid " + (active ? "#111827" : "#d1d5db"),
    background: active ? "#111827" : "white",
    color: active ? "white" : "#111827",
    borderRadius: 999,
    padding: "8px 12px",
    fontWeight: 900,
    fontSize: 12,
    cursor: "pointer",
    width: isMobile ? "100%" : "auto",
    opacity: savingAlert ? 0.7 : 1,
  });

  const compactCard = { border: "1px solid #e5e7eb", borderRadius: 14, background: "#fff" };

  const noticeRow = (isExpanded) => ({
    padding: isMobile ? "12px 12px" : "12px 14px",
    borderRadius: 12,
    border: "1px solid #e5e7eb",
    background: isExpanded ? "#f8fafc" : "#fff",
    cursor: "pointer",
  });

  const chip = {
    padding: "6px 10px",
    borderRadius: 999,
    background: "#fff",
    border: "1px solid #e5e7eb",
    fontSize: 12,
    display: "flex",
    gap: 6,
    alignItems: "center",
  };

  const smallLinkBtn = {
    border: "none",
    background: "none",
    color: "#2563eb",
    fontSize: 13,
    fontWeight: 800,
    cursor: "pointer",
    padding: 0,
  };

  // 중요공지(버튼/칩) 스타일
  const topBarWrap = {
    ...compactCard,
    border: "1px solid #e5e7eb",
    background: "linear-gradient(135deg, #fff7ed, #eff6ff)",
    padding: isMobile ? "10px 10px" : "12px 12px",
    marginTop: 10,
    marginBottom: 10,
  };

  const topBarTitle = {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontWeight: 900,
    fontSize: 14,
    marginBottom: 8,
  };

  const topPill = (type) => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "6px 10px",
    borderRadius: 999,
    border: "1px solid " + (type === "must" ? "#fecaca" : "#bfdbfe"),
    background: type === "must" ? "#fee2e2" : "#eff6ff",
    color: type === "must" ? "#b91c1c" : "#2563eb",
    fontSize: 12,
    fontWeight: 900,
    cursor: "pointer",
    maxWidth: "100%",
  });

  const ellipsis1 = {
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    maxWidth: isMobile ? 240 : 520,
  };

  const ymLabel = `${currentYM.slice(0, 4)}년 ${currentYM.slice(5, 7)}월`;

  const renderNoticeCard = (n) => {
    const isExpanded = expandedId === n.id;
    const detail = noticeDetails[n.id];

    const hasMainOrder = typeof n.mainOrder === "number";
    const isMustRead = hasMainOrder && n.mainOrder < 10;
    const isImportant = hasMainOrder && n.mainOrder >= 10;

    return (
      <div key={n.id} style={noticeRow(isExpanded)} onClick={() => toggleExpand(n.id)}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, alignItems: "center" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: "flex", gap: 6, alignItems: "center", flexWrap: "wrap" }}>
              {isMustRead && (
                <span style={{
                  fontSize: 11, background: "#fee2e2", color: "#b91c1c",
                  borderRadius: 999, padding: "2px 8px", border: "1px solid #fecaca", fontWeight: 900,
                }}>
                  🔴 필독
                </span>
              )}
              {isImportant && (
                <span style={{
                  fontSize: 11, background: "#eff6ff", color: "#2563eb",
                  borderRadius: 999, padding: "2px 8px", border: "1px solid #bfdbfe", fontWeight: 900,
                }}>
                  중요
                </span>
              )}
            </div>

            <div style={{
              marginTop: 6, fontSize: 15, fontWeight: 900, lineHeight: 1.35,
              display: "-webkit-box", WebkitLineClamp: isMobile ? 2 : 2,
              WebkitBoxOrient: "vertical", overflow: "hidden",
            }}>
              {n.title}
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 6 }}>
            <span style={{ fontSize: 12, color: "#9ca3af", fontWeight: 800, whiteSpace: "nowrap" }}>
              {n.date}
            </span>
            <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 900 }}>
              {isExpanded ? "▲" : "▼"}
            </span>
          </div>
        </div>

        {isExpanded && (
          <div style={{
            marginTop: 10, paddingTop: 10, borderTop: "1px dashed #e5e7eb",
            fontSize: 14, lineHeight: 1.65, color: "#111827", wordBreak: "break-word",
          }}>
            {detail ? (
              <div dangerouslySetInnerHTML={{ __html: detail.html }} />
            ) : (
              <div style={{ fontSize: 13, color: "#6b7280" }}>불러오는 중...</div>
            )}
          </div>
        )}
      </div>
    );
  };

  // 중요공지에서 눌렀을 때 펼쳐질 대상 찾기
  const expandedTopNotice = useMemo(() => {
    if (!expandedId) return null;
    if (!topIdSet || !topIdSet.has(expandedId)) return null;
    return topNotices.find((x) => x.id === expandedId) || null;
  }, [expandedId, topIdSet, topNotices]);

  return (
    <div style={wrap}>
      {/* 휴일(이번달만 요약) */}
      <div style={{
        ...compactCard,
        background: "linear-gradient(135deg, #f0f9ff, #e0f2fe)",
        border: "1px solid #bae6fd",
        padding: isMobile ? "12px 12px" : "14px 16px",
        marginBottom: 14,
      }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ fontSize: 18 }}>📅</span>
            <div style={{ fontWeight: 900, fontSize: 15 }}>휴일 안내</div>
            <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>{ymLabel}</span>
          </div>

          {pastHolidays.length > 0 && (
            <button onClick={() => setShowPastHolidays((v) => !v)} style={smallLinkBtn}>
              {showPastHolidays ? "지난 휴일 닫기 ▲" : "지난 휴일 보기 ▼"}
            </button>
          )}
        </div>

        <div style={{ marginTop: 10 }}>
          {loadingHolidays ? (
            <div style={{ fontSize: 13, color: "#6b7280" }}>휴일 불러오는 중...</div>
          ) : upcomingThisMonth.length > 0 ? (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              {upcomingThisMonth.map((h) => (
                <div key={h.id} style={chip}>
                  <span style={{ fontWeight: 900 }}>{(h.name || "휴일").toString()}</span>
                  <span style={{ color: "#dc2626", fontSize: 12, fontWeight: 800 }}>
                    {(h.date || "").toString()}
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <div style={{ fontSize: 13, color: "#6b7280" }}>이번 달 휴일이 없습니다.</div>
          )}

          {showPastHolidays && pastHolidays.length > 0 && (
            <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
              {pastHolidays.slice(0, isMobile ? 12 : 30).map((h) => (
                <div key={h.id} style={{
                  fontSize: 12, padding: "5px 10px", borderRadius: 999,
                  background: "#f8fafc", border: "1px solid #e5e7eb",
                  color: "#6b7280", fontWeight: 700,
                }}>
                  {(h.name || "휴일").toString()} · {(h.date || "").toString()}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 공지 타이틀 + 알림 토글 */}
      <div style={sectionTitleRow}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
          <h1 style={{ fontSize: isMobile ? 18 : 20, fontWeight: 900, margin: 0 }}>📣 공지사항</h1>
          <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>
            {ymLabel} 공지만 표시
          </span>
        </div>

        <button
          onClick={toggleNoticeAlert}
          disabled={savingAlert}
          style={pillBtn(noticeAlertEnabled)}
          title="새 공지 알림(푸시/알림톡 연동 시) ON/OFF"
        >
          {savingAlert ? "저장 중..." : noticeAlertEnabled ? "공지 알림 ON" : "공지 알림 OFF"}
        </button>
      </div>

      {/* (폰 편하게) 타이틀 바로 아래: 필독/중요 공지 */}
      {!loadingNotices && topNotices.length > 0 && (
        <div style={topBarWrap}>
          <div style={topBarTitle}>
            <span style={{ fontSize: 16 }}>⭐</span>
            <span>중요 공지</span>
            <span style={{ fontSize: 12, color: "#6b7280", fontWeight: 800 }}>(날짜와 무관)</span>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
            {topNotices.map((n) => {
              const isMust = typeof n.mainOrder === "number" && n.mainOrder < 10;
              const type = isMust ? "must" : "imp";
              return (
                <button
                  key={n.id}
                  style={topPill(type)}
                  onClick={async (e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    await ensureDetailLoaded(n.id);
                    setExpandedId((prev) => (prev === n.id ? null : n.id));
                  }}
                  title={n.title}
                >
                  <span>{isMust ? "🔴" : "🔵"}</span>
                  <span style={ellipsis1}>{n.title}</span>
                </button>
              );
            })}
          </div>

          {expandedTopNotice && (
            <div style={{ marginTop: 10 }}>{renderNoticeCard(expandedTopNotice)}</div>
          )}
        </div>
      )}

      {/* 이번달 공지 (중요공지는 제외됨) */}
      <div style={{ marginTop: 12, display: "flex", flexDirection: "column", gap: 10 }}>
        {loadingNotices ? (
          <div style={{ fontSize: 13, color: "#6b7280" }}>공지 불러오는 중...</div>
        ) : currentNotices.length === 0 ? (
          <div style={{ fontSize: 13, color: "#9ca3af" }}>이번 달 공지가 없습니다.</div>
        ) : (
          currentNotices.map(renderNoticeCard)
        )}
      </div>

      {/* 지난 공지 */}
      {!loadingNotices && pastNotices.length > 0 && (
        <div style={{ marginTop: 14 }}>
          <button onClick={() => setShowPastNotices((v) => !v)} style={smallLinkBtn}>
            {showPastNotices ? "지난 공지 닫기 ▲" : `지난 공지 보기 ▼ (${pastNotices.length}개)`}
          </button>

          {showPastNotices && (
            <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
              {pastNotices.slice(0, isMobile ? 15 : 30).map(renderNoticeCard)}
              <div style={{ fontSize: 12, color: "#9ca3af", marginTop: 2 }}>
                ※ 지난 공지는 최대 {isMobile ? "15" : "30"}개까지만 표시됩니다.
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
