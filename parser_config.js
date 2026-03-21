function getParserConfig() {
  return {
    sheetName: "Sheet1",
    ranges: {
      dateHeader: "B1:AC1",
      weekdayHeader: "B2:AC2",
      icuOnlyNames: "A4:A11",
      icuOnlyRequests: "B4:AC11",
      icuHdNames: "A14:A20",
      icuHdRequests: "B14:AC20",
      hdOnlyNames: "A23:A30",
      hdOnlyRequests: "B23:AC30",
      micuPoints: "B32:AC32",
      mhdPoints: "B33:AC33"
    },
    allowedCodes: ["CR", "NC", "AL", "TL", "SL", "MC", "HL", "NSL", "OPL", "EMCC", "EXAM"],
    hardBlockCodes: ["NC", "AL", "TL", "SL", "MC", "HL", "NSL", "OPL", "EMCC", "EXAM"],
    prevDayPenaltyCodes: ["AL", "TL", "SL", "MC", "HL", "NSL", "OPL", "EMCC", "EXAM"]
  };
}