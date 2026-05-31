/**
 * デモモード用の架空初期データを返す。
 * type: 'first_g1' = 高1初回, 'first_g2' = 高2初回, 'returning' = 2回目以降
 */

var DEMO_SUBJECTS = [
  { subject_id:'DS01', genre_name:'数学', display_name:'数学Ⅱ',                   excluded: false },
  { subject_id:'DS02', genre_name:'数学', display_name:'数学B',                    excluded: false },
  { subject_id:'DS03', genre_name:'英語', display_name:'コミュニケーション英語Ⅱ', excluded: false },
  { subject_id:'DS04', genre_name:'英語', display_name:'英語表現Ⅰ',               excluded: false },
  { subject_id:'DS05', genre_name:'国語', display_name:'現代文B',                  excluded: false },
  { subject_id:'DS06', genre_name:'理科', display_name:'化学',                     excluded: false },
  { subject_id:'DS07', genre_name:'理科', display_name:'物理',                     excluded: false },
  { subject_id:'DS08', genre_name:'社会', display_name:'地理B',                    excluded: false }
];

var DEMO_EXAM_TABS = [
  {
    term_test_id: 'DEMO_EXAM_1',
    test_name:    '2025年度 1学期中間テスト',
    subjects:     DEMO_SUBJECTS,
    scores:       [],
    pattern_id:   'DEMO_PATTERN'
  },
  {
    term_test_id: 'DEMO_EXAM_2',
    test_name:    '2025年度 1学期期末テスト',
    subjects:     DEMO_SUBJECTS,
    scores:       [],
    pattern_id:   'DEMO_PATTERN'
  }
];

function getDemoInitialData(type) {
  var isFirst    = (type === 'first_g1' || type === 'first_g2');
  var grade      = isFirst ? (type === 'first_g2' ? '高2' : '高1') : '高2';
  var subCourse  = isFirst ? '' : '理系';

  var student = {
    student_id:         'DEMO',
    name:               '見本 太郎',
    school_name:        '○○高校',
    school_course:      isFirst ? '' : '普通',
    school_course_name: isFirst ? '' : '普通',
    grade:              grade,
    sub_course:         subCourse
  };

  var genres = ['数学', '英語', '国語', '理科', '社会'].map(function(name) {
    return { genre_name: name };
  });

  return {
    student:           student,
    lineUserId:        'DEMO',
    needsCourse:       (type === 'first_g1' || type === 'first_g2'),
    needsSubCourse:    (type === 'first_g2'),
    availableCourses:  ['普通', '理数'],
    availableSubjects: DEMO_SUBJECTS,
    currentExam:       DEMO_EXAM_TABS[0],
    examTabs:          DEMO_EXAM_TABS,
    subjects:          DEMO_SUBJECTS,
    scores:            [],
    genres:            genres,
    history:           [],
    announcements:     [
      {
        title:      'デモモードについて',
        body:       'これはデモ画面です。入力はできますが、保存は実際のデータに反映されません。',
        created_at: '2025-01-01'
      }
    ],
    gasWebAppUrl:      ScriptApp.getService().getUrl(),
    demo:              true
  };
}
