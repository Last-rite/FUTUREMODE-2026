# NoxPawble 本機完整前後端與 PostgreSQL 測試指南

這份文件記錄如何在一台新筆電 clone 專案後，使用真正的 React 前端、Go
backend 與 PostgreSQL 測試完整流程。它也整理本次實際整合時遇到的問題，方便
後續開發者處理其他小型前後端契約差異。

本文件測試的目標不是 `src/demo-backend/`。完成設定後，瀏覽器應使用以下資料流：

```text
Browser
  └─ http://127.0.0.1:8080
       ├─ React/Vite 靜態檔案
       ├─ REST API
       └─ WebSocket
             │
             ▼
        Go HTTP server
             │ pgxpool
             ▼
        PostgreSQL / noxcat
```

前端、REST API 與 WebSocket 使用同一個 origin，可以貼近正式「前後端同一
server」的部署方式，也不需要為本機測試額外放寬 CORS。

---

## 1. 先認識兩種 backend 模式

前端透過 `VITE_BACKEND_MODE` 選擇 adapter：

| 模式 | 設定 | 資料位置 | 用途 |
| --- | --- | --- | --- |
| Demo | `VITE_BACKEND_MODE=demo` 或未設定 | 瀏覽器 `localStorage` | 無伺服器展示、前端開發 |
| 完整 backend | `VITE_BACKEND_MODE=http` | PostgreSQL | 整合、交易、鎖定與持久化測試 |

`npm run dev` 預設不是完整 backend 測試。若目標是驗證資料庫、JWT、transaction、
deadlock 防護或跨瀏覽器帳號，請使用本文件的「HTTP build + Go 同源服務」流程。

正式 HTTP adapter 的入口是：

- `src/api/index.js`
- `src/api/httpApi.js`
- `Noxcat-game-backend-main/internal/httpapi/`

瀏覽器 demo 的入口是：

- `src/demo-backend/api.js`
- localStorage key：`futuremode_demo_backend_v5`

Demo 建立的帳號不會出現在 PostgreSQL，也不能從另一個瀏覽器登入。

---

## 2. 新筆電需要的工具

建議安裝：

- Git
- Node.js 20 LTS 以上與 npm
- Go 1.26 或專案目前 CI 使用的相容版本
- PostgreSQL 16
- Docker Desktop（建議，但不是必要）

確認版本：

```powershell
git --version
node --version
npm --version
go version
docker version
```

本次 Windows 筆電實際驗證的版本為：

```text
Go          1.26.5 windows/amd64
PostgreSQL  16.15
Node.js     24.11.1
npm         11.6.2
```

Node.js 版本不必完全相同；若團隊需要最穩定的共同環境，優先使用目前的 LTS。

---

## 3. Clone 與安裝前端依賴

```powershell
git clone https://github.com/Last-rite/FUTUREMODE-2026.git
cd FUTUREMODE-2026
npm install
```

確認基礎前端測試：

```powershell
npm test -- --run
```

不要把 `node_modules/` 或 `dist/` commit 進 Git。

---

## 4. 建立 PostgreSQL：Docker 方式（新 clone 建議）

Compose 檔案位於 `Noxcat-game-backend-main/compose.yaml`。首次啟動會建立：

- 使用者：`noxcat`
- 本機開發 DB：`noxcat`
- 自動化測試 DB：`noxcat_test`
- 套用 `migrations/*.up.sql`

執行：

```powershell
cd .\Noxcat-game-backend-main
docker compose up -d --wait postgres
docker compose ps
```

確認連線：

```powershell
docker compose exec postgres pg_isready -U noxcat -d noxcat
docker compose exec postgres psql -U noxcat -d noxcat -c "SELECT current_database(), current_setting('server_version');"
```

### Migration 注意事項

PostgreSQL Docker entrypoint 只會在資料 volume 第一次初始化時執行 migration。
若 pull 到新的 migration，而既有 volume 已存在，不要假設 `docker compose up` 會
自動重跑。

對仍需保留資料的 DB，應只依序套用尚未執行的新 migration。PowerShell 範例：

```powershell
Get-Content .\migrations\000022_create_bidirectional_trade_assets.up.sql -Raw |
  docker compose exec -T postgres psql -v ON_ERROR_STOP=1 -U noxcat -d noxcat
```

只有確定可以清空本機資料時，才使用以下方式重建 volume：

```powershell
# 破壞性操作：會刪除這個 compose project 的 PostgreSQL 本機資料。
docker compose down -v
docker compose up -d --wait postgres
```

切勿把 production database 當成這個重建指令的目標。

---

## 5. 沒有 Docker 時：Windows portable PostgreSQL

本次筆電因 Docker daemon 沒有運行，實際使用 portable PostgreSQL 16.15：

```text
C:\Users\YOUR_NAME\sdk\postgresql-16.15-portable\pgsql\bin
```

Go 也使用使用者目錄下的 portable 安裝：

```text
C:\Users\YOUR_NAME\sdk\go1.26.5\go\bin
```

安裝路徑可以不同。將實際 `bin` 加入使用者 PATH，或像下列範例使用完整路徑。

第一次建立 PostgreSQL cluster 後，建立本機角色與兩個資料庫：

```sql
CREATE ROLE noxcat LOGIN PASSWORD 'noxcat';
CREATE DATABASE noxcat OWNER noxcat;
CREATE DATABASE noxcat_test OWNER noxcat;
```

以上帳密僅適合本機開發，不可直接用於公開部署。

在乾淨 DB 上，依檔名順序將 `000002_*.up.sql` 到最新 migration 分別套用到
`noxcat` 與 `noxcat_test`。`000001_create_test_database.up.sql` 只負責建立測試 DB，
如果已手動建立便不需重複執行。

PowerShell 範例：

```powershell
$psql = 'C:\Users\YOUR_NAME\sdk\postgresql-16.15-portable\pgsql\bin\psql.exe'
$env:PGPASSWORD = 'noxcat'
$migrationFiles = Get-ChildItem .\Noxcat-game-backend-main\migrations\*.up.sql |
  Where-Object Name -NotLike '000001_*' |
  Sort-Object Name

foreach ($database in @('noxcat', 'noxcat_test')) {
  foreach ($migration in $migrationFiles) {
    & $psql -h 127.0.0.1 -U noxcat -d $database -v ON_ERROR_STOP=1 -f $migration.FullName
    if ($LASTEXITCODE -ne 0) {
      throw "Migration failed: $($migration.Name) on $database"
    }
  }
}
```

這些 migration 不是設計成可任意重複執行。上述迴圈只應用於空白資料庫；既有
DB 應只套用新增檔案。

確認 PostgreSQL 正在接受連線：

```powershell
& 'C:\Users\YOUR_NAME\sdk\postgresql-16.15-portable\pgsql\bin\pg_isready.exe' `
  -h 127.0.0.1 -p 5432 -U noxcat
```

---

## 6. Backend 環境變數

必要設定可參考 `Noxcat-game-backend-main/.env.example`：

```text
DATABASE_URL=postgres://noxcat:noxcat@localhost:5432/noxcat?sslmode=disable
TEST_DATABASE_URL=postgres://noxcat:noxcat@localhost:5432/noxcat_test?sslmode=disable
JWT_SECRET=replace-with-at-least-32-bytes-local-secret
JWT_ISSUER=noxcat
HTTP_ADDRESS=:8080
STATIC_DIR=<root dist 的絕對路徑>
```

Go server 不會自動讀取 `.env`。在 PowerShell 中需設定目前 process 的環境變數：

```powershell
$env:DATABASE_URL = 'postgres://noxcat:noxcat@localhost:5432/noxcat?sslmode=disable'
$env:JWT_SECRET = 'local-only-change-this-32-bytes-minimum'
$env:JWT_ISSUER = 'noxcat'
$env:HTTP_ADDRESS = ':8080'
```

不要把正式 JWT secret commit 到 repository。正式環境必須使用獨立產生的 secret。

---

## 7. 用 HTTP backend 模式建置前端

回到 repository root：

```powershell
cd D:\path\to\FUTUREMODE-2026
$env:VITE_BACKEND_MODE = 'http'
$env:VITE_API_BASE_URL = ''
npm run build
```

`VITE_API_BASE_URL` 留空代表使用同源路徑，例如 `/auth/login`、`/trades` 與
`/ws`。這正是同一 server 部署需要的設定。

### 證明 build 不是 demo

```powershell
$bundle = (Get-ChildItem .\dist\assets\index-*.js | Select-Object -First 1).FullName

Select-String -Path $bundle -Pattern 'futuremode_demo_backend_v5' -Quiet
# 預期：False

Select-String -Path $bundle -Pattern '/auth/login' -Quiet
# 預期：True

Select-String -Path $bundle -Pattern 'Bearer' -Quiet
# 預期：True
```

如果第一項是 `True`，代表目前 `dist` 是 demo bundle。重新設定
`VITE_BACKEND_MODE=http` 並 build。

Vite 的環境變數是在 build time 寫入 bundle；只在 Go server 啟動時設定它不會
改變已經產生的 `dist`。

---

## 8. 由 Go server 同源提供前端與 API

保持 root 的 HTTP build，接著執行：

```powershell
cd .\Noxcat-game-backend-main

$env:DATABASE_URL = 'postgres://noxcat:noxcat@localhost:5432/noxcat?sslmode=disable'
$env:JWT_SECRET = 'local-only-change-this-32-bytes-minimum'
$env:HTTP_ADDRESS = ':8080'
$env:STATIC_DIR = (Resolve-Path '..\dist').Path

go run ./cmd/server
```

若 Go 沒有加入 PATH：

```powershell
& 'C:\Users\YOUR_NAME\sdk\go1.26.5\go\bin\go.exe' run ./cmd/server
```

預期 log：

```text
HTTP server starting  address=[::]:8080
```

瀏覽器開啟：

```text
http://127.0.0.1:8080/
```

停止 server 使用 `Ctrl+C`。修改 Go handler、database code 或 server config 後，
必須停止並重新執行 `go run`；只重新整理瀏覽器不會更新已運行的 Go binary。

修改 React/CSS 後必須重新執行 HTTP build，再重新整理頁面：

```powershell
$env:VITE_BACKEND_MODE = 'http'
$env:VITE_API_BASE_URL = ''
npm run build
```

---

## 9. 最小連線驗證

### 靜態前端

```powershell
curl.exe -i http://127.0.0.1:8080/
```

預期 `HTTP/1.1 200 OK` 與 `Content-Type: text/html`。

### 受保護 API

```powershell
curl.exe -i http://127.0.0.1:8080/players/00000000-0000-0000-0000-000000000000/units
```

沒有 Bearer token 時預期 `401 Unauthorized`。這證明 `/players/...` 有進入 Go API，
而不是被 SPA fallback 誤回傳 `index.html`。

### PostgreSQL

Docker：

```powershell
cd .\Noxcat-game-backend-main
docker compose exec postgres psql -U noxcat -d noxcat -c "SELECT count(*) FROM players;"
```

本機 psql：

```powershell
$env:PGPASSWORD = 'noxcat'
psql -h 127.0.0.1 -U noxcat -d noxcat -c "SELECT count(*) FROM players;"
```

---

## 10. 註冊與登入實測

Backend 驗證規則：

- 帳號：3–32 個 ASCII 英文字母、數字或底線
- 密碼：8–72 bytes
- 玩家名稱：前端顯示欄位，目前 backend 身分仍以唯一 username 為準

建議建立兩個本機測試帳號，例如：

```text
test1
test2
```

不要把共用或正式密碼寫在文件、測試程式或 issue 中。

註冊成功後，Go log 應依序看到：

```text
POST /auth/register 201
POST /auth/login    200
GET  /players/{uuid} 200
```

確認資料真的寫入 PostgreSQL：

```sql
SELECT id, username, role, money, status, created_at
FROM players
WHERE username IN ('test1', 'test2')
ORDER BY username;
```

只查非敏感欄位，不要把 `password_hash` 輸出到一般除錯紀錄。

---

## 11. 同時登入兩個帳號

Bearer token 保存在 `sessionStorage`，不是 URL，也不是 localStorage。要安全測試兩個
玩家，建議使用：

- 一個一般瀏覽器視窗登入 `test1`
- 一個 InPrivate／Incognito 視窗或另一個瀏覽器 profile 登入 `test2`

兩邊都使用完全相同的 origin：

```text
http://127.0.0.1:8080/
```

不要一邊使用 `localhost`、另一邊使用 `127.0.0.1` 來判斷 session 是否共享；它們
是不同 origin。帳號資料仍在同一 PostgreSQL，但 browser storage 與 WebSocket
連線不共用。

---

## 12. 雙向交易完整實測

### 12.1 資產資格

可作為交易標的的 NOXCAT 必須：

- 屬於正確玩家
- `is_permanent = false`
- `is_alive = true`
- 沒有在目前編隊啟用
- 沒有裝備 treasure
- 沒有被另一筆 pending trade reservation

可交易 treasure 必須未裝備且未被 reservation。

可用 SQL 檢查：

```sql
SELECT
  p.username,
  u.id,
  u.species,
  u.is_permanent,
  u.is_alive,
  u.is_equipped,
  u.equipped_treasure_id
FROM players p
JOIN units u ON u.owner_id = p.id
WHERE p.username IN ('test1', 'test2')
ORDER BY p.username, u.created_at;
```

### 12.2 UI 流程

以 `test2` 向 `test1` 發起交換為例：

1. `test2` 進入「交易」。
2. 按「發起交易」。
3. 在「指定對象帳號或玩家 ID」輸入 `test1`。
4. 按「確認玩家並讀取可交易資產」。
5. 頁面應顯示「已確認：test1」。
6. 選擇 `test2` 提供的 NOXCAT 或裝備。
7. 選擇「雙向交換」。
8. 若對方沒有裝備，將對方支付類型切換為 `NOXCAT`。
9. 選擇一個由 backend 回傳的精確資產。
10. 送出交換請求。
11. 切到 `test1`，接受或拒絕交易。

交易對象輸入可以是 username 或 canonical UUID。lookup endpoint 會回傳真正的
player UUID；最終 `POST /trades` 仍只送 UUID，以維持 database FK、授權與鎖定
邏輯明確。

單向贈與也必須先確認玩家，但 `requested_assets` 會是空陣列。

### 12.3 API 與 DB 證據

確認玩家時，Go log 應出現：

```text
GET /players/test1/trade-assets 200
```

成功建立交易：

```text
POST /trades 201
```

查詢交易與雙方資產：

```sql
SELECT id, from_player_id, to_player_id, unit_id, treasure_id, status, created_at
FROM trades
ORDER BY created_at DESC
LIMIT 10;

SELECT trade_id, side, position, unit_id, treasure_id, reserved
FROM trade_assets
ORDER BY trade_id, side, position;
```

Pending 時只應保留發起方 offered asset；requested asset 不預先鎖定，避免惡意
邀請凍結別人的庫存。

接受後檢查 ownership：

```sql
SELECT p.username, u.id, u.species
FROM players p
JOIN units u ON u.owner_id = p.id
WHERE p.username IN ('test1', 'test2')
ORDER BY p.username, u.id;
```

交換必須在單一 PostgreSQL transaction 完成。任何資產在接受前改變持有人、死亡、
裝備、加入編隊或被其他交易保留，都應讓整筆交換失敗並 rollback，不能只轉移一邊。

---

## 13. 本次實際遇到的三個整合問題

### 問題一：頁面看似正常，但使用的是 demo backend

症狀：

- 在頁面 A 建立帳號後，頁面 B 無法登入。
- PostgreSQL `players` 沒有新資料。
- Go access log 沒有 `/auth/register`。
- UI 卻出現 demo fixtures 的預設 NOXCAT 與裝備。

原因：

- `dist` 曾在沒有 `VITE_BACKEND_MODE=http` 的情況下重新 build。
- Go server 雖然正常連線 PostgreSQL，卻正在提供 demo bundle。

修正：

```powershell
$env:VITE_BACKEND_MODE = 'http'
$env:VITE_API_BASE_URL = ''
npm run build
```

重新整理瀏覽器，再用 bundle marker 與 Go access log 驗證。

### 問題二：註冊只顯示 `request validation failed`

症狀：後端連續回傳 `POST /auth/register 400`。

原因：原本前端只檢查欄位非空，但 backend 要求 username 3–32 字元、password
8–72 bytes。

修正原則：

- 前端送出前使用與 backend 相同的規則。
- 保留 backend validation 作最後權威防線。
- 將 `error.fields.username`／`error.fields.password` 轉成可行動的 UI 訊息。
- 不要為了讓請求成功而放寬 backend 規則。

### 問題三：輸入 `test1` 發起交易卻回傳 validation failed

症狀：`test1`、`test2` 都是真實 DB 帳號且有可交易資產，但 `/trades` 回傳 400。

原因：舊表單讓人自然輸入 username，API payload 卻把它直接放入只接受 UUID 的
`to_player_id`。

修正後流程：

```text
輸入 test1
  → GET /players/test1/trade-assets
  → backend 解析 username
  → 回傳 { player: { id, username }, units, treasures }
  → UI 顯示「已確認：test1」
  → POST /trades 使用解析後的 UUID
```

這個調整只在 HTTP 邊界解析 username，沒有改變交易 database schema、FK、
reservation 或 deadlock 鎖定順序。

---

## 14. 遇到 `request validation failed` 的固定診斷順序

1. 在瀏覽器 Network 檢查實際 URL、HTTP status 與 JSON response。
2. 查看 `error.code`、`error.fields`、`error.request_id`，不要只看頂層 message。
3. 用 `request_id` 對照 Go access log 的 method、route、status 與 player ID。
4. 確認 payload 欄位名稱與 `docs/api.md` 完全一致。
5. UUID 欄位必須是 canonical UUID，不能放 username、顯示名稱或 UI label。
6. 查 PostgreSQL 確認資料是否存在、ownership 是否正確。
7. 若 handler 根本沒收到請求，優先檢查是否仍是 demo bundle 或錯誤 origin。
8. 若剛改 Go 程式，確認已重啟 server。
9. 若剛改 React，確認已用 HTTP mode 重新 build 並重新整理瀏覽器。

Go access log 刻意不記錄密碼、Bearer token 或完整 request body。除錯時也不應新增
這類敏感 log。

---

## 15. 自動化測試

### 前端完整測試

```powershell
cd D:\path\to\FUTUREMODE-2026
npm test -- --run
```

### Go 與 PostgreSQL 完整測試

```powershell
cd .\Noxcat-game-backend-main
$env:TEST_DATABASE_URL = 'postgres://noxcat:noxcat@localhost:5432/noxcat_test?sslmode=disable'
go test ./...
```

`noxcat_test` 會被測試 setup／cleanup 清理。務必再次確認
`TEST_DATABASE_URL` 不是 `noxcat`、staging 或 production DB。

### 交易 deadlock／競態回歸

```powershell
go test ./internal/database `
  -run 'TestCrossBidirectionalTradeAcceptsDoNotDeadlock|TestAcceptAndCancelRaceHasSingleTerminalState|TestConcurrentAcceptTradeSerializesOnRowLock' `
  -count=10
```

修改交易 lock order、ownership mutation、reservation、loadout cleanup 或 transaction
邊界時，必須保留並通過既有 database/deadlock 測試風格。

### 正式 HTTP build

```powershell
cd D:\path\to\FUTUREMODE-2026
$env:VITE_BACKEND_MODE = 'http'
$env:VITE_API_BASE_URL = ''
npm run build
```

最低交付標準是：前端測試、Go 全套測試、HTTP build、至少一輪真實雙帳號 DB 流程
全部成功。

---

## 16. 小型前後端整合問題的修改原則

1. 先確認 source of truth：ownership、交易與永久狀態以 PostgreSQL／Go backend 為準。
2. 不要讓前端猜 UUID、資產或權限；由 backend 回傳精確識別資料。
3. 前端可以提早驗證以改善 UX，但不能移除 backend validation。
4. 優先擴充既有 endpoint／adapter，避免為小問題引入新服務、Redis 或 message queue。
5. 不要為本機方便任意開放 CORS、跳過 JWT 或將 token 放入 URL。
6. 交易修改要維持固定 lock order 與單一 transaction rollback。
7. requested asset 不應在邀請階段被陌生玩家鎖住。
8. 每個契約修正至少同時更新 HTTP handler test、frontend adapter test 與 UI test。
9. 更新 `Noxcat-game-backend-main/docs/api.md`，避免下一位開發者照舊契約串接。
10. 修正後用真實 PostgreSQL 再做一次人工 smoke test，不能只依賴 mock。

---

## 17. 常用檔案索引

| 區域 | 路徑 |
| --- | --- |
| 前端 adapter 選擇 | `src/api/index.js` |
| 正式 HTTP adapter | `src/api/httpApi.js` |
| Demo backend | `src/demo-backend/api.js` |
| 登入／註冊 UI | `src/components/AuthModal.jsx` |
| 交易 UI | `src/components/TradeView.jsx` |
| Go server config | `Noxcat-game-backend-main/cmd/server/config.go` |
| HTTP routes | `Noxcat-game-backend-main/internal/httpapi/server.go` |
| Auth handler | `Noxcat-game-backend-main/internal/httpapi/auth_handlers.go` |
| Trade handler | `Noxcat-game-backend-main/internal/httpapi/trade_handlers.go` |
| Trade transaction | `Noxcat-game-backend-main/internal/database/trades.go` |
| Migration | `Noxcat-game-backend-main/migrations/` |
| 正式 API 文件 | `Noxcat-game-backend-main/docs/api.md` |
| Database tests | `Noxcat-game-backend-main/internal/database/` |
| HTTP tests | `Noxcat-game-backend-main/internal/httpapi/server_test.go` |
| Frontend tests | `tests/backend/`、`tests/components/` |

---

## 18. 完成檢查表

- [ ] PostgreSQL 正常接受連線。
- [ ] `noxcat` 與 `noxcat_test` 是不同資料庫。
- [ ] 最新 migration 已套用到兩個 DB。
- [ ] HTTP bundle 不包含 demo DB marker。
- [ ] Go server 的 `STATIC_DIR` 指向 root `dist`。
- [ ] `/` 回傳 200。
- [ ] 未登入的受保護 API 回傳 401，而不是 HTML。
- [ ] 註冊後 PostgreSQL 可查到玩家。
- [ ] 兩個獨立瀏覽器 session 可登入不同帳號。
- [ ] username lookup 回傳解析後的 UUID 與可交易資產。
- [ ] Pending trade 只 reservation 發起方 offered asset。
- [ ] Accept 後雙方 ownership 一次完成交換。
- [ ] Cancel／reject 會解除 reservation。
- [ ] 前端完整測試通過。
- [ ] Go／PostgreSQL 完整測試通過。
- [ ] HTTP production build 通過。

若這份檢查表中任何一項無法證明，便不應宣稱已完成正式 backend 整合測試。
