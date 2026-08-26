# 山十 行先予定表 Ver.3.4

## Ver.3.4 の主な変更

- 予定登録を端末内 `localStorage` から Supabase の `schedules` テーブルへ移行
- PC・スマホで予定を共有
- 予定の追加・変更・削除を Realtime で同期
- 開始・終了時刻の判定をブラウザではなく PostgreSQL / Supabase Cron 側で実行
- 端末を閉じていても予定を自動実行
- `employee_status` 更新後、既存の Realtime で全端末へ自動反映
- 開始済み予定の編集を禁止
- 実行中予定の削除を禁止

## 重要：GitHubへアップロードする前に

Supabase の SQL Editor で **`SETUP_SCHEDULES.sql` を1回だけ実行**してください。

このSQLで以下を設定します。

1. `schedules` テーブル作成
2. RLS / authenticated 権限
3. Realtime対象への追加
4. サーバー側自動切換え関数 `process_due_schedules()`
5. Supabase Cron による毎分実行

自動切換えは毎分判定のため、設定時刻から最大約1分程度の遅延があり得ます。

## GitHubへ更新するファイル

- `app.js`
- `index.html`
- `styles.css`
- `README.md`

現在正常に動作している `supabase-config.js` はそのまま利用できます。

## 既存の予定について

Ver.3.3以前の予定は各端末のブラウザ内に保存されています。Ver.3.4ではSupabase共有予定へ切り替わるため、必要な既存予定はVer.3.4公開後にもう一度登録してください。
