# Website Manager — Passage Group 練習站

靜態 HTML + JS，可部署到 GitHub Pages。時區：Asia/Hong_Kong。

Website Manager。從 Notion 讀題目，按**完成後間隔**出題（唔用 `added_at` 計到期）。

## 檔案結構

```
index.html          首頁：列出 Passage Groups
group.html?slug=…   練習頁（可用 ?now=ISO 測試）
stats.html          練習計時統計、匯出／匯入、雲端同步
export.html         手機專用匯出／匯入（同 stats 一樣嘅兩個 key）
css/app.css
js/schedule.js      完成後間隔 / 到期判斷 / chunk 加入閘
js/progress.js      localStorage v2 進度
js/timing.js        localStorage 練習計時（唔寫 Notion）
js/sync-config.js   Supabase URL、anon key、allowedEmails（留空＝只係本機）
js/sync-merge.js    合併規則（node 單測，唔使網絡）
js/sync.js          Google 登入、同步、匯出／匯入
js/quiz-runner.js   渲染與評分
js/stats-metrics.js quiz 用時加總、近 7 日、學新詞（node 單測）
js/app.js / group.js / stats.js
supabase/schema.sql 雲端表 + RLS
data/schedule.json  chunk_schedule + passage_schedule + sentence_schedule（Q20–Q24 live Soft GO）
data/groups.json    Passage Group + chunks（陣列次序＝加入次序）+ optional sentences[]
data/manifest.json  可玩 quiz 清單
data/quizzes/*.json 每題一份 Quiz JSON
```

## 練習計時

進度 key：`website-manager-timing-v1`（同 SRS 分開）。

- **Session**：撳「開始練習」→ 做完所有到期題（或中途離開且已完成 ≥1 題）
- **Quiz**：每題開始渲染 → `onPass`
- **超過 2 分鐘唔計時**：單題用時 **> 120000 ms** 視為無效。剛好 **120000 ms** 仍然計入。題目照常完成、SRS 唔受影響；該題 `durationMs` 寫成 `null`（`timingValid: false`），唔計入 chunk 總和、session 練習總用時，同統計頁嘅練習時間加總。統計頁只標「不計時」，唔顯示該段時長或該題開始→結束。
- **Chunk**：同一 session 內同一 chunk（或段落題）嘅**有效** quiz 用時加總
- 做完 session 顯示總用時（牆鐘減去超時題）；個別 quiz／chunk 詳情喺統計頁
- **統計頁練習時間**係每題有效 `durationMs` 加總，唔用 session 牆鐘 `totalMs`，亦唔計超過 2 分鐘嘅題。今日／本週用香港時間日界；本週＝近 7 日（今日連之前 6 日），唔係星期一至日
- **學新詞**係 chunk 第一次入 T1（`stageIndex` 去到 3）嘅 `enteredT1At`。skip／`already_introduced`／`shared_with_prior_group` 唔計。已經過咗 T1、又冇真實時間嘅舊 chunk 唔會補一個日期
- **唔寫 Notion**

## 如何加入新 Quiz JSON

1. 把乾淨的 Quiz JSON 放到 `data/quizzes/`（檔名建議 `{quiz_id}.json`）。
2. 在 `data/manifest.json` 的 `quizzes` 陣列加一筆：
   - `quiz_id`, `file`, `objective`, `level`（chunk 題）, `kind`（`chunk` | `passage` | `sentence`）, `chunk_id`（chunk 題）, `sentence`
   - `passage` = 成段時間線（Q8 / Q11 / Q18）。`sentence` = 中間句（Q20–Q24 live；要有 `sentence_id`，而且該 group 有 `sentences[]`）
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

邊個 objective 喺邊個 stage 出現：睇 `schedule.json` → `chunk_schedule`。`mother_cloze_usage`（Q19 母語填空用法 / Cloze，Level 3）只喺 `T03`、`T5`、`T8`、`T11`、`T14`、`T18`（刻意唔包括 T1）：**同一張 slide** 同時顯示 chunk 同帶空白嘅母語 `select_text` 卡（`prompt` = chunk；`correct` + `distractors` = 選項），整張卡精確比對。唔再分 Slide 1 prompt、Slide 2 選卡。Soft GO 全套題內容仍然之後先做；而家只係站點、時間表同 runner，外加一條 smoke fixture。

### Chunk 加入閘（句子順序 + 密集階段）

`groups.json` 入面 `chunks` **陣列次序**就係加入次序。兩道閘：

1. **句子順序（所有 chunk）**  
   Chunk *i* 只有喺 chunk *i−1* **已經加入**（進入 T01 或之後）之後先可以加入。新 chunk 同重複 chunk 都要跟順序；**唔可以**跳過前面嘅 chunk。  
   例：`chashu-shittori` 嘅「ちょっと」雖係重複，仍要等「濃厚」先加入，然後「ちょっと」先可以出。

2. **密集階段（只限新 chunk）**  
   密集 = T01 / T02 / T03（`stageIndex` 0–2）。每個 Passage Group 同時最多 **1** 個**新** chunk 處於密集。  
   - 標記 `already_introduced: true`（或 `shared_with_prior_group`）嘅 chunk：**唔佔**密集位（可同前一塊新 chunk 一齊喺 T01），但仍受上面順序限制。  
   - 下一個**新** chunk：等最近一個非 already_introduced／非 skip 嘅前一塊 **T1 ready**（完成 T03 後 +24h）。  
   - 例：`gochumon-kakunin` 嘅「ご注文」已引入 → 唔佔密集，但「確認」仍要等「ご注文」已加入先開 T01。

3. **Skip chunk（`skip: true` 或 `skipped: true`）**  
   - **永遠唔出**該 chunk 嘅到期題。  
   - 對加入順序當已 admitted：唔會擋住下一塊。  
   - **唔佔**密集 T01–T03。  
   - 例（將來匯入）：`ご来店…` 入面太熟嘅「ありがとうございます」可標 `skip: true`。

出題時：未 admitted 嘅 chunk 唔會出任何到期題（包括 T01）。重用 chunk 只匯出 **尚未存在** 嘅 quiz（唔複製已有 quiz_id）。

### Passage（每個 Passage Group 一條線）

`passage_schedule` 入面嘅 label 按順序當 stage 0, 1, 2…（例如 T+1 → T+2 → T+3）。  
舊檔如果未有 `passage_schedule`，會讀 legacy `sentence_schedule`（同一套 Passage objectives）。  
`passage_schedule` 一旦存在，`sentence_schedule` 就係中間 Sentence 層，唔會再當 Passage 時間表。  
第一次（從未完成）即時出第一個 stage；每次做完所有當時到期嘅 Passage Quiz 後等 **1 日** 先出下一個（`T+N` ≈ 第 N 日）。

進度 key：`passages[slug]`。舊嘅 `sentences[slug]` 會喺載入時摺入 `passages`（唔會把 stageIndex 歸零），並寫返做鏡像，等未更新嘅手機／雲端 blob 仍然睇到同一條線。

### Sentence（中間層，Soft GO Q20–Q24）

每個 Passage Group 都有 `sentences[]`：`{ id, text, chunk_ids, l1? }`。  
切句規則：**chunk-boundary-wins**。一句係連續嘅 active chunk；唔切開 `chunk.text`；同一個 chunk id 唔可以出現喺兩句。`skip: true` 嘅 chunk 留喺 `chunks[]`，唔入 `chunk_ids`。

Soft GO 題目喺 `data/quizzes/`。`manifest.json` 用 `kind: "sentence"`。`sentence` 欄係成段 `group.sentence`（練習頁同首頁靠呢個字串對 group）。`sentence_id` 係 `s1`、`s2`…。`group_slug` 係 site slug。`shell` 係 `false`。

| Objective | 題 | 題數 | Stages |
|-----------|----|------|--------|
| `sentence_listen_to_l1` | Q20 | 53 | T+1, T+6, T+11, T+16, T+21, T+26 |
| `sentence_l1_palace_multi_tap` | Q21 | 53 | T+2, T+7, T+12, T+17, T+22, T+27 |
| `sentence_shadowing_125` | Q22 | 53 | T+3, T+8, T+13, T+18, T+23, T+28 |
| `sentence_shadowing_075` | Q23 | 53 | T+4, T+9, T+14, T+19, T+24, T+29 |
| `sentence_discourse_mcq` | Q24 | 61 | T+5, T+10, T+15, T+20, T+25, T+30 |

22 個 group、61 句。53 句有齊 Q20–Q24。Q24 多出嘅 8 句只得 Q24。

Q24-only（Q20–Q23 唔喺 bundle，冇加假題）：

- `yoyaku`（Soft GO slug `yoyaku-annai`）四句都係 Q24。呢個 group 唔算 full-suite Soft GO。
- `kaikei-onegai` 嘅 s1、s5、s7，同 `oryouri-last-order` 嘅 s3。

冇 active chunk span（`chunk_ids` 空）：`aragoshi-mikanshu` s3（第二次「おかわりで」，唯一 chunk 留喺 s2）、`oryouri-last-order` s3、`kaikei-onegai` s1／s5／s7。各 group 嘅 `sentences_note` 有寫。

`yokattara-onomi`：live passage 保留「方 、」（逗號前有空格）；Soft GO s1 係「方、」。slug `onomimono-otoshi` → `yokattara-onomi` 對過 `groups.json`，冇改。s4 嘅 Soft GO 句尾有「。」，passage 字串冇。

新鮮句單位（`stageIndex` 0）即時出 Q20（T+1）。做完該 stage 全部到期題之後等 1 日。如果而家嘅 stage 冇 manifest quiz（Q24-only 句嘅 T+1 至 T+4），打開首頁或者練習頁會將呢個 stage 記為完成並推前一級，然後照樣等 1 日。Q24 喺句單位行到 T+5 先到期。

進度 key：`sentenceUnits[slug:sentenceId]`，同 Passage／Chunk 分開。共用一條 `T+1`…`T+30` 時間線（stage 0 = T+1）。

Smoke quiz `sentence-shell-smoke-yoyaku-shitenai-s1-v1` 已刪，避免同 live Soft GO 一齊出現。

### Sentence runners（Q20–Q24）

`js/quiz-runner.js` 收到 `kind: "sentence"` 嘅 quiz 之後會渲染同評分。Live 題由 manifest 按 `sentence_schedule` 到期。手動煙測仍然可以用 fixture：

```bash
python3 -m http.server 8080
# http://localhost:8080/group.html?slug=yoyaku-shitenai&sentenceFixture=1
```

| Objective | Slide | 行為 |
|-----------|--------|------|
| `sentence_listen_to_l1` | `audio_listen` + `select_text`（摺成同一張） | 播句子音，揀啱嘅母語翻譯。冇選項就跳過，唔當通過。 |
| `sentence_l1_palace_multi_tap` | `multi_tap`（`tap` 都會走呢條） | 顯示母語句，順序無關咁點齊 `hotspots`。撳錯會講明，已點嘅保留。冇圖或冇有效熱區就跳過，**唔** `markPassed`。 |
| `sentence_shadowing_125` | `audio_shadow` | 成句 **1.25×**。唔會入 Q18 分段 UI。 |
| `sentence_shadowing_075` | `audio_shadow` | 成句 **0.75×**。即使有 `start_sec`／`end_sec` 都唔會變成分段「重播」。 |
| `sentence_discourse_mcq` | `select_text` | 顯示 `prompt`／`context`。選項（`correct` 同 `distractors`）係母語，唔係日文。 |

Q22／Q23 錄音係 v1：`MediaRecorder` Blob 只可以喺呢次練習重聽，**唔評分**，亦唔會寫入 progress、timing 或 sync snapshot。撳「完成跟讀」先去下一題（冇 ✓／✗ 自評）。

Q21 熱區可以係平面 `{ id, label, left, top, width, height }`，或者同 `sequence_tap` 一樣包住 `hotspot`。圖唔寫喺 slide 時，會用 Passage Group 嘅 `palace_image_url`。

Q18 `sentence_segment_shadowing`、Q8、Q11、chunk 題唔經上面嘅 whitelist。`rate === 0.75` 而且有 clip 嘅**其他** objective 仍然係分段跟讀。

### 出題順序

1. 到期 Level 1（按 chunk id／加入次序）
2. 到期 Level 2（按 chunk id）
3. 到期 Level 3（按 chunk id）
4. 到期 Sentence quizzes（有 `sentences[]` 而且 objective 喺 `sentence_schedule` 先會出現）
5. 到期 Passage quizzes

## Passage objective：`sentence_segment_shadowing`（整段分段跟讀）

由 Sentence Segment Shadowing Bot 出 JSON。站點讀 `objective: "sentence_segment_shadowing"`（slide `type` 可用 `audio_shadow` 或別名 `audio_segment_shadow`）。

- 播放 `start_sec`→`end_sec`，速度固定 **0.75×**（唔顯示速度掣）
- 按鈕標籤 **重播**；可無限重播；跟讀後自評 Tick／Cross（`self_check`）
- 多 slide＝多段依序；只 1 slide（通常 0→句末）＝全段 0.75× 跟讀
- `passage_schedule.sentence_segment_shadowing`：每個 stage `T+1`…`T+30`（每日解鎖；passage wait = 1 日，令 T+N ≈ 第 N 日）
- `whole_sentence_listening` / `sequence_training`：維持 `T+3,T+6,…,T+30`
- `sequence_training`（`sequence_tap`）：撳錯位置會即時顯示而家呢步嘅正確框（綠色 hotspot），保持 **3 秒**（3000 ms），然後清走個框並由第一個重新開始成題序列。期間再撳無效，唔使撳「再試」

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
node js/stats-metrics.test.js
node test/timing-invalid.test.js
node test/passage-sentence.test.js
node test/sentence-runners.test.js
node test/softgo-live.test.js
```

## 雲端同步（Supabase + Google）

練習計時（`website-manager-timing-v1`）同 SRS（`website-manager-progress-v2`）可以跨裝置同步。未填 `js/sync-config.js` 時，網站同以前一樣，**只係本機**；統計頁會寫「雲端同步未設定」。匯出／匯入 JSON 喺未設定時都用得。

資料主人 id 固定係 `larry`，唔係 `auth.uid()`。登入嘅 Google 帳戶經 `user_mapping` 對應去 `larry`。網頁只放 Supabase URL 同 **anon public key**。唔好將 service role key 或者 Google client secret 放進 git。

### 手機備份就係 seed（iPhone Chrome）

開雲端之前，先備份手機而家嘅兩個 key。空白備份唔會覆蓋已有記錄。iPhone Chrome **唔會跑** `javascript:` 書籤，所以唔好靠書籤。

合併（`js/sync-merge.js`）：

- **計時**：按 session id 合併；同一個 session 入面按 quiz id 去重（留用時較長嗰筆）。Chunk 用時由合併後嘅 quiz 再計，唔會加兩次。空嘅 session 清單唔會清走另一邊。
- **SRS**：按 quiz id、chunk key（`group:chunkId`）、passage slug、sentence-unit key（`group:sentenceId`）逐筆合併。Quiz 嘅 `completedStages` 取聯集。Chunk／passage／sentence unit：兩邊都有 `updatedAt` 先用較新嗰筆（last-write-wins，可以退 stage）；否則保留較高 `stageIndex`（手機舊備份多數冇 `updatedAt`，唔會被較低嘅記錄清走）。`stageIndex` 0 而且冇 `lastCompletedAt` 當空，唔會覆蓋有進度嘅記錄。刪走一個 key **唔會**當墓碑，另一邊有就會留低。舊 key `sentences` 會先摺入 `passages` 再合併，合併結果同時寫返 `sentences` 鏡像。Chunk 嘅 `enteredT1At`（第一次入 T1）按 chunk key 聯集；空白唔會清走；兩邊都有就留較早嗰個，唔受 stage 嘅 last-write-wins 影響。
- **第一次同步**（計時同 SRS 分開計）：雲端空、本機有 → 上傳本機；本機空、雲端有 → 拉落本機；兩邊都有 → 合併再寫兩邊。永遠唔會用空 payload 覆蓋有資料嘅一邊。

統計頁「匯出 JSON」下載**一份**檔，兩個 key 都喺入面（值可以係物件；匯入亦接受 `localStorage.getItem` 嗰種字串）：

```json
{
  "website-manager-timing-v1": { "sessions": [] },
  "website-manager-progress-v2": { "quizzes": {}, "chunks": {}, "passages": {}, "sentences": {}, "sentenceUnits": {} }
}
```

iPhone Chrome／Safari 撳 **匯出 JSON** 之後：

1. 電腦瀏覽器會試下載。
2. 手機有分享功能就開分享表。
3. 分享唔得就試複製。
4. 以上都唔得，全螢幕文字框留低：長按 → 全選 → 複製。

匯入可以貼上，亦可以揀檔，然後撳「合併匯入」。空白唔會覆蓋。

直接開 [`export.html`](export.html) 係同一套掣，統計頁難搵時用呢條：

`https://larryleungtsz.github.io/sentence-group/export.html`

#### Merge 之後（iPhone Chrome 主路徑）

用手機 Chrome 打開統計頁或者 `export.html` → **匯出 JSON**。唔使書籤，唔使電腦。另一部機用 **合併匯入**。如果部手機本來就有 localStorage，登入後雲端係空就會直接當 seed 上傳；備份仍然要留低。

#### Merge 之前（暫時）

而家嘅 GitHub Pages **未有**呢個掣。iPhone Chrome 撳 `javascript:` 書籤冇反應，唔好靠書籤。手機自己又冇 DevTools。暫時只可以喺已經接上頁面 console 嘅時候（例如用電腦檢查部手機）貼一次：

```js
copy(JSON.stringify({
  "website-manager-timing-v1": localStorage.getItem("website-manager-timing-v1"),
  "website-manager-progress-v2": localStorage.getItem("website-manager-progress-v2")
}))
```

Pages 更新之後唔使再跑 console，改開 `export.html` 撳匯出。

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
     `https://larryleungtsz.github.io/sentence-group/export.html`  
     `http://localhost:8080/`  
     `http://localhost:8080/index.html`  
     `http://localhost:8080/stats.html`  
     `http://localhost:8080/group.html`  
     `http://localhost:8080/export.html`
6. 編輯 `js/sync-config.js`（範本係 `js/sync-config.example.js`）：
   - `supabaseUrl`：`https://YOUR_PROJECT.supabase.co`
   - `supabaseAnonKey`：Project Settings → API → **anon public**（程式會拒絕 `service_role`）
   - `allowedEmails`：同第 3 步一樣嘅 Gmail。呢個陣列只係介面檢查；真正攔截係 SQL allowlist + RLS。
   - `ownerId` 維持 `larry`。
7. Merge 呢個 PR（唔好直接推 main）。Pages 更新之後，用手機開統計頁 → Google 登入 → 而家同步。

離線時本機 localStorage 仍然係來源。失敗會記低 dirty flag（`website-manager-sync-queue-v1`），有網、返到個分頁、或者約 30 秒會再試。登出唔會刪本機記錄。

換後端只需要改 `js/sync.js` 入面寫 Supabase 嗰截；合併規則留喺 `js/sync-merge.js`。
