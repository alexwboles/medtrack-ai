/* MedTrack AI — pure logic (Node + browser). No DOM here.
   NOT medical advice: this is a schedule/reminder organizer only. */
(function (root, factory) {
  var M = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = M;
  else root.MedTrack = M;
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var DISCLAIMER = 'Not medical advice. Always follow your prescriber\u2019s instructions — this app only helps you remember your own schedule.';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function toStr(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parse(str) {
    var p = str.split('-');
    return new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
  }
  function addDays(str, n) {
    var d = parse(str);
    d.setDate(d.getDate() + n);
    return toStr(d);
  }
  function todayStr() { return toStr(new Date()); }

  var _seq = 0;
  function genId() {
    _seq += 1;
    return 'm' + Date.now().toString(36) + _seq.toString(36);
  }

  function validTime(t) { return /^\d{2}:\d{2}$/.test(t) && t >= '00:00' && t <= '23:59'; }

  function validateMed(input) {
    var errors = [];
    if (!input.name || !String(input.name).trim()) errors.push('Medication name is required.');
    if (!input.dose || !String(input.dose).trim()) errors.push('Dose is required (e.g. "10mg", "1 tablet").');
    var times = input.times || [];
    if (!times.length) errors.push('Add at least one scheduled time.');
    times.forEach(function (t) { if (!validTime(t)) errors.push('Bad time: ' + t + ' (use HH:MM).'); });
    var pills = Number(input.pillsRemaining);
    if (isNaN(pills) || pills < 0 || Math.floor(pills) !== pills) errors.push('Pills remaining must be a whole number ≥ 0.');
    var thr = Number(input.refillThreshold == null ? 7 : input.refillThreshold);
    if (isNaN(thr) || thr < 0) errors.push('Refill alert threshold must be ≥ 0 days.');
    return { ok: errors.length === 0, errors: errors };
  }

  function addMed(meds, input) {
    var v = validateMed(input);
    if (!v.ok) return { ok: false, errors: v.errors };
    var times = input.times.slice().sort();
    var med = {
      id: genId(),
      name: String(input.name).trim(),
      dose: String(input.dose).trim(),
      times: times,
      pillsRemaining: Number(input.pillsRemaining),
      refillThreshold: Number(input.refillThreshold == null ? 7 : input.refillThreshold),
      notes: String(input.notes || '').trim(),
      createdAt: input.today || todayStr(),
      log: [] // {date:'YYYY-MM-DD', time:'HH:MM', at: ISO}
    };
    meds.push(med);
    return { ok: true, med: med };
  }

  function findMed(meds, id) {
    for (var i = 0; i < meds.length; i++) if (meds[i].id === id) return meds[i];
    return null;
  }

  function takenOn(med, date, time) {
    return med.log.some(function (e) { return e.date === date && e.time === time; });
  }

  // Check off one scheduled dose. Decrements pills remaining (never below 0).
  function logDose(meds, id, date, time) {
    var med = findMed(meds, id);
    if (!med) return { ok: false, error: 'Medication not found.' };
    if (med.times.indexOf(time) === -1) return { ok: false, error: 'Not a scheduled time for this medication.' };
    if (takenOn(med, date, time)) return { ok: true, already: true, med: med };
    med.log.push({ date: date, time: time, at: new Date().toISOString() });
    med.pillsRemaining = Math.max(0, med.pillsRemaining - 1);
    return { ok: true, already: false, med: med };
  }

  function undoDose(meds, id, date, time) {
    var med = findMed(meds, id);
    if (!med) return { ok: false, error: 'Medication not found.' };
    for (var i = 0; i < med.log.length; i++) {
      if (med.log[i].date === date && med.log[i].time === time) {
        med.log.splice(i, 1);
        med.pillsRemaining += 1;
        return { ok: true, med: med };
      }
    }
    return { ok: false, error: 'No logged dose to undo.' };
  }

  function dosesPerDay(med) { return med.times.length; }

  function daysLeft(med) {
    var dpd = dosesPerDay(med);
    if (dpd === 0) return Infinity;
    return Math.floor(med.pillsRemaining / dpd);
  }

  function refillAlert(med) {
    return daysLeft(med) <= med.refillThreshold;
  }

  // Doses scheduled earlier today (or on `date`) that are not yet logged.
  // nowHHMM only applies when date === today; pass null to list all unlogged.
  function missedDoses(med, date, nowHHMM) {
    return med.times.filter(function (t) {
      if (takenOn(med, date, t)) return false;
      if (nowHHMM && t >= nowHHMM) return false; // not due yet
      return true;
    }).map(function (t) { return { medId: med.id, name: med.name, dose: med.dose, date: date, time: t }; });
  }

  function allMissed(meds, date, nowHHMM) {
    var out = [];
    meds.forEach(function (m) { out = out.concat(missedDoses(m, date, nowHHMM)); });
    return out.sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  }

  // Last `days` days ending today: scheduled vs taken counts per day.
  function historyFor(meds, days, today) {
    today = today || todayStr();
    var out = [];
    for (var i = days - 1; i >= 0; i--) {
      var date = addDays(today, -i);
      var scheduled = 0, taken = 0;
      meds.forEach(function (m) {
        // Days before the med was added count only if the user backfilled
        // doses there (the schedule clearly applied in real life).
        var hasLogs = m.log.some(function (e) { return e.date === date; });
        if (m.createdAt > date && !hasLogs) return; // didn't exist yet
        m.times.forEach(function (t) {
          scheduled++;
          if (takenOn(m, date, t)) taken++;
        });
      });
      out.push({ date: date, scheduled: scheduled, taken: taken, missed: scheduled - taken });
    }
    return out;
  }

  function adherence(med, days, today) {
    var hist = historyFor([med], days, today);
    var s = 0, t = 0;
    hist.forEach(function (d) { s += d.scheduled; t += d.taken; });
    if (!s) return null;
    return Math.round((t / s) * 100);
  }

  function summarize(meds, today, nowHHMM) {
    today = today || todayStr();
    return meds.map(function (m) {
      return {
        id: m.id, name: m.name, dose: m.dose, times: m.times.slice(),
        pillsRemaining: m.pillsRemaining, daysLeft: daysLeft(m),
        refillAlert: refillAlert(m),
        missed: missedDoses(m, today, nowHHMM),
        adherence7: adherence(m, 7, today)
      };
    });
  }

  return {
    DISCLAIMER: DISCLAIMER,
    toStr: toStr, parse: parse, addDays: addDays, todayStr: todayStr,
    validateMed: validateMed, addMed: addMed, findMed: findMed,
    logDose: logDose, undoDose: undoDose, takenOn: takenOn,
    dosesPerDay: dosesPerDay, daysLeft: daysLeft, refillAlert: refillAlert,
    missedDoses: missedDoses, allMissed: allMissed,
    historyFor: historyFor, adherence: adherence, summarize: summarize
  };
}));
