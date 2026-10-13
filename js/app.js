/* MedTrack AI — DOM wiring. Your digital pillbox. */
(function () {
  'use strict';
  var M = window.MedTrack;
  var LS_KEY = 'medtrack.meds.v1';

  function load() {
    try { var raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) : []; }
    catch (e) { return []; }
  }
  function save(meds) {
    try { localStorage.setItem(LS_KEY, JSON.stringify(meds)); } catch (e) {}
  }

  var meds = load();
  var medSearch = '';
  var NOTIFY_KEY = 'medtrack.notify.v1';   // 'granted' | 'denied' | null
  var NOTIFIED_KEY = 'medtrack.notified.v1'; // JSON array of 'date|medId|time' keys already notified
  function el(id) { return document.getElementById(id); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function nowHHMM() {
    var d = new Date();
    var p = function (n) { return (n < 10 ? '0' : '') + n; };
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }
  function toMin(hhmm) {
    var parts = String(hhmm).split(':');
    return parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
  }
  function fmtTime(hhmm) {
    var m = toMin(hhmm), h = Math.floor(m / 60), mm = m % 60;
    var ap = h >= 12 ? 'PM' : 'AM';
    h = h % 12; if (h === 0) h = 12;
    return h + ':' + (mm < 10 ? '0' : '') + mm + ' ' + ap;
  }

  /* ---------- pill capsule colors: deterministic per med, the Medisafe cue ---------- */
  var PILL_COLORS = [
    ['#b03a2e', '#f8f4f0'], ['#1f618d', '#eaf2f8'], ['#b7950b', '#fef9e7'],
    ['#0f766e', '#e3f2ef'], ['#935116', '#fdf2e9'], ['#117a65', '#eafaf1'],
    ['#cb4335', '#fdedec'], ['#5d6d7e', '#f2f3f4']
  ];
  function pillColor(med) {
    var s = String((med && med.id) || '?'), h = 0;
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) % 9973;
    return PILL_COLORS[h % PILL_COLORS.length];
  }
  function pillCap(med, small) {
    var c = pillColor(med);
    return '<span class="pillcap' + (small ? ' small' : '') + '" style="--pc-a:' + c[0] + ';--pc-b:' + c[1] + '" aria-hidden="true"></span>';
  }

  /* ---------- views ---------- */
  var navBtns = Array.prototype.slice.call(document.querySelectorAll('.navbtn'));
  function showView(name) {
    navBtns.forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-view') === name); });
    ['today', 'meds', 'refills', 'report'].forEach(function (v) {
      var d = el('view-' + v);
      if (d) d.style.display = (v === name) ? '' : 'none';
    });
    if (name === 'today') renderToday();
    else if (name === 'meds') renderMeds();
    else if (name === 'refills') renderRefills();
    else if (name === 'report') renderReport();
  }
  navBtns.forEach(function (b) {
    b.addEventListener('click', function () { showView(b.getAttribute('data-view')); });
  });
  window.__showView = showView;

  /* ---------- shared: missed banner ---------- */
  function renderBanner(today, now) {
    var missed = M.allMissed(meds, today, now);
    var banner = el('missed-banner');
    if (missed.length) {
      banner.style.display = 'block';
      banner.innerHTML = '<strong>' + missed.length + ' dose' + (missed.length > 1 ? 's' : '') +
        ' missed so far today:</strong><br>' +
        missed.map(function (x) { return esc(x.name) + ' ' + esc(x.dose) + ' — was due ' + esc(x.time); }).join('<br>') +
        '<div class="tiny">If you missed a dose, follow your prescriber\u2019s instructions — don\u2019t double up on your own.</div>';
    } else {
      banner.style.display = 'none';
    }
  }

  /* ---------- today view ---------- */
  function nextDose(today, now) {
    var nowMin = toMin(now), best = null;
    meds.forEach(function (m) {
      if (m.prn) return;
      (m.times || []).forEach(function (t) {
        if (M.takenOn(m, today, t)) return;
        var tm = toMin(t), overdue = tm < nowMin;
        var score = overdue ? -1e9 + tm : tm;
        if (!best || score < best.score) best = { med: m, time: t, overdue: overdue, score: score };
      });
    });
    if (best) return best;
    // fall back to an as-needed med with capacity left
    for (var i = 0; i < meds.length; i++) {
      var m = meds[i];
      if (m.prn && M.prnTakenOn(m, today) < m.maxPerDay) {
        return { med: m, time: null, overdue: false, prn: true, score: 0 };
      }
    }
    return null;
  }

  function renderUpNext(today, now) {
    var box = el('upnext');
    var nx = nextDose(today, now);
    if (!nx) {
      box.style.display = 'none';
      return;
    }
    box.style.display = '';
    box.classList.toggle('missed', !!nx.overdue);
    var sub, tapBtn;
    if (nx.prn) {
      sub = 'As-needed · ' + M.prnTakenOn(nx.med, today) + ' of ' + nx.med.maxPerDay + ' taken today';
      tapBtn = '<button class="un-tap" data-act="prn" data-id="' + nx.med.id + '">+ Log dose</button>';
    } else {
      sub = fmtTime(nx.time) + (nx.med.notes ? ' · ' + esc(nx.med.notes) : '');
      tapBtn = '<button class="un-tap" data-act="dose" data-id="' + nx.med.id + '" data-time="' + nx.time + '">Log dose</button>';
    }
    box.innerHTML =
      '<div><p class="un-eyebrow">' + (nx.overdue ? 'Overdue — take it when your prescriber says so' : 'Up next') + '</p>' +
      '<h2>' + esc(nx.med.name) + ' <span style="font-weight:500;font-size:18px;opacity:.9">' + esc(nx.med.dose) + '</span></h2>' +
      '<p class="un-sub">' + sub + '</p></div>' +
      '<div class="un-time">' + (nx.prn ? 'when needed' : (nx.overdue ? 'was due ' + fmtTime(nx.time) : 'due ' + fmtTime(nx.time))) + '</div>' +
      tapBtn;
  }

  var TL_GROUPS = [
    { id: 'morning', label: 'Morning', sub: '5 AM – 12 PM', start: 300, end: 720 },
    { id: 'afternoon', label: 'Afternoon', sub: '12 PM – 5 PM', start: 720, end: 1020 },
    { id: 'evening', label: 'Evening', sub: '5 PM – 10 PM', start: 1020, end: 1320 },
    { id: 'night', label: 'Night', sub: '10 PM – 5 AM', start: 1320, end: 300 }
  ];
  function tlGroupOf(t) {
    var m = toMin(t);
    for (var i = 0; i < TL_GROUPS.length; i++) {
      var g = TL_GROUPS[i];
      if (g.start < g.end) { if (m >= g.start && m < g.end) return g; }
      else { if (m >= g.start || m < g.end) return g; }
    }
    return TL_GROUPS[0];
  }

  function renderTimeline(today, now) {
    var nowMin = toMin(now);
    var buckets = {}, prnRows = [];
    TL_GROUPS.forEach(function (g) { buckets[g.id] = []; });
    var visible = meds.filter(function (m) { return m.name.toLowerCase().indexOf(medSearch) !== -1; });
    visible.forEach(function (m) {
      if (m.prn) {
        var taken = M.prnTakenOn(m, today);
        var left = Math.max(0, m.maxPerDay - taken);
        prnRows.push({ med: m, taken: taken, left: left });
        return;
      }
      (m.times || []).forEach(function (t) {
        var done = M.takenOn(m, today, t);
        buckets[tlGroupOf(t).id].push({ med: m, time: t, done: done, pastDue: !done && toMin(t) < nowMin });
      });
    });
    Object.keys(buckets).forEach(function (k) {
      buckets[k].sort(function (a, b) { return a.time < b.time ? -1 : 1; });
    });

    var html = '';
    if (!meds.length) {
      html = '<div class="empty"><span class="big" aria-hidden="true">' +
        '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#0f766e" stroke-width="1.8" stroke-linecap="round">' +
        '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)"/>' +
        '<line x1="9.2" y1="7.9" x2="14.8" y2="16.1"/></svg></span>' +
        'No medications yet. Go to <strong>Medications</strong> and add your first one.</div>';
    } else {
      html = TL_GROUPS.map(function (g) {
        var rows = buckets[g.id];
        var pending = rows.filter(function (r) { return !r.done; }).length;
        var body = rows.length ? rows.map(function (r) {
          return '<div class="tl-row' + (r.done ? ' done' : '') + (r.pastDue ? ' past-due' : '') + '">' +
            pillCap(r.med) +
            '<span class="tl-time">' + esc(r.time) + '</span>' +
            '<div class="tl-info"><strong>' + esc(r.med.name) + '</strong>' +
            '<span>' + esc(r.med.dose) + (r.med.notes ? ' · ' + esc(r.med.notes) : '') + '</span></div>' +
            '<button class="tl-tap" data-act="dose" data-id="' + r.med.id + '" data-time="' + r.time + '">' +
            (r.done ? '✓ Taken' : 'Log dose') + '</button></div>';
        }).join('') : '<div class="tl-empty">Nothing scheduled in this window.</div>';
        return '<div class="tl-group"><div class="tl-head">' + g.label +
          ' <span class="tl-window">' + g.sub + '</span>' +
          '<span class="tl-count">' + pending + ' to take</span></div>' +
          '<div class="tl-rows">' + body + '</div></div>';
      }).join('');
      if (prnRows.length) {
        html += '<div class="tl-group"><div class="tl-head">As needed <span class="tl-window">log when you take it</span></div>' +
          '<div class="tl-rows">' + prnRows.map(function (r) {
            return '<div class="tl-row">' + pillCap(r.med) +
              '<span class="tl-time">PRN</span>' +
              '<div class="tl-info"><strong>' + esc(r.med.name) + '</strong>' +
              '<span>' + esc(r.med.dose) + ' · ' + r.taken + ' of ' + r.med.maxPerDay + ' today</span></div>' +
              '<button class="tl-tap" data-act="prn" data-id="' + r.med.id + '"' + (r.left === 0 ? ' disabled' : '') + '>' +
              (r.left === 0 ? 'Max reached' : '+ Log dose') + '</button></div>';
          }).join('') + '</div></div>';
      }
    }
    el('timeline').innerHTML = html;
  }

  function renderStats(today, now) {
    var takenToday = 0, scheduledToday = 0;
    meds.forEach(function (m) {
      (m.times || []).forEach(function (t) { scheduledToday++; if (M.takenOn(m, today, t)) takenToday++; });
    });
    el('stat-taken').textContent = takenToday + '/' + scheduledToday;
    var needRefill = meds.filter(function (m) { return M.refillAlert(m) || M.orderAlert(m, today); }).length;
    el('stat-refills').textContent = needRefill;
    el('stat-meds').textContent = meds.length;
    var streak = M.streakDays(meds, today, now);
    el('stat-streak').textContent = streak + (streak === 1 ? ' day' : ' days');
    var badge = el('refill-count');
    if (badge) badge.textContent = needRefill ? String(needRefill) : '';
  }

  function renderHistory() {
    var today = M.todayStr();
    var hist = M.historyFor(meds, 7, today);
    var byTime = M.adherenceByTime(meds, 7, today);
    var timeHtml = byTime.length ? '<div class="bytime"><span class="bytime-lbl">By time of day:</span> ' +
      byTime.map(function (s) {
        var cls = s.pct >= 90 ? 'good' : (s.pct >= 70 ? 'ok' : 'bad');
        return '<span class="hday ' + cls + '"><span>' + esc(s.time) + '</span><strong>' + s.pct + '%</strong></span>';
      }).join('') + '</div>' : '';
    el('history').innerHTML = hist.map(function (d) {
      var pct = d.scheduled ? Math.round(d.taken / d.scheduled * 100) : 100;
      var cls = pct === 100 ? 'good' : (pct >= 70 ? 'ok' : 'bad');
      return '<div class="hday ' + cls + '"><span>' + d.date.slice(5) + '</span><strong>' + d.taken + '/' + d.scheduled + '</strong></div>';
    }).join('') + timeHtml;
  }

  function renderToday() {
    save(meds);
    var today = M.todayStr(), now = nowHHMM();
    renderBanner(today, now);
    renderStats(today, now);
    renderUpNext(today, now);
    renderTimeline(today, now);
    renderHistory();
  }

  /* ---------- medications view ---------- */
  function renderMeds() {
    save(meds);
    var today = M.todayStr(), now = nowHHMM();
    renderBanner(today, now);
    var list = el('med-list');
    if (!meds.length) {
      list.innerHTML = '<div class="empty">No medications yet. Add your first one above.</div>';
      return;
    }
    var visible = meds.filter(function (m) {
      return m.name.toLowerCase().indexOf(medSearch) !== -1;
    });
    if (medSearch && !visible.length) {
      list.innerHTML = '<div class="empty">No medications match "' + esc(medSearch) + '".</div>';
      return;
    }
    list.innerHTML = visible.map(function (m) {
      var dl = M.daysLeft(m);
      var refill = M.refillAlert(m);
      var order = M.orderAlert(m, today);
      var orderBy = M.orderByDate(m, today);
      var adh = m.prn ? null : M.adherence(m, 7, today);
      var slots;
      if (m.prn) {
        var taken = M.prnTakenOn(m, today);
        var left = Math.max(0, m.maxPerDay - taken);
        slots = '<button class="slot prn" data-act="prn" data-id="' + m.id + '"' + (left === 0 ? ' disabled' : '') + '>' +
          '+ Log dose (' + taken + '/' + m.maxPerDay + ' today)</button>';
      } else {
        slots = (m.times || []).map(function (t) {
          var done = M.takenOn(m, today, t);
          return '<button class="slot' + (done ? ' done' : '') + '" data-act="dose" data-id="' + m.id + '" data-time="' + t + '">' +
            (done ? '✓ ' : '') + t + '</button>';
        }).join('');
      }
      var logRows = M.doseLog(m, 10).map(function (e) {
        return '<div class="log-row"><span>' + esc(e.date) + '</span><span>' + esc(e.time) + '</span><span class="ok">logged</span></div>';
      }).join('') || '<div class="log-row empty">No doses logged yet.</div>';
      var refillMsg = '';
      if (refill || order) {
        refillMsg = '<div class="refill">' +
          (refill ? 'Refill soon — about ' + dl + ' day' + (dl === 1 ? '' : 's') + ' left. ' : '') +
          'Order by ' + esc(orderBy) + ' to stay ahead.</div>';
      }
      return '<div class="card' + ((refill || order) ? ' low' : '') + '">' +
        '<div class="card-head"><div class="id-block">' + pillCap(m) +
        '<div><h3>' + esc(m.name) + (m.prn ? ' <span class="prn-tag">as-needed</span>' : '') + '</h3>' +
        '<div class="meta">' + esc(m.dose) + (m.notes ? ' · ' + esc(m.notes) : '') + '</div></div></div>' +
        '<div class="pills"><span class="num">' + m.pillsRemaining + '</span><span class="lbl">pills left · ~' + dl + ' days</span></div></div>' +
        refillMsg +
        '<div class="slots">' + slots + '</div>' +
        '<div class="stats">7-day adherence: <strong>' + (adh == null ? '—' : adh + '%') + '</strong></div>' +
        '<div class="dose-log" id="log-' + m.id + '" style="display:none">' + logRows + '</div>' +
        '<div class="card-actions">' +
        '<button data-act="refill" data-id="' + m.id + '">Log refill</button>' +
        '<button data-act="log" data-id="' + m.id + '">Dose log</button>' +
        (m.prn ? '' : '<button data-act="remind" data-id="' + m.id + '" title="Toggle dose reminders for this medication">' +
          'Reminders: ' + (m.remind === false ? 'off' : 'on') + '</button>') +
        '<button class="danger" data-act="del" data-id="' + m.id + '">Remove</button></div>' +
        '</div>';
    }).join('');
  }

  /* ---------- refills view ---------- */
  function renderRefills() {
    save(meds);
    var today = M.todayStr();
    var box = el('refill-board');
    if (!meds.length) {
      box.innerHTML = '<div class="empty">No medications yet — refills will appear here once you add some.</div>';
      return;
    }
    var rows = meds.map(function (m) {
      var dl = M.daysLeft(m);
      var needs = M.refillAlert(m) || M.orderAlert(m, today);
      return { med: m, dl: dl, needs: needs, orderBy: M.orderByDate(m, today) };
    });
    rows.sort(function (a, b) {
      if (a.needs !== b.needs) return a.needs ? -1 : 1;
      return a.dl - b.dl;
    });
    box.innerHTML = rows.map(function (r) {
      var m = r.med;
      var pct = Math.max(0, Math.min(100, Math.round((r.dl / 30) * 100)));
      return '<div class="refill-row' + (r.needs ? '' : ' ok') + '">' +
        pillCap(m, true) +
        '<div><div class="rr-name">' + esc(m.name) + ' <span class="meta">' + esc(m.dose) + '</span></div>' +
        '<div class="rr-bar" aria-hidden="true"><i style="width:' + pct + '%"></i></div></div>' +
        '<div class="rr-when"><strong>' + (r.needs ? 'Order now' : '~' + r.dl + ' days left') + '</strong>' +
        '<span>order by ' + esc(r.orderBy) + '</span></div>' +
        '<button data-act="refill" data-id="' + m.id + '">Log refill</button>' +
        '</div>';
    }).join('');
  }

  /* ---------- doctor report view ---------- */
  function renderReport() {
    save(meds);
    var today = M.todayStr();
    var box = el('doctor-report');
    var genDate = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
    if (!meds.length) {
      box.innerHTML = '<div class="r-head"><h2>Medication report</h2><p>Generated ' + esc(genDate) + ' · MedTrack AI</p></div>' +
        '<p class="hint">No medications yet — your report will appear here once you add some.</p>';
      return;
    }
    var rows = meds.map(function (m) {
      var adh = m.prn ? null : M.adherence(m, 7, today);
      var missed = 0, scheduled = 0;
      if (!m.prn) {
        for (var back = 0; back < 7; back++) {
          var d = M.addDays(today, -back);
          (m.times || []).forEach(function (t) {
            scheduled++;
            if (!M.takenOn(m, d, t)) missed++;
          });
        }
      }
      var sched = m.prn ? 'as needed (max ' + m.maxPerDay + '/day)' : (m.times || []).join(', ');
      return '<tr><td><strong>' + esc(m.name) + '</strong></td>' +
        '<td>' + esc(m.dose) + '</td><td>' + esc(sched) + '</td>' +
        '<td>' + (adh == null ? '—' : adh + '%') + '</td>' +
        '<td>' + (m.prn ? '—' : missed + ' of ' + scheduled) + '</td>' +
        '<td>' + m.pillsRemaining + '</td>' +
        '<td>' + esc(M.orderByDate(m, today)) + '</td></tr>';
    }).join('');
    var logs = meds.map(function (m) {
      var entries = M.doseLog(m, 5).map(function (e) {
        return esc(e.date) + ' ' + esc(e.time);
      }).join(' · ') || 'no doses logged yet';
      return '<tr><td><strong>' + esc(m.name) + '</strong></td><td>' + entries + '</td></tr>';
    }).join('');
    box.innerHTML =
      '<div class="r-head"><h2>Medication report</h2>' +
      '<p>Generated ' + esc(genDate) + ' · MedTrack AI · for discussion with your prescriber or pharmacist</p></div>' +
      '<h3>Adherence — last 7 days</h3>' +
      '<table><thead><tr><th>Medication</th><th>Dose</th><th>Schedule</th><th>Adherence</th><th>Missed</th><th>Pills left</th><th>Order by</th></tr></thead>' +
      '<tbody>' + rows + '</tbody></table>' +
      '<h3>Recent dose log</h3>' +
      '<table><thead><tr><th>Medication</th><th>Last logged doses</th></tr></thead><tbody>' + logs + '</tbody></table>' +
      '<p class="r-note">Not medical advice. This report reflects what was logged in the app — always follow your prescriber\u2019s instructions.</p>';
  }

  function renderAll() { renderToday(); renderMeds(); renderRefills(); }

  /* ---------- dose actions ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.getAttribute('data-act'), id = t.getAttribute('data-id');
    if (act === 'dose') {
      var time = t.getAttribute('data-time');
      var m = M.findMed(meds, id);
      if (m && M.takenOn(m, M.todayStr(), time)) M.undoDose(meds, id, M.todayStr(), time);
      else M.logDose(meds, id, M.todayStr(), time);
      renderAll();
    } else if (act === 'prn') {
      var res = M.logPrnDose(meds, id, M.todayStr());
      if (!res.ok) alert(res.error);
      renderAll();
    } else if (act === 'refill') {
      var m2 = M.findMed(meds, id);
      var raw = prompt('New pill count for ' + (m2 ? m2.name : 'this medication') + ':', m2 ? String(m2.pillsRemaining) : '');
      if (raw === null) return;
      var res2 = M.refillMed(meds, id, raw);
      if (!res2.ok) { alert(res2.error); return; }
      renderAll();
    } else if (act === 'log') {
      var panel = el('log-' + id);
      if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
    } else if (act === 'remind') {
      var m3 = M.findMed(meds, id);
      if (m3) { m3.remind = m3.remind === false; renderMeds(); }
    } else if (act === 'del') {
      if (confirm('Remove this medication and its log?')) {
        meds = meds.filter(function (x) { return x.id !== id; });
        renderAll();
      }
    }
  });

  el('f-prn').addEventListener('change', function () {
    var prn = el('f-prn').checked;
    el('f-maxwrap').style.display = prn ? '' : 'none';
    el('f-times').required = !prn;
    el('f-times').placeholder = prn ? 'not needed for as-needed' : 'e.g. 08:00, 20:00';
  });

  el('med-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var times = el('f-times').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var res = M.addMed(meds, {
      name: el('f-name').value,
      dose: el('f-dose').value,
      prn: el('f-prn').checked,
      maxPerDay: el('f-maxperday').value,
      times: times,
      pillsRemaining: el('f-pills').value,
      refillThreshold: el('f-threshold').value || 7,
      refillLeadDays: el('f-lead').value || 0,
      notes: el('f-notes').value
    });
    var err = el('form-error');
    if (!res.ok) { err.textContent = res.errors.join(' '); err.style.display = 'block'; return; }
    err.style.display = 'none';
    el('f-name').value = ''; el('f-dose').value = ''; el('f-times').value = '';
    el('f-pills').value = ''; el('f-notes').value = ''; el('f-threshold').value = '7';
    el('f-lead').value = '3'; el('f-prn').checked = false;
    el('f-maxwrap').style.display = 'none'; el('f-times').required = true;
    renderToday(); renderMeds();
    showView('today');
  });

  function downloadFile(filename, text, mime) {
    var blob = new Blob([text], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 400);
  }

  el('med-search').addEventListener('input', function (e) {
    medSearch = e.target.value.trim().toLowerCase();
    renderToday();
  });

  function printWith(cls) {
    document.body.classList.add(cls);
    var done = function () {
      document.body.classList.remove(cls);
      window.removeEventListener('afterprint', done);
    };
    window.addEventListener('afterprint', done);
    // safety: some headless/print flows never fire afterprint
    setTimeout(done, 4000);
    window.print();
  }
  el('printBtn').addEventListener('click', function () { printWith('printing-schedule'); });
  el('reportPrintBtn').addEventListener('click', function () { printWith('printing-report'); });

  el('csvBtn').addEventListener('click', function () {
    if (!meds.length) { alert('No medications to export yet.'); return; }
    downloadFile('medtrack-medications.csv', M.medsToCSV(meds, M.todayStr(), nowHHMM()), 'text/csv;charset=utf-8');
  });

  /* ---------- dose reminders (browser notifications) ---------- */
  function notifyEnabled() {
    try { return localStorage.getItem(NOTIFY_KEY) === 'granted'; }
    catch (e) { return false; }
  }
  function notifiedKeys() {
    try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || '[]'); }
    catch (e) { return []; }
  }
  function markNotified(key) {
    var keys = notifiedKeys();
    if (keys.indexOf(key) === -1) keys.push(key);
    var cutoff = M.addDays(M.todayStr(), -2);
    keys = keys.filter(function (k) { return k.split('|')[0] >= cutoff; });
    try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(keys.slice(-200))); } catch (e) {}
  }

  function checkReminders() {
    if (!notifyEnabled()) return;
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    var today = M.todayStr();
    var due = M.dueReminders(meds, today, nowHHMM(), 10, 30);
    var seen = notifiedKeys();
    due.forEach(function (d) {
      var key = today + '|' + d.medId + '|' + d.time;
      if (seen.indexOf(key) === -1) {
        seen.push(key);
        markNotified(key);
        try {
          new Notification(d.overdue ? 'Missed dose?' : 'Time for your dose', {
            body: d.name + ' ' + d.dose + ' — was due ' + (d.overdue ? 'at ' : '') + d.time +
              '. Tap a slot in MedTrack when you take it.',
            tag: key
          });
        } catch (e) { /* notifications blocked */ }
      }
    });
  }

  el('remindBtn').addEventListener('click', function () {
    if (!('Notification' in window)) { alert('This browser does not support notifications.'); return; }
    var done = function (perm) {
      try { localStorage.setItem(NOTIFY_KEY, perm === 'granted' ? 'granted' : 'denied'); } catch (e) {}
      el('remindBtn').textContent = perm === 'granted' ? 'Reminders on' : 'Enable reminders';
      if (perm === 'granted') checkReminders();
      else alert('Notifications were not allowed — reminders stay off.');
    };
    if (Notification.permission === 'granted') done('granted');
    else if (Notification.permission === 'denied') done('denied');
    else Notification.requestPermission().then(done);
  });
  if (notifyEnabled() && 'Notification' in window && Notification.permission === 'granted') {
    el('remindBtn').textContent = 'Reminders on';
  }
  setInterval(checkReminders, 30000);

  /* ---------- backup / restore ---------- */
  el('backupBtn').addEventListener('click', function () {
    if (!meds.length) { alert('Nothing to back up yet.'); return; }
    downloadFile('medtrack-backup-' + M.todayStr() + '.json',
      M.exportBackup(meds), 'application/json;charset=utf-8');
  });
  el('restoreBtn').addEventListener('click', function () { el('restoreFile').click(); });
  el('restoreFile').addEventListener('change', function (e) {
    var file = e.target.files && e.target.files[0];
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var res = M.importBackup(reader.result);
      if (!res.ok) { alert(res.error); e.target.value = ''; return; }
      if (!confirm('Restore ' + res.meds.length + ' medication' + (res.meds.length === 1 ? '' : 's') +
          ' from backup? This replaces your current list.')) { e.target.value = ''; return; }
      meds = res.meds;
      renderToday(); renderMeds(); renderRefills();
      e.target.value = '';
    };
    reader.readAsText(file);
  });

  // Disclaimer footer
  el('disclaimer').textContent = M.DISCLAIMER;

  renderToday();
  checkReminders();
})();
