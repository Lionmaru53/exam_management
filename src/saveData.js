/**
 * 生徒の得点を子 SS の scores_data に保存（upsert）
 *
 * ルーティング: 親 SS の student_index で student_id → cram_id を引き、
 *               getChildSS(cram_id) で子 SS を開く。
 */
function saveAllScores(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);

    // student_index で student_id → cram_id を解決
    const parentSS = SpreadsheetApp.getActiveSpreadsheet();
    const idxSheet = parentSS.getSheetByName('student_index');
    if (!idxSheet) throw new Error('student_index シートが見つかりません');

    const idxRows  = getRowsData(idxSheet);
    const idxEntry = idxRows.find(r =>
      String(r.student_id || '').trim() === String(payload.student_id).trim()
    );
    if (!idxEntry) throw new Error('生徒情報が見つかりません（student_id: ' + payload.student_id + '）');

    const cramId = String(idxEntry.cram_id || '').trim();
    if (!cramId) throw new Error('校舎情報が未設定です');

    // 子 SS を開く
    const ss = getChildSS(cramId);

    // exam_id が未設定の場合、pattern_id から既存エントリを探すか新規作成する
    let examId = String(payload.exam_id || '').trim();
    if (!examId && payload.pattern_id) {
      const schedSheet = ss.getSheetByName('exam_schedule');
      if (!schedSheet) throw new Error('exam_schedule シートが見つかりません');
      const schedData = schedSheet.getDataRange().getValues();
      for (let i = 1; i < schedData.length; i++) {
        if (String(schedData[i][1]).trim() === String(payload.pattern_id).trim()) {
          examId = String(schedData[i][0]).trim();
          break;
        }
      }
      if (!examId) {
        examId = 'EX' + Utilities.formatDate(new Date(), 'JST', 'yyyyMMddHHmmss');
        schedSheet.appendRow([examId, payload.pattern_id, new Date().getFullYear(), '', '']);
      }
    }
    if (!examId) throw new Error('exam_id が取得できませんでした');

    const sheet = ss.getSheetByName('scores_data');
    if (!sheet) throw new Error('scores_data シートが見つかりません');

    const data = sheet.getDataRange().getValues();

    payload.scores.forEach(newScore => {
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][1]) === examId &&
            String(data[i][2]) === String(payload.student_id) &&
            String(data[i][3]) === String(newScore.subject_id)) {
          rowIndex = i + 1;
          break;
        }
      }

      const rowValues = [
        rowIndex > 0 ? data[rowIndex - 1][0] : 'SC' + Utilities.getUuid(),
        examId,
        payload.student_id,
        newScore.subject_id,
        newScore.score,
        newScore.grade_rank,
        newScore.class_rank,
        new Date()
      ];

      if (rowIndex > 0) {
        sheet.getRange(rowIndex, 1, 1, rowValues.length).setValues([rowValues]);
      } else {
        sheet.appendRow(rowValues);
      }
    });

    return JSON.stringify({ success: true });
  } catch (e) {
    return JSON.stringify({ error: e.toString() });
  } finally {
    lock.releaseLock();
  }
}
