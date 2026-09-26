import React,{useEffect,useMemo,useRef,useState} from 'react';
import{createRoot}from'react-dom/client';import'./style.css';import{recommendSide}from'./road-assist';import{pairProbabilityForNext,pairRecommendationForNext,tieRecommendationForNext,validateBeadSequence,type BeadCell}from'./pair-probability';import lionLogo from'./assets/dg-lion-logo.png';import lionLogoHorizontal from'./assets/dg-lion-logo-horizontal.png';

type T={id:string;apiId?:string;roomId?:string;tableName?:string;shoe?:string;round?:number;banker:number;player:number;tie:number;latest?:'莊'|'閒'|'和';results?:('莊'|'閒'|'和')[];beads?:BeadCell[];lastUpdated?:number};
type ReportSnapshot={ready:boolean;complete:boolean;updatedAt:number;total:number;subtotalByRoom:Record<string,number>;recordCount:number;status:'waiting'|'syncing'|'live'|'error';message?:string};
const TZ='https://www.tz6868.cc';
const TZ_REGISTER='https://ans1788.tz6868.com/';
const SUPPORT_LINE='https://line.me/ti/p/htW38wjS4w';
const THREADS_LINK='https://threads.com/@luyu.8868_?igshid=NTc4MTIwNjQ2YQ==';
const rooms=['RB01','RB02','RB03','RB04','RB05','S01','S02','S03','S05','S06','S07','S09','S10'];
function deviceId(){const k='dg_tz_device_id';let v=localStorage.getItem(k);if(!v){v=crypto.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now();localStorage.setItem(k,v)}return v}
function assistSessionId(){const k='dg_assist_session_id';let v=sessionStorage.getItem(k);if(!v){v=(crypto.randomUUID?.()||Math.random().toString(36).slice(2)+Date.now()).replace(/[^A-Za-z0-9_-]/g,'');sessionStorage.setItem(k,v)}return v}
function pickToken(d:any){return d?.data?.token??d?.token??d?.data?.access_token??d?.access_token}
function pickGameUrl(d:any){const vals=[d?.data?.game_url,d?.data?.url,d?.raw?.url,d?.raw?.game_url,typeof d?.raw==='string'?d.raw:null];for(const x0 of vals){if(typeof x0!=='string')continue;const x=x0.trim().replace(/\\\//g,'/').replace(/^["']|["']$/g,'');try{const u=new URL(x);if(u.protocol==='https:'&&u.searchParams.get('token'))return u.toString()}catch{}}return ''}
function tableRoomKey(t:any){for(const value of [t?.roomId,t?.tableName,t?.id,t?.apiId]){const code=String(value??'').trim().toUpperCase();if(/^RB0[1-5]$/.test(code)||/^S(?:0[1-7]|09|10)$/.test(code))return code}return String(t?.id??t?.apiId??'').trim().toUpperCase()}

function BrandMark({compact=false}:{compact?:boolean}){
 return <div className={compact?'brand-mark compact':'brand-mark'} aria-label="DG神手">
   <img className={compact?'brand-logo-img horizontal':'brand-logo-img'} src={compact?lionLogoHorizontal:lionLogo} alt="DG神手"/>
 </div>
}
function UserIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 8a7 7 0 0 1 14 0"/></svg>}
function LockIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2M6 10h12v10H6z"/></svg>}
function EyeIcon({closed=false}:{closed?:boolean}){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M2.5 12s3.3-5.2 9.5-5.2S21.5 12 21.5 12 18.2 17.2 12 17.2 2.5 12 2.5 12Z"/>{!closed&&<circle cx="12" cy="12" r="2.3"/>}{closed&&<path d="M4 4l16 16"/>}</svg>}
function ShieldIcon(){return <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 20 6v6c0 5-3.2 8-8 9-4.8-1-8-4-8-9V6l8-3Z"/><path d="m8.7 12 2.1 2.1 4.5-4.6"/></svg>}

function CasinoBackdrop(){
 return <div className="casino-scene" aria-hidden="true">
   <div className="scene-glow glow-a"/><div className="scene-glow glow-b"/><div className="scene-lines"/>
   <div className="chip-cluster chip-left"><i/><i/><i/><i/></div>
   <div className="playing-card ace-card"><span>A</span><b>♠</b></div>
   <div className="hero-chip"><span>DG</span></div>
   <div className="info-slab slab-top"><span>DISCIPLINE</span><span>DATA</span><span>VICTORY</span></div>
   <div className="info-slab slab-bottom"><span>GOOD PLAYERS</span><span>BET ON DATA</span></div>
   <div className="chip-cluster chip-right"><i/><i/><i/></div>
 </div>
}

function LoginScreen({user,pass,setUser,setPass,busy,msg,onLogin}:{user:string;pass:string;setUser:(v:string)=>void;setPass:(v:string)=>void;busy:boolean;msg:string;onLogin:()=>void}){
 const[showPass,setShowPass]=useState(false);
 const[remember,setRemember]=useState(()=>localStorage.getItem('dg_remember_tz_user')==='1');
 useEffect(()=>{const saved=localStorage.getItem('dg_saved_tz_user');if(saved&&!user)setUser(saved)},[]);
 const changeRemember=(next:boolean)=>{setRemember(next);localStorage.setItem('dg_remember_tz_user',next?'1':'0');if(!next)localStorage.removeItem('dg_saved_tz_user')};
 const submit=()=>{if(remember&&user.trim())localStorage.setItem('dg_saved_tz_user',user.trim());else if(!remember)localStorage.removeItem('dg_saved_tz_user');onLogin()};
 return <main className="auth-page">
   <CasinoBackdrop/>
   <nav className="auth-nav"><BrandMark compact/><div className="nav-values"><span>專業</span><i/> <span>數據</span><i/> <span>信任</span><i/> <span>制勝</span></div><div className="nav-lang">◎ 繁體中文⌄</div></nav>
   <section className="auth-copy">
     <span className="copy-kicker">DATA · DISCIPLINE · VICTORY</span>
     <h2>數據 × 智慧<br/>讓判斷更進一步</h2>
     <p>MORE THAN A GAME<br/>A SMARTER WAY TO WIN</p>
     <em/>
   </section>
   <section className="auth-card-wrap">
     <div className="auth-card-halo"/>
     <div className="auth-card">
       <div className="system-pill"><i/>系統連線正常</div>
       <div className="auth-brand"><BrandMark/><h1>百家樂專業輔助系統</h1><p>專注數據 · 穩定制勝</p><small>REAL-TIME DATA · STABLE · VICTORY</small></div>
       <div className="auth-form-panel">
         <div className="form-top"><div><span>TZ ACCOUNT LOGIN</span><p>請輸入 TZ 帳號與密碼，驗證成功即可進入。</p></div><a href={TZ_REGISTER} target="_blank" rel="noreferrer">註冊 TZ 帳號</a></div>
         <label>TZ 帳號<div className="input-shell"><span className="field-icon"><UserIcon/></span><input value={user} onChange={e=>setUser(e.target.value)} placeholder="輸入 TZ 帳號" autoComplete="username"/></div></label>
         <label>TZ 密碼<div className="input-shell"><span className="field-icon"><LockIcon/></span><input type={showPass?'text':'password'} value={pass} onChange={e=>setPass(e.target.value)} onKeyDown={e=>e.key==='Enter'&&submit()} placeholder="輸入 TZ 密碼" autoComplete="current-password"/><button type="button" className="eye-btn" onClick={()=>setShowPass(v=>!v)} aria-label="顯示或隱藏密碼"><EyeIcon closed={showPass}/></button></div></label>
         <div className="form-tools"><label className="remember"><input type="checkbox" checked={remember} onChange={e=>changeRemember(e.target.checked)}/><span/>記住 TZ 帳號</label><span className="security-note">登入資料僅用於驗證</span></div>
         <button className="gold-login" disabled={busy} onClick={submit}><span className="shield"><ShieldIcon/></span>{busy?'登入驗證中…':'安全登入'}</button>
         <div className="auth-message">{msg||'請輸入帳號密碼，驗證成功即可進入'}</div>
         <footer className="form-footer"><span>▣ 密碼只用於本次登入驗證</span><a href={SUPPORT_LINE} target="_blank" rel="noreferrer">客服協助 / LINE 聯絡</a></footer>
       </div>
     </div>
   </section>
   <div className="scene-foot left"><span>SPEED</span><span>DATA</span><span>STABILITY</span><span>VICTORY</span></div>
   <div className="scene-foot right"><span>DG SHENSHOU</span><span>MORE THAN A GAME</span></div>
 </main>
}

function LaunchScreen({user,busy,msg,onEnter,onLogout}:{user:string;busy:boolean;msg:string;onEnter:()=>void;onLogout:()=>void}){
 return <main className="auth-page launch-page"><CasinoBackdrop/><nav className="auth-nav"><BrandMark compact/><div className="nav-values"><span>專業</span><i/><span>數據</span><i/><span>信任</span><i/><span>制勝</span></div><div className="nav-lang">◎ 繁體中文⌄</div></nav><section className="launch-card"><BrandMark/><div className="system-pill"><i/>授權驗證完成</div><h1>歡迎回來</h1><p className="launch-user">{user}</p><p>已取得 TZ 授權，可直接進入 DG 即時輔助。</p><button className="gold-login" disabled={busy} onClick={onEnter}><span className="shield"><ShieldIcon/></span>{busy?'啟動 DG 中…':'進入 DG'}</button><button className="launch-logout" onClick={onLogout}>登出帳號</button><div className="auth-message">{msg}</div></section></main>
}

function App(){
 const[user,setUser]=useState('');const[pass,setPass]=useState('');const[token,setToken]=useState('');const[msg,setMsg]=useState('');const[busy,setBusy]=useState(false);const[open,setOpen]=useState(false);const[panelOpen,setPanelOpen]=useState(false);const[calcOpen,setCalcOpen]=useState(false);const[pairOpen,setPairOpen]=useState(false);const[pairRoom,setPairRoom]=useState('RB01');const[gameUrl,setGameUrl]=useState('');const[room,setRoom]=useState('RB01');const[tables,setTables]=useState<Record<string,T>>({});const[report,setReport]=useState<ReportSnapshot|null>(null);const[live,setLive]=useState(false);const lastAtRef=useRef(0);const[stage,setStage]=useState('IDLE');const[stageMsg,setStageMsg]=useState('尚未啟動 DG');const[collectorReady,setCollectorReady]=useState(false);const[reportRefreshing,setReportRefreshing]=useState(false);const sessionIdRef=useRef(assistSessionId());
 const gameRef=useRef<HTMLDivElement>(null);const orbRef=useRef<HTMLButtonElement>(null);const panelRef=useRef<HTMLElement>(null);const calcRef=useRef<HTMLElement>(null);const pairRef=useRef<HTMLElement>(null);const frameRef=useRef<HTMLIFrameElement>(null);
 const loadPoint=(key:string)=>{try{const raw=localStorage.getItem(key);if(!raw)return null;const v=JSON.parse(raw);return Number.isFinite(v?.x)&&Number.isFinite(v?.y)?{x:Number(v.x),y:Number(v.y)}:null}catch{return null}};
 const isMobileViewport=()=>typeof window!=='undefined'&&window.innerWidth<=700;
 const scaleKey=(kind:'assist'|'calc'|'pair')=>`dg_${kind}_scale_${isMobileViewport()?'mobile':'desktop'}_v17`;
 const loadScale=(kind:'assist'|'calc'|'pair')=>{try{const v=Number(localStorage.getItem(scaleKey(kind)));return Number.isFinite(v)?Math.max(.5,Math.min(1,v)):1}catch{return 1}};
 const[orbPos,setOrbPos]=useState<{x:number;y:number}|null>(()=>loadPoint('dg_orb_pos_v16'));
 const[panelPos,setPanelPos]=useState<{x:number;y:number}|null>(()=>loadPoint('dg_panel_pos_v16'));
 const[calcPos,setCalcPos]=useState<{x:number;y:number}|null>(()=>loadPoint('dg_calc_pos_v17'));
 const[pairPos,setPairPos]=useState<{x:number;y:number}|null>(()=>loadPoint('dg_pair_pos_v23'));
 const[panelScale,setPanelScale]=useState(()=>loadScale('assist'));
 const[calcScale,setCalcScale]=useState(()=>loadScale('calc'));
 const[pairScale,setPairScale]=useState(()=>loadScale('pair'));
 const dragRef=useRef<{kind:'orb'|'panel'|'calc'|'pair';pointerId:number;startX:number;startY:number;originX:number;originY:number;moved:boolean}|null>(null);
 const scaleDragRef=useRef<{kind:'assist'|'calc'|'pair';pointerId:number;startX:number;startY:number;startScale:number;moved:boolean}|null>(null);
 const suppressScaleClickRef=useRef(false);
 const suppressOrbClickRef=useRef(false);

 useEffect(()=>{
   if(!open||!collectorReady)return;
   const es=new EventSource(`/api/dg/stream?sessionId=${encodeURIComponent(sessionIdRef.current)}`);
   const onTables=(event:Event)=>{try{const arr=JSON.parse((event as MessageEvent).data);const next:Record<string,T>={};for(const t of Array.isArray(arr)?arr:[]){const key=tableRoomKey(t);if(key)next[key]=t;}setTables(next);lastAtRef.current=Date.now();setLive(true)}catch{}};
   const onStatus=(event:Event)=>{try{const m=JSON.parse((event as MessageEvent).data);const status=String(m?.status||'').toLowerCase();const message=String(m?.message||'');lastAtRef.current=Date.now();setStage(status.toUpperCase());setStageMsg(message);if(status==='connected')setLive(true);if(['error','closed','idle'].includes(status))setLive(false)}catch{}};
   const onHeartbeat=(event:Event)=>{try{const m=JSON.parse((event as MessageEvent).data);const state=String(m?.state||'').toLowerCase();lastAtRef.current=Date.now();if(state==='connected'){setLive(true);setStage('CONNECTED')}else if(state==='error'||state==='closed'){setLive(false)}}catch{}};
   es.addEventListener('tables',onTables);
   es.addEventListener('status',onStatus);
   es.addEventListener('heartbeat',onHeartbeat);
   es.onerror=()=>{setLive(false);setStage('RECONNECTING');setStageMsg('瀏覽器與懸浮輔助連線暫時中斷，正在自動恢復')};
   return()=>{es.removeEventListener('tables',onTables);es.removeEventListener('status',onStatus);es.removeEventListener('heartbeat',onHeartbeat);es.close()};
 },[open,collectorReady]);

 useEffect(()=>{const id=setInterval(()=>{const lastAt=lastAtRef.current;if(lastAt&&Date.now()-lastAt>35000){setLive(false);setStage('RECONNECTING');setStageMsg('即時心跳逾時，正在自動恢復')}},5000);return()=>clearInterval(id)},[]);
 useEffect(()=>{
   if(!open){setReport(null);return}
   if(!panelOpen)return;
   let cancelled=false;
   const load=async()=>{try{const r=await fetch(`/api/dg/report?sessionId=${encodeURIComponent(sessionIdRef.current)}`,{cache:'no-store'});const d=await r.json();if(!cancelled&&r.ok&&d?.ok)setReport(d)}catch{}};
   void load();const id=setInterval(load,6000);return()=>{cancelled=true;clearInterval(id)};
 },[open,panelOpen]);
 const t=tables[room];const latest=useMemo(()=>t?.results?.at(-1)??t?.latest??'—',[t]);const rec=useMemo(()=>recommendSide(t?.results??[],room),[t?.results,room]);
 const completedRounds=t?.results?.length??((t?.banker??0)+(t?.player??0)+(t?.tie??0));
 const pairT=tables[pairRoom];
 const pairCompletedRounds=pairT?.results?.length??((pairT?.banker??0)+(pairT?.player??0)+(pairT?.tie??0));
 const pairBeads=pairT?.beads??[];
 const pairBeadReady=!!pairT&&validateBeadSequence(pairT.beads,pairCompletedRounds);
 const playerPairHot=useMemo(()=>pairProbabilityForNext(pairBeadReady?pairBeads:[],'player'),[pairBeadReady,pairBeads]);
 const bankerPairHot=useMemo(()=>pairProbabilityForNext(pairBeadReady?pairBeads:[],'banker'),[pairBeadReady,pairBeads]);
 const pairTotalCount=pairBeadReady?playerPairHot.pairCount+bankerPairHot.pairCount:null;
 const sharedPairProbability=useMemo<25|7|null>(()=>{
   if(!pairBeadReady)return null;
   if(playerPairHot.probability===25||bankerPairHot.probability===25)return 25;
   if(playerPairHot.probability===7||bankerPairHot.probability===7)return 7;
   return null;
 },[pairBeadReady,playerPairHot.probability,bankerPairHot.probability]);
 const pairValue=!pairBeadReady?'--':sharedPairProbability?`${sharedPairProbability}%`:'--';
 const pairSignalOn=sharedPairProbability!=null;
 const pairSignalLamp=pairSignalOn?'🟢':'🔴';
 const pairRecommendation=useMemo(()=>pairRecommendationForNext(pairBeadReady?pairBeads:[]),[pairBeadReady,pairBeads]);
 const pairRecommendationValue=!pairBeadReady?'--':(pairRecommendation.recommendation??'--');
 const tieRecommendation=useMemo(()=>tieRecommendationForNext(pairBeadReady?pairBeads:[]),[pairBeadReady,pairBeads]);
 const tieRecommendationValue=!pairBeadReady?'--':(tieRecommendation.recommendation??'--');
 const hasRoomPnl=!!report?.ready&&Object.prototype.hasOwnProperty.call(report.subtotalByRoom||{},room);const roomPnl=hasRoomPnl?Number(report!.subtotalByRoom![room]):(report?.ready&&report?.complete?0:null);const dayPnl=report?.ready?report.total:null;
 const money=(v:number|null)=>v==null?'--':`${v>0?'+':''}${v.toFixed(2)}`;const pnlClass=(v:number|null)=>v==null?'pending':v>0?'profit':v<0?'loss':'zero';
 const reportStatusText=reportRefreshing?'正在刷新目前總盈虧…':(report?.message||stageMsg);

 useEffect(()=>{if(!orbPos)return;const id=setTimeout(()=>localStorage.setItem('dg_orb_pos_v16',JSON.stringify(orbPos)),180);return()=>clearTimeout(id)},[orbPos]);
 useEffect(()=>{if(!panelPos)return;const id=setTimeout(()=>localStorage.setItem('dg_panel_pos_v16',JSON.stringify(panelPos)),180);return()=>clearTimeout(id)},[panelPos]);
 useEffect(()=>{if(!calcPos)return;const id=setTimeout(()=>localStorage.setItem('dg_calc_pos_v17',JSON.stringify(calcPos)),180);return()=>clearTimeout(id)},[calcPos]);
 useEffect(()=>{if(!pairPos)return;const id=setTimeout(()=>localStorage.setItem('dg_pair_pos_v23',JSON.stringify(pairPos)),180);return()=>clearTimeout(id)},[pairPos]);
 useEffect(()=>{const id=setTimeout(()=>localStorage.setItem(scaleKey('assist'),String(panelScale)),180);return()=>clearTimeout(id)},[panelScale]);
 useEffect(()=>{const id=setTimeout(()=>localStorage.setItem(scaleKey('calc'),String(calcScale)),180);return()=>clearTimeout(id)},[calcScale]);
 useEffect(()=>{const id=setTimeout(()=>localStorage.setItem(scaleKey('pair'),String(pairScale)),180);return()=>clearTimeout(id)},[pairScale]);
 const clampPoint=(x:number,y:number,el:HTMLElement|null)=>{const box=gameRef.current?.getBoundingClientRect();if(!box||!el)return{x,y};const r=el.getBoundingClientRect();const pad=6;return{x:Math.max(pad,Math.min(x,box.width-r.width-pad)),y:Math.max(pad,Math.min(y,box.height-r.height-pad))}};
 const dragEl=(kind:'orb'|'panel'|'calc'|'pair')=>kind==='orb'?orbRef.current:kind==='panel'?panelRef.current:kind==='calc'?calcRef.current:pairRef.current;
 const beginDrag=(kind:'orb'|'panel'|'calc'|'pair',e:React.PointerEvent<HTMLElement>)=>{const parent=gameRef.current;const el=dragEl(kind);if(!parent||!el)return;const pr=parent.getBoundingClientRect();const er=el.getBoundingClientRect();dragRef.current={kind,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,originX:er.left-pr.left,originY:er.top-pr.top,moved:false};try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}e.preventDefault()};
 const moveDrag=(e:React.PointerEvent<HTMLElement>)=>{const d=dragRef.current;if(!d||d.pointerId!==e.pointerId)return;const dx=e.clientX-d.startX,dy=e.clientY-d.startY;if(Math.abs(dx)+Math.abs(dy)>4)d.moved=true;const next=clampPoint(d.originX+dx,d.originY+dy,dragEl(d.kind));if(d.kind==='orb')setOrbPos(next);else if(d.kind==='panel')setPanelPos(next);else if(d.kind==='calc')setCalcPos(next);else setPairPos(next)};
 const endDrag=(e:React.PointerEvent<HTMLElement>)=>{const d=dragRef.current;if(!d||d.pointerId!==e.pointerId)return;if(d.kind==='orb'&&d.moved)suppressOrbClickRef.current=true;try{e.currentTarget.releasePointerCapture(e.pointerId)}catch{}dragRef.current=null};
 const scaleClamp=(v:number)=>Math.max(.5,Math.min(1,Math.round(v*20)/20));
 const beginScale=(kind:'assist'|'calc'|'pair',e:React.PointerEvent<HTMLButtonElement>)=>{scaleDragRef.current={kind,pointerId:e.pointerId,startX:e.clientX,startY:e.clientY,startScale:kind==='assist'?panelScale:kind==='calc'?calcScale:pairScale,moved:false};try{e.currentTarget.setPointerCapture(e.pointerId)}catch{}e.stopPropagation();e.preventDefault()};
 const moveScale=(e:React.PointerEvent<HTMLButtonElement>)=>{const d=scaleDragRef.current;if(!d||d.pointerId!==e.pointerId)return;const delta=((e.clientX-d.startX)+(e.clientY-d.startY))/2;if(Math.abs(e.clientX-d.startX)+Math.abs(e.clientY-d.startY)>5)d.moved=true;const next=scaleClamp(d.startScale+delta/260);d.kind==='assist'?setPanelScale(next):d.kind==='calc'?setCalcScale(next):setPairScale(next);e.stopPropagation();e.preventDefault()};
 const endScale=(e:React.PointerEvent<HTMLButtonElement>)=>{const d=scaleDragRef.current;if(!d||d.pointerId!==e.pointerId)return;if(d.moved)suppressScaleClickRef.current=true;try{e.currentTarget.releasePointerCapture(e.pointerId)}catch{}scaleDragRef.current=null;e.stopPropagation();e.preventDefault()};
 const cycleScale=(kind:'assist'|'calc'|'pair')=>{const current=kind==='assist'?panelScale:kind==='calc'?calcScale:pairScale;const next=current<=.5?1:scaleClamp(current-.1);kind==='assist'?setPanelScale(next):kind==='calc'?setCalcScale(next):setPairScale(next)};
 useEffect(()=>{const onResize=()=>{setOrbPos(p=>p?clampPoint(p.x,p.y,orbRef.current):p);setPanelPos(p=>p?clampPoint(p.x,p.y,panelRef.current):p);setCalcPos(p=>p?clampPoint(p.x,p.y,calcRef.current):p);setPairPos(p=>p?clampPoint(p.x,p.y,pairRef.current):p)};window.addEventListener('resize',onResize,{passive:true});return()=>window.removeEventListener('resize',onResize)},[]);
 useEffect(()=>{if(!panelOpen||!panelPos)return;const id=requestAnimationFrame(()=>setPanelPos(p=>p?clampPoint(p.x,p.y,panelRef.current):p));return()=>cancelAnimationFrame(id)},[panelOpen,panelScale]);
 useEffect(()=>{if(!calcOpen)return;const id=requestAnimationFrame(()=>{if(calcPos){setCalcPos(p=>p?clampPoint(p.x,p.y,calcRef.current):p);return}const game=gameRef.current?.getBoundingClientRect(),main=panelRef.current?.getBoundingClientRect(),calc=calcRef.current?.getBoundingClientRect();if(!game||!calc)return;let x=Math.max(8,game.width-calc.width-18),y=Math.max(8,game.height-calc.height-18);if(main){if(game.width>700){x=Math.max(8,main.left-game.left-calc.width-12);y=Math.max(8,Math.min(main.top-game.top,game.height-calc.height-8))}else{x=Math.max(8,Math.min(main.left-game.left,game.width-calc.width-8));y=Math.max(8,main.top-game.top-calc.height-10)}}setCalcPos(clampPoint(x,y,calcRef.current))});return()=>cancelAnimationFrame(id)},[calcOpen,calcScale]);
 useEffect(()=>{if(!pairOpen)return;const id=requestAnimationFrame(()=>{if(pairPos){setPairPos(p=>p?clampPoint(p.x,p.y,pairRef.current):p);return}const game=gameRef.current?.getBoundingClientRect(),main=panelRef.current?.getBoundingClientRect(),pair=pairRef.current?.getBoundingClientRect(),calc=calcRef.current?.getBoundingClientRect();if(!game||!pair)return;let x=Math.max(8,game.width-pair.width-18),y=Math.max(8,game.height-pair.height-18);if(main){if(game.width>700){x=Math.max(8,main.left-game.left-pair.width-12);y=Math.max(8,Math.min(main.top-game.top+(calcOpen&&calc?calc.height+10:0),game.height-pair.height-8))}else{x=Math.max(8,Math.min(main.left-game.left,game.width-pair.width-8));y=Math.max(8,main.top-game.top-pair.height-10)}}setPairPos(clampPoint(x,y,pairRef.current))});return()=>cancelAnimationFrame(id)},[pairOpen,pairScale,calcOpen]);

 const postObservedReport=async(payload:any,source:string)=>{try{const r=await fetch(`/api/dg/report/browser-observe?sessionId=${encodeURIComponent(sessionIdRef.current)}`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload,source})});const d=await r.json();return !!(r.ok&&d?.accepted)}catch{return false}};
 const refreshReportData=async(force=false)=>{const url=`/api/dg/report?sessionId=${encodeURIComponent(sessionIdRef.current)}${force?'&force=1':''}`;const r=await fetch(url,{cache:'no-store'});const d=await r.json();if(r.ok&&d?.ok){setReport(d);return d}throw new Error(String(d?.message||'刷新報表失敗'))};
 const sleep=(ms:number)=>new Promise(r=>setTimeout(r,ms));
 const isVisible=(el:Element)=>{try{const r=(el as HTMLElement).getBoundingClientRect();const st=el.ownerDocument?.defaultView?.getComputedStyle(el)||getComputedStyle(el);return r.width>0&&r.height>0&&st.display!=='none'&&st.visibility!=='hidden'&&Number(st.opacity||'1')>0}catch{return false}};
 const cleanText=(v:any)=>String(v??'').replace(/\u00a0/g,' ').replace(/\s+/g,' ').trim();
 const numFrom=(v:any)=>{const m=cleanText(v).replace(/,/g,'').match(/[-+]?\d+(?:\.\d+)?/g);if(!m?.length)return null;const n=Number(m[m.length-1]);return Number.isFinite(n)?n:null};
 const sameOriginDocs=()=>{const out:Document[]=[];const seen=new Set<Document>();const walk=(win:Window|null)=>{try{const d=win?.document;if(!d||seen.has(d))return;seen.add(d);out.push(d);for(const fr of Array.from(d.querySelectorAll('iframe'))){try{walk((fr as HTMLIFrameElement).contentWindow)}catch{}}}catch{}};try{walk(frameRef.current?.contentWindow||null)}catch{}return out};
 const clickByText=async(pattern:RegExp)=>{for(const d of sameOriginDocs()){const els=Array.from(d.querySelectorAll('button,a,[role=button],div,span,li')).filter(isVisible).sort((a,b)=>cleanText(a.textContent).length-cleanText(b.textContent).length);for(const el of els){const t=cleanText(el.textContent);pattern.lastIndex=0;if(t&&t.length<80&&pattern.test(t)){try{(el as HTMLElement).click();return true}catch{}}}}return false};
 type UiReportRow={id:string;room:string;win:number;settle_time?:string};
 const parseRowElement=(el:Element):UiReportRow|null=>{const txt=cleanText((el as HTMLElement).innerText||el.textContent);if(txt.length<18||txt.length>520)return null;const rm=txt.toUpperCase().match(/\b(RB0[1-5]|S(?:0[1-7]|09|10))\b/);if(!rm)return null;const tm=txt.match(/20\d{2}[-\/]\d{2}[-\/]\d{2}\s+\d{2}:\d{2}:\d{2}/);const idm=txt.match(/\b20\d{10,24}[A-Z][A-Z0-9-]*\b/i)||txt.match(/\b20\d{12,26}\b/);if(!tm&&!idm)return null;const tail=tm?txt.slice((tm.index||0)+tm[0].length):txt;const vals=tail.replace(/,/g,'').match(/[-+]?\d+(?:\.\d+)?/g)||[];if(!vals.length)return null;let win:null|number=null;for(let i=vals.length-1;i>=0;i--){const n=Number(vals[i]);if(Number.isFinite(n)){win=n;break}}if(win==null)return null;const id=idm?.[0]||`${rm[1]}|${tm?.[0]||''}|${win}|${txt.slice(0,80)}`;return{id,room:rm[1],win,settle_time:tm?.[0]}};
 const parseDocReport=(d:Document)=>{const rows=new Map<string,UiReportRow>();const selectors=['tr','[role=row]','li','div'];for(const sel of selectors){for(const el of Array.from(d.querySelectorAll(sel))){if(!isVisible(el))continue;const row=parseRowElement(el);if(!row)continue;let childMatch=false;for(const ch of Array.from(el.children)){if(parseRowElement(ch)){childMatch=true;break}}if(childMatch)continue;rows.set(row.id,row)}}let total:null|number=null;const candidates=Array.from(d.querySelectorAll('tr,[role=row],div,li,span')).filter(isVisible).map(el=>({el,txt:cleanText((el as HTMLElement).innerText||el.textContent)})).filter(x=>/(^|\s)(總計|总计)(\s|$)/.test(x.txt)&&x.txt.length<220).sort((a,b)=>a.txt.length-b.txt.length);for(const c of candidates){const n=numFrom(c.txt);if(n!=null){total=n;break}}return{rows:[...rows.values()],total}};
 const scanVisibleReport=()=>{const merged=new Map<string,UiReportRow>();let total:null|number=null;let reportVisible=false;for(const d of sameOriginDocs()){const body=cleanText(d.body?.innerText||d.body?.textContent);if(/遊戲報表|游戏报表/.test(body)&&/輸贏|输赢/.test(body))reportVisible=true;const x=parseDocReport(d);for(const r of x.rows)merged.set(r.id,r);if(x.total!=null)total=x.total}return{rows:[...merged.values()],total,reportVisible}};
 const pageInfo=()=>{for(const d of sameOriginDocs()){for(const el of Array.from(d.querySelectorAll('div,span,td,p,b,strong')).filter(isVisible)){const txt=cleanText(el.textContent);const m=txt.match(/^(\d+)\s*\/\s*(\d+)$/);if(m)return{doc:d,el,cur:Number(m[1]),total:Number(m[2])}}}return null};
 const clickPageDirection=async(dir:'prev'|'next')=>{const info=pageInfo();if(!info)return false;const er=(info.el as HTMLElement).getBoundingClientRect();let box:Element|null=info.el.parentElement;for(let depth=0;box&&depth<5;depth++,box=box.parentElement){const all=Array.from(box.querySelectorAll('button,a,[role=button],[onclick],div,span')).filter(x=>x!==info.el&&isVisible(x));const pool=all.filter(c=>{const r=(c as HTMLElement).getBoundingClientRect();const cy=(r.top+r.bottom)/2,ey=(er.top+er.bottom)/2;if(Math.abs(cy-ey)>55)return false;return dir==='next'?r.left>=er.right-4:r.right<=er.left+4}).sort((a,b)=>{const ra=(a as HTMLElement).getBoundingClientRect(),rb=(b as HTMLElement).getBoundingClientRect();return dir==='next'?ra.left-rb.left:rb.right-ra.right});for(const c of pool){const t=cleanText(c.textContent)+' '+cleanText(c.getAttribute('aria-label'))+' '+cleanText(c.getAttribute('title'));const st=c.ownerDocument?.defaultView?.getComputedStyle(c)||getComputedStyle(c);if(/next|下一|›|»|▶|►|→/i.test(t)||dir==='prev'&&/prev|上一|‹|«|◀|◄|←/i.test(t)||st.cursor==='pointer'){try{(c as HTMLElement).click();return true}catch{}}}}return false};
 const waitPageChange=async(before:number)=>{for(let i=0;i<16;i++){await sleep(160);const p=pageInfo();if(p&&p.cur!==before)return true}return false};
 const openTodayReport=async()=>{let scan=scanVisibleReport();if(scan.reportVisible&&scan.rows.length)return true;await clickByText(/^(遊戲報表|游戏报表)$/);await sleep(650);await clickByText(/^(今日報表|今日报表)$/);await sleep(300);await clickByText(/^(投注記錄|投注记录)$/);for(let i=0;i<12;i++){await sleep(220);scan=scanVisibleReport();if(scan.reportVisible&&(scan.rows.length||scan.total!=null))return true}return false};
 const collectAllReportPages=async()=>{await openTodayReport();let p=pageInfo();for(let guard=0;p&&p.cur>1&&guard<20;guard++){const before=p.cur;if(!await clickPageDirection('prev'))break;if(!await waitPageChange(before))break;p=pageInfo()}const all=new Map<string,UiReportRow>();const visited=new Set<number>();let directTotal:null|number=null;let expectedPages=1;for(let guard=0;guard<20;guard++){await sleep(160);const scan=scanVisibleReport();for(const r of scan.rows)all.set(r.id,r);if(scan.total!=null)directTotal=scan.total;const info=pageInfo();if(info){visited.add(info.cur);expectedPages=Math.max(expectedPages,info.total)}else visited.add(1);if(!info||info.cur>=info.total)break;const before=info.cur;if(!await clickPageDirection('next'))break;if(!await waitPageChange(before))break}return{rows:[...all.values()],totalWinLoss:directTotal,__dgReplaceRows:true,__dgComplete:all.size>0&&visited.size>=expectedPages}};
 const triggerIframeRefresh=async()=>{let ok=false;try{const win=frameRef.current?.contentWindow as any;if(typeof win?.__DG_SCAN_LAYA_REPORT__==='function')ok=!!(await win.__DG_SCAN_LAYA_REPORT__())||ok;if(typeof win?.__DG_TRIGGER_REPORT_REFRESH__==='function')ok=!!(await win.__DG_TRIGGER_REPORT_REFRESH__())||ok}catch{}const scan=scanVisibleReport();if(scan.rows.length||scan.total!=null){ok=await postObservedReport({rows:scan.rows,totalWinLoss:scan.total},'parent-live-dom')||ok}return ok};
 async function manualRefreshReport(){setReportRefreshing(true);try{setStageMsg('正在刷新目前總盈虧');await triggerIframeRefresh();try{await fetch('/api/dg/report/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:sessionIdRef.current,windowMs:8000})})}catch{}await sleep(220);let data=await refreshReportData(true);if(data?.ready){setStageMsg(data?.message||'已刷新目前總盈虧');return}const payload=await collectAllReportPages();if(payload.rows.length||payload.totalWinLoss!=null){await postObservedReport(payload,'parent-full-report');await sleep(180);data=await refreshReportData(true)}setStageMsg(data?.ready?(data?.message||'已刷新目前總盈虧'):'尚未取得 DG 今日報表資料')}catch(e:any){setStageMsg(String(e?.message||'刷新目前總盈虧失敗'))}finally{setReportRefreshing(false)}}

 async function login(){if(!user.trim()||!pass)return setMsg('請輸入 TZ 帳號與密碼');setBusy(true);setMsg('TZ 驗證中…');try{const r=await fetch(TZ+'/api/v1/login',{method:'POST',mode:'cors',headers:{'Content-Type':'application/json','Accept':'application/json, text/plain, */*'},body:JSON.stringify({username:user.trim(),password:pass,device_id:deviceId()})});const text=await r.text();let d:any={};try{d=text?JSON.parse(text):{}}catch{}const tk=pickToken(d);if(!r.ok||!tk)throw new Error(String(d?.message??d?.msg??d?.error??`登入失敗 (${r.status})`));setToken(String(tk));setPass('');setMsg('登入成功');}catch(e:any){setMsg(e instanceof TypeError?'瀏覽器無法連到 TZ 登入服務':String(e?.message||e))}finally{setBusy(false)}}

 async function dgLoginOnce(){const h:Record<string,string>={'Content-Type':'application/json','Accept':'application/json, text/plain, */*','Authorization':'Bearer '+token};return fetch(TZ+'/api/v2/game/DGLI/login',{method:'POST',mode:'cors',headers:h,body:JSON.stringify({game_return_url:TZ,game_kind:'',game_type:'',game_device:'Desktop'})})}

 async function startCollector(sharedGameUrl:string){
   setCollectorReady(false);setStage('CONNECTING');setStageMsg('正在建立 DG 唯一即時連線');
   const r=await fetch('/api/dg/collector/start',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:sessionIdRef.current,gameUrl:sharedGameUrl})});let d:any={};try{d=await r.json()}catch{}if(!r.ok||!d?.ok)throw new Error(String(d?.message||'即時資料連線啟動失敗'));setCollectorReady(true);return true;
 }

 async function enterDG(){if(!token)return;setTables({});setLive(false);setCollectorReady(false);setBusy(true);setMsg('正在取得本次 DG 授權…');try{const r=await dgLoginOnce();let d:any={};try{d=await r.json()}catch{}if(!r.ok||(d?.code!=null&&Number(d.code)!==200))throw new Error(String(d?.message??d?.msg??`取得 DG 授權失敗 (${r.status})`));const u=pickGameUrl(d);if(!u)throw new Error('TZ 已回應，但找不到 DG 登入網址');await startCollector(u);const pr=await fetch('/api/dg/proxy/enter',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:sessionIdRef.current})});let pd:any={};try{pd=await pr.json()}catch{}if(!pr.ok||!pd?.ok||!pd?.url)throw new Error(String(pd?.message||'DG 共用連線入口啟動失敗'));setGameUrl(String(pd.url));setPanelOpen(false);setCalcOpen(false);setPairOpen(false);setOpen(true);setStage('CONNECTING');setStageMsg('DG 遊戲與懸浮輔助共用同一條即時連線');setMsg('DG 載入中…')}catch(e:any){setCollectorReady(false);setLive(false);setStage('ERROR');setStageMsg(String(e?.message||e));setMsg(e instanceof TypeError?'無法啟動 DG 工作階段':String(e?.message||e))}finally{setBusy(false)}}

 async function stopDG(){setCollectorReady(false);setGameUrl('');setPanelOpen(false);setCalcOpen(false);setPairOpen(false);setOpen(false);setTables({});setReport(null);setLive(false);lastAtRef.current=0;setStage('IDLE');setStageMsg('已離開 DG');try{await fetch('/api/dg/proxy/leave',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:sessionIdRef.current})})}catch{}try{await fetch('/api/dg/collector/stop',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({sessionId:sessionIdRef.current})})}catch{}}
 async function logout(){await stopDG();setToken('');setMsg('')}

 if(!token)return <LoginScreen user={user} pass={pass} setUser={setUser} setPass={setPass} busy={busy} msg={msg} onLogin={login}/>;
 if(!open)return <LaunchScreen user={user} busy={busy} msg={msg} onEnter={enterDG} onLogout={logout}/>;
 return <div className="app">
  <header className="game-topbar">
   <div className="game-brand"><BrandMark compact/><span className="game-brand-divider"/><div className="game-brand-copy"><strong>DG LIVE ASSIST</strong><small>REAL-TIME ANALYTICS · SECURE SESSION</small></div></div>
   <div className="game-top-metrics"><span>SESSION <b>ACTIVE</b></span><i/><span>DATA LINK <b>{live?'SYNC':'STANDBY'}</b></span><i/><span>ROOM <b>{room}</b></span></div>
   <div className="top-right-controls"><div className="game-social-links" aria-label="社群連結"><a className="social-square threads-square" href={THREADS_LINK} target="_blank" rel="noreferrer" aria-label="Threads" title="Threads"><span className="threads-glyph">@</span></a><a className="social-square line-square" href={SUPPORT_LINE} target="_blank" rel="noreferrer" aria-label="LINE" title="LINE"><span className="line-glyph">LINE</span></a></div><div className="status-stack"><span className={live?'live':'wait'}>{live?'● LIVE':'● 等待資料'}</span><small>{stageMsg}</small></div><button className="home-top" onClick={stopDG}>← 回主頁</button></div>
  </header>
  <div className="game" ref={gameRef}>
   <iframe ref={frameRef} className="direct-dg" src={gameUrl} allow="autoplay; fullscreen" referrerPolicy="strict-origin-when-cross-origin" onLoad={()=>setMsg('')}/>
   <div className="direct-badge">DG · DIRECT</div>{stage==='DG_DIRECT_LOADING'&&<div className="load-hint">{stageMsg}</div>}
   <button ref={orbRef} className="orb draggable-orb" style={orbPos?{left:orbPos.x,top:orbPos.y,right:'auto',bottom:'auto'}:undefined} onPointerDown={e=>beginDrag('orb',e)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag} onClick={()=>{if(suppressOrbClickRef.current){suppressOrbClickRef.current=false;return}setPanelOpen(v=>{const next=!v;if(!next){setCalcOpen(false);setPairOpen(false)}return next})}}>DG</button>
   {panelOpen&&<aside ref={panelRef} className="assist-panel draggable-panel scalable-panel" style={{...(panelPos?{left:panelPos.x,top:panelPos.y,right:'auto',bottom:'auto'}:{}),transform:`scale(${panelScale})`,transformOrigin:panelPos?'top left':'bottom right'}}>
    <div className="head drag-handle" onPointerDown={e=>beginDrag('panel',e)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}><b>DG 懸浮輔助</b><div className="assist-head-actions"><button type="button" className={calcOpen?'calc-launch active':'calc-launch'} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setCalcOpen(v=>!v)}}>算牌</button><button type="button" className={pairOpen?'hot-launch active':'hot-launch'} onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setPairOpen(v=>{const next=!v;if(next)setPairRoom(room);return next})}}>熱門推薦 👍</button><span>{live?'即時同步':stage}</span></div></div>
    <select value={room} onChange={e=>setRoom(e.target.value)}>{rooms.map(x=><option key={x}>{x}</option>)}</select>
    <div className="grid"><div>牌靴<strong>{t?.shoe||'--'}</strong></div><div>局數<strong>{t?completedRounds:'--'}</strong></div><div>最近<strong>{latest}</strong></div><div>建議<strong>{rec}</strong></div></div>
    <div className="counts"><span>莊 {t?.banker??0}</span><span>閒 {t?.player??0}</span><span>和 {t?.tie??0}</span></div>
    <div className="pnl-grid"><div><span>小計 <em>{room}</em></span><strong className={pnlClass(roomPnl)}>{money(roomPnl)}</strong></div><div><span>總計 <em>今日</em></span><strong className={pnlClass(dayPnl)}>{money(dayPnl)}</strong></div></div>
    <div className="report-actions"><small>{reportStatusText}</small><button className="report-refresh-btn" type="button" onClick={manualRefreshReport} disabled={reportRefreshing}>{reportRefreshing?'刷新中…':'一鍵刷新 目前總盈虧'}</button></div>
    <button type="button" className="panel-scale-handle" aria-label="縮放 DG 懸浮輔助" title="拖曳縮放，點一下逐級縮小" onPointerDown={e=>beginScale('assist',e)} onPointerMove={moveScale} onPointerUp={endScale} onPointerCancel={endScale} onClick={()=>{if(suppressScaleClickRef.current){suppressScaleClickRef.current=false;return}cycleScale('assist')}}><span>⇲</span><b>{Math.round(panelScale*100)}%</b></button>
   </aside>}
   {calcOpen&&<aside ref={calcRef} className="calc-panel draggable-panel scalable-panel" style={{...(calcPos?{left:calcPos.x,top:calcPos.y,right:'auto',bottom:'auto'}:{}),transform:`scale(${calcScale})`,transformOrigin:calcPos?'top left':'bottom right'}}>
    <div className="calc-head drag-handle" onPointerDown={e=>beginDrag('calc',e)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}><div><b>算牌輔助</b><small>{room} · 即時同步</small></div><button type="button" className="calc-close" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setCalcOpen(false)}}>×</button></div>
    <div className="calc-live-row"><span>目前房間<strong>{room}</strong></span><span>牌靴<strong>{t?.shoe||'--'}</strong></span><span>局數<strong>{t?completedRounds:'--'}</strong></span></div>
    <div className="calc-result-card"><span>算牌結果</span><strong>等待算牌邏輯</strong><small>之後會接入你提供的算牌規則，使用目前 DG 即時資料自動計算。</small></div>
    <div className="calc-status"><i className={live?'on':''}/>{live?'DG 即時資料已連線':'等待 DG 即時資料'}</div>
    <button type="button" className="panel-scale-handle calc-scale-handle" aria-label="縮放算牌輔助" title="拖曳縮放，點一下逐級縮小" onPointerDown={e=>beginScale('calc',e)} onPointerMove={moveScale} onPointerUp={endScale} onPointerCancel={endScale} onClick={()=>{if(suppressScaleClickRef.current){suppressScaleClickRef.current=false;return}cycleScale('calc')}}><span>⇲</span><b>{Math.round(calcScale*100)}%</b></button>
   </aside>}
   {pairOpen&&<aside ref={pairRef} className="calc-panel pair-panel draggable-panel scalable-panel" style={{...(pairPos?{left:pairPos.x,top:pairPos.y,right:'auto',bottom:'auto'}:{}),transform:`scale(${pairScale})`,transformOrigin:pairPos?'top left':'bottom right'}}>
    <div className="calc-head drag-handle" onPointerDown={e=>beginDrag('pair',e)} onPointerMove={moveDrag} onPointerUp={endDrag} onPointerCancel={endDrag}><div><b>對子概率</b><small>{pairRoom} · 珠盤即時同步</small></div><button type="button" className="calc-close" onPointerDown={e=>e.stopPropagation()} onClick={e=>{e.stopPropagation();setPairOpen(false)}}>×</button></div>
    <select className="pair-room-select" value={pairRoom} onChange={e=>setPairRoom(e.target.value)}>{rooms.map(x=><option key={x}>{x}</option>)}</select>
    <div className="pair-sync-row"><span>珠盤<strong>{pairBeadReady?`${pairBeads.length} 顆`:'--'}</strong></span><span className="pair-next-cell"><strong>{pairBeadReady?`第${playerPairHot.nextCol+1}欄/${playerPairHot.nextRow+1}格`:'--'}</strong><small className={`pair-signal ${pairSignalOn?'on':'off'}`}>訊號 <b>{pairSignalLamp}</b></small></span></div>
    <div className="pair-count-summary"><span>本房對子總數</span><strong>{pairTotalCount==null?'--':`${pairTotalCount} 顆`}</strong></div>
    <div className="pair-prob-grid"><div className="pair-prob player"><div className="pair-prob-title"><span>閒對</span><em>{pairBeadReady?`${playerPairHot.pairCount} 顆`:'--'}</em></div><strong>{pairValue}</strong></div><div className="pair-prob banker"><div className="pair-prob-title"><span>莊對</span><em>{pairBeadReady?`${bankerPairHot.pairCount} 顆`:'--'}</em></div><strong>{pairValue}</strong></div></div>
    <div className={`pair-recommend ${pairRecommendationValue==='莊對'?'banker':pairRecommendationValue==='閒對'?'player':''}`}><span>推薦下注</span><strong>{pairRecommendationValue}</strong></div>
    <div className="hot-recommend-divider" aria-hidden="true"/>
    <div className="tie-recommend-block"><div className="tie-recommend-label"><span>三和院概率</span><em>{pairBeadReady&&tieRecommendation.consecutiveTies>=2?`連和 ${tieRecommendation.consecutiveTies} 局`:'等待連和'}</em></div><div className={`tie-recommend ${tieRecommendationValue==='和'?'active':''}`}><span>推薦下注</span><strong>{tieRecommendationValue}</strong></div></div>
    <div className="calc-status"><i className={pairBeadReady&&live?'on':''}/>{pairBeadReady?(live?`${pairRoom} 珠盤、對子與和局即時更新`:`${pairRoom} 珠盤已解析，等待即時連線`):`等待 ${pairRoom} 完整珠盤資料`}</div>
    <button type="button" className="panel-scale-handle calc-scale-handle" aria-label="縮放對子概率" title="拖曳縮放，點一下逐級縮小" onPointerDown={e=>beginScale('pair',e)} onPointerMove={moveScale} onPointerUp={endScale} onPointerCancel={endScale} onClick={()=>{if(suppressScaleClickRef.current){suppressScaleClickRef.current=false;return}cycleScale('pair')}}><span>⇲</span><b>{Math.round(pairScale*100)}%</b></button>
   </aside>}
  </div>
 </div>
}
createRoot(document.getElementById('root')!).render(<App/>);
