(() => {
  const STORAGE_KEY = "shouqianji_mobile_v2";
  const LEGACY_STORAGE_KEY = "shouqianji_mvp_v1";
  const defaultState = {
    version: 1,
    settings: { dailyBudget: null, monthlySavingTarget: null, currency: "¥" },
    transactions: [],
    goals: [],
    wishes: [],
    avoidedSpend: 0
  };

  const expenseCategories = [
    ["餐饮","🍜"],["交通","🚌"],["购物","🛍️"],["日用品","🧻"],
    ["娱乐","🎮"],["社交","🍻"],["住房","🏠"],["其他","🧾"]
  ];
  const incomeCategories = [
    ["工资","💼"],["奖金","🎁"],["报销","📄"],["退款","↩️"],
    ["兼职","🧩"],["理财","📈"],["红包","🧧"],["其他","➕"]
  ];

  let state = loadState();
  let entryType = "expense";
  let entryCategory = expenseCategories[0][0];
  let recordFilter = "all";
  let analysisDate = new Date();
  let simpleSettingKey = null;

  const $ = (s, root=document) => root.querySelector(s);
  const $$ = (s, root=document) => [...root.querySelectorAll(s)];

  function loadState(){
    try{
      const raw = localStorage.getItem(STORAGE_KEY) || localStorage.getItem(LEGACY_STORAGE_KEY);
      if(!raw) return structuredClone(defaultState);
      const parsed = JSON.parse(raw);
      return {
        ...structuredClone(defaultState),
        ...parsed,
        settings: {...defaultState.settings, ...(parsed.settings||{})},
        transactions: Array.isArray(parsed.transactions) ? parsed.transactions : [],
        goals: Array.isArray(parsed.goals) ? parsed.goals : [],
        wishes: Array.isArray(parsed.wishes) ? parsed.wishes : [],
        avoidedSpend: Number(parsed.avoidedSpend||0)
      };
    }catch(e){ return structuredClone(defaultState); }
  }
  function saveState(){
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    renderAll();
  }
  function money(n){
    const cur = state.settings.currency || "¥";
    const v = Number(n||0);
    return cur + v.toLocaleString("zh-CN",{minimumFractionDigits:2,maximumFractionDigits:2});
  }
  function localDateStr(d=new Date()){
    const y=d.getFullYear(), m=String(d.getMonth()+1).padStart(2,"0"), day=String(d.getDate()).padStart(2,"0");
    return `${y}-${m}-${day}`;
  }
  function monthKey(d){ return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}`; }
  function sum(list,type=null){
    return list.filter(x=>!type || x.type===type).reduce((a,b)=>a+Number(b.amount||0),0);
  }
  function txForDate(dateStr){ return state.transactions.filter(x=>x.date===dateStr); }
  function txForMonth(date){
    const key=monthKey(date);
    return state.transactions.filter(x=>x.date?.startsWith(key));
  }
  function escapeHtml(s=""){
    return String(s).replace(/[&<>"']/g, c=>({"&":"&amp;","<":"&lt;",">":"&gt;","\"":"&quot;","'":"&#039;"}[c]));
  }
  function toast(msg){
    const el=$("#toast"); el.textContent=msg; el.classList.add("show");
    clearTimeout(window.__toastTimer); window.__toastTimer=setTimeout(()=>el.classList.remove("show"),1600);
  }

  function renderAll(){
    renderHome(); renderQuickRepeats(); renderRecords(); renderGoals(); renderWishes(); renderAnalysis(); renderSettings(); updateNetworkBadge(); updatePersistenceStatus();
  }

  function renderHome(){
    const now=new Date(), today=localDateStr(now), monthTx=txForMonth(now), todayTx=txForDate(today);
    const mi=sum(monthTx,"income"), me=sum(monthTx,"expense"), mn=mi-me;
    const ti=sum(todayTx,"income"), te=sum(todayTx,"expense"), tn=ti-te;

    $("#todayLabel").textContent = now.toLocaleDateString("zh-CN",{month:"long",day:"numeric",weekday:"short"});
    $("#monthNet").textContent=money(mn);
    $("#monthIncome").textContent=money(mi);
    $("#monthExpense").textContent=money(me);
    $("#todayIncome").textContent=money(ti);
    $("#todayExpense").textContent=money(te);
    $("#todayNet").textContent=money(tn);
    $("#todaySummary").textContent=`${todayTx.length} 笔`;

    const budget=Number(state.settings.dailyBudget);
    if(budget>0){
      const kept=Math.max(0,budget-te), over=Math.max(0,te-budget);
      $("#todaySaved").textContent=over>0?`超 ${money(over)}`:money(kept);
      $("#todayBudgetHint").textContent = over>0
        ? `今天比自由支出预算多了 ${money(over)}。不用补偿式节食/消费，明天回到正常预算即可。`
        : te===0 ? `今天还没有支出记录。按每日预算计算，当前可守住 ${money(budget)}。`
        : `今天的自由支出预算还剩 ${money(kept)}。`;
    }else{
      $("#todaySaved").textContent="未设置预算";
      $("#todayBudgetHint").innerHTML=`设置一个现实的每日自由支出预算后，我会帮你计算“今天守住多少钱”。 <button class="text-btn" id="inlineBudgetBtn">现在设置</button>`;
      setTimeout(()=>$("#inlineBudgetBtn")?.addEventListener("click",()=>openSimpleSetting("dailyBudget","每日可自由支出预算","例如 100")),0);
    }

    const target=Number(state.settings.monthlySavingTarget);
    if(target>0){
      const pct=Math.max(0,Math.min(100,mn/target*100));
      $("#savingsTargetText").textContent=`${money(Math.max(mn,0))} / ${money(target)}`;
      $("#savingsProgress").style.width=pct+"%";
      $("#monthStatus").textContent=mn>=target?"目标已达成":mn>0?`完成 ${Math.round(pct)}%`:"继续积累";
    }else{
      $("#savingsTargetText").textContent="未设置";
      $("#savingsProgress").style.width="0%";
      $("#monthStatus").textContent=monthTx.length?"已开始记录":"开始记录";
    }

    const recent=[...state.transactions].sort((a,b)=>(b.date+b.createdAt).localeCompare(a.date+a.createdAt)).slice(0,5);
    $("#recentList").innerHTML=recent.length?recent.map(txHtml).join(""):`<div class="list-empty">还没有记录。记下第一笔就算开始。</div>`;

    const daysRecorded = new Set(txForMonth(now).map(x=>x.date)).size;
    const elapsed = now.getDate();
    const completion = elapsed ? Math.round(daysRecorded/elapsed*100) : 0;
    $("#monthCompletion").textContent=Math.min(100,completion)+"%";

    const streak=calcStreak();
    $("#streakBadge").textContent=`${streak} 天`;
    const msg = streak>=30 ? "你已经把记账变成习惯了。接下来重点不是更严格，而是保持稳定。"
      : streak>=14 ? "连续两周以上了。现在最有价值的是继续保持低摩擦记录。"
      : streak>=7 ? "已经坚持一周。别追求完美，把漏记补上就好。"
      : state.transactions.length ? "今天继续记一笔，就比昨天更清楚自己的钱去了哪里。" : "今天记下第一笔，就算正式开始。";
    $("#motivationText").textContent=msg;
  }

  function txHtml(tx){
    const cats=tx.type==="expense"?expenseCategories:incomeCategories;
    const icon=(cats.find(c=>c[0]===tx.category)||["","🧾"])[1];
    return `<div class="tx-item" data-id="${tx.id}">
      <div class="tx-icon">${icon}</div>
      <div class="tx-main">
        <b>${escapeHtml(tx.category)}</b>
        <small>${escapeHtml(tx.note||"无备注")} · ${tx.date}</small>
      </div>
      <div class="tx-amount ${tx.type}">${tx.type==="expense"?"-":"+"}${money(tx.amount)}</div>
    </div>`;
  }

  function calcStreak(){
    const set=new Set(state.transactions.map(x=>x.date));
    let d=new Date(), count=0;
    if(!set.has(localDateStr(d))){
      d.setDate(d.getDate()-1);
    }
    while(set.has(localDateStr(d))){
      count++; d.setDate(d.getDate()-1);
    }
    return count;
  }


  function renderQuickRepeats(){
    const root=$("#quickRepeatList"); if(!root) return;
    const cutoff=new Date(); cutoff.setDate(cutoff.getDate()-45);
    const map=new Map();
    [...state.transactions].filter(t=>new Date(t.date+"T00:00:00")>=cutoff).forEach(t=>{
      const key=[t.type,t.category,t.note||"",Number(t.amount).toFixed(2)].join("|");
      if(!map.has(key)) map.set(key,{...t,count:0,last:t.date});
      const item=map.get(key); item.count++; if(t.date>item.last)item.last=t.date;
    });
    const items=[...map.values()].sort((a,b)=>(b.count-a.count)||b.last.localeCompare(a.last)).slice(0,6);
    if(!items.length){root.innerHTML='<div class="list-empty">记几天以后，这里会自动出现常用消费和收入。</div>';return;}
    root.innerHTML=items.map((t,i)=>`<button class="quick-repeat" data-repeat="${i}"><b>${t.type==="expense"?"－":"＋"} ${escapeHtml(t.category)}</b><small>${escapeHtml(t.note||"无备注")} · 用过 ${t.count} 次</small><strong>${money(t.amount)}</strong></button>`).join("");
    $$('[data-repeat]').forEach(b=>b.onclick=()=>{
      const t=items[Number(b.dataset.repeat)]; openEntry(t.type);
      entryCategory=t.category; $("#entryAmount").value=t.amount; $("#entryNote").value=t.note||""; renderCategoryPicker();
      haptic();
    });
  }

  function haptic(){ try{ if(navigator.vibrate) navigator.vibrate(18); }catch(e){} }

  function updateNetworkBadge(){
    const el=$("#networkBadge"); if(!el)return;
    if(window.AndroidBridge){ el.textContent="本机"; el.classList.remove("offline"); return; }
    const online=navigator.onLine; el.textContent=online?"在线":"离线可记"; el.classList.toggle("offline",!online);
  }

  async function updatePersistenceStatus(){
    const el=$("#persistenceValue"); if(!el)return;
    if(window.AndroidBridge){ el.textContent="应用内保存 ✓"; return; }
    if(!navigator.storage?.persisted){el.textContent="不支持 ›";return;}
    try{ const ok=await navigator.storage.persisted(); el.textContent=ok?"已加强 ✓":"可申请 ›"; }catch(e){el.textContent="可申请 ›";}
  }

  async function requestPersistence(){
    if(window.AndroidBridge){ toast("当前为 Android 应用版，数据已保存在应用本机空间"); return; }
    if(!navigator.storage?.persist){toast("当前浏览器不支持此功能");return;}
    try{
      const ok=await navigator.storage.persist();
      await updatePersistenceStatus();
      toast(ok?"已请求长期保留本机数据":"浏览器暂未授予长期保留权限");
    }catch(e){toast("无法申请数据持久化");}
  }

  function renderRecords(){
    const arr=[...state.transactions]
      .filter(x=>recordFilter==="all"||x.type===recordFilter)
      .sort((a,b)=>(b.date+(b.createdAt||"")).localeCompare(a.date+(a.createdAt||"")));
    $("#recordsList").innerHTML=arr.length?arr.map(txHtml).join(""):`<div class="list-empty">这里还没有记录。</div>`;
  }

  function renderGoals(){
    const list=$("#goalsList");
    if(!state.goals.length){ list.innerHTML=`<div class="card list-empty">还没有目标。可以从“应急储备”或一个真正想买的东西开始。</div>`; return; }
    list.innerHTML=state.goals.map(g=>{
      const pct=Math.max(0,Math.min(100,Number(g.current||0)/Number(g.target||1)*100));
      const left=Math.max(0,Number(g.target)-Number(g.current||0));
      return `<div class="goal-card" data-goal="${g.id}">
        <div class="goal-top">
          <div><h3>${escapeHtml(g.name)}</h3><p>还差 ${money(left)}</p></div>
          <div class="goal-amount">${money(g.current)} / ${money(g.target)}</div>
        </div>
        <div class="goal-progress"><div style="width:${pct}%"></div></div>
        <div class="goal-actions">
          <small>${Math.round(pct)}% ${pct>=100?"· 已完成 🎉":""}</small>
          <div>
            <button class="mini-btn" data-goal-add="${g.id}">＋ 存入</button>
            <button class="mini-btn danger-text" data-goal-delete="${g.id}">删除</button>
          </div>
        </div>
      </div>`;
    }).join("");
    $$("[data-goal-add]").forEach(b=>b.onclick=()=>goalDeposit(b.dataset.goalAdd));
    $$("[data-goal-delete]").forEach(b=>b.onclick=()=>deleteGoal(b.dataset.goalDelete));
  }

  function renderWishes(){
    const now=new Date();
    const pending=state.wishes.filter(w=>w.status==="pending");
    $("#wishList").innerHTML=pending.length?pending.map(w=>{
      const start=new Date(w.createdAt), ready=new Date(start); ready.setDate(ready.getDate()+Number(w.cooldownDays||3));
      const days=Math.ceil((ready-now)/86400000);
      const readyNow=days<=0;
      return `<div class="wish-item">
        <div class="tx-icon">⏳</div>
        <div class="wish-main">
          <b>${escapeHtml(w.name)} · ${money(w.amount)}</b>
          <small>${readyNow?"冷静期已到，可以重新决定":`再等 ${days} 天`}</small>
        </div>
        <div class="wish-actions">
          <button class="tiny-btn buy" data-wish-buy="${w.id}">买了</button>
          <button class="tiny-btn cancel" data-wish-cancel="${w.id}">不买了</button>
        </div>
      </div>`;
    }).join(""):`<div class="list-empty">冷静区是空的。下次想冲动消费时，可以先放这里。</div>`;
    $$("[data-wish-buy]").forEach(b=>b.onclick=()=>wishBought(b.dataset.wishBuy));
    $$("[data-wish-cancel]").forEach(b=>b.onclick=()=>wishCancelled(b.dataset.wishCancel));
  }

  function renderAnalysis(){
    $("#analysisMonthLabel").textContent=analysisDate.toLocaleDateString("zh-CN",{year:"numeric",month:"long"});
    const arr=txForMonth(analysisDate), inc=sum(arr,"income"), exp=sum(arr,"expense"), net=inc-exp;
    const rate=inc>0?Math.round(net/inc*100):0;
    $("#savingRate").textContent=`${rate}%`;

    const catMap={};
    arr.filter(x=>x.type==="expense").forEach(x=>catMap[x.category]=(catMap[x.category]||0)+Number(x.amount));
    const cats=Object.entries(catMap).sort((a,b)=>b[1]-a[1]);
    $("#topCategory").textContent=cats[0]?.[0]||"暂无";
    $("#topCategoryAmount").textContent=money(cats[0]?.[1]||0);

    const max=cats[0]?.[1]||1;
    $("#categoryBars").innerHTML=cats.length?cats.map(([name,amt])=>`
      <div class="bar-row">
        <div class="bar-label">${escapeHtml(name)}</div>
        <div class="bar-track"><div style="width:${Math.max(4,amt/max*100)}%"></div></div>
        <div class="bar-amount">${money(amt)}</div>
      </div>`).join(""):`<div class="list-empty">当月还没有支出数据。</div>`;

    renderWeekly();

    let advice;
    if(!arr.length) advice="先不用做复杂预算。只要连续记录几天，数据开始成形后，再决定最值得优化的一项支出。";
    else if(inc===0 && exp>0) advice="这个月已经有支出记录，但还没有收入记录。把收入也补上，净存率才有参考意义。";
    else if(net<0) advice="这个月目前是负结余。先找出最大支出类别，不要求完全停止，只尝试下周减少一次非必要消费。";
    else if(cats.length){
      const top=cats[0];
      const pct=exp?Math.round(top[1]/exp*100):0;
      advice=`本月最大支出是“${top[0]}”，约占支出的 ${pct}%。下一步只盯这一类：尝试减少 5%～10%，不要同时削减所有消费。`;
    }else advice="当前结余不错。重点不是进一步压缩，而是把这种稳定状态保持到月底。";
    $("#singleAdvice").textContent=advice;
  }

  function renderWeekly(){
    const days=[];
    let max=1;
    for(let i=6;i>=0;i--){
      const d=new Date(); d.setDate(d.getDate()-i);
      const date=localDateStr(d);
      const exp=sum(txForDate(date),"expense");
      max=Math.max(max,exp);
      days.push({d,date,exp});
    }
    $("#weeklyBars").innerHTML=days.map(x=>{
      const h=Math.max(3,x.exp/max*110);
      return `<div class="week-col"><b>${x.exp?money(x.exp):""}</b><div class="stick" style="height:${h}px"></div><small>${x.d.toLocaleDateString("zh-CN",{weekday:"short"})}</small></div>`;
    }).join("");
  }

  function renderSettings(){
    $("#dailyBudgetValue").textContent=Number(state.settings.dailyBudget)>0?money(state.settings.dailyBudget)+" ›":"未设置 ›";
    $("#monthTargetValue").textContent=Number(state.settings.monthlySavingTarget)>0?money(state.settings.monthlySavingTarget)+" ›":"未设置 ›";
  }

  function showPage(name){
    $$(".page").forEach(p=>p.classList.toggle("active",p.dataset.page===name));
    $$(".bottom-nav button").forEach(b=>b.classList.toggle("active",b.dataset.nav===name));
    window.scrollTo({top:0,behavior:"smooth"});
    if(name==="analysis") renderAnalysis();
  }

  function openModal(id){ $("#"+id).classList.add("open"); }
  function closeModal(el){ el.closest(".modal-backdrop")?.classList.remove("open"); }

  function renderCategoryPicker(){
    const cats=entryType==="expense"?expenseCategories:incomeCategories;
    if(!cats.some(c=>c[0]===entryCategory)) entryCategory=cats[0][0];
    $("#categoryPicker").innerHTML=cats.map(([n,i])=>`<button class="category-chip ${n===entryCategory?"active":""}" data-cat="${n}">${i} ${n}</button>`).join("");
    $$("[data-cat]").forEach(b=>b.onclick=()=>{entryCategory=b.dataset.cat;renderCategoryPicker();});
  }

  function openEntry(type="expense"){
    entryType=type; entryCategory=(type==="expense"?expenseCategories:incomeCategories)[0][0];
    $("#entryAmount").value=""; $("#entryNote").value=""; $("#entryDate").value=localDateStr();
    $$(".type-toggle button").forEach(b=>b.classList.toggle("active",b.dataset.entryType===type));
    $("#entryTitle").textContent=type==="expense"?"记一笔支出":"记一笔收入";
    renderCategoryPicker(); openModal("entryModal"); setTimeout(()=>$("#entryAmount").focus(),80);
  }

  function saveEntry(){
    const amount=Number($("#entryAmount").value), date=$("#entryDate").value;
    if(!(amount>0)){toast("请输入金额");return;}
    if(!date){toast("请选择日期");return;}
    state.transactions.push({
      id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),
      type:entryType,amount,category:entryCategory,date,
      note:$("#entryNote").value.trim(),
      createdAt:new Date().toISOString()
    });
    localStorage.setItem(STORAGE_KEY,JSON.stringify(state));
    $("#entryModal").classList.remove("open");
    renderAll();
    haptic(); toast(entryType==="expense"?"支出已记下":"收入已记下");
  }

  function saveGoal(){
    const name=$("#goalName").value.trim(), target=Number($("#goalTarget").value), current=Number($("#goalCurrent").value||0);
    if(!name){toast("给目标起个名字");return;}
    if(!(target>0)){toast("请输入目标金额");return;}
    state.goals.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name,target,current:Math.max(0,current),createdAt:new Date().toISOString()});
    $("#goalModal").classList.remove("open"); $("#goalName").value="";$("#goalTarget").value="";$("#goalCurrent").value="";
    saveState(); toast("目标已创建");
  }

  function goalDeposit(id){
    const g=state.goals.find(x=>x.id===id); if(!g)return;
    const v=prompt(`向“${g.name}”存入多少？`);
    if(v===null)return;
    const n=Number(v); if(!(n>0)){toast("请输入有效金额");return;}
    g.current=Number(g.current||0)+n; saveState(); toast("进度又往前了一点");
  }
  function deleteGoal(id){
    const g=state.goals.find(x=>x.id===id); if(!g)return;
    if(confirm(`删除目标“${g.name}”？`)){state.goals=state.goals.filter(x=>x.id!==id);saveState();}
  }

  function saveWish(){
    const name=$("#wishName").value.trim(), amount=Number($("#wishAmount").value||0), cooldownDays=Number($("#wishDays").value||3);
    if(!name){toast("写下想买什么");return;}
    state.wishes.push({id:crypto.randomUUID?crypto.randomUUID():String(Date.now()),name,amount:Math.max(0,amount),cooldownDays:Math.max(1,cooldownDays),createdAt:new Date().toISOString(),status:"pending"});
    $("#wishModal").classList.remove("open");$("#wishName").value="";$("#wishAmount").value="";$("#wishDays").value="3";
    saveState();toast("先放进冷静区");
  }
  function wishBought(id){
    const w=state.wishes.find(x=>x.id===id); if(!w)return;
    w.status="bought"; saveState(); toast("已标记为买了");
  }
  function wishCancelled(id){
    const w=state.wishes.find(x=>x.id===id); if(!w)return;
    w.status="cancelled"; state.avoidedSpend+=Number(w.amount||0); saveState(); toast(`这次守住了 ${money(w.amount)}`);
  }

  function openSimpleSetting(key,title,label){
    simpleSettingKey=key; $("#simpleModalTitle").textContent=title; $("#simpleModalLabel").textContent=label;
    $("#simpleModalValue").value=state.settings[key]??""; openModal("simpleModal");
  }
  function saveSimpleSetting(){
    const v=Number($("#simpleModalValue").value);
    if(v<0 || Number.isNaN(v)){toast("请输入有效金额");return;}
    state.settings[simpleSettingKey]=v>0?v:null;
    $("#simpleModal").classList.remove("open");saveState();toast("设置已保存");
  }

  function exportData(){
    const payload=JSON.stringify(state,null,2);
    if(window.AndroidBridge && typeof window.AndroidBridge.exportBackup==="function"){
      window.AndroidBridge.exportBackup(payload, `守钱记备份_${localDateStr()}.json`);
      return;
    }
    const blob=new Blob([payload],{type:"application/json"});
    const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`守钱记备份_${localDateStr()}.json`;a.click();URL.revokeObjectURL(a.href);
  }
  function importData(file){
    const reader=new FileReader();
    reader.onload=()=>{
      try{
        const data=JSON.parse(reader.result);
        if(!data || !Array.isArray(data.transactions)) throw new Error();
        state={...structuredClone(defaultState),...data,settings:{...defaultState.settings,...(data.settings||{})}};
        saveState();toast("备份已导入");
      }catch(e){toast("备份文件格式不正确");}
    };
    reader.readAsText(file);
  }



  window.handleAndroidBack = function(){
    const openModalEl=document.querySelector(".modal-backdrop.open");
    if(openModalEl){ openModalEl.classList.remove("open"); return true; }
    const activePage=document.querySelector(".page.active");
    if(activePage && activePage.dataset.page!=="home"){ showPage("home"); return true; }
    return false;
  };

  function bind(){
    $$(".bottom-nav [data-nav]").forEach(b=>b.onclick=()=>showPage(b.dataset.nav));
    $$("[data-nav-to]").forEach(b=>b.onclick=()=>showPage(b.dataset.navTo));
    $$("[data-open-entry]").forEach(b=>b.onclick=()=>openEntry(b.dataset.openEntry));
    $$(".close-modal").forEach(b=>b.onclick=()=>closeModal(b));
    $$(".modal-backdrop").forEach(m=>m.addEventListener("click",e=>{if(e.target===m)m.classList.remove("open")}));
    $$(".type-toggle [data-entry-type]").forEach(b=>b.onclick=()=>{
      entryType=b.dataset.entryType; entryCategory=(entryType==="expense"?expenseCategories:incomeCategories)[0][0];
      $$(".type-toggle button").forEach(x=>x.classList.toggle("active",x===b));
      $("#entryTitle").textContent=entryType==="expense"?"记一笔支出":"记一笔收入";renderCategoryPicker();
    });
    $("#saveEntry").onclick=saveEntry;
    $("#addGoalBtn").onclick=()=>openModal("goalModal");
    $("#saveGoal").onclick=saveGoal;
    $("#addWishBtn").onclick=()=>openModal("wishModal");
    $("#saveWish").onclick=saveWish;
    $("#settingsBudget").onclick=()=>openSimpleSetting("dailyBudget","设置每日预算","每天可以自由支出多少");
    $("#settingsTarget").onclick=()=>openSimpleSetting("monthlySavingTarget","设置本月存钱目标","这个月希望净存多少");
    $("#openSettings").onclick=()=>showPage("me");
    $("#saveSimpleSetting").onclick=saveSimpleSetting;
    $("#exportData").onclick=exportData;
    $("#importData").onchange=e=>e.target.files?.[0]&&importData(e.target.files[0]);

    $("#requestPersistence").onclick=requestPersistence;
    window.addEventListener("online",updateNetworkBadge); window.addEventListener("offline",updateNetworkBadge);

    $("#resetData").onclick=()=>{
      if(confirm("确定清空所有记账、目标和设置吗？此操作无法撤销。")){
        state=structuredClone(defaultState);localStorage.removeItem(STORAGE_KEY);renderAll();toast("已清空");
      }
    };
    $$("#recordTypeFilter button").forEach(b=>b.onclick=()=>{
      recordFilter=b.dataset.filter; $$("#recordTypeFilter button").forEach(x=>x.classList.toggle("active",x===b));renderRecords();
    });
    $("#prevMonth").onclick=()=>{analysisDate=new Date(analysisDate.getFullYear(),analysisDate.getMonth()-1,1);renderAnalysis();};
    $("#nextMonth").onclick=()=>{analysisDate=new Date(analysisDate.getFullYear(),analysisDate.getMonth()+1,1);renderAnalysis();};
  }

  bind();
  renderAll();
})();