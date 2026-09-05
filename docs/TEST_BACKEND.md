# FUTUREMODE 測試後端（僅供前端 Demo）

> **重要：這不是正式後端。** 此模組只在瀏覽器執行，資料保存在 `localStorage`。它沒有安全的密碼驗證、伺服器授權、資料庫交易鎖或鏈上資產轉移能力。

## 用途

`src/demo-backend/` 提供非同步 API 風格的測試介面，讓登入、收藏、編隊、交易、走失清單與戰鬥結算可以在沒有正式後端時完成前端開發與展示。

## 測試帳號

| Username | Password | 身份 |
| --- | --- | --- |
| `neon_mochi` | `demo1234` | 玩家 A |
| `void_rider` | `demo1234` | 玩家 B |

密碼只用於模擬登入成功／失敗，不做雜湊，也不應沿用到正式環境。

## 結構

```text
src/demo-backend/
├── fixtures.js   # 玩家、NOXCAT、道具、地下城、交易與走失資料
└── api.js        # Promise-based 測試 API 與 localStorage persistence
```

前端只呼叫 `demoApi`：

- `login(username, password)`
- `getGameData()`
- `togglePartyMember(petId)`
- `createTrade(payload)`
- `resolveTrade(tradeId, status)`
- `recordBattleResult(result, dungeonId)`
- `reset()`

## 正式後端替換方式

正式後端完成後，保留相同的輸入／輸出資料形狀，以 HTTP client 取代 `demoApi` 即可。正式環境必須：

1. 在伺服器驗證 username/password，密碼以安全雜湊保存。
2. Session 使用安全、HttpOnly cookie 或等效機制。
3. 所有編隊、交易與所有權異動均由伺服器授權。
4. 戰鬥結算由後端驗證後才提交資產變化。
5. 交易與掉落使用資料庫交易及 row-level locking，避免資產重複取得。

正式後端方向仍以根目錄的 `architecture.md` 為準。
