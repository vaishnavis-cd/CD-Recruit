import { NestFactory } from "@nestjs/core";
import { AppModule } from "../src/app.module";
import { CodingService } from "../src/coding/coding.service";
import { PrismaService } from "@app/prisma/prisma.service";
import { ExecutionStatus } from "@cd-recruit/shared-types";
import * as crypto from "crypto";
import { firstValueFrom } from "rxjs";

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

async function runE2EVerification() {
  console.log("==================================================================");
  console.log("🚀 COMPREHENSIVE E2E VERIFICATION: ALL 4 LANGUAGES + SSE STREAMING");
  console.log("==================================================================");

  // 1. Bootstrap NestJS Application context
  console.log("\n[1/3] Bootstrapping NestJS application context...");
  const app = await NestFactory.createApplicationContext(AppModule, {
    logger: ["warn", "error"],
  });

  const codingService = app.get(CodingService);
  const prisma = app.get(PrismaService);

  try {
    const question = await prisma.question.findFirst({
      where: { moduleType: "CODING" as any },
    });

    if (!question) {
      throw new Error("No CODING question found in database.");
    }

    let roleTemplate = await prisma.roleTemplate.findFirst();
    if (!roleTemplate) {
      roleTemplate = await prisma.roleTemplate.create({
        data: { roleName: "Software Engineer", durationMinutes: 60, weightingPreset: {} },
      });
    }

    const testSessionId = crypto.randomUUID();
    let candidate = await prisma.candidate.findFirst();
    if (!candidate) {
      candidate = await prisma.candidate.create({
        data: { email: `e2e-${testSessionId.slice(0, 8)}@test.com`, name: "E2E Candidate" },
      });
    }

    await prisma.session.create({
      data: {
        id: testSessionId,
        candidateId: candidate.id,
        roleTemplateId: roleTemplate.id,
        cvMode: "FULL" as any,
        status: "IN_PROGRESS" as any,
      },
    });

    console.log(`✓ Candidate Session ${testSessionId} prepared.`);

    async function waitForExecution(executionId: string, maxWaitMs = 30000): Promise<any> {
      const startTime = Date.now();
      while (Date.now() - startTime < maxWaitMs) {
        const status = await codingService.getExecution(executionId);
        if (
          status.status === ExecutionStatus.COMPLETED ||
          status.status === ExecutionStatus.FAILED ||
          status.status === ExecutionStatus.RUNTIME_ERROR ||
          status.status === ExecutionStatus.COMPILATION_ERROR ||
          status.status === ExecutionStatus.TIMEOUT ||
          status.status === ExecutionStatus.MEMORY_LIMIT
        ) {
          return status;
        }
        await new Promise((r) => setTimeout(r, 400));
      }
      throw new Error(`Execution ${executionId} timed out after ${maxWaitMs}ms`);
    }

    console.log("\n[2/3] Testing All 4 Configured Languages (RUN & SUBMIT)...");
    const languages = ["python", "javascript", "java", "cpp"] as const;

    for (const lang of languages) {
      console.log(`\n──────────────────────────────────────────────────────────────────`);
      console.log(`🔹 Testing [${lang.toUpperCase()}]`);
      console.log(`──────────────────────────────────────────────────────────────────`);

      // Test 1: RUN
      const runRes = await codingService.run({
        sessionId: testSessionId,
        questionId: question.id,
        language: lang,
        sourceCode: TWO_SUM_SOLUTIONS[lang],
      });
      console.log(`  POST /coding/run dispatched: id=${runRes.executionId}`);
      const completedRun = await waitForExecution(runRes.executionId);
      console.log(`  ✓ RUN: status=${completedRun.status}, passed=${completedRun.passedTests}/${completedRun.totalTests}, time=${completedRun.executionTime}ms`);

      if (completedRun.status !== ExecutionStatus.COMPLETED || completedRun.passedTests !== completedRun.totalTests) {
        throw new Error(`RUN failed for ${lang}! Status: ${completedRun.status}, Passed: ${completedRun.passedTests}`);
      }

      // Test 2: SUBMIT
      const submitRes = await codingService.submit({
        sessionId: testSessionId,
        questionId: question.id,
        language: lang,
        sourceCode: TWO_SUM_SOLUTIONS[lang],
        timeSpentSeconds: 45,
      });
      console.log(`  POST /coding/submit dispatched: id=${submitRes.executionId}`);
      const completedSubmit = await waitForExecution(submitRes.executionId);
      console.log(`  ✓ SUBMIT: status=${completedSubmit.status}, passed=${completedSubmit.passedTests}/${completedSubmit.totalTests}, time=${completedSubmit.executionTime}ms`);

      if (completedSubmit.status !== ExecutionStatus.COMPLETED || completedSubmit.passedTests !== completedSubmit.totalTests) {
        throw new Error(`SUBMIT failed for ${lang}! Status: ${completedSubmit.status}, Passed: ${completedSubmit.passedTests}`);
      }
    }

    // 3. Test Frontend SSE Event Streaming (The exact channel candidate-web connects to)
    console.log("\n[3/3] Testing Frontend Candidate SSE Stream (GET /coding/execution/:id/events)...");
    const sseRun = await codingService.run({
      sessionId: testSessionId,
      questionId: question.id,
      language: "python",
      sourceCode: TWO_SUM_SOLUTIONS.python,
    });

    console.log(`  Dispatched execution ${sseRun.executionId}, now subscribing to SSE stream...`);
    const sseObservable = codingService.getExecutionEvents(sseRun.executionId);

    // Wait for the final completion event from the SSE observable
    const sseResult: any = await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("SSE stream timed out")), 20000);
      sseObservable.subscribe({
        next: (event: any) => {
          if (event.data?.type === "heartbeat") {
            console.log(`  [SSE] Received heartbeat signal`);
            return;
          }
          if (event.data?.status === ExecutionStatus.COMPLETED) {
            clearTimeout(timeout);
            resolve(event.data);
          }
        },
        error: (err) => {
          clearTimeout(timeout);
          reject(err);
        },
      });
    });

    console.log(`  ✓ SSE Stream delivered live completion to candidate:`);
    console.log(`     Status: ${sseResult.status}, Passed: ${sseResult.passedTests}/${sseResult.totalTests}`);

    console.log("\n==================================================================");
    console.log("✅ ALL 4 RUNTIMES (Python, JS, Java, C++) & FRONTEND SSE VERIFIED!");
    console.log("==================================================================");
  } finally {
    await app.close();
  }
}

runE2EVerification()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error("❌ E2E VERIFICATION FAILED:", err);
    process.exit(1);
  });
