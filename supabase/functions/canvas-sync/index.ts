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

    // If we have observees, iter over them. Otherwise, run once as the primary user.
    const usersToFetch = observees.length > 0 ? observees : [{ id: null, name: "Student" }];

    for (const user of usersToFetch) {
      const studentId = user.id;
      const studentName = user.name;

      console.log(`Fetching courses for student: ${studentName}`);

      // Fetch active courses
      const coursesUrl = studentId
        ? `${CANVAS_BASE_URL}/api/v1/users/${studentId}/courses?enrollment_state=active&per_page=50&include[]=total_scores`
        : `${CANVAS_BASE_URL}/api/v1/courses?enrollment_state=active&per_page=50`;

      const coursesRes = await fetch(coursesUrl, { headers });

      if (!coursesRes.ok) {
        const text = await coursesRes.text();
        console.error(`Canvas courses error for ${studentName}:`, coursesRes.status, text);
        continue; // Skip to next user
      }

      const courses: CanvasCourse[] = await coursesRes.json();
      console.log(`Found ${courses.length} courses for ${studentName}`);

      // NEW: Dynamically resolve the active quarter from the school's Canvas definitions to ensure perpetual filtering.
      let activeQuarterStart: Date | null = null;
      let activeQuarterEnd: Date | null = null;
      let activeQuarterTitle: string = "Unknown Quarter";

      if (courses.length > 0) {
        try {
          const firstCourseId = courses[0].id;
          const gpRes = await fetch(`${CANVAS_BASE_URL}/api/v1/courses/${firstCourseId}?include[]=grading_periods`, { headers });
          if (gpRes.ok) {
            const courseData = await gpRes.json();
            const gradingPeriods = courseData.grading_periods;

            if (gradingPeriods && Array.isArray(gradingPeriods) && gradingPeriods.length > 0) {
              const now = new Date();
              let targetQuarter = gradingPeriods.find(gp => {
                const s = new Date(gp.start_date);
                const e = new Date(gp.end_date);
                return now >= s && now <= e;
              });

              // If dates fall in a gap (e.g., winter break), find the closest quarter
              if (!targetQuarter) {
                targetQuarter = [...gradingPeriods].sort((a, b) => {
                  const distA = Math.min(Math.abs(now.getTime() - new Date(a.start_date).getTime()), Math.abs(now.getTime() - new Date(a.end_date).getTime()));
                  const distB = Math.min(Math.abs(now.getTime() - new Date(b.start_date).getTime()), Math.abs(now.getTime() - new Date(b.end_date).getTime()));
                  return distA - distB;
                })[0];
              }

              if (targetQuarter) {
                activeQuarterStart = new Date(targetQuarter.start_date);
                activeQuarterEnd = new Date(targetQuarter.end_date);
                activeQuarterTitle = targetQuarter.title || "Target Quarter";
                console.log(`Dynamically resolved active quarter for ${studentName}: ${activeQuarterTitle} (${activeQuarterStart.toISOString()} - ${activeQuarterEnd.toISOString()})`);
              }
            }
          }
        } catch (err) {
          console.error(`Failed to resolve grading periods for ${studentName}:`, err);
        }
      }

      await Promise.all(

        courses.map(async (course) => {
          try {
            // For observer accounts, pass student_ids[] so Canvas returns the *student's*
            // submission for each assignment (not the observer/parent's own submission).
            const studentParam = studentId ? `&student_ids[]=${studentId}` : "";
            const assignUrl = `${CANVAS_BASE_URL}/api/v1/courses/${course.id}/assignments?per_page=100&include[]=submission${studentParam}&order_by=due_at`;
            const assignRes = await fetch(assignUrl, { headers });

            if (!assignRes.ok) {
              const text = await assignRes.text();
              console.error(`Assignments error for "${course.name}" (${course.id}):`, assignRes.status, text);
              return;
            }

            const assignments: CanvasAssignment[] = await assignRes.json();

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
                const hasScore = a.submission.score != null;

                if (hasScore) {
                  status = "done";
                  grade = a.submission.grade || undefined;
                  score = a.submission.score!;
                } else if (ws === "graded") {
                  status = "done";
                  grade = a.submission.grade || undefined;
                } else if (ws === "submitted" || ws === "pending_review") {
                  status = "done";
                } else if (a.has_submitted_submissions) {
                  status = "done";
                }
              }

              const subject = course.name
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

              const firstName = studentName === "Student" ? undefined : studentName.split(' ')[0];

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
      JSON.stringify({ assignments: allAssignments }),
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
