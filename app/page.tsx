import StatusCard from '@/components/StatusCard';
import { mockMembers } from '@/lib/mock';

export default function HomePage() {
  const departments = ['全社員', ...Array.from(new Set(mockMembers.map(m => m.department)))]
  return (
    <main className="container">
      <header className="header">
        <div>
          <div className="title">山十株式会社　行先予定表</div>
          <div className="sub">現在位置・行先・戻り予定・次予定を一画面で確認</div>
        </div>
        <div className="sub">自動更新 / Outlook・Kintone連携対応設計</div>
      </header>
      <div className="toolbar">
        {departments.map((d, i) => <button className={`pill ${i === 0 ? 'active' : ''}`} key={d}>{d}</button>)}
      </div>
      <section className="grid">
        {mockMembers.map(member => <StatusCard member={member} key={member.id} />)}
      </section>
      <nav className="footerNav"><a href="/history">履歴</a><a href="/admin">管理</a></nav>
    </main>
  );
}
