import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { SUBJECT_EMOJIS, ColumnId } from '@/types/kanban';
import type { Assignment, DueStatus, CourseGrade } from '@/types/kanban';
import { toast } from '@/hooks/use-toast';

const COURSE_GRADES_KEY = 'homework-kanban-course-grades';

function loadCourseGrades(): CourseGrade[] {
  try {
    const saved = localStorage.getItem(COURSE_GRADES_KEY);
    return saved ? JSON.parse(saved) : [];
  } catch {
    return [];
  }
}

interface CanvasAssignment {
  canvasId: number;
  title: string;
  subject: string;
  dueDate: string;
  status: 'todo' | 'progress' | 'done';
  grade?: string;
  score?: number;
  totalPoints?: number;
  dueStatus: DueStatus;
  canvasUrl?: string;
  studentName?: string;
}

function matchSubjectEmoji(subject: string): string {
  const lower = subject.toLowerCase();
  for (const [key, emoji] of Object.entries(SUBJECT_EMOJIS)) {
    if (lower.includes(key.toLowerCase())) return emoji;
  }
  return '📝';
}

export function useCanvasSync() {
  const [syncing, setSyncing] = useState(false);
  const [courseGrades, setCourseGrades] = useState<CourseGrade[]>(loadCourseGrades);

  const syncFromCanvas = useCallback(
    async (
      existingAssignments: Assignment[],
      addAssignment: (a: Omit<Assignment, 'id' | 'createdAt'>) => void,
      setAssignments?: (assignments: Assignment[]) => void
    ) => {
      setSyncing(true);
      try {
        const { data, error } = await supabase.functions.invoke('canvas-sync');

        if (error) throw error;

        const canvasAssignments: CanvasAssignment[] = data.assignments;

        // Store canvas course grades
        if (data.courseGrades) {
          setCourseGrades(data.courseGrades);
          localStorage.setItem(COURSE_GRADES_KEY, JSON.stringify(data.courseGrades));
        }

        if (setAssignments) {
          // ✅ Clean replace: discard all stale Canvas assignments; preserve any manually-added ones
          const manualAssignments = existingAssignments.filter(a => !a.canvasId);
          const now = Date.now();
          const freshCanvasAssignments: Assignment[] = canvasAssignments.map((ca, i) => {
            // Preserve user's column overrides (e.g. if they dragged an item to In Progress)
            const existing = existingAssignments.find(a => a.canvasId === ca.canvasId);
            const columnId: ColumnId =
              ca.status === 'done'
                ? 'done'
                : existing?.columnId ?? (ca.status === 'progress' ? 'progress' : 'todo');
            return {
              id: existing?.id ?? crypto.randomUUID(),
              createdAt: existing?.createdAt ?? now + i,
              canvasId: ca.canvasId,
              title: ca.title,
              subject: ca.subject,
              dueDate: ca.dueDate,
              emoji: matchSubjectEmoji(ca.subject),
              columnId,
              grade: ca.grade,
              score: ca.score,
              totalPoints: ca.totalPoints,
              dueStatus: ca.dueStatus,
              canvasUrl: ca.canvasUrl,
              studentName: ca.studentName,
            };
          });
          setAssignments([...manualAssignments, ...freshCanvasAssignments]);

          toast({
            title: `🎓 Canvas Sync Complete`,
            description: `Loaded ${canvasAssignments.length} assignments from the current quarter.`,
          });
        } else {
          // Fallback: additive merge (legacy path, should not typically hit this)
          let added = 0;
          for (const ca of canvasAssignments) {
            const exists = existingAssignments.some(
              (a) => a.title === ca.title && a.dueDate === ca.dueDate
            );
            if (exists) continue;
            const columnId: ColumnId =
              ca.status === 'done' ? 'done' : ca.status === 'progress' ? 'progress' : 'todo';
            addAssignment({
              title: ca.title, subject: ca.subject, dueDate: ca.dueDate,
              emoji: matchSubjectEmoji(ca.subject), columnId, grade: ca.grade,
              score: ca.score, totalPoints: ca.totalPoints, dueStatus: ca.dueStatus,
              canvasUrl: ca.canvasUrl, studentName: ca.studentName,
            });
            added++;
          }
          toast({
            title: `🎓 Canvas Sync Complete`,
            description: `Found ${canvasAssignments.length} assignments, added ${added} new ones.`,
          });
        }
      } catch (err) {
        console.error('Canvas sync error:', err);
        toast({
          title: '❌ Canvas Sync Failed',
          description: err instanceof Error ? err.message : 'Could not connect to Canvas.',
          variant: 'destructive',
        });
      } finally {
        setSyncing(false);
      }
    },
    []
  );

  return { syncing, syncFromCanvas, courseGrades };
}
