/* 肖八刷题 SPA */
const $ = sel => document.querySelector(sel);
const app = $('#app');

/* ---------- 数据 ---------- */
let DB = null; // {papers:[{id, singles:[], multis:[], bigs:[]}]}

const SUBJECTS = ['马原','毛中特','习思想','史纲','思修法基','时政'];

const ERR_REASONS = ['知识遗漏','审题偏差','干扰项迷惑','记忆模糊','粗心失误'];

const STORE_KEY = 'xiao8_progress_v1';

function defaultProgress() {
  return {
    // answers[qid] = { picked:'A', correct:true/false, times:n, wrongTimes:n, lastTs, reasons:[], mastered:0 }
    answers: {},
    bigStatus: {},      // bigId -> { viewed:n, revealedAll:false, lastTs }
    sessions: [],       // {ts, paper, type, total, correct}
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
function paperOf(qid) { return DB.papers.find(p => qAll(p).some(x => x.id === qid)); }
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
function startQuiz(pid, mode) {
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
  quiz = { qs, idx: 0, mode, pid, results: [] };
  state = { view: 'quiz' }; navStack = [{ view: 'paper', pid }];
  render();
}

function renderQuiz() {
  const q = quiz.qs[quiz.idx];
  const a = P.answers[q.id];
  const isMulti = q.type === 'multi';
  const doneThis = quiz.results.find(r => r.qid === q.id);
  const isRecite = quiz.mode === 'recite';

  // 背题模式：纯浏览题干 + 答案 + 解析，不判分，翻页记忆
  if (isRecite) {
    app.innerHTML = `
    <div class="topbar"><button class="back" onclick="back()">‹</button>
      <h1>背题 · 第 ${paperOf(q.id).id} 套 · 第 ${q.num} 题（${isMulti?'多选':'单选'}）</h1>
      <span style="font-size:13px;opacity:.9">${quiz.idx+1}/${quiz.qs.length}</span></div>
    <div class="page">
      <div class="q-meta"><span class="tag">${esc(q.subject)}</span>${q.knowledge?`<span class="tag" style="background:var(--warn-light);color:var(--warn)">${esc(q.knowledge)}</span>`:''}
        ${a?.times?`<span class="tag red">已刷 ${a.times} 次 · 错 ${a.wrongTimes||0} 次</span>`:''}</div>
      <div class="q-stem">${esc(q.stem)}</div>
      ${q.options.map((t, i) => {
        const L = 'ABCD'[i];
        const isAns = q.answer.includes(L);
        return `<div class="option" style="${isAns?'border-color:var(--ok);background:#e9f7ee;':''}${!isAns?'opacity:.72':''}">
          <span class="letter" style="${isAns?'color:var(--ok)':''}">${L}.</span><span>${esc(t)}</span>
          ${isAns?'<span class="tag" style="margin-left:auto;background:#e9f7ee;color:var(--ok);flex-shrink:0">正确</span>':''}
        </div>`;
      }).join('')}
      <div class="recite-answer">
        <div class="ra-title">答案与解析</div>
        <div class="ra-key">${esc(q.answer)}</div>
        <div class="ra-analysis">${esc(q.analysis || '')}</div>
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
    if (doneThis) {
      if (q.answer.includes(L)) cls += ' correct';
      if (doneThis.picked.includes(L) && !q.answer.includes(L)) cls += ' wrong';
      cls += ' disabled';
    } else if (isMulti && doneThis === undefined) {
      // multi: toggled
      if (quiz.toggled?.includes(L)) cls += ' selected';
    }
    return `<div class="${cls}" data-l="${L}" onclick="pickOpt('${L}')"><span class="letter">${L}.</span><span>${esc(t)}</span></div>`;
  }).join('');

  let analysisHtml = '';
  if (doneThis) {
    const rs = a?.reasons || [];
    analysisHtml = `
      <div class="analysis"><div class="title">${q.answer.includes(doneThis.picked) && doneThis.picked === q.answer ? '回答正确' : '回答错误 · 正确答案 ' + q.answer}</div>
      <div>${esc(q.analysis || '')}</div></div>
      ${!doneThis.correct ? `
      <div style="margin-top:12px"><div style="font-size:13px;color:var(--text-2);margin-bottom:6px">这道题做错的原因是？（可选）</div>
      <div class="err-reasons">${ERR_REASONS.map(r => `<button class="${rs.includes(r)?'on':''}" onclick="markReason('${q.id}','${r}')">${r}</button>`).join('')}</div></div>` : ''}
      <div class="bottombar"><button class="btn" onclick="quizNext()">${quiz.idx === quiz.qs.length-1 ? '查看结果' : '下一题'}</button></div>`;
  }

  app.innerHTML = `
  <div class="topbar"><button class="back" onclick="back()">‹</button>
    <h1>第 ${paperOf(q.id).id} 套 · 第 ${q.num} 题（${isMulti?'多选':'单选'}）</h1>
    <span style="font-size:13px;opacity:.9">${quiz.idx+1}/${quiz.qs.length}</span></div>
  <div class="page">
    <div class="q-meta"><span class="tag">${esc(q.subject)}</span>${q.knowledge?`<span class="tag" style="background:var(--warn-light);color:var(--warn)">${esc(q.knowledge)}</span>`:''}
      ${a?.times?`<span class="tag red">刷过 ${a.times} 次 · 错 ${a.wrongTimes||0} 次</span>`:''}</div>
    <div class="q-stem">${esc(q.stem)}</div>
    ${optsHtml}
    ${analysisHtml || `<div class="bottombar">${isMulti
      ? `<button class="btn" id="confirmBtn" onclick="confirmMulti()">确认（可多选）</button>`
      : `<span style="font-size:13px;color:var(--text-3);align-self:center">点击选项作答</span>`}</div>`}
  </div>`;
}

/* 背题模式导航：纯浏览，不判分 */
function recitePrev() {
  if (quiz.idx > 0) { quiz.idx--; renderQuiz(); window.scrollTo(0, 0); }
}
function reciteNext() {
  if (quiz.idx < quiz.qs.length - 1) { quiz.idx++; renderQuiz(); window.scrollTo(0, 0); }
  else { state = { view: 'home' }; navStack = []; render(); }
}

function pickOpt(L) {
  if (quiz.results.find(r => r.qid === quiz.qs[quiz.idx].id)) return;
  const q = quiz.qs[quiz.idx];
  if (q.type === 'multi') {
    quiz.toggled = quiz.toggled || [];
    const i = quiz.toggled.indexOf(L);
    if (i >= 0) quiz.toggled.splice(i, 1); else quiz.toggled.push(L);
    renderQuiz();
  } else {
    submitAnswer([L]);
  }
}
function confirmMulti() {
  if (!quiz.toggled || !quiz.toggled.length) { toast('请先选择选项'); return; }
  submitAnswer([...quiz.toggled].sort());
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
  quiz = { qs: wrongQids, idx: 0, mode: 'retry', results: [] };
  state = { view: 'quiz' }; navStack = [{ view: 'home' }];
  render();
}
function goQuestion(qid) {
  quiz = { qs: [qById(qid)], idx: 0, mode: 'single', results: [] };
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
function renderBig() {
  const b = bigById(state.bid);
  if (!b) return renderHome();
  const st = P.bigStatus[b.id] = P.bigStatus[b.id] || { viewed: 0, revealed: [] };
  if (!st._counted) { st.viewed++; st.lastTs = Date.now(); st._counted = true; save(); }
  const rv = st.revealed = st.revealed || [];
  app.innerHTML = `
  <div class="topbar"><button class="back" onclick="back()">‹</button><h1>第 ${paperOf(b.id)?.id || ''} 套 · 第 ${b.num} 题 · ${esc(b.subject)}</h1></div>
  <div class="page">
    <div class="q-meta"><span class="tag">已学 ${st.viewed} 次</span><span class="tag orange">10 分</span></div>
    <div class="card"><h2>题干与材料</h2><div class="big-material">${esc(b.stem)}</div></div>
    <div class="card"><h2>问题</h2>
      ${b.questions.map((q, qi) => `<div class="big-q">（${qi+1}）${esc(q.q)}</div>`).join('')}
    </div>
    <div class="card"><h2>答案 · 分步揭示</h2>
      ${b.questions.map((q, qi) => {
        const steps = q.hints && q.hints.length ? q.hints : [q.answer];
        return steps.map((s, si) => {
          const key = `${qi}-${si}`;
          const shown = rv.includes(key);
          return shown
            ? `<div class="hint-block"><b>步骤 ${si+1}：</b>${esc(s)}</div>`
            : `<button class="hint-btn" onclick="reveal('${b.id}','${key}')">点击显示 · 第 ${qi+1} 问步骤 ${si+1}</button>`;
        }).join('') + `<div style="height:6px"></div>`;
      }).join('')}
      ${b.analysis ? `<div><button class="hint-btn" style="border-color:var(--primary);color:var(--primary)" onclick="revealAll('${b.id}',${b.questions.length})">展开完整解析</button>
      ${rv.includes('full') ? `<div class="analysis"><div class="title">完整解析</div><div style="white-space:pre-wrap">${esc(b.analysis)}</div></div>` : ''}</div>` : ''}
    </div>
    <button class="btn ghost" onclick="resetBig('${b.id}')">重新学习（重置揭示状态）</button>
  </div>`;
}
function reveal(bid, key) {
  const st = P.bigStatus[bid]; st.revealed.push(key); save(); renderBig();
}
function revealAll(bid, n) {
  const st = P.bigStatus[bid];
  if (!st.revealed.includes('full')) st.revealed.push('full');
  st.revealedAll = true; st.lastTs = Date.now(); save(); renderBig();
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
  quizResult: renderQuizResult, wrong: renderWrong, stats: renderStats, allq: renderAllQ, big: renderBig };
function render() { (views[state.view] || renderHome)(); }
window.go = go; window.back = back; window.startQuiz = startQuiz; window.pickOpt = pickOpt;
window.confirmMulti = confirmMulti; window.quizNext = quizNext; window.markReason = markReason;
window.retryWrong = retryWrong; window.goQuestion = goQuestion; window.wrongReplay = wrongReplay;
window.reveal = reveal; window.revealAll = revealAll; window.resetBig = resetBig;
window.recitePrev = recitePrev; window.reciteNext = reciteNext; window.installApp = installApp;
window.closeModal = closeModal;
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
