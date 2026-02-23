import { Assignment, ColumnId, DueStatus } from '@/types/kanban';
import { Trash2, ArrowRight, GraduationCap, AlertTriangle, Calendar, Clock, CheckCircle, Upload } from 'lucide-react';

interface KanbanCardProps {
  assignment: Assignment;
  onMove: (id: string, columnId: ColumnId) => void;
  onDelete: (id: string) => void;
}

function scoreColor(score?: number, total?: number) {
  if (score == null || total == null || total === 0) return 'text-foreground';
  const pct = (score / total) * 100;
  if (pct >= 90) return 'text-[hsl(var(--grade-a))]';
  if (pct >= 80) return 'text-[hsl(var(--grade-b))]';
  if (pct >= 70) return 'text-[hsl(var(--grade-c))]';
  if (pct >= 60) return 'text-[hsl(var(--grade-d))]';
  return 'text-[hsl(var(--grade-f))]';
}

const dueStatusConfig: Record<DueStatus, { label: string; icon: typeof AlertTriangle; className: string; borderClass: string }> = {
  overdue: {
    label: 'Overdue',
    icon: AlertTriangle,
    className: 'bg-[hsl(var(--due-overdue)/0.15)] text-[hsl(var(--due-overdue))]',
    borderClass: 'border-l-[hsl(var(--due-overdue))]',
  },
  upcoming: {
    label: 'Upcoming',
    icon: Calendar,
    className: 'bg-[hsl(var(--due-upcoming)/0.15)] text-[hsl(var(--due-upcoming))]',
    borderClass: 'border-l-[hsl(var(--due-upcoming))]',
  },
  undated: {
    label: 'No Due Date',
    icon: Clock,
    className: 'bg-[hsl(var(--due-undated)/0.15)] text-[hsl(var(--due-undated))]',
    borderClass: 'border-l-[hsl(var(--due-undated))]',
  },
};

const nextColumn: Record<ColumnId, ColumnId | null> = {
  todo: 'progress',
  progress: 'done',
  done: null,
};

const doneConfig = {
  label: 'Done',
  icon: CheckCircle,
  className: 'bg-[hsl(var(--col-done)/0.15)] text-[hsl(var(--col-done))]',
  borderClass: 'border-l-[hsl(var(--col-done))]',
};

const handedInConfig = {
  label: 'Handed In',
  icon: Upload,
  className: 'bg-[hsl(var(--due-undated)/0.15)] text-[hsl(var(--due-undated))]',
  borderClass: 'border-l-[hsl(var(--due-undated))]',
};

export default function KanbanCard({ assignment, onMove, onDelete }: KanbanCardProps) {
  const next = nextColumn[assignment.columnId];
  const dueStatus = assignment.dueStatus || (assignment.dueDate ? (new Date(assignment.dueDate) < new Date() ? 'overdue' : 'upcoming') : 'undated');
  const config = assignment.columnId === 'done' ? doneConfig : assignment.columnId === 'progress' ? handedInConfig : dueStatusConfig[dueStatus];
  const StatusIcon = config.icon;

  return (
    <div
      className={`animate-pop-in group rounded-lg bg-secondary p-4 kanban-card-shadow hover:kanban-card-shadow-hover transition-all duration-300 hover:-translate-y-1 hover:ring-1 hover:ring-primary/30 ${assignment.columnId === 'todo' ? 'cursor-pointer' : 'cursor-grab active:cursor-grabbing'} hover:bg-secondary/80 border-l-4 ${config.borderClass}`}
      onClick={() => {
        if (assignment.columnId === 'todo') {
          onMove(assignment.id, 'progress');
          if (assignment.canvasUrl) {
            window.open(assignment.canvasUrl, '_blank');
          }
        }
      }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="text-2xl" role="img">{assignment.emoji}</span>
          <span className={`inline-flex items-center gap-1 text-[10px] font-display font-semibold px-2 py-0.5 rounded-full ${config.className}`}>
            <StatusIcon size={10} />
            {config.label}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-body font-medium text-muted-foreground bg-muted px-2 py-0.5 rounded-full whitespace-nowrap">
            {assignment.subject}
          </span>
          <button
            onClick={() => onDelete(assignment.id)}
            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive"
          >
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mt-2 gap-2">
        <h4 className="font-display font-semibold text-foreground text-sm leading-tight">
          {assignment.title}
        </h4>
        {assignment.columnId === 'done' && assignment.score != null && assignment.totalPoints != null && (
          <span className={`inline-flex items-center gap-1 text-sm font-display font-bold px-2 py-0.5 rounded-full bg-muted ${scoreColor(assignment.score, assignment.totalPoints)}`}>
            <GraduationCap size={12} />
            {assignment.score} / {assignment.totalPoints}
          </span>
        )}
      </div>

      <div className="flex items-center justify-between mt-3">
        <span className={`text-xs font-body ${
          assignment.columnId === 'done'
            ? (assignment.dueDate && assignment.dueStatus === 'overdue'
                ? 'text-[hsl(var(--due-overdue))] font-semibold'
                : 'text-[hsl(var(--col-done))] font-semibold')
            : dueStatus === 'overdue'
              ? 'text-[hsl(var(--due-overdue))] font-semibold'
              : dueStatus === 'undated'
                ? 'text-[hsl(var(--due-undated))]'
                : 'text-muted-foreground'
        }`}>
          {assignment.columnId !== 'done' && dueStatus === 'overdue' && '⚠️ '}
          {assignment.columnId === 'done' && assignment.dueDate && assignment.dueStatus !== 'overdue' && '✅ '}
          {assignment.columnId === 'done' && assignment.dueDate && assignment.dueStatus === 'overdue' && '⚠️ '}
          {assignment.dueDate
            ? new Date(assignment.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
            : 'No date'}
        </span>


        {next && (
          <button
            onClick={() => onMove(assignment.id, next)}
            className="flex items-center gap-1 text-xs text-primary hover:text-primary/80 transition-colors font-body font-medium"
          >
            {next === 'progress' ? 'Hand In' : 'Done'} <ArrowRight size={12} />
          </button>
        )}
      </div>
    </div>
  );
}
