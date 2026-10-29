const $=id=>document.getElementById(id);
const money=value=>new Intl.NumberFormat('en-MY',{style:'currency',currency:'MYR'}).format(value/100);
let config,session,busy=false;
async function api(path,method='GET',body) {
  const response=await fetch(path,{method,headers:{'Content-Type':'application/json'},body:body===undefined?undefined:JSON.stringify(body)});
  const value=await response.json();
  if(!response.ok) throw new Error(value.error||'Request failed');
  return value;
}
async function run(action) {
  if(busy) return;
  busy=true; document.querySelectorAll('button').forEach(b=>b.disabled=true);
  try {await action();} catch(error) {$('status').textContent=error.message;}
  finally {busy=false;document.querySelectorAll('button').forEach(b=>b.disabled=false);if(session) setCompleted();}
}
function setCompleted() {
  const completed=session.summary.completed;
  $('advance-one').disabled=completed; $('advance-three').disabled=completed;
  document.querySelectorAll('[data-side]').forEach(button=>button.disabled=completed);
}
function render() {
  const {game,summary}=session;
  $('dashboard').hidden=false;
  $('game-mode').textContent=`${game.mode.replaceAll('-',' ')} / ${game.difficulty} / ${game.ruleset}`;
  $('age').textContent=`Age ${summary.age} · Month ${summary.month}${summary.retired?' · Retired':''}`;
  $('metrics').replaceChildren(...[
    ['Cash balance',money(summary.cash)],['Net worth',money(summary.netWorth)],
    ['Monthly salary',money(game.monthlySalary)],['Monthly living cost',money(summary.age<45?200000:summary.age<60?300000:250000)]
  ].map(([label,value])=>{
    const card=document.createElement('div');card.className='metric';
    const title=document.createElement('p');title.textContent=label;
    const amount=document.createElement('strong');amount.textContent=value;
    card.append(title,amount);return card;
  }));
  $('assets').replaceChildren(...config.assets.map(asset=>{
    const row=document.createElement('tr');
    for(const text of [asset.name,money(game.prices[asset.id]),game.holdings[asset.id]||0]) {const cell=document.createElement('td');cell.textContent=text;row.append(cell);}
    const controls=document.createElement('td');
    for(const side of ['buy','sell']) {
      const button=document.createElement('button');button.className='small secondary';button.dataset.side=side;
      button.textContent=`${side==='buy'?'Buy':'Sell'} 1`;button.setAttribute('aria-label',`${side} one unit of ${asset.name}`);
      button.onclick=()=>run(async()=>{session=await api(`/api/games/${session.id}/trade`,'POST',{assetId:asset.id,side,quantity:1});render();$('status').textContent='Trade settled. Save to keep your progress.';});
      controls.append(button);
    }
    row.append(controls);return row;
  }));
  $('systems').replaceChildren(...config.systems.map(system=>{
    const card=document.createElement('section');card.className='panel';
    const title=document.createElement('h3');title.textContent=system.name;
    const description=document.createElement('p');description.textContent=system.description;
    const status=document.createElement('span');status.className='badge';status.textContent='Planned';
    card.append(title,description,status);return card;
  }));
  $('report-title').textContent=summary.completed?'Final report':'Journey report';
  $('report-text').textContent=`${summary.monthsPlayed} months played. Income: ${money(summary.totalIncome)}. Living costs: ${money(summary.totalExpenses)}. Portfolio: ${money(summary.portfolioValue)}.${summary.negativeCash?' Cash is negative; borrowing and bankruptcy rules are not implemented.':''}`;
  $('history').replaceChildren(...game.history.slice(-6).reverse().map(month=>{
    const item=document.createElement('li');item.textContent=`Age ${Math.floor((month.ageMonths-1)/12)}, month ${(month.ageMonths-1)%12+1} · Income ${money(month.salary)} · Expenses ${money(month.expenses)} · Closing cash ${money(month.cash)}`;return item;
  }));
  setCompleted();
}
$('new-game').onsubmit=event=>{event.preventDefault();run(async()=>{
  session=await api('/api/games','POST',Object.fromEntries(new FormData(event.target)));
  render();$('status').textContent='Journey started. Save when you want to keep your progress.';
});};
for(const [id,months] of [['advance-one',1],['advance-three',3]]) $(id).onclick=()=>run(async()=>{
  session=await api(`/api/games/${session.id}/advance`,'POST',{months});render();
  $('status').textContent=session.summary.completed?'Journey complete. Your final report is ready.':'Monthly settlement complete. Save to keep your progress.';
});
$('save').onclick=()=>run(async()=>{await api(`/api/games/${session.id}/save`,'POST',{});localStorage.setItem('investment-game-save',session.id);$('status').textContent='Saved successfully.';});
$('resume').onclick=()=>run(async()=>{const id=localStorage.getItem('investment-game-save');if(!id) throw new Error('No saved game found in this browser.');session=await api(`/api/games/${id}`);render();$('status').textContent='Saved journey resumed.';});
$('download').onclick=()=>run(async()=>{
  const summary=await api(`/api/games/${session.id}/report`);
  const url=URL.createObjectURL(new Blob([JSON.stringify({type:summary.completed?'final':'progress',units:'integer sen',...summary},null,2)],{type:'application/json'}));
  const link=document.createElement('a');link.href=url;link.download='investment-game-report.json';link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
});
run(async()=>{config=await api('/api/config');$('status').textContent='Ready to begin.';});
