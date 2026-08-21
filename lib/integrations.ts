/**
 * 連携アダプタの入口。
 * API秘密情報は必ずサーバー側環境変数に置き、ブラウザには渡さない。
 */
export async function fetchOutlookSchedules() {
  // TODO: Microsoft Graph calendarView / delta 等で予定取得
  return [];
}

export async function fetchKintoneSchedules() {
  // TODO: Kintone REST API で当日予定を取得
  return [];
}

export async function fetchBugyoAttendance() {
  // TODO: 契約中の奉行クラウドAPI仕様に合わせて休暇・勤怠情報を取得
  return [];
}
