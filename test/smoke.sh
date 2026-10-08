#!/usr/bin/env bash
# MedTrack AI smoke tests — 24 checks (12 shell + 12 in the Node logic block).
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

// 17: medsToCSV header + per-med row
const csv = M.medsToCSV(meds, T, '21:00');
const clines = csv.split('\n');
(clines[0] === 'name,dose,times,pills_remaining,days_left,refill_alert,adherence_7d' &&
 clines.length === 2 && clines[1].indexOf('Lisinopril,10mg,08:00;20:00,30,15,no,') === 0)
  ? ok('medsToCSV: header + row with days_left 15, no refill') : bad('csv=' + csv);

console.log('');
console.log('logic: ' + pass + ' passed, ' + fail + ' failed');
process.exit(fail ? 1 : 0);
EOF
rc=$?
[ $rc -eq 0 ] || { echo "  FAIL: node logic block (exit $rc)"; FAIL=$((FAIL+1)); }

# 15-16: new UI controls exist in index.html
for id in med-search printBtn csvBtn; do
  if grep -q "id=\"$id\"" index.html; then ok "index.html has id=$id"; else bad "index.html missing id=$id"; fi
done

# 17: print CSS + dose-log styles present
if grep -q '@media print' css/style.css && grep -q '\.dose-log' css/style.css && grep -q '\.list-toolbar' css/style.css; then
  ok "print CSS + dose-log + toolbar styles present"
else
  bad "print/dose-log/toolbar CSS missing"
fi

echo ""
echo "smoke: $PASS passed, $FAIL failed"
[ "$FAIL" -eq 0 ]
