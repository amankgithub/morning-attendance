/**
 * Container-bound Apps Script for the Morning Attendance Google Sheet.
 * Paste this into Extensions > Apps Script from within the Sheet itself.
 *
 * Sheet setup expected:
 *  - A "Template" tab: names in column C (row 2 downward, row 1 = header),
 *    columns D:X left blank, grouped in 3s per day —
 *    Mon D-F, Tue G-I, Wed J-L, Thu M-O, Fri P-R, Sat S-U, Sun V-X
 *    (each group of 3 = Event 1 / Event 2 / Event 3).
 *  - One tab literally named "current" (duplicate Template once by hand to
 *    start) — this is the tab the app writes to every time someone is tapped.
 *  - Optional "Log" tab (name | group | event | reportingTimeUsed |
 *    actualTimestamp | minutesLate | date) kept as a flat audit trail.
 *
 * Deploy: Extensions > Apps Script > Deploy > New deployment > Web app,
 * execute as "Me", access "Anyone" — copy the /exec URL into the app's
 * Settings panel (gear icon, top right of index.html).
 *
 * One-time: run setupWeeklyTrigger() once from the Apps Script editor
 * (authorize when prompted) to install the automatic Sunday-night rotation.
 * A manual "Attendance > Start New Week" menu item is also added on open,
 * as a backup/override if you need to rotate at a different moment.
 */

var TEMPLATE_SHEET = "Template";
var CURRENT_SHEET = "current";
var LOG_SHEET = "Log";
var ERROR_SHEET = "Errors";

var NAME_COL = 3;       // column C
var FIRST_DAY_COL = 4;  // column D

// Sheet titles are matched case-insensitively (real tab may be "Current" not
// "current") so a capitalization difference doesn't silently break writes.
function getSheetCI(ss, name) {
  var exact = ss.getSheetByName(name);
  if (exact) return exact;
  var target = name.toLowerCase();
  var sheets = ss.getSheets();
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase() === target) return sheets[i];
  }
  return null;
}

/* ---------- Receiving taps from the app ---------- */
//
// Both the "Template" and "Current" tabs hold every group stacked in one
// sheet (Sahadeva, Nakula, Arjuna, Bhima, Yudhishthir), each with its own
// group-name/day-label/sub-header rows mixed in above its members. That's
// fine here: findPersonRow() scans all of column C for an exact name match,
// so header rows (which never match a real name) are skipped naturally.

function doPost(e) {
  var rows = JSON.parse(e.postData.contents); // array of entries
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var log = getSheetCI(ss, LOG_SHEET);
  var current = getSheetCI(ss, CURRENT_SHEET);
  var errors = [];

  rows.forEach(function (data) {
    if (log) {
      log.appendRow([
        data.name,
        data.group,
        data.event,
        data.reportingTimeUsed,
        data.actualTimestamp,
        data.minutesLate,
        data.date
      ]);
    }
    try {
      writeToGrid(current, data);
    } catch (err) {
      errors.push(data.name + ": " + err.message);
    }
  });

  if (errors.length) logErrors(ss, errors);

  return ContentService
    .createTextOutput(JSON.stringify({ ok: true, errors: errors }))
    .setMimeType(ContentService.MimeType.JSON);
}

function writeToGrid(sheet, data) {
  if (!sheet) throw new Error('No "' + CURRENT_SHEET + '" sheet found');

  var row = findPersonRow(sheet, data.name);
  if (!row) throw new Error('Name not found in column C: "' + data.name + '"');

  var dayIndex = dayIndexFromDateStr(data.date); // Monday = 0 .. Sunday = 6
  var event = parseInt(data.event, 10);          // 1, 2 or 3
  var col = FIRST_DAY_COL + dayIndex * 3 + (event - 1);

  var value;
  if (data.status === "A") {
    // Not tapped in before the reporting window closed.
    value = "A";
  } else {
    var minutesLate = Number(data.minutesLate) || 0;
    value = minutesLate > 0 ? ("L" + minutesLate) : "P";
  }
  sheet.getRange(row, col).setValue(value);
}

function findPersonRow(sheet, rawName) {
  var target = normalizeName(rawName);
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  var values = sheet.getRange(2, NAME_COL, lastRow - 1, 1).getValues();
  for (var i = 0; i < values.length; i++) {
    if (normalizeName(values[i][0]) === target) return i + 2;
  }
  return null;
}

// The app sends names like "Aman Pr"; sheet column C may just have "Aman".
function normalizeName(name) {
  return String(name || "")
    .trim()
    .replace(/\s+pr\.?$/i, "")
    .replace(/\s+/g, " ")
    .toLowerCase();
}

function dayIndexFromDateStr(dateStr) {
  var parts = dateStr.split("-"); // "YYYY-MM-DD"
  var d = new Date(parseInt(parts[0], 10), parseInt(parts[1], 10) - 1, parseInt(parts[2], 10));
  var jsDay = d.getDay(); // 0 = Sunday .. 6 = Saturday
  return (jsDay + 6) % 7; // 0 = Monday .. 6 = Sunday
}

function logErrors(ss, messages) {
  var sheet = ss.getSheetByName(ERROR_SHEET) || ss.insertSheet(ERROR_SHEET);
  messages.forEach(function (msg) {
    sheet.appendRow([new Date(), msg]);
  });
}

/* ---------- Weekly rotation ---------- */

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("Attendance")
    .addItem("Start New Week", "rotateWeek")
    .addToUi();
}

/**
 * Renames "current" to the date range of the week it just finished
 * (e.g. "(29 Jul - 5 Aug)") and duplicates "Template" as the new "current".
 * Safe to call more than once for the same week — it no-ops if that week's
 * archive sheet already exists.
 */
function rotateWeek() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var range = weekRangeToArchive(new Date());
  var label = formatWeekLabel(range.monday, range.sunday);

  if (!ss.getSheetByName(label)) {
    var current = getSheetCI(ss, CURRENT_SHEET);
    if (!current) throw new Error('No "' + CURRENT_SHEET + '" sheet to archive.');
    current.setName(label);
  }

  if (!getSheetCI(ss, CURRENT_SHEET)) {
    var template = getSheetCI(ss, TEMPLATE_SHEET);
    if (!template) throw new Error('No "' + TEMPLATE_SHEET + '" sheet found to duplicate.');
    var fresh = template.copyTo(ss);
    fresh.setName(CURRENT_SHEET);
  }
}

function weekRangeToArchive(now) {
  var day = now.getDay(); // 0 Sun .. 6 Sat
  var mondayOffset = (day + 6) % 7; // days since the most recent Monday
  var thisMonday = new Date(now.getFullYear(), now.getMonth(), now.getDate() - mondayOffset);

  var monday;
  if (day === 1) {
    // Running Monday morning: archive the week that just ended.
    monday = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - 7);
  } else {
    // Running any other day (typically Sunday night): archive this week.
    monday = thisMonday;
  }
  var sunday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 6);
  return { monday: monday, sunday: sunday };
}

function formatWeekLabel(monday, sunday) {
  var tz = Session.getScriptTimeZone();
  var m = Utilities.formatDate(monday, tz, "d MMM");
  var s = Utilities.formatDate(sunday, tz, "d MMM");
  return "(" + m + " - " + s + ")";
}

/* ---------- One-time setup ---------- */

// Run once from the Apps Script editor to install the automatic rotation.
// Default: every Sunday at 22:00 in the sheet's timezone (after Event 3
// uploads are expected to be done). Change the atHour() value if needed.
function setupWeeklyTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === "rotateWeek") ScriptApp.deleteTrigger(t);
  });
  ScriptApp.newTrigger("rotateWeek")
    .timeBased()
    .onWeekDay(ScriptApp.WeekDay.SUNDAY)
    .atHour(22)
    .create();
}
