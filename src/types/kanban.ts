export type ColumnId = 'todo' | 'progress' | 'done';

export type DueStatus = 'overdue' | 'upcoming' | 'undated';

export interface Assignment {
  id: string;
  canvasId?: number;
  subject: string;
  title: string;
  dueDate: string;
  grade?: string;
  score?: number;
  totalPoints?: number;
  columnId: ColumnId;
  emoji: string;
  createdAt: number;
  dueStatus?: DueStatus;
  canvasUrl?: string;
  studentName?: string;
}

export interface Column {
  id: ColumnId;
  title: string;
  emoji: string;
}

export const COLUMNS: Column[] = [
  { id: 'todo', title: 'To Do', emoji: '📋' },
  { id: 'progress', title: 'Handed In', emoji: '📤' },
  { id: 'done', title: 'Done', emoji: '🎉' },
];

export const SUBJECT_EMOJIS: Record<string, string> = {
  Math: '🔢',
  Science: '🔬',
  English: '📖',
  History: '🏛️',
  Art: '🎨',
  Music: '🎵',
  PE: '⚽',
  Spanish: '🇪🇸',
  French: '🇫🇷',
  Computer: '💻',
  Other: '📝',
};

export const GRADES = ['A+', 'A', 'A-', 'B+', 'B', 'B-', 'C+', 'C', 'C-', 'D+', 'D', 'D-', 'F'];

export interface CourseGrade {
  courseId?: number;
  subject: string;
  currentScore: number | null;
  currentGrade: string | null;
  finalScore?: number | null;
  studentName?: string;
}
