# 山十 行先予定表 Ver.3.4.2

## Ver.3.4.2 の主な変更

大型モニター・タブレットを常時表示する運用を前提に、端末間同期をさらに強化した版です。

- Realtimeで即時同期
- 通常画面は15秒ごとにSupabaseを再取得
- **大型表示中は5秒ごとにSupabaseを再取得**
- 大型表示へ切り替えた瞬間にも即再取得
- 大型表示を終了した際も即再取得
- ウィンドウへ戻った時、ネット接続復帰時にも即再取得
- Realtime接続状態を30秒ごとに確認し、切断時は再接続を試行
- Realtime通知を取りこぼしても定期再取得で表示を自動復旧

## 予定共有

- 予定はSupabaseの `schedules` テーブルへ保存
- 開始・終了判定はSupabase側で実行
- `employee_status` の更新を全端末で共有
- PC・スマホ・タブレット・大型モニターで同じ状態を表示
- 自動切換えはSupabase Cronが毎分判定するため、開始・終了自体は最大約1分程度遅れる場合があります
- サーバーで状態が切り替わった後、**大型表示は最大約5秒、通常画面は最大約15秒で表示が追従**します（Realtime受信時はほぼ即時）

## Supabase側

Ver.3.4/3.4.1で `SETUP_SCHEDULES.sql` を実行済みなら、再実行は不要です。

`REALTIME_SYNC_PATCH.sql` をまだ実行していない場合は、SQL Editorで新しいQueryとして1回実行してください。これは `employee_status` と `schedules` がRealtime対象になっていることを補強します。

## GitHubへ更新するファイル

- `app.js`
- `index.html`
- `README.md`

`styles.css` と `supabase-config.js` はVer.3.4.1から変更していません。
