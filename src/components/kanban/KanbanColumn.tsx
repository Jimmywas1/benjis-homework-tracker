import { Assignment, Column, ColumnId } from '@/types/kanban';
import KanbanCard from './KanbanCard';
import { DragEvent, useState } from 'react';

interface KanbanColumnProps {
  column: Column;
  assignments: Assignment[];
  totalCount?: number;           // unfiltered count (To Do only)
  subjects?: string[];           // list of classes to filter by (To Do only)
  selectedSubject?: string | null;
  onSubjectChange?: (subject: string | null) => void;
  onMove: (id: string, columnId: ColumnId) => void;
  onDelete: (id: string) => void;
  onDrop: (id: string, columnId: ColumnId) => void;
}

const glowClass: Record<ColumnId, string> = {
  todo: 'col-glow-todo',
  progress: 'col-glow-progress',
  done: 'col-glow-done',
};

const dotColor: Record<ColumnId, string> = {
  todo: 'bg-col-todo',
  progress: 'bg-col-progress',
  done: 'bg-col-done',
};

export default function KanbanColumn({
  column,
  assignments,
  totalCount,
  subjects,
  selectedSubject,
  onSubjectChange,
  onMove,
  onDelete,
  onDrop,
}: KanbanColumnProps) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => setDragOver(false);

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const id = e.dataTransfer.getData('text/plain');
    if (id) onDrop(id, column.id);
  };

  const badgeCount = totalCount !== undefined ? totalCount : assignments.length;

  return (
    <div
      className={`flex flex-col rounded-xl bg-card/50 glass p-4 min-h-[400px] transition-all duration-300 ${glowClass[column.id]} hover:scale-[1.01] hover:brightness-110 ${dragOver ? 'ring-2 ring-primary/50 scale-[1.02]' : ''}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Column header */}
      <div className="flex items-center gap-2 mb-3">
        <span className="text-xl">{column.emoji}</span>
        <h3 className="font-display font-bold text-foreground text-lg">{column.title}</h3>
        <span className={`ml-auto flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold font-body ${dotColor[column.id]} text-background`}>
          {badgeCount}
        </span>
      </div>

      {/* Subject filter pills — To Do column only */}
      {subjects && subjects.length > 0 && onSubjectChange && (
        <div className="flex flex-wrap gap-1.5 mb-3">
          <button
            onClick={() => onSubjectChange(null)}
            className={`px-2.5 py-0.5 rounded-full text-xs font-body font-semibold transition-all duration-150 ${!selectedSubject
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
              }`}
          >
            All
          </button>
          {subjects.map(subject => (
            <button
              key={subject}
              onClick={() => onSubjectChange(selectedSubject === subject ? null : subject)}
              className={`px-2.5 py-0.5 rounded-full text-xs font-body font-semibold transition-all duration-150 ${selectedSubject === subject
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
                }`}
            >
              {subject}
            </button>
          ))}
        </div>
      )}

      {/* Cards */}
      <div className="flex flex-col gap-3 flex-1">
        {assignments.map(a => (
          <div
            key={a.id}
            draggable
            onDragStart={(e) => {
              e.dataTransfer.setData('text/plain', a.id);
              e.dataTransfer.effectAllowed = 'move';
            }}
          >
            <KanbanCard
              assignment={a}
              onMove={onMove}
              onDelete={onDelete}
            />
          </div>
        ))}

        {assignments.length === 0 && (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm font-body opacity-50">
            {column.id === 'todo'
              ? selectedSubject
                ? `No ${selectedSubject} assignments`
                : 'Add an assignment!'
              : column.id === 'progress'
                ? 'Nothing handed in yet'
                : 'No completed work yet'}
          </div>
        )}
      </div>
    </div>
  );
}
