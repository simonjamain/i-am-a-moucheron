// Render the actual shipped components with a disposable local bank. This page
// makes visual QA possible without a GPU or a reachable multiplayer UDP path.
export function uiPreview(html) {
  const style = [...html.matchAll(/<style>[\s\S]*?<\/style>/g)].map((match) => match[0]).join('\n');
  const bank = html.slice(html.indexOf('<section id="bank"'), html.indexOf('<section id="shop"'));
  if (!bank.includes('data-bank-cards')) throw Error('Bank markup missing from UI preview');
  const bed = html.slice(
    html.lastIndexOf('<section', html.indexOf('id="bedPanel"')),
    html.indexOf('<section id="bank"'),
  );
  const summary = html.slice(
    html.indexOf('<div id="sessionSummary"'),
    html.indexOf('<div id="roomTag"'),
  );
  const rails = html.slice(
    html.indexOf('<div id="contextHUD"'),
    html.indexOf('<div id="mouseAim"'),
  );
  const live = html.slice(
    html.indexOf('<div id="commandHelp"'),
    html.indexOf('<div id="dirtView"'),
  );
  const death = html.slice(
    html.indexOf('<div id="deathWatch"'),
    html.indexOf('<div id="commandHelp"'),
  );
  return `<!doctype html><html lang="fr"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>i am a moucheron — aperçu des écrans intégrés</title>${style}
  <style>body{background:linear-gradient(#879a81 0 55%,#c1af81 56% 80%,#656c48 81%);min-height:100dvh}nav{position:relative;z-index:50;display:flex;gap:6px;flex-wrap:nowrap;overflow:auto;padding:14px;background:#102b29}nav button{padding:8px;font-size:12px}.previewNote{position:fixed;top:210px;bottom:auto;left:15px;right:auto;max-width:320px;font-size:12px;color:#fff;background:#102b29b8;padding:9px;z-index:50}#bank>article{max-height:78dvh}#bank{padding-top:90px;padding-bottom:60px}</style>
  <nav aria-label="Postes de démonstration">${['Chasseur', 'Stuka', 'Bombardier', 'Tourelle', 'DCA', 'Tank · pilote', 'Tank · canon', 'Tank · supérieur', 'Banquier', 'Lit', 'Bon de commande', 'Spitfire', 'Observation', 'Marche', 'Parachute', 'Placement', 'Hélicoptère · pilote', 'Hélicoptère · copilote', 'DCA mobile · conducteur', 'DCA mobile · tireur'].map((name, i) => `<button data-demo="${i}">${name}</button>`).join('')}</nav>
  <div id="hud">${summary}${rails}</div>${bed}${bank}${live}${death}<p class="previewNote">Aperçu des composants intégrés · Données de démonstration · Aucune partie multijoueur ni transaction réelle. Les signatures fonctionnent sur une caisse temporaire réinitialisée au rechargement.</p>
  <script type="module">
  import { controlHints, cursorStats, cursorAmmoText } from '/live-hud.js';
  import { PurchaseUI } from '/purchase-ui.js';
  import { BedUI } from '/bed-ui.js';
  import { BankUI } from '/bank-ui.js'; import { ContextHUD, equipmentHUD } from '/hud.js';
  import { newBank, signLoan, repayLoan } from '/bank.js';
  let snap = { equipment: [], purchases: [], upgrades: {}, dollars: 12, base: {epoch:'demo'}, bank: newBank(() => .05) };
  signLoan(snap.bank,1,snap.bank.slots[1].serial,1200,0);
  const root = document.getElementById('bank'), rails = document.getElementById('contextHUD'), hud = new ContextHUD(rails);
  const bank = new BankUI({root,document,snapshot:()=>snap,onOpen:()=>{rails.classList.add('hidden');document.getElementById('aimRange').classList.add('hidden')},onClose:()=>{},accept:s=>{snap=s},command:async(path,b)=>{const cash=Math.round(snap.dollars*100);snap.dollars=(cash+(path==='bank-sign'?signLoan(snap.bank,b.slot,b.serial,cash,0):-repayLoan(snap.bank,b.slot,b.serial,cash)))/100;return snap}});
  const person={id:'demo',life:'alive',incarnation:0,bedId:null};
  const bedUI=new BedUI({root:document.getElementById('bedPanel'),snapshot:()=>snap,ground:()=>null,command:async b=>{person.bedId=b.cancel?null:b.bed;return snap},accept:()=>{},onOpen:()=>{rails.classList.add('hidden');document.getElementById('aimRange').classList.add('hidden')},onClose:()=>{},archive:()=>{}});
  const purchaseUI=new PurchaseUI({root:document.getElementById('purchasePanel'),snapshot:()=>snap,ground:()=>null,command:async()=>{snap.dollars-=purchaseUI.price;return snap},accept:()=>{},onOpen:()=>{rails.classList.add('hidden');document.getElementById('aimRange').classList.add('hidden')},onClose:()=>{},archive:()=>{document.querySelector('.previewNote').textContent='Bon signé dans la démonstration · En jeu, passage direct à la pose par E, achat déjà payé.'}});
  document.getElementById('bankOpen').onclick=()=>display(8);
  document.getElementById('wallet').textContent='123 456 789 012,67 $';
  document.getElementById('wave').textContent='12';document.getElementById('enemies').textContent='180';document.getElementById('infest').textContent='10 / 20';
  let model;
  function display(index) {
    if (bank.busy || bedUI.busy || purchaseUI.busy) return;
    document.getElementById('cursorStats').classList.add('hidden');document.getElementById('deathWatch').classList.add('hidden');document.getElementById('commandHelp').classList.remove('hidden');
    document.getElementById('commandHelp').textContent=controlHints({observing:index===12,airborne:index===14,placing:index===15});
    if(index>=12&&index<=15){model=null;purchaseUI.close();bank.close();bedUI.close();if(index===12)document.getElementById('deathWatch').classList.remove('hidden');return;}
    purchaseUI.close(); if(index===10){model=null;bank.close();bedUI.close();purchaseUI.open('radar',person);return;}
    bedUI.close(); if(index===9){model=null;bedUI.open({slot:1},person);return;}
    bank.close(); if(index===8){model=null;bank.open();return;}
    const type=index>=18?'flaktruck':index>=16?'helicopter':index===11?'spitfire':index===1?'interceptor':index===2||index===3?'bomber':index>=5?'tank':'fighter';
    const seat=index===19?'cannon':index===17?'copilot':index===3?'dorsal':index===6?'cannon':index===7?'top':'pilot';
    const ammo={rocket:30,missile:10,copilot:1000,proximity:100,pilot:index===11?1000:730,coax:1400,top:1400,he:30,ap:26,...(index===1||index===2?{bomb:6}:{})};
    model=equipmentHUD({vehicle:{id:'demo',type,supplies:{ammo}},seat,turret:index===4,range:300,hp:87,speed:145,gas:.65,fuel:240,ammo:index===11?1000:730,altitude:.94});
    hud.update(model); const read=model.readout;
    const vehicle=index===4?null:{type,supplies:{ammo,fuel:240}};
    document.getElementById('commandHelp').textContent=controlHints({vehicle,seat,turret:index===4});
    if(vehicle){const stats=cursorStats({vehicle,seat,hp:87,speed:145,ammo:index===11?1000:730});document.getElementById('cursorStats').classList.remove('hidden');document.getElementById('cursorStats').style.left='calc(50% + 30px)';document.getElementById('cursorStats').style.top='calc(50% + 22px)';document.getElementById('cursorSpeed').textContent=stats.speed+' km/h';document.getElementById('cursorHealth').textContent=stats.hp+' PV';document.getElementById('cursorHPbar').value=stats.hp;document.getElementById('cursorAmmo').textContent=cursorAmmoText({vehicle,seat,ammo:stats.ammo,proximity:5});}

    document.getElementById('aimRange').classList.toggle('hidden',!read);
    if(read){document.getElementById('aimDistance').textContent=read.metres.toFixed(3)+' m';document.getElementById('aimGauge').value=read.fraction}
  }
  for(const button of document.querySelectorAll('[data-demo]'))button.onclick=()=>display(Number(button.dataset.demo));
  document.getElementById('enterPurgatory').onclick=()=>{document.getElementById('deathWatch').classList.add('hidden');document.querySelector('.previewNote').textContent='Démonstration : accès volontaire au purgatoire. En jeu, le serveur crée une seule âme après confirmation.'};
  display(0); setInterval(()=>{if(model&&!bank.opened&&!bedUI.opened)hud.update(model);bank.render()},100);
  </script></html>`;
}
