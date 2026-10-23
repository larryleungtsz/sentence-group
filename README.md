# Website Manager — Sentence Group 練習站

靜態 HTML + JS，可部署到 GitHub Pages。時區：Asia/Hong_Kong。

Website Manager。從 Notion 讀題目，按**完成後間隔**出題（唔用 `added_at` 計到期）。

## 檔案結構

```
index.html          首頁：列出 Sentence Groups
group.html?slug=…   練習頁（可用 ?now=ISO 測試）
css/app.css
js/schedule.js      完成後間隔 / 到期判斷 / chunk 加入閘
js/progress.js      localStorage v2 進度
js/quiz-runner.js   渲染與評分
js/app.js / group.js
data/schedule.json  chunk_schedule + sentence_schedule（邊個 objective 喺邊個 stage）
data/groups.json    Sentence Group + chunks（陣列次序＝加入次序）
data/manifest.json  可玩 quiz 清單
data/quizzes/*.json 每題一份 Quiz JSON
```

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

## 本地預覽

```bash
cd website-manager
python3 -m http.server 8080
# 開 http://localhost:8080/
```

練習頁可用 `?now=2026-10-20T20:00:00+08:00` 固定「而家」方便測試。
