DG 神手 Roomcode Live Bugfix v4 — 2026-09-19

基底：使用者確認「懸浮即時更新正常」的 dg-shenshou-roomcode-livefix 版本。
本版不更換即時資料架構，只修以下問題：

1. 最近：直接使用 results 最後一筆，顯示上一把實際「莊 / 閒 / 和」。
2. 建議：接回原本牌路推導 recommendSide，不再因 latest 欄位缺失而空白。
3. 黑點：空的 load-hint 不再渲染。
4. 遊戲反覆刷新：前景 DG shared socket 啟用時，不再每 6/12/30 秒用 lobby 快照、重訂閱、table-silence 重建去干擾正在玩的桌。
5. 假斷線：SSE 改用 10 秒具名 heartbeat；前端以 35 秒 heartbeat timeout 判斷，而不是 15 秒沒開新局就判斷斷線。
6. 保留：單次 DGLI、Roomcode 映射、Shared Vendor WebSocket、即時懸浮更新。

Render:
Build Command: pnpm install --no-frozen-lockfile && pnpm build
Start Command: pnpm start

部署辨識：GET /api/health -> mode = roomcode-live-bugfix-v4
