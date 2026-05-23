function doGet(e) { return ExamLib.doGet(e); }

// ---- GAS エディタから手動実行する初期設定・ユーティリティ ----

function setupAdminSS() { return ExamLib.setupAdminSS(); }

// ---- google.script.run ラッパー（ライブラリ関数はクライアントから直接呼べないため委譲） ----

function getAdminInitialData(...args) { return ExamLib.getAdminInitialData(...args); }

function getAdminUsers(...args)        { return ExamLib.getAdminUsers(...args); }
function addAdminUser(...args)         { return ExamLib.addAdminUser(...args); }
function updateAdminUser(...args)      { return ExamLib.updateAdminUser(...args); }
function deactivateAdminUser(...args)  { return ExamLib.deactivateAdminUser(...args); }

function addBranch(...args)    { return ExamLib.addBranch(...args); }
function updateBranch(...args) { return ExamLib.updateBranch(...args); }
function setupBranchSS(...args){ return ExamLib.setupBranchSS(...args); }
function shareBranchSS(...args){ return ExamLib.shareBranchSS(...args); }

function updateExamData(...args)           { return ExamLib.updateExamData(...args); }
function updateExamDataBatch(...args)      { return ExamLib.updateExamDataBatch(...args); }
function upsertExamWithAutoPattern(...args){ return ExamLib.upsertExamWithAutoPattern(...args); }

function importStudentData(...args){ return ExamLib.importStudentData(...args); }
function linkLineIds(...args)      { return ExamLib.linkLineIds(...args); }

function upsertTermTest(...args){ return ExamLib.upsertTermTest(...args); }
function upsertGenre(...args)   { return ExamLib.upsertGenre(...args); }

function upsertSubjectAlias(...args)      { return ExamLib.upsertSubjectAlias(...args); }
function batchSetGroupSubjects(...args)   { return ExamLib.batchSetGroupSubjects(...args); }
function batchSetPerTermSubjects(...args) { return ExamLib.batchSetPerTermSubjects(...args); }
function addNewSubject(...args)           { return ExamLib.addNewSubject(...args); }

function getStudentList(...args)    { return ExamLib.getStudentList(...args); }
function updateStudentField(...args){ return ExamLib.updateStudentField(...args); }
function addCourseToMaster(...args) { return ExamLib.addCourseToMaster(...args); }

function saveAllScores(...args){ return ExamLib.saveAllScores(...args); }
