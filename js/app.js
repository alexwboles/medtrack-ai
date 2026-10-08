/* MedTrack AI — DOM wiring. */
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

  function render() {
    save(meds);
    var today = M.todayStr();
    var now = nowHHMM();
    var list = el('med-list');

    // Missed-dose banner
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

    // Stats
    var takenToday = 0, scheduledToday = 0;
    meds.forEach(function (m) {
      m.times.forEach(function (t) { scheduledToday++; if (M.takenOn(m, today, t)) takenToday++; });
    });
    el('stat-taken').textContent = takenToday + '/' + scheduledToday;
    el('stat-refills').textContent = meds.filter(M.refillAlert).length;
    el('stat-meds').textContent = meds.length;

    if (!meds.length) {
      list.innerHTML = '<div class="empty"><span class="big" aria-hidden="true">' +
        '<svg width="44" height="44" viewBox="0 0 24 24" fill="none" stroke="#0f766e" stroke-width="1.8" stroke-linecap="round">' +
        '<rect x="3" y="8.5" width="18" height="7" rx="3.5" transform="rotate(-35 12 12)"/>' +
        '<line x1="9.2" y1="7.9" x2="14.8" y2="16.1"/></svg></span>' +
        'No medications yet. Add your first one above.</div>';
      renderHistory();
      return;
    }

    var visible = meds.filter(function (m) {
      return m.name.toLowerCase().indexOf(medSearch) !== -1;
    });
    if (medSearch && !visible.length) {
      list.innerHTML = '<div class="empty">No medications match "' + esc(medSearch) + '".</div>';
      renderHistory();
      return;
    }

    list.innerHTML = visible.map(function (m) {
      var dl = M.daysLeft(m);
      var refill = M.refillAlert(m);
      var adh = M.adherence(m, 7, today);
      var slots = m.times.map(function (t) {
        var done = M.takenOn(m, today, t);
        return '<button class="slot' + (done ? ' done' : '') + '" data-act="dose" data-id="' + m.id + '" data-time="' + t + '">' +
          (done ? '✓ ' : '') + t + '</button>';
      }).join('');
      var logRows = M.doseLog(m, 10).map(function (e) {
        return '<div class="log-row"><span>' + esc(e.date) + '</span><span>' + esc(e.time) + '</span><span class="ok">logged</span></div>';
      }).join('') || '<div class="log-row empty">No doses logged yet.</div>';
      return '<div class="card' + (refill ? ' low' : '') + '">' +
        '<div class="card-head"><div><h3>' + esc(m.name) + '</h3>' +
        '<div class="meta">' + esc(m.dose) + (m.notes ? ' · ' + esc(m.notes) : '') + '</div></div>' +
        '<div class="pills"><span class="num">' + m.pillsRemaining + '</span><span class="lbl">pills left · ~' + dl + ' days</span></div></div>' +
        (refill ? '<div class="refill">Refill soon — about ' + dl + ' day' + (dl === 1 ? '' : 's') + ' left.</div>' : '') +
        '<div class="slots">' + slots + '</div>' +
        '<div class="stats">7-day adherence: <strong>' + (adh == null ? '—' : adh + '%') + '</strong></div>' +
        '<div class="dose-log" id="log-' + m.id + '" style="display:none">' + logRows + '</div>' +
        '<div class="card-actions">' +
        '<button data-act="refill" data-id="' + m.id + '">Log refill</button>' +
        '<button data-act="log" data-id="' + m.id + '">Dose log</button>' +
        '<button class="danger" data-act="del" data-id="' + m.id + '">Remove</button></div>' +
        '</div>';
    }).join('');

    renderHistory();
  }

  function renderHistory() {
    var hist = M.historyFor(meds, 7, M.todayStr());
    el('history').innerHTML = hist.map(function (d) {
      var pct = d.scheduled ? Math.round(d.taken / d.scheduled * 100) : 100;
      var cls = pct === 100 ? 'good' : (pct >= 70 ? 'ok' : 'bad');
      return '<div class="hday ' + cls + '"><span>' + d.date.slice(5) + '</span><strong>' + d.taken + '/' + d.scheduled + '</strong></div>';
    }).join('');
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.getAttribute('data-act'), id = t.getAttribute('data-id');
    if (act === 'dose') {
      var time = t.getAttribute('data-time');
      var m = M.findMed(meds, id);
      if (m && M.takenOn(m, M.todayStr(), time)) M.undoDose(meds, id, M.todayStr(), time);
      else M.logDose(meds, id, M.todayStr(), time);
      render();
    } else if (act === 'refill') {
      var m2 = M.findMed(meds, id);
      var raw = prompt('New pill count for ' + (m2 ? m2.name : 'this medication') + ':', m2 ? String(m2.pillsRemaining) : '');
      if (raw === null) return;
      var res = M.refillMed(meds, id, raw);
      if (!res.ok) { alert(res.error); return; }
      render();
    } else if (act === 'log') {
      var panel = el('log-' + id);
      if (panel) panel.style.display = panel.style.display === 'none' ? '' : 'none';
    } else if (act === 'del') {
      if (confirm('Remove this medication and its log?')) {
        meds = meds.filter(function (x) { return x.id !== id; });
        render();
      }
    }
  });

  el('med-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var times = el('f-times').value.split(',').map(function (s) { return s.trim(); }).filter(Boolean);
    var res = M.addMed(meds, {
      name: el('f-name').value,
      dose: el('f-dose').value,
      times: times,
      pillsRemaining: el('f-pills').value,
      refillThreshold: el('f-threshold').value || 7,
      notes: el('f-notes').value
    });
    var err = el('form-error');
    if (!res.ok) { err.textContent = res.errors.join(' '); err.style.display = 'block'; return; }
    err.style.display = 'none';
    el('f-name').value = ''; el('f-dose').value = ''; el('f-times').value = '';
    el('f-pills').value = ''; el('f-notes').value = ''; el('f-threshold').value = '7';
    render();
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
    render();
  });
  el('printBtn').addEventListener('click', function () { window.print(); });
  el('csvBtn').addEventListener('click', function () {
    if (!meds.length) { alert('No medications to export yet.'); return; }
    downloadFile('medtrack-medications.csv', M.medsToCSV(meds, M.todayStr(), nowHHMM()), 'text/csv;charset=utf-8');
  });

  // Disclaimer footer
  el('disclaimer').textContent = M.DISCLAIMER;

  render();
})();
