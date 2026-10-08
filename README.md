# MedTrack AI

**Never wonder "did I take it?" again.** Missed doses and surprise-empty bottles are the two most common medication problems — both are memory problems. MedTrack AI is a simple, private schedule tracker: tap to check off each dose, see what's missed, and get refill alerts before you run out.

> ⚠️ **Not medical advice.** Always follow your prescriber's instructions — this app only helps you remember your own schedule. If you miss a dose, follow your prescriber's guidance; don't double up on your own.

## Problem
People — especially those managing multiple prescriptions or caring for aging parents — lose track: *did I take the morning pill?* Running out unexpectedly means missed days and urgent pharmacy runs.

## Solution
Add each medication (name, dose, schedule times, pills on hand) → tap time slots to check off doses → MedTrack flags doses that are past due, counts pills down automatically, and warns you when a refill is due.

## Features
1. **Dose check-off** — tap a time slot to log a dose; tap again to undo. Pill count drops automatically.
2. **Missed-dose flags** — doses past their scheduled time and still unlogged show in a warning banner.
3. **Refill alerts** — pills remaining ÷ doses per day = days left; alert fires at your threshold (default 7 days).
4. **7-day adherence** — per-medication % of scheduled doses taken over the last week, plus a 7-day history strip.
5. **Custom schedules** — any number of daily times (e.g. `08:00, 13:00, 20:00`), notes like "take with food".
6. **Honest validation** — bad times, negative pill counts, and unscheduled slots are rejected, never silently accepted.
7. **100% local** — no accounts, no servers, no tracking. Your medication list never leaves this device.
8. **Refill logging** — "Log refill" resets the pill count when you pick up a new bottle; refill alerts recalculate instantly.
9. **Dose log** — every medication shows its recent logged doses (date + time) in an expandable log.
10. **Search** — find a medication by name as the list grows.
11. **Print schedule** — clean print view of today's cards for the fridge or a caregiver.
12. **CSV export** — medication list with adherence and refill status for your doctor visit.

## Pricing vision
Free forever for personal use · **$5/mo Family** (shared view for caregivers, refill reminders) · white-label for clinics.

## Run it
No build step. Open `index.html` in a browser, or:

```bash
python3 -m http.server 8080   # then http://localhost:8080
```

## Tests
```bash
bash test/smoke.sh   # 14 checks: files, syntax, disclaimer, validation, dosing math, history
bash test/e2e.sh     # 7 end-to-end flows in Node against js/logic.js
```

## Architecture
```
index.html        UI shell (disclaimer, stats, schedule cards, history)
css/style.css     light theme, dose slots, refill highlights
js/logic.js       pure logic (scheduling, missed detection, refill math) — UMD, testable in Node
js/app.js         DOM wiring + localStorage persistence
test/smoke.sh     file/syntax/disclaimer/logic checks
test/e2e.sh       full user flows in Node
```
