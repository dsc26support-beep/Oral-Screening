(function () {
  'use strict';

  var STEPS = ['patient', 'dmft', 'pufa', 'cpitn', 'cancer', 'review'];
  var LAST_USED_KEY = 'oral_screening_last_used';

  var wizard = null; // in-progress screening state
  var currentStep = null;
  var viewingDetailId = null;

  // ---- small helpers -------------------------------------------------

  function uuid() {
    if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function (c) {
      var r = (Math.random() * 16) | 0;
      var v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }

  function qs(id) { return document.getElementById(id); }

  function showToast(msg) {
    var t = qs('toast');
    t.textContent = msg;
    t.hidden = false;
    setTimeout(function () { t.hidden = true; }, 2500);
  }

  function getLastUsed() {
    try { return JSON.parse(localStorage.getItem(LAST_USED_KEY)) || {}; }
    catch (e) { return {}; }
  }

  function saveLastUsed(examiner, location) {
    localStorage.setItem(LAST_USED_KEY, JSON.stringify({ examiner: examiner, location: location }));
  }

  // ---- screen navigation ----------------------------------------------

  var SCREENS = ['home', 'settings', 'patient', 'dmft', 'pufa', 'cpitn', 'cancer', 'review', 'detail'];

  function showScreen(name) {
    SCREENS.forEach(function (s) {
      qs('screen-' + s).hidden = (s !== name);
    });
    qs('btn-back').hidden = (name === 'home');
    var titles = {
      home: 'Oral Health Screening', settings: 'Settings', patient: 'New Screening',
      dmft: 'New Screening', pufa: 'New Screening', cpitn: 'New Screening',
      cancer: 'New Screening', review: 'New Screening', detail: 'Screening detail'
    };
    qs('app-bar-title').textContent = titles[name] || 'Oral Health Screening';
    qs('btn-settings').hidden = (name !== 'home');
    window.scrollTo(0, 0);
  }

  qs('btn-back').addEventListener('click', function () {
    if (currentStep) {
      var idx = STEPS.indexOf(currentStep);
      if (idx <= 0) { goHome(); return; }
      goToStep(STEPS[idx - 1]);
    } else {
      goHome();
    }
  });

  qs('btn-settings').addEventListener('click', function () {
    loadSettingsForm();
    showScreen('settings');
  });

  function goHome() {
    wizard = null;
    currentStep = null;
    viewingDetailId = null;
    renderHomeList();
    showScreen('home');
  }

  // ---- settings screen --------------------------------------------------

  function loadSettingsForm() {
    var s = window.SyncEngine.getSettings();
    qs('input-apps-script-url').value = s.appsScriptUrl || '';
    qs('input-access-code').value = s.accessCode || '';
    qs('input-default-examiner').value = s.defaultExaminer || '';
    qs('input-default-location').value = s.defaultLocation || '';
    qs('settings-test-result').textContent = '';
  }

  qs('btn-save-settings').addEventListener('click', function () {
    window.SyncEngine.saveSettings({
      appsScriptUrl: qs('input-apps-script-url').value.trim(),
      accessCode: qs('input-access-code').value.trim(),
      defaultExaminer: qs('input-default-examiner').value.trim(),
      defaultLocation: qs('input-default-location').value.trim()
    });
    showToast('Settings saved');
    goHome();
  });

  qs('btn-test-connection').addEventListener('click', function () {
    var url = qs('input-apps-script-url').value.trim();
    var resultEl = qs('settings-test-result');
    if (!url) { resultEl.textContent = 'Enter a URL first.'; return; }
    resultEl.textContent = 'Testing...';
    fetch(url).then(function (res) { return res.json(); }).then(function (data) {
      resultEl.textContent = data && data.ok ? 'Connected OK.' : 'Reached the URL, but got an unexpected response.';
    }).catch(function () {
      resultEl.textContent = 'Could not reach that URL. Check it is deployed and you are online.';
    });
  });

  // ---- new screening: patient step --------------------------------------

  qs('btn-new-screening').addEventListener('click', function () {
    var last = getLastUsed();
    var settings = window.SyncEngine.getSettings();
    wizard = {
      id: uuid(),
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      syncedAt: null,
      examiner: last.examiner || settings.defaultExaminer || '',
      campLocation: last.location || settings.defaultLocation || '',
      patient: { idOrName: '', age: null, sex: '' },
      ageGroup: 'adult',
      consent: false,
      dmft: { teeth: {} },
      pufa: { map: {} },
      cpitn: { sextants: {} },
      cancer: { sites: {}, notes: {}, riskFactors: {} },
      overallNotes: ''
    };
    qs('input-patient-id').value = '';
    qs('input-patient-age').value = '';
    qs('input-patient-sex').value = '';
    document.querySelectorAll('input[name="dentition"]').forEach(function (r) { r.checked = false; });
    qs('input-examiner').value = wizard.examiner;
    qs('input-location').value = wizard.campLocation;
    qs('input-consent').checked = false;
    goToStep('patient');
  });

  document.querySelectorAll('input[name="dentition"]').forEach(function (radio) {
    radio.addEventListener('change', function () {
      var age = parseInt(qs('input-patient-age').value, 10);
      if (!radio.checked) return;
    });
  });

  qs('input-patient-age').addEventListener('input', function () {
    var age = parseInt(this.value, 10);
    if (isNaN(age)) return;
    var anyChecked = document.querySelector('input[name="dentition"]:checked');
    if (anyChecked) return; // don't override an explicit choice
    var radios = document.querySelectorAll('input[name="dentition"]');
    if (age < 6) radios[0].checked = true;
    else if (age >= 13) radios[1].checked = true;
  });

  function goToStep(step) {
    if (step === 'patient') {
      currentStep = 'patient';
      showScreen('patient');
      return;
    }
    if (currentStep === 'patient' && step !== 'patient') {
      if (!validatePatientStep()) return;
      collectPatientStep();
    }
    currentStep = step;
    if (step === 'dmft') renderDmftStep();
    if (step === 'pufa') renderPufaStep();
    if (step === 'cpitn') renderCpitnStep();
    if (step === 'cancer') renderCancerStep();
    if (step === 'review') renderReviewStep();
    showScreen(step);
  }

  function validatePatientStep() {
    var id = qs('input-patient-id').value.trim();
    var age = qs('input-patient-age').value;
    var dentition = document.querySelector('input[name="dentition"]:checked');
    var examiner = qs('input-examiner').value.trim();
    var location = qs('input-location').value.trim();
    if (!id || age === '' || !dentition || !examiner || !location) {
      showToast('Please fill in all required (*) fields.');
      return false;
    }
    return true;
  }

  function collectPatientStep() {
    wizard.patient.idOrName = qs('input-patient-id').value.trim();
    wizard.patient.age = parseInt(qs('input-patient-age').value, 10);
    wizard.patient.sex = qs('input-patient-sex').value;
    wizard.ageGroup = document.querySelector('input[name="dentition"]:checked').value;
    wizard.examiner = qs('input-examiner').value.trim();
    wizard.campLocation = qs('input-location').value.trim();
    wizard.consent = qs('input-consent').checked;
  }

  // ---- DMFT step ---------------------------------------------------------

  function toothCodeClass(code) {
    return 'tooth-code-' + (code === undefined ? 'unset' : code);
  }

  function renderDmftStep() {
    var isChild = wizard.ageGroup === 'child';
    qs('dmft-title').textContent = isChild ? 'dmft chart (primary teeth)' : 'DMFT chart (permanent teeth)';
    var teeth = window.Scoring.getToothSet(wizard.ageGroup);
    var quadSize = teeth.length / 4;
    var quadrants = [
      { label: 'Upper right', teeth: teeth.slice(0, quadSize) },
      { label: 'Upper left', teeth: teeth.slice(quadSize, quadSize * 2) },
      { label: 'Lower right', teeth: teeth.slice(quadSize * 2, quadSize * 3) },
      { label: 'Lower left', teeth: teeth.slice(quadSize * 3) }
    ];
    var container = qs('dmft-chart');
    container.innerHTML = '';
    quadrants.forEach(function (q) {
      var block = document.createElement('div');
      block.className = 'quadrant-block';
      var label = document.createElement('div');
      label.className = 'quadrant-label';
      label.textContent = q.label;
      block.appendChild(label);
      var row = document.createElement('div');
      row.className = 'quadrant-row';
      q.teeth.forEach(function (toothId) {
        var btn = document.createElement('button');
        btn.type = 'button';
        var code = wizard.dmft.teeth[toothId];
        btn.className = 'tooth-btn ' + toothCodeClass(code);
        btn.innerHTML = toothId + '<br><small>' + (code !== undefined ? window.Scoring.TOOTH_CODES[code].short : '-') + '</small>';
        btn.addEventListener('click', function () { openToothModal(toothId); });
        row.appendChild(btn);
      });
      block.appendChild(row);
      container.appendChild(block);
    });
    updateDmftSummary();
  }

  function updateDmftSummary() {
    var s = window.Scoring.scoreDMFT(wizard.dmft.teeth);
    var label = wizard.ageGroup === 'child' ? 'dmft' : 'DMFT';
    qs('dmft-summary').textContent = label + ': D=' + s.D + ' M=' + s.M + ' F=' + s.F + ' Total=' + s.total;
  }

  function openToothModal(toothId) {
    var modal = qs('tooth-modal');
    qs('tooth-modal-title').textContent = 'Tooth ' + toothId;
    var optionsEl = qs('tooth-modal-options');
    optionsEl.innerHTML = '';
    Object.keys(window.Scoring.TOOTH_CODES).forEach(function (codeKey) {
      var code = parseInt(codeKey, 10);
      var info = window.Scoring.TOOTH_CODES[code];
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'modal-option-btn ' + toothCodeClass(code);
      btn.textContent = info.short + ' - ' + info.label;
      btn.addEventListener('click', function () {
        wizard.dmft.teeth[toothId] = code;
        modal.hidden = true;
        renderDmftStep();
      });
      optionsEl.appendChild(btn);
    });
    modal.hidden = false;
  }

  qs('tooth-modal-close').addEventListener('click', function () { qs('tooth-modal').hidden = true; });

  // ---- PUFA step ----------------------------------------------------------

  function renderPufaStep() {
    var isChild = wizard.ageGroup === 'child';
    qs('pufa-title').textContent = isChild ? 'pufa' : 'PUFA';
    var eligible = window.Scoring.decayedTeeth(wizard.dmft.teeth);
    var listEl = qs('pufa-list');
    listEl.innerHTML = '';
    qs('pufa-skip-note').hidden = eligible.length > 0;
    eligible.forEach(function (toothId) {
      var row = document.createElement('div');
      row.className = 'pufa-row';
      var label = document.createElement('div');
      label.textContent = 'Tooth ' + toothId;
      row.appendChild(label);
      var btnRow = document.createElement('div');
      btnRow.className = 'btn-group';
      ['None', 'P', 'U', 'F', 'A'].forEach(function (opt) {
        var value = opt === 'None' ? null : opt;
        var btn = document.createElement('button');
        btn.type = 'button';
        var current = wizard.pufa.map[toothId] || null;
        btn.className = 'chip-btn' + (current === value ? ' chip-btn-selected' : '');
        btn.textContent = opt;
        btn.addEventListener('click', function () {
          wizard.pufa.map[toothId] = value;
          renderPufaStep();
        });
        btnRow.appendChild(btn);
      });
      row.appendChild(btnRow);
      listEl.appendChild(row);
    });
  }

  // ---- CPITN step ----------------------------------------------------------

  function renderCpitnStep() {
    var grid = qs('cpitn-grid');
    grid.innerHTML = '';
    window.Scoring.CPITN_SEXTANTS.forEach(function (sextant) {
      var card = document.createElement('div');
      card.className = 'cpitn-card';
      var title = document.createElement('div');
      title.className = 'cpitn-card-title';
      title.textContent = sextant.label + ' (teeth ' + sextant.indexTeeth.join(', ') + ')';
      card.appendChild(title);
      var btnRow = document.createElement('div');
      btnRow.className = 'btn-group';
      [0, 1, 2, 3, 4, 'X'].forEach(function (val) {
        var btn = document.createElement('button');
        btn.type = 'button';
        var current = wizard.cpitn.sextants[sextant.id];
        btn.className = 'chip-btn' + (current === val ? ' chip-btn-selected' : '');
        btn.textContent = val;
        btn.title = window.Scoring.CPITN_CODE_LABELS[val];
        btn.addEventListener('click', function () {
          wizard.cpitn.sextants[sextant.id] = val;
          renderCpitnStep();
        });
        btnRow.appendChild(btn);
      });
      card.appendChild(btnRow);
      grid.appendChild(card);
    });
    var result = window.Scoring.scoreCPITN(wizard.cpitn.sextants);
    qs('cpitn-summary').textContent = result.treatmentNeed
      ? 'Worst score: ' + result.worst + ' -> ' + result.treatmentNeed + ' (' + result.treatmentLabel + ')'
      : 'Score all sextants to see treatment need.';
  }

  // ---- Cancer screening step --------------------------------------------

  function renderCancerStep() {
    var sitesEl = qs('cancer-sites');
    sitesEl.innerHTML = '';
    window.Scoring.CANCER_SITES.forEach(function (site) {
      var row = document.createElement('div');
      row.className = 'cancer-row';
      var label = document.createElement('div');
      label.textContent = site.label;
      row.appendChild(label);
      var btnRow = document.createElement('div');
      btnRow.className = 'btn-group';
      ['normal', 'abnormal'].forEach(function (val) {
        var btn = document.createElement('button');
        btn.type = 'button';
        var current = wizard.cancer.sites[site.id];
        btn.className = 'chip-btn' + (current === val ? (val === 'abnormal' ? ' chip-btn-danger' : ' chip-btn-selected') : '');
        btn.textContent = val === 'normal' ? 'Normal' : 'Abnormal';
        btn.addEventListener('click', function () {
          wizard.cancer.sites[site.id] = val;
          renderCancerStep();
        });
        btnRow.appendChild(btn);
      });
      row.appendChild(btnRow);
      sitesEl.appendChild(row);
      if (wizard.cancer.sites[site.id] === 'abnormal') {
        var noteInput = document.createElement('textarea');
        noteInput.className = 'note-input';
        noteInput.rows = 2;
        noteInput.placeholder = 'Describe finding (size, location, duration if known)';
        noteInput.value = wizard.cancer.notes[site.id] || '';
        noteInput.addEventListener('input', function () {
          wizard.cancer.notes[site.id] = this.value;
        });
        sitesEl.appendChild(noteInput);
      }
    });

    var riskEl = qs('cancer-risk-factors');
    riskEl.innerHTML = '';
    window.Scoring.RISK_FACTORS.forEach(function (rf) {
      var label = document.createElement('label');
      label.className = 'checkbox-label';
      var input = document.createElement('input');
      input.type = 'checkbox';
      input.checked = !!wizard.cancer.riskFactors[rf.id];
      input.addEventListener('change', function () {
        wizard.cancer.riskFactors[rf.id] = this.checked;
        updateCancerFlag();
      });
      label.appendChild(input);
      var span = document.createElement('span');
      span.textContent = rf.label;
      label.appendChild(span);
      riskEl.appendChild(label);
    });
    updateCancerFlag();
  }

  function updateCancerFlag() {
    var result = window.Scoring.scoreCancerRisk(wizard.cancer.sites, wizard.cancer.riskFactors, wizard.patient.age);
    var el = qs('cancer-flag');
    el.textContent = result.label;
    el.className = 'flag-banner flag-' + result.flag.toLowerCase().replace('_', '-');
  }

  // ---- Review step ---------------------------------------------------------

  function renderReviewStep() {
    var dmft = window.Scoring.scoreDMFT(wizard.dmft.teeth);
    var pufa = window.Scoring.scorePUFA(wizard.dmft.teeth, wizard.pufa.map);
    var cpitn = window.Scoring.scoreCPITN(wizard.cpitn.sextants);
    var cancer = window.Scoring.scoreCancerRisk(wizard.cancer.sites, wizard.cancer.riskFactors, wizard.patient.age);
    var label = wizard.ageGroup === 'child' ? 'dmft / pufa' : 'DMFT / PUFA';

    var html = '';
    html += '<div class="review-card"><h3>Patient</h3>' +
      '<p>' + escapeHtml(wizard.patient.idOrName) + ', age ' + wizard.patient.age +
      (wizard.patient.sex ? ', ' + wizard.patient.sex : '') + '</p>' +
      '<p>Examiner: ' + escapeHtml(wizard.examiner) + ' &middot; ' + escapeHtml(wizard.campLocation) + '</p></div>';

    html += '<div class="review-card"><h3>' + label + '</h3>' +
      '<p>D=' + dmft.D + ' M=' + dmft.M + ' F=' + dmft.F + ' &middot; Total=' + dmft.total + '</p>' +
      '<p>' + (pufa.skipped ? 'PUFA/pufa not required (no decayed teeth).' : 'PUFA/pufa total: ' + pufa.total + ' of ' + pufa.eligibleTeeth.length + ' decayed teeth') + '</p></div>';

    html += '<div class="review-card"><h3>CPITN</h3>' +
      '<p>' + (cpitn.treatmentNeed ? 'Worst score ' + cpitn.worst + ' -> ' + cpitn.treatmentNeed + ' (' + cpitn.treatmentLabel + ')' : 'Not fully assessed') + '</p></div>';

    html += '<div class="review-card"><h3>Oral cancer screening</h3>' +
      '<p class="flag-text flag-' + cancer.flag.toLowerCase().replace('_', '-') + '">' + cancer.label + '</p>' +
      (cancer.abnormalSites.length ? '<p>Abnormal sites: ' + cancer.abnormalSites.join(', ') + '</p>' : '') + '</div>';

    qs('review-content').innerHTML = html;
    qs('input-overall-notes').value = wizard.overallNotes || '';
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
  }

  qs('btn-submit-screening').addEventListener('click', function () {
    wizard.overallNotes = qs('input-overall-notes').value.trim();
    var finalRecord = buildFinalRecord(wizard);
    window.ScreeningDB.saveScreening(finalRecord).then(function () {
      saveLastUsed(wizard.examiner, wizard.campLocation);
      showToast('Saved. Will sync when online.');
      window.SyncEngine.syncNow();
      goHome();
    }).catch(function (err) {
      showToast('Could not save locally: ' + err.message);
    });
  });

  function buildFinalRecord(w) {
    var dmft = window.Scoring.scoreDMFT(w.dmft.teeth);
    var pufa = window.Scoring.scorePUFA(w.dmft.teeth, w.pufa.map);
    var cpitn = window.Scoring.scoreCPITN(w.cpitn.sextants);
    var cancer = window.Scoring.scoreCancerRisk(w.cancer.sites, w.cancer.riskFactors, w.patient.age);
    return {
      id: w.id,
      schemaVersion: w.schemaVersion,
      createdAt: w.createdAt,
      syncedAt: null,
      examiner: w.examiner,
      campLocation: w.campLocation,
      patient: w.patient,
      ageGroup: w.ageGroup,
      consent: w.consent,
      dmft: { teeth: w.dmft.teeth, scores: dmft },
      pufa: { map: w.pufa.map, scores: pufa },
      cpitn: { sextants: w.cpitn.sextants, scores: cpitn },
      cancer: { sites: w.cancer.sites, notes: w.cancer.notes, riskFactors: w.cancer.riskFactors, result: cancer },
      overallNotes: w.overallNotes
    };
  }

  // ---- Next/Back wiring ---------------------------------------------------

  document.querySelectorAll('[data-next]').forEach(function (btn) {
    btn.addEventListener('click', function () { goToStep(btn.getAttribute('data-next')); });
  });
  document.querySelectorAll('[data-back]').forEach(function (btn) {
    btn.addEventListener('click', function () {
      var idx = STEPS.indexOf(currentStep);
      goToStep(idx > 0 ? STEPS[idx - 1] : 'patient');
    });
  });

  // ---- Home list / detail view --------------------------------------------

  function renderHomeList() {
    window.ScreeningDB.getAllScreenings().then(function (all) {
      all.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
      var listEl = qs('home-list');
      listEl.innerHTML = '';
      qs('home-empty').hidden = all.length > 0;
      all.forEach(function (record) {
        var item = document.createElement('div');
        item.className = 'list-item';
        var label = record.ageGroup === 'child' ? 'dmft' : 'DMFT';
        item.innerHTML = '<div><strong>' + escapeHtml(record.patient.idOrName) + '</strong>' +
          '<div class="list-item-sub">Age ' + record.patient.age + ' &middot; ' + label + ' ' + record.dmft.scores.total +
          ' &middot; ' + escapeHtml(record.campLocation) + '</div></div>' +
          '<div class="sync-badge ' + (record.syncedAt ? 'synced' : 'pending') + '">' +
          (record.syncedAt ? 'Synced' : 'Pending') + '</div>';
        item.addEventListener('click', function () { showDetail(record); });
        listEl.appendChild(item);
      });
    });
  }

  function showDetail(record) {
    viewingDetailId = record.id;
    var label = record.ageGroup === 'child' ? 'dmft / pufa' : 'DMFT / PUFA';
    var html = '';
    html += '<div class="review-card"><h3>Patient</h3><p>' + escapeHtml(record.patient.idOrName) + ', age ' + record.patient.age + '</p>' +
      '<p>Examiner: ' + escapeHtml(record.examiner) + ' &middot; ' + escapeHtml(record.campLocation) + '</p>' +
      '<p>Recorded: ' + new Date(record.createdAt).toLocaleString() + '</p>' +
      '<p>Sync status: ' + (record.syncedAt ? 'Synced ' + new Date(record.syncedAt).toLocaleString() : 'Pending') + '</p></div>';
    html += '<div class="review-card"><h3>' + label + '</h3>' +
      '<p>D=' + record.dmft.scores.D + ' M=' + record.dmft.scores.M + ' F=' + record.dmft.scores.F + ' Total=' + record.dmft.scores.total + '</p>' +
      '<p>' + (record.pufa.scores.skipped ? 'PUFA/pufa not required.' : 'PUFA/pufa total: ' + record.pufa.scores.total) + '</p></div>';
    html += '<div class="review-card"><h3>CPITN</h3><p>' +
      (record.cpitn.scores.treatmentNeed ? record.cpitn.scores.treatmentNeed + ' - ' + record.cpitn.scores.treatmentLabel : 'Not fully assessed') + '</p></div>';
    html += '<div class="review-card"><h3>Oral cancer screening</h3><p class="flag-text flag-' +
      record.cancer.result.flag.toLowerCase().replace('_', '-') + '">' + record.cancer.result.label + '</p></div>';
    if (record.overallNotes) html += '<div class="review-card"><h3>Notes</h3><p>' + escapeHtml(record.overallNotes) + '</p></div>';
    qs('detail-content').innerHTML = html;
    currentStep = null;
    showScreen('detail');
  }

  qs('btn-sync-now').addEventListener('click', function () {
    window.SyncEngine.syncNow();
  });

  window.SyncEngine.onStatusChange(function (status) {
    var dot = qs('status-dot');
    var text = qs('status-text');
    if (!status.configured) {
      dot.className = 'status-dot status-warn';
      text.textContent = 'Not set up - add Apps Script URL in Settings';
    } else if (!status.online) {
      dot.className = 'status-dot status-offline';
      text.textContent = 'Offline - ' + status.pendingCount + ' pending';
    } else if (status.syncing) {
      dot.className = 'status-dot status-syncing';
      text.textContent = 'Syncing...';
    } else if (status.pendingCount > 0) {
      dot.className = 'status-dot status-warn';
      text.textContent = status.pendingCount + ' pending sync';
    } else {
      dot.className = 'status-dot status-ok';
      text.textContent = 'All synced';
    }
    if (qs('screen-home').hidden === false) renderHomeList();
  });

  // ---- init -----------------------------------------------------------

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('service-worker.js').catch(function () {});
    });
  }

  goHome();
  window.SyncEngine.notify();
  window.SyncEngine.syncNow();
})();
