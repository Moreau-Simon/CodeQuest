/** Harnais exécuté dans le conteneur : importe la solution et compte les tests. */
export function pythonHarness(): string {
  return `import json, sys, traceback
sys.path.insert(0, "/work")
try:
    from main import solve
except Exception as exc:
    print("__CODEQUEST_RESULT__" + json.dumps({"status": "error", "reason": str(exc)}))
    raise SystemExit(0)
cases = json.load(open("/work/tests.json", encoding="utf-8"))
passed = 0
failure = None
for index, case in enumerate(cases):
    try:
        result = solve(case.get("input"))
        if result == case.get("expected"):
            passed += 1
        elif failure is None:
            failure = "Cas %d : sortie incorrecte" % (index + 1)
    except Exception as exc:
        if failure is None:
            failure = "Cas %d : %s" % (index + 1, type(exc).__name__)
print("__CODEQUEST_RESULT__" + json.dumps({
    "status": "passed" if passed == len(cases) else "failed",
    "passed": passed,
    "total": len(cases),
    "reason": failure
}))
`;
}

export function javascriptHarness(): string {
  return `"use strict";
const fs = require("node:fs");
let solve;
try {
  const user = require("/work/main.js");
  solve = user.solve ?? user.default ?? globalThis.solve;
} catch (error) {
  console.log("__CODEQUEST_RESULT__" + JSON.stringify({ status: "error", reason: String(error) }));
  process.exit(0);
}
const cases = JSON.parse(fs.readFileSync("/work/tests.json", "utf8"));
let passed = 0;
let failure = null;
for (let index = 0; index < cases.length; index += 1) {
  try {
    const result = solve(cases[index].input);
    if (JSON.stringify(result) === JSON.stringify(cases[index].expected)) passed += 1;
    else if (failure === null) failure = "Cas " + (index + 1) + " : sortie incorrecte";
  } catch (error) {
    if (failure === null) failure = "Cas " + (index + 1) + " : " + (error && error.name);
  }
}
console.log("__CODEQUEST_RESULT__" + JSON.stringify({
  status: passed === cases.length ? "passed" : "failed",
  passed,
  total: cases.length,
  reason: failure
}));
`;
}

export interface HarnessResult {
  status: 'passed' | 'failed' | 'error';
  passed?: number;
  total?: number;
  reason?: string | null;
}

/** Extrait la dernière ligne de verdict émise par le harnais. */
export function parseHarnessOutput(stdout: string): HarnessResult | null {
  const marker = '__CODEQUEST_RESULT__';
  const line = stdout
    .split(/\r?\n/)
    .reverse()
    .find((entry) => entry.startsWith(marker));
  if (!line) return null;
  try {
    return JSON.parse(line.slice(marker.length)) as HarnessResult;
  } catch {
    return null;
  }
}
