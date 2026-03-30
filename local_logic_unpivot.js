function unpivotVariableRange() {
  const _ = Underscore.load();
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const data = ss.getSheetByName("015_名簿作成結果①貼付").getDataRange().getValues();

  // --- 【設定：ここを変更してください】 ---
  const fixedColIndex = 4;      // 固定する列（0=A列, 1=B列...）
  const pivotStartCol = 17;      // アンピボットを開始する列（0=A列, 1=B列...）
  const fixedHeaderLabel = "student_id"
  const valueHeaderName = "course_id"
  // --------------------------------------

  const result = [];

  // 固定列の見出し（1行目）を取得してヘッダーを作成
  result.push([fixedHeaderLabel, valueHeaderName]);

  // 2行目（インデックス1）からデータ処理を開始
  _.chain(data)
    .rest() // 1行目（ヘッダー）を除去
    .each(function (row) {
      const fixedValue = row[fixedColIndex]; // 固定列の値
      const pivotPool = _.rest(row, pivotStartCol); // アンピボット開始列以降

      // 値がある間だけループし、空白が出たらその行は終了
      for (let i = 0; i < pivotPool.length; i++) {
        let val = pivotPool[i];

        // セルが空（空文字、null、undefined）ならその行の処理を中断
        if (val === "" || val === null || val === undefined) break;

        // valの中に（任意の文字列）があればスキップ。大文字の括弧も対象
        if (val && /（.*?）/.test(val)) continue;
        if (val && /\(.*?\)/.test(val)) continue;

        // valの中に"ミドルパック" "ミニパック" "パック" という文字列があれば取り除く
        val = val.replace("ミドルパック", "");
        val = val.replace("ミニパック", "");
        val = val.replace("パック", "");

        // [固定値, カスタムヘッダー名, 実際の値] の形式で追加
        result.push([fixedValue, val]);
      }
    });

  // 結果の出力
  const newSheet = ss.getSheetByName("students_courses");
  newSheet.clearContents();
  newSheet.getRange(1, 1, result.length, result[0].length).setValues(result);

  SpreadsheetApp.getUi().alert("変換が完了しました。");
}
