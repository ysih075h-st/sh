export type TaskType = '보고서' | 'PPT' | '문제풀이' | '기타';

export interface Requirements {
  amount?: string;
  citation?: string;
  format?: string;
  duration?: string;
  fileTypes: string[];
  criteria: { name: string; pct: number }[];
  musts: string[];
}

export interface FileAnalysis {
  summary: string[];
  keywords: string[];
  sentences: string[];
  req: Requirements;
  reqLines: string[];
  chars: number;
}

export type Unreadable = 'hwp' | 'scan' | 'image' | 'type' | 'empty' | 'error';

export interface TaskFile {
  name: string;
  size: number;
  kind: 'text' | 'other';
  why?: Unreadable;
  auto?: FileAnalysis;
}

export interface Task {
  id: number;
  type: TaskType;
  subject: string;
  name: string;
  due: number;
  amount: number;
  unit: string;
  per: number;
  done: boolean;
  doneAt?: number | null;
  created: number;
  content?: string;
  issues?: string[];
  files?: TaskFile[];
  checks?: Record<string, boolean>;
  notified?: Record<string, boolean>;
  sample?: boolean;
}

export const TYPES: Record<TaskType, { unit: string; per: number; color: string; hint: string }> = {
  '보고서': { unit: '쪽', per: 40, color: '#7dd3fc', hint: '쪽 수 × 1쪽 작성 시간' },
  'PPT': { unit: '장', per: 20, color: '#fdba74', hint: '슬라이드 장 수 × 1장 제작 시간' },
  '문제풀이': { unit: '문제', per: 5, color: '#c4b5fd', hint: '문제 수 × 1문제 풀이 시간' },
  '기타': { unit: '개', per: 30, color: '#94a3b8', hint: '단위와 시간을 직접 정해요' }
};

export const UNITS = ['쪽', '장', '문제', '개'];
