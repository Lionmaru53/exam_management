/**
 * シートのデータをオブジェクトの配列に変換する汎用関数
 */
function getRowsData(sheet) {
  if (!sheet) return [];
  const data = sheet.getDataRange().getValues();
  if (data.length < 2) return [];

  // 1行目のヘッダーを取得し、空白を除去して正規化
  const headers = data[0].map(h => String(h).trim());
  const rows = data.slice(1);

  return rows.map(row => {
    const obj = {};
    headers.forEach((h, i) => {
      if (h) {
        if (Number.isFinite(row[i])) {
          obj[h] = String(row[i]);
        } else {
          obj[h] = row[i];
        }
      }
    });
    return obj;
  });
}

if (typeof module !== 'undefined') Object.assign(global, { getRowsData });