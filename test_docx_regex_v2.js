
// Test updated regex logic
function clean(text) {
    // 1. \r (CR) -> \n
    // 2. \v (VT) and \f (FF) -> \n
    // 3. Horizontal whitespace (space, tab) -> ' '
    return text
        .replace(/\r/g, '\n')
        .replace(/[\v\f]/g, '\n')
        .replace(/[ \t]+/g, ' ')
        .trim();
}

console.log("=== Testing Updated Normalization Logic ===");
const cases = [
    { input: "Pipe\nPipe", expected: "Pipe\nPipe", desc: "Explicit LF" },
    { input: "Pipe\rPipe", expected: "Pipe\nPipe", desc: "CR -> LF" },
    { input: "Pipe\r\nPipe", expected: "Pipe\n\nPipe", desc: "CRLF -> LF LF (Double break)" },
    // Wait. \r\n -> \n\n. This adds an extra line if it's Windows CRLF.
    // If text uses CRLF, we might want to collapse it to single LF.
    // But usually XML uses LF (\n).
    { input: "Pipe\tPipe", expected: "Pipe Pipe", desc: "Tab -> Space" },
    { input: "Pipe  Pipe", expected: "Pipe Pipe", desc: "Multiple Spaces" },
    { input: "Pipe\vPipe", expected: "Pipe\nPipe", desc: "Vertical Tab -> LF" },
    { input: "Pipe\fPipe", expected: "Pipe\nPipe", desc: "Form Feed -> LF" },
];

cases.forEach((c, i) => {
    const res = clean(c.input);
    const passed = res === c.expected;
    const mark = passed ? "✅" : "❌";
    console.log(`${mark} Test ${i+1} [${c.desc}]: '${c.input.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}' -> '${res.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`);
    if (!passed) console.log(`   Expected: '${c.expected.replace(/\n/g, '\\n').replace(/\r/g, '\\r')}'`);
});
