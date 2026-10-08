/**
 * Clinical scoring logic: DMFT/dmft, PUFA/pufa, CPITN, oral cancer risk flag.
 * Reference: WHO Oral Health Surveys - Basic Methods, 5th edition (2013);
 * Monse et al. 2010 (PUFA/pufa). See docs/CLINICAL-REFERENCE.md for the
 * exact code-to-component mapping and documented assumptions.
 */
(function (global) {
  'use strict';

  // ---- Tooth sets (FDI two-digit notation) -------------------------------

  // Permanent dentition, 32 teeth, quadrants 1-4.
  var ADULT_TEETH = [
    18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28,
    48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38
  ];

  // Primary dentition, 20 teeth, quadrants 5-8.
  var CHILD_TEETH = [
    55, 54, 53, 52, 51, 61, 62, 63, 64, 65,
    85, 84, 83, 82, 81, 71, 72, 73, 74, 75
  ];

  // Tooth status codes, applied per tooth on the DMFT/dmft chart.
  var TOOTH_CODES = {
    0: { label: 'Sound', short: 'A' },
    1: { label: 'Decayed', short: 'D' },
    2: { label: 'Filled, with decay', short: 'D+' },
    3: { label: 'Filled, no decay', short: 'F' },
    4: { label: 'Missing, due to caries', short: 'M' },
    5: { label: 'Missing, other reason', short: 'Mo' },
    6: { label: 'Fissure sealant', short: 'S' },
    7: { label: 'Bridge abutment / crown / implant', short: 'C' },
    8: { label: 'Unerupted', short: 'U' },
    9: { label: 'Excluded / not recorded', short: 'X' }
  };

  // Codes counted toward each DMFT/dmft component.
  var D_CODES = [1, 2];
  var M_CODES = [4];
  var F_CODES = [3, 7];

  var PUFA_CODES = {
    NONE: null,
    P: { label: 'Pulpal involvement' },
    U: { label: 'Ulceration' },
    F: { label: 'Fistula' },
    A: { label: 'Abscess' }
  };

  var CPITN_SEXTANTS = [
    { id: 's1', label: 'Upper right (17-14)', indexTeeth: [17, 16] },
    { id: 's2', label: 'Upper anterior (13-23)', indexTeeth: [11] },
    { id: 's3', label: 'Upper left (24-27)', indexTeeth: [26, 27] },
    { id: 's4', label: 'Lower left (37-34)', indexTeeth: [37, 36] },
    { id: 's5', label: 'Lower anterior (33-43)', indexTeeth: [31] },
    { id: 's6', label: 'Lower right (44-47)', indexTeeth: [46, 47] }
  ];

  var CPITN_CODE_LABELS = {
    0: 'Healthy',
    1: 'Bleeding on probing',
    2: 'Calculus',
    3: 'Pocket 4-5 mm',
    4: 'Pocket 6 mm+',
    X: 'Excluded (<2 teeth)'
  };

  var CANCER_SITES = [
    { id: 'lips', label: 'Lips (extraoral + intraoral)' },
    { id: 'buccal', label: 'Buccal / labial mucosa' },
    { id: 'gingiva', label: 'Gingiva / alveolar ridge' },
    { id: 'tongue', label: 'Tongue (dorsal, ventral, lateral borders)' },
    { id: 'floor', label: 'Floor of mouth' },
    { id: 'hardPalate', label: 'Hard palate' },
    { id: 'softPalate', label: 'Soft palate / oropharynx / tonsillar area' },
    { id: 'neck', label: 'Neck lymph nodes (palpation)' }
  ];

  var RISK_FACTORS = [
    { id: 'tobaccoSmoked', label: 'Tobacco - smoked' },
    { id: 'tobaccoSmokeless', label: 'Tobacco - smokeless / chewed' },
    { id: 'areca', label: 'Areca nut / betel quid' },
    { id: 'alcohol', label: 'Alcohol use' },
    { id: 'priorLesion', label: 'Prior oral lesion / history of oral cancer' },
    { id: 'sunExposure', label: 'Chronic sun exposure (lip)' }
  ];

  function getToothSet(ageGroup) {
    return ageGroup === 'child' ? CHILD_TEETH : ADULT_TEETH;
  }

  function countCodes(teethMap, codes) {
    var n = 0;
    Object.keys(teethMap || {}).forEach(function (toothId) {
      if (codes.indexOf(teethMap[toothId]) !== -1) n += 1;
    });
    return n;
  }

  /**
   * teethMap: { "11": 0, "12": 1, ... } tooth id -> status code (0-9)
   */
  function scoreDMFT(teethMap) {
    var D = countCodes(teethMap, D_CODES);
    var M = countCodes(teethMap, M_CODES);
    var F = countCodes(teethMap, F_CODES);
    return { D: D, M: M, F: F, total: D + M + F };
  }

  /** Teeth eligible for PUFA/pufa: any tooth coded Decayed (1 or 2). */
  function decayedTeeth(teethMap) {
    return Object.keys(teethMap || {}).filter(function (toothId) {
      return D_CODES.indexOf(teethMap[toothId]) !== -1;
    });
  }

  /**
   * pufaMap: { "11": "P" | "U" | "F" | "A" } tooth id -> code, only for
   * teeth that are decayed. Per WHO/Monse 2010, skipped entirely when no
   * decayed teeth are present.
   */
  function scorePUFA(teethMap, pufaMap) {
    var eligible = decayedTeeth(teethMap);
    if (eligible.length === 0) {
      return { skipped: true, eligibleTeeth: [], total: 0 };
    }
    var total = 0;
    eligible.forEach(function (toothId) {
      if (pufaMap && pufaMap[toothId]) total += 1;
    });
    return { skipped: false, eligibleTeeth: eligible, total: total };
  }

  /**
   * sextantScores: { s1: 0-4 | 'X', ... }
   * Treatment need is based on the worst non-excluded sextant score.
   */
  function scoreCPITN(sextantScores) {
    var worst = -1;
    var anyScored = false;
    CPITN_SEXTANTS.forEach(function (sextant) {
      var v = sextantScores ? sextantScores[sextant.id] : undefined;
      if (v === undefined || v === null || v === 'X') return;
      anyScored = true;
      if (v > worst) worst = v;
    });
    if (!anyScored) {
      return { worst: null, treatmentNeed: null, treatmentLabel: 'Not assessed' };
    }
    var tn, label;
    if (worst === 0) { tn = 'TN0'; label = 'No treatment needed'; }
    else if (worst === 1) { tn = 'TN1'; label = 'Oral hygiene instruction'; }
    else if (worst === 2 || worst === 3) { tn = 'TN2'; label = 'OHI + professional scaling'; }
    else { tn = 'TN3'; label = 'OHI + scaling + complex periodontal treatment'; }
    return { worst: worst, treatmentNeed: tn, treatmentLabel: label };
  }

  /**
   * sites: { lips: 'normal'|'abnormal', ... }
   * riskFactors: { tobaccoSmoked: true, ... }
   */
  function scoreCancerRisk(sites, riskFactors, ageYears) {
    var abnormalSites = Object.keys(sites || {}).filter(function (id) {
      return sites[id] === 'abnormal';
    });
    var riskCount = Object.keys(riskFactors || {}).filter(function (id) {
      return !!riskFactors[id];
    }).length;
    if (typeof ageYears === 'number' && ageYears >= 40) riskCount += 1;

    if (abnormalSites.length > 0) {
      return {
        flag: 'REFER',
        label: 'Suspicious finding - refer for further evaluation',
        abnormalSites: abnormalSites,
        riskCount: riskCount
      };
    }
    if (riskCount >= 2) {
      return {
        flag: 'HIGHER_RISK',
        label: 'Higher risk - counsel on cessation, monitor closely',
        abnormalSites: [],
        riskCount: riskCount
      };
    }
    return {
      flag: 'LOW_RISK',
      label: 'Low risk - routine recall',
      abnormalSites: [],
      riskCount: riskCount
    };
  }

  var Scoring = {
    ADULT_TEETH: ADULT_TEETH,
    CHILD_TEETH: CHILD_TEETH,
    TOOTH_CODES: TOOTH_CODES,
    PUFA_CODES: PUFA_CODES,
    CPITN_SEXTANTS: CPITN_SEXTANTS,
    CPITN_CODE_LABELS: CPITN_CODE_LABELS,
    CANCER_SITES: CANCER_SITES,
    RISK_FACTORS: RISK_FACTORS,
    getToothSet: getToothSet,
    scoreDMFT: scoreDMFT,
    decayedTeeth: decayedTeeth,
    scorePUFA: scorePUFA,
    scoreCPITN: scoreCPITN,
    scoreCancerRisk: scoreCancerRisk
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = Scoring;
  } else {
    global.Scoring = Scoring;
  }
})(typeof window !== 'undefined' ? window : globalThis);
