# DG 神手｜即時懸浮房號修正版 2026-09-19

這版修正「DG 遊戲已經正常即時更新，但右側懸浮仍顯示 -- / 0」的實際原因。

HAR 已確認 DG 封包內同一桌會同時帶：
- tableId 60101
- fms BAC001
- tableName RB01

上一版錯誤地把 `fms`（BAC001/TIDxxx）當成懸浮面板的房號 key；前端卻查 RB01/S01，所以資料其實有收到，但 UI 永遠找不到該桌。

本版改為：
- 優先採用 DG 畫面真正的 `tableName`（RB01、RB02、S01...）
- 再用 tableId 固定映射做保險
- 不重新呼叫 DGLI/login
- 維持單一 DG 上游 WebSocket 與 Render 部署方式

Render:
Build: pnpm install --no-frozen-lockfile && pnpm build
Start: pnpm start

## V27 對子機率 / 推薦下注
- 九宮格第一層：55%。
- 橫向 / 縱向延伸：20%。
- 下一格同時命中 55% 與 20% 時，55% 優先。
- 推薦下注依下一格同一橫向與縱向已開出的對子標記統計：莊對多顯示莊對、閒對多顯示閒對、相同顯示 --。
- 珠盤每次即時更新後重新計算。
