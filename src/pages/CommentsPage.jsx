import { useEffect, useMemo, useState } from "react";
import { db } from "../firebase";
import {
  collection,
  onSnapshot,
  addDoc,
  deleteDoc,
  updateDoc,
  doc,
  getDoc,
  serverTimestamp,
} from "firebase/firestore";

export default function CommentsPage() {
  const [comments, setComments] = useState([]);
  const [answers, setAnswers] = useState([]); // answer 컬렉션(답변)
  const [replies, setReplies] = useState({}); // 각 코멘트별 답변 텍스트

  const [editingReplyId, setEditingReplyId] = useState(null);
  const [editedReplyText, setEditedReplyText] = useState("");

  const studentId = localStorage.getItem("studentId");

  // ✅ 모바일 감지
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia("(max-width: 640px)").matches;
  });

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

  // ✅ 코멘트 불러오기 (comments 컬렉션)
  useEffect(() => {
    if (!studentId) return;
    const ref = collection(db, "comments");

    return onSnapshot(ref, (snapshot) => {
      const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const myComments = all.filter((c) => c.studentId === studentId);

      setComments(
        myComments.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      );
    });
  }, [studentId]);

  // ✅ 답변 불러오기 (answer 컬렉션)
  useEffect(() => {
    if (!studentId) return;
    const ref = collection(db, "answer");

    return onSnapshot(ref, (snapshot) => {
      const all = snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
      const myAnswers = all.filter((a) => a.studentId === studentId);

      setAnswers(
        myAnswers.sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""))
      );
    });
  }, [studentId]);

  // ✅ 코멘트별 답변 묶기 (성능/가독성)
  const repliesByParent = useMemo(() => {
    const map = {};
    for (const a of answers) {
      const key = a.parentId || "unknown";
      if (!map[key]) map[key] = [];
      map[key].push(a);
    }
    Object.keys(map).forEach((k) => {
      map[k].sort((x, y) => (y.createdAt || "").localeCompare(x.createdAt || ""));
    });
    return map;
  }, [answers]);

  const fmtTime = (iso) => {
    if (!iso) return "";
    return iso.slice(0, 19).replace("T", " ");
  };

  // ✅ 답변 저장
  const handleReply = async (commentId) => {
    const replyText = (replies[commentId] || "").trim();
    if (!replyText) return alert("답변을 입력해주세요!");
    if (!studentId) return alert("학생 정보가 없습니다. 다시 로그인 후 이용해주세요.");

    const studentDoc = await getDoc(doc(db, "students", studentId));
    const studentName = studentDoc.exists() ? studentDoc.data().name : "이름없음";

    await addDoc(collection(db, "answer"), {
      studentId,
      studentName,
      comment: replyText,
      date: new Date().toISOString().slice(0, 10),
      createdAt: new Date().toISOString(),
      createdAtServer: serverTimestamp(),
      parentId: commentId,
    });

    setReplies((prev) => ({ ...prev, [commentId]: "" }));
    alert("답변이 저장되었습니다!");
  };

  // ✅ 답변 삭제
  const handleDeleteReply = async (id) => {
    if (window.confirm("정말 이 답변을 삭제하시겠습니까?")) {
      await deleteDoc(doc(db, "answer", id));
    }
  };

  // ✅ 답변 수정
  const handleUpdateReply = async (id) => {
    if (!editedReplyText.trim()) return alert("수정할 답변을 입력하세요!");
    await updateDoc(doc(db, "answer", id), {
      comment: editedReplyText,
      updatedAt: new Date().toISOString(),
      updatedAtServer: serverTimestamp(),
    });
    setEditingReplyId(null);
    setEditedReplyText("");
  };

  const styles = {
    page: {
      maxWidth: 920,
      margin: "0 auto",
      padding: isMobile ? "16px 12px 60px" : "28px 14px 60px",
    },
    header: {
      display: "flex",
      flexDirection: "column",
      gap: 6,
      marginBottom: 16,
      textAlign: "left",
    },
    title: { fontSize: isMobile ? 18 : 22, fontWeight: 900, letterSpacing: -0.3 },
    sub: { fontSize: 13, color: "#6b7280" },

    list: { listStyle: "none", padding: 0, margin: 0, display: "grid", gap: 12 },

    card: {
      background: "#fff",
      border: "1px solid #eef2f7",
      borderRadius: 14,
      padding: isMobile ? 12 : 14,
      boxShadow: "0 6px 18px rgba(15, 23, 42, 0.06)",
    },
    cardTop: {
      display: "flex",
      alignItems: "flex-start",
      justifyContent: "space-between",
      gap: 10,
      marginBottom: 10,
    },
    commentText: {
      fontSize: 14,
      lineHeight: 1.6,
      color: "#111827",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    },
    metaRow: { display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 },
    pill: {
      fontSize: 12,
      padding: "4px 10px",
      borderRadius: 999,
      background: "#f3f4f6",
      color: "#374151",
    },
    pillBlue: {
      fontSize: 12,
      padding: "4px 10px",
      borderRadius: 999,
      background: "#eff6ff",
      color: "#1d4ed8",
      border: "1px solid #dbeafe",
    },

    replyWrap: {
      marginTop: 12,
      paddingTop: 12,
      borderTop: "1px dashed #e5e7eb",
      display: "grid",
      gap: 10,
    },

    replyCard: {
      background: "#f8fafc",
      border: "1px solid #e2e8f0",
      borderRadius: 12,
      padding: 10,
    },
    replyText: {
      fontSize: 13,
      lineHeight: 1.55,
      color: "#0f172a",
      whiteSpace: "pre-wrap",
      wordBreak: "break-word",
    },
    replyActions: { marginTop: 8, display: "flex", gap: 8, flexWrap: "wrap" },

    textarea: {
      width: "100%",
      minHeight: isMobile ? 92 : 88,
      resize: "vertical",
      borderRadius: 12,
      border: "1px solid #e5e7eb",
      padding: "10px 12px",
      outline: "none",
      fontSize: 13,
      lineHeight: 1.5,
      background: "#fff",
    },

    row: { display: "flex", gap: 8, justifyContent: "flex-end", flexWrap: "wrap" },

    btn: {
      border: "1px solid #e5e7eb",
      background: "#fff",
      padding: "10px 12px", // ✅ 모바일 터치영역 확대
      borderRadius: 10,
      fontSize: 13,
      cursor: "pointer",
    },
    btnPrimary: {
      border: "1px solid #2563eb",
      background: "#2563eb",
      color: "#fff",
      padding: "10px 12px",
      borderRadius: 10,
      fontSize: 13,
      cursor: "pointer",
      fontWeight: 700,
    },
    btnDanger: {
      border: "1px solid #fecaca",
      background: "#fff",
      color: "#b91c1c",
      padding: "10px 12px",
      borderRadius: 10,
      fontSize: 13,
      cursor: "pointer",
      fontWeight: 700,
    },
    empty: { color: "#6b7280", fontSize: 14, padding: 18, textAlign: "center" },
  };

  const filteredComments = comments.filter((c) => !c.comment?.startsWith("답변:"));

  return (
    <div style={styles.page}>
      <div style={styles.header}>
        <div style={styles.title}>📝 저장된 코멘트</div>
        <div style={styles.sub}>한 달에 한 번 정도 코멘트가 저장됩니다.</div>
      </div>

      <ul style={styles.list}>
        {filteredComments.map((c) => {
          const relatedReplies = repliesByParent[c.id] || [];

          return (
            <li key={c.id} style={styles.card}>
              <div style={styles.cardTop}>
                <div style={{ flex: 1 }}>
                  <div style={styles.commentText}>{c.comment || ""}</div>

                  <div style={styles.metaRow}>
                    <span style={styles.pillBlue}>📅 {c.date || "-"}</span>
                    {c.createdAt ? (
                      <span style={styles.pill}>🕒 저장 {fmtTime(c.createdAt)}</span>
                    ) : (
                      <span style={styles.pill}>🕒 저장시간 -</span>
                    )}
                  </div>
                </div>
              </div>

              <div style={styles.replyWrap}>
                {relatedReplies.map((r) => (
                  <div key={r.id} style={styles.replyCard}>
                    {editingReplyId === r.id ? (
                      <>
                        <textarea
                          value={editedReplyText}
                          onChange={(e) => setEditedReplyText(e.target.value)}
                          style={styles.textarea}
                        />
                        <div style={styles.row}>
                          <button
                            style={styles.btnPrimary}
                            onClick={() => handleUpdateReply(r.id)}
                          >
                            저장
                          </button>
                          <button style={styles.btn} onClick={() => setEditingReplyId(null)}>
                            취소
                          </button>
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={styles.replyText}>💬 {r.comment || ""}</div>
                        <div style={{ ...styles.metaRow, marginTop: 8 }}>
                          <span style={styles.pill}>📅 {r.date || "-"}</span>
                          {r.createdAt ? (
                            <span style={styles.pill}>🕒 {fmtTime(r.createdAt)}</span>
                          ) : null}
                        </div>
                        <div style={styles.replyActions}>
                          <button
                            style={styles.btn}
                            onClick={() => {
                              setEditingReplyId(r.id);
                              setEditedReplyText(r.comment || "");
                            }}
                          >
                            수정
                          </button>
                          <button
                            style={styles.btnDanger}
                            onClick={() => handleDeleteReply(r.id)}
                          >
                            삭제
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                <div>
                  <textarea
                    placeholder="답변 입력 (줄바꿈 가능)"
                    value={replies[c.id] || ""}
                    onChange={(e) =>
                      setReplies((prev) => ({ ...prev, [c.id]: e.target.value }))
                    }
                    style={styles.textarea}
                  />
                  <div style={styles.row}>
                    <button style={styles.btnPrimary} onClick={() => handleReply(c.id)}>
                      답변 저장
                    </button>
                  </div>
                </div>
              </div>
            </li>
          );
        })}

        {filteredComments.length === 0 && (
          <li style={styles.empty}>등록된 코멘트가 없습니다.</li>
        )}
      </ul>
    </div>
  );
}
