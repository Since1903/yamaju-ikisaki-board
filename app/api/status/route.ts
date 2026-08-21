import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  const body = await req.json();
  // TODO: Supabaseへ現在状態を保存し、status_historyへ変更履歴を追加する。
  return NextResponse.json({ ok: true, received: body });
}
