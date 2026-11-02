/* 차트보는형 도구함 — 계산기 6개 · 익명 상담 폼 · 카드 크게 보기
   외부 추적기 없음. 이 파일은 서버에 아무것도 저장하지 않고, 상담 폼만 CONSULT_ENDPOINT(config.js)로 보낸다. */
(function () {
  'use strict';

  var MINUS = '−';
  var $ = function (sel, root) { return (root || document).querySelector(sel); };
  var $$ = function (sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); };

  /* ───────── 숫자 읽기 · 쓰기 ───────── */
  function parseNum(s) {
    if (s == null) return NaN;
    s = String(s).replace(/[,\s]/g, '').replace(/[−–—]/g, '-');
    if (!/^-?(\d+\.?\d*|\.\d+)$/.test(s)) return NaN;
    return Number(s);
  }
  var NF = {};
  function nf(opts) {
    var k = JSON.stringify(opts);
    return NF[k] || (NF[k] = new Intl.NumberFormat('ko-KR', opts));
  }
  function withMinus(x, s) { return (x < 0 ? MINUS : '') + s; }
  // 가격: 크기에 맞춰 소수 자리 (57,300 · 90.5 · 0.3611 · 0.00001234)
  function fmtPrice(x) {
    var a = Math.abs(x);
    var s = a >= 1000 ? nf({ maximumFractionDigits: 2 }).format(a)
      : a >= 1 ? nf({ maximumFractionDigits: 4 }).format(a)
      : a === 0 ? '0' : nf({ maximumSignificantDigits: 5 }).format(a);
    return withMinus(x, s);
  }
  // 돈 · 수량 (1,000 넘으면 소수 버림)
  function fmtAmt(x) {
    var a = Math.abs(x);
    var s = a >= 1000 ? nf({ maximumFractionDigits: 0 }).format(a)
      : a >= 1 ? nf({ maximumFractionDigits: 2 }).format(a)
      : a === 0 ? '0' : nf({ maximumSignificantDigits: 4 }).format(a);
    return withMinus(x, s);
  }
  // 퍼센트: 1 미만은 소수 둘째 자리, 나머지는 첫째 자리 · 부호는 +/−
  function fmtPct(x, signed) {
    var a = Math.abs(x);
    var d = a < 1 ? 2 : 1;
    var r = Number(a.toFixed(d));
    var s = nf({ minimumFractionDigits: d, maximumFractionDigits: d }).format(r) + '%';
    if (signed === false || r === 0) return s;
    return (x > 0 ? '+' : MINUS) + s;
  }
  function fmtPlain(x, digits) { return nf({ maximumFractionDigits: digits }).format(x); }

  /* ───────── 별명 ───────── */
  var NICK_KEY = 'charthyung_nick';
  function cleanNick(s) { s = String(s || ''); if (s.normalize) s = s.normalize('NFC'); return s.trim(); }
  function josaRo(w) {                                   // 받침 있으면 '으로' (ㄹ 받침은 '로')
    var t = String(w || ''), c = t.charCodeAt(t.length - 1);
    if (c >= 0xAC00 && c <= 0xD7A3) { var j = (c - 0xAC00) % 28; return j === 0 || j === 8 ? '로' : '으로'; }
    return '로';
  }
  function rememberNick(n) {
    try { localStorage.setItem(NICK_KEY, n); } catch (e) { /* 저장 막힘 */ }
    var box = document.getElementById('af-nick');
    if (box && n) box.value = n;
  }

  /* ───────── 입력칸: 천 단위 콤마 ───────── */
  function formatField(el) {
    var old = el.value;
    var allowNeg = el.hasAttribute('data-neg');
    var isInt = el.hasAttribute('data-int');
    var keep = isInt ? /[0-9]/ : /[0-9.\-−]/;
    var caret = typeof el.selectionStart === 'number' ? el.selectionStart : old.length;
    var before = 0, raw = '', i;
    for (i = 0; i < old.length; i++) {
      if (keep.test(old[i])) { raw += old[i]; if (i < caret) before++; }
    }
    raw = raw.replace(/−/g, '-');
    var neg = allowNeg && raw.charAt(0) === '-';
    if (raw.charAt(0) === '-' && !neg) before--;          // 지운 '-' 만큼 커서 보정
    raw = raw.replace(/-/g, '');
    var dot = raw.indexOf('.');
    var ip = dot >= 0 ? raw.slice(0, dot) : raw;
    var fp = dot >= 0 ? raw.slice(dot + 1).replace(/\./g, '') : null;
    if (ip.length > 1) ip = ip.replace(/^0+(?=\d)/, '');
    var out = (neg ? '-' : '') + ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fp !== null ? '.' + fp : '');
    if (out === old) return;
    el.value = out;
    var pos = 0, seen = 0;
    while (pos < out.length && seen < before) { if (out[pos] !== ',') seen++; pos++; }
    if (document.activeElement === el) { try { el.setSelectionRange(pos, pos); } catch (e) { /* 일부 브라우저 */ } }
  }
  // 캡처 단계: 계산기(버블 단계)보다 먼저 콤마를 정리해 둔다
  document.addEventListener('input', function (e) {
    var el = e.target;
    if (el && el.hasAttribute && el.hasAttribute('data-num') && !e.isComposing) formatField(el);
  }, true);
  $$('.sign').forEach(function (b) {
    b.addEventListener('click', function () {
      var el = document.getElementById(b.getAttribute('data-sign-for'));
      if (!el) return;
      var v = el.value.replace(/^\s+/, '');
      el.value = v.charAt(0) === '-' ? v.slice(1) : '-' + v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.focus();
    });
  });

  /* ───────── 계산기 6개 ───────── */
  function vals(p) {
    var v = {};
    $$('[data-k]', p).forEach(function (el) { v[el.getAttribute('data-k')] = parseNum(el.value); });
    return v;
  }
  function side(p) { var r = $('.seg-side input:checked', p); return r ? r.value : 'long'; }
  function put(p, key, text, cls) {
    var el = $('[data-o="' + key + '"]', p);
    if (!el) return;
    el.textContent = text;
    el.classList.remove('warn', 'muted');
    if (cls) el.classList.add(cls);
  }
  function blank(p, hintKey, hint) {
    $$('[data-o]', p).forEach(function (el) {
      var k = el.getAttribute('data-o');
      if (/_k$/.test(k)) return;                           // 라벨은 그대로
      el.textContent = /_h$/.test(k) ? '' : '—';
      el.classList.remove('warn', 'muted');
      if (!/_h$/.test(k)) el.classList.add('muted');      // 빈 결과 '—' 는 흐리게
    });
    if (hintKey && hint) put(p, hintKey, hint, 'warn');
  }

  var CALC = {
    // 물타기 평단: 새 평단 = (P1·Q1 + P2·Q2) ÷ (Q1 + Q2), 본전까지 = 추가 가격 → 새 평단
    avg: function (p) {
      var v = vals(p), s = side(p);
      if (!(v.p1 > 0 && v.q1 > 0 && v.p2 > 0 && v.q2 > 0)) return blank(p);
      var qty = v.q1 + v.q2;
      var avg = (v.p1 * v.q1 + v.p2 * v.q2) / qty;
      var be = (avg / v.p2 - 1) * 100;
      put(p, 'avg', fmtPrice(avg));
      if (Math.abs(be) < 0.005) {
        put(p, 'be', '0%'); put(p, 'be_h', '추가 가격이 곧 본전');
      } else if (s === 'long' ? be > 0 : be < 0) {
        put(p, 'be', fmtPct(be));
        put(p, 'be_h', s === 'long' ? '추가 가격에서 이만큼 올라야 본전' : '추가 가격에서 이만큼 내려야 본전');
      } else {
        put(p, 'be', '이미 넘음');
        put(p, 'be_h', s === 'long' ? '추가 가격이 새 평단보다 높아요' : '추가 가격이 새 평단보다 낮아요');
      }
      put(p, 'qty', fmtAmt(qty));
      put(p, 'chg', fmtPct((avg / v.p1 - 1) * 100));
    },
    // 본전까지: 필요한 상승률 = 1 ÷ (1 − 손실률) − 1
    breakeven: function (p) {
      var L = Math.abs(vals(p).loss);
      if (L >= 100) return blank(p, 'need_h', '100% 넘게 잃으면 되찾을 수 없어요');
      if (!(L > 0)) return blank(p);
      var need = (1 / (1 - L / 100) - 1) * 100;
      put(p, 'need', fmtPct(need));
      put(p, 'need_h', MINUS + fmtPlain(L, 2) + '% → ' + fmtPct(need));
    },
    // 청산가(격리, 대략): 롱 = 진입가 × (1 − 1/레버리지 + 유지증거금률), 숏 = 진입가 × (1 + 1/레버리지 − 유지증거금률)
    liq: function (p) {
      var v = vals(p), s = side(p);
      if (v.lev > 200) return blank(p, 'dist_h', '레버리지는 200배까지만 계산해요');
      if (v.lev > 0 && v.lev < 1) return blank(p, 'dist_h', '레버리지는 1배 이상으로 넣어 주세요');
      if (v.mm >= 50) return blank(p, 'dist_h', '유지증거금률이 너무 커요');
      if (!(v.e > 0 && v.lev >= 1 && v.mm >= 0)) return blank(p);
      var m = v.mm / 100;
      var liq = s === 'long' ? v.e * (1 - 1 / v.lev + m) : v.e * (1 + 1 / v.lev - m);
      var dist = (liq / v.e - 1) * 100;
      var bad = s === 'long' ? liq >= v.e : liq <= v.e;
      put(p, 'liq', fmtPrice(liq));
      put(p, 'dist', fmtPct(dist));
      put(p, 'dist_h', bad ? '이 레버리지면 들어가자마자 청산 구간이에요' : (s === 'long' ? '여기까지 내리면 청산' : '여기까지 오르면 청산'), bad ? 'warn' : '');
    },
    // 포지션 크기 = 시드 × 손실% ÷ 손절폭%, 필요한 레버리지 = 포지션 ÷ 시드
    size: function (p) {
      var v = vals(p);
      if (v.risk > 100 || v.stop > 100) return blank(p, 'lev_h', '퍼센트는 100 이하로 넣어 주세요');
      if (!(v.seed > 0 && v.risk > 0 && v.stop > 0)) return blank(p);
      var pos = v.seed * v.risk / v.stop;
      var lev = pos / v.seed;
      put(p, 'pos', fmtAmt(pos));
      put(p, 'lev', fmtPlain(lev, 2) + '배');
      put(p, 'lev_h', lev <= 1 ? '레버리지 없이 가능' : '');
      put(p, 'loss', fmtAmt(v.seed * v.risk / 100));
    },
    // 펀딩비 = 포지션 × |펀딩비율| × (보유 시간 ÷ 8) — +면 롱이 내고 숏이 받음
    funding: function (p) {
      var v = vals(p), s = side(p);
      if (!(v.pos > 0 && isFinite(v.rate) && v.hours > 0)) { blank(p); put(p, 'amt_k', '펀딩비'); return; }
      var n = v.hours / 8;
      var per = v.pos * Math.abs(v.rate) / 100;
      var amt = per * n;
      var pay = v.rate === 0 ? null : ((s === 'long') === (v.rate > 0));
      put(p, 'amt_k', pay === null ? '펀딩비' : pay ? '내는 펀딩비' : '받는 펀딩비');
      put(p, 'amt', fmtAmt(amt));
      put(p, 'amt_h', '정산 약 ' + fmtPlain(n, 1) + '번');
      put(p, 'pct', v.seed > 0 ? fmtPct(amt / v.seed * 100, false) : '—');
      put(p, 'day', fmtAmt(per * 3));
    },
    // 연패: 남는 시드 = 시드 × (1 − 손절%)^연패, 복구 = 1 ÷ (1 − 손절%)^연패 − 1
    streak: function (p) {
      var v = vals(p);
      if (v.loss >= 100) return blank(p, 'left_h', '한 번 손절은 100% 미만으로 넣어 주세요');
      if (v.n > 1000) return blank(p, 'left_h', '연패는 1,000번까지만 계산해요');
      if (!(v.seed > 0 && v.loss > 0 && v.n >= 1)) return blank(p);
      var n = Math.floor(v.n);
      var k = Math.pow(1 - v.loss / 100, n);
      put(p, 'left', fmtAmt(v.seed * k));
      put(p, 'left_h', '누적 ' + fmtPct((k - 1) * 100));
      put(p, 'need', k < 1e-4 ? '사실상 불가' : fmtPct((1 / k - 1) * 100));
    }
  };

  $$('[data-calc]').forEach(function (p) {
    var fn = CALC[p.getAttribute('data-calc')];
    if (!fn) return;
    var run = function () { try { fn(p); } catch (e) { blank(p); } };
    p.addEventListener('input', run);
    p.addEventListener('change', run);
    run();
  });

  /* ───────── 앱 탭: ✨시그널 · 🧮계산기 · 🙋상담소 ─────────
     주소: #signals · #calc · #consult · 계산기 하위 = #calc-avg · #calc-breakeven · #calc-liq
     예전 주소는 가까운 탭으로: #answers → 상담소(내 답 찾기 펼침) · #calc-funding·#size 등 뺀 계산기 → #calc · #avg 등 → #calc-avg
     탭 이동 = 주소(hash) 바뀜 → 뒤로 가기가 탭 이동. 화면을 다시 불러오지 않고 보이기·숨기기만. */
  var TABS = ['signals', 'calc', 'consult'];
  var SUBS = ['avg', 'breakeven', 'liq'];
  var GONE = ['size', 'funding', 'streak'];            // 2026-11-02 뺀 계산기 (_보관)
  var TITLES = { signals: '차트보는형 도구함', calc: '계산기 · 차트보는형 도구함', consult: '익명 상담소 · 차트보는형 도구함' };
  var root = document.documentElement;
  var subBtns = $$('.subtabs [role="tab"]');
  var lastSub = 'avg';
  function selectSub(id) {
    if (SUBS.indexOf(id) < 0) id = 'avg';
    subBtns.forEach(function (t) {
      var on = t.getAttribute('aria-controls') === id;
      t.setAttribute('aria-selected', on ? 'true' : 'false');
      t.tabIndex = on ? 0 : -1;
      var panel = document.getElementById(t.getAttribute('aria-controls'));
      if (panel) panel.hidden = !on;
    });
    lastSub = id;
  }
  function parseHash() {
    var h = '';
    try { h = decodeURIComponent((location.hash || '').slice(1)); } catch (e) { h = ''; }
    if (TABS.indexOf(h) >= 0) return { tab: h };
    if (/^calc-/.test(h) && SUBS.indexOf(h.slice(5)) >= 0) return { tab: 'calc', sub: h.slice(5) };
    if (SUBS.indexOf(h) >= 0) return { tab: 'calc', sub: h, fix: '#calc-' + h };      // 예전 주소 #avg 등
    if (GONE.indexOf(h.replace(/^calc-/, '')) >= 0) return { tab: 'calc', sub: 'avg', fix: '#calc' };
    if (h === 'answers') return { tab: 'consult', fix: '#consult', find: true };
    return { tab: 'signals' };
  }
  function route(first) {
    var r = parseHash();
    var prev = root.getAttribute('data-tab');
    root.setAttribute('data-tab', r.tab);
    $$('.tabbar a[data-tab]').forEach(function (a) {
      if (a.getAttribute('data-tab') === r.tab) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    });
    if (r.tab === 'calc') selectSub(r.sub || lastSub);
    if (r.fix) { try { history.replaceState(null, '', r.fix); } catch (e) { /* 파일로 열 때 */ } }
    if (r.find) { var fd = document.getElementById('find'); if (fd) fd.open = true; }
    document.title = TITLES[r.tab];
    if (first !== true && prev !== r.tab) window.scrollTo(0, 0);
  }
  subBtns.forEach(function (t, i) {
    t.addEventListener('click', function () {
      var id = t.getAttribute('aria-controls');
      selectSub(id);
      try { history.replaceState(null, '', '#calc-' + id); } catch (e) { /* 파일로 열 때 */ }
    });
    t.addEventListener('keydown', function (e) {
      var j = null;
      if (e.key === 'ArrowRight') j = (i + 1) % subBtns.length;
      else if (e.key === 'ArrowLeft') j = (i - 1 + subBtns.length) % subBtns.length;
      else if (e.key === 'Home') j = 0;
      else if (e.key === 'End') j = subBtns.length - 1;
      if (j === null) return;
      e.preventDefault();
      subBtns[j].click();
      subBtns[j].focus();
    });
  });
  $$('.tabbar a[data-tab]').forEach(function (a) {     // 지금 탭을 또 누르면 맨 위로
    a.addEventListener('click', function (e) {
      if (a.getAttribute('data-tab') === root.getAttribute('data-tab') && ('#' + a.getAttribute('data-tab')) === location.hash) {
        e.preventDefault();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    });
  });
  window.addEventListener('hashchange', route);
  route(true);

  /* ───────── 익명 상담 폼 ───────── */
  var form = $('#cf');
  if (form) {
    var ENDPOINT = String(window.CONSULT_ENDPOINT || '').trim();
    var COOLDOWN = 60 * 1000;
    var LS_KEY = 'charthyung_consult_last';
    var opened = Date.now();
    var memLast = 0;
    var btn = $('#cf-submit');
    var msg = $('#cf-msg');
    var closed = $('#cf-closed');
    var note = $('#cf-note');
    var count = $('#cf-count');
    var COIN_RE = /^[A-Z0-9가-힣]{1,20}$/;
    var NUM_RE = /^\d{1,13}(\.\d{1,12})?$/;
    var LEV_RE = /^\d{1,3}(\.\d{1,2})?$/;
    var NICK_RE = /^[A-Za-z0-9\uAC00-\uD7A3]{2,12}$/;          // 답 찾을 때 쓸 별명 (서버와 같은 규칙)
    var URL_RE = /(https?:|www\.|:\/\/|[a-z0-9-]+\.(com|net|org|io|kr|me|ly|gg|xyz|link|top|site|info|co)\b)/i;

    var lastSent = function () {
      var v = 0;
      try { v = Number(localStorage.getItem(LS_KEY)) || 0; } catch (e) { /* 저장 막힘 */ }
      return Math.max(v, memLast);
    };
    var markSent = function () {
      memLast = Date.now();
      try { localStorage.setItem(LS_KEY, String(memLast)); } catch (e) { /* 저장 막힘 */ }
    };
    var say = function (text, kind) { msg.textContent = text || ''; msg.className = 'cf-msg' + (kind ? ' ' + kind : ''); };
    var cleanCoin = function (s) {
      s = String(s || '');
      if (s.normalize) s = s.normalize('NFC');
      return s.replace(/[\s\/\-_.]/g, '').toUpperCase();
    };
    var fieldOf = function (name) {
      var el = form.elements[name];
      if (el && el.length && !el.tagName) el = el[0];   // 라디오 묶음
      return el ? el.closest('.field') : null;
    };
    var clearInvalid = function () { $$('.field.invalid', form).forEach(function (f) { f.classList.remove('invalid'); }); };

    if (!ENDPOINT) {
      closed.hidden = false;
      btn.disabled = true;
      btn.textContent = '접수 준비 중';
    }

    note.addEventListener('input', function () { count.textContent = String(note.value.length); });
    form.addEventListener('input', function (e) {
      var f = e.target && e.target.closest ? e.target.closest('.field') : null;
      if (f) f.classList.remove('invalid');
    });
    form.addEventListener('change', function (e) {
      var f = e.target && e.target.closest ? e.target.closest('.field') : null;
      if (f) f.classList.remove('invalid');
    });
    $('#cf-coin').addEventListener('blur', function (e) { e.target.value = cleanCoin(e.target.value); });

    var collect = function () {
      var el = form.elements;
      var picked = $('input[name="side"]:checked', form);
      return {
        coin: cleanCoin(el.coin.value),
        side: picked ? picked.value : '',
        avg: String(el.avg.value || '').replace(/[,\s]/g, ''),
        lev: String(el.lev.value || '').replace(/[,\s]/g, ''),
        note: String(el.note.value || '').replace(/\s+/g, ' ').trim(),
        nick: cleanNick(el.nick.value),
        website: String(el.website.value || '')
      };
    };
    var check = function (d) {
      if (!d.coin) return ['coin', '코인 이름을 적어 주세요.'];
      if (!COIN_RE.test(d.coin)) return ['coin', '코인 이름은 영문·숫자·한글로 20자까지예요.'];
      if (d.side !== 'long' && d.side !== 'short') return ['side', '롱인지 숏인지 골라 주세요.'];
      if (!d.avg) return ['avg', '평단을 숫자로 적어 주세요.'];
      if (!NUM_RE.test(d.avg) || !(Number(d.avg) > 0)) return ['avg', '평단은 0보다 큰 숫자로 적어 주세요.'];
      if (d.lev && (!LEV_RE.test(d.lev) || Number(d.lev) < 1 || Number(d.lev) > 200)) return ['lev', '레버리지는 1~200 사이 숫자로 적어 주세요.'];
      if (d.note.length > 200) return ['note', '고민은 200자까지예요.'];
      if (URL_RE.test(d.note)) return ['note', '고민 칸에는 링크를 넣을 수 없어요.'];
      if (!d.nick) return ['nick', '답 찾을 때 쓸 별명을 적어 주세요.'];
      if (!NICK_RE.test(d.nick)) return ['nick', '별명은 한글·영문·숫자 2~12자로, 띄어쓰기 없이 적어 주세요.'];
      return null;
    };
    var succeed = function (nick) {
      markSent();
      form.reset();
      count.textContent = '0';
      say('접수됐어요 \u2705\n답은 1~2일 안에 스레드 @charthyung과 이 페이지 \'내 답 찾기\'에 올라와요. '
        + '별명 \'' + nick + '\'' + josaRo(nick) + ' 찾으세요. (사연이 많으면 골라서 답해요)', 'ok');
      rememberNick(nick);
    };

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      clearInvalid();
      if (!ENDPOINT) { say('지금은 접수 준비 중이에요.', 'info'); return; }
      var wait = COOLDOWN - (Date.now() - lastSent());
      if (wait > 0) { say(Math.ceil(wait / 1000) + '초 뒤에 다시 보낼 수 있어요.', 'warn'); return; }
      var d = collect();
      var bad = check(d);
      if (bad) {
        var f = fieldOf(bad[0]);
        if (f) {
          var det = f.closest('details');
          if (det) det.open = true;
          f.classList.add('invalid');
          var inp = $('input:not([type=radio]), textarea', f) || $('input', f);
          if (inp) inp.focus();
        }
        say(bad[1], 'err');
        return;
      }
      // 숨김 칸이 채워졌거나 열자마자 보낸 경우 = 자동 프로그램으로 보고 보낸 척만 한다
      if (d.website || Date.now() - opened < 1500) { succeed(d.nick); return; }

      var body = JSON.stringify({ nick: d.nick, coin: d.coin, side: d.side, avg: d.avg, lev: d.lev || null, note: d.note || null });
      btn.disabled = true;
      say('보내는 중…', 'info');
      var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
      var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 12000);
      fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: body,
        credentials: 'omit',
        cache: 'no-store',
        signal: ctrl ? ctrl.signal : undefined
      }).then(function (res) {
        return res.json().catch(function () { return null; }).then(function (j) { return { res: res, j: j }; });
      }).then(function (r) {
        var st = r.res.status, j = r.j || {};
        if (r.res.ok && j.ok) { succeed(d.nick); return; }
        if (st === 429) { say('잠깐만요 — 1시간에 5번까지 보낼 수 있어요.', 'warn'); return; }
        if (st === 400 && j.field) {
          var f2 = fieldOf(j.field);
          if (f2) { f2.classList.add('invalid'); if (f2.closest('details')) f2.closest('details').open = true; }
          say(j.field === 'note' ? '고민 칸에 쓸 수 없는 내용이 있어요.'
            : j.field === 'nick' ? '별명은 한글·영문·숫자 2~12자로 적어 주세요.' : '입력값을 다시 확인해 주세요.', 'err');
          return;
        }
        if (st === 413) { say('내용이 너무 길어요.', 'err'); return; }
        if (st === 503) { say('오늘 접수가 많아 잠시 쉬어요. 내일 다시 보내 주세요.', 'warn'); return; }
        say('보내지 못했어요. 잠시 뒤 다시 해 주세요.', 'err');
      }).catch(function () {
        say('보내지 못했어요. 인터넷 연결을 확인하고 다시 해 주세요.', 'err');
      }).then(function () {
        clearTimeout(timer);
        btn.disabled = false;
      });
    });
  }

  /* ───────── 내 답 찾기 (answers.json · add_answer.py 로 추가) ───────── */
  var ansBox = $('#ans-recent'), ansRes = $('#af-result'), af = $('#af'), afNick = $('#af-nick');
  if (ansRes && af && afNick) {
    var ANSWERS = null;
    var IMG_OK = /^answers\/[A-Za-z0-9_.\-]+\.(png|jpe?g|webp)$/;
    var URL_OK = /^https:\/\/(www\.)?threads\.(com|net)\/[^\s"'<>]+$/;
    var keyOf = function (s) { return cleanNick(s).replace(/\s+/g, '').replace(/\(\d{1,3}\)$/, '').toLowerCase(); };
    var mk = function (tag, cls, text) { var x = document.createElement(tag); if (cls) x.className = cls; if (text != null) x.textContent = text; return x; };
    var clean = function (arr) {                       // 항목마다 걸러 읽기 — 깨진 한 항목이 전체를 못 죽이게
      var out = [];
      (Array.isArray(arr) ? arr : []).forEach(function (a) {
        try {
          if (!a || typeof a !== 'object') return;
          var nick = typeof a.nick === 'string' ? a.nick.slice(0, 20) : '';
          var sum = typeof a.summary === 'string' ? a.summary.slice(0, 160) : '';
          var url = typeof a.url === 'string' && URL_OK.test(a.url) ? a.url : '';
          var img = typeof a.img === 'string' && IMG_OK.test(a.img) ? a.img : '';
          var thumb = typeof a.thumb === 'string' && IMG_OK.test(a.thumb) ? a.thumb : img;
          var at = typeof a.at === 'string' ? a.at.slice(0, 25) : '';
          if (!nick || (!sum && !url)) return;
          out.push({ nick: nick, key: keyOf(nick), sum: sum, url: url, img: img, thumb: thumb, at: at });
        } catch (e) { /* 건너뜀 */ }
      });
      out.sort(function (x, y) { return x.at < y.at ? 1 : x.at > y.at ? -1 : 0; });
      return out;
    };
    var card = function (a) {
      var row = mk('div', 'ans');
      if (a.img) {
        var link = mk('a', 'ans-thumb');
        link.href = a.img;
        link.setAttribute('data-cap', a.nick + (a.sum ? ' · ' + a.sum : ''));
        var im = mk('img');
        im.src = a.thumb || a.img; im.alt = a.nick + ' 답 카드'; im.width = 64; im.height = 80; im.loading = 'lazy';
        link.appendChild(im);
        row.appendChild(link);
      } else {
        row.appendChild(mk('span', 'ans-thumb none'));
      }
      var body = mk('div', 'ans-body');
      var head = mk('p', 'ans-head');
      head.appendChild(mk('strong', 'ans-nick', a.nick));
      if (/^\d{4}-\d{2}-\d{2}/.test(a.at)) head.appendChild(mk('span', 'ans-date', a.at.slice(5, 7) + '/' + a.at.slice(8, 10)));
      body.appendChild(head);
      if (a.sum) body.appendChild(mk('p', 'ans-sum', a.sum));
      if (a.url) {
        var l = mk('a', 'ans-link', '스레드에서 보기 \u2197');
        l.href = a.url; l.target = '_blank'; l.rel = 'noopener';
        body.appendChild(l);
      }
      row.appendChild(body);
      return row;
    };
    var renderRecent = function (failed) {
      if (!ansBox) return;                             // 최근 답변 칸은 지금 없음(검색만)
      ansBox.textContent = '';
      if (failed) { ansBox.appendChild(mk('p', 'ans-empty', '답변을 불러오지 못했어요. 새로고침해 주세요.')); return; }
      if (!ANSWERS.length) {
        var p = mk('p', 'ans-empty', '아직 답변 없음 \u2014 ');
        var go = mk('a', null, '첫 사연을 보내 보세요');
        go.href = '#consult';
        p.appendChild(go);
        ansBox.appendChild(p);
        return;
      }
      ANSWERS.slice(0, 5).forEach(function (a) { ansBox.appendChild(card(a)); });
    };
    var search = function (q) {
      ansRes.textContent = '';
      var key = keyOf(q);
      if (!key) return;
      if (ANSWERS === null) { ansRes.appendChild(mk('p', 'ans-msg', '답변을 불러오는 중이에요. 잠시 뒤 다시 눌러 주세요.')); return; }
      var hits = ANSWERS.filter(function (a) { return a.key === key; });
      if (!hits.length) {
        ansRes.appendChild(mk('p', 'ans-msg', '\'' + cleanNick(q) + '\' 답은 아직 없어요. 답은 1~2일 안에 올라와요(사연이 많으면 골라서 답해요).'));
        return;
      }
      ansRes.appendChild(mk('p', 'ans-msg', '\'' + cleanNick(q) + '\' 답 ' + hits.length + '개'));
      var list = mk('div', 'ans-list');
      hits.forEach(function (a) { list.appendChild(card(a)); });
      ansRes.appendChild(list);
    };
    af.addEventListener('submit', function (e) {
      e.preventDefault();
      var q = cleanNick(afNick.value);
      search(q);
      if (q) { try { localStorage.setItem(NICK_KEY, q); } catch (x) { /* 저장 막힘 */ } }
    });
    try { var saved = localStorage.getItem(NICK_KEY); if (saved && !afNick.value) afNick.value = saved; } catch (e) { /* 저장 막힘 */ }
    fetch('answers.json?t=' + Math.floor(Date.now() / 60000), { cache: 'no-store' })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (j) { ANSWERS = clean(j); renderRecent(false); })
      .catch(function () { ANSWERS = []; renderRecent(true); });
    var find = $('#find');
    if (find) find.addEventListener('toggle', function () { if (find.open && !afNick.value) afNick.focus(); });
  }

  /* ───────── 시그널 카드 크게 보기 ───────── */
  var lb = $('#lb'), lbImg = $('#lb-img'), lbCap = $('#lb-cap');
  if (lb && lbImg && typeof lb.showModal === 'function') {
    document.addEventListener('click', function (e) {
      var a = e.target && e.target.closest ? e.target.closest('a.sig-thumb[href], a.sig-chip[href], a.ans-thumb[href]') : null;
      if (!a) return;
      e.preventDefault();
      var im = $('img', a);
      var cap = a.getAttribute('data-cap') || '';
      lbImg.src = a.getAttribute('href');
      lbImg.alt = im ? im.alt : cap;
      if (lbCap) lbCap.textContent = cap;
      lb.showModal();
    });
    lb.addEventListener('click', function (e) { if (e.target === lb || e.target === lbImg) lb.close(); });
  }
})();
