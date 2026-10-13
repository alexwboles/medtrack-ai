# MedTrack AI — Redesign Audit (2026-10-13)

Competitors researched: **Medisafe** (pillbox visual with pill shape/color, "as-needed" meds, Medfriend, refill reminders, interaction checker, doctor reports/PDF logbook, appointments, measurements), **MyTherapy** (mood tracker, printable health report), **Pillo/MedTimer** (persistent alarms, privacy-first).

## Visual gaps vs competitors
1. Medisafe's home is a **dose timeline**: "up next" dose front-and-center, then doses grouped by time of day. MedTrack showed flat per-medication cards — you scan 5 cards to answer "what do I take now?"
2. **No pill identity**: Medisafe shows what each pill looks like (shape/color) — a safety feature for seniors with multiple white tablets. MedTrack meds were text-only.
3. Stats were generic counters; Medisafe leads with adherence narrative ("due now", "missed").

## Functional gaps vs competitors
1. **No "up next" dose** — the single most important home-screen job.
2. **No time-of-day dose timeline** (morning/afternoon/evening groupings like Medisafe).
3. **No doctor report**: Medisafe generates an adherence logbook PDF for check-ups; MedTrack had CSV export but nothing print-ready for the doctor.
4. Refill alerts existed but were buried inside med cards — Medisafe treats refills as first-class.

## Redesign plan (all local, no logic.js changes — aggregates computed in app.js)
- **Up-next hero card**: next due dose across all meds, big tap-to-log target; missed banner stays above it.
- **Today's timeline**: doses grouped Morning (05–12) / Afternoon (12–17) / Evening (17–22) / Night; each row = pill capsule visual + name + dose + time + tap slot.
- **Pill visuals**: CSS capsule in one of 8 clinical colors, deterministic per med — the "what your pill looks like" cue.
- **Refill board**: meds with order-by dates + days-left bars + one-tap "log refill".
- **Doctor report**: print-optimized adherence report (7-day % per med, missed counts, refill status, dose log) — Medisafe's logbook, print view.
- Keep everything: add-med form, PRN, streak, history strip, by-time adherence, dose log, reminders, backup/restore, CSV, print schedule, disclaimer.

## Concept (1 paragraph)
Your digital pillbox, Medisafe-grade: a calm clinical morning — the next dose leads in a big tap-to-log hero, the day's doses run down a time-of-day timeline with color-coded pill capsules so every med is recognizable at a glance, refills get their own board with order-by dates, and a print-ready doctor report closes the loop for check-ups. Identity stays apothecary-teal (#0f766e) on mint paper, square edges, tabular dose times.
