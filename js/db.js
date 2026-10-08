/**
 * IndexedDB wrapper for the local screenings queue. Records are written
 * here first and only removed from "pending" once the Apps Script backend
 * confirms the row was written - so nothing is lost if the device goes
 * offline mid-screening or mid-sync.
 */
(function (global) {
  'use strict';

  var DB_NAME = 'oral_screening_db';
  var DB_VERSION = 1;
  var STORE = 'screenings';

  var dbPromise = null;

  function openDB() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise(function (resolve, reject) {
      var req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = function () {
        var db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          var store = db.createObjectStore(STORE, { keyPath: 'id' });
          store.createIndex('bySyncedAt', 'syncedAt', { unique: false });
          store.createIndex('byCreatedAt', 'createdAt', { unique: false });
        }
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { reject(req.error); };
    });
    return dbPromise;
  }

  function withStore(mode, fn) {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, mode);
        var store = tx.objectStore(STORE);
        var result;
        try {
          result = fn(store);
        } catch (err) {
          reject(err);
          return;
        }
        tx.oncomplete = function () { resolve(result); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      });
    });
  }

  function saveScreening(record) {
    return withStore('readwrite', function (store) {
      store.put(record);
    });
  }

  function updateScreening(record) {
    return saveScreening(record);
  }

  function getAllScreenings() {
    return openDB().then(function (db) {
      return new Promise(function (resolve, reject) {
        var tx = db.transaction(STORE, 'readonly');
        var store = tx.objectStore(STORE);
        var req = store.getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { reject(req.error); };
      });
    });
  }

  function getPendingScreenings() {
    return getAllScreenings().then(function (all) {
      return all.filter(function (r) { return !r.syncedAt; });
    });
  }

  function markSynced(id, syncedAt) {
    return withStore('readwrite', function (store) {
      var req = store.get(id);
      req.onsuccess = function () {
        var record = req.result;
        if (record) {
          record.syncedAt = syncedAt;
          store.put(record);
        }
      };
    });
  }

  global.ScreeningDB = {
    saveScreening: saveScreening,
    updateScreening: updateScreening,
    getAllScreenings: getAllScreenings,
    getPendingScreenings: getPendingScreenings,
    markSynced: markSynced
  };
})(window);
