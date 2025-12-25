// src/firebase/logic.js

/**
 * generateScheduleWithRollovers
 * @param {string} startDate  // "YYYY-MM-DD"
 * @param {string[]} days     // ["월","수",...]
 * @param {number} total      // 총 세션 개수 (e.g. days.length * 4)
 * @param {string[]} [skip=[]]// 제외할 휴일 날짜 리스트
 */
export function generateScheduleWithRollovers(
  startDate,
  days,
  total,
  skip = []
) {
  const dayMap = { 일: 0, 월: 1, 화: 2, 수: 3, 목: 4, 금: 5, 토: 6 };
  let lessons = [];
  let date = new Date(startDate);

  while (lessons.length < total) {
      const name = Object.keys(dayMap).find(k => dayMap[k] === date.getDay());
      const iso = date.toISOString().slice(0, 10);

      if (days.includes(name) && !skip.includes(iso)) {
          lessons.push({ date: iso, session: lessons.length + 1 });
      }

      // next day
      date.setDate(date.getDate() + 1);
  }

  return lessons;
}

  
  /**
   * publicHolidaysKR
   * 미리 정의된 한국 공휴일(‘2025-01-01’, …) 배열을 export
   */
  export const publicHolidaysKR = [
    /* e.g. "2025-01-01", "2025-03-01", … */
  ];
  