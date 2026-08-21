# 山十 行先予定表 Ver.1

社内向けの行先・行動予定ボードです。PC・大型モニター・iPad・iPhone・Androidを同一Webアプリで扱う前提のレスポンシブ構成です。

## Ver.1 の範囲
- 社員カード型の行先板UI
- 部署切替のUI土台
- 在席 / 外出 / 会議 / 現場 / 出張 / 休暇 / 在宅 / その他
- 行先、用件、戻り予定、次予定、電話可否
- 履歴画面
- 管理画面の土台
- Supabase用DBスキーマ
- 自動切換え判定ロジックの土台
- Outlook / Kintone / 奉行クラウド連携アダプタの入口

## 推奨構成
- GitHub: ソース管理
- Vercel: Next.js公開・サーバーAPI
- Supabase: DB / Realtime / 認証補助
- Microsoft Entra ID: Microsoft 365ログイン
- Microsoft Graph: Outlook予定表
- Kintone REST API: 現場・業務予定
- 奉行クラウド: 利用契約/API可否に応じて勤怠・休暇連携

## データ優先順位（初期案）
1. 手動変更（manual_override_until の間）
2. 奉行の休暇/勤怠
3. Kintoneの現場・業務予定
4. Outlook予定
5. 予定なし → 在席

※ 実運用に合わせて変更可能です。

## セットアップ
1. GitHubにこのフォルダ一式をPush
2. Supabaseプロジェクト作成
3. `supabase/schema.sql` をSQL Editorで実行
4. `.env.example` を `.env.local` にコピーし、接続情報を設定
5. `npm install`
6. `npm run dev`
7. VercelとGitHubリポジトリを接続

## 次に実装する箇所
- Supabase実データ読込/更新
- 社員カードを押したときの状態変更ダイアログ
- Realtimeで全端末へ即時反映
- Microsoftログイン
- Outlook予定取得と自動切換え
- Kintone予定取得と自動切換え
- 予定競合時の優先制御
- 履歴検索（日付 / 氏名 / 部署 / 更新元）
- PWA対応
- 奉行クラウド連携

## セキュリティ
Outlook/Kintone/奉行の秘密情報はクライアント側コードに置かず、Vercelの環境変数とサーバーAPI側で扱います。
