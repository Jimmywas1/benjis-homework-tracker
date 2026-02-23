import { useState, useMemo, useEffect, useRef } from 'react';
import { useLocation, useParams } from 'react-router-dom';
import KanbanBoard from '@/components/kanban/KanbanBoard';
import { AppSidebar } from '@/components/AppSidebar';
import AIChatPanel from '@/components/chat/AIChatPanel';
import About from '@/pages/About';
import Stats from '@/pages/Stats';
import { SidebarProvider, SidebarTrigger } from '@/components/ui/sidebar';
import { useAssignments } from '@/hooks/useAssignments';
import { useCanvasSync } from '@/hooks/useCanvasSync';
import SplashScreen from '@/components/ui/SplashScreen';

const Index = () => {
  const [chatOpen, setChatOpen] = useState(false);
  const location = useLocation();
  const { studentId } = useParams<{ studentId: string }>();

  const isAbout = location.pathname === '/about';
  const isStats = location.pathname.includes('/stats');
  const isBoard = !isAbout && !isStats;

  const assignmentsHook = useAssignments();
  const canvasSyncHook = useCanvasSync();

  const [isInitialSync, setIsInitialSync] = useState(true);
  const syncAttempted = useRef(false);

  useEffect(() => {
    if (syncAttempted.current) return;
    syncAttempted.current = true;

    // Clear stale localStorage on startup so the clean-replace sync starts fresh
    localStorage.removeItem('homework-kanban-assignments');
    assignmentsHook.setAssignments([]);

    // Automatically trigger the initial Canvas sync on application load
    canvasSyncHook.syncFromCanvas(
      [],
      assignmentsHook.addAssignment,
      assignmentsHook.setAssignments
    ).finally(() => {
      // Small artificial delay to guarantee smooth aesthetic transition
      setTimeout(() => setIsInitialSync(false), 500);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const matchesStudent = (nameField: string | undefined) => {
    const name = nameField?.toLowerCase() || 'benji';
    const targetId = studentId?.toLowerCase() || '';
    if (targetId === 'benji' && name === 'benjamin') return true;
    return name === targetId;
  };

  // Filter assignments for the active student
  const filteredAssignments = useMemo(() => {
    if (isAbout) return [];
    return assignmentsHook.assignments.filter(a => matchesStudent(a.studentName));
  }, [assignmentsHook.assignments, studentId, isAbout]);

  // Filter Canvas course grades for the active student
  const filteredCourseGrades = useMemo(() => {
    return canvasSyncHook.courseGrades.filter(cg => matchesStudent(cg.studentName));
  }, [canvasSyncHook.courseGrades, studentId]);

  // Create a localized clone of the assignments hook to pass down ONLY filtered data,
  // but keep the full create/update/delete functionality intact.
  const scopedAssignmentsHook = useMemo(() => ({
    ...assignmentsHook,
    assignments: filteredAssignments,
    getByColumn: (columnId: string) =>
      filteredAssignments
        .filter(a => a.columnId === columnId)
        .sort((a, b) => {
          if (!a.dueDate && !b.dueDate) return a.createdAt - b.createdAt;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime();
        })
  }), [assignmentsHook, filteredAssignments]);

  if (isInitialSync) {
    return <SplashScreen />;
  }

  return (
    <SidebarProvider>
      <div className="min-h-screen flex w-full">
        <AppSidebar onToggleChat={() => setChatOpen(!chatOpen)} chatOpen={chatOpen} />
        <div className="flex-1 flex">
          <div className="flex-1 flex flex-col">
            <header className="h-12 flex items-center border-b border-border px-4 bg-background">
              <SidebarTrigger />
            </header>
            <main className="flex-1 overflow-auto">
              {isAbout ? (
                <About />
              ) : isStats ? (
                <Stats assignments={filteredAssignments} courseGrades={filteredCourseGrades} />
              ) : (
                <KanbanBoard assignmentsHook={scopedAssignmentsHook} canvasSyncHook={canvasSyncHook} />
              )}
            </main>
          </div>
          {chatOpen && isBoard && (
            <div className="w-[360px] border-l border-border flex-shrink-0">
              <AIChatPanel onClose={() => setChatOpen(false)} />
            </div>
          )}
        </div>
      </div>
    </SidebarProvider>
  );
};

export default Index;
