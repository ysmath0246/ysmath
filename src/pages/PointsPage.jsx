// src/pages/PointsPage.jsx
import { useState, useEffect } from "react";
import { db } from "../firebase";
import { collection, doc, onSnapshot } from "firebase/firestore";
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell
} from "../components/ui/table";

export default function PointsPage() {
  const studentId = localStorage.getItem("studentId");
  const [me, setMe] = useState(null);
  const [allStudents, setAllStudents] = useState([]);

  // 포인트 항목 리스트 (students 컬렉션 내 points 객체 키 기준)
  const [fields, setFields] = useState([]);

  // 내 정보 구독
  useEffect(() => {
    if (!studentId) return;
    const unsub = onSnapshot(
      doc(db, "students", studentId),
      snap => {
        if (snap.exists()) {
          const data = { id: snap.id, ...snap.data() };
          setMe(data);
          if (data.points) {
            setFields(Object.keys(data.points));
          }
        }
      }
    );
    return () => unsub();
  }, [studentId]);

  // 전체 학생 구독
  useEffect(() => {
    const unsub = onSnapshot(
      collection(db, "students"),
      snapshot => {
        const list = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
        setAllStudents(list);
      }
    );
    return () => unsub();
  }, []);

  if (!me) return <p>로딩 중…</p>;

  // 내 총 포인트
  const myTotal = fields.reduce((sum, f) => sum + (me.points[f] || 0), 0);

  // 전체 랭킹 (총합)
  const overallRanking = allStudents
    .map(s => ({ name: s.name, total: fields.reduce((t, f) => t + (s.points?.[f] || 0), 0) }))
    .sort((a, b) => b.total - a.total)
    .slice(0, 5);

  // 항목별 랭킹 계산 (Top5)
  const categoryRankings = {}
  fields.forEach(field => {
    categoryRankings[field] = [...allStudents]
      .map(s => ({ name: s.name, value: s.points?.[field] || 0 }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 5);
  });

  return (
    <div className="container-wide" style={{ textAlign: "center" }}>
      <h1 style={{ fontSize: "24px" }}>📖 포인트 관리</h1>

      {/* 내 포인트 및 총합 */}
      <div style={{ display: "flex", justifyContent: "center", alignItems: "baseline", gap: 16, marginTop: 16 }}>
        <h2 style={{ margin: 0 }}>💡 내 포인트</h2>
        <span style={{ fontSize: 18, fontWeight: "bold" }}>총 포인트: {myTotal}pt</span>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            {fields.map(f => <TableHead key={f}>{f}</TableHead>)}
          </TableRow>
        </TableHeader>
        <TableBody>
          <TableRow>
            {fields.map(f => <TableCell key={f}>{me.points[f] || 0}</TableCell>)}
          </TableRow>
        </TableBody>
      </Table>

      {/* 전체 랭킹 */}
      <h2 style={{ margin: "32px 0 16px" }}>🏆 전체 랭킹 (Top 5)</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>순위</TableHead>
            <TableHead>학생 이름</TableHead>
            <TableHead>총합</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {overallRanking.map((item, i) => (
            <TableRow key={item.name}>
              <TableCell>{i + 1}</TableCell>
              <TableCell>{item.name}</TableCell>
              <TableCell>{item.total}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      {/* 항목별 랭킹 */}
      <h2 style={{ margin: "32px 0 16px" }}>📊 항목별 랭킹 (Top 5)</h2>
      {fields.map(field => (
        <div key={field} style={{ marginBottom: 24 }}>
          <h3 style={{ margin: "8px 0" }}>{field} TOP 5</h3>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>순위</TableHead>
                <TableHead>학생 이름</TableHead>
                <TableHead>{field}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {categoryRankings[field].map((entry, idx) => (
                <TableRow key={field + entry.name}>
                  <TableCell>{idx + 1}</TableCell>
                  <TableCell>{entry.name}</TableCell>
                  <TableCell>{entry.value}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      ))}
    </div>
  );
}
