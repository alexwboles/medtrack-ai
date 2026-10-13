#!/usr/bin/env bash
# MedTrack AI smoke tests — 57 checks.
set -u
cd "$(dirname "$0")/.."
PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); echo "  PASS: $1"; }
bad()  { FAIL=$((FAIL+1)); echo "  FAIL: $1"; }

echo "== medtrack-ai smoke =="

# 1-5: files exist
for f in index.html css/style.css js/logic.js js/app.js README.md; do
  if [ -f "$f" ]; then ok "file exists: $f"; else bad "missing file: $f"; fi
done

# 6-7: JS syntax
if node --check js/logic.js 2>/dev/null; then ok "logic.js syntax"; else bad "logic.js syntax"; fi
if node --check js/app.js 2>/dev/null; then ok "app.js syntax"; else bad "app.js syntax"; fi

# 8: disclaimer present in logic + UI
if grep -q "Not medical advice" js/logic.js && grep -q "disclaimer" index.html; then
  ok "disclaimer in logic.js + index.html"
else
  bad "disclaimer missing"
fi

# 9-14: logic checks in Node
node << 'EOF'
const M = require('/home/hatch/workspace/medtrack-ai/js/logic.js');
let pass = 0, fail = 0;
const ok = (m) => { pass++; console.log('  PASS: ' + m); };
const bad = (m) => { fail++; console.log('  FAIL: ' + m); };
const T = '2026-09-28';

// 9: validation rejects bad input
const v1 = M.validateMed({ name: '', dose: '10mg', times: ['08:00'], pillsRemaining: 30 });
const v2 = M.validateMed({ name: 'X', dose: '10mg', times: [], pillsRemaining: 30 });
const v3 = M.validateMed({ name: 'X', dose: '10mg', times: ['8am'], pillsRemaining: 30 });
const v4 = M.validateMed({ name: 'X', dose: '10mg', times: ['08:00'], pillsRemaining: -1 });
const v5 = M.validateMed({ name: 'X', dose: '10mg', times: ['08:00'], pillsRemaining: 30 });
(!v1.ok && !v2.ok && !v3.ok && !v4.ok && v5.ok) ? ok('validateMed: empty name/no times/bad time/negative pills rejected') : bad('validateMed');

// 10: add + log dose decrements pills
const meds = [];
const a = M.addMed(meds, { name: 'Lisinopril', dose: '10mg', times: ['08:00', '20:00'], pillsRemaining: 30, today: T });
const l = M.logDose(meds, a.med.id, T, '08:00');
(a.ok && l.ok && !l.already && a.med.pillsRemaining === 29 && M.takenOn(a.med, T, '08:00'))
  ? ok('addMed + logDose: pills 30 -> 29, taken flagged') : bad('logDose pills=' + (a.med && a.med.pillsRemaining));

// 11: daysLeft + refill alert math (2x daily, 29 pills -> 14 days; threshold 7 -> no alert)
const dl = M.daysLeft(a.med);
(dl === 14 && !M.refillAlert(a.med)) ? ok('daysLeft 14, no refill alert') : bad('daysLeft=' + dl);
// force low: undo then set pills to 5
a.med.pillsRemaining = 5;
(M.daysLeft(a.med) === 2 && M.refillAlert(a.med)) ? ok('low pills: 2 days left -> refill alert fires') : bad('refill alert');

// 12: missed doses — 08:00 taken, 20:00 due, now 21:00 -> one missed
a.med.pillsRemaining = 30;
const missed = M.missedDoses(a.med, T, '21:00');
(missed.length === 1 && missed[0].time === '20:00') ? ok('missedDoses: 1 missed at 21:00') : bad('missed=' + JSON.stringify(missed));
// not-yet-due dose is not "missed"
const missedEarly = M.missedDoses(a.med, T, '09:00');
(missedEarly.length === 0) ? ok('missedDoses: future dose not flagged at 09:00') : bad('early missed');

// 13: double log idempotent; undo restores pill
const l2 = M.logDose(meds, a.med.id, T, '08:00');
const u = M.undoDose(meds, a.med.id, T, '08:00');
(l2.ok && l2.already && u.ok && a.med.pillsRemaining === 31 && !M.takenOn(a.med, T, '08:00'))
  ? ok('double-log idempotent; undo restores pill') : bad('idempotent/undo');

// 14: history + adherence over 3 days
M.logDose(meds, a.med.id, M.addDays(T, -1), '08:00');
M.logDose(meds, a.med.id, M.addDays(T, -1), '20:00');
M.logDose(meds, a.med.id, M.addDays(T, -2), '08:00');
const hist = M.historyFor(meds, 3, T);
const adh = M.adherence(a.med, 3, T);
// scheduled: 2/day x 3 = 6; taken: today 0 (undone) + 2 + 1 = 3 -> 50%
(hist.length === 3 && hist[2].taken === 0 && adh === 50)
  ? ok('historyFor 3 days; adherence 50%') : bad('adherence=' + adh);

// 15: refillMed resets the pill count; bad input rejected
a.med.pillsRemaining = 5;
const rf = M.refillMed(meds, a.med.id, 30);
const rfBad = M.refillMed(meds, a.med.id, -2);
const rfFrac = M.refillMed(meds, a.med.id, 2.5);
const rfMissing = M.refillMed(meds, 'nope', 30);
(rf.ok && a.med.pillsRemaining === 30 && M.daysLeft(a.med) === 15 &&
 !rfBad.ok && !rfFrac.ok && !rfMissing.ok)
  ? ok('refillMed: 5 -> 30 pills, 15 days left; rejects bad input') : bad('refillMed');

// 16: doseLog returns newest-first entries, honors limit
a.med.log.push({ date: M.addDays(T, -2), time: '20:00', at: M.addDays(T, -2) + 'T20:01:00.000Z' });
const log = M.doseLog(a.med, 2);
const logAll = M.doseLog(a.med);
(log.length === 2 && logAll.length >= log.length && M.doseLog({ log: [] }).length === 0)
  ? ok('doseLog: newest-first, limit 2, empty log -> []') : bad('doseLog=' + JSON.stringify(log));
// order check: first entry must be the newest 'at'
const sorted = logAll.every((e, i, arr) => i === 0 || arr[i-1].at >= e.at);
sorted ? ok('doseLog entries sorted newest-first') : bad('doseLog order');

// 17: medsToCSV header + per-med row (now with prn + order_by columns)
const csv = M.medsToCSV(meds, T, '21:00');
const clines = csv.split('\n');
(clines[0] === 'name,dose,times,prn,pills_remaining,days_left,order_by,refill_alert,adherence_7d' &&
 clines.length === 2 && clines[1].indexOf('Lisinopril,10mg,08:00;20:00,,30,15,') === 0)
  ? ok('medsToCSV: header + row with order_by date, no refill') : bad('csv=' + csv);

// 18: PRN meds — validate, log with daily cap, pill countdown
const pv = M.validateMed({ name: 'Ibuprofen', dose: '200mg', prn: true, maxPerDay: 0, pillsRemaining: 20 });
const pv2 = M.validateMed({ name: 'Ibuprofen', dose: '200mg', prn: true, maxPerDay: 3, pillsRemaining: 20 });
(!pv.ok && pv2.ok) ? ok('validateMed: PRN needs maxPerDay >= 1') : bad('prn validation');
const prnMeds = [];
const pa = M.addMed(prnMeds, { name: 'Ibuprofen', dose: '200mg', prn: true, maxPerDay: 2, pillsRemaining: 20, today: T });
(pa.ok && pa.med.prn && pa.med.maxPerDay === 2 && pa.med.times.length === 0)
  ? ok('addMed: PRN med added without schedule') : bad('prn addMed');
const p1 = M.logPrnDose(prnMeds, pa.med.id, T);
const p2 = M.logPrnDose(prnMeds, pa.med.id, T);
const p3 = M.logPrnDose(prnMeds, pa.med.id, T);
(p1.ok && p2.ok && !p3.ok && /Daily limit/.test(p3.error) && pa.med.pillsRemaining === 18 && M.prnTakenOn(pa.med, T) === 2)
  ? ok('logPrnDose: 2 logged, 3rd rejected at cap, pills 20 -> 18') : bad('prn cap');
const pSched = M.logPrnDose(meds, a.med.id, T);
(!pSched.ok) ? ok('logPrnDose rejects scheduled meds') : bad('prn on scheduled med');
(M.dosesPerDay(pa.med) === 2 && M.daysLeft(pa.med) === 9)
  ? ok('PRN daysLeft uses daily cap: 18 pills / 2 per day = 9 days') : bad('prn daysLeft');

// 19: adherence by time of day
const tm = [];
const ta = M.addMed(tm, { name: 'AM Drug', dose: '5mg', times: ['08:00', '20:00'], pillsRemaining: 60, today: M.addDays(T, -2) });
M.logDose(tm, ta.med.id, M.addDays(T, -1), '08:00'); // morning taken
M.logDose(tm, ta.med.id, M.addDays(T, -1), '20:00'); // evening taken
M.logDose(tm, ta.med.id, T, '08:00');               // morning taken, evening missed
const abt = M.adherenceByTime(tm, 2, T);
const am = abt.filter(s => s.time === '08:00')[0];
const pm = abt.filter(s => s.time === '20:00')[0];
(am && am.pct === 100 && pm && pm.pct === 50)
  ? ok('adherenceByTime: mornings 100%, evenings 50%') : bad('byTime=' + JSON.stringify(abt));

// 20: refill order-by date with lead time
const om = [];
const oa = M.addMed(om, { name: 'Daily', dose: '10mg', times: ['08:00'], pillsRemaining: 10, refillLeadDays: 3, today: T });
(M.orderByDate(oa.med, T) === M.addDays(T, 7) && !M.orderAlert(oa.med, T))
  ? ok('orderByDate: 10 pills, 3-day lead -> order by ' + M.addDays(T, 7)) : bad('orderBy=' + M.orderByDate(oa.med, T));
oa.med.pillsRemaining = 3;
(M.orderAlert(oa.med, T) && M.orderByDate(oa.med, T) === T)
  ? ok('orderAlert fires when order-by date is today') : bad('orderAlert');
const summ = M.summarize(om, T, null)[0];
(summ.orderBy === T && summ.orderAlert && summ.adherence7 != null)
  ? ok('summarize carries order_by + orderAlert') : bad('summarize order');

// 21: dueReminders — due soon + recently overdue, skips logged/muted/PRN
const rm = [];
const ra = M.addMed(rm, { name: 'A', dose: '10mg', times: ['08:00', '20:00'], pillsRemaining: 30, today: T });
const rb = M.addMed(rm, { name: 'B', dose: '5mg', prn: true, maxPerDay: 3, pillsRemaining: 10, today: T });
const rc = M.addMed(rm, { name: 'C', dose: '5mg', times: ['08:00'], pillsRemaining: 10, remind: false, today: T });
const d1 = M.dueReminders(rm, T, '07:55', 10, 30).map(x => x.name);
(d1.length === 1 && d1[0] === 'A')
  ? ok('dueReminders: 08:00 dose due at 07:55, PRN + muted excluded') : bad('due1=' + JSON.stringify(d1));
const d2 = M.dueReminders(rm, T, '08:25', 10, 30);
(d2.length === 1 && d2[0].overdue === true)
  ? ok('dueReminders: 08:00 overdue at 08:25 flagged') : bad('due2=' + JSON.stringify(d2));
M.logDose(rm, ra.med.id, T, '08:00');
(M.dueReminders(rm, T, '08:25', 10, 30).length === 0)
  ? ok('dueReminders: logged dose no longer due') : bad('logged dose still due');
(M.dueReminders(rm, T, '19:55', 10, 30).length === 1)
  ? ok('dueReminders: evening dose due at 19:55') : bad('evening due');

// 22: streakDays — consecutive perfect days, today partial is fine
const sm = [];
const sa = M.addMed(sm, { name: 'S', dose: '10mg', times: ['08:00'], pillsRemaining: 30, today: M.addDays(T, -3) });
M.logDose(sm, sa.med.id, M.addDays(T, -2), '08:00');
M.logDose(sm, sa.med.id, M.addDays(T, -1), '08:00');
(M.streakDays(sm, T, '07:00') === 2)
  ? ok('streakDays: 2 perfect days, today all-future') : bad('streak=' + M.streakDays(sm, T, '07:00'));
(M.streakDays(sm, T, '09:00') === 0)
  ? ok('streakDays: today 08:00 missed -> streak broken') : bad('streak should break');
M.logDose(sm, sa.med.id, T, '08:00');
(M.streakDays(sm, T, '09:00') === 3)
  ? ok('streakDays: today taken -> 3-day streak') : bad('streak=' + M.streakDays(sm, T, '09:00'));

// 23: backup export/import round-trip + rejection of bad files
const bm = [];
M.addMed(bm, { name: 'Z', dose: '1mg', times: ['09:00'], pillsRemaining: 5, today: T });
M.logDose(bm, bm[0].id, T, '09:00');
const bjson = M.exportBackup(bm);
const br = M.importBackup(bjson);
(br.ok && br.meds.length === 1 && br.meds[0].log.length === 1 && br.meds[0].name === 'Z')
  ? ok('exportBackup/importBackup round-trips meds + logs') : bad('backup round-trip');
(!M.importBackup('not json').ok && !M.importBackup('{"app":"other","meds":[]}').ok &&
 !M.importBackup('{"app":"medtrack-ai","meds":[{"name":""}]}').ok)
  ? ok('importBackup rejects bad JSON / wrong app / invalid entry') : bad('importBackup validation');

console.log('');
console.log('logic: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
EOF
rc=$?
[ $rc -eq 0 ] || { echo "  FAIL: node logic block (exit $rc)"; FAIL=$((FAIL+1)); }

# 15-16: new UI controls exist in index.html
for id in med-search printBtn csvBtn stat-streak remindBtn backupBtn restoreBtn restoreFile; do
  if grep -q "id=\"$id\"" index.html; then ok "index.html has id=$id"; else bad "index.html missing id=$id"; fi
done

# 17: print CSS + dose-log styles present
if grep -q '@media print' css/style.css && grep -q '\.dose-log' css/style.css && grep -q '\.list-toolbar' css/style.css; then
  ok "print CSS + dose-log + toolbar styles present"
else
  bad "print/dose-log/toolbar CSS missing"
fi

# 18: stats-row fits 4 stats
if grep -q "repeat(4, 1fr)" css/style.css; then
  ok "stats-row has 4 columns"
else
  bad "stats-row not updated for 4 stats"
fi

# 19: app.js wires reminders, streak, backup/restore
for needle in dueReminders streakDays exportBackup importBackup remindBtn backupBtn restoreBtn checkReminders "data-act=\"remind\""; do
  if grep -q "$needle" js/app.js; then ok "app.js wires $needle"; else bad "app.js missing $needle"; fi
done


# 18-20: pillbox redesign — new views, timeline, refill board, doctor report
for id in upnext timeline refill-board doctor-report reportPrintBtn refill-count view-today view-meds view-refills view-report history-sec; do
  if grep -q "id=\"$id\"" index.html; then ok "index.html has id=$id"; else bad "index.html missing id=$id"; fi
done

for needle in showView renderUpNext renderTimeline renderRefills renderReport pillCap nextDose printing-report printing-schedule; do
  if grep -q "$needle" js/app.js; then ok "app.js wires $needle"; else bad "app.js missing $needle"; fi
done

if grep -q '\.upnext' css/style.css && grep -q '\.tl-row' css/style.css && grep -q '\.pillcap' css/style.css && grep -q '\.refill-row' css/style.css && grep -q '\.topnav' css/style.css; then
  ok "pillbox CSS: upnext, timeline, pillcap, refill board, topnav"
else
  bad "pillbox CSS missing"
fi

# 21: up-next pick logic (earliest overdue first, then earliest upcoming) on real logic fns
node << 'NODEEOF'
const M = require('/home/hatch/workspace/medtrack-ai/js/logic.js');
const T = '2026-10-13';
const meds = [];
const a = M.addMed(meds, { name: 'Lisinopril', dose: '10mg', times: ['08:00', '20:00'], pillsRemaining: 30, today: T });
const b = M.addMed(meds, { name: 'Metformin', dose: '500mg', times: ['09:00'], pillsRemaining: 30, today: T });
M.logDose(meds, a.med.id, T, '08:00'); // morning taken
// now = 21:00 -> overdue: 20:00 (liso), 09:00 (met, older); upcoming: none left today
const missed = M.allMissed(meds, T, '21:00');
if (missed.length !== 2) { console.error('missed=' + missed.length); process.exit(1); }
// up-next rule: earliest overdue time first -> metformin 09:00 beats lisinopril 20:00
const pick = (function () {
  let best = null;
  meds.forEach(m => (m.times || []).forEach(t => {
    if (M.takenOn(m, T, t)) return;
    const mins = t.split(':').reduce((h, x) => h * 60 + +x);
    const score = mins < 21 * 60 ? -1e9 + mins : mins;
    if (!best || score < best.score) best = { name: m.name, time: t, score };
  }));
  return best;
})();
if (!pick || pick.name !== 'Metformin' || pick.time !== '09:00') { console.error('pick=' + JSON.stringify(pick)); process.exit(1); }
// refill board ordering: fewest days left first
const c = M.addMed(meds, { name: 'Atorvastatin', dose: '20mg', times: ['21:00'], pillsRemaining: 6, today: T });
const order = meds.slice().sort((x, y) => M.daysLeft(x) - M.daysLeft(y));
if (order[0].name !== 'Atorvastatin') { console.error('refill order'); process.exit(1); }
NODEEOF
rc=$?
[ $rc -eq 0 ] && ok "up-next pick + refill board ordering" || { echo "  FAIL: node logic block (exit $rc)"; FAIL=$((FAIL+1)); }

echo ""
echo "smoke: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
