// ---- 教科表示名エイリアス ----

function _ensureSchoolSubjectAliasSheet(ss) {
  let sheet = ss.getSheetByName('school_subject_aliases');
  if (!sheet) {
    sheet = ss.insertSheet('school_subject_aliases');
    sheet.getRange(1, 1, 1, 4).setValues([['school_name', 'subject_id', 'display_name', 'updated_at']]);
  }
  return sheet;
}

function _getAllAliases(sheet) {
  return getRowsData(sheet).map(function (r) {
    return {
      school_name:  String(r.school_name  || '').trim(),
      subject_id:   String(r.subject_id   || '').trim(),
      display_name: String(r.display_name || '').trim(),
      updated_at:   r.updated_at ? String(r.updated_at) : '',
    };
  });
}

/**
 * school_subject_aliases を upsert する。
 * displayName が空文字の場合は行を削除（canonical name にフォールバック）。
 * prevUpdatedAt と現在の updated_at が不一致の場合は競合として返す。
 *
 * @param {string} schoolName
 * @param {string} subjectId
 * @param {string} displayName
 * @param {string} [prevUpdatedAt]  楽観的ロック用タイムスタンプ
 */
function upsertSubjectAlias(schoolName, subjectId, displayName, prevUpdatedAt) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(10000);
    const ctx = getAdminContext();

    const ss    = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = _ensureSchoolSubjectAliasSheet(ss);
    const data  = sheet.getDataRange().getValues();
    const hdrs  = data[0].map(function (h) { return String(h).trim(); });
    const snCol = hdrs.indexOf('school_name');
    const siCol = hdrs.indexOf('subject_id');
    const dnCol = hdrs.indexOf('display_name');
    const utCol = hdrs.indexOf('updated_at');

    const sn = String(schoolName  || '').trim();
    const si = String(subjectId   || '').trim();
    const dn = String(displayName || '').trim();

    for (var i = 1; i < data.length; i++) {
      if (String(data[i][snCol]).trim() === sn &&
          String(data[i][siCol]).trim() === si) {
        if (prevUpdatedAt) {
          var cur = data[i][utCol];
          if (String(cur) !== String(prevUpdatedAt)) {
            return { success: false, conflict: true, current: _getAllAliases(sheet) };
          }
        }
        if (!dn) {
          sheet.deleteRow(i + 1);
        } else {
          if (dnCol >= 0) sheet.getRange(i + 1, dnCol + 1).setValue(dn);
          if (utCol >= 0) sheet.getRange(i + 1, utCol + 1).setValue(new Date());
        }
        writeAuditLog(ctx, 'upsert_subject_alias', { schoolName: sn, subjectId: si, displayName: dn }, 'success');
        return { success: true };
      }
    }

    if (!dn) return { success: true };
    var newRow = hdrs.map(function (_, idx) {
      if (idx === snCol) return sn;
      if (idx === siCol) return si;
      if (idx === dnCol) return dn;
      if (idx === utCol) return new Date();
      return '';
    });
    sheet.appendRow(newRow);
    writeAuditLog(ctx, 'upsert_subject_alias', { schoolName: sn, subjectId: si, displayName: dn }, 'success');
    return { success: true };
  } catch (e) {
    console.error('upsertSubjectAlias error:', e);
    return { success: false, error: e.message };
  } finally {
    lock.releaseLock();
  }
}
