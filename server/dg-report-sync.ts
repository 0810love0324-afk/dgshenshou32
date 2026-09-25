import type { Request } from 'express';

export type ReportRow = {
  id: string;
  room: string;
  win: number;
  settledAt?: number;
};

export type DgReportSnapshot = {
  ready: boolean;
  complete: boolean;
  updatedAt: number;
  total: number;
  subtotalByRoom: Record<string, number>;
  recordCount: number;
  source?: string;
  status: 'waiting' | 'syncing' | 'live' | 'error';
  message?: string;
};

type RequestTemplate = {
  method: string;
  url: string;
  headers: Record<string, string>;
  contentType: string;
  bodyKind: 'json' | 'form' | 'none';
  body: any;
  capturedAt: number;
};

type ReportState = {
  rows: Map<string, ReportRow>;
  directTotal: number | null;
  template: RequestTemplate | null;
  lastPollAt: number;
  pollPromise: Promise<void> | null;
  lastObservedAt: number;
  source: string;
  status: DgReportSnapshot['status'];
  message: string;
  complete: boolean;
};

const states = new Map<string, ReportState>();
const ROOM_BY_TABLE = new Map<number, string>([
  [60101, 'RB01'], [60102, 'RB02'], [60103, 'RB03'], [60104, 'RB04'], [60105, 'RB05'],
  [50101, 'S01'], [50102, 'S02'], [50103, 'S03'], [50104, 'S05'], [50105, 'S06'], [50106, 'S07'], [50107, 'S09'], [50108, 'S10'],
]);

function stateFor(sessionId: string) {
  let s = states.get(sessionId);
  if (!s) {
    s = { rows: new Map(), directTotal: null, template: null, lastPollAt: 0, pollPromise: null, lastObservedAt: 0, source: '', status: 'waiting', message: '等待 DG 遊戲報表資料', complete: false };
    states.set(sessionId, s);
  }
  return s;
}

function toNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value === 'string') {
    const cleaned = value.replace(/,/g, '').replace(/[+\s]/g, '').trim();
    if (!/^[-+]?\d+(?:\.\d+)?$/.test(cleaned)) return null;
    const n = Number(cleaned);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function normalizeRoom(value: unknown): string {
  if (typeof value === 'number' && ROOM_BY_TABLE.has(value)) return ROOM_BY_TABLE.get(value)!;
  const text = String(value ?? '').trim().toUpperCase();
  if (!text) return '';
  const visible = text.match(/\b(RB0[1-5]|S(?:0[1-7]|09|10))\b/);
  if (visible) return visible[1]!;
  const num = Number(text.replace(/\D/g, ''));
  if (ROOM_BY_TABLE.has(num)) return ROOM_BY_TABLE.get(num)!;
  const bac = text.match(/\bBAC0*([1-5])\b/);
  if (bac) return `RB0${bac[1]}`;
  return '';
}

function taipeiDayKey(ms = Date.now()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Taipei', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date(ms));
  const get = (t: string) => parts.find(x => x.type === t)?.value || '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

function parseTime(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) {
    const ms = value < 10_000_000_000 ? value * 1000 : value;
    return Number.isFinite(ms) ? ms : undefined;
  }
  const text = String(value ?? '').trim();
  if (!text) return undefined;
  if (/^\d{10,13}$/.test(text)) return parseTime(Number(text));
  // DG report UI is GMT+8. Treat timezone-less report timestamps as Asia/Taipei.
  const normalized = text.replace(/\//g, '-').replace(/\s+/, 'T');
  const withZone = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2})?$/.test(normalized) ? `${normalized}+08:00` : normalized;
  const ms = Date.parse(withZone);
  return Number.isFinite(ms) ? ms : undefined;
}

const WIN_KEYS = [
  'winloss','win_loss','winlose','win_lose','profitloss','profit_loss','profit','netwin','net_win','netprofit','net_profit',
  'winamount','win_amount','winmoney','win_money','resultamount','result_amount','settleamount','settle_amount','settlewin','settle_win',
  'payoff','gainloss','gain_loss','pnl','win','winloseamount','winlossamount','resultwinlose','resultwinloss','memberwinlose','盈虧','盈亏','輸贏','输赢'
];
const ROOM_KEYS = ['tablename','table_name','table','tablecode','table_code','tabletitle','table_title','roomname','room_name','room','deskname','desk_name','desk','tableno','table_no','tableid','table_id','台桌名稱','台桌名称','臺桌名稱','臺桌名称','桌名','房間','房间'];
const TIME_KEYS = ['settletime','settle_time','closetime','close_time','endtime','end_time','resulttime','result_time','createtime','create_time','bettime','bet_time','結算時間','结算时间'];
const ID_KEYS = ['gameno','game_no','orderno','order_no','betno','bet_no','billno','bill_no','serialno','serial_no','recordid','record_id','id','遊戲編號','游戏编号'];

function keyNorm(key: string) { return key.replace(/[\s-]/g, '').toLowerCase(); }
function pickByKeys(obj: Record<string, any>, keys: string[]) {
  for (const [k, v] of Object.entries(obj)) if (keys.includes(keyNorm(k))) return v;
  return undefined;
}

function findRoom(obj: Record<string, any>) {
  for (const [k, v] of Object.entries(obj)) {
    if (ROOM_KEYS.includes(keyNorm(k))) {
      const room = normalizeRoom(v);
      if (room) return room;
    }
  }
  for (const v of Object.values(obj)) {
    if (typeof v === 'string') {
      const room = normalizeRoom(v);
      if (room) return room;
    }
  }
  return '';
}

function findWin(obj: Record<string, any>) {
  for (const [k, v] of Object.entries(obj)) {
    const nk = keyNorm(k);
    if (!WIN_KEYS.includes(nk)) continue;
    const n = toNumber(v);
    if (n != null) return n;
  }
  return null;
}

function findTime(obj: Record<string, any>) {
  for (const [k, v] of Object.entries(obj)) if (TIME_KEYS.includes(keyNorm(k))) {
    const t = parseTime(v); if (t) return t;
  }
  return undefined;
}

function findId(obj: Record<string, any>) {
  for (const [k, v] of Object.entries(obj)) if (ID_KEYS.includes(keyNorm(k)) && v != null && String(v).trim()) return String(v).trim();
  return '';
}

function rowConfidence(obj: Record<string, any>) {
  const keys = Object.keys(obj).map(keyNorm);
  let score = 0;
  if (keys.some(k => ROOM_KEYS.includes(k))) score += 2;
  if (keys.some(k => WIN_KEYS.includes(k))) score += 3;
  if (keys.some(k => TIME_KEYS.includes(k))) score += 2;
  if (keys.some(k => ID_KEYS.includes(k))) score += 1;
  if (keys.some(k => /valid.*bet|bet.*amount|effective.*bet|有效.*注/.test(k))) score += 1;
  return score;
}

function extractReportRowText(value: string): ReportRow | null {
  const text = String(value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
  if (text.length < 12 || text.length > 2000) return null;
  const room = normalizeRoom(text);
  if (!room) return null;
  const timeMatch = text.match(/20\d{2}[-\/]\d{2}[-\/]\d{2}\s+\d{2}:\d{2}:\d{2}/);
  const idMatch = text.match(/\b20\d{10,24}[A-Z][A-Z0-9-]*\b/i) || text.match(/\b20\d{12,26}\b/);
  if (!timeMatch && !idMatch) return null;
  const after = timeMatch ? text.slice((timeMatch.index || 0) + timeMatch[0].length) : text;
  const nums = after.replace(/,/g, '').match(/[-+]?\d+(?:\.\d+)?/g) || [];
  if (!nums.length) return null;
  // DG report rows end with the real win/loss column. Bet/effective bet appear before it.
  const win = Number(nums[nums.length - 1]);
  if (!Number.isFinite(win)) return null;
  const settledAt = timeMatch ? parseTime(timeMatch[0]) : undefined;
  if (settledAt && taipeiDayKey(settledAt) !== taipeiDayKey()) return null;
  return { id: idMatch?.[0] || `${room}|${timeMatch?.[0] || ''}|${win}|${text.slice(0, 120)}`, room, win, settledAt };
}


function htmlToLooseText(value: string) {
  return String(value || '')
    .replace(/<\s*br\s*\/?>/gi, '\n')
    .replace(/<\/(?:tr|td|th|div|li|p|section|article)>/gi, '\n')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/\r/g, '\n');
}

function extractRowsFromLooseText(value: string): ReportRow[] {
  const raw = htmlToLooseText(value);
  if (!raw) return [];
  const out: ReportRow[] = [];
  const seen = new Set<string>();
  // Break minified HTML/text around DG game record ids and timestamps so a whole
  // report response is not mistaken for one row.
  const expanded = raw
    .replace(/(?=20\d{12,24}[A-Z][A-Z0-9-]*)/ig, '\n')
    .replace(/(?=20\d{2}[-\/]\d{2}[-\/]\d{2}\s+\d{2}:\d{2}:\d{2})/g, '\n');
  const lines = expanded.split(/\n+/).map(x => x.replace(/\s+/g, ' ').trim()).filter(Boolean);
  for (let i = 0; i < lines.length; i++) {
    // A rendered row can be split across adjacent cells/lines. Try a small rolling
    // window; dedupe by DG game id afterwards.
    for (let span = 1; span <= 12 && i + span <= lines.length; span++) {
      const text = lines.slice(i, i + span).join(' ');
      const row = extractReportRowText(text);
      if (!row || seen.has(row.id)) continue;
      seen.add(row.id); out.push(row); break;
    }
  }
  return out;
}

function extractTotalFromLooseText(value: string): number | null {
  const text = htmlToLooseText(value).replace(/,/g, ' ').replace(/\s+/g, ' ');
  const labels = [...text.matchAll(/(?:總計|总计|今日總計|今日总计|today\s*total|day\s*total|grand\s*total)/ig)];
  for (let i = labels.length - 1; i >= 0; i--) {
    const m = labels[i]!;
    const tail = text.slice((m.index || 0) + m[0].length, (m.index || 0) + m[0].length + 180);
    const nums = tail.match(/[-+]?\d+(?:\.\d+)?/g) || [];
    if (!nums.length) continue;
    const n = Number(nums[Math.min(nums.length - 1, 4)]);
    if (Number.isFinite(n)) return n;
  }
  return null;
}

function extractRows(payload: unknown) {
  const out: ReportRow[] = [];
  const seen = new Set<any>();
  const today = taipeiDayKey();
  const walk = (value: any, depth: number) => {
    if (value == null || depth > 12) return;
    if (typeof value === 'string') { const t=value.trim(); if ((t.startsWith('{')&&t.endsWith('}'))||(t.startsWith('[')&&t.endsWith(']'))) { try { walk(JSON.parse(t), depth + 1); } catch {} } for (const r of extractRowsFromLooseText(t)) out.push(r); return; }
    if (typeof value !== 'object') return;
    if (seen.has(value)) return; seen.add(value);
    if (Array.isArray(value)) { for (const item of value) walk(item, depth + 1); return; }
    const obj = value as Record<string, any>;
    const room = findRoom(obj); const win = findWin(obj); const conf = rowConfidence(obj);
    if (room && win != null && conf >= 5) {
      const settledAt = findTime(obj);
      if (!settledAt || taipeiDayKey(settledAt) === today) {
        const id = findId(obj) || `${room}|${settledAt || ''}|${win}|${JSON.stringify(obj).slice(0,120)}`;
        out.push({ id, room, win, settledAt });
      }
    }
    for (const child of Object.values(obj)) walk(child, depth + 1);
  };
  walk(payload, 0);
  const unique = new Map<string, ReportRow>();
  for (const r of out) unique.set(r.id, r);
  return [...unique.values()];
}

function extractDirectTotal(payload: unknown): number | null {
  let best: { score: number; value: number } | null = null;
  const seen = new Set<any>();
  const walk = (value: any, depth: number) => {
    if (value == null || depth > 10) return;
    if (typeof value === 'string') { const t=value.trim(); if ((t.startsWith('{')&&t.endsWith('}'))||(t.startsWith('[')&&t.endsWith(']'))) { try { walk(JSON.parse(t), depth + 1); } catch {} } const n=extractTotalFromLooseText(t); if(n!=null&&(!best||14>best.score))best={score:14,value:n}; return; }
    if (typeof value !== 'object' || seen.has(value)) return;
    seen.add(value);
    if (Array.isArray(value)) { for (const x of value) walk(x, depth + 1); return; }
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      const nk = keyNorm(k); const n = toNumber(v);
      if (n != null) {
        let score = 0;
        if (/^(total|sum|all).*(win|profit|pnl|winloss|winlose)/.test(nk)) score = 10;
        else if (/(win|profit|pnl|winloss|winlose).*(total|sum|all)/.test(nk)) score = 9;
        else if (['totalwinloss','totalwinlose','totalprofit','sumwinloss','sumprofit','daywinloss','todaywinloss','todaytotal','daytotal','grandtotal','今日輸贏','今日输赢','總計','总计'].includes(nk)) score = 12;
        if (score && (!best || score > best.score)) best = { score, value: n };
      }
      if (v != null) walk(v, depth + 1);
    }
  };
  walk(payload, 0);
  return best ? best.value : null;
}

function looksLikeReport(rows: ReportRow[], payload: unknown, url: string) {
  if (rows.length) return true;
  const text = `${url} ${JSON.stringify(payload).slice(0,4000)}`.toLowerCase();
  const hints = ['report','record','bet','history','statement','winloss','win_lose','profit','投注','報表','报表','輸贏','输赢','總計','总计','臺桌','台桌','結算時間','结算时间'];
  const total = extractDirectTotal(payload);
  return (total != null && hints.some(h => text.includes(h))) || hints.filter(h => text.includes(h)).length >= 2;
}

function copyTemplate(req: Request, target: URL): RequestTemplate {
  const headers: Record<string,string> = {};
  for (const k of ['accept','accept-language','cache-control','pragma','content-type','user-agent']) {
    const v = req.headers[k]; if (typeof v === 'string' && v) headers[k] = v;
  }
  headers['referer'] = target.origin + '/';
  if (req.headers.origin) headers['origin'] = target.origin;
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  const bodyKind: RequestTemplate['bodyKind'] = /application\/json/.test(ct) ? 'json' : /application\/x-www-form-urlencoded/.test(ct) ? 'form' : 'none';
  let body: any = null;
  if (bodyKind === 'json') body = req.body == null ? null : JSON.parse(JSON.stringify(req.body));
  else if (bodyKind === 'form') body = req.body == null ? null : { ...req.body };
  return { method: req.method, url: target.toString(), headers, contentType: ct, bodyKind, body, capturedAt: Date.now() };
}

function applyRows(state: ReportState, rows: ReportRow[], directTotal: number | null, source: string) {
  if (!rows.length && directTotal == null) return;
  for (const row of rows) state.rows.set(row.id, row);
  if (directTotal != null) state.directTotal = directTotal;
  state.lastObservedAt = Date.now(); state.source = source; state.status = 'live'; state.message = '已取得 DG 遊戲報表資料';
}

export function observeDgReportPayload(sessionId: string, req: Request, target: URL, payload: unknown) {
  const rows = extractRows(payload);
  const total = extractDirectTotal(payload);
  if (!looksLikeReport(rows, payload, target.pathname + target.search)) return false;
  const s = stateFor(sessionId);
  applyRows(s, rows, total, target.pathname);
  // Save the real DG report request so the server can replay it without opening the report window again.
  s.template = copyTemplate(req, target);
  return true;
}


export function observeDgReportBrowserPayload(sessionId: string, payload: unknown, source = 'browser') {
  const rows = extractRows(payload);
  const total = extractDirectTotal(payload);
  if (!looksLikeReport(rows, payload, source)) return false;
  const s = stateFor(sessionId);
  const meta = payload && typeof payload === 'object' ? payload as Record<string, any> : null;
  if (meta?.__dgReplaceRows === true) {
    s.rows = new Map();
    s.directTotal = null;
  }
  applyRows(s, rows, total, source || 'browser');
  if (meta?.__dgComplete === true) {
    s.complete = true;
    s.status = 'live';
    s.message = '已同步 DG 今日遊戲報表';
  }
  return true;
}

export function observeDgReportTransportPayload(sessionId: string, payload: unknown, source = 'transport') {
  return observeDgReportBrowserPayload(sessionId, payload, source);
}

function candidatePageInfo(value: any) {
  let current: number | null = null, totalPages: number | null = null, totalCount: number | null = null, pageSize: number | null = null;
  const seen = new Set<any>();
  const walk = (x: any, depth: number) => {
    if (x == null || depth > 8 || typeof x !== 'object' || seen.has(x)) return; seen.add(x);
    if (Array.isArray(x)) { for (const y of x) walk(y, depth + 1); return; }
    for (const [k,v] of Object.entries(x as Record<string,any>)) {
      const nk = keyNorm(k); const n = toNumber(v);
      if (n != null && Number.isFinite(n)) {
        if (['page','pageno','pageindex','currentpage','current'].includes(nk) && current == null) current = Math.max(1, Math.trunc(n));
        if (['totalpage','totalpages','pagecount','pages'].includes(nk) && totalPages == null) totalPages = Math.max(1, Math.trunc(n));
        if (['totalcount','recordcount','records','count'].includes(nk) && totalCount == null) totalCount = Math.max(0, Math.trunc(n));
        if (['pagesize','limit','perpage','size'].includes(nk) && pageSize == null) pageSize = Math.max(1, Math.trunc(n));
      }
      if (v && typeof v === 'object') walk(v, depth + 1);
    }
  };
  walk(value,0);
  if (!totalPages && totalCount != null && pageSize) totalPages = Math.max(1, Math.ceil(totalCount/pageSize));
  return { current, totalPages, totalCount, pageSize };
}

function setPageInObject(input: any, page: number): { value: any; changed: boolean } {
  if (!input || typeof input !== 'object') return { value: input, changed: false };
  const clone = Array.isArray(input) ? [...input] : { ...input };
  let changed = false;
  for (const k of Object.keys(clone)) {
    const nk = keyNorm(k);
    if (['page','pageno','pageindex','currentpage','current'].includes(nk) && toNumber(clone[k]) != null) { clone[k] = page; changed = true; }
  }
  return { value: clone, changed };
}

function requestForPage(template: RequestTemplate, page: number) {
  const u = new URL(template.url); let changed = false;
  for (const [k,v] of [...u.searchParams.entries()]) {
    if (['page','pageno','pageindex','currentpage','current'].includes(keyNorm(k)) && toNumber(v) != null) { u.searchParams.set(k, String(page)); changed = true; }
  }
  let body = template.body;
  if (template.bodyKind !== 'none') { const r = setPageInObject(template.body, page); body = r.value; changed ||= r.changed; }
  return { url: u.toString(), body, changed };
}

async function fetchTemplate(template: RequestTemplate, page?: number) {
  const adapted = page == null ? { url: template.url, body: template.body, changed: false } : requestForPage(template, page);
  const init: RequestInit = { method: template.method, headers: template.headers, redirect: 'manual' };
  if (!['GET','HEAD'].includes(template.method.toUpperCase()) && template.bodyKind !== 'none') {
    if (template.bodyKind === 'json') init.body = JSON.stringify(adapted.body);
    else init.body = new URLSearchParams(adapted.body as Record<string,string>).toString();
  }
  const r = await fetch(adapted.url, init);
  const ct = r.headers.get('content-type') || '';
  if (!r.ok || !/json|text/i.test(ct)) return { payload: null as any, pageChanged: adapted.changed };
  const text = await r.text(); let payload: any = null;
  try { payload = JSON.parse(text); } catch { return { payload: null as any, pageChanged: adapted.changed }; }
  return { payload, pageChanged: adapted.changed };
}

async function pollNow(sessionId: string, state: ReportState) {
  const template = state.template; if (!template) return;
  state.status = 'syncing'; state.message = '正在同步 DG 今日遊戲報表';
  try {
    const first = await fetchTemplate(template, 1);
    if (!first.payload) throw new Error('DG 報表暫無可解析資料');
    const rows = extractRows(first.payload); const total = extractDirectTotal(first.payload); const pageInfo = candidatePageInfo(first.payload);
    const allRows = new Map<string, ReportRow>(); for (const r of rows) allRows.set(r.id,r);
    const pages = Math.min(Math.max(pageInfo.totalPages || 1, 1), 20);
    let complete = pages === 1;
    if (pages > 1 && first.pageChanged) {
      complete = true;
      for (let p = 2; p <= pages; p++) {
        const next = await fetchTemplate(template, p);
        if (!next.payload) { complete = false; continue; }
        for (const r of extractRows(next.payload)) allRows.set(r.id,r);
      }
    }
    // A successful full refresh replaces today's row set, avoiding stale rows after a date/session change.
    if (allRows.size) state.rows = allRows;
    if (total != null) state.directTotal = total;
    state.complete = complete;
    state.lastObservedAt = Date.now(); state.lastPollAt = Date.now(); state.status = 'live'; state.message = complete ? '已同步 DG 今日遊戲報表' : '已取得 DG 報表，正在補齊全部頁數';
  } catch (e:any) {
    state.lastPollAt = Date.now(); state.status = state.rows.size || state.directTotal != null ? 'live' : 'error'; state.message = state.status === 'live' ? '沿用最近一次 DG 報表資料' : String(e?.message || 'DG 報表同步失敗');
  }
}

export async function refreshDgReport(sessionId: string, options?: { force?: boolean }) {
  const s = stateFor(sessionId);
  if (!s.template) return;
  if (s.pollPromise) return s.pollPromise;
  if (!options?.force && Date.now() - s.lastPollAt < 2500) return;
  if (options?.force) s.lastPollAt = 0;
  s.pollPromise = pollNow(sessionId, s).finally(() => { s.pollPromise = null; });
  return s.pollPromise;
}

export function getDgReportSnapshot(sessionId: string): DgReportSnapshot {
  const s = stateFor(sessionId);
  const subtotalByRoom: Record<string, number> = {};
  let rowsTotal = 0;
  for (const row of s.rows.values()) { subtotalByRoom[row.room] = (subtotalByRoom[row.room] || 0) + row.win; rowsTotal += row.win; }
  return {
    ready: s.rows.size > 0 || s.directTotal != null,
    complete: s.complete,
    updatedAt: s.lastObservedAt,
    total: s.directTotal ?? rowsTotal,
    subtotalByRoom,
    recordCount: s.rows.size,
    source: s.source || undefined,
    status: s.status,
    message: s.message,
  };
}

export function clearDgReport(sessionId: string) { states.delete(sessionId); }
