const CANVAS_API_TOKEN = process.env.CANVAS_API_TOKEN;
const CANVAS_BASE_URL = 'https://acps.instructure.com';

async function test() {
    const headers = { Authorization: `Bearer ${CANVAS_API_TOKEN}`, Accept: 'application/json' };

    // 1. Get self observees
    console.log("Fetching observees...");
    let res = await fetch(`${CANVAS_BASE_URL}/api/v1/users/self/observees`, { headers });
    const observeesText = await res.text();

    if (!res.ok) {
        console.log("Observees failed:", observeesText);
        return;
    }
    const observees = JSON.parse(observeesText);
    const benji = observees[0];
    console.log("Benji:", benji.name);

    // 2. Get courses
    console.log("Fetching courses...");
    res = await fetch(`${CANVAS_BASE_URL}/api/v1/users/${benji.id}/courses?enrollment_state=active&include[]=term`, { headers });
    if (!res.ok) {
        console.log("Courses failed:", await res.text());
        return;
    }

    const courses = await res.json();
    const course = courses[0];

    console.log("Course Name:", course?.name);
    console.log("Course Term:", JSON.stringify(course?.term, null, 2));

    // 3. Let's also check all terms in the account if possible
    console.log("Fetching account terms...");
    res = await fetch(`${CANVAS_BASE_URL}/api/v1/accounts/self/terms`, { headers });
    if (res.ok) {
        const terms = await res.json();
        console.log("Account Terms:", JSON.stringify(terms, null, 2));
    } else {
        console.log("Account terms fetch failed:", res.status, await res.text());
    }
}

test();
