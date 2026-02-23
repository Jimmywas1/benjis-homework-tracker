/**
 * Diagnostic script — shows exactly what Canvas returns for grade fields
 * under the observer (parent) account, including per-course grading periods.
 *
 * Run:
 *   CANVAS_API_TOKEN=<token> node test-canvas-grades.js
 *
 * The token is stored in Supabase secrets; grab it from:
 *   https://supabase.com/dashboard/project/xcurdnvouezaeqnzinfc/settings/vault
 */

const BASE_URL = 'https://acps.instructure.com';
const TOKEN = process.env.CANVAS_API_TOKEN;

if (!TOKEN) {
  console.error('Set CANVAS_API_TOKEN env var first.');
  process.exit(1);
}

const headers = { Authorization: `Bearer ${TOKEN}`, Accept: 'application/json' };

async function get(url) {
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`${res.status} ${url}\n${t}`);
  }
  return res.json();
}

function closestGradingPeriod(gpList) {
  const now = new Date();
  const active = gpList.find(gp =>
    now >= new Date(gp.start_date) && now <= new Date(gp.end_date)
  );
  if (active) return active;
  return [...gpList].sort((a, b) => {
    const distA = Math.min(
      Math.abs(now - new Date(a.start_date)),
      Math.abs(now - new Date(a.end_date))
    );
    const distB = Math.min(
      Math.abs(now - new Date(b.start_date)),
      Math.abs(now - new Date(b.end_date))
    );
    return distA - distB;
  })[0];
}

async function main() {
  // 1. Who are we?
  const self = await get(`${BASE_URL}/api/v1/users/self`);
  console.log(`\nAuthenticated as: ${self.name} (id ${self.id})\n`);

  // 2. Observees
  const observees = await get(`${BASE_URL}/api/v1/users/self/observees?per_page=10`);
  console.log(`Observees: ${observees.map(o => `${o.name} (${o.id})`).join(', ')}\n`);

  for (const student of observees) {
    console.log('='.repeat(70));
    console.log(`STUDENT: ${student.name} (${student.id})`);
    console.log('='.repeat(70));

    // 3. Courses — request grading_periods embedded
    const courses = await get(
      `${BASE_URL}/api/v1/users/${student.id}/courses?enrollment_state=active&per_page=50&include[]=total_scores&include[]=grading_periods`
    );
    console.log(`\nFound ${courses.length} courses.\n`);

    // 4. Per-course grading period + grade diagnostics
    console.log('--- Per-course grading periods & grades ---\n');
    for (const c of courses) {
      let gpList = c.grading_periods ?? [];

      // If not embedded, fetch separately
      if (gpList.length === 0) {
        try {
          const courseData = await get(`${BASE_URL}/api/v1/courses/${c.id}?include[]=grading_periods`);
          gpList = courseData.grading_periods ?? [];
        } catch (err) {
          gpList = [];
        }
      }

      const activeGP = gpList.length > 0 ? closestGradingPeriod(gpList) : null;
      const gpIds = gpList.map(gp => `${gp.title}(id=${gp.id})`).join(', ') || 'none';

      console.log(`Course: ${c.name}`);
      console.log(`  Grading periods: ${gpIds}`);
      console.log(`  Active GP: ${activeGP ? `${activeGP.title} (id=${activeGP.id})` : 'none'}`);

      // Grade WITHOUT grading_period_id (year-to-date)
      try {
        const ytdEnrollments = await get(
          `${BASE_URL}/api/v1/courses/${c.id}/enrollments?user_id=${student.id}&include[]=current_grades&per_page=5`
        );
        const e = ytdEnrollments[0];
        const score = e?.grades?.current_score ?? e?.computed_current_score ?? null;
        const grade = e?.grades?.current_grade ?? e?.computed_current_grade ?? null;
        console.log(`  Grade (no GP filter / YTD):     score=${score ?? 'null'}  grade=${grade ?? 'null'}`);
      } catch (err) {
        console.log(`  Grade (no GP filter): ERROR - ${err.message}`);
      }

      // Grade WITH grading_period_id (quarter-specific)
      if (activeGP) {
        try {
          const qEnrollments = await get(
            `${BASE_URL}/api/v1/courses/${c.id}/enrollments?user_id=${student.id}&include[]=current_grades&grading_period_id=${activeGP.id}&per_page=5`
          );
          const e = qEnrollments[0];
          const score = e?.grades?.current_score ?? e?.computed_current_score ?? null;
          const finalScore = e?.grades?.final_score ?? null;
          const grade = e?.grades?.current_grade ?? e?.computed_current_grade ?? null;
          console.log(`  Grade (GP=${activeGP.id} quarter):    current_score=${score ?? 'null'}  final_score=${finalScore ?? 'null'}  grade=${grade ?? 'null'}`);
        } catch (err) {
          console.log(`  Grade (GP filter): ERROR - ${err.message}`);
        }
      }
      console.log('');
    }

    // 5. User-level enrollments endpoint (global fallback)
    console.log('--- /enrollments endpoint (user-level, no GP filter) ---');
    try {
      const enrollments = await get(
        `${BASE_URL}/api/v1/users/${student.id}/enrollments?include[]=current_grades&state[]=active&per_page=50`
      );
      console.log(`Returned ${enrollments.length} enrollments.`);
      for (const e of enrollments) {
        const score = e.grades?.current_score ?? e.computed_current_score ?? null;
        const grade = e.grades?.current_grade ?? e.computed_current_grade ?? null;
        const courseName = courses.find(c => c.id === e.course_id)?.name ?? String(e.course_id);
        console.log(`  ${courseName.padEnd(50)} score=${score ?? 'null'}  grade=${grade ?? 'null'}`);
      }
    } catch (err) {
      console.log('Error:', err.message);
    }

    console.log('');
  }
}

main().catch(console.error);
