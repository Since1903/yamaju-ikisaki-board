export type StatusCode =
  | 'IN_OFFICE'
  | 'OUT'
  | 'MEETING'
  | 'SITE'
  | 'BUSINESS_TRIP'
  | 'LEAVE'
  | 'REMOTE'
  | 'OTHER';

export type SourceType = 'MANUAL' | 'OUTLOOK' | 'KINTONE' | 'BUGYO' | 'AUTO';

export interface BoardMember {
  id: string;
  employeeCode: string;
  name: string;
  department: string;
  role?: string;
  status: StatusCode;
  destination?: string;
  purpose?: string;
  returnAt?: string;
  nextSchedule?: string;
  phoneAvailable?: boolean;
  directGo?: boolean;
  directReturn?: boolean;
  updatedAt: string;
  source: SourceType;
}
