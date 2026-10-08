#!/usr/bin/env bash
# MedTrack AI end-to-end tests — 11 flows exercised in Node against js/logic.js.
set -u
cd "$(dirname "$0")/.."

node << 'EOF'
const M = require('/home/hatch/workspace/medtrack-ai/js/logic.js');
const T = '2026-09-28';
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  PASS: ' + m); };
const bad = (m) => { fail++; console.log('  FAIL: ' + m); };
console.log('== medtrack-ai e2e ==');

// Flow 1: add a twice-daily med, log morning dose
const meds = [];
const a = M.addMed(meds, { name: 'Metformin', dose: '500mg', times: ['08:00', '20:00'], pillsRemaining: 60, refillThreshold: 7, notes: 'with food', today: T });
const l = M.logDose(meds, a.med.id, T, '08:00');
(a.ok && l.ok && a.med.pillsRemaining === 59 && M.daysLeft(a.med) === 29)
  ? ok('flow1: add + log morning dose -> 59 pills, 29 days left') : bad('flow1');

// Flow 2: evening dose still pending at noon is not "missed"
const mid = M.allMissed(meds, T, '12:00');
(mid.length === 0) ? ok('flow2: nothing missed at noon') : bad('flow2 missed=' + mid.length);

// Flow 3: at 21:00 the unlogged evening dose shows as missed
const eve = M.allMissed(meds, T, '21:00');
(eve.length === 1 && eve[0].name === 'Metformin' && eve[0].time === '20:00')
  ? ok('flow3: evening dose flagged missed at 21:00') : bad('flow3');

// Flow 4: log it late — missed clears, pill count drops
M.logDose(meds, a.med.id, T, '20:00');
const after = M.allMissed(meds, T, '21:00');
(after.length === 0 && a.med.pillsRemaining === 58)
  ? ok('flow4: late dose logged -> missed clears, 58 pills') : bad('flow4');

// Flow 5: refill alert fires when supply runs low
a.med.pillsRemaining = 10; // 2x daily -> 5 days, threshold 7
const s = M.summarize(meds, T, '21:00')[0];
(s.refillAlert && s.daysLeft === 5) ? ok('flow5: 5 days left <= 7 threshold -> refill alert') : bad('flow5');

// Flow 6: second med with its own schedule; history aggregates
const b = M.addMed(meds, { name: 'Vitamin D', dose: '1000 IU', times: ['09:00'], pillsRemaining: 90, today: T });
M.logDose(meds, b.med.id, T, '09:00');
const hist = M.historyFor(meds, 1, T);
const y = M.addDays(T, -1);
const hist2 = M.historyFor(meds, 2, T);
(hist[0].scheduled === 3 && hist[0].taken === 3 && hist2[0].scheduled === 0)
  ? ok('flow6: 2 meds -> 3 scheduled/3 taken today; yesterday 0 (created today)') : bad('flow6 ' + JSON.stringify(hist[0]));

// Flow 7: bad schedule time rejected; unknown med handled
const badAdd = M.addMed(meds, { name: 'X', dose: '1', times: ['25:99'], pillsRemaining: 5 });
const badLog = M.logDose(meds, 'nope', T, '08:00');
const badSlot = M.logDose(meds, a.med.id, T, '13:00');
(!badAdd.ok && !badLog.ok && !badSlot.ok)
  ? ok('flow7: bad time rejected; unknown med + unscheduled slot fail cleanly') : bad('flow7');

// Flow 8: refill journey — low supply alerts, refill resets, alert clears
a.med.pillsRemaining = 6; // 2x daily -> 3 days left, threshold 7 -> alert
const before = M.summarize(meds, T, '21:00')[0];
const rf = M.refillMed(meds, a.med.id, 60);
const afterRf = M.summarize(meds, T, '21:00')[0];
(before.refillAlert && rf.ok && a.med.pillsRemaining === 60 &&
 afterRf.daysLeft === 30 && !afterRf.refillAlert)
  ? ok('flow8: refill alert -> log refill 60 -> 30 days left, alert clears') : bad('flow8');

// Flow 9: dose log shows what was taken and when
M.logDose(meds, a.med.id, M.addDays(T, -1), '08:00');
const dl = M.doseLog(a.med, 5);
const hasYesterday = dl.some(e => e.date === M.addDays(T, -1) && e.time === '08:00');
const hasToday = dl.some(e => e.date === T && e.time === '08:00');
(dl.length >= 2 && hasYesterday && hasToday)
  ? ok('flow9: dose log lists today + yesterday morning doses') : bad('flow9');

// Flow 10: CSV export carries the full roster with adherence
const csv = M.medsToCSV(meds, T, '21:00');
const cl = csv.split('\n');
(cl[0] === 'name,dose,times,pills_remaining,days_left,refill_alert,adherence_7d' &&
 cl.length === 3 && cl[1].indexOf('Metformin') === 0 && cl[2].indexOf('Vitamin D') === 0)
  ? ok('flow10: CSV header + one row per medication') : bad('flow10 csv=' + csv);

// Flow 11: search filter (UI-side rule) matches names case-insensitively
const q = 'metform';
const hits = meds.filter(m => m.name.toLowerCase().indexOf(q) !== -1);
const noHits = meds.filter(m => m.name.toLowerCase().indexOf('zzz') !== -1);
(hits.length === 1 && hits[0].name === 'Metformin' && noHits.length === 0)
  ? ok('flow11: search "metform" -> 1 hit; "zzz" -> none') : bad('flow11');

console.log('');
console.log('e2e: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
EOF
echo "e2e exit: $?"
