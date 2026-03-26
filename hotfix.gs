function hotfixInstallManualCallPointsFormula() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('ROSTER FOR MANUAL EDIT');
  if (!sheet) {
    throw new Error('Sheet not found: ROSTER FOR MANUAL EDIT');
  }

  var startRow = 4;
  var endRow = 200;
  var nameValues = sheet.getRange(startRow, 1, endRow - startRow + 1, 1).getValues();
  var appliedRows = [];

  for (var i = 0; i < nameValues.length; i++) {
    var row = startRow + i;
    var rawName = nameValues[i][0];
    var name = rawName == null ? '' : String(rawName).trim();
    if (!name) {
      continue;
    }
    if (name.charAt(0) === '<' && name.charAt(name.length - 1) === '>') {
      continue;
    }

    var formula = '=SUMPRODUCT((LOWER(TRIM($P$35:$AC$35))=LOWER(TRIM($A' + row + ')))*$P$32:$AC$32)+SUMPRODUCT((LOWER(TRIM($P$37:$AC$37))=LOWER(TRIM($A' + row + ')))*$P$33:$AC$33)';
    sheet.getRange(row, 31).setFormula(formula);
    appliedRows.push(row);
  }

  var result = {
    ok: true,
    sheetName: sheet.getName(),
    formulaColumn: 'AE',
    doctorRowCount: appliedRows.length,
    appliedRows: appliedRows,
    appliedAtIso: new Date().toISOString()
  };

  Logger.log(JSON.stringify(result, null, 2));
  return result;
}

function hotfixClearManualCallPointsFormula() {
  var sheet = SpreadsheetApp.getActive().getSheetByName('ROSTER FOR MANUAL EDIT');
  if (!sheet) {
    throw new Error('Sheet not found: ROSTER FOR MANUAL EDIT');
  }

  sheet.getRange(4, 31, 197, 1).clearContent();

  var result = {
    ok: true,
    sheetName: sheet.getName(),
    clearedRange: 'AE4:AE200',
    clearedAtIso: new Date().toISOString()
  };
  Logger.log(JSON.stringify(result, null, 2));
  return result;
}
