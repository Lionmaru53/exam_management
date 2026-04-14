function copyMeiboToMaster() {
  const CONFIG = {
    sourceSheetName: "015_名簿作成結果①貼付",    // コピー元のシート名
    targetSheetName: "students_master",  // コピー先のシート名
    keyColumn: "student_id",              // 上書きのキーとなる列（例では student_id）  
    
    // 単純コピーする列のマッピング { "コピー元の見出し": "コピー先の見出し" }
    mapping: {
      "管理番号": "student_id",
      "校舎": "cram_id",
      "学年": "grade",
      "学校": "school_name",
    },

    // 結合処理の設定
    mergeSettings: [
      { 
        sources: ["姓", "名"], 
        targetHeader: "name", 
        separator: " " // 苗字と名前の間の区切り文字
      },
      { 
        sources: ["姓かな", "名かな"], 
        targetHeader: "pronunciation", 
        separator: " " 
      }
    ]
  };
  // -------------------------------------------------------
  copyAndMergeColumns(CONFIG);
}

function copyAndMergeColumns(CONFIG) {
  const _ = Underscore.load();
  const ss = SpreadsheetApp.getActiveSpreadsheet();

  // --- 【設定：ここを環境に合わせて書き換えてください】 ---


  const srcSheet = ss.getSheetByName(CONFIG.sourceSheetName);
  const tgtSheet = ss.getSheetByName(CONFIG.targetSheetName);
  
  const srcData = srcSheet.getDataRange().getValues();
  const srcHeader = _.first(srcData);
  const srcRows = _.rest(srcData);

  const tgtFullData = tgtSheet.getDataRange().getValues();
  const tgtHeader = _.first(tgtFullData);
  const tgtRows = _.rest(tgtFullData);

  const keyIdx = _.indexOf(tgtHeader, CONFIG.keyColumn); // 上書きのキーとなる列（例では student_id）

  // 1. 各行のデータを「貼り付け先の列順」に並び替える
  const processedSrcRows = _.map(srcRows, function(row) {
    // 貼り付け先のヘッダー1つひとつに対して、入れるべきデータを探す
    const rowObj =_.map(tgtHeader, function(targetColName) {
      
      // A. 単純コピー対象かチェック
      const srcColName = _.findKey(CONFIG.mapping, (val) => val === targetColName);
      if (srcColName) {
        const idx = _.indexOf(srcHeader, srcColName);
        return idx !== -1 ? row[idx] : "";
      }

      // B. 結合対象かチェック
      const mergeSet = _.find(CONFIG.mergeSettings, s => s.targetHeader === targetColName);
      if (mergeSet) {
        return _.map(mergeSet.sources, function(sName) {
          const idx = _.indexOf(srcHeader, sName);
          return idx !== -1 ? row[idx] : "";
        }).join(" ").trim();
      }
    });
    return rowObj;
  });

  // 2. 既存データとの照合と更新
  const updatedTgtData = [...tgtRows]; // 既存データをコピー
  
  _.each(processedSrcRows, function(newRowObj) {
    const keyValue = newRowObj[keyIdx];
    if (!keyValue) return; // キーが空ならスキップ

    // 既存行の中に同じキーがあるか探す
    const existingRowIdx = _.findIndex(updatedTgtData, r => r[keyIdx] === keyValue);

    if (existingRowIdx !== -1) {
      // 【上書き】既存の行の指定された列だけ更新
      _.each(newRowObj, function(val, idx) {
        updatedTgtData[existingRowIdx][idx] = val;
      });
    } else {
      // 【追加】新しい行を作成
      const newRow = new Array(tgtHeader.length).fill("");
      _.each(newRowObj, function(val, idx) {
        newRow[idx] = val;
      });
      updatedTgtData.push(newRow);
    }
  });

  // 3. 貼り付け先に一括書き込み
  tgtSheet.getRange(2, 1, updatedTgtData.length, tgtHeader.length).setValues(updatedTgtData);
  
  SpreadsheetApp.getUi().alert("上書き・追加処理が完了しました。");
}