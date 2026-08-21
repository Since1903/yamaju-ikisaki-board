'use client';
import { BoardMember, StatusCode } from '@/types';

const statusLabels: Record<StatusCode, string> = {
  IN_OFFICE: '🟢 在席', OUT: '🔴 外出', MEETING: '🟡 会議', SITE: '🔵 現場',
  BUSINESS_TRIP: '🟣 出張', LEAVE: '⚫ 休み', REMOTE: '🟦 在宅', OTHER: '⚪ その他'
};

export default function StatusCard({ member }: { member: BoardMember }) {
  return (
    <article className="card">
      <div className="row">
        <div><div className="name">{member.name}</div><div className="dept">{member.department}</div></div>
        <div className="status">{statusLabels[member.status]}</div>
      </div>
      <div className="meta">
        <div><b>行先</b>{member.destination || '―'}</div>
        <div><b>用件</b>{member.purpose || '―'}</div>
        <div><b>戻り</b>{member.returnAt || '―'}</div>
        <div><b>次予定</b>{member.nextSchedule || '―'}</div>
        <div><b>電話</b>{member.phoneAvailable ? '対応可' : '対応不可'}</div>
        <div><b>更新元</b>{member.source}</div>
      </div>
    </article>
  );
}
