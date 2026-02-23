import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface CanvasAssignment {
  id: number;
  name: string;
  due_at: string | null;
  lock_at: string | null;
  course_id: number;
  has_submitted_submissions: boolean;
  points_possible: number | null;
  submission?: {
    workflow_state: string;
    grade: string | null;
    score: number | null;
  };
}

interface CanvasCourse {
  id: number;
  name: string;
  course_code: string;
  enrollments?: Array<{
    type: string;
    computed_current_score?: number;
    computed_current_grade?: string;
  }>;
  grading_periods?: Array<{
    id: number;
    title: string;
    start_date: string;
    end_date: string;
  }>;
}

function cleanSubjectName(courseName: string): string {
  return courseName
    .replace(/\s*H\*\s*/g, " ")
    .replace(/\s*\(.*?\)\s*/g, "")
    .replace(/\s*-\s*\d{4}-\d{2,4}\s*/g, "")
    .replace(/\s*-\s*[A-Z][a-z]+(\s|$).*$/g, "")
    .replace(/^S\d+\s+/i, "")
    .replace(/Honors/gi, "Hon.")
    .replace(/Language Arts/gi, "Lang Arts")
    .replace(/Physical Science/gi, "Phys Sci")
    .replace(/Civics\/Economics/gi, "Civics/Econ")
    .replace(/Technological/gi, "Tech")
    .replace(/\s+/g, " ")
    .trim();
}

interface CanvasUser {
  id: number;
  name: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const CANVAS_API_TOKEN = Deno.env.get("CANVAS_API_TOKEN");
    if (!CANVAS_API_TOKEN) {
      throw new Error("CANVAS_API_TOKEN is not configured");
    }

    let CANVAS_BASE_URL = Deno.env.get("CANVAS_BASE_URL");
    if (!CANVAS_BASE_URL) {
      throw new Error("CANVAS_BASE_URL is not configured");
    }

    CANVAS_BASE_URL = CANVAS_BASE_URL.replace(/\/+$/, "");

    const headers = {
      Authorization: `Bearer ${CANVAS_API_TOKEN}`,
      Accept: "application/json",
    };

    // Check if this is an observer account by looking for observees
    let observees: CanvasUser[] = [];
    try {
      const selfRes = await fetch(`${CANVAS_BASE_URL}/api/v1/users/self`, { headers });
      if (selfRes.ok) {
        const self = await selfRes.json();
        console.log("Authenticated as:", self.name, `(id: ${self.id})`);
      } else {
        await selfRes.text();
      }

      const observeesRes = await fetch(
        `${CANVAS_BASE_URL}/api/v1/users/self/observees?per_page=10`,
        { headers }
      );
      if (observeesRes.ok) {
        observees = await observeesRes.json();
        if (observees.length > 0) {
          console.log(`Observer account detected. Found ${observees.length} observees.`);
        }
      } else {
        // Not an observer or endpoint not available — that's fine
        await observeesRes.text();
      }
    } catch (err) {
      console.log("Observee check skipped:", err);
    }

    const allAssignments: Array<{
      canvasId: number;
      title: string;
      subject: string;
      dueDate: string;
      status: "todo" | "progress" | "done";
      grade?: string;
      score?: number;
      totalPoints?: number;
      dueStatus: "overdue" | "upcoming" | "undated";
      canvasUrl: string;
      studentName?: string;
    }> = [];

    const allCourseGrades: Array<{
      courseId: number;
      subject: string;
      currentScore: number | null;
      finalScore: number | null;
      currentGrade: string | null;
      studentName?: string;
    }> = [];

    // If we have observees, iter over them. Otherwise, run once as the primary user.
    const usersToFetch = observees.length > 0 ? observees : [{ id: null, name: "Student" }];

    for (const user of usersToFetch) {
      const studentId = user.id;
      const studentName = user.name;

      console.log(`Fetching courses for student: ${studentName}`);

      // Fetch active courses — include total_scores so each course object
      // contains embedded enrollment data with computed grade percentages.
      const coursesUrl = studentId
        ? `${CANVAS_BASE_URL}/api/v1/users/${studentId}/courses?enrollment_state=active&per_page=50&include[]=total_scores&include[]=grading_periods`
        : `${CANVAS_BASE_URL}/api/v1/courses?enrollment_state=active&per_page=50&include[]=total_scores&include[]=grading_periods`;

      const coursesRes = await fetch(coursesUrl, { headers });

      if (!coursesRes.ok) {
        const text = await coursesRes.text();
        console.error(`Canvas courses error for ${studentName}:`, coursesRes.status, text);
        continue; // Skip to next user
      }

      const courses: CanvasCourse[] = await coursesRes.json();
      console.log(`Found ${courses.length} courses for ${studentName}`);

      const firstName = studentName === "Student" ? undefined : studentName.split(' ')[0];

      // ── Resolve active grading period first (needed for quarter-specific grades) ──
      let activeGradingPeriodId: number | null = null;
      let activeQuarterStart: Date | null = null;
      let activeQuarterEnd: Date | null = null;
      let activeQuarterTitle: string = "Unknown Quarter";

      if (courses.length > 0) {
        try {
          const gpRes = await fetch(
            `${CANVAS_BASE_URL}/api/v1/courses/${courses[0].id}?include[]=grading_periods`,
            { headers }
          );
          if (gpRes.ok) {
            const courseData = await gpRes.json();
            const gradingPeriods: any[] = courseData.grading_periods ?? [];
            if (gradingPeriods.length > 0) {
              const now = new Date();
              let targetQuarter = gradingPeriods.find(gp => {
                const s = new Date(gp.start_date);
                const e = new Date(gp.end_date);
                return now >= s && now <= e;
              });
              if (!targetQuarter) {
                targetQuarter = [...gradingPeriods].sort((a, b) => {
                  const distA = Math.min(
                    Math.abs(now.getTime() - new Date(a.start_date).getTime()),
                    Math.abs(now.getTime() - new Date(a.end_date).getTime())
                  );
                  const distB = Math.min(
                    Math.abs(now.getTime() - new Date(b.start_date).getTime()),
                    Math.abs(now.getTime() - new Date(b.end_date).getTime())
                  );
                  return distA - distB;
                })[0];
              }
              if (targetQuarter) {
                activeGradingPeriodId = targetQuarter.id;
                activeQuarterStart = new Date(targetQuarter.start_date);
                activeQuarterEnd = new Date(targetQuarter.end_date);
                activeQuarterTitle = targetQuarter.title || "Target Quarter";
                console.log(`Active quarter for ${studentName}: ${activeQuarterTitle} (id=${activeGradingPeriodId})`);
              }
            }
          }
        } catch (err) {
          console.error(`Failed to resolve grading periods for ${studentName}:`, err);
        }
      }

      // ── Fetch quarter-specific enrollment grades ────────────────────────────
      const courseGradeMap = new Map<number, { currentScore: number | null; finalScore: number | null; currentGrade: string | null }>();
      if (studentId) {
        // Per-course enrollment — most reliable for observer accounts.
        // Each course resolves its OWN active grading period ID so subjects that use
        // different Canvas grading period records (same quarter, different ID) are handled correctly.
        await Promise.all(courses.map(async (course) => {
          try {
            // 1. Try grading periods already embedded by include[]=grading_periods on the courses list
            let gpList: any[] = course.grading_periods ?? [];

            // 2. If not embedded (API didn't return them), fetch for this specific course
            if (gpList.length === 0) {
              try {
                const gpCourseRes = await fetch(
                  `${CANVAS_BASE_URL}/api/v1/courses/${course.id}?include[]=grading_periods`,
                  { headers }
                );
                if (gpCourseRes.ok) {
                  gpList = (await gpCourseRes.json()).grading_periods ?? [];
                }
              } catch { /* silently fall back to global */ }
            }

            // 3. Pick the active (or closest) grading period for this course.
            // Default to NO filter (YTD grade) — only add the GP filter when we have
            // confirmed grading periods for this specific course. Using the global GP ID
            // on a course that doesn't use grading periods returns a false 0, not null.
            let courseGPParam = "";
            if (gpList.length > 0) {
              const now = new Date();
              let targetGP: any = gpList.find((gp: any) =>
                now >= new Date(gp.start_date) && now <= new Date(gp.end_date)
              );
              if (!targetGP) {
                targetGP = [...gpList].sort((a: any, b: any) => {
                  const distA = Math.min(
                    Math.abs(now.getTime() - new Date(a.start_date).getTime()),
                    Math.abs(now.getTime() - new Date(a.end_date).getTime())
                  );
                  const distB = Math.min(
                    Math.abs(now.getTime() - new Date(b.start_date).getTime()),
                    Math.abs(now.getTime() - new Date(b.end_date).getTime())
                  );
                  return distA - distB;
                })[0];
              }
              if (targetGP) {
                courseGPParam = `&grading_period_id=${targetGP.id}`;
                console.log(`Course "${cleanSubjectName(course.name)}" GP: ${targetGP.title} (id=${targetGP.id})`);
              }
            }

            const enrollRes = await fetch(
              `${CANVAS_BASE_URL}/api/v1/courses/${course.id}/enrollments?user_id=${studentId}&include[]=current_grades${courseGPParam}&per_page=5`,
              { headers }
            );
            if (enrollRes.ok) {
              const enrollments: any[] = await enrollRes.json();
              const e = enrollments[0];
              if (e) {
                let score: number | null = e.grades?.override_score ?? e.grades?.current_score ?? e.computed_current_score ?? null;
                let final: number | null = e.grades?.final_score ?? e.computed_final_score ?? null;
                const grade: string | null = e.grades?.override_grade ?? e.grades?.current_grade ?? e.computed_current_grade ?? null;

                // GP filter returned all-zero (teacher hasn't posted Q grades yet).
                // Fall back to YTD (no GP filter) to get the last meaningful grade.
                if (courseGPParam && score === 0 && final === 0 && !grade) {
                  const ytdRes = await fetch(
                    `${CANVAS_BASE_URL}/api/v1/courses/${course.id}/enrollments?user_id=${studentId}&include[]=current_grades&per_page=5`,
                    { headers }
                  );
                  if (ytdRes.ok) {
                    const ytdE = (await ytdRes.json())[0];
                    const ytdScore: number | null = ytdE?.grades?.override_score ?? ytdE?.grades?.current_score ?? ytdE?.computed_current_score ?? null;
                    if (ytdScore !== null && ytdScore > 0) {
                      score = ytdScore;
                      final = ytdE?.grades?.final_score ?? ytdE?.computed_final_score ?? null;
                      console.log(`GP=0 fallback "${cleanSubjectName(course.name)}" (${studentName}): YTD=${score}%`);
                    }
                  }
                }

                if (score !== null || grade !== null) {
                  courseGradeMap.set(course.id, { currentScore: score, finalScore: final, currentGrade: grade });
                  console.log(`Grade "${cleanSubjectName(course.name)}" (${studentName}): current=${score}% final=${final}%`);
                }
              }
            }
          } catch (err) {
            console.error(`Grade fetch error course ${course.id}:`, err);
          }
        }));

        // User-level fallback for any courses still missing
        if (courseGradeMap.size < courses.length) {
          try {
            const enrollRes = await fetch(
              `${CANVAS_BASE_URL}/api/v1/users/${studentId}/enrollments?include[]=current_grades&state[]=active&per_page=100`,
              { headers }
            );
            if (enrollRes.ok) {
              const enrollments: any[] = await enrollRes.json();
              for (const e of enrollments) {
                if (!courseGradeMap.has(e.course_id)) {
                  const score: number | null = e.grades?.override_score ?? e.grades?.current_score ?? e.computed_current_score ?? null;
                  const final: number | null = e.grades?.final_score ?? e.computed_final_score ?? null;
                  const grade: string | null = e.grades?.override_grade ?? e.grades?.current_grade ?? e.computed_current_grade ?? null;
                  if (score !== null || grade !== null) {
                    courseGradeMap.set(e.course_id, { currentScore: score, finalScore: final, currentGrade: grade });
                    const name = courses.find(c => c.id === e.course_id)?.name ?? String(e.course_id);
                    console.log(`Grade fallback "${cleanSubjectName(name)}" (${studentName}): current=${score}% final=${final}%`);
                  }
                }
              }
            }
          } catch (err) {
            console.error(`User-level enrollment error for ${studentName}:`, err);
          }
        }
      } else {
        // Self (student) account: extract from embedded total_scores
        for (const course of courses) {
          const enrollments: any[] = (course as any).enrollments ?? [];
          const e = enrollments.find((e: any) => ["observer", "student", "StudentEnrollment"].includes(e.type));
          if (e) {
            const score: number | null = e.grades?.override_score ?? e.grades?.current_score ?? e.computed_current_score ?? null;
            const final: number | null = e.grades?.final_score ?? e.computed_final_score ?? null;
            const grade: string | null = e.grades?.override_grade ?? e.grades?.current_grade ?? e.computed_current_grade ?? null;
            if (score !== null || grade !== null) {
              courseGradeMap.set(course.id, { currentScore: score, finalScore: final, currentGrade: grade });
              console.log(`Grade "${cleanSubjectName(course.name)}" (${studentName}): current=${score}% final=${final}%`);
            }
          }
        }
      }

      console.log(`Grades: ${courseGradeMap.size}/${courses.length} courses (${studentName})`);

      // Populate allCourseGrades from the grade map
      for (const course of courses) {
        const grades = courseGradeMap.get(course.id);
        allCourseGrades.push({
          courseId: course.id,
          subject: cleanSubjectName(course.name),
          currentScore: grades?.currentScore ?? null,
          finalScore: grades?.finalScore ?? null,
          currentGrade: grades?.currentGrade ?? null,
          studentName: firstName,
        });
      }

      await Promise.all(

        courses.map(async (course) => {
          try {
            // Try fetching assignments 
            let assignUrl = `${CANVAS_BASE_URL}/api/v1/courses/${course.id}/assignments?per_page=100&include[]=submission&order_by=due_at`;

            let assignRes = await fetch(assignUrl, { headers });

            if (!assignRes.ok) {
              const text = await assignRes.text();
              console.error(`Assignments error for "${course.name}" (${course.id}):`, assignRes.status, text);
              return;
            }

            let assignments: CanvasAssignment[] = await assignRes.json();

            // If observer got 0 assignments, try fetching without submission include
            // and get submissions separately
            if (assignments.length === 0 && studentId) {
              console.log(`Retrying "${course.name}" for ${studentName} without submission include...`);
              assignUrl = `${CANVAS_BASE_URL}/api/v1/courses/${course.id}/assignments?per_page=100&order_by=due_at`;
              assignRes = await fetch(assignUrl, { headers });

              if (assignRes.ok) {
                assignments = await assignRes.json();
                console.log(`  Retry got ${assignments.length} assignments`);
              } else {
                await assignRes.text();
              }

              // If still empty, try the student's submissions endpoint directly
              if (assignments.length === 0) {
                console.log(`Trying submissions endpoint for student ${studentId} in course ${course.id}...`);
                const subUrl = `${CANVAS_BASE_URL}/api/v1/courses/${course.id}/students/submissions?student_ids[]=${studentId}&per_page=100&include[]=assignment`;
                const subRes = await fetch(subUrl, { headers });

                if (subRes.ok) {
                  const submissions = await subRes.json();
                  console.log(`  Submissions endpoint returned ${submissions.length} items`);

                  // Convert submissions to assignment format
                  for (const sub of submissions) {
                    if (sub.assignment) {
                      assignments.push({
                        id: sub.assignment.id,
                        name: sub.assignment.name,
                        due_at: sub.assignment.due_at,
                        lock_at: sub.assignment.lock_at ?? null,
                        course_id: course.id,
                        has_submitted_submissions: sub.workflow_state !== "unsubmitted",
                        points_possible: sub.assignment.points_possible ?? null,
                        submission: {
                          workflow_state: sub.workflow_state,
                          grade: sub.grade,
                          score: sub.score,
                        },
                      });
                    }
                  }
                } else {
                  const text = await subRes.text();
                  console.log(`  Submissions endpoint failed:`, subRes.status, text);
                }
              }
            }

            console.log(`Course "${course.name}" (${studentName}): ${assignments.length} assignments`);

            for (const a of assignments) {
              const now = new Date();

              // Resolve the effective due date: prefer lock_at (submission deadline) over due_at.
              // Skip the assignment entirely if neither exists.
              const effectiveDueAt = a.lock_at || a.due_at;
              if (!effectiveDueAt) continue; // No date → off the board

              // Skip Gimkit assignments from Chinese class — they're in-class games, not homework
              if (course.name.toLowerCase().includes("chinese") && a.name.toLowerCase().includes("gimkit")) continue;

              // Enforce perpetual Dynamic Quarter filtering (uses due_at for boundary check)
              if (activeQuarterStart && activeQuarterEnd) {
                const checkDate = new Date(a.due_at || effectiveDueAt);
                const graceStart = new Date(activeQuarterStart.getTime() - 10 * 24 * 60 * 60 * 1000);
                const graceEnd = new Date(activeQuarterEnd.getTime() + 10 * 24 * 60 * 60 * 1000);
                if (checkDate < graceStart || checkDate > graceEnd) continue;
              }

              const dueDate = new Date(effectiveDueAt);

              // Fallback: If we couldn't resolve a quarter from Canvas, filter older than 90 days.
              if (!activeQuarterStart) {
                const daysPast = (now.getTime() - dueDate.getTime()) / (1000 * 60 * 60 * 24);
                if (daysPast > 90) continue;
              }

              const dueDateStr = dueDate.toISOString().split("T")[0];
              const dueStatus: "overdue" | "upcoming" = dueDate < now ? "overdue" : "upcoming";

              let status: "todo" | "progress" | "done" = "todo";
              let grade: string | undefined;
              let score: number | undefined;
              let totalPoints: number | undefined;

              if (a.points_possible != null) {
                totalPoints = a.points_possible;
              }

              if (a.submission) {
                const ws = a.submission.workflow_state;
                if (ws === "graded") {
                  status = "done";
                  grade = a.submission.grade || undefined;
                  if (a.submission.score != null) score = a.submission.score;
                } else if (ws === "submitted" || ws === "pending_review") {
                  status = "progress";
                } else if (a.has_submitted_submissions) {
                  status = "progress";
                }
              }

              const subject = cleanSubjectName(course.name);

              allAssignments.push({
                canvasId: a.id,
                title: a.name,
                subject,
                dueDate: dueDateStr,
                status,
                grade,
                score,
                totalPoints,
                dueStatus,
                canvasUrl: `${CANVAS_BASE_URL}/courses/${course.id}/assignments/${a.id}`,
                studentName: firstName,
              });
            }
          } catch (err) {
            console.error(`Error fetching assignments for course ${course.id}:`, err);
          }
        })
      );
    }

    console.log(`Total assignments collected: ${allAssignments.length}`);

    return new Response(
      JSON.stringify({ assignments: allAssignments, courseGrades: allCourseGrades }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (e) {
    console.error("canvas-sync error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
