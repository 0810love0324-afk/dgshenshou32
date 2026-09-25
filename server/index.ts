import express from 'express';
import path from 'node:path';
import http from 'node:http';
import { fileURLToPath } from 'node:url';
import { getDgRelay, startDgRelay, stopDgRelay, sweepIdleDgRelays } from './dg-relay';
import { registerDgGameProxy } from './dg-game-proxy';
import { clearDgReport, getDgReportSnapshot, refreshDgReport, observeDgReportBrowserPayload } from './dg-report-sync';

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: false }));

function cleanSessionId(value: unknown) {
  const text = String(value ?? '').trim();
  return /^[A-Za-z0-9_-]{8,96}$/.test(text) ? text : '';
}
function validateDgGameUrl(value: unknown) {
  const text=String(value??'').trim();if(!text)throw new Error('缺少 DG 授權網址');const u=new URL(text);
  if(u.protocol!=='https:'||!u.searchParams.get('token')||u.username||u.password)throw new Error('DG 授權網址無效或缺少 token');
  const host=u.hostname.toLowerCase();if(!host||host==='localhost'||host.endsWith('.localhost'))throw new Error('DG 授權網址主機無效');return u.toString();
}

app.get('/api/health',(_req,res)=>{const sweep=sweepIdleDgRelays(5*60_000);res.json({ok:true,mode:'roomcode-live-bugfix-v4',activeRelays:sweep.active,note:'保留 roomcode 即時更新；修正 SSE 心跳、最近/建議、空白載入點與前景遊戲重連干擾。'});});

app.post('/api/dg/collector/start',async(req,res)=>{
  const sessionId=cleanSessionId(req.body?.sessionId);if(!sessionId)return res.status(400).json({ok:false,message:'缺少有效 sessionId'});
  let gameUrl='';try{gameUrl=validateDgGameUrl(req.body?.gameUrl)}catch(e:any){return res.status(400).json({ok:false,message:e?.message||'DG 授權網址無效'})}
  try{const{relay,reused}=await startDgRelay(sessionId,gameUrl);return res.json({ok:true,reused,state:relay.getStatus(),health:relay.getHealth()})}catch(e:any){return res.status(502).json({ok:false,message:e?.message||'DG 即時資料連線啟動失敗'})}
});


app.post('/api/dg/report/browser-observe',(req,res)=>{
  const sessionId=cleanSessionId(req.query.sessionId ?? req.body?.sessionId);if(!sessionId)return res.status(400).json({ok:false,accepted:false,message:'缺少有效 sessionId'});
  const accepted=observeDgReportBrowserPayload(sessionId,req.body?.payload, String(req.body?.source||'browser'));
  if(accepted)getDgRelay(sessionId)?.captureRecentReportRequests();
  return res.json({ok:true,accepted});
});

app.post('/api/dg/report/capture',(req,res)=>{
  const sessionId=cleanSessionId(req.body?.sessionId ?? req.query.sessionId);if(!sessionId)return res.status(400).json({ok:false,message:'缺少有效 sessionId'});
  const captured=getDgRelay(sessionId)?.captureRecentReportRequests(Number(req.body?.windowMs)||6000)||false;
  return res.json({ok:true,captured});
});

app.get('/api/dg/report',async(req,res)=>{
  const sessionId=cleanSessionId(req.query.sessionId);if(!sessionId)return res.status(400).json({ok:false,message:'缺少有效 sessionId'});
  const force=String(req.query.force||'')==='1';
  if(force){
    const relay=getDgRelay(sessionId);
    const replayed=relay?.requestReportRefresh(true)||false;
    if(replayed)await new Promise(r=>setTimeout(r,650));
    await refreshDgReport(sessionId,{force:true});
  }
  return res.json({ok:true,...getDgReportSnapshot(sessionId)});
});

app.post('/api/dg/report/refresh',async(req,res)=>{
  const sessionId=cleanSessionId(req.body?.sessionId ?? req.query.sessionId);if(!sessionId)return res.status(400).json({ok:false,message:'缺少有效 sessionId'});
  const relay=getDgRelay(sessionId);relay?.requestReportRefresh(true);await new Promise(r=>setTimeout(r,650));
  await refreshDgReport(sessionId,{force:true});
  return res.json({ok:true,...getDgReportSnapshot(sessionId)});
});

app.get('/api/dg/stream',(req,res)=>{
  const sessionId=cleanSessionId(req.query.sessionId);res.set({'Content-Type':'text/event-stream; charset=utf-8','Cache-Control':'no-cache, no-transform',Connection:'keep-alive','X-Accel-Buffering':'no'});res.flushHeaders();res.write(': connected\n\n');
  if(!sessionId){res.write(`event: status\ndata: ${JSON.stringify({status:'error',message:'缺少有效 sessionId'})}\n\n`);return res.end()}
  const relay=getDgRelay(sessionId);if(!relay){res.write(`event: status\ndata: ${JSON.stringify({status:'idle',message:'等待 DG 即時資料啟動'})}\n\n`);return res.end()}
  const unsubscribe=relay.subscribe(res);const heartbeat=setInterval(()=>{try{res.write(`event: heartbeat\ndata: ${JSON.stringify({state:relay.getStatus(),at:Date.now()})}\n\n`)}catch{}},10_000);req.on('close',()=>{clearInterval(heartbeat);unsubscribe()});
});

app.post('/api/dg/collector/stop',(req,res)=>{const sid=cleanSessionId(req.body?.sessionId);if(sid){stopDgRelay(sid);clearDgReport(sid)}res.json({ok:true})});
app.post('/api/dg/reset',(req,res)=>{const sid=cleanSessionId(req.body?.sessionId);if(sid){stopDgRelay(sid);clearDgReport(sid)}res.json({ok:true})});

const server=http.createServer(app);
registerDgGameProxy({app,server,getRelay:getDgRelay});

const here=path.dirname(fileURLToPath(import.meta.url));const web=path.resolve(here,'../dist');
app.use(express.static(web));app.use((_req,res)=>res.sendFile(path.join(web,'index.html')));

const port=Number(process.env.PORT||10000);server.listen(port,()=>{console.log(`[DG神手] one-login / one-vendor-websocket ready on ${port}`);console.log('[DG神手] DG game + floating assistant now share the same upstream WebSocket.');});
const sweepTimer=setInterval(()=>sweepIdleDgRelays(5*60_000),60_000);sweepTimer.unref?.();
function shutdown(){clearInterval(sweepTimer);process.exit(0)}process.on('SIGTERM',shutdown);process.on('SIGINT',shutdown);
