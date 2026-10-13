/**
 * Replay Parity Harness for Piston Migration (Phase 5)
 *
 * Verifies 100% execution parity against question bank fixtures in backend/prisma/data/coding.json:
 * 1. Solves Question 1 (Two Sum) across Python, JavaScript, Java, and C++ against all test cases.
 * 2. Injects deliberate failures (Wrong Answer, Syntax Error, Timeout, Memory Limit) and asserts exact status codes.
 *
 * Usage:
 *   npx ts-node scripts/replay-parity.ts
 */

import * as fs from "fs";
import * as path from "path";
import { PistonClient } from "../src/integrations/piston/piston.client";
import { mapPistonResponseToCaseResult } from "../src/integrations/piston/piston-verdict-mapper";
import { resolvePistonLanguage } from "../src/integrations/piston/piston-language.util";
import { resolveJavaFileName } from "../src/common/utils/java-resolver.util";
import { getQuestionTestCases } from "../src/common/utils/test-case-parser.util";
import { ExecutionStatus } from "@cd-recruit/shared-types";

// Two Sum working solutions across runtimes
const TWO_SUM_SOLUTIONS: Record<string, string> = {
  python: `import sys, json
for line in sys.stdin:
    if not line.strip(): continue
    parts = line.strip().split('],')
    nums = json.loads(parts[0] + ']')
    target = int(parts[1].strip())
    seen = {}
    ans = []
    for i, n in enumerate(nums):
        diff = target - n
        if diff in seen:
            ans = [seen[diff], i]
            break
        seen[n] = i
    print(json.dumps(ans))
`,
  javascript: `const fs = require('fs');
const input = fs.readFileSync(0, 'utf-8').trim();
if (input) {
  const lines = input.split('\\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const parts = line.trim().split('],');
    const nums = JSON.parse(parts[0] + ']');
    const target = parseInt(parts[1].trim(), 10);
    const seen = new Map();
    let ans = [];
    for (let i = 0; i < nums.length; i++) {
      const diff = target - nums[i];
      if (seen.has(diff)) {
        ans = [seen.get(diff), i];
        break;
      }
      seen.set(nums[i], i);
    }
    console.log(JSON.stringify(ans));
  }
}
`,
  java: `import java.util.*;
import java.io.*;

public class Main {
    public static void main(String[] args) throws Exception {
        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));
        String line;
        while ((line = br.readLine()) != null) {
            if (line.trim().isEmpty()) continue;
            String[] parts = line.trim().split("\\\\],");
            String numsStr = parts[0].replace("[", "").replace("]", "").trim();
            String[] numsArr = numsStr.isEmpty() ? new String[0] : numsStr.split(",");
            int[] nums = new int[numsArr.length];
            for (int i = 0; i < numsArr.length; i++) {
                nums[i] = Integer.parseInt(numsArr[i].trim());
            }
            int target = Integer.parseInt(parts[1].trim());
            Map<Integer, Integer> seen = new HashMap<>();
            int[] ans = new int[0];
            for (int i = 0; i < nums.length; i++) {
                int diff = target - nums[i];
                if (seen.containsKey(diff)) {
                    ans = new int[]{seen.get(diff), i};
                    break;
                }
                seen.put(nums[i], i);
            }
            if (ans.length == 2) {
                System.out.println("[" + ans[0] + ", " + ans[1] + "]");
            } else {
                System.out.println("[]");
            }
        }
    }
}
`,
  cpp: `#include <iostream>
#include <string>
#include <vector>
#include <sstream>
#include <unordered_map>
using namespace std;

int main() {
    string line;
    while (getline(cin, line)) {
        if (line.empty()) continue;
        size_t pos = line.find("],");
        string numsStr = line.substr(1, pos - 1);
        string targetStr = line.substr(pos + 2);
        vector<int> nums;
        stringstream ss(numsStr);
        string num;
        while (getline(ss, num, ',')) {
            if (!num.empty()) nums.push_back(stoi(num));
        }
        int target = stoi(targetStr);
        unordered_map<int, int> seen;
        int a1 = -1, a2 = -1;
        for (int i = 0; i < nums.size(); i++) {
            int diff = target - nums[i];
            if (seen.count(diff)) {
                a1 = seen[diff];
                a2 = i;
                break;
            }
            seen[nums[i]] = i;
        }
        if (a1 != -1) {
            cout << "[" << a1 << ", " << a2 << "]" << endl;
        } else {
            cout << "[]" << endl;
        }
    }
    return 0;
}
`,
};

interface TestReport {
  name: string;
  status: "PASSED" | "FAILED" | "SKIPPED";
  details: string;
}

export async function runReplayParitySuite(): Promise<{ allPassed: boolean; reports: TestReport[] }> {
  console.log("================================================================================");
  console.log("  CD-Recruit: Piston Parity Replay Harness (Phase 5)");
  console.log("================================================================================\n");

  const client = new PistonClient();
  const reports: TestReport[] = [];

  // Check Piston connectivity
  const isHealthy = await client.checkHealth();
  if (!isHealthy) {
    console.warn("⚠️  Piston sandbox container is offline at http://127.0.0.1:2000.");
    console.warn("   Start Docker Desktop and run: docker compose -f docker/docker-compose.piston.yml up -d\n");
    return {
      allPassed: false,
      reports: [
        {
          name: "Health Check",
          status: "FAILED",
          details: "Piston container unreachable at http://127.0.0.1:2000",
        },
      ],
    };
  }

  console.log("✅ Piston sandbox connection established.\n");

  // Load questions
  const questionsPath = path.resolve(__dirname, "../../prisma/data/coding.json");
  const rawQuestions = JSON.parse(fs.readFileSync(questionsPath, "utf-8"));
  const twoSumQuestion = rawQuestions[0];
  const testCases = getQuestionTestCases(twoSumQuestion.content, "submit");

  console.log(`[Suite 1] Testing Two Sum across all 4 runtimes (${testCases.length} test cases)...`);

  for (const [lang, code] of Object.entries(TWO_SUM_SOLUTIONS)) {
    const target = resolvePistonLanguage(lang);
    let fileName = target.defaultFileName;
    let src = code;
    if (target.language === "java") {
      const resolved = resolveJavaFileName(code);
      fileName = resolved.fileName;
      src = resolved.sanitizedCode;
    }

    let allCasesPassed = true;
    let failedReason = "";

    for (let i = 0; i < testCases.length; i++) {
      const tc = testCases[i];
      const start = Date.now();
      const res = await client.execute(
        target.language,
        target.version,
        [{ name: fileName, content: src }],
        { stdin: tc.input, run_timeout: 5000 },
      );
      const elapsed = Date.now() - start;

      const verdict = mapPistonResponseToCaseResult(
        i,
        res,
        tc.expectedOutput,
        tc.input,
        tc.label,
        tc.isHidden,
        elapsed,
      );

      if (!verdict.passed) {
        allCasesPassed = false;
        failedReason = `Case ${i} failed. Expected: '${tc.expectedOutput}', Got: '${verdict.stdout}'. Stderr: '${verdict.stderr}'`;
        break;
      }
    }

    if (allCasesPassed) {
      console.log(`  ✅ ${lang.toUpperCase().padEnd(12)} -> All ${testCases.length} cases PASSED`);
      reports.push({
        name: `Two Sum (${lang})`,
        status: "PASSED",
        details: `${testCases.length}/${testCases.length} test cases passed`,
      });
    } else {
      console.error(`  ❌ ${lang.toUpperCase().padEnd(12)} -> ${failedReason}`);
      reports.push({
        name: `Two Sum (${lang})`,
        status: "FAILED",
        details: failedReason,
      });
    }
  }

  console.log("\n[Suite 2] Testing Deliberate Edge Cases & Failure Injection...");

  // Scenario 2A: Deliberate Wrong Answer
  const wrongRes = await client.execute(
    "python",
    "3.10.0",
    [{ name: "main.py", content: "print('[99, 99]')" }],
    { stdin: testCases[0].input, run_timeout: 5000 },
  );
  const wrongVerdict = mapPistonResponseToCaseResult(0, wrongRes, testCases[0].expectedOutput, testCases[0].input, "TC", false, 50);
  const wrongPassed = !wrongVerdict.passed && wrongVerdict.status === ExecutionStatus.COMPLETED;
  console.log(`  ${wrongPassed ? "✅" : "❌"} Wrong Answer Detection: status=${wrongVerdict.status}, passed=${wrongVerdict.passed}`);
  reports.push({
    name: "Wrong Answer",
    status: wrongPassed ? "PASSED" : "FAILED",
    details: `status=${wrongVerdict.status}, passed=${wrongVerdict.passed}`,
  });

  // Scenario 2B: Deliberate Syntax Error
  const syntaxRes = await client.execute(
    "c++",
    "10.2.0",
    [{ name: "main.cpp", content: "int main() { broken syntax; }" }],
    { stdin: "", compile_timeout: 5000 },
  );
  const syntaxVerdict = mapPistonResponseToCaseResult(0, syntaxRes, "", "", "TC", false, 50);
  const syntaxPassed = syntaxVerdict.status === ExecutionStatus.COMPILATION_ERROR;
  console.log(`  ${syntaxPassed ? "✅" : "❌"} Compilation Error Detection: status=${syntaxVerdict.status}`);
  reports.push({
    name: "Compilation Error",
    status: syntaxPassed ? "PASSED" : "FAILED",
    details: `status=${syntaxVerdict.status}`,
  });

  // Scenario 2C: Deliberate Infinite Loop (Timeout)
  const timeoutRes = await client.execute(
    "python",
    "3.10.0",
    [{ name: "main.py", content: "while True: pass" }],
    { stdin: "", run_timeout: 1000 },
  );
  const timeoutVerdict = mapPistonResponseToCaseResult(0, timeoutRes, "", "", "TC", false, 1100);
  const timeoutPassed = timeoutVerdict.status === ExecutionStatus.TIMEOUT;
  console.log(`  ${timeoutPassed ? "✅" : "❌"} Timeout (TO) Detection: status=${timeoutVerdict.status}`);
  reports.push({
    name: "Timeout (TO)",
    status: timeoutPassed ? "PASSED" : "FAILED",
    details: `status=${timeoutVerdict.status}`,
  });

  // Scenario 2D: Deliberate Memory Limit Exceeded
  const oomRes = await client.execute(
    "python",
    "3.10.0",
    [{ name: "main.py", content: "x = bytearray(150 * 1024 * 1024)" }],
    { stdin: "", run_memory_limit: 67108864 },
  );
  const oomVerdict = mapPistonResponseToCaseResult(0, oomRes, "", "", "TC", false, 100, 67108864);
  const oomPassed = oomVerdict.status === ExecutionStatus.MEMORY_LIMIT;
  console.log(`  ${oomPassed ? "✅" : "❌"} Memory Limit Detection: status=${oomVerdict.status}`);
  reports.push({
    name: "Memory Limit",
    status: oomPassed ? "PASSED" : "FAILED",
    details: `status=${oomVerdict.status}`,
  });

  const allPassed = reports.every((r) => r.status === "PASSED");
  console.log("\n================================================================================");
  console.log(`  Parity Replay Result: ${allPassed ? "ALL 8 SCENARIOS PASSED (100% PARITY)" : "FAILURES DETECTED"}`);
  console.log("================================================================================\n");

  return { allPassed, reports };
}

if (require.main === module) {
  runReplayParitySuite()
    .then(({ allPassed }) => {
      process.exit(allPassed ? 0 : 1);
    })
    .catch((err) => {
      console.error("Fatal replay harness error:", err);
      process.exit(1);
    });
}
