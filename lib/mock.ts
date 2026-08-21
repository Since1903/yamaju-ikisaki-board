import { BoardMember } from '@/types';

export const mockMembers: BoardMember[] = [
  {
    id: '1', employeeCode: 'A001', name: '渡邊 琉騎', department: '管理部 企画課',
    status: 'IN_OFFICE', destination: '本社', nextSchedule: '15:00 会議',
    phoneAvailable: true, updatedAt: '2026-08-21T15:30:00+09:00', source: 'MANUAL'
  },
  {
    id: '2', employeeCode: 'S001', name: '山田 太郎', department: '特販営業部',
    status: 'OUT', destination: 'YKK AP', purpose: '打合せ', returnAt: '16:00',
    phoneAvailable: false, directReturn: true, updatedAt: '2026-08-21T14:00:00+09:00', source: 'OUTLOOK'
  },
  {
    id: '3', employeeCode: 'K001', name: '佐藤 花子', department: '住宅営業部',
    status: 'MEETING', destination: '第2会議室', returnAt: '16:30',
    phoneAvailable: false, updatedAt: '2026-08-21T15:00:00+09:00', source: 'KINTONE'
  },
  {
    id: '4', employeeCode: 'G001', name: '田中 次郎', department: '工務',
    status: 'SITE', destination: '○○マンション', purpose: '施工', returnAt: '17:00',
    phoneAvailable: true, updatedAt: '2026-08-21T13:00:00+09:00', source: 'KINTONE'
  }
];
