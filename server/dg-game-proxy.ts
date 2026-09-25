import type { Express, Request, Response } from 'express';
import type { Server as HttpServer, IncomingMessage } from 'node:http';
import type { Socket } from 'node:net';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { createGzip, constants as zlibConstants } from 'node:zlib';
import type { DgRelay } from './dg-relay';
import { observeDgReportPayload, clearDgReport } from './dg-report-sync';

type ProxySession = {
  sessionId: string;
  origin: string;
  launchUrl: string;
  lastUsed: number;
};

type RegisterOptions = {
  app: Express;
  server: HttpServer;
  getRelay: (sessionId: string) => DgRelay | null;
};

const COOKIE_NAME = 'dg_assist_proxy_sid';
const proxySessions = new Map<string, ProxySession>();

function parseCookie(header: string | undefined, name: string) {
  if (!header) return '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    try { return decodeURIComponent(part.slice(i + 1).trim()); } catch { return part.slice(i + 1).trim(); }
  }
  return '';
}

function isPrivateHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  return host === 'localhost' || host.endsWith('.localhost') || host === '0.0.0.0' || host === '::1' ||
    /^127\./.test(host) || /^10\./.test(host) || /^192\.168\./.test(host) || /^169\.254\./.test(host) || /^172\.(1[6-9]|2\d|3[01])\./.test(host);
}

function safeHttpsUrl(raw: string) {
  const u = new URL(raw);
  if (u.protocol !== 'https:' || isPrivateHost(u.hostname)) throw new Error('invalid_dg_url');
  return u;
}

function wsAccept(key: string) {
  return createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64');
}

function injectProxyHook(html: string, sessionId: string, upstreamOrigin: string) {
  const escapedOrigin = upstreamOrigin.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const normalizedHtml = html.replace(new RegExp(escapedOrigin, 'g'), '');
  const sid = JSON.stringify(sessionId);
  const origin = JSON.stringify(upstreamOrigin);
  const hook = String.raw`<script>(function(){
const __sid=${sid},__origin=${origin};
const NativeWS=window.WebSocket;if(NativeWS&&!window.__DG_SHARED_SOCKET__){window.__DG_SHARED_SOCKET__=true;class DGSharedWebSocket extends NativeWS{constructor(url,protocols){const raw=String(url||'');let mapped=raw;if(/^wss?:\/\//i.test(raw)){const scheme=location.protocol==='https:'?'wss:':'ws:';mapped=scheme+'//'+location.host+'/api/dg/game-ws?sessionId='+encodeURIComponent(__sid)+'&target='+encodeURIComponent(raw);}if(arguments.length>1)super(mapped,protocols);else super(mapped);}}window.WebSocket=DGSharedWebSocket;}
const mapHttp=(value)=>{try{const raw=String(value||'');if(!(raw.startsWith('http://')||raw.startsWith('https://')))return value;const u=new URL(raw);return u.origin===__origin?(u.pathname+u.search+u.hash):value;}catch{return value;}};
const __nativeFetch=window.fetch&&window.fetch.bind(window);
let __reportTemplate=null,__reportTimer=0,__reportBusy=false;
const __postReport=async(payload,source)=>{if(!__nativeFetch)return false;try{const r=await __nativeFetch('/api/dg/report/browser-observe?sessionId='+encodeURIComponent(__sid),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({payload:payload,source:String(source||'browser')})});const d=await r.json();return !!d.accepted;}catch{return false;}};
const __asJson=(text)=>{if(typeof text!=='string'||!text||text.length>1800000)return null;try{return JSON.parse(text);}catch{return null;}};
const __reportHint=(text,source)=>{const s=String(source||'');if(/report|record|history|bet|wager|settle|statement|winloss|profit/i.test(s))return true;const t=String(text||'');return /(遊戲報表|游戏报表|今日報表|今日报表|投注記錄|投注记录|輸贏|输赢|總計|总计|結算時間|结算时间)/.test(t);};
const __captureCandidate=(source)=>{const s=String(source||'').split('#')[0];if(!s)return true;if(/\.(?:js|mjs|css|wasm|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|mp3|m4a|aac|ogg|mp4|webm|flv)(?:\?|$)/i.test(s))return false;if(/(?:^|\/)static\//i.test(s))return false;return true;};
const __capture=async(text,source,template,force)=>{if(typeof text!=='string'||!text||text.length>2400000)return;if(!force&&!__reportHint(text,source))return;const payload=__asJson(text);const accepted=await __postReport(payload==null?{__dgRawText:text}:payload,source);if(accepted&&template){__reportTemplate=template;}};
const __replayReport=async()=>{if(__reportBusy||!__reportTemplate||!__nativeFetch)return;__reportBusy=true;try{const t=__reportTemplate;const r=await __nativeFetch(t.url,{method:t.method||'GET',headers:t.headers||undefined,body:(t.method==='GET'||t.method==='HEAD')?undefined:t.body,credentials:'include',cache:'no-store'});const text=await r.text();await __capture(text,t.url,null,true);}catch{}finally{__reportBusy=false;}};
if(__nativeFetch){window.fetch=function(input,init){let mappedInput=input,source='';let template=null;try{if(typeof input==='string'||input instanceof URL){source=String(input);const mapped=mapHttp(source);mappedInput=mapped;const method=String((init&&init.method)||'GET').toUpperCase();template={kind:'fetch',url:String(mapped),method:method,headers:init&&init.headers?init.headers:undefined,body:init&&'body' in init?init.body:undefined};}}catch{}const p=__nativeFetch(mappedInput,init);if(__captureCandidate(source||String(mappedInput))){Promise.resolve(p).then(r=>{try{r.clone().arrayBuffer().then(buf=>{if(buf.byteLength>2400000)return;let t='';try{t=new TextDecoder().decode(new Uint8Array(buf));}catch{}if(t)__capture(t,source||String(mappedInput),template)}).catch(()=>{});}catch{}}).catch(()=>{});}return p;};}
const X=window.XMLHttpRequest;if(X){const xo=X.prototype.open,xs=X.prototype.send,xh=X.prototype.setRequestHeader;X.prototype.open=function(method,url){const args=Array.from(arguments);args[1]=mapHttp(url);this.__dgReportReq={method:String(method||'GET').toUpperCase(),url:String(args[1]),headers:{},body:null};return xo.apply(this,args);};X.prototype.setRequestHeader=function(k,v){try{if(this.__dgReportReq)this.__dgReportReq.headers[String(k)]=String(v);}catch{}return xh.apply(this,arguments);};X.prototype.send=function(body){try{if(this.__dgReportReq)this.__dgReportReq.body=body;const req=this.__dgReportReq;if(req&&__captureCandidate(req.url)){this.addEventListener('loadend',()=>{try{let text='';if(this.responseType===''||this.responseType==='text')text=this.responseText||'';else if(this.responseType==='json'&&this.response!=null)text=JSON.stringify(this.response);else if(this.responseType==='arraybuffer'&&this.response){try{text=new TextDecoder().decode(new Uint8Array(this.response))}catch{}}else if(this.responseType==='blob'&&this.response&&typeof this.response.text==='function'){this.response.text().then(t=>{if(t)__capture(t,req&&req.url||'',req?{kind:'xhr',url:req.url,method:req.method,headers:req.headers,body:req.body}:null)}).catch(()=>{});return;}if(text)__capture(text,req&&req.url||'',req?{kind:'xhr',url:req.url,method:req.method,headers:req.headers,body:req.body}:null);}catch{}},{once:true});}}catch{}return xs.apply(this,arguments);};}
const __num=(s)=>{const m=String(s||'').replace(/,/g,'').match(/[-+]?\d+(?:\.\d+)?/g);if(!m||!m.length)return null;const n=Number(m[m.length-1]);return Number.isFinite(n)?n:null;};
const __scanReportDom=()=>{try{const tables=Array.from(document.querySelectorAll('table'));for(const table of tables){const trs=Array.from(table.querySelectorAll('tr'));if(trs.length<2)continue;let header=null,roomI=-1,winI=-1,idI=-1,timeI=-1;for(const tr of trs.slice(0,4)){const cells=Array.from(tr.querySelectorAll('th,td'));const texts=cells.map(c=>(c.textContent||'').trim());const r=texts.findIndex(x=>/臺桌名稱|台桌名稱|台桌名称|桌名/.test(x));const w=texts.findIndex(x=>/輸贏|输赢/.test(x));if(r>=0&&w>=0){header=tr;roomI=r;winI=w;idI=texts.findIndex(x=>/遊戲編號|游戏编号|單號|单号/.test(x));timeI=texts.findIndex(x=>/結算時間|结算时间/.test(x));break;}}if(!header||roomI<0||winI<0)continue;const rows=[];for(const tr of trs){if(tr===header)continue;const cells=Array.from(tr.querySelectorAll('td'));if(cells.length<=Math.max(roomI,winI))continue;const roomText=(cells[roomI].textContent||'').toUpperCase();const rm=roomText.match(/(RB0[1-5]|S(?:0[1-7]|09|10))/);if(!rm)continue;const win=__num(cells[winI].textContent||'');if(win==null)continue;rows.push({id:idI>=0&&cells[idI]?String(cells[idI].textContent||'').trim():rm[1]+'|'+String(cells[winI].textContent||'').trim()+'|'+rows.length,room:rm[1],win:win,settle_time:timeI>=0&&cells[timeI]?String(cells[timeI].textContent||'').trim():undefined});}let total=null;for(const tr of trs){const cells=Array.from(tr.querySelectorAll('td,th'));if(!cells.length)continue;const first=String(cells[0].textContent||'').trim();const all=String(tr.textContent||'').trim();if(/^總計$|^总计$/.test(first)||/總計|总计/.test(all)){const vals=cells.map(c=>__num(c.textContent||'')).filter(v=>v!=null);if(vals.length)total=vals[vals.length-1];}}if(rows.length||total!=null){__postReport({rows:rows,totalWinLoss:total},'dom-report');return true;}}}catch{}return false;};
const __sleep=ms=>new Promise(r=>setTimeout(r,ms));
const __findTextButton=(pattern)=>{try{for(const el of Array.from(document.querySelectorAll('button,a,[role=button],div,span,li'))){const t=String(el.textContent||'').replace(/\s+/g,' ').trim();if(!t||t.length>40||!pattern.test(t))continue;const r=el.getBoundingClientRect&&el.getBoundingClientRect();if(r&&r.width>0&&r.height>0)return el;}}catch{}return null;};
const __openReportAndCapture=async()=>{let opened=false;try{const reportBtn=__findTextButton(/^(遊戲報表|游戏报表)$/);if(reportBtn){reportBtn.click();opened=true;await __sleep(700);}const todayBtn=__findTextButton(/^(今日報表|今日报表)$/);if(todayBtn){todayBtn.click();await __sleep(350);}const betBtn=__findTextButton(/^(投注記錄|投注记录)$/);if(betBtn){betBtn.click();await __sleep(450);}for(let i=0;i<6;i++){if(__scanReportDom())return true;await __sleep(300);}return !!__reportTemplate||opened;}catch{return false;}};
window.__DG_SCAN_REPORT_DOM__=__scanReportDom;
window.__DG_TRIGGER_REPORT_REFRESH__=async()=>{let ok=false;try{if(__reportTemplate){await __replayReport();ok=true}}catch{}try{ok=__scanReportDom()||ok}catch{}if(!ok){try{ok=await __openReportAndCapture()||ok}catch{}}try{if(__reportTemplate){await __replayReport();ok=true}}catch{}return ok;};
const __visible=(el)=>{try{const r=el.getBoundingClientRect();const st=getComputedStyle(el);return r.width>0&&r.height>0&&st.display!=='none'&&st.visibility!=='hidden';}catch{return false;}};
const __scanLooseDoc=(doc)=>{try{const rows=[];let total=null;const seen=new Set();const els=Array.from(doc.querySelectorAll('div,li,tr,section,article'));for(const el of els){if(!__visible(el))continue;const txt=String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim();if(txt.length<15||txt.length>420)continue;const rm=txt.toUpperCase().match(/(?:百家樂|百家乐|BACCARAT)?\s*(RB0[1-5]|S(?:0[1-7]|09|10))/);if(!rm)continue;const ids=txt.match(/20\d{12,24}[A-Z0-9-]*/ig)||[];if(ids.length>1)continue;const idm=ids.length?ids:null;const tm=txt.match(/20\d{2}[-\/]\d{2}[-\/]\d{2}\s+\d{2}:\d{2}:\d{2}/);const nums=txt.replace(/,/g,'').match(/[-+]?\d+(?:\.\d+)?/g)||[];if(nums.length<1)continue;let win=null;for(let i=nums.length-1;i>=0;i--){const n=Number(nums[i]);if(Number.isFinite(n)){win=n;break;}}if(win==null)continue;const id=idm?idm[0]:(rm[1]+'|'+(tm?tm[0]:'')+'|'+win);if(seen.has(id))continue;seen.add(id);rows.push({id,room:rm[1],win,settle_time:tm?tm[0]:undefined});}
const totals=Array.from(doc.querySelectorAll('div,span,td,th,li')).filter(__visible).map(el=>({el,txt:String(el.innerText||el.textContent||'').replace(/\s+/g,' ').trim()})).filter(x=>/(^|\s)(總計|总计)(\s|$)/.test(x.txt)).sort((a,b)=>a.txt.length-b.txt.length);for(const {el,txt} of totals){const nums=txt.replace(/,/g,'').match(/[-+]?\d+(?:\.\d+)?/g)||[];if(nums.length){const n=Number(nums[nums.length-1]);if(Number.isFinite(n)){total=n;break;}}}
if(rows.length||total!=null){__postReport({rows,totalWinLoss:total},'loose-dom');return true;}return false;}catch{return false;}};
const __allDocs=()=>{const out=[];const walk=(w)=>{try{if(!w||!w.document)return;out.push(w.document);for(const fr of Array.from(w.document.querySelectorAll('iframe'))){try{if(fr.contentWindow&&fr.contentDocument)walk(fr.contentWindow);}catch{}}}catch{}};walk(window);return out;};
const __scanAllDocs=()=>{let ok=false;for(const d of __allDocs()){try{ok=__scanLooseDoc(d)||ok}catch{}try{const old=window.__DG_SCAN_REPORT_DOM__;if(d===document&&typeof old==='function')ok=old()||ok}catch{}}return ok;};
const __findPageNav=(doc)=>{try{const els=Array.from(doc.querySelectorAll('div,span,td,p,b,strong')).filter(__visible);for(const el of els){const txt=String(el.textContent||'').trim();const m=txt.match(/^(\d+)\s*\/\s*(\d+)$/);if(!m)continue;const cur=Number(m[1]),total=Number(m[2]);if(!cur||!total)return null;let box=el.parentElement;for(let depth=0;box&&depth<4;depth++,box=box.parentElement){const controls=Array.from(box.querySelectorAll('button,a,[role=button],div,span')).filter(x=>x!==el&&__visible(x));let next=null;for(const c of controls){const t=String(c.textContent||'').trim();const aria=String(c.getAttribute?.('aria-label')||c.getAttribute?.('title')||'');if(/下一|next|›|»|▶|►|→/i.test(t+' '+aria)){next=c;break;}}if(!next&&controls.length){const er=el.getBoundingClientRect();const right=controls.filter(c=>{const r=c.getBoundingClientRect();return r.left>=er.right-2&&Math.abs((r.top+r.bottom)/2-(er.top+er.bottom)/2)<50;}).sort((a,b)=>a.getBoundingClientRect().left-b.getBoundingClientRect().left);if(right.length)next=right[0];}
let prev=null;if(controls.length){const er=el.getBoundingClientRect();const left=controls.filter(c=>{const r=c.getBoundingClientRect();return r.right<=er.left+2&&Math.abs((r.top+r.bottom)/2-(er.top+er.bottom)/2)<50;}).sort((a,b)=>b.getBoundingClientRect().right-a.getBoundingClientRect().right);if(left.length)prev=left[0];}if(next||prev)return{cur,total,next,prev};}return{cur,total,next:null,prev:null};}return null;}catch{return null;}};
/* reuse __sleep declared above */
const __waitPageChange=async(before)=>{for(let i=0;i<14;i++){await __sleep(180);for(const d of __allDocs()){const n=__findPageNav(d);if(n&&n.cur!==before)return true;}}return false;};
window.__DG_SCAN_REPORT_ALL_PAGES__=async()=>{let any=false;try{let firstNav=null;for(const d of __allDocs()){const n=__findPageNav(d);if(n){firstNav=n;break;}}for(let back=0;firstNav&&firstNav.cur>1&&firstNav.prev&&back<20;back++){const before=firstNav.cur;try{firstNav.prev.click();}catch{break;}if(!(await __waitPageChange(before)))break;firstNav=null;for(const d of __allDocs()){const n=__findPageNav(d);if(n){firstNav=n;break;}}}for(let loop=0;loop<20;loop++){let nav=null;for(const d of __allDocs()){try{any=__scanLooseDoc(d)||any}catch{}if(!nav){const n=__findPageNav(d);if(n)nav=n;}}if(!nav||nav.cur>=nav.total||!nav.next)break;const before=nav.cur;try{nav.next.click();}catch{break;}if(!(await __waitPageChange(before)))break;}for(const d of __allDocs()){try{any=__scanLooseDoc(d)||any}catch{}}}catch{}return any;};
window.__DG_TRIGGER_REPORT_REFRESH__=async()=>{let ok=false;try{if(__reportTemplate){await __replayReport();ok=true}}catch{}try{ok=await window.__DG_SCAN_REPORT_ALL_PAGES__()||ok}catch{}if(!ok){try{ok=await __openReportAndCapture()||ok}catch{}try{ok=await window.__DG_SCAN_REPORT_ALL_PAGES__()||ok}catch{}}try{if(__reportTemplate){await __replayReport();ok=true}}catch{}return ok;};
const __layaPrimitive=(v)=>typeof v==='string'||typeof v==='number'?String(v):'';
const __parseLayaRows=(lines)=>{try{const rows=[];const idRe=/^20\d{10,24}[A-Z][A-Z0-9-]*$/i;const roomRe=/(RB0[1-5]|S(?:0[1-7]|09|10))/i;const timeRe=/20\d{2}[-\/]\d{2}[-\/]\d{2}\s+\d{2}:\d{2}:\d{2}/;const moneyRe=/^[-+]?\d[\d,]*(?:\.\d+)?$/;const idx=[];for(let i=0;i<lines.length;i++){if(idRe.test(String(lines[i]).trim()))idx.push(i);}for(let k=0;k<idx.length;k++){const i=idx[k],end=Math.min(idx[k+1]??lines.length,i+24);const seg=lines.slice(i,end).map(x=>String(x).replace(/\s+/g,' ').trim()).filter(Boolean);const roomLine=seg.find(x=>roomRe.test(x));const rm=roomLine&&roomLine.match(roomRe);const timeLine=seg.find(x=>timeRe.test(x));if(!rm||!timeLine)continue;let resultPos=seg.findIndex(x=>/^(?:莊|庄|閒|闲|和)(?:\(|$)/.test(x));if(resultPos<0)resultPos=seg.findIndex(x=>/(?:莊|庄|閒|闲|和)\s*\(\d+\)/.test(x));let win=null;if(resultPos>=0){for(let j=resultPos+1;j<Math.min(seg.length,resultPos+5);j++){const raw=seg[j].replace(/,/g,'');if(!moneyRe.test(raw))continue;const n=Number(raw);if(Number.isFinite(n)){win=n;break;}}}if(win==null){const tpos=seg.findIndex(x=>timeRe.test(x));const nums=[];for(let j=Math.max(0,tpos+1);j<seg.length;j++){const raw=seg[j].replace(/,/g,'');if(moneyRe.test(raw)&&(/[.]/.test(raw)||/^[-+]?0$/.test(raw))){const n=Number(raw);if(Number.isFinite(n))nums.push(n);}}if(nums.length>=3)win=nums[nums.length-1];}if(win==null)continue;rows.push({id:seg[0],room:rm[1].toUpperCase(),win,settle_time:timeLine.match(timeRe)?.[0]});}
let total=null;for(let i=0;i<lines.length;i++){if(!/^(總計|总计)$/.test(String(lines[i]).trim()))continue;const vals=[];for(let j=i+1;j<Math.min(lines.length,i+8);j++){const raw=String(lines[j]).replace(/,/g,'').trim();if(!moneyRe.test(raw))continue;const n=Number(raw);if(Number.isFinite(n))vals.push(n);}if(vals.length)total=vals[vals.length-1];}
return{rows,total};}catch{return{rows:[],total:null}};};
const __scanLayaReport=async()=>{try{const L=window.Laya;const root=L&&L.stage;if(!root)return false;const lines=[];const seenSeq=[];let nodes=0;const push=v=>{const t=__layaPrimitive(v).replace(/\s+/g,' ').trim();if(t&&t.length<=500){lines.push(t);seenSeq.push(t);}};const walk=(node,depth)=>{if(!node||depth>24||nodes++>9000)return;try{for(const k of ['text','_text','label','_label','value','_value','title','_title'])push(node[k]);for(const k of ['dataSource','_dataSource']){const v=node[k];if(v==null)continue;if(typeof v==='string'||typeof v==='number')push(v);else if(typeof v==='object'){try{const j=JSON.stringify(v);if(j&&j.length<120000)push(j);}catch{}}}let ch=[];if(Array.isArray(node._children))ch=node._children;else if(typeof node.numChildren==='number'&&typeof node.getChildAt==='function'){for(let i=0;i<node.numChildren;i++){try{ch.push(node.getChildAt(i));}catch{}}}for(const c of ch)walk(c,depth+1);}catch{}};walk(root,0);if(!lines.length)return false;const raw=lines.join('\n');const hasReport=/(遊戲報表|游戏报表|今日報表|今日报表|投注記錄|投注记录|輸贏|输赢|總計|总计)/.test(raw);const hasData=/(RB0[1-5]|S(?:0[1-7]|09|10)|20\d{2}[-\/]\d{2}[-\/]\d{2}|20\d{12,24})/i.test(raw);if(!hasReport||!hasData)return false;const parsed=__parseLayaRows(lines);const payload=parsed.rows.length||parsed.total!=null?{rows:parsed.rows,totalWinLoss:parsed.total,__dgRawText:raw}:{__dgRawText:raw,__dgLayaText:lines.slice(0,3000)};return await __postReport(payload,'laya-stage');}catch{return false;}};
window.__DG_SCAN_LAYA_REPORT__=__scanLayaReport;
const __scanAllSources=async()=>{let ok=false;try{ok=__scanAllDocs()||ok}catch{}try{ok=await __scanLayaReport()||ok}catch{}return ok;};
window.__DG_TRIGGER_REPORT_REFRESH__=async()=>{let ok=false;try{if(__reportTemplate){await __replayReport();ok=true}}catch{}try{ok=await __scanLayaReport()||ok}catch{}try{ok=await window.__DG_SCAN_REPORT_ALL_PAGES__()||ok}catch{}if(!ok){try{ok=await __openReportAndCapture()||ok}catch{}try{ok=await __scanLayaReport()||ok}catch{}try{ok=await window.__DG_SCAN_REPORT_ALL_PAGES__()||ok}catch{}}try{if(__reportTemplate){await __replayReport();ok=true}}catch{}return ok;};
window.__DG_REPORT_HAS_TEMPLATE__=()=>!!__reportTemplate;
if(!window.__DG_REPORT_DOM_OBSERVER__){window.__DG_REPORT_DOM_OBSERVER__=true;/* V19 performance: heavy DOM/Laya report scans run only on explicit refresh. Passive fetch/XHR capture remains available. */}
})();</script>`;
  if (/<head(?:\s[^>]*)?>/i.test(normalizedHtml)) return normalizedHtml.replace(/<head(?:\s[^>]*)?>/i, m => m + hook);
  return hook + normalizedHtml;
}

function sessionFromRequest(req: Request) {
  const sid = parseCookie(req.headers.cookie, COOKIE_NAME);
  if (!sid) return null;
  const item = proxySessions.get(sid);
  if (!item) return null;
  item.lastUsed = Date.now();
  return item;
}

function copyUpstreamHeaders(req: Request, origin: string) {
  const headers = new Headers();
  const pass = ['accept','accept-language','cache-control','pragma','range','if-none-match','if-modified-since','content-type','user-agent'];
  for (const key of pass) {
    const v = req.headers[key];
    if (typeof v === 'string' && v) headers.set(key, v);
  }
  headers.set('referer', origin + '/');
  if (req.headers.origin) headers.set('origin', origin);
  return headers;
}

function forwardHeaders(upstream: globalThis.Response, res: Response, rewritten: boolean) {
  const blocked = new Set(['content-length','content-encoding','transfer-encoding','connection','keep-alive','set-cookie','content-security-policy','content-security-policy-report-only','x-frame-options','cross-origin-opener-policy','cross-origin-embedder-policy','cross-origin-resource-policy']);
  upstream.headers.forEach((value, key) => { if (!blocked.has(key.toLowerCase())) { try { res.setHeader(key, value); } catch {} } });
  if (rewritten) res.setHeader('Cache-Control', 'no-store');
}

function isCompressibleContentType(contentType: string) {
  return /^text\/|application\/(?:javascript|x-javascript|json|xml|wasm)|image\/svg\+xml/i.test(contentType);
}

function isStaticAssetPath(pathname: string) {
  return /\.(?:js|mjs|css|json|wasm|png|jpe?g|webp|gif|svg|ico|woff2?|ttf|otf|mp3|m4a|aac|ogg|mp4|webm|flv)(?:$|\?)/i.test(pathname);
}

function isLikelyReportRequest(target: URL, contentType = '') {
  const source = `${target.pathname}${target.search}`;
  if (/report|record|history|bet|wager|settle|statement|winloss|profit|order/i.test(source)) return true;
  if (/^\/apidata(?:\/|$)/i.test(target.pathname)) return true;
  // Keep small JSON/text API responses observable, but skip heavy game/static assets.
  if (/application\/json|text\/plain/i.test(contentType) && !isStaticAssetPath(target.pathname)) return true;
  return false;
}

class BrowserWsParser {
  private buffer = Buffer.alloc(0);
  private fragments: Buffer[] = [];
  private fragmentOpcode = 0;
  constructor(private onBinary: (data: Buffer) => void, private onPing: (data: Buffer) => void, private onClose: () => void) {}
  push(chunk: Buffer) {
    this.buffer = this.buffer.length ? Buffer.concat([this.buffer, chunk]) : Buffer.from(chunk);
    while (this.buffer.length >= 2) {
      const b0=this.buffer[0]!,b1=this.buffer[1]!;const fin=!!(b0&0x80),opcode=b0&0x0f,masked=!!(b1&0x80);let len=b1&0x7f,pos=2;
      if(len===126){if(this.buffer.length<4)return;len=this.buffer.readUInt16BE(2);pos=4}else if(len===127){if(this.buffer.length<10)return;const big=this.buffer.readBigUInt64BE(2);if(big>BigInt(16*1024*1024)){this.buffer=Buffer.alloc(0);return}len=Number(big);pos=10}
      const maskBytes=masked?4:0;if(len>16*1024*1024||this.buffer.length<pos+maskBytes+len)return;
      let payload=Buffer.from(this.buffer.subarray(pos+maskBytes,pos+maskBytes+len));if(masked){const mask=this.buffer.subarray(pos,pos+4);for(let i=0;i<payload.length;i++)payload[i]^=mask[i%4]!}
      this.buffer=this.buffer.subarray(pos+maskBytes+len);
      if(opcode===8){this.onClose();return}if(opcode===9){this.onPing(payload);continue}if(opcode===10)continue;
      if(opcode===0){this.fragments.push(payload);if(fin){const full=Buffer.concat(this.fragments),op=this.fragmentOpcode;this.fragments=[];this.fragmentOpcode=0;if(op===2)this.onBinary(full)}continue}
      if(!fin&&(opcode===1||opcode===2)){this.fragmentOpcode=opcode;this.fragments=[payload];continue}
      if(fin&&opcode===2)this.onBinary(payload);
    }
  }
}

function serverFrame(opcode: number, payload: Buffer) {
  let head: Buffer; const len=payload.length;
  if(len<126)head=Buffer.from([0x80|(opcode&0x0f),len]);
  else if(len<=0xffff){head=Buffer.alloc(4);head[0]=0x80|(opcode&0x0f);head[1]=126;head.writeUInt16BE(len,2)}
  else{head=Buffer.alloc(10);head[0]=0x80|(opcode&0x0f);head[1]=127;head.writeBigUInt64BE(BigInt(len),2)}
  return Buffer.concat([head,payload]);
}

function handleGameWsUpgrade(req: IncomingMessage, client: Socket, head: Buffer, options: RegisterOptions) {
  let parsed: URL; try { parsed = new URL(req.url || '', 'http://localhost'); } catch { client.destroy(); return; }
  if (parsed.pathname !== '/api/dg/game-ws') return;
  const sid = parsed.searchParams.get('sessionId') || '';
  const ps = proxySessions.get(sid);
  const relay = options.getRelay(sid);
  if (!ps || !relay) { client.end('HTTP/1.1 404 Not Found\r\n\r\n'); return; }
  const targetRaw = parsed.searchParams.get('target') || '';
  if (targetRaw) { try { const t = new URL(targetRaw); if (t.protocol !== 'wss:' || isPrivateHost(t.hostname)) throw new Error(); } catch { client.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; } }
  const key = String(req.headers['sec-websocket-key'] || '');
  if (!key) { client.end('HTTP/1.1 400 Bad Request\r\n\r\n'); return; }
  // Keep live road packets latency-first between Render and the browser.
  // This socket only carries the local DG WebSocket view; disabling Nagle
  // prevents small result frames from being coalesced behind unrelated data.
  try { client.setNoDelay(true); client.setKeepAlive(true, 15000); } catch {}
  client.write(['HTTP/1.1 101 Switching Protocols','Upgrade: websocket','Connection: Upgrade',`Sec-WebSocket-Accept: ${wsAccept(key)}`,'\r\n'].join('\r\n'));

  let closed=false; const queue:Buffer[]=[]; let draining=false; let retry:ReturnType<typeof setTimeout>|null=null;
  const writeBinary=(data:Buffer)=>{if(!closed&&!client.destroyed&&data?.length){try{client.write(serverFrame(2,data))}catch{}}};
  const drain=async()=>{if(closed||draining)return;draining=true;try{while(!closed&&queue.length){const ok=await relay.forwardForegroundFrame(queue[0]!,writeBinary);if(!ok){retry=setTimeout(()=>{retry=null;void drain()},100);retry.unref?.();break}queue.shift()}}finally{draining=false}};
  const detach=relay.attachForegroundBridgeSink(writeBinary);
  const finish=()=>{if(closed)return;closed=true;if(retry)clearTimeout(retry);try{detach()}catch{};try{client.destroy()}catch{}};
  const parser=new BrowserWsParser(data=>{if(queue.length>=256)queue.shift();queue.push(Buffer.from(data));void drain()},data=>{try{client.write(serverFrame(10,data))}catch{}},finish);
  if(head?.length)parser.push(head);
  client.on('data',chunk=>parser.push(Buffer.isBuffer(chunk)?chunk:Buffer.from(chunk)));
  client.on('error',finish);client.on('close',finish);
}

export function registerDgGameProxy(options: RegisterOptions) {
  const { app, server, getRelay } = options;

  app.post('/api/dg/proxy/enter', async (req: Request, res: Response) => {
    const sid=String(req.body?.sessionId||''); const relay=getRelay(sid);
    if(!sid||!relay)return res.status(404).json({ok:false,message:'DG 即時連線尚未建立'});
    let resolved='';try{resolved=relay.getResolvedLaunchUrl();safeHttpsUrl(resolved)}catch{return res.status(400).json({ok:false,message:'DG 啟動網址無效'})}
    const u=new URL(resolved); relay.enterBridgeMode();
    proxySessions.set(sid,{sessionId:sid,origin:u.origin,launchUrl:resolved,lastUsed:Date.now()});
    res.setHeader('Set-Cookie',`${COOKIE_NAME}=${encodeURIComponent(sid)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=14400${process.env.NODE_ENV==='production'?'; Secure':''}`);
    return res.json({ok:true,url:u.pathname+u.search});
  });

  app.post('/api/dg/proxy/leave', async (req: Request, res: Response) => {
    const sid=String(req.body?.sessionId||'');proxySessions.delete(sid);clearDgReport(sid);
    res.setHeader('Set-Cookie',`${COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${process.env.NODE_ENV==='production'?'; Secure':''}`);
    const relay=getRelay(sid);if(relay)relay.leaveBridgeMode();return res.json({ok:true});
  });

  const proxyHandler=async(req:Request,res:Response)=>{
    const session=sessionFromRequest(req);if(!session)return res.status(401).send('DG proxy session expired');
    let target:URL;try{target=new URL(req.originalUrl||req.url,session.origin)}catch{return res.status(400).send('Bad DG proxy URL')}
    target.hash='';
    try{
      const init:RequestInit & {duplex?:'half'}={method:req.method,headers:copyUpstreamHeaders(req,session.origin),redirect:'manual'};
      if(req.method!=='GET'&&req.method!=='HEAD'){
        const ct=String(req.headers['content-type']||'').toLowerCase();
        if(req.body!=null&&/application\/json/.test(ct))init.body=JSON.stringify(req.body);
        else if(req.body!=null&&/application\/x-www-form-urlencoded/.test(ct))init.body=new URLSearchParams(req.body as Record<string,string>).toString();
        else{init.body=req as any;init.duplex='half'}
      }
      const upstream=await fetch(target,init as any);const location=upstream.headers.get('location');
      if(location&&upstream.status>=300&&upstream.status<400){const next=new URL(location,target);if(next.protocol==='https:'&&!isPrivateHost(next.hostname)){session.origin=next.origin;session.launchUrl=next.toString();res.status(upstream.status).setHeader('Location',next.pathname+next.search).end();return}res.status(upstream.status).setHeader('Location',location).end();return}
      const ct=upstream.headers.get('content-type')||'';const isHtml=/text\/html|application\/xhtml\+xml/i.test(ct)||/(?:^|\/)index\.html$/i.test(target.pathname)||/(?:^|\/)direct1\.html$/i.test(target.pathname);
      // Performance: never tee/decode large static game assets just to look for reports.
      // Only report-like API responses are observed automatically; manual report refresh
      // remains available and preserves the existing P/L workflow.
      if(isLikelyReportRequest(target,ct)){try{
        const copy=upstream.clone();
        void copy.arrayBuffer().then(buf=>{
          if(buf.byteLength>2_400_000)return;
          let text='';try{text=new TextDecoder().decode(new Uint8Array(buf))}catch{}
          if(!text)return;
          let payload:any=text;try{payload=JSON.parse(text)}catch{}
          try{observeDgReportPayload(session.sessionId,req,target,payload)}catch{}
        }).catch(()=>{});
      }catch{}}
      res.status(upstream.status);forwardHeaders(upstream,res,isHtml);
      if(!isHtml&&req.method==='GET'&&isStaticAssetPath(target.pathname)&&!upstream.headers.get('cache-control')){res.setHeader('Cache-Control','public, max-age=3600, stale-while-revalidate=86400')}
      if(req.method==='HEAD'||upstream.status===204||upstream.status===304||!upstream.body)return res.end();
      if(isHtml){const html=await upstream.text();return res.type('html').send(injectProxyHook(html,session.sessionId,session.origin))}
      const body=Readable.fromWeb(upstream.body as any);
      const acceptsGzip=/\bgzip\b/i.test(String(req.headers['accept-encoding']||''));
      if(acceptsGzip&&isCompressibleContentType(ct)){
        res.setHeader('Content-Encoding','gzip');
        const vary=String(res.getHeader('Vary')||'');
        res.setHeader('Vary',vary?`${vary}, Accept-Encoding`:'Accept-Encoding');
        body.pipe(createGzip({level:zlibConstants.Z_BEST_SPEED})).pipe(res);
      }else body.pipe(res);
    }catch(e:any){console.error(`[DG proxy] ${req.method} ${target.pathname} failed: ${e?.message||e}`);if(!res.headersSent)res.status(502).send('DG proxy upstream failed');else res.end()}
  };

  for(const base of ['/ddnewpc','/ddnewwap','/static','/vd','/apidata','/giftrobot'])app.use(base,proxyHandler);
  // DG has used additional same-origin report endpoints across builds. If a request
  // comes from a proxied DG page and belongs to an active player session, proxy it too
  // instead of letting Express fall through to our SPA. This keeps report traffic tied
  // to the correct player's session without affecting our own /api or /assets routes.
  app.use((req:Request,res:Response,next)=>{
    if(req.path.startsWith('/api/')||req.path.startsWith('/assets/')||req.path==='/favicon.ico')return next();
    const session=sessionFromRequest(req);if(!session)return next();
    const ref=String(req.headers.referer||'');
    const isDgRef=/\/ddnew(?:pc|wap)\//i.test(ref)||ref.includes(session.origin);
    if(!isDgRef)return next();
    return void proxyHandler(req,res);
  });

  server.on('upgrade',(req,socket,head)=>{try{const u=new URL(req.url||'','http://localhost');if(u.pathname==='/api/dg/game-ws')handleGameWsUpgrade(req,socket as Socket,head,options)}catch{try{socket.destroy()}catch{}}});

  const timer=setInterval(()=>{const now=Date.now();for(const[sid,item]of proxySessions)if(now-item.lastUsed>6*60*60*1000)proxySessions.delete(sid)},30*60*1000);timer.unref?.();
}
