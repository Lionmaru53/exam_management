/**
 * 管理画面用の初期データを一括取得
 */
function getAdminInitialData() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  
  return stringifyDates({
    students: getRowsData(ss.getSheetByName('students_master')),
    schools: getRowsData(ss.getSheetByName('schools_master')),
    schoolCourses: getRowsData(ss.getSheetByName('school_courses')),
    cramCourses: getRowsData(ss.getSheetByName('courses_master')),
    studentCourses: getRowsData(ss.getSheetByName('students_courses')), // 塾コース紐付け用
    patterns: getRowsData(ss.getSheetByName('exam_patterns')),
    termTests: getRowsData(ss.getSheetByName('term_tests_master')),
    exams: getRowsData(ss.getSheetByName('exam_data')),
    subjects: getRowsData(ss.getSheetByName('subjects_master')),
    patternSubjects: getRowsData(ss.getSheetByName('pattern_subjects')),
    genres: getRowsData(ss.getSheetByName('genres_master'))
  });
}