/**
 * 管理画面用の初期データを一括取得
 */
function getAdminInitialData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  return JSON.stringify({
    students: getRowsData(ss.getSheetByName('students_master')),
    schools: getRowsData(ss.getSheetByName('schools_master')),
    schoolCourses: getRowsData(ss.getSheetByName('school_courses')),
    cramCourses: getRowsData(ss.getSheetByName('courses_master')),
    studentCourses: getRowsData(ss.getSheetByName('students_courses')) // 塾コース紐付け用
  });
}