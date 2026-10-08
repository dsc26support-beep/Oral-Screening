/**
 * Offline queue -> Apps Script sync. Records sit in IndexedDB until this
 * successfully POSTs them and the backend confirms the row was written.
 *
 * The POST body is sent as text/plain (not application/json) so the
 * browser treats it as a "simple request" and skips the CORS preflight -
 * Apps Script web apps don't handle OPTIONS preflight requests, so a
 * normal JSON content-type fetch would otherwise fail cross-origin.
 */
(function (global) {
  'use strict';

  var SETTINGS_KEY = 'oral_screening_settings';
  var BASE_RETRY_MS = 5000;
  var MAX_RETRY_MS = 5 * 60 * 1000;

  var retryDelay = BASE_RETRY_MS;
  var retryTimer = null;
  var syncing = false;
  var listeners = [];

  function getSettings() {
    try {
      return JSON.parse(localStorage.getItem(SETTINGS_KEY)) || {};
    } catch (e) {
      return {};
    }
  }

  function saveSettings(settings) {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
    notify();
  }

  function isConfigured() {
    var s = getSettings();
    return !!(s.appsScriptUrl && s.accessCode);
  }

  function onStatusChange(fn) {
    listeners.push(fn);
  }

  function notify() {
    global.ScreeningDB.getPendingScreenings().then(function (pending) {
      var status = {
        pendingCount: pending.length,
        syncing: syncing,
        online: navigator.onLine,
        configured: isConfigured()
      };
      listeners.forEach(function (fn) { fn(status); });
    });
  }

  function postRecord(record) {
    var settings = getSettings();
    var payload = JSON.stringify({
      accessCode: settings.accessCode,
      record: record
    });
    return fetch(settings.appsScriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: payload
    }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return res.json();
    });
  }

  function syncPending() {
    if (syncing || !isConfigured() || !navigator.onLine) {
      notify();
      return Promise.resolve();
    }
    syncing = true;
    notify();
    return global.ScreeningDB.getPendingScreenings().then(function (pending) {
      if (pending.length === 0) {
        syncing = false;
        retryDelay = BASE_RETRY_MS;
        notify();
        return;
      }
      var chain = Promise.resolve();
      var hadFailure = false;
      pending.forEach(function (record) {
        chain = chain.then(function () {
          return postRecord(record)
            .then(function (response) {
              if (response && response.ok) {
                return global.ScreeningDB.markSynced(record.id, new Date().toISOString());
              }
              hadFailure = true;
            })
            .catch(function () {
              hadFailure = true;
            });
        });
      });
      return chain.then(function () {
        syncing = false;
        if (hadFailure) {
          retryDelay = Math.min(retryDelay * 2, MAX_RETRY_MS);
          scheduleRetry();
        } else {
          retryDelay = BASE_RETRY_MS;
        }
        notify();
      });
    });
  }

  function scheduleRetry() {
    if (retryTimer) clearTimeout(retryTimer);
    retryTimer = setTimeout(syncPending, retryDelay);
  }

  function syncNow() {
    retryDelay = BASE_RETRY_MS;
    return syncPending();
  }

  global.addEventListener('online', function () {
    retryDelay = BASE_RETRY_MS;
    syncPending();
  });
  global.addEventListener('offline', notify);

  global.SyncEngine = {
    getSettings: getSettings,
    saveSettings: saveSettings,
    isConfigured: isConfigured,
    onStatusChange: onStatusChange,
    syncNow: syncNow,
    syncPending: syncPending,
    notify: notify
  };
})(window);
