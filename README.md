# [專案名稱] NoxPawbles

## 問題與目標

請用簡短段落說明要解決的問題、目標使用者與預期影響。

我們參加 AI X CREATIVITY 賽道，結合 NOXCAT 官方IP素材，創作一款使用手機遊玩的可觸控式網頁小遊戲。我們期望透過這種「角色獨一無二且有可能遺失」的特性，促使玩家跟其他使用者交流互動，並利用此遊戲提升玩家對於NOXCAT App的依賴性。

## 核心功能

- 功能一 : 類似台灣傳統古早味打彈珠的遊戲玩法，玩家用三隻寵物球組成的隊伍，抓準角度彈射角色，利用牆壁與撞擊角色造成的反彈，撞擊敵方造成傷害
- 功能二 : 若輸給敵方，寵物將會被遺留在地牢中成為獲勝獎勵之一，下一位戰勝此地牢的玩家有機會獲得該寵物
- 功能三 : 玩家可以在交易所使用金幣或道具和其他玩家進行交易，有機會與自己失散的寵物在許久之後重聚

## 系統架構

請附上架構圖，並說明前端、後端、模型、資料庫與外部服務如何協作。

## 使用技術

| 類型 | 技術／服務 | 用途 |
| --- | --- | --- |
| **AI 模型與輔助工具** | OpenAI Codex、Google DeepMind Antigravity、Generative AI | 輔助全端程式碼生成、架構規劃、物理引擎重構與除錯；輔助生成像素風寵物與裝備素材 |
| **前端框架與工程化** | React 19、Vite 6、Tailwind CSS v4 | 響應式手機視口容器、單頁應用（SPA）路由切換、Cyberpunk 風格 HUD 元件化開發與模組熱重載 |
| **遊戲引擎與繪圖** | HTML5 Canvas 2D API | 自研 60/120 FPS 高效能彈性碰撞物理循環、反向彈射瞄準軌跡、動態液態波紋（Liquid Ring）與破片粒子系統 |
| **程序化音效系統** | Web Audio API | 以純程式碼振盪器合成碰撞、打擊反饋與陣亡破裂音效，免載入外部音訊資源，實現零延遲體驗 |
| **使用者與狀態管理** | Google Identity Services (OAuth 2.0)、Cookie / LocalStorage | 支援 Google 快速登入與訪客模式，兼具 1 天會話保持與本機模擬數據持久化 |
| **圖示庫** | Lucide React | 提供現代化科技感向量圖示（武器、道具、戰鬥與導覽選單） |
| **測試後端（Demo）** | Browser Mock Backend (`src/demo-backend/`) | 瀏覽器端非同步 API 替身，支援帳號登入、隊伍編組、地牢共享戰利品池結算與玩家間交易流轉 |
| **正式後端（架構規劃）** | Go (Golang) + PostgreSQL (`pgxpool`) + WebSocket | 規劃行級鎖（`FOR UPDATE`）防重複領取、確定性戰鬥物理後端校驗、JWT 鑑權與即時交易通知 |
| **雲端部署（Sponsor）** | Zeabur | 雲端一鍵自動化 Git CI/CD 部署、自動 HTTPS / SSL 憑證與邊緣網路託管 |

## 安裝與執行

### 環境需求

- **Node.js**: `v18.x` 或 `v20.x` LTS 以上
- **套件管理工具**: `npm`（建議 `v9.x` 以上）
- **建議瀏覽器**: Google Chrome、Safari 或 Microsoft Edge（支援手機實機瀏覽或桌面瀏覽器之手機模擬觸控模式）

### 本機安裝與啟動步驟

1. **取得專案原始碼**
   ```bash
   git clone https://github.com/Last-rite/FUTUREMODE-2026.git
   cd FUTUREMODE-2026
   ```

2. **安裝專案依賴套件**
   ```bash
   npm install
   ```

3. **設定環境變數（選填）**
   專案預設已在 `.env.example` 提供測試用 Google Client ID，若需啟用 Google 第三方登入，可直接複製設定檔：
   ```bash
   cp .env.example .env
   ```

4. **啟動本機開發伺服器**
   ```bash
   npm run dev
   ```
   > 💡 **Windows 快速啟動**：亦可直接雙擊專案根目錄的 [`run.bat`](file:///c:/Github/FUTUREMODE-2026/run.bat) 腳本。

5. **瀏覽與體驗**
   啟動後，依終端機輸出開啟連結（預設為 `http://localhost:5173/`）。
   - 終端機亦會顯示區域網路 IP（如 `http://192.168.x.x:5173/`），可直接使用同一 Wi-Fi 下的手機掃描或輸入網址，體驗最佳單指觸控手感。

6. **建置生產版本（選用）**
   ```bash
   npm run build
   npm run preview
   ```

### 快速測試帳號

為便於評審與測試人員快速重現完整流程，系統已內建測試帳號（亦可自由註冊新帳號或以訪客／Google 登入）：

| 測試身分 | 帳號 (Username) | 密碼 (Password) | 說明 |
| :--- | :--- | :--- | :--- |
| **玩家 A** | `neon_mochi` | `demo1234` | 擁有初始隊伍與可掉落 NOXCAT，可演示戰鬥陣亡並遺留戰利品 |
| **玩家 B** | `void_rider` | `demo1234` | 可通關同一地牢關卡，從共享戰利品池中收回該遺留寵物 |

## 作品展示

- 作品展示網址（選填）：
- 評選影片：

## 限制與未來工作

### 目前已知限制 (Current Limitations)

1. **瀏覽器端測試後端（Mock Backend）**
   - 為確保評選時可免伺服器依賴、快速演示「戰鬥陣亡 → 資產掉落 → 共享戰利品池 → 另一玩家取得」之閉環流程，目前採用 `src/demo-backend/` 與 `localStorage` 保存數據。
   - 尚未具備伺服器端防作弊機制與集中式關聯資料庫。
2. **Web3 / 區塊鏈資產為架構級模擬（Simulated Web3 Ownership）**
   - 每件 NOXCAT 寵物與裝備均具備對應未來 ERC-721 / ERC-1155 的獨立識別 ID、數值結構與持有者轉移介面（如 `TransferUnit`），但當前尚未部署鏈上智能合約，無真實 Gas 消耗與主網交易。
3. **客戶端物理結算（Client-side Physics Only）**
   - 彈珠物理碰撞與即時傷害計算完全於前端 Canvas 執行，尚未整合後端確定性物理引擎或重播演算種子比對（`ValidateBattleResult`）。
4. **戰鬥中裝備耐久扣減暫緩（In-Combat Durability Trigger Deferred）**
   - 裝備動態數值獲取（Dynamic Getters）、破損狀態（`isBroken`）與最大生命值動態重算機制均已底層完備，但戰鬥過程中單次受擊扣除耐久度與即時碎裂的觸發邏輯因黑客松交付時程暫緩開啟。
5. **單機 AI 對局模式（Local AI Only）**
   - 目前敵方無人機皆由前端本機 AI 索敵演算法驅動，暫未支援玩家間的即時連線對戰（PvP）與即時好友助戰功能。

### 未來工作與後續規劃 (Future Work & Roadmap)

1. **正式後端與雲端資料庫落地（Production Backend）**
   - 實作 `architecture.md` 所定義之 Go (Golang) 後端與 PostgreSQL 資料庫（`pgxpool`）。
   - 引入行級鎖（`SELECT ... FOR UPDATE`）保證跨玩家交易與地牢戰利品池的 ACID 原子性，杜絕資產雙花或重複領取。
   - 透過 WebSocket 實作即時在線交易請求推播與狀態更新。
2. **Web3 智能合約與 NOXCAT 錢包整合（Web3 & Token Economy）**
   - 將寵物與稀有裝備鑄造成為鏈上 NFT。
   - 深度對接 NOXCAT 官方電子錢包，支援一鍵 Web3 簽名登入與鏈上資產劃轉。
   - 引入原生代幣作為地牢門票、道具交易與通關獎勵媒介。
3. **即時多人連線 PvP 與好友助戰（Real-Time Multiplayer & Social）**
   - 實作 1v1 即時天梯對戰，落實「獲勝者可贏取敗者掉落地牢的寵物／物品」之刺激玩法。
   - 開放社群好友助戰機制，借用好友強力寵物突破高難度地牢。
4. **AI 驅動動態生成遊戲內容（AI-Generated Content）**
   - 整合生成式 AI，根據玩家冒險進度動態生成獨特像素外觀的 NOXCAT 變體、裝備背景故事與隨機屬性詞條。
   - 動態生成地牢關卡障礙與個性化 Boss 對白。
5. **豐富化關卡機制與養成系統（Combat Depth & Progression）**
   - 加入傳送門、彈力加速帶、尖刺陷阱與隨機炸彈等多元場地機制。
   - 加入更多角色與裝備，附有更多獨特的特性，深化彈射時的策略性，不會無腦拉滿彈射。

## 第三方服務、資料與素材


本專案所使用之所有外部素材、模型工具與第三方資料均遵循合法授權規範：
| 類別 | 名稱／項目 | 來源與工具 | 授權／使用說明 |
| :--- | :--- | :--- | :--- |
| **官方 IP 素材** | NOXCAT 原型角色圖像與標識 | NOXCAT 官方黑客松授權提供 | 僅限於本屆黑客松參賽作品中創作與展示使用 |
| **AI 生成美術** | 像素風貓貓變體、裝備與地城背景 | Google Gemini / Nano Banana (Imagen Pipeline) 輔助生成 | 團隊透過 Prompt Engineering 生成之原創衍生像素資產 |
| **AI 生成音樂** | 大廳、戰鬥、勝利與失敗 BGM (MP3) | Suno AI v3.5 / v4 生成 | 由團隊自訂風格 Prompt 生成之原創遊戲配樂 |
| **程序化音效** | 彈珠碰撞、反彈、擊中與陣亡打擊音 | Web Audio API (純程式碼振盪器合成) | 團隊自行以 JavaScript 程式化合成，無外部版權依賴 |
| **向量圖示** | HUD 武器、防具、金幣與選單圖示 | Lucide React | [ISC License](https://lucide.dev/license)（開源授權） |
| **字體資源** | 像素與科技感字體家族 | Google Fonts (Silkscreen, Orbitron, Inter) | [SIL Open Font License 1.1](https://openfontlicense.org/)（開源免費商用） |
| **雲端部署服務** | 雲端容器託管與自動化 CI/CD | Zeabur | 大會贊助額度與平台免費方案提供 |

## 團隊成員

| 姓名 | 職稱與定位 | 核心職責與專業領域 |
| --- | --- | --- |
曾子齊| **Chief Product Officer (CPO) & Lead Architect** | 主導產品願景與商業邏輯定義（PM），兼任前端架構與高維度技術文件撰寫（FE & Docs），確保專案在時程內精準落地。 |
劉正惟| **Senior Frontend Engineer & UI/UX Specialist** | 專注於前端互動體驗、高效能狀態管理與極致視覺呈現，打造流暢且極具沉浸感的使用者操作介面。 |
陳曦| **Lead Backend & Infrastructure Engineer** | 負責高併發後端架構設計、API 核心邏輯及資料庫效能調校，確保系統在高流量下依然具備極高安全性、穩定性與擴充性。 |
林均彥| **Lead Visual & Concept Artist** | 掌管遊戲/應用的核心美術風格、資產視覺化與場景氛圍塑造，賦予產品頂級的美學靈魂。 |
方軒岷| **Creative Director & Technical Sound Designer** | 跨領域跨足美術、沉浸式音效設計與專案架構文件梳理，完美融合視聽覺饗宴與技術落地規範。 |

## License

請在儲存庫根目錄加入明確的 `LICENSE` 檔案，並在此標示授權名稱。
