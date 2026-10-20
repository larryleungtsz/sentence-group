# Website Manager — Sentence Group 練習站

靜態 HTML + JS，可部署到 GitHub Pages。時區：Asia/Hong_Kong。

## 檔案結構

```
index.html          首頁：列出 Sentence Groups
group.html?slug=…   練習頁
css/app.css
js/schedule.js      時間線 / 到期判斷
js/progress.js      localStorage 進度
js/quiz-runner.js   渲染與評分
js/app.js / group.js
data/schedule.json  chunk_schedule + sentence_schedule（權威）
data/groups.json    Sentence Group + chunk + added_at
data/manifest.json  可玩 quiz 清單（GitHub Pages 無目錄列表，必須維護）
data/quizzes/*.json 每題一份 Quiz JSON
data/export-report.json 匯出報告
```

## 如何加入新 Quiz JSON

1. 把乾淨的 Quiz JSON 放到 `data/quizzes/`（檔名建議 `{quiz_id}.json`）。
2. 在 `data/manifest.json` 的 `quizzes` 陣列加一筆：
   - `quiz_id`, `file`, `objective`, `level`（chunk 題）, `kind`（`chunk` | `sentence`）, `chunk_id`（chunk 題）, `sentence`
3. 若是新 Sentence / Chunk：更新 `data/groups.json` 的 `sentence_added_at` / `chunk_added_at`。
4. **唔好改** Quiz JSON 入面嘅 hotspot / 座標 / 題意。

Notion 匯出時若 Quiz JSON 被 markdown 連結弄壞，可用 `scripts/export-quizzes.mjs` 做機械修復（只處理 URL 重複／`[url](url)`），修復唔到會寫入 `data/broken/*.raw.txt` 並唔加入 manifest。

## 時間表

- **Chunk**：每個 chunk 一條線 — T01=加入，T02=+1h，T03=+3h，T1=+24h，之後每次間隔 ×1.5 日。邊個 objective 喺邊個 T 出現睇 `schedule.json` → `chunk_schedule`。
- **Sentence**：加入後 T+3 起每 3 日，睇 `sentence_schedule`。

## 出題順序

1. 到期 Level 1（按 chunk id）
2. 到期 Level 2（按 chunk id）
3. 到期 Level 3（按 chunk id）
4. 到期 Sentence quizzes

進度記喺 `localStorage` key `website-manager-progress-v1`。通過一題會標記當次所有到期 stage 為已完成。

## 本地預覽

```bash
cd website-manager
python3 -m http.server 8080
# 開 http://localhost:8080/
```

練習頁可用 `?now=2026-10-20T15:20:00+08:00` 固定「而家」方便測試。
