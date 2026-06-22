import ivm from "isolated-vm";

function truncate(str, max) {
  const s = String(str ?? "");
  if (!Number.isFinite(max) || max <= 0) return "";
  return s.length > max ? s.slice(0, max) + "\n[truncated]" : s;
}

function normalizeTestCase(t) {
  // Support a couple shapes for flexibility.
  // Preferred: { input: any, expectedOutput: string|any }
  // Also accept: { stdin: string, expected: string }
  if (t == null || typeof t !== "object") {
    return {
      input: "",
      expectedOutput: "",
      name: undefined,
      show: true,
    };
  }

  if ("input" in t) {
    return {
      name: t.name ?? undefined,
      input: t.input,
      expectedOutput: t.expectedOutput ?? t.expected ?? "",
      isHidden: Boolean(t.isHidden),
    };
  }

  if ("stdin" in t) {
    return {
      name: t.name ?? undefined,
      input: t.stdin,
      expectedOutput: t.expected ?? "",
      isHidden: Boolean(t.isHidden),
    };
  }

  return {
    name: t.name ?? undefined,
    input: t.value ?? "",
    expectedOutput: t.expectedOutput ?? t.expected ?? "",
    isHidden: Boolean(t.isHidden),
  };
}

function buildHarness({ sourceCode, showMySteps }) {
  // The harness exposes a deterministic way to run tests.
  // - If the user exports a function called `solve`, we call it.
  // - Otherwise we fall back to evaluating the code and calling global `solve`.
  // - For tests, we pass either `input` as-is, or if it's a string and solve expects stdin-like, user can parse.
  //
  // We also capture console output.

  const harness = `
'use strict';

const __captured = { logs: [], errors: [] };

const consoleProxy = {
  log: (...args) => { __captured.logs.push(args.map(String).join(' ')); },
  error: (...args) => { __captured.errors.push(args.map(String).join(' ')); },
  warn: (...args) => { __captured.logs.push(args.map(String).join(' ')); },
};

// Provide a minimal console.
const sandboxGlobal = {
  console: consoleProxy,
};

// Evaluate user code in the VM.
${sourceCode}

// Resolve solve function.
let __solve = null;
if (typeof solve === 'function') __solve = solve;
else if (typeof globalThis !== 'undefined' && typeof globalThis.solve === 'function') __solve = globalThis.solve;
else if (typeof module !== 'undefined' && module && typeof module.exports === 'object' && typeof module.exports.solve === 'function') {
  __solve = module.exports.solve;
}

function runOne(input) {
  if (!__solve) {
    throw new Error('No solve function found. Expected a function named solve(input).');
  }
  return __solve(input);
}

module.exports = { runOne, __captured };

//# sourceURL=user_code.js
`;

  // Note: vm context will provide module.exports.
  return harness;
}

export async function runUserCode({
  language,
  sourceCode,
  tests,
  timeoutMs = 1000,
  maxOutputChars = 20000,
  showMySteps = false,
}) {
  if (language && language !== "javascript") {
    return {
      ok: false,
      error: `Unsupported language for MVP sandbox: ${language}`,
    };
  }

  const normalizedTests = Array.isArray(tests) ? tests.map(normalizeTestCase) : [];

  const stdoutAll = [];
  const stderrAll = [];

  const results = [];

  const outputBuffer = { logs: [], errors: [] };

  let isolate;
  try {
    isolate = new ivm.Isolate({ memoryLimit: 128 });
    const context = isolate.createContextSync();
    const jail = context.global;

    jail.setSync('global', jail.derefInto());

    jail.setSync('_consoleLog', new ivm.Reference((...args) => {
      outputBuffer.logs.push(args.map(String).join(" "));
    }));
    jail.setSync('_consoleError', new ivm.Reference((...args) => {
      outputBuffer.errors.push(args.map(String).join(" "));
    }));

    isolate.compileScriptSync(`
      global.console = {
        log: (...args) => _consoleLog.applyIgnored(null, args),
        warn: (...args) => _consoleLog.applyIgnored(null, args),
        error: (...args) => _consoleError.applyIgnored(null, args)
      };
      global.module = { exports: {} };
      global.globalThis = global;
    `).runSync(context);

    const harness = buildHarness({ sourceCode, showMySteps });

    let compiled;
    try {
      compiled = isolate.compileScriptSync(harness, { filename: "user_harness.js" });
    } catch (e) {
      return {
        ok: false,
        error: "Failed to compile user code",
        runtimeError: {
          message: e?.message || String(e),
          stack: e?.stack || null,
        },
      };
    }

    // Execute user code once to define solve/runOne.
    try {
      compiled.runSync(context, { timeout: timeoutMs });
    } catch (e) {
      return {
        ok: false,
        error: "Runtime error while loading user code",
        runtimeError: {
          message: e?.message || String(e),
          stack: e?.stack || null,
        },
        transcript: {
          stdout: truncate(outputBuffer.logs.join("\\n"), maxOutputChars),
          stderr: truncate(outputBuffer.errors.join("\\n"), maxOutputChars),
          showMySteps,
        },
      };
    }

    // Execute each test.
    for (let i = 0; i < normalizedTests.length; i++) {
      const t = normalizedTests[i];

      const start = Date.now();

      let actual;
      let runtimeError = null;
      let timedOut = false;

      // Run each test with timeout.
      try {
        actual = isolate.compileScriptSync(
          \`runOne(\${JSON.stringify(t.input)})\`
        ).runSync(context, { timeout: timeoutMs, copy: true });
      } catch (e) {
        // isolate timeout has a generic error message; best-effort detect.
        const msg = e?.message || String(e);
        if (/Script execution timed out|timed out/i.test(msg)) {
          timedOut = true;
        }
        runtimeError = {
          message: msg,
          stack: e?.stack || null,
        };
      }

      const stdout = truncate(outputBuffer.logs.join("\\n"), maxOutputChars);
      const stderr = truncate(outputBuffer.errors.join("\\n"), maxOutputChars);

      // Only keep per-test delta-ish output in MVP: for now, same captured stream.
      stdoutAll.push(stdout);
      stderrAll.push(stderr);

      const expected = t.expectedOutput;

      // Compare as strings if expected is a string; otherwise strict equality.
      let passed = false;
      if (timedOut || runtimeError) {
        passed = false;
      } else {
        if (typeof expected === "string") {
          passed = String(actual) === String(expected);
        } else {
          passed = actual === expected;
        }
      }

      const durationMs = Date.now() - start;

      results.push({
        testName: t.name ?? \`test_\${i + 1}\`,
        input: t.input,
        expectedOutput: expected,
        actualOutput: timedOut ? null : actual,
        passed,
        durationMs,
        timedOut,
        runtimeError,
        transcript: showMySteps
          ? {
              stdout,
              stderr,
            }
          : undefined,
      });
    }

    return {
      ok: true,
      results,
      runtimeMeta: {
        timeoutMs,
        maxOutputChars,
        showMySteps,
      },
    };
  } finally {
    if (isolate) {
      isolate.dispose();
    }
  }
}

