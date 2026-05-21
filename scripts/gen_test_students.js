/**
 * テスト用ファイル生成スクリプト
 *
 * 出力:
 *   tests/fixtures/students_Z01.xlsx   … インポート用生徒名簿
 *   tests/fixtures/line_map_Z01.xlsx   … LINE ID 連携用外部 SS（Google スプレッドシートに手動アップロード）
 *
 * 実行: node scripts/gen_test_students.js
 */
const XLSX = require('xlsx');
const path = require('path');
const fs   = require('fs');

// ── マスタデータ ────────────────────────────────────────
const SCHOOLS = [
  { name: '東山高等学校', grades: ['高1','高2','高3'], count: 20 },
  { name: '桜丘高等学校', grades: ['高1','高2','高3'], count: 20 },
  { name: '港南高等学校', grades: ['高1','高2','高3'], count: 10 },
];

const LAST_NAMES = [
  ['田中','たなか'],['鈴木','すずき'],['佐藤','さとう'],['高橋','たかはし'],
  ['山本','やまもと'],['伊藤','いとう'],['渡辺','わたなべ'],['中村','なかむら'],
  ['小林','こばやし'],['加藤','かとう'],['吉田','よしだ'],['山田','やまだ'],
  ['松本','まつもと'],['井上','いのうえ'],['木村','きむら'],['清水','しみず'],
  ['山口','やまぐち'],['斎藤','さいとう'],['林','はやし'],['池田','いけだ'],
];

const FIRST_NAMES_F = [
  ['美咲','みさき'],['愛','あい'],['桃花','ももか'],['結衣','ゆい'],
  ['奈々','なな'],['彩','あや'],['七海','ななみ'],['優花','ゆうか'],
  ['真由','まゆ'],['遥','はるか'],
];

const FIRST_NAMES_M = [
  ['大輝','だいき'],['蓮','れん'],['翔','しょう'],['陸','りく'],
  ['悠斗','ゆうと'],['颯太','そうた'],['海斗','かいと'],['拓海','たくみ'],
  ['健太','けんた'],['勇樹','ゆうき'],
];

// ── ユーティリティ ──────────────────────────────────────
/** 5〜8桁のランダム整数（重複なし） */
function genUniqueIds(count) {
  const ids = new Set();
  const MIN = 10000;       // 5桁最小
  const MAX = 99999999;    // 8桁最大
  while (ids.size < count) {
    ids.add(Math.floor(MIN + Math.random() * (MAX - MIN + 1)));
  }
  return [...ids].map(String);
}

/** LINE user ID 風のランダム文字列（U + 32 桁 hex） */
function genLineUserId() {
  const hex = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  return 'U' + hex;
}

// ── 生徒データ生成 ──────────────────────────────────────
const TOTAL = SCHOOLS.reduce((s, sc) => s + sc.count, 0);
const uniqueIds = genUniqueIds(TOTAL);

const students = [];
let seq = 0;

for (const school of SCHOOLS) {
  for (let i = 0; i < school.count; i++, seq++) {
    const last    = LAST_NAMES[seq % LAST_NAMES.length];
    const isFemale = seq % 2 === 0;
    const first   = isFemale
      ? FIRST_NAMES_F[(seq >> 1) % FIRST_NAMES_F.length]
      : FIRST_NAMES_M[(seq >> 1) % FIRST_NAMES_M.length];

    students.push({
      student_id:   uniqueIds[seq],
      last:         last[0],
      first:        first[0],
      lastKana:     last[1],
      firstKana:    first[1],
      school:       school.name,
      grade:        school.grades[i % school.grades.length],
      line_user_id: genLineUserId(),
    });
  }
}

// ── 出力先 ─────────────────────────────────────────────
const outDir = path.join(__dirname, '..', 'tests', 'fixtures');
fs.mkdirSync(outDir, { recursive: true });

// ── 1. インポート用生徒名簿 ─────────────────────────────
const CRAM_ID = 'Z01';
const studentRows = [
  ['校舎','管理番号','姓','名','姓かな','名かな','学校','学年'],
  ...students.map(s => [CRAM_ID, s.student_id, s.last, s.first, s.lastKana, s.firstKana, s.school, s.grade]),
];

const wsStudents = XLSX.utils.aoa_to_sheet(studentRows);
// 管理番号列(A)を文字列型に固定（先頭ゼロ保護。今回は整数なので数値でも可だが念のため）
students.forEach((_, i) => {
  const cell = wsStudents[`A${i + 2}`];
  if (cell) cell.t = 's';
});
const wbStudents = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbStudents, wsStudents, 'Sheet1');
const studentsPath = path.join(outDir, 'students_Z01.xlsx');
XLSX.writeFile(wbStudents, studentsPath);
console.log(`[1] 生徒名簿: ${studentsPath}  (${students.length} 名)`);

// ── 2. LINE ID 連携用外部 SS ────────────────────────────
// 構造: 1行目=タイトル、2行目=ヘッダー（管理番号 / 生徒）、3行目以降=データ
const lineMapRows = [
  ['LINE ID連携データ（Z01）'],               // Row 1: タイトル（任意テキスト）
  ['管理番号', '生徒'],                        // Row 2: ヘッダー ← linkLineIds が参照
  ...students.map(s => [s.student_id, s.line_user_id]),
];

const wsLine = XLSX.utils.aoa_to_sheet(lineMapRows);
// 管理番号列(A)を文字列に
students.forEach((_, i) => {
  const cell = wsLine[`A${i + 3}`];
  if (cell) cell.t = 's';
});
const wbLine = XLSX.utils.book_new();
XLSX.utils.book_append_sheet(wbLine, wsLine, '内部生');   // シート名は「内部生」固定
const lineMapPath = path.join(outDir, 'line_map_Z01.xlsx');
XLSX.writeFile(wbLine, lineMapPath);
console.log(`[2] LINE IDマップ: ${lineMapPath}  (${students.length} 件、シート名: 内部生)`);

// ── サマリ ──────────────────────────────────────────────
console.log('\n--- 学校別内訳 ---');
for (const sc of SCHOOLS) {
  const matched = students.filter(s => s.school === sc.name);
  const gradeMap = {};
  matched.forEach(s => { gradeMap[s.grade] = (gradeMap[s.grade] || 0) + 1; });
  console.log(`  ${sc.name}: ${matched.length}名  ${Object.entries(gradeMap).map(([g,n])=>`${g}×${n}`).join(', ')}`);
}
