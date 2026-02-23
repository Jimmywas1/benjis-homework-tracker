import { useMemo } from 'react';
import { useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Assignment, CourseGrade } from '@/types/kanban';
import {
  Trophy, Target, Flame, TrendingUp, BookOpen, Star,
  CheckCircle2, Clock, AlertTriangle, Zap, Award, GraduationCap,
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

interface StatsProps {
  assignments: Assignment[];
  courseGrades: CourseGrade[];
}

function getLetterGrade(pct: number): string {
  if (pct >= 97) return 'A+';
  if (pct >= 93) return 'A';
  if (pct >= 90) return 'A-';
  if (pct >= 87) return 'B+';
  if (pct >= 83) return 'B';
  if (pct >= 80) return 'B-';
  if (pct >= 77) return 'C+';
  if (pct >= 73) return 'C';
  if (pct >= 70) return 'C-';
  if (pct >= 67) return 'D+';
  if (pct >= 63) return 'D';
  if (pct >= 60) return 'D-';
  return 'F';
}

function gradeColor(pct: number): string {
  if (pct >= 90) return 'text-[hsl(var(--grade-a))]';
  if (pct >= 80) return 'text-[hsl(var(--grade-b))]';
  if (pct >= 70) return 'text-[hsl(var(--grade-c))]';
  if (pct >= 60) return 'text-[hsl(var(--grade-d))]';
  return 'text-[hsl(var(--grade-f))]';
}

function gradeBarColor(pct: number): string {
  if (pct >= 90) return 'hsl(var(--grade-a))';
  if (pct >= 80) return 'hsl(var(--grade-b))';
  if (pct >= 70) return 'hsl(var(--grade-c))';
  if (pct >= 60) return 'hsl(var(--grade-d))';
  return 'hsl(var(--grade-f))';
}


const motivationalMessages = [
  { min: 90, messages: ["Absolute legend! 🔥", "You're on fire!", "College-bound superstar!"] },
  { min: 80, messages: ["Crushing it! 💪", "Solid work, keep pushing!", "Great things ahead!"] },
  { min: 70, messages: ["Making progress! 📈", "Keep climbing!", "You've got this!"] },
  { min: 60, messages: ["Room to grow — let's go! 🚀", "Every expert was once a beginner!", "The comeback starts now!"] },
  { min: 0, messages: ["Never give up! 💪", "Ask for help — that's what smart people do!", "Tomorrow is a fresh start!"] },
];

function getMotivation(pct: number): string {
  const bucket = motivationalMessages.find(b => pct >= b.min) || motivationalMessages[motivationalMessages.length - 1];
  return bucket.messages[Math.floor(Math.random() * bucket.messages.length)];
}

const containerVariants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.07 } },
};

const itemVariants = {
  hidden: { opacity: 0, y: 20, scale: 0.95 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { type: 'spring' as const, stiffness: 300, damping: 24 } },
};

export default function Stats({ assignments, courseGrades }: StatsProps) {
  const { studentId } = useParams<{ studentId: string }>();
  const activeStudent = studentId
    ? studentId.charAt(0).toUpperCase() + studentId.slice(1)
    : 'Benji';

  const stats = useMemo(() => {
    const total = assignments.length;
    const done = assignments.filter(a => a.columnId === 'done');
    const todo = assignments.filter(a => a.columnId === 'todo');
    const inProgress = assignments.filter(a => a.columnId === 'progress');
    const overdue = assignments.filter(a => a.dueStatus === 'overdue' && a.columnId !== 'done');

    // Graded assignments
    const graded = done.filter(a => a.score != null && a.totalPoints != null && a.totalPoints > 0);
    const totalEarned = graded.reduce((sum, a) => sum + (a.score ?? 0), 0);
    const totalPossible = graded.reduce((sum, a) => sum + (a.totalPoints ?? 0), 0);
    const avgPct = totalPossible > 0 ? (totalEarned / totalPossible) * 100 : 0;

    // Assignment counts per subject (for completion display)
    const subjectMap = new Map<string, { doneCount: number; totalCount: number }>();
    for (const a of assignments) {
      const existing = subjectMap.get(a.subject) || { doneCount: 0, totalCount: 0 };
      existing.totalCount++;
      if (a.columnId === 'done') existing.doneCount++;
      subjectMap.set(a.subject, existing);
    }

    // Perfect scores
    const perfectScores = graded.filter(a => a.score === a.totalPoints).length;

    // Completion rate
    const completionPct = total > 0 ? (done.length / total) * 100 : 0;

    // Grade trend over time (by due date)
    const gradedWithDates = graded
      .filter(a => a.dueDate)
      .sort((a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());

    let runningEarned = 0;
    let runningPossible = 0;
    const trendData = gradedWithDates.map((a) => {
      runningEarned += a.score ?? 0;
      runningPossible += a.totalPoints ?? 0;
      const pct = runningPossible > 0 ? (runningEarned / runningPossible) * 100 : 0;
      const date = new Date(a.dueDate);
      return {
        date: `${date.getMonth() + 1}/${date.getDate()}`,
        score: Math.round(((a.score ?? 0) / (a.totalPoints ?? 1)) * 100),
        cumulative: Math.round(pct * 10) / 10,
        name: a.title,
      };
    });

    return {
      total, done: done.length, todo: todo.length, inProgress: inProgress.length,
      overdue: overdue.length, graded: graded.length, avgPct,
      subjectMap, perfectScores, completionPct, totalEarned, totalPossible, trendData,
    };
  }, [assignments]);

  // Subject breakdown: primary source is Canvas courseGrades (all enrolled courses).
  // Merge in assignment completion counts. Sort by grade descending, N/A at bottom.
  const subjectBreakdown = useMemo(() => {
    const seen = new Set<string>();
    const result: Array<{
      name: string;
      currentScore: number | null;
      displayLetter: string | null;
      doneCount: number;
      totalCount: number;
    }> = [];

    // Start with all Canvas course grades
    for (const cg of courseGrades) {
      if (seen.has(cg.subject)) continue;
      seen.add(cg.subject);
      const asgn = stats.subjectMap.get(cg.subject);
      const rawGrade = cg.currentGrade;
      const score = cg.currentScore;
      const displayLetter = rawGrade
        ? (isNaN(Number(rawGrade)) ? rawGrade : getLetterGrade(Number(rawGrade)))
        : (score != null ? getLetterGrade(score) : null);
      result.push({
        name: cg.subject,
        currentScore: score,
        displayLetter,
        doneCount: asgn?.doneCount ?? 0,
        totalCount: asgn?.totalCount ?? 0,
      });
    }

    // Add any subjects that have assignments but weren't in courseGrades
    for (const [name, asgn] of stats.subjectMap) {
      if (seen.has(name)) continue;
      result.push({ name, currentScore: null, displayLetter: null, ...asgn });
    }

    return result.sort((a, b) => {
      if (a.currentScore === null && b.currentScore === null) return 0;
      if (a.currentScore === null) return 1;
      if (b.currentScore === null) return -1;
      return b.currentScore - a.currentScore;
    });
  }, [courseGrades, stats.subjectMap]);

  if (assignments.length === 0 && courseGrades.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center min-h-[calc(100vh-3rem)] px-6">
        <p className="text-4xl mb-4">📊</p>
        <p className="font-display font-bold text-xl text-foreground">No data yet!</p>
        <p className="text-muted-foreground font-body text-sm mt-2">Sync from Canvas to see your stats.</p>
      </div>
    );
  }

  const motivation = getMotivation(stats.avgPct);

  return (
    <div className="p-4 md:p-8 max-w-6xl mx-auto">
      <motion.div variants={containerVariants} initial="hidden" animate="visible" className="space-y-6">

        {/* Hero banner */}
        <motion.div variants={itemVariants}>
          <Card className="overflow-hidden border-0 bg-gradient-to-br from-primary/20 via-card to-card">
            <CardContent className="p-6 md:p-8">
              <div className="flex flex-col md:flex-row items-center gap-6">
                <div className="w-24 h-24 rounded-2xl bg-primary/20 flex items-center justify-center flex-shrink-0">
                  <Trophy className="text-primary w-12 h-12" />
                </div>
                <div className="flex-1 text-center md:text-left">
                  <h1 className="font-display font-bold text-2xl md:text-3xl text-foreground mb-1">
                    {activeStudent}'s Report Card 📊
                  </h1>
                  <p className="text-muted-foreground font-body text-sm mb-3">
                    {stats.total} assignments tracked · {stats.graded} graded
                  </p>
                  {stats.graded > 0 && (
                    <div className="flex items-center gap-3 justify-center md:justify-start">
                      <span className={`font-display font-bold text-4xl ${gradeColor(stats.avgPct)}`}>
                        {getLetterGrade(stats.avgPct)}
                      </span>
                      <div>
                        <p className={`font-display font-bold text-lg ${gradeColor(stats.avgPct)}`}>
                          {stats.avgPct.toFixed(1)}% Overall
                        </p>
                        <p className="text-xs text-muted-foreground font-body">
                          {stats.totalEarned} / {stats.totalPossible} points earned
                        </p>
                      </div>
                    </div>
                  )}
                </div>
                <div className="text-center px-4 py-3 rounded-xl bg-primary/10 flex-shrink-0">
                  <p className="font-display font-bold text-sm text-primary">{motivation}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Quick stat cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[
            { icon: CheckCircle2, label: 'Completed', value: stats.done, color: 'text-[hsl(var(--col-done))]', bg: 'bg-[hsl(var(--col-done)/0.1)]' },
            { icon: Clock, label: 'Handed In', value: stats.inProgress, color: 'text-[hsl(var(--col-progress))]', bg: 'bg-[hsl(var(--col-progress)/0.1)]' },
            { icon: Target, label: 'To Do', value: stats.todo, color: 'text-[hsl(var(--col-todo))]', bg: 'bg-[hsl(var(--col-todo)/0.1)]' },
            { icon: AlertTriangle, label: 'Overdue', value: stats.overdue, color: 'text-[hsl(var(--due-overdue))]', bg: 'bg-[hsl(var(--due-overdue)/0.1)]' },
          ].map((stat) => (
            <motion.div key={stat.label} variants={itemVariants}>
              <Card className="border-border/50 hover:border-border transition-colors">
                <CardContent className="p-4 flex items-center gap-3">
                  <div className={`w-10 h-10 rounded-xl ${stat.bg} flex items-center justify-center flex-shrink-0`}>
                    <stat.icon className={`w-5 h-5 ${stat.color}`} />
                  </div>
                  <div>
                    <p className="font-display font-bold text-2xl text-foreground leading-none">{stat.value}</p>
                    <p className="text-xs text-muted-foreground font-body">{stat.label}</p>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>

        {/* Completion + Perfect scores row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <motion.div variants={itemVariants}>
            <Card className="border-border/50 h-full">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Flame className="w-5 h-5 text-primary" />
                  <h3 className="font-display font-bold text-foreground">Completion Rate</h3>
                </div>
                <div className="space-y-3">
                  <div className="flex items-end justify-between">
                    <span className="font-display font-bold text-4xl text-foreground">
                      {stats.completionPct.toFixed(0)}%
                    </span>
                    <span className="text-xs text-muted-foreground font-body">
                      {stats.done} of {stats.total} done
                    </span>
                  </div>
                  <Progress value={stats.completionPct} className="h-3 bg-muted" />
                  <p className="text-xs text-muted-foreground font-body">
                    {stats.completionPct >= 80
                      ? "🌟 Outstanding dedication!"
                      : stats.completionPct >= 50
                        ? "📈 Good progress — keep it up!"
                        : "💪 Every assignment completed is a win!"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </motion.div>

          <motion.div variants={itemVariants}>
            <Card className="border-border/50 h-full">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <Star className="w-5 h-5 text-primary" />
                  <h3 className="font-display font-bold text-foreground">Achievements</h3>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-gradient-to-br from-primary/15 to-transparent p-3 text-center">
                    <Award className="w-6 h-6 text-primary mx-auto mb-1" />
                    <p className="font-display font-bold text-xl text-foreground">{stats.perfectScores}</p>
                    <p className="text-[10px] text-muted-foreground font-body">Perfect Scores</p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-[hsl(var(--col-done)/0.15)] to-transparent p-3 text-center">
                    <GraduationCap className="w-6 h-6 text-[hsl(var(--col-done))] mx-auto mb-1" />
                    <p className="font-display font-bold text-xl text-foreground">{stats.graded}</p>
                    <p className="text-[10px] text-muted-foreground font-body">Graded</p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-[hsl(var(--col-progress)/0.15)] to-transparent p-3 text-center">
                    <Zap className="w-6 h-6 text-[hsl(var(--col-progress))] mx-auto mb-1" />
                    <p className="font-display font-bold text-xl text-foreground">{stats.total}</p>
                    <p className="text-[10px] text-muted-foreground font-body">Total Tracked</p>
                  </div>
                  <div className="rounded-xl bg-gradient-to-br from-[hsl(var(--grade-a)/0.15)] to-transparent p-3 text-center">
                    <TrendingUp className="w-6 h-6 text-[hsl(var(--grade-a))] mx-auto mb-1" />
                    <p className="font-display font-bold text-xl text-foreground">
                      {stats.avgPct > 0 ? `${stats.avgPct.toFixed(0)}%` : '—'}
                    </p>
                    <p className="text-[10px] text-muted-foreground font-body">Avg Score</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        </div>

        {/* Subject breakdown — driven by Canvas quarterly grades */}
        {subjectBreakdown.length > 0 && (
          <motion.div variants={itemVariants}>
            <Card className="border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-5">
                  <BookOpen className="w-5 h-5 text-primary" />
                  <h3 className="font-display font-bold text-foreground">Subject Breakdown</h3>
                  <span className="text-xs text-muted-foreground font-body ml-1">— current quarter grades from Canvas</span>
                </div>
                <div className="space-y-4">
                  {subjectBreakdown.map((subject) => {
                    const hasGrade = subject.currentScore != null;
                    return (
                      <div key={subject.name} className="space-y-1.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="font-body font-medium text-sm text-foreground truncate">{subject.name}</span>
                          <div className="flex items-center gap-3 flex-shrink-0">
                            {subject.totalCount > 0 && (
                              <span className="text-xs text-muted-foreground font-body">
                                {subject.doneCount}/{subject.totalCount} done
                              </span>
                            )}
                            {hasGrade ? (
                              <span className={`font-display font-bold text-sm ${gradeColor(subject.currentScore!)}`}>
                                {subject.displayLetter} · {subject.currentScore!.toFixed(0)}%
                              </span>
                            ) : (
                              <span className="text-xs text-muted-foreground/60 font-body italic">N/A</span>
                            )}
                          </div>
                        </div>
                        {/* Grade bar — color matches grade, empty/grey when no grade */}
                        <div className="h-2 w-full bg-muted rounded-full overflow-hidden">
                          {hasGrade && (
                            <div
                              className="h-full rounded-full transition-all duration-500"
                              style={{
                                width: `${Math.min(subject.currentScore!, 100)}%`,
                                backgroundColor: gradeBarColor(subject.currentScore!),
                              }}
                            />
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Grade Trend Chart */}
        {stats.trendData.length >= 2 && (
          <motion.div variants={itemVariants}>
            <Card className="border-border/50">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 mb-5">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  <h3 className="font-display font-bold text-foreground">Grade Trend Over Time</h3>
                </div>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={stats.trendData} margin={{ top: 5, right: 10, left: -10, bottom: 5 }}>
                      <defs>
                        <linearGradient id="scoreGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="cumulativeGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="hsl(var(--col-done))" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="hsl(var(--col-done))" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis
                        dataKey="date"
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        domain={[0, 100]}
                        tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(v: number) => `${v}%`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '0.75rem',
                          fontSize: 12,
                          color: 'hsl(var(--foreground))',
                        }}
                        formatter={(value: number, name: string) => [
                          `${value}%`,
                          name === 'score' ? 'This Assignment' : 'Running Average',
                        ]}
                        labelFormatter={(label: string) => `Due: ${label}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="score"
                        stroke="hsl(var(--primary))"
                        strokeWidth={2}
                        fill="url(#scoreGradient)"
                        dot={{ r: 3, fill: 'hsl(var(--primary))' }}
                        activeDot={{ r: 5 }}
                      />
                      <Area
                        type="monotone"
                        dataKey="cumulative"
                        stroke="hsl(var(--col-done))"
                        strokeWidth={2}
                        strokeDasharray="5 5"
                        fill="url(#cumulativeGradient)"
                        dot={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center justify-center gap-6 mt-3">
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-primary rounded-full" />
                    <span className="text-xs text-muted-foreground font-body">Per Assignment</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-3 h-0.5 bg-[hsl(var(--col-done))] rounded-full border-dashed" />
                    <span className="text-xs text-muted-foreground font-body">Running Average</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {/* Footer encouragement */}
        <motion.div variants={itemVariants} className="text-center py-4">
          <p className="text-muted-foreground/60 font-body text-xs">
            Remember: grades don't define you, but effort does. Keep showing up! 💛
          </p>
        </motion.div>
      </motion.div>
    </div>
  );
}
