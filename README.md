# 山十 行先予定表 Ver.3.0

Supabase認証と共通の現在状態データを接続したセキュリティ強化版です。

## Ver.3.0で追加したこと

- 未ログイン時は行先板を一切表示しない
- 社員ID + パスワードでSupabase Authにログイン
- ログインID `watanabe` は内部で `watanabe@yamaju.local` に変換
- `employees` から社員一覧・部署・職種・権限を取得
- `employee_status` から現在状態を取得
- 手動の「変更」をSupabaseへ保存
- Realtimeで他端末の状態変更を再取得
- `role = admin` のユーザーだけ「管理設定」を表示
- ログアウトボタンを追加

## 初回設定（必須）

`supabase-config.js` を開き、`publishableKey` の値だけをSupabaseの **Publishable key** に置き換えてください。

```js
window.YAMAJU_SUPABASE = {
  url: 'https://laqqrrwoqfnmgtkohxrf.supabase.co',
  publishableKey: 'ここをsb_publishable_...に置き換える',
  loginDomain: 'yamaju.local'
};
```

**Secret key / service_role key は絶対に入れないでください。** Publishable keyはブラウザ利用前提のキーで、実データへのアクセスはSupabaseのRLSで制御します。

## 現在Supabase共有されるもの

- 社員一覧
- 現在状態
- 行先
- 用件
- 戻り予定
- 電話状態
- 直行・直帰
- メモ

## まだ端末内保存のもの

- 予定登録 / 自動切換え予定
- 履歴
- 状態マスタの追加・色・並び順
- 表示する社員の選択

次の段階で予定・状態マスタもSupabaseへ移行できます。

## GitHub Pagesへの更新

`index.html` / `app.js` / `styles.css` / `README.md` / `supabase-config.js` の5ファイルをリポジトリへ上書きし、Commit → Pushしてください。
