function saveAllScores(payload) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = ss.getSheetByName('scores_data');
    const data = sheet.getDataRange().getValues();

    payload.scores.forEach(newScore => {
      let rowIndex = -1;
      for (let i = 1; i < data.length; i++) {
        if (String(data[i][1]) === String(payload.exam_id) && 
            String(data[i][2]) === String(payload.student_id) && 
            String(data[i][3]) === String(newScore.subject_id)) {
          rowIndex = i + 1;
          break;
        }
      }

      const rowValues = [
        rowIndex > 0 ? data[rowIndex-1][0] : "SC" + Utilities.getUuid().substring(0,8),
        payload.exam_id,
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
