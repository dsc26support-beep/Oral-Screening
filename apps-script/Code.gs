/**
 * Oral Health Screening - Apps Script backend.
 *
 * Setup (see README.md for full steps):
 *   1. Create a Google Sheet, open Extensions > Apps Script.
 *   2. Paste this file in as Code.gs.
 *   3. Project Settings > Script Properties: add a property named
 *      ACCESS_CODE with a value only you and your examiners know.
 *      (Do not hardcode the code in this file - this file ends up in a
 *      public GitHub repo as a template.)
 *   4. Deploy > New deployment > Web app.
 *      Execute as: Me.  Who has access: Anyone.
 *   5. Copy the deployment URL into the app's Settings screen.
 *
 * The sheet tab "Screenings" is created automatically, with a header
 * row, the first time a screening is submitted.
 */

var SHEET_NAME = 'Screenings';

var COLUMNS = [
  'id', 'createdAt', 'receivedAt', 'examiner', 'campLocation',
  'patientIdOrName', 'patientAge', 'patientSex', 'ageGroup', 'consent',
  'dmft_D', 'dmft_M', 'dmft_F', 'dmft_total', 'dmft_teeth_json',
  'pufa_skipped', 'pufa_total', 'pufa_map_json',
  'cpitn_s1', 'cpitn_s2', 'cpitn_s3', 'cpitn_s4', 'cpitn_s5', 'cpitn_s6',
  'cpitn_worst', 'cpitn_treatmentNeed',
  'cancer_flag', 'cancer_abnormalSites', 'cancer_riskCount',
  'cancer_sites_json', 'cancer_riskFactors_json',
  'overallNotes', 'schemaVersion'
];

function doGet(e) {
  try {
    var sheet = getOrCreateSheet(); // also creates the header row on first call
    return jsonResponse({ ok: true, status: 'Oral Screening API is running', sheet: sheet.getName() });
  } catch (err) {
    return jsonResponse({ ok: false, error: 'exception', message: String(err) });
  }
}

/**
 * Manual diagnostic: open this file in the Apps Script editor, pick
 * "testSetup" from the function dropdown next to Run, and click Run.
 * Creates the "Screenings" tab + header row immediately (no deployment
 * or device needed) and shows any setup error in the execution log -
 * most commonly "getActiveSpreadsheet" failing, which means this script
 * was created from script.google.com directly instead of via
 * Extensions > Apps Script from inside the actual Sheet, so it isn't
 * bound to it. Fix: delete this script project, reopen your Sheet, and
 * use Extensions > Apps Script there instead.
 */
function testSetup() {
  var sheet = getOrCreateSheet();
  Logger.log('OK - sheet "' + sheet.getName() + '" ready, last row: ' + sheet.getLastRow());
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: 'missing_body' });
    }
    var body = JSON.parse(e.postData.contents);
    var record = body.record;
    if (!record || !record.id) {
      return jsonResponse({ ok: false, error: 'missing_record' });
    }

    var props = PropertiesService.getScriptProperties();
    var expectedCode = props.getProperty('ACCESS_CODE');
    if (!expectedCode) {
      return jsonResponse({ ok: false, error: 'server_not_configured', message: 'Set ACCESS_CODE in Script Properties first.' });
    }
    if (body.accessCode !== expectedCode) {
      return jsonResponse({ ok: false, error: 'invalid_access_code' });
    }

    var sheet = getOrCreateSheet();
    if (findRowById(sheet, record.id) !== -1) {
      return jsonResponse({ ok: true, id: record.id, duplicate: true });
    }
    appendRecord(sheet, record);
    return jsonResponse({ ok: true, id: record.id });
  } catch (err) {
    return jsonResponse({ ok: false, error: 'exception', message: String(err) });
  }
}

function getOrCreateSheet() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SHEET_NAME);
    sheet.appendRow(COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function findRowById(sheet, id) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return -1;
  var ids = sheet.getRange(2, 1, lastRow - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) {
    if (ids[i][0] === id) return i + 2;
  }
  return -1;
}

function appendRecord(sheet, r) {
  var dmftScores = (r.dmft && r.dmft.scores) || {};
  var pufaScores = (r.pufa && r.pufa.scores) || {};
  var cpitnSextants = (r.cpitn && r.cpitn.sextants) || {};
  var cpitnScores = (r.cpitn && r.cpitn.scores) || {};
  var cancerResult = (r.cancer && r.cancer.result) || {};

  var row = [
    r.id,
    r.createdAt || '',
    new Date().toISOString(),
    r.examiner || '',
    r.campLocation || '',
    (r.patient && r.patient.idOrName) || '',
    (r.patient && r.patient.age != null) ? r.patient.age : '',
    (r.patient && r.patient.sex) || '',
    r.ageGroup || '',
    r.consent ? 'yes' : 'no',
    numOrBlank(dmftScores.D),
    numOrBlank(dmftScores.M),
    numOrBlank(dmftScores.F),
    numOrBlank(dmftScores.total),
    JSON.stringify((r.dmft && r.dmft.teeth) || {}),
    pufaScores.skipped ? 'yes' : 'no',
    numOrBlank(pufaScores.total),
    JSON.stringify((r.pufa && r.pufa.map) || {}),
    valOrBlank(cpitnSextants.s1),
    valOrBlank(cpitnSextants.s2),
    valOrBlank(cpitnSextants.s3),
    valOrBlank(cpitnSextants.s4),
    valOrBlank(cpitnSextants.s5),
    valOrBlank(cpitnSextants.s6),
    numOrBlank(cpitnScores.worst),
    cpitnScores.treatmentNeed || '',
    cancerResult.flag || '',
    (cancerResult.abnormalSites || []).join(', '),
    numOrBlank(cancerResult.riskCount),
    JSON.stringify((r.cancer && r.cancer.sites) || {}),
    JSON.stringify((r.cancer && r.cancer.riskFactors) || {}),
    r.overallNotes || '',
    r.schemaVersion || ''
  ];
  sheet.appendRow(row);
}

function numOrBlank(v) { return (v === undefined || v === null) ? '' : v; }
function valOrBlank(v) { return (v === undefined || v === null) ? '' : v; }

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
