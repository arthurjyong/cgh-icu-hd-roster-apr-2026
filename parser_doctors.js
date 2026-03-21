function parseDoctors_(rawBlocks, parseResult) {
  const doctors = [];

  doctors.push.apply(doctors, parseDoctorSection_(rawBlocks.icuOnlyNameValues, "ICU_ONLY", 4, parseResult));
  doctors.push.apply(doctors, parseDoctorSection_(rawBlocks.icuHdNameValues, "ICU_HD", 14, parseResult));
  doctors.push.apply(doctors, parseDoctorSection_(rawBlocks.hdOnlyNameValues, "HD_ONLY", 23, parseResult));

  validateDuplicateDoctorNames_(doctors, parseResult);

  return doctors;
}

function parseDoctorSection_(nameValues, sectionKey, startRow, parseResult) {
  const doctors = [];

  for (let i = 0; i < nameValues.length; i++) {
    const rawName = nameValues[i][0];
    const fullName = rawName == null ? "" : String(rawName).trim();
    const rowNumber = startRow + i;
    const cellA1 = "A" + rowNumber;

    if (fullName === "") {
      addIssue_(parseResult, {
        severity: "ERROR",
        category: "DOCTOR_MASTER",
        code: "MISSING_DOCTOR_NAME",
        message: "Doctor name is blank.",
        cellA1: cellA1
      });
      continue;
    }

    doctors.push(buildDoctorRecord_(fullName, sectionKey, rowNumber));
  }

  return doctors;
}

function buildDoctorRecord_(fullName, sectionKey, rowNumber) {
  let eligibleSlots = [];
  let canDoMICU = false;
  let canDoMHD = false;

  if (sectionKey === "ICU_ONLY") {
    eligibleSlots = ["MICU_CALL", "MICU_STANDBY"];
    canDoMICU = true;
  } else if (sectionKey === "ICU_HD") {
    eligibleSlots = ["MICU_CALL", "MICU_STANDBY", "MHD_CALL", "MHD_STANDBY"];
    canDoMICU = true;
    canDoMHD = true;
  } else if (sectionKey === "HD_ONLY") {
    eligibleSlots = ["MHD_CALL", "MHD_STANDBY"];
    canDoMHD = true;
  }

  return {
    doctorId: sectionKey + "_R" + rowNumber,
    fullName: fullName,
    section: sectionKey,
    sourceRow: rowNumber,
    eligibleSlots: eligibleSlots,
    canDoMICU: canDoMICU,
    canDoMHD: canDoMHD
  };
}

function validateDuplicateDoctorNames_(doctors, parseResult) {
  const seen = {};

  for (let i = 0; i < doctors.length; i++) {
    const doctor = doctors[i];
    const name = doctor.fullName;

    if (seen[name]) {
      addIssue_(parseResult, {
        severity: "ERROR",
        category: "DOCTOR_MASTER",
        code: "DUPLICATE_DOCTOR_NAME",
        message: "Duplicate doctor name found: " + name,
        doctorId: doctor.doctorId
      });
    } else {
      seen[name] = true;
    }
  }
}