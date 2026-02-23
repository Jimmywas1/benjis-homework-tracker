const termStart = new Date("2025-08-18T04:00:00Z"); // ACPS 25-26 Term
const termEnd = new Date("2026-06-20T03:59:00Z");
const now = new Date();

// Number of milliseconds per quarter
const totalDurationMs = termEnd.getTime() - termStart.getTime();
const quarterDurationMs = totalDurationMs / 4;

let currentQuarter = 1;
let currentQuarterStart = termStart;
let currentQuarterEnd = new Date(termStart.getTime() + quarterDurationMs);

for (let i = 1; i <= 4; i++) {
    const qStart = new Date(termStart.getTime() + (i - 1) * quarterDurationMs);
    let qEnd = new Date(termStart.getTime() + i * quarterDurationMs);

    if (i === 4) qEnd = termEnd; // Ensure no rounding drop-off

    if (now >= qStart && now <= qEnd) {
        currentQuarter = i;
        currentQuarterStart = qStart;
        currentQuarterEnd = qEnd;
    }
}

console.log(`Today's Date: ${now.toLocaleDateString()}`);
console.log(`Length of Quarter: Math.round(${quarterDurationMs / (1000 * 60 * 60 * 24)}) days`);
console.log(`Active Quarter: Q${currentQuarter}`);
console.log(`Q${currentQuarter} Start: ${currentQuarterStart.toLocaleDateString()}`);
console.log(`Q${currentQuarter} End: ${currentQuarterEnd.toLocaleDateString()}`);
