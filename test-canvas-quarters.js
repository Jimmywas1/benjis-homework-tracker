const CANVAS_API_TOKEN = process.env.CANVAS_API_TOKEN;
const CANVAS_BASE_URL = 'https://acps.instructure.com';

async function test() {
    const headers = { Authorization: `Bearer ${CANVAS_API_TOKEN}`, Accept: 'application/json' };

    // 1. Get self observees
    let res = await fetch(`${CANVAS_BASE_URL}/api/v1/users/self/observees`, { headers });
    if (!res.ok) { console.error("observees failed", await res.text()); return; }
    const observees = await res.json();
    const benji = observees[0];

    // 2. Get courses with grading_periods included
    res = await fetch(`${CANVAS_BASE_URL}/api/v1/users/${benji.id}/courses?enrollment_state=active`, { headers });
    if (!res.ok) { console.error("courses failed", await res.text()); return; }

    const courses = await res.json();
    const course = courses[0];

    console.log("Course Name:", course?.name);

    // 3. Fetch the specific course with grading periods included
    let url = `${CANVAS_BASE_URL}/api/v1/courses/${course.id}`;
    // Sometimes it's the `courses` endpoint with `include[]=grading_periods`
    // Sometimes it's just the `/grading_periods` endpoint
    res = await fetch(`${url}?include[]=grading_periods`, { headers });
    if (res.ok) {
        const courseData = await res.json();
        console.log("Course Grading Periods (from include):", JSON.stringify(courseData.grading_periods, null, 2));
    } else {
        console.log("Course fetch failed:", res.status);
    }

    // 4. Hit grading periods directly for the course
    const gpRes = await fetch(`${url}/grading_periods`, { headers });
    console.log("\nDirect Grading Periods API Status:", gpRes.status);
    if (gpRes.ok) {
        const gpData = await gpRes.json();
        console.log("Direct Grading Periods Data:", JSON.stringify(gpData, null, 2));
    } else {
        console.log("Direct Grading Periods Error:", await gpRes.text());
    }
}

test();
