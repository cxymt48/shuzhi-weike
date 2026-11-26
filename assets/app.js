import { SITE, THEMES, STUDIO_BANK } from './data.js';

var app = document.getElementById('app');
var modal = document.getElementById('modal');
var mcard = modal.querySelector('.modal-card');
var KEY = 'szwg.v1';
var store = loadStore();
var activePlayer = null;

function loadStore() {
  try { var raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : {}; } catch (e) { return {}; }
}
function saveStore() {
  try { localStorage.setItem(KEY, JSON.stringify(store)); } catch (e) {}
}
function esc(s) {
  return String(s == null ? '' : s)
    .split('&').join('&amp;').split('<').join('&lt;').split('>').join('&gt;').split('"').join('&quot;');
}
function pad2(n) { return (n < 10 ? '0' : '') + n; }
function fmt(sec) {
  var s = Math.max(0, Math.round(sec));
  return pad2(Math.floor(s / 60)) + ':' + pad2(s % 60);
}
function totalDur(scenes) {
  var t = 0;
  for (var i = 0; i < scenes.length; i++) t += scenes[i].dur;
  return t;
}
function findTheme(id) {
  for (var i = 0; i < THEMES.length; i++) if (THEMES[i].id === id) return THEMES[i];
  if (id === 'custom' && store.custom) return store.custom;
  return null;
}

/* ---------------- player ---------------- */

function sceneInner(s) {
  var out = '';
  if (s.kicker) out += '<div class="kicker">' + esc(s.kicker) + '</div>';
  if (s.kind === 'num') {
    out += '<div class="num">' + esc(s.num) + '<small>' + esc(s.unit || '') + '</small></div>';
    out += '<div class="big">' + esc(s.big) + '</div>';
    if (s.text) out += '<p>' + esc(s.text) + '</p>';
  } else if (s.kind === 'list') {
    out += '<div class="big">' + esc(s.big) + '</div><ol>';
    for (var i = 0; i < s.items.length; i++) {
      out += '<li><i>' + (i + 1) + '</i><span><b>' + esc(s.items[i].t) + '</b> · ' + esc(s.items[i].d) + '</span></li>';
    }
    out += '</ol>';
  } else if (s.kind === 'quote') {
    out += '<div class="quote">' + esc(s.text) + '<span>' + esc(s.from || '') + '</span></div>';
  } else if (s.kind === 'end') {
    out += '<div class="big">' + esc(s.big) + '</div><div class="rule"></div>';
    if (s.text) out += '<p>' + esc(s.text) + '</p>';
  } else {
    out += '<div class="big">' + esc(s.big) + '</div>';
    if (s.sub) out += '<p>' + esc(s.sub) + '</p>';
    if (s.text) out += '<p>' + esc(s.text) + '</p>';
  }
  return out;
}

function createPlayer(host, theme, opts) {
  opts = opts || {};
  var scenes = theme.scenes;
  var total = totalDur(scenes);
  var cur = 0, t = 0, playing = false, raf = 0, last = 0, ended = false;
  host.classList.add('player');
  host.style.setProperty('--acc', theme.light || '#E8B08C');
  host.innerHTML = '<div class="bgfx"><i></i><i></i><i></i></div>' +
    '<div class="chapter"><span class="ch-n">01 / 06</span><b class="ch-t"></b></div>' +
    '<div class="stage"></div>' +
    '<div class="ctrl"><div class="bar"><i></i></div>' +
    '<div class="bar-row"><span class="tm">00:00 / 01:00</span>' +
    '<div class="pbtns"><button class="pbtn" data-act="prev" aria-label="上一段">‹</button>' +
    '<button class="pbtn play" data-act="play" aria-label="播放或暂停">▶</button>' +
    '<button class="pbtn" data-act="next" aria-label="下一段">›</button></div></div></div>';
  var stage = host.querySelector('.stage');
  var bar = host.querySelector('.bar i');
  var barWrap = host.querySelector('.bar');
  var tm = host.querySelector('.tm');
  var chN = host.querySelector('.ch-n');
  var chT = host.querySelector('.ch-t');
  var playBtn = host.querySelector('[data-act=play]');

  function draw() {
    var s = scenes[cur];
    var cls = s.kind === 'title' ? 'scene is-title' : (s.kind === 'end' ? 'scene is-end' : 'scene');
    stage.innerHTML = '<div class="' + cls + '">' + sceneInner(s) + '</div>';
    chN.textContent = pad2(cur + 1) + ' / ' + pad2(scenes.length);
    chT.textContent = s.kicker || theme.title;
  }
  function paint() {
    var before = 0;
    for (var i = 0; i < cur; i++) before += scenes[i].dur;
    var el = before + Math.min(t, scenes[cur].dur);
    bar.style.width = (100 * el / total).toFixed(2) + '%';
    tm.textContent = fmt(el) + ' / ' + fmt(total);
  }
  function stopLoop() {
    if (raf) { cancelAnimationFrame(raf); raf = 0; }
  }
  function pause() {
    playing = false; last = 0; stopLoop();
    playBtn.textContent = '▶';
  }
  function loop(now) {
    if (!playing) return;
    if (!last) last = now;
    var dt = Math.min(0.12, (now - last) / 1000);
    last = now;
    t += dt;
    var s = scenes[cur];
    if (t >= s.dur) {
      if (cur < scenes.length - 1) { cur++; t = 0; draw(); }
      else { t = s.dur; ended = true; pause(); paint(); if (opts.onEnd) opts.onEnd(); return; }
    }
    paint();
    raf = requestAnimationFrame(loop);
  }
  function play() {
    if (ended) { ended = false; cur = 0; t = 0; draw(); }
    playing = true; last = 0; playBtn.textContent = '❚❚';
    raf = requestAnimationFrame(loop);
  }
  function toggle() {
    if (playing) pause(); else play();
    activePlayer = api;
  }
  function jump(i) {
    cur = Math.max(0, Math.min(scenes.length - 1, i));
    t = 0; ended = false; draw(); paint();
  }
  function seek(ev) {
    var r = barWrap.getBoundingClientRect();
    var ratio = Math.max(0, Math.min(1, (ev.clientX - r.left) / r.width));
    var target = ratio * total;
    var acc = 0;
    for (var i = 0; i < scenes.length; i++) {
      if (target < acc + scenes[i].dur || i === scenes.length - 1) { cur = i; t = Math.max(0, target - acc); break; }
      acc += scenes[i].dur;
    }
    ended = false; draw(); paint();
  }
  host.addEventListener('click', function (ev) {
    var btn = ev.target.closest('[data-act]');
    if (!btn) return;
    var act = btn.getAttribute('data-act');
    activePlayer = api;
    if (act === 'play') toggle();
    if (act === 'prev') { jump(cur - 1); }
    if (act === 'next') { jump(cur + 1); }
  });
  barWrap.addEventListener('click', function (ev) { seek(ev); });
  draw(); paint();
  var api = {
    play: play,
    pause: pause,
    toggle: toggle,
    destroy: function () { stopLoop(); if (activePlayer === api) activePlayer = null; },
    seekTo: function (ratio) { bar.style.width = (100 * ratio).toFixed(2) + '%'; }
  };
  return api;
}

document.addEventListener('keydown', function (ev) {
  if (ev.code === 'Space' && activePlayer) {
    var tag = document.activeElement ? document.activeElement.tagName : '';
    if (tag === 'INPUT' || tag === 'TEXTAREA') return;
    ev.preventDefault();
    activePlayer.toggle();
  }
});

/* ---------------- helpers ---------------- */

function download(name, text, mime) {
  var blob = new Blob([text], { type: (mime || 'text/plain') + ';charset=utf-8' });
  var url = URL.createObjectURL(blob);
  var a = document.createElement('a');
  a.href = url; a.download = name;
  document.body.appendChild(a); a.click();
  setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 400);
}
function copyText(text, btn) {
  var done = function () {
    if (!btn) return;
    var old = btn.textContent;
    btn.textContent = '已复制';
    setTimeout(function () { btn.textContent = old; }, 1400);
  };
  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(done, done);
  } else {
    var ta = document.createElement('textarea');
    ta.value = text; document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); } catch (e) {}
    ta.remove(); done();
  }
}
function openModal(html) {
  mcard.innerHTML = html;
  modal.hidden = false;
  document.body.style.overflow = 'hidden';
}
function closeModal() {
  modal.hidden = true;
  mcard.innerHTML = '';
  document.body.style.overflow = '';
}
modal.addEventListener('click', function (ev) {
  if (ev.target.hasAttribute('data-close')) closeModal();
});
document.addEventListener('keydown', function (ev) {
  if (ev.key === 'Escape' && !modal.hidden) closeModal();
});

/* ---------------- script export ---------------- */

function voiceOf(s) {
  if (s.kind === 'quote') return s.text;
  if (s.kind === 'num') return s.text || (s.num + s.unit + '，' + s.big);
  if (s.kind === 'list') {
    var arr = [];
    for (var i = 0; i < s.items.length; i++) arr.push(s.items[i].t + '：' + s.items[i].d);
    return (s.text || s.big) + '。' + arr.join('；') + '。';
  }
  return [s.big, s.sub, s.text].filter(Boolean).join('。');
}
function screenOf(s) {
  if (s.kind === 'list') {
    var arr = [];
    for (var i = 0; i < s.items.length; i++) arr.push(s.items[i].t);
    return s.big + ' ｜ ' + arr.join(' / ');
  }
  if (s.kind === 'num') return s.num + (s.unit || '') + ' ' + s.big;
  return s.big || s.text || '';
}
function scriptMarkdown(theme) {
  var L = [];
  L.push('# ' + theme.title + ' · 60 秒微课讲稿');
  L.push('');
  L.push('- 主题：' + theme.title + '（' + (theme.tag || '通用') + '）');
  L.push('- 适用：' + theme.course);
  L.push('- 对象：' + theme.audience);
  L.push('- 总时长：' + totalDur(theme.scenes) + ' 秒 / ' + theme.scenes.length + ' 段');
  L.push('- 生成时间：' + new Date().toLocaleString('zh-CN'));
  L.push('- 出品：' + SITE.name + ' · ' + SITE.sub + ' v' + SITE.version);
  L.push('');
  var t = 0;
  for (var i = 0; i < theme.scenes.length; i++) {
    var s = theme.scenes[i];
    var a = t; t += s.dur;
    L.push('## ' + pad2(i + 1) + ' · ' + fmt(a) + ' – ' + fmt(t) + '（' + s.dur + 's）');
    L.push('');
    L.push('**屏幕**：' + screenOf(s));
    L.push('');
    L.push('**口播**：' + voiceOf(s));
    L.push('');
  }
  if (theme.quiz && theme.quiz.length) {
    L.push('## 随堂测（3 题）');
    L.push('');
    for (var q = 0; q < theme.quiz.length; q++) {
      var it = theme.quiz[q];
      L.push((q + 1) + '. ' + it.q);
      for (var o = 0; o < it.opts.length; o++) {
        L.push('   - ' + String.fromCharCode(65 + o) + '. ' + it.opts[o] + (o === it.a ? '  ✅' : ''));
      }
      L.push('   解析：' + it.exp);
      L.push('');
    }
  }
  if (theme.discuss) {
    L.push('## 讨论题');
    L.push('');
    L.push(theme.discuss);
    L.push('');
  }
  if (theme.sources && theme.sources.length) {
    L.push('## 内容依据');
    L.push('');
    for (var k = 0; k < theme.sources.length; k++) L.push('- ' + theme.sources[k]);
    L.push('');
  }
  L.push('---');
  L.push('本讲稿由「' + SITE.name + '」按分镜脚本自动排版，可直接用于班会、团课或思政课课前十分钟。');
  return L.join('\n');
}

/* ---------------- home ---------------- */

function cardHTML(t, i) {
  var p = (store.progress && store.progress[t.id]) || null;
  var answered = p && p.ans ? p.ans.filter(function (x) { return x != null; }).length : 0;
  var done = answered >= 3;
  return '<a class="card" href="#/theme/' + t.id + '" style="--a:' + t.accent + '">' +
    '<div class="no"><span>' + t.no + '</span><em>' + esc(t.tag) + '</em></div>' +
    '<h3>' + esc(t.title) + '</h3>' +
    '<div class="sub">' + esc(t.kicker) + '</div>' +
    (answered > 0 && !done ? '<div class="bar-mini"><i style="width:' + Math.round(100 * answered / 3) + '%"></i></div>' : '') +
    '<div class="meta"><span class="tag">60 秒</span><span class="tag">3 题</span>' +
    (done ? '<span class="done">已学完</span>' : (answered ? '<span class="mini">已答 ' + answered + '/3</span>' : '<span class="mini">未开始</span>')) +
    '</div>' +
    '<div class="watermark">' + t.no + '</div>' +
  '</a>';
}

function renderHome() {
  var cards = [];
  for (var i = 0; i < THEMES.length; i++) cards.push(cardHTML(THEMES[i], i));
  var customCard = store.custom ? cardHTML(store.custom, 0) : '';
  app.innerHTML = '<section class="hero"><div class="wrap"><div class="hero-in">' +
    '<div>' +
    '<div class="eyebrow">2026 广东省“数智新技艺” · 自主研发应用</div>' +
    '<h1>把一节课，<span class="accent">压成六十秒</span></h1>' +
    '<p class="lead">输入一个思政主题，得到一支竖屏微课、一页图解和三道随堂测题。给班会、团课和思政课备课用，打开网页就能放，不用装任何东西。</p>' +
    '<div class="hero-actions">' +
    '<a class="btn" href="#/studio">打开主题工坊</a>' +
    '<a class="btn ghost" href="#/theme/xinzhi">先看一节 ›</a>' +
    '</div>' +
    '<div class="hero-note">无需登录 · 无需安装 · 数据只存在本机</div>' +
    '</div>' +
    '<div class="hero-side">' +
    '<div class="stat"><b>6</b><span>个内置主题，覆盖新质生产力、中国式现代化等高频考点</span></div>' +
    '<div class="stat"><b>60</b><span>秒一支微课，适合课前十分钟与主题班会</span></div>' +
    '<div class="stat"><b>0</b><span>依赖：纯静态页面，扫码即用</span></div>' +
    '<div class="stat-rule">每支微课都附一张图解、三道测题、一份可直接照读的讲稿。<br>内容依据随堂标注，方便教师核对。</div>' +
    '</div>' +
    '</div></div></section>' +
    '<section class="wrap"><div class="sec-head"><h2>微课库</h2>' +
    '<div class="hint">点击进入 · 每条约 3 分钟学完</div></div>' +
    '<div class="grid">' + cards.join('') + '</div>' +
    (customCard ? '<div class="sec-head tight"><h2>我的主题</h2><div class="hint">在主题工坊里生成 · 仅保存在本机</div></div><div class="grid">' + customCard + '</div>' : '') +
    '</section>';
}

/* ---------------- theme page ---------------- */

function figHTML(t) {
  var leaves = '';
  for (var i = 0; i < t.fig.leaves.length; i++) {
    var l = t.fig.leaves[i];
    leaves += '<div class="leaf" style="--a:' + t.accent + '"><b>' + esc(l.t) + '</b><span>' + esc(l.s) + '</span></div>';
  }
  return '<div class="fig" id="fig">' +
    '<div class="fhead"><h3>一页看懂：' + esc(t.title) + '</h3>' +
    '<div class="ft">FIGURE ' + t.no + '<br>60s · 1 PAGE</div></div>' +
    '<div class="core"><b>' + esc(t.fig.center.t) + '</b><span>' + esc(t.fig.center.s) + '</span></div>' +
    '<div class="leaves">' + leaves + '</div>' +
    '<div class="takeaway"><b>一句话</b>' + esc(t.fig.takeaway) + '</div>' +
    '<div class="src">内容依据：' + esc(t.fig.src) + '</div>' +
  '</div>';
}

function pointsHTML(t) {
  var out = '';
  for (var i = 0; i < t.points.length; i++) {
    out += '<div class="point" style="--a:' + t.accent + '"><div class="k">' + esc(t.points[i].k) + '</div>' +
      '<div class="v">' + esc(t.points[i].v) + '</div><div class="n">' + esc(t.points[i].n) + '</div></div>';
  }
  return '<div class="points">' + out + '</div>';
}

function quizHTML(t) {
  if (!t.quiz || !t.quiz.length) return '<div class="panel"><h4>随堂测</h4><div class="ph">自定义主题暂未配题</div><p class="mini-note">自定义结构由规则拼装生成，题目需要结合具体主题补写。可在“主题工坊”里先导出讲稿，再按讲稿补三道题。</p></div>';
  var p = store.progress && store.progress[t.id] ? store.progress[t.id].ans || [] : [];
  var h = '<div class="quiz" id="quiz"><div class="row-between" style="margin-bottom:8px"><h3 style="font-size:19px">随堂测 · 3 题</h3><div class="mini-note">答对才看得见解析</div></div>';
  for (var i = 0; i < t.quiz.length; i++) {
    var q = t.quiz[i];
    var picked = p[i];
    h += '<div class="q' + (picked != null ? ' answered' : '') + '" data-qi="' + i + '">';
    h += '<div class="qt"><i>Q' + (i + 1) + '</i>' + esc(q.q) + '</div>';
    for (var o = 0; o < q.opts.length; o++) {
      var cls = 'opt';
      if (picked != null) {
        if (o === q.a) cls += ' right';
        else if (o === picked) cls += ' wrong';
      }
      h += '<button class="' + cls + '" data-oi="' + o + '"' + (picked != null ? ' disabled' : '') + '>' +
        '<b>' + String.fromCharCode(65 + o) + '</b><span>' + esc(q.opts[o]) + '</span></button>';
    }
    h += '<div class="exp">' + esc(q.exp) + '</div></div>';
  }
  h += '<div class="row-between" style="margin-top:16px"><div class="mini-note" id="qstat"></div>' +
    '<button class="btn sm" id="reportBtn">生成学习报告</button></div></div>';
  return h;
}

function themePageHTML(t) {
  var chips = '<span class="tag solid">' + esc(t.tag) + '</span>' +
    '<span class="tag">' + esc(t.course) + '</span>' +
    '<span class="tag">' + totalDur(t.scenes) + ' 秒</span>' +
    '<span class="tag">' + t.scenes.length + ' 段</span>';
  var p = (store.progress && store.progress[t.id]) || {};
  return '<div class="wrap"><header class="theme-head">' +
    '<a class="crumb" href="#/">‹ 微课库</a>' +
    '<h1>' + esc(t.title) + '</h1>' +
    '<p class="sub">' + esc(t.sub) + '</p>' +
    '<div class="chips">' + chips + '</div>' +
    '</header>' +
    '<div class="layout"><div class="col-main">' +
    figHTML(t) + pointsHTML(t) + quizHTML(t) +
    '<div class="discuss"><h3 style="font-size:19px;margin:26px 0 8px">讨论题 · 写下你的答案</h3>' +
    '<p class="mini-note" style="margin:0 0 10px">' + esc(t.discuss) + '</p>' +
    '<textarea id="discuss" placeholder="用一两句话写下你的想法，会随学习报告一起保存。"></textarea>' +
    '<div class="dbar"><div class="cnt" id="dcnt">0 字 · 仅保存在本机</div>' +
    '<div style="display:flex;gap:10px"><button class="linkbtn" id="clearDiscuss">清空</button>' +
    '<button class="btn sm ghost" id="saveDiscuss">保存草稿</button></div></div></div>' +
    '</div><aside class="col-side">' +
    '<div class="player-wrap"><div id="pv"></div>' +
    '<div class="player-hint">空格键播放 / 暂停 · 点击进度条跳转</div></div>' +
    '<div class="panel"><h4>这节课怎么用</h4><div class="ph">课前 3 分钟，或班会开场</div>' +
    '<div class="kv"><b>适用课程</b><span>' + esc(t.course) + '</span></div>' +
    '<div class="kv"><b>适用对象</b><span>' + esc(t.audience) + '</span></div>' +
    '<div class="kv"><b>使用流程</b><span>播微课 → 对图解 → 做测题 → 讨论</span></div>' +
    '</div>' +
    '<div class="panel"><h4>配套资源</h4><div class="ph">讲稿可照读，也可改</div>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap">' +
    '<button class="btn sm" id="dlScript">下载讲稿 .md</button>' +
    '<button class="btn sm ghost" id="cpScript">复制讲稿</button>' +
    '<button class="btn sm ghost" id="printPage">打印 / 存 PDF</button>' +
    '</div>' +
    '<p class="mini-note" style="margin:12px 0 0">讲稿含时间码、屏幕文字与口播词，可直接用于试讲或投稿材料。</p>' +
    '</div>' +
    '<div class="panel"><h4>内容依据</h4><div class="ph">便于教师核对</div><ul class="scenes-list">' +
    t.sources.map(function (s) { return '<li><em>出处</em><span>' + esc(s) + '</span></li>'; }).join('') +
    '</ul></div>' +
    '</aside></div></div>';
}

function renderTheme(id) {
  var t = findTheme(id);
  if (!t) { location.hash = '#/'; return; }
  app.innerHTML = themePageHTML(t);
  if (activePlayer) activePlayer.destroy();
  activePlayer = createPlayer(document.getElementById('pv'), t, {
    onEnd: function () {
      var q = document.getElementById('quiz');
      if (q) q.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });

  var prog = (store.progress && store.progress[t.id]) || { ans: [null, null, null], discuss: '' };
  if (!prog.ans) prog.ans = [null, null, null];

  var quiz = document.getElementById('quiz');
  if (quiz) {
    var stat = document.getElementById('qstat');
    var updateStat = function () {
      var n = prog.ans.filter(function (x) { return x != null; }).length;
      var right = 0;
      for (var i = 0; i < t.quiz.length; i++) if (prog.ans[i] === t.quiz[i].a) right++;
      stat.textContent = '已答 ' + n + ' / ' + t.quiz.length + (n === t.quiz.length ? ' · 答对 ' + right + ' 题' : '');
    };
    updateStat();
    quiz.addEventListener('click', function (ev) {
      var btn = ev.target.closest('.opt');
      if (btn && !btn.disabled) {
        var qEl = btn.closest('.q');
        var qi = parseInt(qEl.getAttribute('data-qi'), 10);
        if (prog.ans[qi] != null) return;
        var oi = parseInt(btn.getAttribute('data-oi'), 10);
        prog.ans[qi] = oi;
        store.progress = store.progress || {};
        store.progress[t.id] = prog;
        saveStore();
        var opts = qEl.querySelectorAll('.opt');
        for (var k = 0; k < opts.length; k++) {
          var o = opts[k];
          o.disabled = true;
          var oi2 = parseInt(o.getAttribute('data-oi'), 10);
          if (oi2 === t.quiz[qi].a) o.classList.add('right');
          else if (oi2 === oi) o.classList.add('wrong');
        }
        qEl.classList.add('answered');
        updateStat();
        return;
      }
      if (ev.target.id === 'reportBtn') openReport(t);
    });
  }

  var ta = document.getElementById('discuss');
  var cnt = document.getElementById('dcnt');
  if (ta) {
    ta.value = prog.discuss || '';
    var setCnt = function () {
      var n = ta.value.trim().length;
      cnt.textContent = n + ' 字 · ' + (prog.discuss === ta.value ? '已保存' : '未保存') + ' · 仅保存在本机';
    };
    setCnt();
    ta.addEventListener('input', function () { prog.discuss = ta.value; setCnt(); });
    document.getElementById('saveDiscuss').addEventListener('click', function () {
      prog.discuss = ta.value;
      store.progress = store.progress || {}; store.progress[t.id] = prog; saveStore();
      setCnt(); this.textContent = '已保存 ✓';
      var self = this;
      setTimeout(function () { self.textContent = '保存草稿'; }, 1600);
    });
    document.getElementById('clearDiscuss').addEventListener('click', function () {
      prog.discuss = ''; ta.value = ''; setCnt();
      store.progress = store.progress || {}; store.progress[t.id] = prog; saveStore();
    });
  }

  document.getElementById('dlScript').addEventListener('click', function () {
    download('讲稿_' + t.title + '_60秒.md', scriptMarkdown(t), 'text/markdown');
  });
  document.getElementById('cpScript').addEventListener('click', function () {
    copyText(scriptMarkdown(t), this);
  });
  document.getElementById('printPage').addEventListener('click', function () { window.print(); });
}

/* ---------------- report ---------------- */

function openReport(t) {
  var p = (store.progress && store.progress[t.id]) || { ans: [], discuss: '' };
  var right = 0, answered = 0;
  for (var i = 0; i < t.quiz.length; i++) {
    if (p.ans[i] != null) { answered++; if (p.ans[i] === t.quiz[i].a) right++; }
  }
  var score = Math.round(100 * right / t.quiz.length);
  var now = new Date();
  var code = 'SZWG-' + now.getFullYear() + pad2(now.getMonth() + 1) + pad2(now.getDate()) + '-' + pad2(now.getHours()) + pad2(now.getMinutes());
  var verdict = score === 100 ? '全部掌握，可以上场讲了。' : (score >= 67 ? '基本掌握，回看错题解析即可。' : '建议重播一遍微课，再作答。');
  var dCount = (p.discuss || '').trim().length;
  var h = '<div class="report"><div class="rt"><div><h3>' + esc(t.title) + ' · 学习报告</h3>' +
    '<div class="mini-note">' + esc(t.course) + '</div></div>' +
    '<div class="code">' + code + '<br>' + SITE.name + ' v' + SITE.version + '</div></div>' +
    '<div class="score"><b>' + score + '</b><span>分 · 答对 ' + right + ' / ' + t.quiz.length + ' 题</span></div>' +
    '<div class="mini-note">' + verdict + '</div>' +
    '<div style="margin-top:14px">' +
    '<div class="rline"><b>完成情况</b><span>已答 ' + answered + ' / ' + t.quiz.length + ' 题</span></div>' +
    '<div class="rline"><b>讨论输出</b><span>' + (dCount ? dCount + ' 字' : '未填写') + '</span></div>' +
    '<div class="rline"><b>完成时间</b><span>' + now.toLocaleString('zh-CN') + '</span></div>' +
    '</div>' +
    (p.discuss ? '<div class="quote-box">' + esc(p.discuss) + '</div>' : '') +
    '<div class="acts"><button class="btn sm" id="dlReport">下载报告</button>' +
    '<button class="btn sm ghost" id="cpReport">复制</button>' +
    '<button class="btn sm ghost" data-close>关闭</button></div></div>';
  openModal(h);
  var text = reportText(t, right, score, p, code, now);
  document.getElementById('dlReport').addEventListener('click', function () {
    download('学习报告_' + t.title + '.txt', text);
  });
  document.getElementById('cpReport').addEventListener('click', function () { copyText(text, this); });
}

function reportText(t, right, score, p, code, now) {
  var L = [];
  L.push(SITE.name + ' · ' + SITE.sub + ' 学习报告');
  L.push('报告编号：' + code);
  L.push('时间：' + now.toLocaleString('zh-CN'));
  L.push('');
  L.push('主题：' + t.title + '（' + t.tag + '）');
  L.push('课程：' + t.course);
  L.push('测题：答对 ' + right + ' / ' + t.quiz.length + '，得分 ' + score);
  L.push('讨论：' + (p.discuss ? p.discuss : '未填写'));
  L.push('');
  L.push('一句话带走：' + t.scenes[t.scenes.length - 1].big);
  return L.join('\n');
}

/* ---------------- studio ---------------- */

function studioHTML() {
  return '<div class="wrap studio"><div class="eyebrow">主题工坊</div>' +
    '<h1>给我一个主题，<br>还你一支微课</h1>' +
    '<p class="lead">工坊按“开场—展开—收束”的固定结构，把主题词拼装成 60 秒分镜，并生成可直接照读的讲稿。所有计算都在你的浏览器里完成，不联网、不上传。</p>' +
    '<div class="studio-grid"><div><div class="form-card">' +
    '<div class="field"><label>01 / 主题词</label>' +
    '<input type="text" id="sk" maxlength="18" placeholder="例如：共同富裕、人工智能伦理、红船精神" />' +
    '<div class="hintline">建议 4–12 个字，越具体越好。例如“共同富裕”比“经济发展”更容易讲清。</div></div>' +
    '<div class="field"><label>02 / 讲给谁听</label><div class="seg" id="segA">' +
    '<button class="on" data-v="大一新生">大一新生</button>' +
    '<button data-v="二三年级">二三年级</button>' +
    '<button data-v="毕业班">毕业班</button></div></div>' +
    '<div class="field"><label>03 / 讲到什么程度</label><div class="seg" id="segB">' +
    '<button class="on" data-v="theory">讲清道理</button>' +
    '<button data-v="case">讲个案例</button>' +
    '<button data-v="action">落到行动</button></div>' +
    '<div class="hintline">同一主题，三种讲法：先立概念、先讲故事，或直接给行动清单。</div></div>' +
    '<div class="row-between"><button class="btn" id="gen">生成微课结构</button>' +
    '<span class="mini-note">本地规则拼装 · 约 0.1 秒</span></div>' +
    '</div><div id="studioOut" style="margin-top:18px"><div class="studio-out">填好主题词，点“生成微课结构”<br>这里会出现分镜与讲稿</div></div></div>' +
    '<aside id="studioSide"><div class="studio-out">右侧是试播区<br>生成后可在这里直接播放</div></aside></div></div>';
}

function renderStudio() {
  app.innerHTML = studioHTML();
  var audience = '大一新生', angle = 'theory';
  document.getElementById('segA').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) { x.classList.remove('on'); });
    b.classList.add('on'); audience = b.getAttribute('data-v');
  });
  document.getElementById('segB').addEventListener('click', function (ev) {
    var b = ev.target.closest('button'); if (!b) return;
    Array.prototype.forEach.call(this.querySelectorAll('button'), function (x) { x.classList.remove('on'); });
    b.classList.add('on'); angle = b.getAttribute('data-v');
  });
  document.getElementById('gen').addEventListener('click', function () {
    var name = document.getElementById('sk').value.trim();
    if (name.length < 2) { document.getElementById('sk').focus(); alert('先写一个主题词，至少 2 个字。'); return; }
    var t = buildCustom(name, audience, angle);
    store.custom = t; saveStore();
    renderStudioOut(t);
  });
}

function buildCustom(name, audience, angleKey) {
  var a = STUDIO_BANK.angles[angleKey];
  var scenes = [{ kind: 'title', dur: 6, kicker: '自定义微课 · ' + a.label, big: name, sub: audience + ' · 60 秒讲清一个主题' }];
  var opening = STUDIO_BANK.openings[0];
  scenes.push({ kind: opening.kind, dur: 8, kicker: opening.kicker, big: opening.big, text: opening.text });
  for (var i = 0; i < a.scenes.length; i++) {
    var s = a.scenes[i];
    var cp = { kind: s.kind, dur: s.kind === 'list' ? 13 : 9, kicker: s.kicker, big: s.big, text: s.text };
    if (s.items) {
      cp.items = [];
      for (var j = 0; j < s.items.length; j++) cp.items.push({ t: s.items[j].t, d: s.items[j].d });
    }
    if (s.kind === 'quote') { cp.text = s.text; cp.from = s.from; delete cp.big; delete cp.kicker; cp.kicker = s.kicker; }
    scenes.push(cp);
  }
  var ending = STUDIO_BANK.endings[0];
  scenes.push({ kind: 'end', dur: 8, kicker: ending.kicker, big: ending.big, text: ending.text });
  var sum = totalDur(scenes);
  var factor = 60 / sum;
  for (var z = 0; z < scenes.length; z++) scenes[z].dur = Math.max(4, Math.round(scenes[z].dur * factor));
  var diff = 60 - totalDur(scenes);
  scenes[scenes.length - 1].dur = Math.max(4, scenes[scenes.length - 1].dur + diff);
  return {
    id: 'custom', no: '★', title: name, kicker: '自定义 · ' + a.label,
    sub: '按“开场—展开—收束”拼装的 60 秒结构，可继续替换成你自己的故事与数据。',
    tag: '自定义', course: '班会 / 团课 / 课前十分钟', audience: audience + ' · ' + a.label,
    accent: '#C8402F', light: '#F0A38E',
    points: [
      { k: '60s', v: '时长', n: '6 段，每秒都对应一句口播' },
      { k: '3', v: '结构', n: '开场提问、中段展开、结尾收束' },
      { k: '1', v: '输出', n: '一支可试播的微课 + 一份讲稿' }
    ],
    fig: {
      center: { t: name, s: '一句话说清它是什么' },
      leaves: [
        { t: '是什么', s: '用一个不带术语的句子定义它' },
        { t: '为什么', s: '它回应的现实问题是什么' },
        { t: '所以呢', s: '对听者意味着什么，能做什么' }
      ],
      takeaway: '结构是骨架，血肉要你自己填：一个真实的人、一件具体的事、一个可核对的数字。',
      src: '本图为结构模板，内容需按主题补充；正式提交前请核实事实与表述。'
    },
    scenes: scenes,
    quiz: [],
    discuss: '围绕“' + name + '”，你能找到身边哪一个具体的人或事作为例子？它能不能撑起这支微课的第二段？',
    sources: ['结构模板由「主题工坊」规则生成', '正式使用前请补入权威出处与真实数据']
  };
}

function renderStudioOut(t) {
  var host = document.getElementById('studioOut');
  var side = document.getElementById('studioSide');
  var list = '';
  var acc = 0;
  for (var i = 0; i < t.scenes.length; i++) {
    var s = t.scenes[i];
    list += '<li><em>' + fmt(acc) + '</em><span>' + esc(screenOf(s)) + '</span></li>';
    acc += s.dur;
  }
  host.innerHTML = '<div class="panel" style="margin-top:0"><div class="row-between"><h4>结构预览</h4><span class="mini-note">' + t.scenes.length + ' 段 · ' + totalDur(t.scenes) + ' 秒</span></div>' +
    '<div class="ph">按“开场—展开—收束”拼装，可在完整页里继续编辑</div>' +
    '<ul class="scenes-list">' + list + '</ul>' +
    '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">' +
    '<button class="btn sm ghost" id="openCustom">打开完整页</button>' +
    '<button class="btn sm ghost" id="dlCustom">下载讲稿</button></div></div>';
  side.innerHTML = '<div class="player-wrap"><div id="pv2"></div>' +
    '<div class="player-hint">试播区 · 内容为结构模板，可直接改成你的版本</div></div>' +
    '<div class="panel"><h4>接下来怎么做</h4><div class="ph">三步把它变成你的版本</div>' +
    '<div class="kv"><b>第一步</b><span>把开场换成你们学校的一件真事</span></div>' +
    '<div class="kv"><b>第二步</b><span>在第二段补一个可核对的数字</span></div>' +
    '<div class="kv"><b>第三步</b><span>用讲稿导出，照着试讲一遍</span></div></div>';
  if (activePlayer) activePlayer.destroy();
  activePlayer = createPlayer(document.getElementById('pv2'), t, {});
  document.getElementById('openCustom').addEventListener('click', function () { location.hash = '#/theme/custom'; });
  document.getElementById('dlCustom').addEventListener('click', function () {
    download('讲稿_' + t.title + '_60秒.md', scriptMarkdown(t), 'text/markdown');
  });
}

/* ---------------- about ---------------- */

function aboutHTML() {
  return '<div class="wrap about">' +
    '<div class="eyebrow">关于这件作品</div>' +
    '<h1>数智微光 · 思政微课工坊</h1>' +
    '<p class="lead">一个不需要安装、不需要登录的网页工具：把思政主题变成 60 秒竖屏微课、一页图解和三道测题，让班会、团课和课前十分钟有现成的东西可放。</p>' +
    '<h2>为什么做它</h2>' +
    '<p>做学生工作的人都有过这种时刻：明天早上要开班会，主题是“中国式现代化”，手上有三份文件、两篇推文，却没有一支能在三分钟里讲完、又经得起追问的材料。找视频，太长；做 PPT，太慢；念文件，没人听。</p>' +
    '<ul><li>缺的不是内容，是<strong>把内容压进十分钟</strong>的形态；</li>' +
    '<li>缺的不是热情，是<strong>可以照着讲的脚本</strong>；</li>' +
    '<li>缺的不是工具，是<strong>不用注册、不用培训、点开就能用</strong>的工具。</li></ul>' +
    '<h2>它做什么</h2>' +
    '<ul><li><strong>60 秒竖屏微课</strong>：六到七段分镜，逐句口播，手机竖屏也能看清；</li>' +
    '<li><strong>一页图解</strong>：一个中心、三个分支、一句结论，适合截屏发群里；</li>' +
    '<li><strong>三道随堂测</strong>：点选即判，答对才给解析，附讨论题；</li>' +
    '<li><strong>讲稿与学习报告</strong>：讲稿带时间码，可下载、可打印；报告可存档。</li></ul>' +
    '<h2>技术特点</h2>' +
    '<table class="table">' +
    '<tr><td>编程语言</td><td>HTML / CSS / 原生 JavaScript（ES Modules），零框架、零构建、零依赖</td></tr>' +
    '<tr><td>运行环境</td><td>任意现代浏览器（Chrome / Edge / Safari 15+），手机与桌面通用；可部署在任意静态托管或校内服务器</td></tr>' +
    '<tr><td>数据与隐私</td><td>无后端、无接口调用、无第三方脚本；学习进度与讨论草稿仅写入浏览器 localStorage</td></tr>' +
    '<tr><td>性能</td><td>首屏资源约 60 KB（未压缩），离线可用；无网络请求阻塞</td></tr>' +
    '<tr><td>可维护性</td><td>内容与界面分离，主题数据集中在 data.js，新增一个主题只需追加一段结构化数据</td></tr>' +
    '<tr><td>可访问性</td><td>支持键盘操作（空格播放/暂停）、语义化标签、打印样式与“减少动效”偏好</td></tr>' +
    '</table>' +
    '<h2>怎么用</h2>' +
    '<ul><li><strong>直接用</strong>：打开微课库，选一个主题，点播放，投屏或让大家扫码；</li>' +
    '<li><strong>改着用</strong>：进入主题页，下载讲稿，把例子换成你们学校的人和事；</li>' +
    '<li><strong>自己造</strong>：在主题工坊输入主题词，选对象与讲法，生成结构后替换素材。</li></ul>' +
    '<h2>运营模式</h2>' +
    '<p>工具本身免费、开源、可离线分发。内容侧采用“教师把关 + 学生共建”：由思政课教师审核史实与表述，学生团队按模板补充本校案例，形成可持续更新的校本微课库。推广上走“课代表—班级—学院”的三级分发，配合二维码贴纸与班会 PPT 尾页。</p>' +
    '<h2>作品信息</h2>' +
    '<table class="table">' +
    '<tr><td>作品名称</td><td>数智微光 · 思政微课工坊</td></tr>' +
    '<tr><td>作品类型</td><td>自主研发应用（互联网应用 · 网页端）</td></tr>' +
    '<tr><td>研发时间</td><td>2026 年 11 月</td></tr>' +
    '<tr><td>上线时间</td><td>' + SITE.build + '（v' + SITE.version + '）</td></tr>' +
    '<tr><td>当前版本</td><td>v' + SITE.version + ' · 6 个内置主题 + 自定义结构工坊</td></tr>' +
    '<tr><td>作者</td><td>（待填：姓名 / 学号 / 学院，最多 4 人）</td></tr>' +
    '<tr><td>指导教师</td><td>（待填：最多 2 人）</td></tr>' +
    '</table>' +
    '<h2>说明与边界</h2>' +
    '<p>站内所有主题的概念表述、时间节点与引用，均按公开的权威文本整理，并在每页标注“内容依据”以便核对；涉及具体数据的表述以官方发布为准。自定义工坊生成的是<strong>结构模板</strong>，其中的例子、数据与结论需要使用者自行补充与核实，工具不代替事实核查。</p>' +
    '<p class="mini-note">版本记录：v1.0.0（2026-11-26）首发，含 6 个主题、时间轴播放器、测题与报告、讲稿导出、主题工坊。</p>' +
    '</div>';
}

/* ---------------- router ---------------- */

function route() {
  var h = location.hash.replace(/^#/, '') || '/';
  if (activePlayer) { activePlayer.destroy(); activePlayer = null; }
  var parts = h.split('/').filter(Boolean);
  if (parts[0] === 'theme' && parts[1]) {
    renderTheme(parts[1]);
  } else if (parts[0] === 'studio') {
    renderStudio();
  } else if (parts[0] === 'about') {
    app.innerHTML = aboutHTML();
  } else {
    renderHome();
  }
  var navs = document.querySelectorAll('[data-nav]');
  for (var i = 0; i < navs.length; i++) {
    var k = navs[i].getAttribute('data-nav');
    var on = (k === 'home' && (!parts[0] || parts[0] === 'theme')) || (k === parts[0]);
    navs[i].className = on ? 'on' : '';
  }
  window.scrollTo(0, 0);
}

window.addEventListener('hashchange', route);
route();
console.log('[szwg] v' + SITE.version + ' ready · themes=' + THEMES.length);