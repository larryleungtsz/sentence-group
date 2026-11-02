# Website Manager — Sentence Group 練習站

靜態 HTML + JS，可部署到 GitHub Pages。時區：Asia/Hong_Kong。

Website Manager。從 Notion 讀題目，按**完成後間隔**出題（唔用 `added_at` 計到期）。

## 檔案結構

```
index.html          首頁：列出 Sentence Groups
group.html?slug=…   練習頁（可用 ?now=ISO 測試）
stats.html          練習計時統計、匯出／匯入、雲端同步
css/app.css
js/schedule.js      完成後間隔 / 到期判斷 / chunk 加入閘
js/progress.js      localStorage v2 進度
js/timing.js        localStorage 練習計時（唔寫 Notion）
js/sync-config.js   Supabase URL、anon key、allowedEmails（留空＝只係本機）
js/sync-merge.js    合併規則（node 單測，唔使網絡）
js/sync.js          Google 登入、同步、匯出／匯入
js/quiz-runner.js   渲染與評分
js/app.js / group.js / stats.js
supabase/schema.sql 雲端表 + RLS
data/schedule.json  chunk_schedule + sentence_schedule（邊個 objective 喺邊個 stage）
data/groups.json    Sentence Group + chunks（陣列次序＝加入次序）
data/manifest.json  可玩 quiz 清單
data/quizzes/*.json 每題一份 Quiz JSON
```

## 練習計時

進度 key：`website-manager-timing-v1`（同 SRS 分開）。

- **Session**：撳「開始練習」→ 做完所有到期題（或中途離開且已完成 ≥1 題）
- **Quiz**：每題開始渲染 → `onPass`
- **Chunk**：同一 session 內同一 chunk（或句子題）嘅 quiz 用時加總
- 做完 session 顯示總用時；個別 quiz／chunk 詳情喺統計頁
- **唔寫 Notion**

## 如何加入新 Quiz JSON

1. 把乾淨的 Quiz JSON 放到 `data/quizzes/`（檔名建議 `{quiz_id}.json`）。
2. 在 `data/manifest.json` 的 `quizzes` 陣列加一筆：
   - `quiz_id`, `file`, `objective`, `level`（chunk 題）, `kind`（`chunk` | `sentence`）, `chunk_id`（chunk 題）, `sentence`
3. 新 Chunk：按句子順序加到 `data/groups.json` → `chunks`（`id` / `text`）；設 `quizzes_ready: true`。
4. **唔好改** Quiz JSON 入面嘅 hotspot / 座標 / 題意。

## SRS（完成後間隔）

進度 key：`website-manager-progress-v2`（舊 v1 自動忽略）。

### Chunk（每個 chunk 一條時間線）

記該 chunk 上次「做完所有當時到期嘅 Chunk Quiz」嘅時間 `lastCompletedAt`，同 `stageIndex`。

| 完成後 | 等待 | 下一 stage |
|--------|------|------------|
| （從未完成） | 即時 | T01 |
| 做完 T01 全部到期題 | 1 小時 | T02 |
| 做完 T02 | 3 小時 | T03 |
| 做完 T03 | 24 小時 | T1 |
| 做完 T1 | 1.5 日 | T2 |
| 做完 T2 | 2.25 日 | T3 |
| 之後每次 | 上次間隔 × 1.5 | T4, T5, … |

邊個 objective 喺邊個 stage 出現：睇 `schedule.json` → `chunk_schedule`。

### Chunk 加入閘（句子順序 + 密集階段）

`groups.json` 入面 `chunks` **陣列次序**就係加入次序。兩道閘：

1. **句子順序（所有 chunk）**  
   Chunk *i* 只有喺 chunk *i−1* **已經加入**（進入 T01 或之後）之後先可以加入。新 chunk 同重複 chunk 都要跟順序；**唔可以**跳過前面嘅 chunk。  
   例：`chashu-shittori` 嘅「ちょっと」雖係重複，仍要等「濃厚」先加入，然後「ちょっと」先可以出。

2. **密集階段（只限新 chunk）**  
   密集 = T01 / T02 / T03（`stageIndex` 0–2）。每個 Sentence Group 同時最多 **1** 個**新** chunk 處於密集。  
   - 標記 `already_introduced: true`（或 `shared_with_prior_group`）嘅 chunk：**唔佔**密集位（可同前一塊新 chunk 一齊喺 T01），但仍受上面順序限制。  
   - 下一個**新** chunk：等最近一個非 already_introduced／非 skip 嘅前一塊 **T1 ready**（完成 T03 後 +24h）。  
   - 例：`gochumon-kakunin` 嘅「ご注文」已引入 → 唔佔密集，但「確認」仍要等「ご注文」已加入先開 T01。

3. **Skip chunk（`skip: true` 或 `skipped: true`）**  
   - **永遠唔出**該 chunk 嘅到期題。  
   - 對加入順序當已 admitted：唔會擋住下一塊。  
   - **唔佔**密集 T01–T03。  
   - 例（將來匯入）：`ご来店…` 入面太熟嘅「ありがとうございます」可標 `skip: true`。

出題時：未 admitted 嘅 chunk 唔會出任何到期題（包括 T01）。重用 chunk 只匯出 **尚未存在** 嘅 quiz（唔複製已有 quiz_id）。

### Sentence（每個 Sentence Group 一條線）

`sentence_schedule` 入面嘅 label 按順序當 stage 0, 1, 2…（例如 T+3 → T+6）。  
第一次（從未完成）即時出第一個 stage；每次做完所有當時到期嘅 Sentence Quiz 後等 **3 日** 先出下一個。

### 出題順序

1. 到期 Level 1（按 chunk id／加入次序）
2. 到期 Level 2（按 chunk id）
3. 到期 Level 3（按 chunk id）
4. 到期 Sentence quizzes

## Sentence objective：`sentence_segment_shadowing`（整句音軌分段跟讀）

由 Sentence Segment Shadowing Bot 出 JSON。站點讀 `objective: "sentence_segment_shadowing"`（slide `type` 可用 `audio_shadow` 或別名 `audio_segment_shadow`）。

- 播放 `start_sec`→`end_sec`，速度固定 **0.75×**（唔顯示速度掣）
- 按鈕標籤 **重播**；可無限重播；跟讀後自評 Tick／Cross（`self_check`）
- 多 slide＝多段依序；只 1 slide（通常 0→句末）＝全句 0.75× 跟讀
- `sentence_schedule.sentence_segment_shadowing`：每個 stage `T+1`…`T+30`（每日解鎖；sentence wait = 1 日，令 T+N ≈ 第 N 日）
- `whole_sentence_listening` / `sequence_training`：維持 `T+3,T+6,…,T+30`

例：

```json
{
  "quiz_id": "sentence-segment-shadow-yoyaku-v1",
  "objective": "sentence_segment_shadowing",
  "sentence": "…",
  "slides": [
    {
      "type": "audio_shadow",
      "instruction": "請跟讀這一段。",
      "audio": "https://raw.githubusercontent.com/larryleungtsz/flashcard-app/main/audio/sentence-….mp3",
      "start_sec": 0.05,
      "end_sec": 4.1,
      "rate": 0.75,
      "self_check": true
    }
  ],
  "feedback": { "on_tick": "pass", "on_cross": "retry" }
}
```

## 本地預覽

```bash
cd website-manager
python3 -m http.server 8080
# 開 http://localhost:8080/
```

練習頁可用 `?now=2026-10-20T20:00:00+08:00` 固定「而家」方便測試。

合併邏輯單測（唔使網絡、唔使 Supabase）：

```bash
node js/sync-merge.test.js
```

## 雲端同步（Supabase + Google）

練習計時（`website-manager-timing-v1`）同 SRS（`website-manager-progress-v2`）可以跨裝置同步。未填 `js/sync-config.js` 時，網站同以前一樣，**只係本機**；統計頁會寫「雲端同步未設定」。匯出／匯入 JSON 喺未設定時都用得。

資料主人 id 固定係 `larry`，唔係 `auth.uid()`。登入嘅 Google 帳戶經 `user_mapping` 對應去 `larry`。網頁只放 Supabase URL 同 **anon public key**。唔好將 service role key 或者 Google client secret 放進 git。

### 手機備份就係 seed（iPhone Safari）

開雲端之前，先備份手機而家嘅兩個 key。空白備份唔會覆蓋已有記錄。

合併（`js/sync-merge.js`）：

- **計時**：按 session id 合併；同一個 session 入面按 quiz id 去重（留用時較長嗰筆）。Chunk 用時由合併後嘅 quiz 再計，唔會加兩次。空嘅 session 清單唔會清走另一邊。
- **SRS**：按 quiz id、chunk key（`group:chunkId`）、sentence slug 逐筆合併。Quiz 嘅 `completedStages` 取聯集。Chunk／sentence：兩邊都有 `updatedAt` 先用較新嗰筆（last-write-wins，可以退 stage）；否則保留較高 `stageIndex`（手機舊備份多數冇 `updatedAt`，唔會被較低嘅記錄清走）。`stageIndex` 0 而且冇 `lastCompletedAt` 當空，唔會覆蓋有進度嘅記錄。刪走一個 key **唔會**當墓碑，另一邊有就會留低。
- **第一次同步**（計時同 SRS 分開計）：雲端空、本機有 → 上傳本機；本機空、雲端有 → 拉落本機；兩邊都有 → 合併再寫兩邊。永遠唔會用空 payload 覆蓋有資料嘅一邊。

統計頁「匯出 JSON」下載**一份**檔，兩個 key 都喺入面（值可以係物件；匯入亦接受 `localStorage.getItem` 嗰種字串）：

```json
{
  "website-manager-timing-v1": { "sessions": [] },
  "website-manager-progress-v2": { "quizzes": {}, "chunks": {}, "sentences": {} }
}
```

iPhone Safari 經常擋自動下載。撳匯出之後會出文字框：撳「複製」或「分享」，或者長按文字框全選再複製。匯入可以貼上，亦可以揀檔，然後撳「合併匯入」。

#### 而家（Export 掣未上到 GitHub Pages）— 書籤小工具

喺**而家練習緊嘅網站**（同一個 origin，先至讀到部手機嘅 localStorage）加一個書籤：

1. Safari 打開練習站任何一頁。
2. 分享 → 加入書籤。
3. 書籤 → 編輯 → 撳開嗰個書籤 → 刪走網址 → 貼上下面整行 → 完成。
4. 再打開練習站，撳個書籤。
5. 撳「複製」，或者長按文字全選再複製。貼去備忘錄。
6. 呢個 PR Merge 同 Pages 更新之後，改用統計頁「匯出 JSON」。匯入用同一份 JSON。

```text
javascript:(function(){var t=JSON.stringify({"website-manager-timing-v1":localStorage.getItem("website-manager-timing-v1"),"website-manager-progress-v2":localStorage.getItem("website-manager-progress-v2")});var d=document,o=d.getElementById("sg-backup-export");if(o)o.remove();o=d.createElement("div");o.id="sg-backup-export";o.style.cssText="position:fixed;inset:0;z-index:99999;background:#0f1419;color:#e7ecf3;padding:12px;display:flex;flex-direction:column;gap:8px;font:16px -apple-system,system-ui";var p=d.createElement("div");p.textContent="長按文字全選再複製。呢份係 timing + SRS 備份。";var ta=d.createElement("textarea");ta.style.cssText="flex:1;width:100%;font:12px ui-monospace,monospace;color:#111";ta.value=t;var b=d.createElement("button");b.textContent="複製";b.style.cssText="font:16px system-ui;padding:12px";b.onclick=function(){ta.focus();ta.select();try{ta.setSelectionRange(0,t.length)}catch(e){}var done=function(){b.textContent="已複製"};try{if(navigator.clipboard&&navigator.clipboard.writeText){navigator.clipboard.writeText(t).then(done,function(){try{if(d.execCommand("copy"))done()}catch(e){}})}else if(d.execCommand("copy"))done()}catch(e){}};var c=d.createElement("button");c.textContent="關閉";c.style.cssText="font:16px system-ui;padding:12px";c.onclick=function(){o.remove()};o.appendChild(p);o.appendChild(b);o.appendChild(ta);o.appendChild(c);d.body.appendChild(o);ta.focus();try{ta.setSelectionRange(0,t.length)}catch(e){}})();
```

#### Merge 之後

統計頁 → **匯出 JSON**（同上嘅形狀）。另一部機用 **合併匯入**。如果部手機本來就有 localStorage，登入後雲端係空就會直接當 seed 上傳，唔使再貼一次；備份仍然要留低。

### 一次性設定（Larry 先做，先至可以登入）

1. 開一個 Supabase project。
2. SQL Editor 跑 `supabase/schema.sql`。
3. 插入允許嘅 Gmail（要小寫），可以多過一個，全部對應主人 `larry`：

   ```sql
   insert into public.sync_allowlist (email) values ('you@gmail.com');
   ```

4. Google Cloud Console → APIs & Services → Credentials → Create OAuth client ID → **Web application**。
   - Authorized JavaScript origins：`https://larryleungtsz.github.io`、`http://localhost:8080`
   - Authorized redirect URI：**只有** Supabase callback  
     `https://YOUR_PROJECT.supabase.co/auth/v1/callback`  
     Client secret 只貼喺 Supabase，唔好 commit。
5. Supabase → Authentication → Providers → Google：貼 Client ID + Client secret。  
   Authentication → URL configuration：
   - Site URL：`https://larryleungtsz.github.io/sentence-group/`
   - Redirect URLs 加上：  
     `https://larryleungtsz.github.io/sentence-group/`  
     `https://larryleungtsz.github.io/sentence-group/index.html`  
     `https://larryleungtsz.github.io/sentence-group/stats.html`  
     `https://larryleungtsz.github.io/sentence-group/group.html`  
     `http://localhost:8080/`  
     `http://localhost:8080/index.html`  
     `http://localhost:8080/stats.html`  
     `http://localhost:8080/group.html`
6. 編輯 `js/sync-config.js`（範本係 `js/sync-config.example.js`）：
   - `supabaseUrl`：`https://YOUR_PROJECT.supabase.co`
   - `supabaseAnonKey`：Project Settings → API → **anon public**（程式會拒絕 `service_role`）
   - `allowedEmails`：同第 3 步一樣嘅 Gmail。呢個陣列只係介面檢查；真正攔截係 SQL allowlist + RLS。
   - `ownerId` 維持 `larry`。
7. Merge 呢個 PR（唔好直接推 main）。Pages 更新之後，用手機開統計頁 → Google 登入 → 而家同步。

離線時本機 localStorage 仍然係來源。失敗會記低 dirty flag（`website-manager-sync-queue-v1`），有網、返到個分頁、或者約 30 秒會再試。登出唔會刪本機記錄。

換後端只需要改 `js/sync.js` 入面寫 Supabase 嗰截；合併規則留喺 `js/sync-merge.js`。
