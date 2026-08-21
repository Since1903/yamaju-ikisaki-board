export type UnifiedSchedule = {
  employeeId: string;
  startAt: string;
  endAt: string;
  status: string;
  destination?: string;
  source: 'OUTLOOK'|'KINTONE'|'BUGYO';
  priority: number;
};

export function resolveCurrentSchedule(schedules: UnifiedSchedule[], now: Date) {
  const t = now.getTime();
  return schedules
    .filter(s => new Date(s.startAt).getTime() <= t && t < new Date(s.endAt).getTime())
    .sort((a,b) => b.priority - a.priority)[0] ?? null;
}
