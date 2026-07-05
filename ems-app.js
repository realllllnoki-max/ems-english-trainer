/* ================= STORAGE SHIM (localStorage) ================= */
window.storage = {
  get: async (k) => ({ value: localStorage.getItem(k) }),
  set: async (k, v) => { try{localStorage.setItem(k, v);}catch(e){} }
};

/* ================= JUICE: sound, haptics, confetti, XP toast ================= */
const FX = (() => {
  let ac = null, soundOn = true;
  try { soundOn = localStorage.getItem("ems_sound") !== "0"; } catch(e){}
  function ctx(){ if(!ac){ try{ ac = new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } return ac; }
  // 単音
  function tone(freq, t0, dur, type="sine", gain=0.18){
    const a = ctx(); if(!a) return;
    const o = a.createOscillator(), g = a.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, a.currentTime + t0);
    g.gain.setValueAtTime(0.0001, a.currentTime + t0);
    g.gain.exponentialRampToValueAtTime(gain, a.currentTime + t0 + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime + t0 + dur);
    o.connect(g); g.connect(a.destination);
    o.start(a.currentTime + t0); o.stop(a.currentTime + t0 + dur + 0.02);
  }
  function vibrate(p){ try{ if(navigator.vibrate) navigator.vibrate(p); }catch(e){} }
  return {
    get on(){ return soundOn; },
    toggle(){ soundOn = !soundOn; try{localStorage.setItem("ems_sound", soundOn?"1":"0");}catch(e){} return soundOn; },
    resume(){ const a=ctx(); if(a && a.state==="suspended") a.resume(); },
    tap(){ if(soundOn) tone(330,0,0.06,"triangle",0.10); vibrate(8); },
    correct(){ if(soundOn){ tone(660,0,0.10,"sine",0.16); tone(990,0.08,0.16,"sine",0.16); } vibrate([0,18]); },
    wrong(){ if(soundOn){ tone(196,0,0.16,"sawtooth",0.10); tone(150,0.10,0.20,"sawtooth",0.09); } vibrate([0,30,40,30]); },
    combo(n){ if(soundOn){ const base=520+Math.min(n,6)*70; tone(base,0,0.08,"sine",0.14); tone(base*1.5,0.07,0.12,"sine",0.13);} vibrate([0,12]); },
    fanfare(){ if(soundOn){ [523,659,784,1047].forEach((f,i)=>tone(f,i*0.11,0.22,"sine",0.16)); } vibrate([0,30,60,30,60,30]); },
    badge(){ if(soundOn){ [784,988,1319].forEach((f,i)=>tone(f,i*0.10,0.26,"triangle",0.15)); } vibrate([0,40,40,60]); },
    // 紙吹雪
    confetti(opts){
      const big = opts && opts.big;
      const N = big ? 90 : 46;
      const colors = ["#58cc02","#1cb0f6","#ffc800","#ff4b4b","#ce82ff","#46a302"];
      const wrap = document.createElement("div");
      wrap.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:300;overflow:hidden";
      document.body.appendChild(wrap);
      for(let i=0;i<N;i++){
        const p = document.createElement("i");
        const size = 7 + Math.random()*8;
        const left = Math.random()*100;
        const dur = 1100 + Math.random()*1200;
        const delay = Math.random()*250;
        const rot = (Math.random()*720-360);
        const round = Math.random()<0.5;
        p.style.cssText = `position:absolute;top:-24px;left:${left}vw;width:${size}px;height:${size*0.6}px;`
          + `background:${colors[i%colors.length]};border-radius:${round?"50%":"2px"};opacity:0;`
          + `transform:rotate(${Math.random()*360}deg)`;
        wrap.appendChild(p);
        p.animate([
          { transform:`translateY(-10px) rotate(0deg)`, opacity:1 },
          { transform:`translateY(${(big?92:80)}vh) rotate(${rot}deg)`, opacity:1, offset:0.85 },
          { transform:`translateY(102vh) rotate(${rot}deg)`, opacity:0 }
        ], { duration:dur, delay, easing:"cubic-bezier(.3,.6,.5,1)", fill:"forwards" });
      }
      setTimeout(()=>wrap.remove(), big?2700:2000);
    },
    // 画面中央に飛び出すXP/メッセージのトースト
    burst(text, color){
      const el = document.createElement("div");
      el.textContent = text;
      el.style.cssText = `position:fixed;left:50%;top:38%;transform:translate(-50%,-50%);z-index:320;`
        + `font-family:"Nunito","Noto Sans JP",sans-serif;font-weight:900;font-size:1.9rem;`
        + `color:${color||"#ffc800"};text-shadow:0 2px 0 rgba(0,0,0,.15);pointer-events:none;white-space:nowrap`;
      el.style.transform = "translate(-50%,-50%)";
      document.body.appendChild(el);
      el.animate([
        { transform:"translate(-50%,-30%) scale(.6)", opacity:0 },
        { transform:"translate(-50%,-50%) scale(1.12)", opacity:1, offset:0.3 },
        { transform:"translate(-50%,-62%) scale(1)", opacity:1, offset:0.7 },
        { transform:"translate(-50%,-90%) scale(.92)", opacity:0 }
      ], { duration:1200, easing:"cubic-bezier(.34,1.56,.64,1)", fill:"forwards" });
      setTimeout(()=>el.remove(), 1300);
    }
  };
})();
// 最初のユーザー操作でオーディオを起こす（自動再生制限対策）
["pointerdown","keydown","touchstart"].forEach(ev=>
  window.addEventListener(ev, ()=>FX.resume(), { once:false, passive:true }));

/* ================= ICONS ================= */
const I={
 spk:'<svg class="ic" viewBox="0 0 24 24"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.5 8.5a5 5 0 0 1 0 7"/><path d="M19 5a9 9 0 0 1 0 14"/></svg>',
 turtle:'<svg class="ic" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 3"/></svg>',
 mic:'<svg class="ic" viewBox="0 0 24 24"><rect x="9" y="2" width="6" height="12" rx="3"/><path d="M5 10a7 7 0 0 0 14 0"/><line x1="12" y1="17" x2="12" y2="22"/></svg>',
 go:'<svg class="ic" viewBox="0 0 24 24"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>'
};

/* ================= STATE ================= */
let scene=null,fw=null,curId=null,path=[],passed=0,attempts=0,estTotal=5;
let recog=null,recognizing=false,activeCat="すべて";
let activeMode="all";
let sessionWeak=false;
let micOff=false;
let failStreak=0;
let combo=0;                       // 連続正解（セッション内）
let sessionXp=0;                   // このセッションで得たXP
let welcomeShown=false;
let browseExpanded=false;
let testQueue=[],testIdx=0,testActive=false;
let PROG={};
const $=s=>document.querySelector(s);
/* 計測（ems-analytics.js）。読み込み失敗時も安全に無視 */
function track(ev,p){try{if(window.emsTrack)window.emsTrack(ev,p);}catch(e){}}

/* ================= PROGRESS STORAGE ================= */
const STORE_KEY="ems_progress_v1";
async function loadProgress(){
  try{const r=await window.storage.get(STORE_KEY);PROG=r&&r.value?JSON.parse(r.value):{};}catch(e){PROG={};}
}
async function saveProgress(){try{await window.storage.set(STORE_KEY,JSON.stringify(PROG));}catch(e){}}

/* ===== STREAK / DAILY GOAL / BADGES / XP ===== */
const STATS_KEY="ems_stats_v1";
let STATS={streak:0,best:0,lastDay:null,days:{},goal:5,badges:[],onboarded:false,guideDone:0,xp:0,quizCount:0};
function todayKey(d){d=d||new Date();return d.getFullYear()+"-"+String(d.getMonth()+1).padStart(2,"0")+"-"+String(d.getDate()).padStart(2,"0");}
function dayDiff(a,b){const pa=a.split("-").map(Number),pb=b.split("-").map(Number);const da=Date.UTC(pa[0],pa[1]-1,pa[2]),db=Date.UTC(pb[0],pb[1]-1,pb[2]);return Math.round((db-da)/86400000);}
async function loadStats(){
  try{const r=await window.storage.get(STATS_KEY);if(r&&r.value)STATS=Object.assign(STATS,JSON.parse(r.value));}catch(e){}
  if(STATS.lastDay){const gap=dayDiff(STATS.lastDay,todayKey());if(gap>=2)STATS.streak=0;}
}
async function saveStats(){try{await window.storage.set(STATS_KEY,JSON.stringify(STATS));}catch(e){}}
function todayCount(){return STATS.days[todayKey()]||0;}
function addXp(n){ STATS.xp=(STATS.xp||0)+n; sessionXp+=n; }
function recordActivity(){
  const tk=todayKey();
  const before=todayCount();
  STATS.days[tk]=before+1;
  let streakUp=false;
  if(STATS.lastDay!==tk){
    const gap=STATS.lastDay?dayDiff(STATS.lastDay,tk):null;
    if(gap===1||STATS.lastDay===null)STATS.streak=(STATS.streak||0)+1;
    else STATS.streak=1;
    STATS.lastDay=tk;
    STATS.best=Math.max(STATS.best||0,STATS.streak);
    streakUp=true;
  }
  const goalJustMet=(before+1===STATS.goal);
  const newBadges=checkBadges();
  saveStats();
  return {streakUp,goalJustMet,newBadges};
}
const BADGES=[
  {id:"first",   ic:"🎬", name:"はじめの一歩",   desc:"最初の学習を完了",         test:()=>totalActivity()>=1},
  {id:"streak3", ic:"🔥", name:"3日連続",        desc:"3日続けて学習",            test:()=>STATS.best>=3},
  {id:"streak7", ic:"⚡", name:"1週間ストリーク", desc:"7日続けて学習",            test:()=>STATS.best>=7},
  {id:"streak30",ic:"👑", name:"30日マスター",    desc:"30日続けて学習",           test:()=>STATS.best>=30},
  {id:"clear10", ic:"🩺", name:"問診見習い",      desc:"シナリオを10個クリア",     test:()=>clearedCount()>=10},
  {id:"clearAll",ic:"🏆", name:"全シナリオ制覇",  desc:"全シナリオをクリア",       test:()=>clearedCount()>=SCENES.length},
  {id:"xp500",   ic:"💎", name:"XPハンター",      desc:"累計500XPを獲得",          test:()=>(STATS.xp||0)>=500},
  {id:"combo5",  ic:"🌟", name:"5連続コンボ",     desc:"1回の練習で5連続正解",     test:()=>(STATS.maxCombo||0)>=5},
  {id:"lv5",     ic:"⛰️", name:"中級者",          desc:"レベル5を解放",            test:()=>typeof lvUnlocked==="function"&&lvUnlocked(5)},
  {id:"vocab10", ic:"📖", name:"単語コレクター",  desc:"単語クイズに10回挑戦",     test:()=>(STATS.quizCount||0)>=10}
];
function totalActivity(){return Object.values(STATS.days).reduce((a,b)=>a+b,0);}
function isNewUser(){return totalActivity()===0 && clearedCount()===0;}
function studyDays(){return Object.keys(STATS.days||{}).filter(k=>STATS.days[k]>0).length;}
function recentDayGrid(days=35){
  const arr=[];const today=new Date();
  for(let i=days-1;i>=0;i--){const d=new Date(today.getFullYear(),today.getMonth(),today.getDate()-i);const k=todayKey(d);arr.push({key:k,count:(STATS.days&&STATS.days[k])||0,label:d.getDate(),dow:d.getDay()});}
  return arr;
}
function frameworkStats(){
  const m={};
  SCENES.forEach(s=>{const f=s.framework;if(!m[f])m[f]={name:FRAMEWORKS[f].name,total:0,cleared:0};m[f].total++;if(PROG[s.id]&&PROG[s.id].cleared)m[f].cleared++;});
  return Object.values(m).sort((a,b)=>b.total-a.total);
}
function nextBadge(){
  const earned=new Set(STATS.badges||[]);
  const candidates=[
    {id:"streak3",label:"3日連続まで",cur:STATS.best||0,goal:3},
    {id:"streak7",label:"7日連続まで",cur:STATS.best||0,goal:7},
    {id:"clear10",label:"10問クリアまで",cur:clearedCount(),goal:10},
    {id:"clearAll",label:"全問クリアまで",cur:clearedCount(),goal:SCENES.length},
    {id:"xp500",label:"500XPまで",cur:STATS.xp||0,goal:500},
    {id:"vocab10",label:"単語10回まで",cur:STATS.quizCount||0,goal:10}
  ].filter(b=>!earned.has(b.id)&&b.cur<b.goal);
  if(!candidates.length)return null;
  candidates.sort((a,b)=>(a.goal-a.cur)-(b.goal-b.cur));
  const n=candidates[0];const meta=BADGES.find(x=>x.id===n.id);
  return {ic:meta?meta.ic:"🎖️",name:meta?meta.name:"",label:n.label,cur:n.cur,goal:n.goal,remain:n.goal-n.cur};
}
function checkBadges(){
  const earned=new Set(STATS.badges||[]);const fresh=[];
  BADGES.forEach(b=>{try{if(!earned.has(b.id)&&b.test()){earned.add(b.id);fresh.push(b);}}catch(e){}});
  STATS.badges=[...earned];
  return fresh;
}
function activityFeedback(act){
  let html="";const tc=todayCount(),goal=STATS.goal;
  if(sessionXp>0)html+=`<div class="fb-badge" style="background:#fff8e0;color:#b8860b">💎 +${sessionXp} XP 獲得！</div>`;
  if(act.streakUp&&STATS.streak>=2)html+=`<div class="fb-streak">🔥 ${STATS.streak}日連続！この調子です</div>`;
  if(act.goalJustMet)html+=`<div class="fb-goal">🎯 今日の目標 ${goal}問を達成！</div>`;
  else if(tc<goal)html+=`<div class="fb-goalbar">今日の学習 ${tc}/${goal}問　<i style="width:${Math.round(tc/goal*100)}%"></i></div>`;
  (act.newBadges||[]).forEach(b=>{html+=`<div class="fb-badge">${b.ic} 新しいバッジ「${b.name}」を獲得！</div>`;});
  return html?`<div class="fb-wrap">${html}</div>`:"";
}
function recordResult(id,scorePct,weak){
  const prev=PROG[id]||{cleared:false,best:0,weak:false};
  PROG[id]={cleared:prev.cleared||scorePct>=80,best:Math.max(prev.best,scorePct),weak:weak?true:(prev.cleared||scorePct>=80?false:prev.weak)};
  saveProgress();
}
function clearedCount(){return SCENES.filter(s=>PROG[s.id]&&PROG[s.id].cleared).length;}
function weakList(){return SCENES.filter(s=>PROG[s.id]&&PROG[s.id].weak);}

/* ================= MENU ================= */
const CATS=["すべて",...new Set(SCENES.map(s=>s.cat))];
const NAV=[
  {k:"all",icon:"🏠",label:"ホーム"},
  {k:"level",icon:"🪜",label:"レベル"},
  {k:"vocab",icon:"🔤",label:"単語"},
  {k:"test",icon:"⚡",label:"テスト"},
  {k:"review",icon:"🔁",label:"復習"},
  {k:"progress",icon:"📊",label:"記録"}
];
function renderNav(){
  const nav=$("#bottomNav");if(!nav)return;
  // 苦手シナリオ一覧（activeMode="weak"）は「復習」タブからの遷移なのでタブは点灯維持
  const navActive=activeMode==="weak"?"review":activeMode;
  nav.innerHTML=NAV.map(m=>
    `<button class="nav-item${m.k===navActive?" on":""}" data-m="${m.k}"><span class="ni-ic">${m.icon}</span><span class="ni-l">${m.label}</span></button>`).join("");
  document.querySelectorAll(".nav-item").forEach(b=>b.onclick=()=>{FX.tap();activeMode=b.dataset.m;activeCat="すべて";browseExpanded=false;renderMenuBody();window.scrollTo(0,0);});
}
function renderModes(){renderNav();}

function isGuest(){return !(window.EMSAuth && window.EMSAuth.user);}
// 非Proユーザー向け：今日の無料枠（シナリオ1問＋単語クイズ1回）の残りを表示。
// 料金はペイウォールを開く前から見えるように「Pro 月1,200円〜」を常に添える。
function quotaLineHTML(){
  if(window.EMS_PRO||typeof window.emsQuotaInfo!=="function")return "";
  const q=window.emsQuotaInfo();
  return `<div class="free-quota"><span class="fq-t">今日の無料枠</span><span class="fq-i ${q.scene?"":"used"}">🚑 シナリオ ${q.scene?"残り1問":"また明日"}</span><span class="fq-i ${q.quiz?"":"used"}">🔤 単語クイズ ${q.quiz?"残り1回":"また明日"}</span><button class="fq-pro" id="fqProBtn">Pro 月1,200円〜</button></div>`;
}
function bindQuotaProBtn(){
  const fp=$("#fqProBtn");
  if(fp)fp.onclick=()=>{FX.tap();if(window.emsOpenPay)window.emsOpenPay("home_pricing");};
}
function renderProgress(){
  const host=$("#progHost");
  if(activeMode!=="all"){if(host)host.innerHTML="";return;}
  // まっさらな新規ユーザーはシンプルな単一CTAのみ表示。
  // 一度でも学習したら（ゲストでも）ストリーク等のストリップを見せて、
  // 「毎日の無料枠＋ストリーク」の継続ループを課金前から体験させる。
  if(isNewUser()){
    host.innerHTML=`
      <button class="start-hero" id="startHero">
        <div class="sh-ic">🚑</div>
        <div class="sh-tx"><div class="sh-t">さっそく始めよう</div>
        <div class="sh-s">いちばんやさしいシナリオから1問だけ。</div></div>
        <div class="sh-go">▶</div>
      </button>
      ${window.EMS_PRO?"":`<div class="free-quota intro"><span class="fq-t">無料でできること</span><span class="fq-i">🚑 毎日シナリオ1問</span><span class="fq-i">🔤 毎日単語クイズ1回</span><button class="fq-pro" id="fqProBtn">Pro 月1,200円〜</button></div>`}`;
    $("#startHero").onclick=()=>{FX.tap();startScene(recommendNext(null)||SCENES[0]);};
    bindQuotaProBtn();
    return;
  }
  const tc=todayCount(),goal=STATS.goal||5,streak=STATS.streak||0;
  let welcomeBack="";
  if(tc===0&&!welcomeShown){
    welcomeShown=true;
    const msg=streak>0?`🔥 ${streak}日連続中！今日の1問で記録を伸ばしましょう`:`おかえりなさい。1問だけでも続けると力になります`;
    welcomeBack=`<div class="welcome-back"><div class="wb-msg">${msg}</div><button class="b3 b3-green b3-md" id="todayOne">今日の1問へ ${I.go}</button></div>`;
  }
  host.innerHTML=`
    ${welcomeBack}
    <div class="home-strip">
      <div class="hs-item"><span class="hs-ic ${streak>0?"lit":""}">🔥</span><b>${streak}</b><small>日連続</small></div>
      <div class="hs-item"><span class="hs-ic">💎</span><b>${STATS.xp||0}</b><small>XP</small></div>
      <div class="hs-item"><span class="hs-ic">🎯</span><b>${tc}/${goal}</b><small>今日</small></div>
      <div class="hs-item"><span class="hs-ic">✅</span><b>${clearedCount()}</b><small>クリア</small></div>
    </div>
    ${quotaLineHTML()}`;
  bindQuotaProBtn();
  const t1=$("#todayOne");
  if(t1)t1.onclick=()=>{FX.tap();const nx=recommendNext(null);if(nx)startScene(nx);};
}

function renderFullDashboard(){
  const done=clearedCount(),total=SCENES.length,pct=Math.round(done/total*100);
  const tc=todayCount(),goal=STATS.goal||5;
  const goalPct=Math.min(100,Math.round(tc/goal*100));
  const goalDone=tc>=goal;
  const streak=STATS.streak||0;
  const earned=BADGES.filter(b=>(STATS.badges||[]).includes(b.id));
  const badgeIcons=earned.length?earned.slice(-6).map(b=>`<span class="badge-chip" title="${b.name}">${b.ic}</span>`).join(""):`<span class="badge-empty">学習を始めるとバッジが集まります</span>`;
  const totalQ=totalActivity(),days=studyDays(),best=STATS.best||0;
  const summary=`<div class="sum-grid">
      <div class="sum-cell"><span class="sc-ic">💎</span><b>${STATS.xp||0}</b><small>累計XP</small></div>
      <div class="sum-cell"><span class="sc-ic">📅</span><b>${days}</b><small>学習した日数</small></div>
      <div class="sum-cell"><span class="sc-ic">🏅</span><b>${best}</b><small>最長ストリーク</small></div>
    </div>`;
  const grid=recentDayGrid(35);
  const dowLabels=["日","月","火","水","木","金","土"];
  const lead=grid[0].dow;let cells="";
  for(let i=0;i<lead;i++)cells+=`<span class="cal-cell empty"></span>`;
  grid.forEach(d=>{const lvl=d.count===0?0:d.count>=goal?3:d.count>=Math.ceil(goal/2)?2:1;const isToday=d.key===todayKey();cells+=`<span class="cal-cell h${lvl}${isToday?" today":""}" title="${d.key}: ${d.count}問"></span>`;});
  const calendar=`<div class="cal-card">
      <div class="cal-head">🗓️ 学習カレンダー<span class="cal-sub">直近5週間</span></div>
      <div class="cal-dow">${dowLabels.map(d=>`<span>${d}</span>`).join("")}</div>
      <div class="cal-grid">${cells}</div>
      <div class="cal-legend">少 <span class="cal-cell h0"></span><span class="cal-cell h1"></span><span class="cal-cell h2"></span><span class="cal-cell h3"></span> 多</div>
    </div>`;
  const fws=frameworkStats();
  const fwRows=fws.map(f=>{const p=Math.round(f.cleared/f.total*100);return `<div class="fw-row"><span class="fw-nm">${f.name}</span><span class="fw-bar"><i style="width:${p}%"></i></span><span class="fw-n">${f.cleared}/${f.total}</span></div>`;}).join("");
  const mastery=`<div class="mastery-card"><div class="mc-head">🩺 問診の型・習得状況</div>${fwRows}</div>`;
  const nb=nextBadge();
  const nextBadgeCard=nb?`<div class="nextbadge-card"><span class="nb-ic">${nb.ic}</span><div class="nb-tx"><div class="nb-t">次のバッジ「${nb.name}」</div><div class="nb-bar"><i style="width:${Math.round(nb.cur/nb.goal*100)}%"></i></div><div class="nb-s">${nb.label} あと ${nb.remain}</div></div></div>`:`<div class="nextbadge-card all"><span class="nb-ic">🏆</span><div class="nb-tx"><div class="nb-t">すべてのバッジを獲得しました！</div></div></div>`;
  $("#grid").className="";$("#grid").classList.remove("hide");
  $("#grid").innerHTML=`
    <div class="dash">
      <div class="dash-row">
        <div class="streak-box"><div class="streak-flame ${streak>0?"lit":""}">🔥</div><div><div class="streak-n">${streak}</div><div class="streak-l">日連続</div></div></div>
        <div class="goal-box ${goalDone?"done":""}"><div class="goal-ring" style="--p:${goalPct}"><span>${goalDone?"✓":tc+"/"+goal}</span></div><div class="goal-tx"><div class="goal-t">${goalDone?"今日の目標達成！":"今日の目標"}</div><div class="goal-s">${goalDone?"おつかれさまでした":"あと"+(goal-tc)+"問"}</div></div></div>
      </div>
    </div>
    ${summary}
    ${calendar}
    ${nextBadgeCard}
    <div class="prog-card"><div class="prog-top"><span style="font-size:1.2rem">📈</span><span class="pt">シナリオ進捗</span><span class="pn">${done}/${total}</span></div><div class="prog-line"><i style="width:${pct}%"></i></div></div>
    ${mastery}
    <div class="badge-strip" style="margin-top:12px"><span class="badge-head">🎖️ バッジ ${earned.length}/${BADGES.length}</span><span class="badge-list">${badgeIcons}</span><button class="badge-more" id="badgeMore">一覧</button></div>
    <div class="prog-reset" style="margin-top:14px"><button id="soundToggle" style="margin-right:12px">🔊 サウンド: ${FX.on?"ON":"OFF"}</button><button id="goalEdit" style="margin-right:12px">目標 ${goal}問/日</button><button id="resetProg">記録をリセット</button></div>`;
  $("#resetProg").onclick=async()=>{
    if(!confirm("学習の記録（進捗・ストリーク・バッジ・XP）をすべて消します。よろしいですか？"))return;
    PROG={};STATS={streak:0,best:0,lastDay:null,days:{},goal:5,badges:[],xp:0,quizCount:0};
    await saveProgress();await saveStats();renderMenuBody();
  };
  $("#goalEdit").onclick=()=>{FX.tap();const opts=[3,5,10];const cur=opts.indexOf(STATS.goal);STATS.goal=opts[(cur+1)%opts.length];saveStats();renderFullDashboard();};
  $("#soundToggle").onclick=()=>{const on=FX.toggle();if(on)FX.correct();renderFullDashboard();};
  $("#badgeMore").onclick=()=>{FX.tap();showBadges();};
}

function showBadges(){
  const earned=new Set(STATS.badges||[]);
  const rows=BADGES.map(b=>{const got=earned.has(b.id);return `<div class="bm-row ${got?"got":"locked"}"><span class="bm-ic">${got?b.ic:"🔒"}</span><div><div class="bm-n">${b.name}</div><div class="bm-d">${b.desc}</div></div>${got?`<span class="bm-chk">✓</span>`:""}</div>`;}).join("");
  $("#progHost").insertAdjacentHTML("afterbegin",`<div class="bm-overlay" id="bmOverlay"><div class="bm-card"><div class="bm-head"><span>🎖️ バッジ一覧</span><button class="bm-close" id="bmClose">✕</button></div><div class="bm-body">${rows}</div></div></div>`);
  $("#bmClose").onclick=()=>$("#bmOverlay").remove();
  $("#bmOverlay").onclick=(e)=>{if(e.target.id==="bmOverlay")$("#bmOverlay").remove();};
}

function cardHTML(s){
  const f=FRAMEWORKS[s.framework];const p=PROG[s.id];
  let cls="card-s",badge="",best="";
  if(p){
    if(p.cleared){cls+=" cleared";badge=`<span class="badge">✅</span>`;}
    else if(p.weak){cls+=" weak";badge=`<span class="badge">⚠️</span>`;}
    if(p.best>0)best=`<span class="best">最高 ${p.best}%</span>`;
  }
  // 課金ステータスのバッジ（ems-paywall.js が読み込まれていれば）
  let lockflag="";
  if(typeof window.emsSceneStatus==="function"){
    const st=window.emsSceneStatus(s);
    if(st==="free"){cls+=" is-free";lockflag=`<span class="lockflag free">無料</span>`;}
    else if(st==="locked"){cls+=" is-locked";lockflag=`<span class="lockflag locked">🔒</span>`;}
  }
  return {cls,html:`${badge}${lockflag}<div class="ico">${s.icon}</div><div class="ttl">${s.title}</div><div class="en">${s.en}</div><span class="fw">${f.name}</span>${best}`};
}
function renderChips(){
  $("#chips").innerHTML=CATS.map(c=>{const n=c==="すべて"?SCENES.length:SCENES.filter(s=>s.cat===c).length;return `<button class="chip${c===activeCat?" on":""}" data-c="${c}">${c} ${n}</button>`;}).join("");
  document.querySelectorAll(".chip").forEach(b=>b.onclick=()=>{FX.tap();activeCat=b.dataset.c;renderChips();renderGrid();});
}
function renderGrid(){
  const g=$("#grid");if(g)g.className="grid";
  let list=activeCat==="すべて"?SCENES:SCENES.filter(s=>s.cat===activeCat);
  if(activeMode==="weak")list=weakList().filter(s=>activeCat==="すべて"||s.cat===activeCat);
  $("#grid").innerHTML="";
  if(list.length===0){$("#grid").innerHTML=`<div class="empty-note">${activeMode==="weak"?"🎉 いまは苦手シナリオがありません！<br>練習中に一致度80%未満やスキップがあると、ここに集まります。":"該当するシナリオがありません。"}</div>`;return;}
  list.forEach(s=>{const {cls,html}=cardHTML(s);const b=document.createElement("button");b.className=cls;b.dataset.fw=s.framework;b.innerHTML=html;b.onclick=()=>{FX.tap();startScene(s);};$("#grid").appendChild(b);});
}

function renderMenuBody(){
  const lead=$("#lead"),chipsBar=$("#chipsBar"),grid=$("#grid"),mic=$("#micNote");
  const oc=$("#practiceCta");if(oc)oc.remove();
  const ot=$("#browseToggle");if(ot)ot.remove();
  if(grid)grid.classList.remove("hide");
  renderNav();          // 下タブのハイライトを現在の画面に同期
  renderProgress();
  // 免責事項・法的リンクは「記録」タブのみに表示
  const disc=$("#disclaimer"),legal=$("#legalLinks");
  if(disc)disc.classList.toggle("hide",activeMode!=="progress");
  if(legal)legal.classList.toggle("hide",activeMode!=="progress");
  if(activeMode==="test"){
    chipsBar.classList.add("hide");grid.classList.add("hide");mic.classList.add("hide");
    lead.innerHTML=`<div class="test-intro"><h3>⚡ 実戦テストモード</h3><p>ランダムな5シナリオから1問ずつ、計5問に挑戦。今の実力を確かめて、成長を実感しよう。続けるほどスコアも自信も伸びていきます。</p><button class="b3 b3-white b3-lg" id="startTest" style="color:var(--blue-dark)">テストを始める（5問）</button></div>`;
    $("#startTest").onclick=()=>{FX.tap();startTest();};
    return;
  }
  if(activeMode==="review"){
    chipsBar.classList.add("hide");grid.classList.add("hide");mic.classList.add("hide");
    lead.innerHTML=`<h2>復習</h2><p>苦手なシナリオと単語をおさらいしよう。</p>${weakReviewCardHTML()}${srsCardHTML()}`;
    const wr=$("#startWeakReview");if(wr)wr.onclick=()=>{FX.tap();activeMode="weak";browseExpanded=false;renderMenuBody();window.scrollTo(0,0);};
    const sb=$("#startSrs");if(sb)sb.onclick=()=>{FX.tap();startQuiz("__srs__");};
    return;
  }
  if(activeMode==="level"){
    chipsBar.classList.add("hide");mic.classList.remove("hide");grid.classList.remove("hide");
    lead.innerHTML=`<h2>レベル別パス（全10段階）</h2><p>Lv1から始めて、各レベルの問題クリアで次が解放。バーをタップで開閉します。</p>`;
    renderLevels();return;
  }
  if(activeMode==="vocab"){
    chipsBar.classList.add("hide");mic.classList.add("hide");grid.classList.remove("hide");
    lead.innerHTML=`<h2>救急単語クイズ</h2><p>4択で学習。英語→日本語、日本語→英語を切り替えできます。</p>`;
    renderVocabMenu();return;
  }
  if(activeMode==="progress"){
    chipsBar.classList.add("hide");grid.classList.add("hide");mic.classList.add("hide");
    lead.innerHTML=`<h2>学習の記録</h2><p>ストリーク・XP・バッジ・進捗をまとめて確認できます。</p>`;
    renderFullDashboard();return;
  }
  chipsBar.classList.remove("hide");grid.classList.remove("hide");mic.classList.remove("hide");
  if(activeMode==="all"&&isNewUser()){
    chipsBar.classList.add("hide");
    const oldT=$("#browseToggle");if(oldT)oldT.remove();
    if(browseExpanded){lead.innerHTML=`<h2>シナリオ一覧</h2><p>気になるものから自由に選べます。迷ったら上の「さっそく始めよう」へ。</p>`;renderChips();renderGrid();return;}
    grid.classList.add("hide");
    lead.innerHTML=`<h2>ようこそ 👋</h2><p>上の「さっそく始めよう」から最初の1問へ。1分で問診の型がつかめます。</p>`;
    lead.insertAdjacentHTML("afterend",`<button class="browse-toggle" id="browseToggle">🔍 シナリオ一覧から自由に選ぶ（${SCENES.length}件）</button>`);
    const bt=$("#browseToggle");if(bt)bt.onclick=()=>{FX.tap();browseExpanded=true;renderMenuBody();};
    return;
  }
  lead.innerHTML=activeMode==="weak"?`<h2>苦手の復習</h2><p>一致度80%未満やスキップがあったシナリオです。クリアすると一覧から外れます。</p>`:`<h2>シナリオを選ぼう</h2><p>下から自由に選べます。迷ったら上のボタンへ。</p>`;
  const oldCta=$("#practiceCta");if(oldCta)oldCta.remove();
  const oldToggle=$("#browseToggle");if(oldToggle)oldToggle.remove();
  if(activeMode==="all"){
    const nx=recommendNext(null);
    if(nx){const cleared=clearedCount();const cta=cleared===0?"練習を始める":"つづきを練習";lead.insertAdjacentHTML("afterend",`<button class="practice-cta" id="practiceCta"><span class="pc-ic">${nx.icon}</span><span class="pc-tx"><span class="pc-t">${cta}</span><span class="pc-s">${nx.title}・Lv${nx.lv}</span></span><span class="pc-go">▶</span></button>`);}
    const shouldCollapse=clearedCount()<5&&!browseExpanded;
    if(shouldCollapse){
      chipsBar.classList.add("hide");grid.classList.add("hide");
      lead.innerHTML=`<h2>シナリオを選ぼう</h2><p>まずは上のおすすめから。慣れたら全${SCENES.length}件から自由に選べます。</p>`;
      const cta=$("#practiceCta");const anchor=cta||lead;
      anchor.insertAdjacentHTML("afterend",`<button class="browse-toggle" id="browseToggle">🔍 シナリオ一覧から自由に選ぶ（${SCENES.length}件）</button>`);
      const bt=$("#browseToggle");if(bt)bt.onclick=()=>{FX.tap();browseExpanded=true;renderMenuBody();};
      const pc=$("#practiceCta");if(pc){const nx2=recommendNext(null);pc.onclick=()=>{FX.tap();if(nx2)startScene(nx2);};}
      return;
    }
  }
  renderChips();renderGrid();
  const pc=$("#practiceCta");
  if(pc){const nx=recommendNext(null);pc.onclick=()=>{FX.tap();if(nx)startScene(nx);};}
}

/* ===== Level path ===== */
const TOTAL_LV=10;
const LV_COLORS=[
  ["#58cc02","#46a302","#3d8c00"],["#7ac70c","#5fa800","#4f8c00"],["#9acd00","#7eaa00","#688c00"],
  ["#1cb0f6","#1899d6","#0a7fb8"],["#1391e8","#0f7ac4","#0a66a8"],["#5b7cf6","#4763d6","#3a52b8"],
  ["#8a6bf0","#6f4ed6","#5a3eb8"],["#ce82ff","#a64ee0","#8a3ec4"],["#e85fd0","#c43eaa","#a8328f"],["#ff4b6e","#e02b50","#c01340"]
];
function lvTitle(lv){if(lv<=2)return "入門";if(lv<=4)return "初級";if(lv<=6)return "中級";if(lv<=8)return "上級";return "達人";}
function lvScenes(lv){return SCENES.filter(s=>s.lv===lv);}
function lvCleared(lv){return lvScenes(lv).filter(s=>PROG[s.id]&&PROG[s.id].cleared).length;}
function lvNeed(lv){return Math.max(1,Math.ceil(lvScenes(lv).length*0.6));}
function lvUnlocked(lv){if(lv===1)return true;const prev=lvScenes(lv-1);if(prev.length===0)return true;return lvCleared(lv-1)>=lvNeed(lv-1);}
function highestUnlocked(){let h=1;for(let lv=2;lv<=TOTAL_LV;lv++){if(lvUnlocked(lv))h=lv;else break;}return h;}
let openLv=null;
function renderLevels(){
  const host=$("#grid");host.className="lv-wrap";host.id="grid";
  if(openLv===null)openLv=highestUnlocked();
  let html="";
  for(let lv=1;lv<=TOTAL_LV;lv++){
    const all=lvScenes(lv),done=lvCleared(lv),unlocked=lvUnlocked(lv);
    const [c1,c2,sh]=LV_COLORS[lv-1];
    const bandStyle=unlocked?`background:linear-gradient(135deg,${c1},${c2});box-shadow:0 4px 0 ${sh}`:`background:linear-gradient(135deg,#bdbdbd,#a3a3a3);box-shadow:0 4px 0 #8f8f8f`;
    const isOpen=openLv===lv&&unlocked;
    html+=`<div class="lv-sec"><button class="lv-band" data-lv="${lv}" style="${bandStyle}"><span class="lv-ic">${unlocked?(all.length&&done>=all.length?"👑":"📍"):"🔒"}</span><div style="text-align:left"><div class="lv-t">Lv${lv}・${lvTitle(lv)}</div><div class="lv-sub">${unlocked?(all.length===0?"準備中":all.length&&done>=all.length?"コンプリート！":all.length+"問のステージ"):"未解放"}</div></div><span class="lv-n">${done}/${all.length}</span>${unlocked&&all.length?`<span class="lv-caret">${isOpen?"▲":"▼"}</span>`:""}</button>`;
    if(!unlocked){html+=`<div class="lv-lockmsg">🔒 <b>Lv${lv-1}を${lvNeed(lv-1)}問クリア</b>で解放（現在 ${lvCleared(lv-1)}問）</div>`;}
    else if(isOpen&&all.length){html+=`<div class="lv-grid" id="lvgrid${lv}"></div>`;}
    html+=`</div>`;
  }
  host.innerHTML=html;
  host.querySelectorAll(".lv-band").forEach(b=>{const lv=+b.dataset.lv;if(!lvUnlocked(lv)||!lvScenes(lv).length){b.style.cursor="default";return;}b.onclick=()=>{FX.tap();openLv=(openLv===lv?null:lv);renderLevels();};});
  for(let lv=1;lv<=TOTAL_LV;lv++){const g=document.getElementById("lvgrid"+lv);if(!g)continue;lvScenes(lv).forEach(s=>{const {cls,html:inner}=cardHTML(s);const btn=document.createElement("button");btn.className=cls;btn.dataset.fw=s.framework;btn.innerHTML=inner;btn.onclick=()=>{FX.tap();startScene(s);};g.appendChild(btn);});}
}

$("#countPill").textContent=SCENES.length+" シナリオ";

/* ================= VOCAB QUIZ ================= */
const VCAT_META={"解剖":"🫀","バイタル":"💓","症状":"🤒","外傷":"🩹","処置":"🚑","薬剤":"💊","疾患":"🏥","問診表現":"💬"};
const VCATS=[...new Set(VOCAB.map(v=>v.cat))];
let vDir="en2jp";
let vCat=null,vQueue=[],vIdx=0,vCorrect=0,vWrong=[],vAnswered=false;
const VSTORE_KEY="ems_vocab_v1";
let VPROG={};
const VWEAK_KEY="ems_vocab_weak_v1";
let VWEAK={};
async function loadVocabProg(){
  try{const r=await window.storage.get(VSTORE_KEY);VPROG=r&&r.value?JSON.parse(r.value):{};}catch(e){VPROG={};}
  try{const r=await window.storage.get(VWEAK_KEY);VWEAK=r&&r.value?JSON.parse(r.value):{};}catch(e){VWEAK={};}
}
async function saveVocabWeak(){try{await window.storage.set(VWEAK_KEY,JSON.stringify(VWEAK));}catch(e){}}
function weakWords(){return VOCAB.filter(v=>VWEAK[v.en]);}
function markWeak(w){VWEAK[w.en]=true;saveVocabWeak();}
function clearWeak(w){if(VWEAK[w.en]){delete VWEAK[w.en];saveVocabWeak();}}
async function saveVocabProg(){try{await window.storage.set(VSTORE_KEY,JSON.stringify(VPROG));}catch(e){}}

/* ===== 忘却曲線 復習（SRS: spaced repetition） ===== */
const DAY_MS=86400000;
const SRS_INTERVALS=[1,3,7,14,30];           // 日後：1→3→7→14→30
const SRS_KEY="ems_vocab_srs_v1";
let SRS={};                                   // { en: {stage:0..4, due:ms} }
function startOfDay(ts){const d=new Date(ts);d.setHours(0,0,0,0);return d.getTime();}
function todayStart(){return startOfDay(Date.now());}
async function loadSrs(){try{const r=await window.storage.get(SRS_KEY);SRS=r&&r.value?JSON.parse(r.value):{};}catch(e){SRS={};}}
async function saveSrs(){try{await window.storage.set(SRS_KEY,JSON.stringify(SRS));}catch(e){}}
// まちがえた単語をスケジュールに追加（既にあれば触らない）
function srsAdd(en){if(!SRS[en]){SRS[en]={stage:0,due:todayStart()+SRS_INTERVALS[0]*DAY_MS};saveSrs();}}
// 復習で正解：次の間隔へ進む。最終段(30日)を超えたら卒業
function srsAdvance(en){const e=SRS[en];if(!e)return;if(e.stage>=SRS_INTERVALS.length-1){delete SRS[en];}else{e.stage++;e.due=todayStart()+SRS_INTERVALS[e.stage]*DAY_MS;}saveSrs();}
// 復習でまちがえた：1日目に戻す
function srsReset(en){SRS[en]={stage:0,due:todayStart()+SRS_INTERVALS[0]*DAY_MS};saveSrs();}
// 今日が期日（due<=今）の単語
function srsDue(){const now=Date.now();return VOCAB.filter(v=>SRS[v.en]&&SRS[v.en].due<=now);}
function srsStats(){
  const now=Date.now();const byStage=[0,0,0,0,0];let due=0,nextDue=null;
  Object.keys(SRS).forEach(en=>{const e=SRS[en];if(e.stage>=0&&e.stage<5)byStage[e.stage]++;if(e.due<=now)due++;else if(nextDue===null||e.due<nextDue)nextDue=e.due;});
  return {due,byStage,nextDue,total:Object.keys(SRS).length};
}
function fmtMD(ts){const d=new Date(ts);return (d.getMonth()+1)+"/"+d.getDate();}
function weakReviewCardHTML(){
  const wk=weakList().length;
  const status=wk>0?`📌 苦手にマークされたシナリオ：<b>${wk}件</b>`:"🎉 いまは苦手シナリオはありません！";
  const btn=wk>0
    ?`<button class="b3 b3-white b3-lg" id="startWeakReview">苦手シナリオを復習（${wk}件）</button>`
    :`<button class="b3 b3-white b3-lg" id="startWeakReview" disabled>苦手シナリオはありません</button>`;
  return `<div class="srs-card">
    <div class="srs-head"><span class="srs-ic">🔁</span><div><div class="srs-t">苦手シナリオ復習</div><div class="srs-sub">一致度80%未満やスキップがあったシナリオが集まります。クリアすると一覧から外れます。</div></div></div>
    <div class="srs-status">${status}</div>
    ${btn}
  </div>`;
}
function srsCardHTML(){
  const st=srsStats();
  const labels=["1日","3日","7日","14日","30日"];
  const steps=labels.map((l,i)=>{const n=st.byStage[i];const cls=n>0?"srs-step done":"srs-step";return `<span class="${cls}">${l}${n>0?`<br>${n}語`:""}</span>`;}).join("");
  let status,btn;
  if(st.total===0){
    status="まだ登録された単語はありません。単語クイズでまちがえると、ここに集まります。";
    btn=`<button class="b3 b3-white b3-lg" id="startSrs" disabled>今日の復習はありません</button>`;
  }else if(st.due>0){
    status=`📌 今日の復習：<b>${st.due}語</b>　／　登録中：${st.total}語`;
    btn=`<button class="b3 b3-white b3-lg" id="startSrs">今日の復習を始める（${st.due}語）</button>`;
  }else{
    status=`🎉 今日の復習は完了！${st.nextDue?`　次回は ${fmtMD(st.nextDue)} に`:""}　／　登録中：${st.total}語`;
    btn=`<button class="b3 b3-white b3-lg" id="startSrs" disabled>今日の復習はありません</button>`;
  }
  return `<div class="srs-card">
    <div class="srs-head"><span class="srs-ic">🧠</span><div><div class="srs-t">忘却曲線で復習</div><div class="srs-sub">まちがえた単語を 1→3→7→14→30日 の間隔で出題。正解で次の間隔へ、まちがえると1日目に戻ります。</div></div></div>
    <div class="srs-steps">${steps}</div>
    <div class="srs-status">${status}</div>
    ${btn}
  </div>`;
}

function renderVocabMenu(){
  const host=$("#grid");host.className="vcat-grid";host.id="grid";host.innerHTML="";
  const dirRow=document.createElement("div");dirRow.className="vmode-row";dirRow.style.gridColumn="1/-1";
  dirRow.innerHTML=`<button class="vmode-btn${vDir==="en2jp"?" on":""}" data-d="en2jp">英語 → 日本語</button><button class="vmode-btn${vDir==="jp2en"?" on":""}" data-d="jp2en">日本語 → 英語</button>`;
  host.appendChild(dirRow);
  dirRow.querySelectorAll(".vmode-btn").forEach(b=>b.onclick=()=>{FX.tap();vDir=b.dataset.d;renderVocabMenu();});
  const wk=weakWords();
  if(wk.length>0){const wb=document.createElement("button");wb.className="vweak-banner";wb.style.gridColumn="1/-1";wb.innerHTML=`<span class="vwb-ic">🔁</span><div class="vwb-tx"><div class="vwb-t">苦手な単語を復習</div><div class="vwb-s">まちがえた ${wk.length}語だけを出題。正解すると外れます</div></div><span class="vwb-n">${wk.length}</span>`;wb.onclick=()=>{FX.tap();startQuiz("__weak__");};host.appendChild(wb);}
  const mkCard=(cat,label,icon,count)=>{const best=VPROG[cat]||0;const b=document.createElement("button");b.className="vcat";b.innerHTML=`<div class="vi">${icon}</div><div class="vt">${label}</div><div class="vn">${count}語</div>${best>0?`<span class="vbest">最高 ${best}/10</span>`:""}`;b.onclick=()=>{FX.tap();startQuiz(cat);};host.appendChild(b);};
  mkCard("__all__","全カテゴリ","🎯",VOCAB.length);
  VCATS.forEach(c=>mkCard(c,c,VCAT_META[c]||"📘",VOCAB.filter(v=>v.cat===c).length));
}
function shuffle(a){for(let i=a.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
function startQuiz(cat){
  vCat=cat;let pool;
  if(cat==="__all__")pool=[...VOCAB];else if(cat==="__weak__")pool=weakWords();else if(cat==="__srs__")pool=srsDue();else pool=VOCAB.filter(v=>v.cat===cat);
  const limit=(cat==="__weak__"||cat==="__srs__")?Math.min(20,pool.length):10;
  vQueue=shuffle([...pool]).slice(0,limit);vIdx=0;vCorrect=0;vWrong=[];sessionXp=0;
  track("quiz_start",{cat:String(cat),n:vQueue.length,pro:!!window.EMS_PRO});
  // ペイウォールの誘導ボタン等、シナリオ画面から直接来るパスがあるため
  // #trainer も必ず隠す（隠し忘れると全画面の下に残り続ける）
  stopRecog();speechSynthesis.cancel();clearPlaying();testActive=false;
  $("#menu").classList.add("hide");$("#trainer").classList.add("hide");$("#quiz").classList.remove("hide");window.scrollTo(0,0);renderQuestion();
}
$("#qzQuit").onclick=()=>{
  const inProgress=vQueue.length>0&&vIdx<vQueue.length&&(vIdx>0||vAnswered);
  if(inProgress&&!confirm("クイズを中断してメニューに戻りますか？\nここまでの結果は記録されません。"))return;
  FX.tap();speechSynthesis.cancel();$("#quiz").classList.add("hide");$("#menu").classList.remove("hide");renderMenuBody();
};
function distractors(word){
  const sameCat=VOCAB.filter(v=>v.cat===word.cat&&v.en!==word.en);
  const others=VOCAB.filter(v=>v.cat!==word.cat);
  const pick=shuffle([...sameCat]).slice(0,3);
  while(pick.length<3){const o=shuffle([...others])[0];if(o&&!pick.includes(o)&&o.en!==word.en)pick.push(o);}
  return pick;
}
function renderQuestion(){
  vAnswered=false;const w=vQueue[vIdx];
  $("#qzFill").style.width=Math.round(vIdx/vQueue.length*100)+"%";
  $("#qzMeta").innerHTML=`<span class="test-banner">🔤 ${vIdx+1}/${vQueue.length}</span>`;
  const prompt=vDir==="en2jp"?w.en:w.jp;
  const promptCls=vDir==="en2jp"?"qz-word":"qz-word jp";
  const opts=shuffle([w,...distractors(w)]);
  const showPlay=vDir==="en2jp";
  $("#qzStage").innerHTML=`
    <div class="quiz-top"><span class="qz-count">問題 ${vIdx+1} / ${vQueue.length}</span><span class="qz-score">✅ ${vCorrect}</span></div>
    <div class="qz-prompt-card"><div class="qz-dir">${vDir==="en2jp"?"この英語の意味は？":"これを英語で言うと？"}</div><div class="${promptCls}">${prompt}</div>${showPlay?`<button class="qz-play" id="qzPlay">${I.spk}</button>`:""}</div>
    <div class="qz-opts" id="qzOpts"></div>
    <div class="qz-feedback" id="qzFeedback"></div>`;
  if(showPlay){$("#qzPlay").onclick=(e)=>speak(w.en,0.9,e.currentTarget);setTimeout(()=>speak(w.en,0.9,$("#qzPlay")),300);}
  const box=$("#qzOpts");
  opts.forEach(o=>{const label=vDir==="en2jp"?o.jp:o.en;const b=document.createElement("button");b.className="qz-opt";b.textContent=label;b.onclick=()=>answer(b,o,w);box.appendChild(b);});
}
function answer(btn,chosen,correct){
  if(vAnswered)return;vAnswered=true;
  const isRight=chosen.en===correct.en;
  const correctLabel=vDir==="en2jp"?correct.jp:correct.en;
  document.querySelectorAll(".qz-opt").forEach(el=>{const txt=el.textContent;if(txt===correctLabel)el.classList.add("correct");else if(el===btn)el.classList.add("wrong");else el.classList.add("dim");el.onclick=null;});
  if(isRight){vCorrect++;clearWeak(correct);if(vCat==="__srs__")srsAdvance(correct.en);addXp(5);FX.correct();FX.burst("+5 XP","#46a302");}
  else{vWrong.push(correct);if(vCat==="__srs__")srsReset(correct.en);else{markWeak(correct);srsAdd(correct.en);}FX.wrong();}
  if(vDir==="jp2en")speak(correct.en,0.9);
  $(".qz-score").textContent="✅ "+vCorrect;
  $("#qzFeedback").innerHTML=`<button class="b3 b3-green b3-lg" id="qzNext">${isRight?"正解！":"次へ"} ${vIdx+1<vQueue.length?I.go:"🏁"}</button>`;
  $("#qzNext").onclick=()=>{FX.tap();vIdx++;if(vIdx<vQueue.length)renderQuestion();else finishQuiz();};
  setTimeout(()=>$("#qzNext").scrollIntoView({behavior:"smooth",block:"center"}),60);
}
function finishQuiz(){
  $("#qzFill").style.width="100%";$("#qzMeta").innerHTML="";
  if(vCat!=="__weak__"&&vCat!=="__srs__"){VPROG[vCat]=Math.max(VPROG[vCat]||0,vCorrect);saveVocabProg();}
  STATS.quizCount=(STATS.quizCount||0)+1;
  const pct=Math.round(vCorrect/vQueue.length*100);
  track("quiz_finish",{cat:String(vCat),pct});
  if(pct>=70){addXp(10);}
  const act=recordActivity();
  const grade=pct>=90?"🏆 完璧！":pct>=70?"🥈 good!":pct>=50?"🥉 その調子":"📖 復習しよう";
  if(pct>=70){FX.fanfare();FX.confetti({big:pct>=90});}
  const catName=vCat==="__all__"?"全カテゴリ":vCat==="__weak__"?"苦手単語の復習":vCat==="__srs__"?"忘却曲線の復習":vCat;
  const wrongHTML=vWrong.length?`<div class="wrong-list"><div class="wh">📝 まちがえた単語（${vWrong.length}）</div>${vWrong.map(w=>`<div class="wr"><span class="we">${w.en}</span><span class="wj">${w.jp}</span></div>`).join("")}</div>`:`<p class="fm" style="color:var(--green-dark);font-weight:900;margin-top:14px">全問正解！すばらしい 🎉</p>`;
  $("#qzStage").innerHTML=`
    <div class="fin"><div class="ficon">${pct>=90?"🏆":"📊"}</div><h3>${catName} クイズ結果</h3><p class="fm">${grade}</p>
      ${activityFeedback(act)}
      <div class="tiles"><div class="tile t-g"><small>正解</small><b>${vCorrect}</b></div><div class="tile t-b"><small>問題</small><b>${vQueue.length}</b></div><div class="tile t-a"><small>正答率</small><b>${pct}%</b></div></div>
      ${wrongHTML}
      ${vCat==="__weak__"?`<p class="fm" style="margin-top:12px;font-weight:900;color:${weakWords().length?"var(--amber-dark)":"var(--green-dark)"}">${weakWords().length?`残りの苦手単語：${weakWords().length}語`:"苦手単語をすべて克服しました！🎉"}</p>`:""}
      ${vCat==="__srs__"?`<p class="fm" style="margin-top:12px;font-weight:900;color:${srsDue().length?"var(--amber-dark)":"var(--green-dark)"}">${srsDue().length?`今日の復習はあと ${srsDue().length}語`:"今日の復習をすべて終えました！🎉"}</p>`:""}
      <div class="fin-acts">${vCat==="__weak__"?(weakWords().length?`<button class="b3 b3-white b3-md" id="qzAgain">続けて復習</button>`:""):vCat==="__srs__"?(srsDue().length?`<button class="b3 b3-white b3-md" id="qzAgain">続けて復習</button>`:""):`<button class="b3 b3-white b3-md" id="qzAgain">もう一度</button>`}<button class="b3 b3-green b3-md" id="qzHome">メニューへ</button></div>
    </div>`;
  const ag=$("#qzAgain");if(ag)ag.onclick=()=>{FX.tap();startQuiz(vCat);};
  $("#qzHome").onclick=()=>{FX.tap();$("#quiz").classList.add("hide");$("#menu").classList.remove("hide");renderMenuBody();};
}

/* ===== ブラウザ環境の検出（発音判定の可否・アプリ内ブラウザ） ===== */
function browserEnv(){
  const ua=navigator.userAgent||"";
  let inapp=null;
  if(/Line\//i.test(ua))inapp="line";
  else if(/Instagram/i.test(ua))inapp="instagram";
  else if(/FBAN|FBAV|FB_IAB/i.test(ua))inapp="facebook";
  else if(/Twitter/i.test(ua))inapp="twitter";
  return {sr:!!SR,inapp};
}
// 発音判定が使えない環境では、ホームの案内を「壊れているのではなく未対応」だと
// 分かる文言に差し替える。LINEは外部ブラウザで開き直すボタンも出す。
function updateMicNote(){
  const el=$("#micNote");if(!el)return;
  const env=browserEnv();
  if(env.sr)return; // 判定が使える環境は既定の文言のまま
  el.classList.add("warn");
  if(env.inapp==="line"){
    el.innerHTML=`<span style="font-size:1.3rem">⚠️</span><div><b>LINEのブラウザでは発音のAI判定が使えません。</b><br>下のボタンでブラウザで開き直すと判定できます。このままでも、お手本を聞いて進める学習モードで練習できます。<div style="margin-top:8px"><button class="mn-open" id="openExternal">ブラウザで開き直す ↗</button></div></div>`;
    const ob=$("#openExternal");
    if(ob)ob.onclick=()=>{track("open_external",{from:"line"});const u=new URL(location.href);u.searchParams.set("openExternalBrowser","1");location.href=u.toString();};
  }else if(env.inapp){
    el.innerHTML=`<span style="font-size:1.3rem">⚠️</span><div><b>アプリ内ブラウザでは発音のAI判定が使えません。</b><br>画面右上のメニューから「ブラウザで開く」を選ぶと判定できます。このままでも、お手本を聞いて進める学習モードで練習できます。</div>`;
  }else{
    el.innerHTML=`<span style="font-size:1.3rem">ℹ️</span><div><b>このブラウザは発音のAI判定に未対応です。</b><br>Chrome（Android・PC）なら発音を自動判定できます。このままでも、お手本を聞いて進める学習モードで練習できます。</div>`;
  }
}

/* boot */
(async()=>{
  await loadProgress();await loadVocabProg();await loadSrs();await loadStats();renderModes();renderMenuBody();
  updateMicNote();
  const env=browserEnv();
  track("env",{sr:env.sr,inapp:env.inapp,standalone:matchMedia("(display-mode: standalone)").matches});
})();

/* ================= SPEECH ================= */
function cleanSpeech(t){return t.replace(/\([^)]*\)/g," ").replace(/（[^）]*）/g," ").replace(/\.{3,}|…/g,", ").replace(/["“”]/g,"").replace(/\s+/g," ").trim();}
let voiceCache=null;
function pickVoice(){const vs=speechSynthesis.getVoices().filter(v=>v.lang&&v.lang.startsWith("en"));return vs.find(v=>/Google US English/i.test(v.name))||vs.find(v=>/Samantha|Aria|Jenny|Natural/i.test(v.name))||vs.find(v=>v.lang==="en-US")||vs[0]||null;}
let playingBtn=null;
function setPlaying(btn){if(playingBtn&&playingBtn!==btn)playingBtn.classList.remove("playing");playingBtn=btn||null;if(playingBtn)playingBtn.classList.add("playing");}
function clearPlaying(){if(playingBtn){playingBtn.classList.remove("playing");playingBtn=null;}}
function speak(text,rate=0.95,btn=null){
  try{const t=cleanSpeech(text);if(!t)return;speechSynthesis.cancel();clearPlaying();const u=new SpeechSynthesisUtterance(t);u.lang="en-US";u.rate=rate;u.pitch=1;if(!voiceCache)voiceCache=pickVoice();if(voiceCache)u.voice=voiceCache;if(btn){setPlaying(btn);u.onend=()=>{if(playingBtn===btn)clearPlaying();};u.onerror=()=>{if(playingBtn===btn)clearPlaying();};}speechSynthesis.speak(u);}catch(e){clearPlaying();}
}
if("speechSynthesis" in window){speechSynthesis.onvoiceschanged=()=>{voiceCache=pickVoice();};speechSynthesis.getVoices();}
const SR=window.SpeechRecognition||window.webkitSpeechRecognition;
function norm(t){return t.toLowerCase().replace(/[^a-z0-9\s]/g," ").replace(/\s+/g," ").trim();}
function tokens(t){return norm(t).split(" ").filter(Boolean);}
function wordSim(refArr,hypArr){
  const n=refArr.length,m=hypArr.length;if(n===0)return{sim:0,ops:[]};
  const d=Array.from({length:n+1},()=>new Array(m+1).fill(0));
  for(let i=0;i<=n;i++)d[i][0]=i;for(let j=0;j<=m;j++)d[0][j]=j;
  for(let i=1;i<=n;i++)for(let j=1;j<=m;j++){const c=refArr[i-1]===hypArr[j-1]?0:1;d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+c);}
  const sim=Math.max(0,1-d[n][m]/Math.max(n,m));
  let i=n,j=m;const ops=[];
  while(i>0||j>0){if(i>0&&j>0&&refArr[i-1]===hypArr[j-1]){ops.push({t:"match",w:refArr[i-1]});i--;j--;}else if(i>0&&j>0&&d[i][j]===d[i-1][j-1]+1){ops.push({t:"sub",w:refArr[i-1]});i--;j--;}else if(i>0&&d[i][j]===d[i-1][j]+1){ops.push({t:"miss",w:refArr[i-1]});i--;}else{j--;}}
  return{sim,ops:ops.reverse()};
}

/* ================= PROGRESS ================= */
function longestFrom(nodes,id,memo={}){
  if(memo[id]!=null)return memo[id];memo[id]=1;
  const n=nodes[id];let best=0;const nexts=[];
  if(n.next)nexts.push(n.next);if(n.branch)n.branch.options.forEach(o=>nexts.push(o.next));
  nexts.forEach(t=>{best=Math.max(best,longestFrom(nodes,t,memo));});
  memo[id]=1+best;return memo[id];
}
function setProgress(){
  // Smooth gauge: fill by actual questions answered vs. done + longest remaining
  // path from the current node. Works for any scenario length and reaches ~100%
  // naturally on every branch, instead of counting fixed framework steps.
  const remain=scene&&curId?longestFrom(scene.nodes,curId):0;
  const total=Math.max(path.length+remain,estTotal,1);
  const pct=Math.min(100,Math.round(path.length/total*100));
  $("#pfill").style.width=pct+"%";
}

/* ================= FLOW ================= */
function startScene(s){
  scene=s;fw=FRAMEWORKS[s.framework];curId=s.start;
  path=[];passed=0;attempts=0;sessionWeak=false;combo=0;sessionXp=0;
  track("scene_start",{scene:s.id,lv:s.lv,test:!!testActive,pro:!!window.EMS_PRO});
  estTotal=longestFrom(s.nodes,s.start);
  // クイズ結果画面のペイウォールから直接来るパスがあるため #quiz も必ず隠す
  $("#menu").classList.add("hide");$("#quiz").classList.add("hide");$("#trainer").classList.remove("hide");
  $("#tScene").innerHTML=testActive?`<span class="test-banner">⚡ テスト ${testIdx+1}/${testQueue.length}</span>`:s.icon+" "+s.title;
  window.scrollTo(0,0);
  if(!STATS.onboarded&&!testActive){showMicPrimer();return;}
  speak(" ",1);renderNode();
}
function showMicPrimer(){
  // 発音判定が使えない環境では、マイクの案内をせず
  // 「聞いて進める学習モード」であることを最初に伝える
  if(!SR){
    const env=browserEnv();
    const hint=env.inapp==="line"?"LINEではなくブラウザで開くと、発音の自動判定が使えます。"
      :env.inapp?"アプリ内ブラウザではなく、Chromeなどで開くと発音の自動判定が使えます。"
      :"Chrome（Android・PC）で開くと、発音の自動判定が使えます。";
    $("#stage").innerHTML=`
      <div class="primer"><div class="primer-ic">🎧</div><h3>聞いて話す練習から始めましょう</h3>
        <p>このブラウザは発音のAI判定に対応していないため、お手本の音声を聞きながら自分のペースで進める学習モードで練習します。</p>
        <p class="primer-note">${hint}</p>
        <div class="primer-acts"><button class="b3 b3-green b3-lg" id="primerGo">練習を始める</button></div>
      </div>`;
    $("#primerGo").onclick=()=>{FX.tap();track("mic_primer",{choice:"no_sr"});STATS.onboarded=true;micOff=true;saveStats();renderNode();};
    return;
  }
  $("#stage").innerHTML=`
    <div class="primer"><div class="primer-ic">🎙️</div><h3>発音はマイクで自動判定します</h3>
      <p>英語の質問を声に出すと、AIが聞き取って「伝わるか」を判定します。次の画面でマイクの使用許可を求められたら「許可」を選んでください。</p>
      <p class="primer-note">マイクを使わず、文字だけで進めることもできます（いつでも「スキップ」で次へ）。</p>
      <div class="primer-acts"><button class="b3 b3-green b3-lg" id="primerMic">マイクを使って始める</button><button class="ghostlink" id="primerNo">声を出さずに進める</button></div>
    </div>`;
  $("#primerMic").onclick=()=>{FX.tap();track("mic_primer",{choice:"mic"});STATS.onboarded=true;micOff=false;saveStats();speak(" ",1);renderNode();};
  $("#primerNo").onclick=()=>{FX.tap();track("mic_primer",{choice:"text"});STATS.onboarded=true;micOff=true;saveStats();renderNode();};
}
$("#quitBtn").onclick=()=>{
  const inProgress=path.length>0||attempts>0;
  if(inProgress&&!confirm("学習を中断してメニューに戻りますか？\nこのシナリオの続きは保存されません。"))return;
  FX.tap();stopRecog();speechSynthesis.cancel();clearPlaying();testActive=false;
  $("#trainer").classList.add("hide");$("#menu").classList.remove("hide");renderMenuBody();
};
function showFrameworkHelp(){
  const rows=fw.steps.map(st=>`<div class="fwh-row"><span class="fwh-k">${st.k}</span><div><div class="fwh-w">${st.word}</div><div class="fwh-j">${st.jp}</div></div></div>`).join("");
  const old=document.getElementById("fwhOverlay");if(old)old.remove();
  document.body.insertAdjacentHTML("beforeend",`<div class="bm-overlay" id="fwhOverlay"><div class="bm-card"><div class="bm-head"><span>${fw.name}　${fw.desc}</span><button class="bm-close" id="fwhClose" aria-label="閉じる">✕</button></div><div class="bm-body"><p class="fwh-lead">${fw.jp}。各ステップの英語と意味は次のとおりです。</p>${rows}</div></div></div>`);
  $("#fwhClose").onclick=()=>$("#fwhOverlay").remove();
  $("#fwhOverlay").onclick=(e)=>{if(e.target.id==="fwhOverlay")$("#fwhOverlay").remove();};
}
function renderNode(){
  const node=scene.nodes[curId];failStreak=0;
  setProgress();
  const guiding=(STATS.guideDone||0)<2&&!testActive;
  let micLabel,micClass="b3 b3-lg b3-mic ",micAction;
  if(!SR){micLabel=`次へ ${I.go}`;micClass+="b3-green";micAction="next";}
  else if(micOff){micLabel=`次へ ${I.go}`;micClass+="b3-green";micAction="next";}
  else{micLabel=`${I.mic} 話す`;micClass+="b3-blue";micAction="rec";}
  $("#stage").innerHTML=`
    <div class="who"><span class="ava">🚑</span><span class="nm">あなた（救急隊）</span></div>
    <div class="bubble q"><div class="q-en">${node.q}</div><div class="q-jp">${node.qjp}</div><div class="tip">🧭<span>${node.purpose}</span></div></div>
    <div class="listen-row">
      <button class="play-btn" id="listenBtn"><span class="pb-ic">${I.spk}</span><span class="pb-tx">お手本</span></button>
      ${micAction==="rec"?`<button class="play-btn slow" id="slowBtn"><span class="pb-ic">${I.turtle}</span><span class="pb-tx">ゆっくり</span></button>`:""}
    </div>
    <div class="act">
      ${guiding&&micAction==="rec"?`<div class="mic-coach">🔊お手本を聞いて、🎙ボタンで声に出そう</div>`:""}
      <button class="${micClass}" id="micBtn">${micLabel}</button>
      <button class="ghostlink ${guiding?"skip-quiet":""}" id="skipBtn">${micAction==="rec"?"練習せずに進む →":"スキップ →"}</button>
    </div>
    <div id="judgeZone"></div>`;
  $("#listenBtn").onclick=(e)=>speak(node.q,0.95,e.currentTarget);
  const slowB=$("#slowBtn");if(slowB)slowB.onclick=(e)=>speak(node.q,0.62,e.currentTarget);
  $("#micBtn").onclick=()=>micAction==="rec"?toggleRecog(node):afterQuestion(node);
  $("#skipBtn").onclick=()=>{FX.tap();stopRecog();speechSynthesis.cancel();clearPlaying();sessionWeak=true;combo=0;afterQuestion(node);};
  setTimeout(()=>speak(node.q,0.95,$("#listenBtn")),350);
}
function stopRecog(){if(recog){try{recog.stop();}catch(e){}}recognizing=false;}
function toggleRecog(node){
  if(!SR){$("#judgeZone").innerHTML=`<div class="judge mid"><div class="j-head"><div class="j-mark">ℹ️</div><div><div class="j-label">このブラウザは音声認識に未対応です</div><div class="j-score">Chromeなら判定できます。スキップで進めましょう。</div></div></div></div>`;return;}
  const mic=$("#micBtn");if(recognizing){stopRecog();return;}
  FX.tap();speechSynthesis.cancel();clearPlaying();
  recog=new SR();recog.lang="en-US";recog.interimResults=false;recog.maxAlternatives=3;
  recognizing=true;mic.classList.add("rec");mic.innerHTML=`<span class="mic-wave"><i></i><i></i><i></i></span> 聞いています…`;
  $("#judgeZone").innerHTML=`<div class="speak-cue"><span class="sc-dot"></span>マイクに向かって、今すぐ話してください</div>`;
  recog.onresult=(e)=>{let best="",bs=-1;const ref=tokens(node.q);for(let k=0;k<e.results[0].length;k++){const c=e.results[0][k].transcript;const{sim}=wordSim(ref,tokens(c));if(sim>bs){bs=sim;best=c;}}judge(node,best);};
  recog.onerror=(e)=>{recognizing=false;mic.classList.remove("rec");mic.innerHTML=`${I.mic} もう一度話す`;const msg=e.error==="not-allowed"?"マイクが許可されていません":e.error==="no-speech"?"聞き取れませんでした。もう一度どうぞ。":"エラーが起きました。もう一度どうぞ。";const help=e.error==="not-allowed"?`<div class="j-score" style="margin-top:6px">アドレスバーの🔒（鍵）アイコン →「マイク」を「許可」に変更し、再読み込みしてください。声を出さずに進めるなら「スキップ」でも続けられます。</div>`:"";$("#judgeZone").innerHTML=`<div class="judge mid"><div class="j-head"><div class="j-mark">🎙️</div><div><div class="j-label">${msg}</div>${help}</div></div></div>`;};
  recog.onend=()=>{recognizing=false;mic.classList.remove("rec");if(!mic.innerHTML.includes("もう一度"))mic.innerHTML=`${I.mic} もう一度話す`;const jz=$("#judgeZone");if(jz&&jz.querySelector(".speak-cue"))jz.innerHTML="";};
  try{recog.start();}catch(e){recognizing=false;}
}
function comboMsg(n){
  if(n>=5)return "🌟 "+n+"連続！止まらない！";
  if(n===4)return "🔥🔥 4連続！絶好調！";
  if(n===3)return "🔥 3連続！すごい！";
  if(n===2)return "✨ 2連続！いい流れ！";
  return "";
}
function judge(node,heard){
  attempts++;
  const{sim,ops}=wordSim(tokens(node.q),tokens(heard));
  const pct=Math.round(sim*100);
  let cls,mark,label;
  if(pct>=80){cls="ok";mark="🎉";label="すばらしい！しっかり伝わります";}
  else if(pct>=55){cls="mid";mark="💪";label="おしい！もう少しはっきりと";}
  else{cls="ng";mark="🔁";label="もう一度チャレンジ！";}
  const diff=ops.map(o=>o.t==="match"?`<w>${o.w}</w>`:o.t==="sub"?`<x>${o.w}</x>`:`<m>${o.w}</m>`).join(" ");
  const pass=pct>=80;
  let xpGain=0,comboLine="";
  if(pass){
    passed++;failStreak=0;combo++;
    STATS.maxCombo=Math.max(STATS.maxCombo||0,combo);
    xpGain=pct>=95?12:10;addXp(xpGain);
    if(combo>=2){FX.combo(combo);comboLine=`<div class="fb-streak" style="margin:10px 0 0">${comboMsg(combo)}</div>`;}
    else FX.correct();
    FX.burst("+"+xpGain+" XP","#46a302");
  }else{sessionWeak=true;failStreak++;combo=0;FX.wrong();}
  const helpBlock=(!pass&&failStreak>=2)?`<div class="fail-help"><div class="fh-t">💡 うまくいかない時は</div><div class="fh-b">・🔊お手本をもう一度聞いて、リズムを真似てみましょう<br>・短く区切って、はっきり発音すると認識されやすいです<br>・周囲の音や、マイクの感度も影響します。気にせず先へ進んでOKです</div></div>`:"";
  const escapeLabel=(!pass&&failStreak>=2)?"聞けたことにして進む 👍":"進む";
  $("#judgeZone").innerHTML=`
    <div class="judge ${cls}">
      <div class="j-head"><div class="j-mark">${mark}</div><div><div class="j-label">${label}</div><div class="j-score">一致度 ${pct}%${pass?` ・ +${xpGain}XP`:""}</div></div></div>
      ${comboLine}
      <div class="j-heard">聞き取り：<b>${heard||"（なし）"}</b></div>
      <div class="diff">${diff}</div>
      ${helpBlock}
      <div class="act" style="margin-top:13px">${pass?`<button class="b3 b3-green b3-lg" id="goReply">つづける ${I.go}</button>`:`<button class="b3 b3-blue b3-lg" id="retry">${I.mic} もう一度</button><button class="ghostlink" id="goReply2">${escapeLabel}</button>`}</div>
    </div>`;
  if(pass){$("#goReply").onclick=()=>{FX.tap();afterQuestion(node);};}
  else{$("#retry").onclick=()=>toggleRecog(node);$("#goReply2").onclick=()=>{FX.tap();afterQuestion(node);};}
  setTimeout(()=>{const target=pass?$("#goReply"):$("#retry");if(target)target.scrollIntoView({behavior:"smooth",block:"center"});},100);
}
function afterQuestion(node){
  try{if(!localStorage.getItem("ems_first_q_done")){localStorage.setItem("ems_first_q_done","1");track("first_question_done",{scene:scene&&scene.id});}}catch(e){}
  if((STATS.guideDone||0)<2){STATS.guideDone=(STATS.guideDone||0)+1;saveStats();}
  if(node.branch)renderBranch(node);else renderReply(node,node.a,node.ajp,null);
}
function renderBranch(node){
  $("#stage").innerHTML=`<div class="who"><span class="ava">🚑</span><span class="nm">あなた（救急隊）</span></div><div class="bubble"><div class="q-en" style="font-size:1.05rem;color:var(--ink-soft);font-weight:700">${node.q}</div></div><div class="br-box"><div class="br-head">🔀 ${node.branch.question}</div><div class="br-sub">傷病者の返答を選びましょう</div><div class="br-opts" id="bopts"></div></div>`;
  const box=$("#bopts");
  node.branch.options.forEach(op=>{const b=document.createElement("button");b.className="bopt";b.innerHTML=`<div class="oen">🗣️ ${op.label}</div><div class="ojp">${op.jp}</div>`;b.onclick=()=>{FX.tap();const rep=op.setReply||{a:op.label,ajp:op.jp};renderReply(node,rep.a,rep.ajp,op.next,op.route);};box.appendChild(b);});
}
function renderReply(node,aEn,aJp,nextId,route){
  const isEnd=!!node.end;
  $("#stage").innerHTML=`
    <div class="who"><span class="ava">🤕</span><span class="nm">傷病者の返答</span></div>
    <div class="p-bubble"><div class="p-en">${aEn}</div><div class="p-jp" id="pjp"><span class="lab">日本語訳</span><span class="tx">${aJp}</span></div><div class="p-acts"><button class="play-btn" id="pPlay"><span class="pb-ic">${I.spk}</span><span class="pb-tx">もう一度</span></button><button class="play-btn" id="pTrans"><span class="pb-tx">日本語訳</span></button></div></div>
    ${route?`<div class="route-insight">🧭 <span>${route}</span></div>`:""}
    ${isEnd?`<div class="closing"><span class="cl">Closing ・ 締めの声かけ</span><div class="ce">${node.end.impr}</div><div class="cj">${node.end.imprJp}</div></div>`:""}
    <div class="act" style="margin-top:18px"><button class="b3 b3-green b3-lg" id="goNext">${isEnd?"結果を見る":"次へ"} ${I.go}</button></div>`;
  setTimeout(()=>speak(aEn,0.95,$("#pPlay")),350);
  $("#pPlay").onclick=(e)=>speak(aEn,0.95,e.currentTarget);
  $("#pTrans").onclick=(e)=>{const jp=$("#pjp");jp.classList.toggle("show");const tx=e.currentTarget.querySelector(".pb-tx");if(tx)tx.textContent=jp.classList.contains("show")?"訳を隠す":"日本語訳";};
  path.push({step:node.step,q:node.q});
  setProgress();
  $("#goNext").onclick=()=>{FX.tap();if(isEnd)finish();else{curId=nextId||node.next;renderNode();}};
}
function finish(){
  $("#pfill").style.width="100%";
  const rows=path.map((p,i)=>`<div class="rr"><span class="rt">${i+1}</span><span>${p.q}</span></div>`).join("");
  const allPass=passed>=path.length&&path.length>0;
  const runPct=path.length?Math.round(passed/path.length*100):0;
  if(allPass)addXp(15);
  recordResult(scene.id,runPct,sessionWeak);
  track("scene_finish",{scene:scene.id,pct:runPct,allPass,test:!!testActive});
  const act=recordActivity();
  if(testActive){testNext(rows,runPct,allPass);return;}
  FX.fanfare();FX.confetti({big:allPass});
  const msg=allPass?"全問しっかり発音できました！":passed>0?"いい調子！くり返して定着させよう。":"流れはばっちり。次は声に出してみよう。";
  const wasWeak=PROG[scene.id]&&PROG[scene.id].weak;
  const finNext=testActive?null:recommendNext(scene.id);
  $("#stage").innerHTML=`
    <div class="fin"><div class="ficon">${allPass?"🏆":"🎉"}</div><h3>${scene.title} クリア！</h3><p class="fm">${msg}</p>
      ${allPass?`<p class="fm" style="color:var(--green-dark);font-weight:900">✅ クリア記録を保存しました</p>`:wasWeak?`<p class="fm" style="color:var(--amber-dark);font-weight:900">⚠️ 苦手リストに追加しました</p>`:""}
      ${activityFeedback(act)}
      <div class="tiles"><div class="tile t-g"><small>合格</small><b>${passed}</b></div><div class="tile t-b"><small>質問</small><b>${path.length}</b></div><div class="tile t-a"><small>挑戦</small><b>${attempts}</b></div></div>
      <div class="route"><div class="rh">🧭 たどった問診ルート</div>${rows}</div>
      <div class="fin-acts"><button class="b3 b3-white b3-md" id="again">${allPass?"もう一度練習":"全問クリアに挑戦"}</button><button class="b3 b3-white b3-md" id="home">メニューへ</button></div>
      ${finNext&&!testActive?(()=>{const lk=typeof window.emsSceneStatus==="function"&&window.emsSceneStatus(finNext)==="locked";return `<div class="next-up"><div class="nu-label">${lk?"▶ つづきはProで":"▶ つぎのおすすめ"}</div><button class="nu-card" id="nextScene"><span class="nu-ic">${lk?"🔒":finNext.icon}</span><span class="nu-tx"><span class="nu-t">${finNext.title}</span><span class="nu-s">${lk?`Lv${finNext.lv}・タップしてProで解放`:`Lv${finNext.lv}・${FRAMEWORKS[finNext.framework].name}`}</span></span><span class="nu-go">${I.go}</span></button></div>`;})():""}
    </div>`;
  $("#again").onclick=()=>{FX.tap();startScene(scene);};
  $("#home").onclick=()=>{FX.tap();$("#trainer").classList.add("hide");$("#menu").classList.remove("hide");renderMenuBody();};
  const ns=$("#nextScene");if(ns&&finNext){ns.onclick=()=>{FX.tap();startScene(finNext);};}
}
function recommendNext(justFinishedId){
  // 無料枠モデル：非Proも通常のおすすめロジックを使う。
  // ただし今日の枠を使用済みなら、再挑戦できる「今日の1問」を優先しておすすめ
  // （未クリアの場合のみ）。クリア済み・直後なら通常ロジックへ落ち、
  // そのおすすめをタップするとペイウォールが開いて購入導線につながる。
  if(!window.EMS_PRO&&typeof window.emsQuotaInfo==="function"){
    const q=window.emsQuotaInfo();
    if(q.sceneId&&q.sceneId!==justFinishedId){
      const today=SCENES.find(s=>s.id===q.sceneId);
      if(today&&!(PROG[today.id]&&PROG[today.id].cleared))return today;
    }
  }
  const cleared=new Set(SCENES.filter(s=>PROG[s.id]&&PROG[s.id].cleared).map(s=>s.id));
  const hi=(typeof highestUnlocked==="function")?highestUnlocked():10;
  const candidates=SCENES.filter(s=>s.id!==justFinishedId&&s.lv<=hi&&!cleared.has(s.id));
  let pool=candidates.length?candidates:SCENES.filter(s=>s.id!==justFinishedId);
  pool.sort((a,b)=>a.lv-b.lv);
  const minLv=pool[0]?pool[0].lv:1;
  const sameLv=pool.filter(s=>s.lv===minLv);
  return sameLv[Math.floor(Math.random()*sameLv.length)]||null;
}

/* ================= TEST MODE ================= */
let testScores=[];
function startTest(){
  track("test_start",{});
  const pool=[...SCENES];
  for(let i=pool.length-1;i>0;i--){const j=Math.floor(Math.random()*(i+1));[pool[i],pool[j]]=[pool[j],pool[i]];}
  testQueue=pool.slice(0,5);testIdx=0;testActive=true;testScores=[];sessionXp=0;
  startScene(testQueue[0]);
}
function testNext(rows,runPct,allPass){
  testScores.push({title:scene.title,pct:runPct});testIdx++;
  if(testIdx<testQueue.length){
    FX.correct();
    $("#stage").innerHTML=`<div class="fin"><div class="ficon">${allPass?"✅":"➡️"}</div><h3>${scene.title}</h3><p class="fm">一致度 ${runPct}%　・　テスト ${testIdx}/${testQueue.length} 完了</p><div class="fin-acts"><button class="b3 b3-green b3-lg" id="tnext">次の問題へ ${I.go}</button></div></div>`;
    $("#tnext").onclick=()=>{FX.tap();startScene(testQueue[testIdx]);};
  }else{
    testActive=false;
    const avg=Math.round(testScores.reduce((a,b)=>a+b.pct,0)/testScores.length);
    if(avg>=60)addXp(20);
    recordActivity();
    const grade=avg>=80?"🥇 合格レベル":avg>=60?"🥈 あと少し":"🥉 練習を続けよう";
    if(avg>=60){FX.fanfare();FX.confetti({big:avg>=80});}
    const list=testScores.map(t=>`<div class="rr"><span class="rt">${t.pct}%</span><span>${t.title}</span></div>`).join("");
    $("#stage").innerHTML=`<div class="fin"><div class="ficon">${avg>=80?"🏆":"📊"}</div><h3>実戦テスト 結果</h3><p class="fm">${grade}</p>${sessionXp>0?`<div class="fb-wrap"><div class="fb-badge" style="background:#fff8e0;color:#b8860b">💎 +${sessionXp} XP 獲得！</div></div>`:""}<div class="tiles"><div class="tile t-b"><small>平均スコア</small><b>${avg}%</b></div><div class="tile t-g"><small>出題数</small><b>${testScores.length}</b></div></div><div class="route"><div class="rh">📝 出題されたシナリオ</div>${list}</div><div class="fin-acts"><button class="b3 b3-white b3-md" id="tagain">もう一度テスト</button><button class="b3 b3-green b3-md" id="thome">メニューへ</button></div></div>`;
    $("#tagain").onclick=()=>{FX.tap();startTest();};
    $("#thome").onclick=()=>{FX.tap();$("#trainer").classList.add("hide");$("#menu").classList.remove("hide");renderMenuBody();};
  }
}
