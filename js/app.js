/* 肖八刷题 SPA */
const $ = sel => document.querySelector(sel);
const app = $('#app');

/* ---------- 数据 ---------- */
let DB = null; // {papers:[{id, singles:[], multis:[], bigs:[]}]}

const SUBJECTS = ['马原','毛中特','习思想','史纲','思修法基','时政'];

const ERR_REASONS = ['知识遗漏','审题偏差','干扰项迷惑','记忆模糊','粗心失误'];

/* ---------- 智能题型标签 ---------- */
const QTYPE_TAGS = [
  { id: 'hat',     name: '帽子题',   cls: 'type-hat' },
  { id: 'concept', name: '概念题',   cls: 'type-concept' },
  { id: 'under',   name: '理解题',   cls: 'type-under' },
  { id: 'quote',   name: '史料引文题', cls: 'type-quote' },
  { id: 'calc',    name: '计算题',   cls: 'type-calc' },
  { id: 'news',    name: '时政题',   cls: 'type-news' },
  { id: 'big',     name: '分析大题', cls: 'type-big' },
];
// 帽子题关键词（题干含这些词→帽子题）
const HAT_KW = ['本质','主导','核心','根本','首要','标志','关键','第一','中心','基础','前提','保证','源泉','动力','原则','宗旨','特征','性质','实质','灵魂'];
// 史料引文题标志（题干含引号+古语/著作/人名）
const QUOTE_KW = ['毛泽东','邓小平','习近平','马克思','恩格斯','列宁','指出','认为','强调','曾说','说过','《','》','“','”','『','』'];
// 时政题标志
const NEWS_KW = ['2025','2026','2027','二十大','二十届','中央','全会','人工智能大会','两会','全会精神','新时代','新征程','中国式现代化','十四五','十五五'];
// 计算题标志
const CALC_KW = ['计算','剩余价值','利润率','资本有机构成','周转','价值量','货币流通','社会总产值','平均利润','利息','股息'];

function classifyTag(q) {
  const stem = (q.stem || '').trim();
  // 分析大题：有 questions 数组（大题结构）
  if (q.type === 'big' || Array.isArray(q.questions)) return 'big';
  // 计算题
  if (CALC_KW.some(k => stem.includes(k))) return 'calc';
  // 史料引文题：含人物言论或引号（优先于帽子题，如"毛泽东指出...首要..."）
  if (QUOTE_KW.some(k => stem.includes(k)) || /[“”『』《》]/.test(stem)) return 'quote';
  // 时政题（含年份/会议/政策）
  if (NEWS_KW.some(k => stem.includes(k))) return 'news';
  // 帽子题：含帽子关键词且是"XX是/就是/指"句式
  if (HAT_KW.some(k => stem.includes(k)) && /是|指|即|属于|核心|根本|本质/.test(stem)) return 'hat';
  // 概念题：题干含"是指/指的是/的含义/概念"
  if (/是指|指的是|含义|概念|叫作|叫做/.test(stem)) return 'concept';
  // 默认理解题
  return 'under';
}

function getTag(q) {
  const manual = P.tags && P.tags[q.id];
  return manual || classifyTag(q);
}
function tagName(id) { const t = QTYPE_TAGS.find(x => x.id === id); return t ? t.name : id; }
function tagCls(id) { const t = QTYPE_TAGS.find(x => x.id === id); return t ? t.cls : ''; }

/* 考点关键词高亮（选择题解析内高亮） */
function highlightKw(text) {
  if (!text) return '';
  const kw = ['正确','错误','本质','根本','核心','关键','前提','基础','决定','唯一','标准','首要','标志','普遍','客观','主观','规律','统一','条件','因果','联系','实践','认识','矛盾','发展','生产力','生产关系','上层建筑','经济基础'];
  let out = esc(text);
  // 先转义再高亮：按关键词在原文中查找
  for (const k of kw) {
    out = out.replace(new RegExp(k, 'g'), `<span class="kw">${k}</span>`);
  }
  return out;
}

/* 干扰项拆解：从解析文本按 A/B/C/D 逐条拆分 */
function splitAnalysis(text, answer) {
  if (!text) return [];
  // 格式："原理阐述...A正确。B错误。C错误。D错误。"
  // "X正确/错误"是上一段内容的结论标记，故每段解析 = 上一标记之后到本标记的内容（含本标记的判定）
  const anchor = /([A-D](?:[、,，][A-D])*)\s*(正确|错误)/g;
  const matches = [];
  let m;
  while ((m = anchor.exec(text)) !== null) {
    matches.push({ idx: m.index, letters: m[1], verdict: m[2], full: m[0] });
  }
  if (!matches.length) {
    return [{ letters: answer, ok: true, verdict: '', text: text.trim() }];
  }
  const items = [];
  let prevEnd = 0;
  for (const cur of matches) {
    const letters = cur.letters.replace(/[、,，]/g, '');
    const ok = cur.verdict === '正确';
    // 本段正文 = 从上一段结束到本标记之前
    const body = text.slice(prevEnd, cur.idx).trim().replace(/^[。；\s]+/, '');
    items.push({ letters, ok, verdict: cur.verdict, text: body });
    prevEnd = cur.idx + cur.full.length;
  }
  // 最后一个标记之后若还有内容（通常是收尾总结），附加
  const tail = text.slice(prevEnd).trim().replace(/^[。；\s]+/, '');
  if (tail && tail.length > 8) {
    items.push({ letters: '', ok: true, verdict: '', text: tail });
  }
  // 过滤空段
  return items.filter(it => it.text.length > 2);
}

const STORE_KEY = 'xiao8_progress_v1';

function defaultProgress() {
  return {
    // answers[qid] = { picked:'A', correct:true/false, times:n, wrongTimes:n, lastTs, reasons:[], mastered:0 }
    answers: {},
    bigStatus: {},      // bigId -> { viewed:n, revealedAll:false, lastTs }
    sessions: [],       // {ts, paper, type, total, correct}
    tags: {},           // qid -> tagId（手动切换的题型标签）
    settings: { hideAnalysis: false }
  };
}
let P = load();

function load() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) { const p = JSON.parse(raw); return Object.assign(defaultProgress(), p); }
  } catch(e) {}
  return defaultProgress();
}
function save() { localStorage.setItem(STORE_KEY, JSON.stringify(P)); }

/* 题目状态: 0 未做 1 未掌握 2 模糊 3 已掌握 */
function mastery(qid) {
  const a = P.answers[qid];
  if (!a || !a.times) return 0;
  if (a.mastered) return 3;
  if (!a.correct) return 1;
  return 2;
}
function qAll(paper) { return [...paper.singles, ...paper.multis]; }
function qById(qid) {
  for (const p of DB.papers) { const q = qAll(p).find(x => x.id === qid); if (q) return q; }
  return null;
}
function paperOf(qid) { return DB.papers.find(p => qAll(p).some(x => x.id === qid) || p.bigs.some(x => x.id === qid)); }
function bigById(id) {
  for (const p of DB.papers) { const b = p.bigs.find(x => x.id === id); if (b) return b; }
  return null;
}

/* ---------- 路由 ---------- */
let state = { view: 'home' };
let navStack = [];

function go(view, params = {}) {
  navStack.push({ ...state });
  state = { view, ...params };
  render();
  window.scrollTo(0, 0);
}
function back() {
  if (navStack.length) { state = navStack.pop(); render(); window.scrollTo(0, 0); }
  else { state = { view: 'home' }; render(); }
}

/* ---------- 工具 ---------- */
function toast(msg) {
  let t = $('#toast'); if (!t) { t = document.createElement('div'); t.id = 'toast'; document.body.appendChild(t); }
  t.textContent = msg; t.classList.add('show');
  clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove('show'), 1800);
}
function esc(s) { return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function fmtDate(ts) { if(!ts) return '—'; const d = new Date(ts); return `${d.getMonth()+1}/${d.getDate()}`; }
function ring(pct, size=44, color='var(--primary)') {
  const r = (size-6)/2, c = 2*Math.PI*r;
  return `<svg width="${size}" height="${size}" class="ring" viewBox="0 0 ${size} ${size}">
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="var(--border)" stroke-width="5"/>
    <circle cx="${size/2}" cy="${size/2}" r="${r}" fill="none" stroke="${color}" stroke-width="5"
      stroke-dasharray="${c*pct} ${c}" stroke-linecap="round" transform="rotate(-90 ${size/2} ${size/2})"/>
    <text x="50%" y="54%" text-anchor="middle" font-size="11" fill="var(--text-2)">${Math.round(pct*100)}%</text></svg>`;
}

/* ---------- 首页 ---------- */
function renderHome() {
  const allQ = DB.papers.flatMap(qAll);
  const done = allQ.filter(q => P.answers[q.id]?.times).length;
  const wrong = allQ.filter(q => mastery(q.id) === 1).length;
  const allBig = DB.papers.flatMap(p => p.bigs);
  const bigDone = allBig.filter(b => P.bigStatus[b.id]?.viewed).length;
  const acc = (() => {
    let t = 0, c = 0;
    for (const q of allQ) { const a = P.answers[q.id]; if (a?.times) { t += a.times; c += (a.times - (a.wrongTimes||0)); } }
    return t ? Math.round(c/t*100) : null;
  })();
  app.innerHTML = `
  <div class="topbar"><h1>肖八刷题 · 2027</h1></div>
  <div class="page">
    <div class="card"><h2>总览</h2>
      <div class="grid4">
        <div class="stat"><div class="num">${done}</div><div class="label">已刷题数</div></div>
        <div class="stat"><div class="num">${allQ.length}</div><div class="label">选择题总数</div></div>
        <div class="stat"><div class="num red">${wrong}</div><div class="label">待攻克错题</div></div>
        <div class="stat"><div class="num orange">${acc===null?'—':acc+'%'}</div><div class="label">总正确率</div></div>
      </div>
      <div class="progress"><div style="width:${allQ.length?done/allQ.length*100:0}%"></div></div>
      <div style="font-size:12px;color:var(--text-2);margin-top:6px">选择题进度 ${done}/${allQ.length} · 大题已学 ${bigDone}/${allBig.length}</div>
    </div>
    <button class="list-item" onclick="go('mode')"><div class="icon">练</div><div>开始刷题<div style="font-size:12px;color:var(--text-2)">练习 / 模考 / 智能组卷 三种模式</div></div><span class="badge">›</span></button>
    <button class="list-item" onclick="go('papers')"><div class="icon">题</div><div>按套卷刷题<div style="font-size:12px;color:var(--text-2)">8 套卷，单选 + 多选 + 大题</div></div><span class="badge">›</span></button>
    <button class="list-item" onclick="go('wrong')"><div class="icon">错</div><div>错题本<div style="font-size:12px;color:var(--text-2)">自动记录，支持重练</div></div><span class="badge">${wrong} 题 ›</span></button>
    <button class="list-item" onclick="go('stats')"><div class="icon">析</div><div>统计分析<div style="font-size:12px;color:var(--text-2)">知识点 / 错因 / 进度</div></div><span class="badge">›</span></button>
    <button class="list-item" onclick="go('allq')"><div class="icon">览</div><div>全部题目<div style="font-size:12px;color:var(--text-2)">逐题查看状态与刷题次数</div></div><span class="badge">›</span></button>
    <button class="list-item" onclick="installApp()"><div class="icon">装</div><div>添加到桌面<div style="font-size:12px;color:var(--text-2)">手机 / 平板 / 电脑都能装，离线可用</div></div><span class="badge">›</span></button>
    <div class="card" style="font-size:12px;color:var(--text-2);line-height:1.7">
      数据保存在本机浏览器中，无需联网登录。添加到桌面后可离线全屏使用。
    </div>
  </div>`;
}

/* ================= 刷题模式系统 ================= */
// 模式：practice 练习 / exam 模考 / smart 智能组卷
let EXAM_SET = null;   // 模考/组卷状态 { qs, idx, answers:[], flags:Set, timer, remaining, withBig, duration }

/* ---------- 模式选择页 ---------- */
function renderMode() {
  const qCount = DB.papers.reduce((s, p) => s + qAll(p).length, 0);
  app.innerHTML = `
  <div class="topbar"><button class="back" onclick="back()">‹</button><h1>选择刷题模式</h1></div>
  <div class="page">
    <div class="mode-bar" style="position:static;border-radius:14px;box-shadow:0 1px 4px rgba(0,0,0,.06);margin-bottom:14px">
      <button class="mode-tab on" onclick="modePick('practice')">练习模式<span class="mt-sub">逐题 · 即时反馈</span></button>
      <button class="mode-tab" onclick="modePick('exam')">模考模式<span class="mt-sub">33题 · 50分</span></button>
      <button class="mode-tab" onclick="modePick('smart')">智能组卷<span class="mt-sub">随机抽题组卷</span></button>
    </div>
    <div id="mode-panel">${modePanelHtml('practice')}</div>
  </div>`;
}
function modePick(m) {
  window._curMode = m;
  document.querySelectorAll('.mode-bar .mode-tab').forEach((el, i) => {
    el.classList.toggle('on', ['practice','exam','smart'][i] === m);
  });
  $('#mode-panel').innerHTML = modePanelHtml(m);
}
function modePanelHtml(m) {
  if (m === 'practice') {
    const instant = PRACTICE_INSTANT;
    return `
    <div class="card">
      <h2>练习模式</h2>
      <p style="font-size:13px;color:var(--text-2);line-height:1.7">自由刷题，按套卷或全库练习，记录对错与错因。</p>
      <div style="margin-top:6px;font-size:13px;color:var(--text-2);font-weight:600">判分方式</div>
      <div class="sub-switch">
        <div class="ss-item ${instant?'on':''}" onclick="setInstant(true)">
          <span class="ss-dot"></span><span>即时判分<span class="ss-desc">选完立刻显示对错与解析</span></span>
        </div>
        <div class="ss-item ${!instant?'on':''}" onclick="setInstant(false)">
          <span class="ss-dot"></span><span>统一判分<span class="ss-desc">全部选完提交后一起判</span></span>
        </div>
      </div>
    </div>
    <button class="btn" onclick="go('papers')">选择套卷开始练习 ›</button>
    <button class="btn ghost" onclick="startQuiz(0,'wrongAll',{instant})">练习错题本（${DB.papers.flatMap(qAll).filter(q=>mastery(q.id)===1).length}）</button>`;
  }
  if (m === 'exam') {
    return `
    <div class="card">
      <h2>模考模式</h2>
      <p style="font-size:13px;color:var(--text-2);line-height:1.7">单选 16 题 + 多选 17 题，满分 50 分。不即时判分，交卷后统一出分。</p>
      <div class="set-row">
        <div><div class="sr-label">纳入分析题判分</div><div class="sr-hint">开启后大题也计入总分（模拟完整卷）</div></div>
        <div class="toggle ${EXAM_WITH_BIG?'on':''}" onclick="toggleWithBig()"></div>
      </div>
    </div>
    <div class="card">
      <div class="set-row" style="border:none"><div><div class="sr-label">倒计时时长</div><div class="sr-hint">时间到自动交卷</div></div></div>
      <div class="dur-chips">
        ${[15, 25, 40, 60, 90].map(d => `<div class="chip ${EXAM_DURATION===d?'on':''}" onclick="setDuration(${d})">${d} 分钟</div>`).join('')}
      </div>
    </div>
    <button class="btn" onclick="startExam(1)">开始模考（第 1 套）›</button>
    <div class="card" style="font-size:13px;color:var(--text-2);line-height:1.7">模考使用指定套卷的选择题结构（单选 16 + 多选 17）。</div>`;
  }
  // smart
  return `
    <div class="card">
      <h2>智能组卷</h2>
      <p style="font-size:13px;color:var(--text-2);line-height:1.7">从肖八 8 套卷 ${DB.papers.reduce((s,p)=>s+qAll(p).length,0)} 道选择题中随机抽取，按考研结构组卷。</p>
      <div class="set-row">
        <div><div class="sr-label">纳入分析题判分</div><div class="sr-hint">开启后随机抽大题计入总分</div></div>
        <div class="toggle ${EXAM_WITH_BIG?'on':''}" onclick="toggleWithBig()"></div>
      </div>
    </div>
    <div class="card">
      <div class="set-row" style="border:none"><div><div class="sr-label">倒计时时长</div><div class="sr-hint">时间到自动交卷</div></div></div>
      <div class="dur-chips">
        ${[15, 25, 40, 60, 90].map(d => `<div class="chip ${EXAM_DURATION===d?'on':''}" onclick="setDuration(${d})">${d} 分钟</div>`).join('')}
      </div>
    </div>
    <button class="btn" onclick="startSmart()">随机组卷开始 ›</button>
    <button class="btn ghost" onclick="startSmart()">换一套（重新抽题）</button>`;
}

/* 练习模式子开关 */
function setInstant(v) { PRACTICE_INSTANT = v; modePick('practice'); }

/* 模考设置全局 */
let EXAM_WITH_BIG = false;
let EXAM_DURATION = 60; // 分钟
function toggleWithBig() {
  EXAM_WITH_BIG = !EXAM_WITH_BIG;
  const cur = window._curMode || 'exam';
  document.querySelectorAll('.mode-bar .mode-tab').forEach((el, i) => {
    el.classList.toggle('on', ['practice','exam','smart'][i] === cur);
  });
  $('#mode-panel').innerHTML = modePanelHtml(cur);
}
function setDuration(d) {
  EXAM_DURATION = d;
  const cur = window._curMode || 'exam';
  document.querySelectorAll('.mode-bar .mode-tab').forEach((el, i) => {
    el.classList.toggle('on', ['practice','exam','smart'][i] === cur);
  });
  $('#mode-panel').innerHTML = modePanelHtml(cur);
}

/* ---------- 模考 / 组卷启动 ---------- */
// 构建试卷：pid 为套卷号；smart 时随机抽
function buildExam(smart) {
  let singles, multis, bigs, sourceLabel;
  if (smart) {
    // 从所有套卷随机抽 16 单选 + 17 多选
    const allSingles = DB.papers.flatMap(p => p.singles);
    const allMultis = DB.papers.flatMap(p => p.multis);
    const allBigs = DB.papers.flatMap(p => p.bigs);
    singles = shuffle(allSingles).slice(0, 16);
    multis = shuffle(allMultis).slice(0, 17);
    bigs = EXAM_WITH_BIG ? shuffle(allBigs).slice(0, 2) : [];
    sourceLabel = '智能组卷';
  } else {
    const p = DB.papers.find(x => x.id === (EXAM_SET?.pid || 1));
    singles = p.singles; multis = p.multis;
    bigs = EXAM_WITH_BIG ? p.bigs : [];
    sourceLabel = `第 ${p.id} 套`;
  }
  // 统一编号：单选 1-16，多选 17-33
  const qs = [...singles, ...multis].map((q, i) => ({
    ...q, examNum: i + 1, part: i < 16 ? 'single' : 'multi'
  }));
  return { qs, bigs, sourceLabel, total: qs.length, full: 50 + (bigs.length * 10) };
}
function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

function startExam(pid) {
  EXAM_SET = { pid, smart: false, idx: 0, picks: {}, flags: new Set(), remaining: EXAM_DURATION * 60, withBig: EXAM_WITH_BIG };
  const built = buildExam(false);
  Object.assign(EXAM_SET, built);
  EXAM_SET.picks = {};
  EXAM_SET.flags = new Set();
  startExamTimer();
  state = { view: 'exam' }; navStack = [{ view: 'mode' }];
  render();
}
function startSmart() {
  EXAM_SET = { smart: true, idx: 0, picks: {}, flags: new Set(), remaining: EXAM_DURATION * 60, withBig: EXAM_WITH_BIG };
  const built = buildExam(true);
  Object.assign(EXAM_SET, built);
  EXAM_SET.picks = {};
  EXAM_SET.flags = new Set();
  startExamTimer();
  state = { view: 'exam' }; navStack = [{ view: 'mode' }];
  render();
}

/* ---------- 模考倒计时 ---------- */
let EXAM_TIMER = null;
function startExamTimer() {
  clearInterval(EXAM_TIMER);
  EXAM_TIMER = setInterval(() => {
    if (state.view !== 'exam') return;
    EXAM_SET.remaining--;
    updateExamTimer();
    if (EXAM_SET.remaining <= 0) { submitExam(true); }
  }, 1000);
}
function updateExamTimer() {
  const el = $('#eb-timer');
  if (!el) return;
  const s = Math.max(0, EXAM_SET.remaining);
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  el.textContent = `${mm}:${ss}`;
  el.className = 'eb-timer' + (s <= 60 ? ' warn' : '') + (s <= 15 ? ' danger' : '');
}
function fmtClock(s) {
  const mm = String(Math.floor(s / 60)).padStart(2, '0');
  const ss = String(s % 60).padStart(2, '0');
  return `${mm}:${ss}`;
}

/* ---------- 模考渲染 ---------- */
function renderExam() {
  const E = EXAM_SET;
  if (!E) return renderMode();
  const q = E.qs[E.idx];
  const isMulti = q.part === 'multi';
  const picked = E.picks[q.id] || [];
  const doneCount = Object.keys(E.picks).length;
  const tagId = getTag(q);

  // 顶部：倒计时 + 进度条
  const examBar = `
  <div class="exam-bar">
    <div class="eb-top">
      <div class="eb-timer ${E.remaining<=60?'warn':''} ${E.remaining<=15?'danger':''}" id="eb-timer">${fmtClock(E.remaining)}</div>
      <div class="eb-count">${E.sourceLabel} · ${doneCount}/${E.qs.length}</div>
    </div>
    <div class="exam-progress"><div style="width:${doneCount/E.qs.length*100}%"></div></div>
  </div>`;

  // 题号导航
  const nav = `
  <div class="qnav">
    ${E.qs.map((qq, i) => {
      const cls = ['qn', E.picks[qq.id] ? 'done' : '', E.flags.has(qq.id) ? 'flag' : '', i === E.idx ? 'cur' : ''].join(' ').trim();
      return `<div class="${cls}" onclick="examJump(${i})">${qq.examNum}</div>`;
    }).join('')}
  </div>`;

  // 选项
  const optsHtml = q.options.map((t, i) => {
    const L = 'ABCD'[i];
    const sel = picked.includes(L);
    return `<div class="option ${sel?'selected':''}" onclick="examPick('${L}')"><span class="letter">${L}</span><span>${esc(t)}</span></div>`;
  }).join('');

  app.innerHTML = `
  <div class="topbar"><button class="back" onclick="examExit()">‹</button>
    <h1>${E.sourceLabel} · 模考</h1>
    <button class="action" onclick="examSubmit()">交卷</button></div>
  ${examBar}
  <div class="page" style="padding-top:10px">
    ${nav}
    <div class="q-tags" style="margin-top:12px"><button class="q-type-tag ${tagCls(tagId)}" onclick="switchTag('${q.id}')">${tagName(tagId)}<span class="swap">切换</span></button></div>
    <div class="q-meta" style="opacity:.6"><span class="tag" style="background:transparent;color:var(--text-3);padding-left:0">${esc(q.subject)}</span>
      <span class="tag" style="background:transparent;color:var(--text-3);padding-left:0">${isMulti?'多选':'单选'} · ${isMulti?'2分':'1分'}</span></div>
    <div class="q-stem">${esc(q.stem)}</div>
    ${isMulti ? '<div class="multi-tip">多选题：多选、少选、错选均不得分（少选得 1 分）</div>' : ''}
    ${optsHtml}
    <div style="display:flex;gap:8px;margin-top:4px">
      <button class="flag-btn ${E.flags.has(q.id)?'on':''}" onclick="examFlag()">${E.flags.has(q.id)?'已标记':'标记待查'}</button>
    </div>
    <div class="bottombar">
      <button class="btn ghost" onclick="examPrev()" ${E.idx===0?'disabled':''}>上一题</button>
      <button class="btn" onclick="examNext()">${E.idx===E.qs.length-1?'去交卷':'下一题'}</button>
    </div>
  </div>`;
}

/* 模考选项选择（不判分） */
function examPick(L) {
  const E = EXAM_SET;
  const q = E.qs[E.idx];
  let picks = E.picks[q.id] || [];
  if (q.part === 'single') {
    picks = [L];
  } else {
    const i = picks.indexOf(L);
    if (i >= 0) picks.splice(i, 1); else picks.push(L);
    picks.sort();
  }
  E.picks[q.id] = picks;
  renderExam();
}
function examJump(i) { EXAM_SET.idx = i; renderExam(); window.scrollTo(0, 0); }
function examPrev() { if (EXAM_SET.idx > 0) { EXAM_SET.idx--; renderExam(); window.scrollTo(0,0); } }
function examNext() {
  if (EXAM_SET.idx < EXAM_SET.qs.length - 1) { EXAM_SET.idx++; renderExam(); window.scrollTo(0,0); }
  else { submitExam(); }
}
function examFlag() {
  const q = EXAM_SET.qs[EXAM_SET.idx];
  if (EXAM_SET.flags.has(q.id)) EXAM_SET.flags.delete(q.id); else EXAM_SET.flags.add(q.id);
  renderExam();
}
function examExit() {
  openModal(`
    <p>确定退出模考？当前作答不会保留。</p>
    <div style="display:flex;gap:10px">
      <button class="btn ghost" style="margin:0" onclick="closeModal()">继续作答</button>
      <button class="btn" style="margin:0" onclick="abortExam()">退出</button>
    </div>`, '退出模考');
}
function abortExam() {
  clearInterval(EXAM_TIMER);
  closeModal();
  state = { view: 'mode' }; navStack = []; render();
}

/* 交卷确认 */
function examSubmit() { submitExam(); }
function submitExam(auto = false) {
  clearInterval(EXAM_TIMER);
  const E = EXAM_SET;
  const doneCount = Object.keys(E.picks).length;
  const remain = E.qs.length - doneCount;
  if (!auto && remain > 0) {
    openModal(`
      <p>还有 <b style="color:var(--warn)">${remain}</b> 题未作答，确定交卷吗？</p>
      <div class="confirm-rows">
        <div class="cr"><span>已作答</span><span class="cr-v">${doneCount} / ${E.qs.length}</span></div>
        <div class="cr"><span>剩余时间</span><span class="cr-v">${fmtClock(Math.max(0,E.remaining))}</span></div>
      </div>
      <div style="display:flex;gap:10px">
        <button class="btn ghost" style="margin:0" onclick="closeModal()">继续作答</button>
        <button class="btn" style="margin:0" onclick="doGrade(false)">确定交卷</button>
      </div>`, '确认交卷');
    return;
  }
  doGrade(auto);
}
function doGrade(auto = false) {
  closeModal();
  const E = EXAM_SET;
  const graded = E.qs.map(q => {
    const picked = (E.picks[q.id] || []).join('');
    let correct = false, score = 0;
    if (q.part === 'single') { correct = picked === q.answer; score = correct ? 1 : 0; }
    else if (!picked) { correct = false; score = 0; } // 未作答 0 分
    else {
      const a = q.answer;
      const wrongPick = [...picked].some(L => !a.includes(L));
      const missing = [...a].some(L => !picked.includes(L));
      if (!wrongPick && !missing) { correct = true; score = 2; }      // 全对
      else if (!wrongPick && missing) { correct = false; score = 1; }  // 少选
      else { correct = false; score = 0; }                             // 错选
    }
    return { q, picked, correct, score };
  });
  // 写入 P.answers 记录
  for (const g of graded) {
    const a = P.answers[g.q.id] || { times: 0, wrongTimes: 0, reasons: [], mastered: false };
    a.times++; if (!g.correct) { a.wrongTimes++; if (!a.reasons.length) a.reasons = ['知识遗漏']; }
    else if (g.correct && a.times >= 3 && (a.times - a.wrongTimes) / a.times >= 0.8) a.mastered = true;
    a.picked = g.picked; a.correct = g.correct; a.lastTs = Date.now();
    P.answers[g.q.id] = a;
  }
  save();
  const totalScore = graded.reduce((s, g) => s + g.score, 0);
  const fullScore = E.qs.length === 33 ? 50 : E.full;
  const wrongCount = graded.filter(g => !g.correct).length;
  EXAM_RESULT = { graded, totalScore, fullScore, wrongCount, sourceLabel: E.sourceLabel, auto };
  // 记录会话
  P.sessions.push({ ts: Date.now(), paper: E.sourceLabel, type: 'exam',
    total: graded.length, correct: graded.filter(g => g.correct).length, score: totalScore });
  if (P.sessions.length > 100) P.sessions = P.sessions.slice(-100);
  save();
  state = { view: 'examResult' }; render();
}
let EXAM_RESULT = null;

/* ---------- 模考得分报告 ---------- */
function renderExamResult() {
  const R = EXAM_RESULT;
  if (!R) return renderMode();
  const rate = R.fullScore ? Math.round(R.totalScore / R.fullScore * 100) : 0;
  const cls = rate >= 80 ? '' : rate >= 60 ? 'mid' : 'bad';
  const wrongs = R.graded.filter(g => !g.correct);
  const empty = R.graded.filter(g => !g.picked);
  app.innerHTML = `
  <div class="topbar"><button class="back" onclick="state={view:'mode'};navStack=[];render()">‹</button><h1>${R.sourceLabel} · 得分报告</h1></div>
  <div class="page">
    <div class="report-head">
      <div class="rh-score ${cls}">${R.totalScore}<span style="font-size:20px"> / ${R.fullScore}</span></div>
      <div class="rh-sub">正确率 ${rate}%</div>
      <div class="rh-full">${R.auto ? '时间到，已自动交卷' : ''}</div>
    </div>
    <div class="report-grid">
      <div class="rg g-ok"><div class="n">${R.graded.filter(g=>g.correct).length}</div><div class="l">答对</div></div>
      <div class="rg g-bad"><div class="n">${wrongs.length}</div><div class="l">答错</div></div>
      <div class="rg g-warn"><div class="n">${empty.length}</div><div class="l">未作答</div></div>
      <div class="rg"><div class="n">${R.graded.filter(g=>g.score>0&&!g.correct).length}</div><div class="l">部分得分</div></div>
    </div>
    ${wrongs.length ? `<div class="card"><h2>错题回顾（${wrongs.length}）</h2>
      ${wrongs.map(g => {
        const q = g.q;
        return `<button class="rq-item rq-wrong" onclick="examReview('${q.id}')">
          <span class="rq-num">${q.examNum}</span>
          <span class="rq-body">${esc(q.stem.slice(0, 26))}…</span>
          <span class="rq-ans">你的 ${esc(g.picked||'—')} / <b>${esc(q.answer)}</b></span>
        </button>`;
      }).join('')}
    </div>` : `<div class="card" style="text-align:center;color:var(--ok);font-weight:600">全部正确，优秀！</div>`}
    <div class="card"><h2>全部题目</h2>
      ${R.graded.map(g => {
        const q = g.q;
        return `<button class="rq-item ${g.correct?'':'rq-wrong'}" onclick="examReview('${q.id}')">
          <span class="rq-num">${q.examNum}</span>
          <span class="rq-body">${esc(q.stem.slice(0, 26))}…</span>
          <span class="rq-ans">${g.correct?'<b>'+esc(g.picked)+'</b>':esc(g.picked||'—')} / ${esc(q.answer)}</span>
        </button>`;
      }).join('')}
    </div>
    <button class="btn" onclick="state={view:'mode'};navStack=[];render()">返回模式选择</button>
  </div>`;
}
/* 模考错题回顾：单题解析视图 */
function examReview(qid) {
  const q = qById(qid);
  if (!q) return;
  quiz = { qs: [q], idx: 0, mode: 'single', results: [{ qid: q.id, picked: EXAM_RESULT.graded.find(g=>g.q.id===qid)?.picked||'', correct: EXAM_RESULT.graded.find(g=>g.q.id===qid)?.correct||false }], instant: true };
  state = { view: 'quiz' }; navStack = [{ view: 'examResult' }];
  render();
}

/* ---------- 套卷列表 ---------- */
function renderPapers() {
  const rows = DB.papers.map(p => {
    const qs = qAll(p);
    const d = qs.filter(q => P.answers[q.id]?.times).length;
    const c = qs.filter(q => mastery(q.id) === 3).length;
    return `<button class="list-item" onclick="go('paper',{pid:${p.id}})">
      <div class="icon">${p.id}</div>
      <div style="flex:1">
        <div>第 ${p.id} 套</div>
        <div class="progress" style="max-width:180px"><div style="width:${qs.length?d/qs.length*100:0}%"></div></div>
        <div style="font-size:11px;color:var(--text-2);margin-top:4px">已刷 ${d}/${qs.length} · 已掌握 ${c}</div>
      </div><span class="badge">›</span></button>`;
  }).join('');
  app.innerHTML = `
  <div class="topbar"><button class="back" onclick="back()">‹</button><h1>选择套卷</h1></div>
  <div class="page">${rows}</div>`;
}

/* ---------- 套卷详情 ---------- */
function renderPaper() {
  const p = DB.papers.find(x => x.id === state.pid);
  if (!p) return renderHome();
  const qs = qAll(p);
  const d = qs.filter(q => P.answers[q.id]?.times).length;
  const bigsDone = p.bigs.filter(b => P.bigStatus[b.id]?.viewed).length;
  app.innerHTML = `
  <div class="topbar"><button class="back" onclick="back()">‹</button><h1>第 ${p.id} 套</h1></div>
  <div class="page">
    <div class="card">
      <div style="display:flex;align-items:center;gap:12px">
        <div style="flex:1"><div style="font-size:14px;color:var(--text-2)">选择题完成进度</div>
        <div class="progress" style="max-width:200px"><div style="width:${qs.length?d/qs.length*100:0}%"></div></div></div>
        ${ring(qs.length?d/qs.length:0)}
      </div>
    </div>
    <button class="btn" onclick="startQuiz(${p.id}, 'all')">刷题 · 全部选择题（${qs.length} 题）</button>
    <button class="btn ghost" onclick="startQuiz(${p.id}, 'recite')">背题 · 先看答案再记（${qs.length} 题）</button>
    <button class="btn ghost" onclick="startQuiz(${p.id}, 'singles')">单选 ${p.singles.length} 题</button>
    <button class="btn ghost" onclick="startQuiz(${p.id}, 'multis')">多选 ${p.multis.length} 题</button>
    <button class="btn ghost" onclick="startQuiz(${p.id}, 'wrongOnly')">只练本套错题（${qs.filter(q=>mastery(q.id)===1).length}）</button>
    <h2 style="font-size:15px;margin:16px 4px 10px">材料分析题（大题）</h2>
    ${p.bigs.map(b => {
      const st = P.bigStatus[b.id];
      return `<button class="list-item" onclick="go('big',{bid:'${b.id}'})">
        <div class="icon">${st?.viewed?'已':'未'}</div>
        <div style="flex:1"><div>第 ${b.num} 题 · ${esc(b.subject)}</div>
        <div style="font-size:12px;color:var(--text-2)">${st?.viewed?`已学 ${st.viewed} 次 · 最近 ${fmtDate(st.lastTs)}`:'未学习'}</div></div>
        <span class="badge">›</span></button>`;
    }).join('')}
  </div>`;
}

/* ---------- 刷题 ---------- */
let quiz = null;
// 全局刷题设置（练习模式即时/统一判分）
let PRACTICE_INSTANT = true;

function startQuiz(pid, mode, opts = {}) {
  let qs;
  if (mode === 'wrongAll') {
    qs = DB.papers.flatMap(qAll).filter(q => mastery(q.id) === 1);
  } else {
    const p = DB.papers.find(x => x.id === pid);
    qs = qAll(p);
    if (mode === 'singles') qs = p.singles;
    if (mode === 'multis') qs = p.multis;
    if (mode === 'wrongOnly') qs = qs.filter(q => mastery(q.id) === 1);
  }
  if (!qs.length) { toast('没有可刷的题目'); return; }
  quiz = { qs, idx: 0, mode, pid, results: [], instant: opts.instant !== undefined ? opts.instant : PRACTICE_INSTANT, toggled: null };
  state = { view: 'quiz' }; navStack = [{ view: 'paper', pid }];
  render();
}

function renderQuiz() {
  const q = quiz.qs[quiz.idx];
  const a = P.answers[q.id];
  const isMulti = q.type === 'multi';
  const doneThis = quiz.results.find(r => r.qid === q.id);
  const isRecite = quiz.mode === 'recite';
  // 统一判分模式：已作答但未判分（correct 为 null）不算"已判分"
  const graded = doneThis && doneThis.correct !== null;

  // 背题模式：纯浏览题干 + 答案 + 解析，不判分，翻页记忆
  if (isRecite) {
    const tagId = getTag(q);
    const items = splitAnalysis(q.analysis, q.answer);
    app.innerHTML = `
    <div class="topbar"><button class="back" onclick="back()">‹</button>
      <h1>背题 · 第 ${paperOf(q.id).id} 套 · 第 ${q.num} 题（${isMulti?'多选':'单选'}）</h1>
      <span style="font-size:13px;opacity:.9">${quiz.idx+1}/${quiz.qs.length}</span></div>
    <div class="page">
      <div class="q-tags"><button class="q-type-tag ${tagCls(tagId)}" onclick="switchTag('${q.id}')">${tagName(tagId)}<span class="swap">切换</span></button></div>
      <div class="q-meta" style="opacity:.6"><span class="tag" style="background:transparent;color:var(--text-3);padding-left:0">${esc(q.subject)}</span></div>
      <div class="q-stem">${esc(q.stem)}</div>
      ${q.options.map((t, i) => {
        const L = 'ABCD'[i];
        const isAns = q.answer.includes(L);
        return `<div class="option" style="${isAns?'border-color:var(--ok);background:#e9f7ee;':''}${!isAns?'opacity:.72':''}">
          <span class="letter" style="${isAns?'color:var(--ok)':''}">${L}</span><span>${esc(t)}</span>
          ${isAns?'<span class="tag" style="margin-left:auto;background:#e9f7ee;color:var(--ok);flex-shrink:0">正确</span>':''}
        </div>`;
      }).join('')}
      <div class="recite-answer">
        <div class="ra-title">答案与解析</div>
        <div class="ra-key">${esc(q.answer)}</div>
        ${items.length ? items.map(it => `<div class="ra-analysis">${it.letters?`<b>${esc(it.letters)}</b> `:''}${highlightKw(it.text)}</div>`).join('') : `<div class="ra-analysis">${highlightKw(q.analysis || '')}</div>`}
      </div>
      <div class="bottombar">
        <button class="btn ghost" onclick="recitePrev()" ${quiz.idx===0?'disabled':''}>上一题</button>
        <button class="btn" onclick="reciteNext()">${quiz.idx===quiz.qs.length-1?'返回首页':'下一题'}</button>
      </div>
    </div>`;
    return;
  }

  let optsHtml = q.options.map((t, i) => {
    const L = 'ABCD'[i];
    let cls = 'option';
    if (graded) {
      if (q.answer.includes(L)) cls += ' correct';
      if (doneThis.picked.includes(L) && !q.answer.includes(L)) cls += ' wrong';
      cls += ' disabled';
    } else if (!graded) {
      // 未判分：显示当前已选状态（统一判分模式下为已选；即时单选不显示）
      if (quiz.toggled?.includes(L)) cls += ' selected';
      else if (doneThis?.picked?.includes(L)) cls += ' selected';
    }
    return `<div class="${cls}" data-l="${L}" onclick="pickOpt('${L}')"><span class="letter">${L}</span><span>${esc(t)}</span></div>`;
  }).join('');

  let analysisHtml = '';
  if (graded) {
    const rs = a?.reasons || [];
    const correct = doneThis.correct;
    const collapsed = P._analysisCollapsed && P._analysisCollapsed[q.id];
    const ansBanner = `<div class="ans-banner ${correct?'':'wrong-ans'}">${correct?'回答正确':'回答错误'} · 正确答案 ${esc(q.answer)}</div>`;
    let bodyHtml = '';
    if (!collapsed) {
      const items = splitAnalysis(q.analysis, q.answer);
      const itemsHtml = items.length ? items.map(it => {
        const letterHtml = it.letters ? `<span class="it-letter">${esc(it.letters)}</span>` : '';
        const cls = it.verdict === '错误' ? 'it-bad' : 'it-ok';
        return `<div class="item ${cls}">${letterHtml}${highlightKw(it.text)}</div>`;
      }).join('') : `<div>${highlightKw(q.analysis || '')}</div>`;
      bodyHtml = itemsHtml;
    }
    analysisHtml = `
      <div class="analysis">
        ${ansBanner}
        ${bodyHtml}
        <button class="analysis-toggle" onclick="toggleAnalysis('${q.id}')">${collapsed?'展开解析':'收起解析'}</button>
      </div>
      ${!correct ? `
      <div style="margin-top:14px"><div style="font-size:13px;color:var(--text-2);margin-bottom:6px">这道题做错的原因是？（可选）</div>
      <div class="err-reasons">${ERR_REASONS.map(r => `<button class="${rs.includes(r)?'on':''}" onclick="markReason('${q.id}','${r}')">${r}</button>`).join('')}</div></div>` : ''}
      <div class="bottombar"><button class="btn" onclick="quizNext()">${quiz.idx === quiz.qs.length-1 ? '查看结果' : '下一题'}</button></div>`;
  }

  const tagId = getTag(q);
  const tagHtml = `
    <div class="q-tags">
      <button class="q-type-tag ${tagCls(tagId)}" onclick="switchTag('${q.id}')">${tagName(tagId)}<span class="swap">切换</span></button>
    </div>`;

  // 顶部题号进度条（统一判分模式显示）
  const progressBar = !quiz.instant
    ? `<div class="exam-progress" style="margin:4px 0 12px"><div style="width:${quiz.results.length/quiz.qs.length*100}%"></div></div>
       <div style="font-size:12px;color:var(--text-3);margin-bottom:6px">已作答 ${quiz.results.length}/${quiz.qs.length} 题</div>`
    : '';

  // 底部栏：即时判分 vs 统一判分
  let bottomHtml;
  if (analysisHtml) {
    bottomHtml = analysisHtml; // 即时判分已作答：显示解析 + 下一题
  } else if (!quiz.instant) {
    // 统一判分：底部放上一题 / 下一题 / 提交判分
    const isLast = quiz.idx === quiz.qs.length - 1;
    bottomHtml = `<div class="bottombar">
      <button class="btn ghost" onclick="practicePrev()" ${quiz.idx===0?'disabled':''}>上一题</button>
      ${isMulti
        ? `<button class="btn" onclick="confirmMulti()">确认本题</button>`
        : ''}
      <button class="btn" onclick="practiceNext()">${isLast ? '完成作答' : '下一题'}</button>
    </div>
    <div class="submit-hint">全部答完点击「完成作答」统一判分</div>`;
  } else {
    // 即时判分未作答
    bottomHtml = `<div class="bottombar">${isMulti
      ? `<button class="btn" id="confirmBtn" onclick="confirmMulti()">确认（可多选）</button>`
      : `<span style="font-size:13px;color:var(--text-3);align-self:center">点击选项作答</span>`}</div>`;
  }

  app.innerHTML = `
  <div class="topbar"><button class="back" onclick="back()">‹</button>
    <h1>第 ${paperOf(q.id).id} 套 · 第 ${q.num} 题（${isMulti?'多选':'单选'}）</h1>
    <span style="font-size:13px;opacity:.9">${quiz.idx+1}/${quiz.qs.length}</span></div>
  <div class="page">
    ${tagHtml}
    <div class="q-meta" style="opacity:.6"><span class="tag" style="background:transparent;color:var(--text-3);padding-left:0">${esc(q.subject)}</span>
      ${a?.times?`<span style="font-size:11px;color:var(--text-3)">· 刷 ${a.times} 次</span>`:''}</div>
    ${progressBar}
    <div class="q-stem">${esc(q.stem)}</div>
    ${optsHtml}
    ${bottomHtml}
  </div>`;
}

/* 统一判分模式导航 */
function practicePrev() {
  if (quiz.idx > 0) { quiz.idx--; renderQuiz(); window.scrollTo(0, 0); }
}
function practiceNext() {
  // 若当前题已选择，保存；未选择则跳过或提示
  const q = quiz.qs[quiz.idx];
  const picked = (quiz.toggled || []).sort().join('');
  if (picked && !quiz.results.find(r => r.qid === q.id)) {
    quiz.results.push({ qid: q.id, picked, correct: null });
  }
  quiz.toggled = null;
  if (quiz.idx < quiz.qs.length - 1) { quiz.idx++; renderQuiz(); window.scrollTo(0, 0); }
  else { submitAll(); }
}
/* 统一判分：提交全部，逐题判分 */
function submitAll() {
  if (!quiz.results.length) { toast('尚未作答任何题目'); return; }
  // 逐题判分
  const graded = quiz.results.map(r => {
    const q = qById(r.qid);
    const correct = r.picked === q.answer;
    return { ...r, correct };
  });
  // 写入 P.answers 记录
  for (const r of graded) {
    const q = qById(r.qid);
    const a = P.answers[q.id] || { times: 0, wrongTimes: 0, reasons: [], mastered: false };
    a.times++; if (!r.correct) { a.wrongTimes++; if (!a.reasons.length) a.reasons = ['知识遗漏']; }
    else if (r.correct && a.times >= 3 && (a.times - a.wrongTimes) / a.times >= 0.8) a.mastered = true;
    a.picked = r.picked; a.correct = r.correct; a.lastTs = Date.now();
    P.answers[q.id] = a;
  }
  save();
  quiz.results = graded;
  quiz.submitted = true;
  // 记录会话
  if (graded.length >= 5) {
    P.sessions.push({ ts: Date.now(), paper: quiz.pid || '练习', type: quiz.mode,
      total: graded.length, correct: graded.filter(r => r.correct).length });
    if (P.sessions.length > 100) P.sessions = P.sessions.slice(-100);
    save();
  }
  state = { view: 'quizResult' }; render();
}

/* 背题模式导航：纯浏览，不判分 */
function recitePrev() {
  if (quiz.idx > 0) { quiz.idx--; renderQuiz(); window.scrollTo(0, 0); }
}
function reciteNext() {
  if (quiz.idx < quiz.qs.length - 1) { quiz.idx++; renderQuiz(); window.scrollTo(0, 0); }
  else { state = { view: 'home' }; navStack = []; render(); }
}

/* 题型标签切换 */
function switchTag(qid) {
  const q = qById(qid) || bigById(qid);
  if (!q) return;
  const cur = getTag(q);
  const isBig = Array.isArray(q.questions);
  const list = QTYPE_TAGS.filter(t => t.id !== 'big' || isBig).map(t =>
    `<button class="${t.id===cur?'on':''}" onclick="setTag('${qid}','${t.id}')">${t.name}</button>`).join('');
  openModal(`
    <div class="tag-switch-list">${list}</div>
    <button class="btn" style="margin-top:14px" onclick="clearTag('${qid}')">恢复自动识别</button>`, '切换题型标签');
}
function setTag(qid, tagId) {
  P.tags = P.tags || {};
  P.tags[qid] = tagId; save();
  closeModal(); render();
}
function clearTag(qid) {
  P.tags = P.tags || {};
  delete P.tags[qid]; save();
  closeModal(); render();
}

/* 解析展开/收起 */
function toggleAnalysis(qid) {
  P._analysisCollapsed = P._analysisCollapsed || {};
  P._analysisCollapsed[qid] = !P._analysisCollapsed[qid];
  renderQuiz();
}

function pickOpt(L) {
  const cur = quiz.results.find(r => r.qid === quiz.qs[quiz.idx].id);
  if (cur && cur.correct !== null) return; // 已判分不可改
  const q = quiz.qs[quiz.idx];
  if (q.type === 'multi') {
    if (!quiz.toggled) {
      const saved = quiz.results.find(r => r.qid === q.id);
      quiz.toggled = saved && saved.picked ? saved.picked.split('') : [];
    }
    const i = quiz.toggled.indexOf(L);
    if (i >= 0) quiz.toggled.splice(i, 1); else quiz.toggled.push(L);
    renderQuiz();
  } else {
    if (quiz.instant) {
      submitAnswer([L]);
    } else {
      // 统一判分模式：记录选择，进入下一题
      quiz.toggled = [L];
      commitPick();
    }
  }
}
function confirmMulti() {
  if (!quiz.toggled || !quiz.toggled.length) { toast('请先选择选项'); return; }
  if (quiz.instant) {
    submitAnswer([...quiz.toggled].sort());
  } else {
    commitPick();
  }
}
/* 统一判分模式：把当前选择存入 results（不判对错），进入下一题 */
function commitPick() {
  const q = quiz.qs[quiz.idx];
  const picked = (quiz.toggled || []).sort().join('');
  if (!picked) { toast('请先选择选项'); return; }
  // 覆盖式记录（允许返回修改）
  const idx = quiz.results.findIndex(r => r.qid === q.id);
  if (idx >= 0) quiz.results[idx] = { qid: q.id, picked, correct: null };
  else quiz.results.push({ qid: q.id, picked, correct: null });
  quiz.toggled = null;
  if (quiz.idx < quiz.qs.length - 1) { quiz.idx++; renderQuiz(); window.scrollTo(0, 0); }
  else renderQuiz();
}
function submitAnswer(picked) {
  const q = quiz.qs[quiz.idx];
  const correct = picked.join('') === q.answer;
  quiz.results.push({ qid: q.id, picked: picked.join(''), correct });
  // 记录
  const a = P.answers[q.id] || { times: 0, wrongTimes: 0, reasons: [], mastered: false };
  a.times++; if (!correct) { a.wrongTimes++; if (!a.reasons.length) a.reasons = ['知识遗漏']; }
  else if (correct && a.times >= 3 && (a.times - a.wrongTimes) / a.times >= 0.8) a.mastered = true;
  a.picked = picked.join(''); a.correct = correct; a.lastTs = Date.now();
  P.answers[q.id] = a; save();
  quiz.toggled = null;
  renderQuiz();
}
function markReason(qid, r) {
  const a = P.answers[qid]; if (!a) return;
  const i = a.reasons.indexOf(r);
  if (i >= 0) a.reasons.splice(i, 1); else a.reasons.push(r);
  save(); renderQuiz();
}
function quizNext() {
  if (quiz.idx < quiz.qs.length - 1) { quiz.idx++; renderQuiz(); window.scrollTo(0,0); }
  else {
    if (quiz.results.length >= 5) {
      P.sessions.push({ ts: Date.now(), paper: quiz.pid || '错题', type: quiz.mode,
        total: quiz.results.length, correct: quiz.results.filter(r => r.correct).length });
      if (P.sessions.length > 100) P.sessions = P.sessions.slice(-100);
      save();
    }
    state = { view: 'quizResult' }; render();
  }
}

/* ---------- 结果页 ---------- */
function renderQuizResult() {
  const n = quiz.results.length;
  const c = quiz.results.filter(r => r.correct).length;
  const score = Math.round(c / n * 100);
  const cls = score >= 80 ? '' : score >= 60 ? 'mid' : 'bad';
  const wrongs = quiz.results.filter(r => !r.correct);
  app.innerHTML = `
  <div class="topbar"><h1>练习结果</h1></div>
  <div class="page">
    <div class="score-circle ${cls}"><div class="s">${c}/${n}</div><div class="t">正确率 ${score}%</div></div>
    ${wrongs.length ? `<div class="card"><h2>本次错题（${wrongs.length}）</h2>
      ${wrongs.map(r => { const q = qById(r.qid); return `<button class="list-item" style="margin-bottom:8px" onclick="goQuestion('${r.qid}')">
        <div style="flex:1;font-size:14px">第 ${paperOf(r.qid).id} 套 · ${q.num} 题 · ${esc(q.subject)}</div>
        <span class="badge">›</span></button>`; }).join('')}
    </div>` : `<div class="card" style="text-align:center;color:var(--ok);font-weight:600">全部正确</div>`}
    <button class="btn" onclick="state={view:'home'};navStack=[];render()">返回首页</button>
    ${wrongs.length ? `<button class="btn ghost" onclick="retryWrong()">立即重练错题</button>` : ''}
  </div>`;
}
function retryWrong() {
  const wrongQids = quiz.results.filter(r => !r.correct).map(r => r.qid).map(qById);
  quiz = { qs: wrongQids, idx: 0, mode: 'retry', results: [], instant: true, toggled: null };
  state = { view: 'quiz' }; navStack = [{ view: 'home' }];
  render();
}
function goQuestion(qid) {
  quiz = { qs: [qById(qid)], idx: 0, mode: 'single', results: [], instant: true, toggled: null };
  state = { view: 'quiz' }; render();
}

/* ---------- 错题本 ---------- */
function renderWrong() {
  const all = DB.papers.flatMap(qAll).filter(q => mastery(q.id) === 1 || mastery(q.id) === 2);
  const n1 = all.filter(q => mastery(q.id) === 1).length;
  app.innerHTML = `
  <div class="topbar"><button class="back" onclick="back()">‹</button><h1>错题本（${all.length}）</h1></div>
  <div class="page">
    ${all.length ? `<button class="btn" onclick="wrongReplay()">重练全部错题（${n1}）</button>` : ''}
    ${all.length ? all.map(q => {
      const a = P.answers[q.id], m = mastery(q.id);
      return `<button class="list-item" onclick="goQuestion('${q.id}')">
        <span class="m-dot m-${m}"></span>
        <div style="flex:1"><div style="font-size:14px">第 ${paperOf(q.id).id} 套 · ${q.num} 题 · ${esc(q.subject)}</div>
        <div style="font-size:12px;color:var(--text-2);margin-top:3px">刷 ${a.times} 次 · 错 ${a.wrongTimes||0} 次${a.reasons.length?' · '+a.reasons.join('/'):''}</div></div>
        <span class="badge">${m===2?'模糊':'错题'} ›</span></button>`;
    }).join('') : `<div class="card" style="text-align:center;color:var(--text-2)">暂无错题，继续保持</div>`}
  </div>`;
}
function wrongReplay() {
  startQuiz(0, 'wrongAll'); // startQuiz(0,...) 忽略 pid
}

/* ---------- 统计 ---------- */
function renderStats() {
  const allQ = DB.papers.flatMap(qAll);
  // 知识点正确率
  const bySubject = {};
  for (const q of allQ) {
    const a = P.answers[q.id]; if (!a?.times) continue;
    const s = bySubject[q.subject] = bySubject[q.subject] || { t: 0, c: 0, qs: new Set() };
    s.t += a.times; s.c += a.times - (a.wrongTimes || 0); s.qs.add(q.id);
  }
  // 错因分布
  const byReason = {};
  for (const q of allQ) {
    const a = P.answers[q.id];
    if (a?.wrongTimes && a.reasons?.length) for (const r of a.reasons) byReason[r] = (byReason[r] || 0) + 1;
  }
  const maxR = Math.max(1, ...Object.values(byReason));
  // 掌握分布
  const dist = [0,0,0,0];
  for (const q of allQ) dist[mastery(q.id)]++;
  // 近期趋势
  const sess = P.sessions.slice(-10);
  app.innerHTML = `
  <div class="topbar"><button class="back" onclick="back()">‹</button><h1>统计分析</h1></div>
  <div class="page">
    <div class="card"><h2>掌握状态分布（选择题）</h2>
      ${dist.map((n, i) => `<div class="bar-row"><div class="bl">${['未做过','错题','做过未掌握','已掌握'][i]}</div>
        <div class="bar"><div style="width:${allQ.length?n/allQ.length*100:0}%;background:${['var(--border)','var(--danger)','var(--warn)','var(--ok)'][i]}"></div></div>
        <div class="bv">${n}</div></div>`).join('')}
    </div>
    <div class="card"><h2>分科正确率</h2>
      ${SUBJECTS.map(s => { const d = bySubject[s]; if (!d) return '';
        return `<div class="bar-row"><div class="bl">${s}</div>
        <div class="bar"><div style="width:${d.c/d.t*100}%;background:var(--primary)"></div></div>
        <div class="bv">${Math.round(d.c/d.t*100)}%</div></div>`; }).join('') || '<div style="color:var(--text-3);font-size:13px">暂无数据</div>'}
    </div>
    <div class="card"><h2>错误原因分布</h2>
      ${Object.keys(byReason).length ? Object.entries(byReason).map(([r, n]) =>
        `<div class="bar-row"><div class="bl">${r}</div><div class="bar"><div style="width:${n/maxR*100}%;background:var(--danger)"></div></div><div class="bv">${n}</div></div>`).join('')
        : '<div style="color:var(--text-3);font-size:13px">暂无错因记录</div>'}
    </div>
    <div class="card"><h2>练习记录</h2>
      ${sess.length ? sess.map(s => `<div style="display:flex;font-size:13px;padding:6px 0;border-bottom:1px solid var(--border)">
        <span style="flex:1">${fmtDate(s.ts)} · 第 ${s.paper||'-'} 套</span>
        <span style="color:${s.correct/s.total>=0.7?'var(--ok)':'var(--danger)'}">${s.correct}/${s.total}</span></div>`).join('')
        : '<div style="color:var(--text-3);font-size:13px">暂无练习记录</div>'}
    </div>
  </div>`;
}

/* ---------- 全部题目 ---------- */
function renderAllQ() {
  const rows = DB.papers.map(p => {
    const qs = qAll(p);
    return `<div class="card"><h2>第 ${p.id} 套</h2>${qs.map(q => {
      const m = mastery(q.id), a = P.answers[q.id];
      return `<button class="list-item" style="margin-bottom:8px;padding:10px" onclick="goQuestion('${q.id}')">
        <span class="m-dot m-${m}"></span>
        <div style="flex:1;font-size:13px">${q.num}. ${esc(q.stem.slice(0, 22))}…</div>
        <span class="badge">${a?.times ? `${a.times}次` : '未做'}</span></button>`;
    }).join('')}</div>`;
  }).join('');
  app.innerHTML = `
  <div class="topbar"><button class="back" onclick="back()">‹</button><h1>全部题目</h1>
  <span style="font-size:12px;opacity:.9">●未做 ●错 ●模糊 ●掌握</span></div>
  <div class="page">${rows}</div>`;
}

/* ---------- 大题 ---------- */
/* 三层分层：思路 / 知识点 / 完整答案 */
function bigLayers(b, sub) {
  const full = (sub.answer || sub.hints?.join('\n') || '').trim();
  // 第二层【调用知识点】：从答案里抽取含原理关键词的句子
  const PRINCIPLE_KW = ['是', '本质', '规律', '原理', '决定', '反作用', '统一', '矛盾', '发展', '联系', '生产力', '生产关系', '经济基础', '上层建筑', '物质', '意识', '实践', '认识', '真理', '价值', '社会存在', '社会意识', '人民群众', '必然', '自由', '量变', '质变', '否定', '内因', '外因', '普遍', '特殊', '主要', '次要'];
  const knowledgeSentences = [];
  const sentences = full.split(/[。；\n]/).map(s => s.trim()).filter(s => s.length > 8);
  for (const s of sentences) {
    if (PRINCIPLE_KW.some(k => s.includes(k)) && /是|决定|反作用|规律|统一|本质/.test(s)) {
      if (!knowledgeSentences.includes(s)) knowledgeSentences.push(s);
    }
  }
  // 第一层【答题思路】：从答案里抽"第一/第二/第三"或"首先/其次"分点 + 关键句
  const thoughtPoints = [];
  const parts = full.split(/[。；\n]/).map(s => s.trim()).filter(s => s.length > 4);
  for (const s of parts) {
    if (/^(第一|第二|第三|第四|首先|其次|再次|最后|一方面|另一方面|一是|二是|三是|一要|二要|三要)/.test(s)) {
      thoughtPoints.push(s);
    }
  }
  // 若没有明确分点，用前几句作为思路框架
  if (!thoughtPoints.length) {
    thoughtPoints.push(...sentences.slice(0, 2).map(s => s.length > 40 ? s.slice(0, 40) + '…' : s));
  }
  const knowledge = knowledgeSentences.length ? knowledgeSentences : (sentences.slice(0, 3));
  return { thought: thoughtPoints.slice(0, 4), knowledge: knowledge.slice(0, 5), full };
}

function renderBig() {
  const b = bigById(state.bid);
  if (!b) return renderHome();
  const st = P.bigStatus[b.id] = P.bigStatus[b.id] || { viewed: 0, revealed: [] };
  if (!st._counted) { st.viewed++; st.lastTs = Date.now(); st._counted = true; save(); }
  const rv = st.revealed = st.revealed || [];
  const tagId = getTag(b);
  app.innerHTML = `
  <div class="topbar"><button class="back" onclick="back()">‹</button><h1>第 ${paperOf(b.id)?.id || ''} 套 · 第 ${b.num} 题 · ${esc(b.subject)}</h1></div>
  <div class="page">
    <div class="q-tags"><button class="q-type-tag ${tagCls(tagId)}" onclick="switchTag('${b.id}')">${tagName(tagId)}<span class="swap">切换</span></button></div>
    <div class="q-meta" style="opacity:.6"><span class="tag" style="background:transparent;color:var(--text-3);padding-left:0">已学 ${st.viewed} 次</span><span class="tag" style="background:transparent;color:var(--text-3)">10 分</span></div>
    <div class="card"><h2>题干与材料</h2><div class="big-material">${esc(b.stem)}</div></div>
    <div class="card"><h2>问题</h2>
      ${b.questions.map((q, qi) => `<div class="big-q">（${qi+1}）${esc(q.q)}</div>`).join('')}
    </div>
    <div class="card"><h2>分层解析</h2>
      <button class="btn small ghost" style="margin-bottom:12px" onclick="bigRevealAll('${b.id}')">一键展开全部</button>
      ${b.questions.map((q, qi) => {
        const L = bigLayers(b, q);
        const layerKeys = [`${qi}-thought`, `${qi}-know`, `${qi}-full`];
        const layerDefs = [
          { key: layerKeys[0], title: '答题思路', hint: '从哪几个角度作答', body: L.thought.map(t => `· ${t}`).join('\n') },
          { key: layerKeys[1], title: '调用知识点', hint: '课本考点 · 原理', body: L.knowledge.map(t => `· ${t}`).join('\n') },
          { key: layerKeys[2], title: '完整参考答案', hint: '最终答案', body: L.full }
        ];
        return `<div style="margin-bottom:6px"><div style="font-size:14px;font-weight:700;color:var(--text-2);margin:14px 0 8px">第 ${qi+1} 问 · ${esc(q.q.slice(0,30))}</div>
        ${layerDefs.map((ld, li) => {
          const shown = rv.includes(ld.key);
          return `<div class="layer-block ${shown?'open':''}">
            <button class="layer-head ${shown?'open':''}" onclick="toggleLayer('${b.id}','${ld.key}')">
              <span class="l-step">${li+1}</span>
              <span class="l-title">【${ld.title}】</span>
              <span class="l-hint">${ld.hint}</span>
              <span class="l-arrow">›</span>
            </button>
            <div class="layer-body">${shown ? highlightKw(ld.body) : ''}</div>
          </div>`;
        }).join('')}</div>`;
      }).join('')}
    </div>
    <button class="btn ghost" onclick="resetBig('${b.id}')">重新学习（重置揭示状态）</button>
  </div>`;
}
function toggleLayer(bid, key) {
  const st = P.bigStatus[bid];
  const i = st.revealed.indexOf(key);
  if (i >= 0) st.revealed.splice(i, 1); else st.revealed.push(key);
  save(); renderBig();
}
function bigRevealAll(bid) {
  const st = P.bigStatus[bid];
  const b = bigById(bid);
  b.questions.forEach((q, qi) => {
    ['thought', 'know', 'full'].forEach(k => {
      const key = `${qi}-${k}`;
      if (!st.revealed.includes(key)) st.revealed.push(key);
    });
  });
  save(); renderBig();
}
function resetBig(bid) {
  const st = P.bigStatus[bid];
  st.revealed = []; st.revealedAll = false; st.viewed = 0; st._counted = true; st.lastTs = Date.now();
  save(); toast('已重置'); renderBig();
}

/* ---------- 一键添加到桌面（PWA 安装引导） ---------- */
let PWA_PROMPT = null;
try {
  window.addEventListener('beforeinstallprompt', e => { e.preventDefault(); PWA_PROMPT = e; });
  window.addEventListener('appinstalled', () => { PWA_PROMPT = null; toast('已安装，桌面图标就绪'); });
} catch (e) {}

function isStandalone() {
  try {
    return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches)
      || window.navigator.standalone === true;
  } catch (e) { return false; }
}
function isIOS() {
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && 'ontouchstart' in window);
}
function isWechat() { return /MicroMessenger/i.test(navigator.userAgent || ''); }

function openModal(html, title) {
  const m = document.createElement('div');
  m.className = 'modal-mask';
  m.innerHTML = `<div class="modal"><h3>${title || '提示'}</h3>${html}</div>`;
  m.addEventListener('click', e => { if (e.target === m) m.remove(); });
  document.body.appendChild(m);
}
function closeModal() {
  const m = document.querySelector('.modal-mask');
  if (m) m.remove();
}

function installApp() {
  if (isStandalone()) { toast('已经在桌面模式打开'); return; }
  // 安卓 / 鸿蒙 / 桌面 Chrome：能弹原生安装框
  if (PWA_PROMPT) {
    PWA_PROMPT.prompt();
    PWA_PROMPT.userChoice.then(r => {
      if (r.outcome === 'accepted') toast('安装成功，桌面图标就绪');
      PWA_PROMPT = null;
    }).catch(() => {});
    return;
  }
  // 微信内打开：提示跳转到浏览器
  if (isWechat()) {
    openModal(`
      <p style="font-size:14px;color:var(--text-2)">微信内置浏览器没有「添加到桌面」选项，需要先跳出去：</p>
      <div class="install-step"><div class="is-num">1</div><div class="is-txt">点右上角 <b>···</b></div></div>
      <div class="install-step"><div class="is-num">2</div><div class="is-txt">选 <b>在浏览器打开</b>（建议 Safari）</div></div>
      <div class="install-step"><div class="is-num">3</div><div class="is-txt">打开后按下方对应系统操作</div></div>
      <button class="btn" style="margin:12px 0 0" onclick="closeModal()">知道了</button>`, '添加到桌面');
    return;
  }
  // iOS：分步图文引导
  if (isIOS()) {
    openModal(`
      <p style="font-size:14px;color:var(--text-2)">iPhone / iPad 需手动添加，共 4 步：</p>
      <div class="install-step"><div class="is-num">1</div><div class="is-txt">确认用 <b>Safari</b> 打开（不是微信）</div></div>
      <div class="install-step"><div class="is-num">2</div><div class="is-txt">点屏幕底部的 <b>分享</b> 图标（方框带向上箭头 ↑）</div></div>
      <div class="install-step"><div class="is-num">3</div><div class="is-txt">菜单往下滑，找 <b>添加到主屏幕</b></div></div>
      <div class="install-step"><div class="is-num">4</div><div class="is-txt">点右上角 <b>添加</b>，桌面就有图标了</div></div>
      <button class="btn" style="margin:12px 0 0" onclick="closeModal()">知道了</button>`, '添加到桌面');
    return;
  }
  // 其他浏览器：通用引导
  openModal(`
    <p style="font-size:14px;color:var(--text-2)">请通过浏览器菜单添加：</p>
    <div class="install-step"><div class="is-num">1</div><div class="is-txt">点浏览器右上角 <b>菜单</b>（··· 或 ☰）</div></div>
    <div class="install-step"><div class="is-num">2</div><div class="is-txt">找 <b>安装应用</b> 或 <b>添加到主屏幕</b></div></div>
    <button class="btn" style="margin:12px 0 0" onclick="closeModal()">知道了</button>`, '添加到桌面');
}

/* ---------- 渲染入口 ---------- */
const views = { home: renderHome, papers: renderPapers, paper: renderPaper, quiz: renderQuiz,
  quizResult: renderQuizResult, wrong: renderWrong, stats: renderStats, allq: renderAllQ, big: renderBig,
  mode: renderMode, exam: renderExam, examResult: renderExamResult };
function render() { (views[state.view] || renderHome)(); }
window.go = go; window.back = back; window.startQuiz = startQuiz; window.pickOpt = pickOpt;
window.confirmMulti = confirmMulti; window.quizNext = quizNext; window.markReason = markReason;
window.retryWrong = retryWrong; window.goQuestion = goQuestion; window.wrongReplay = wrongReplay;
window.toggleLayer = toggleLayer; window.bigRevealAll = bigRevealAll; window.resetBig = resetBig;
window.switchTag = switchTag; window.setTag = setTag; window.clearTag = clearTag;
window.toggleAnalysis = toggleAnalysis;
window.recitePrev = recitePrev; window.reciteNext = reciteNext; window.installApp = installApp;
window.closeModal = closeModal;
window.modePick = modePick; window.setInstant = setInstant;
window.toggleWithBig = toggleWithBig; window.setDuration = setDuration;
window.startExam = startExam; window.startSmart = startSmart;
window.examPick = examPick; window.examJump = examJump; window.examPrev = examPrev;
window.examNext = examNext; window.examFlag = examFlag; window.examExit = examExit;
window.examSubmit = examSubmit; window.abortExam = abortExam; window.doGrade = doGrade;
window.examReview = examReview; window.practicePrev = practicePrev; window.practiceNext = practiceNext;
window.state = state; Object.defineProperty(window, 'state', { get: () => state });

fetch('data/questions.json').then(r => r.json()).then(d => {
  DB = d; render();
}).catch(e => {
  app.innerHTML = '<div style="padding:40px;text-align:center;color:#666">题目数据加载失败：' + esc(e.message) + '</div>';
});

/* 注册 Service Worker，实现离线缓存 */
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  });
}
