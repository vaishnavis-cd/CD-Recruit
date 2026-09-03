/**
 * backend/prisma/generate-drive-and-invites.ts
 *
 * Configurable script to generate a Hiring Drive, Role Template, Coding Questions
 * (with visible and hidden test cases), MCQ, SQL, and signed Candidate Invite links.
 *
 * Usage:
 *   npx tsx backend/prisma/generate-drive-and-invites.ts
 *   npx tsx backend/prisma/generate-drive-and-invites.ts --candidates=10 --start="+1h" --duration-days=3
 *   npx tsx backend/prisma/generate-drive-and-invites.ts --drive-name="Google Spring Drive" --role="Backend Engineer"
 */

import {
  PrismaClient,
  ModuleType,
  InviteStatus,
  DriveStatus,
  QuestionStatus,
  CvMode,
  OriginChannel,
} from "@prisma/client";
import jwt from "jsonwebtoken";
import * as crypto from "crypto";
import * as dotenv from "dotenv";
import * as path from "path";

// Load environment variables
dotenv.config({ path: path.join(process.cwd(), ".env") });
dotenv.config({ path: path.join(process.cwd(), "backend/.env") });
dotenv.config({ path: path.join(process.cwd(), "backend/api/.env") });

const prisma = new PrismaClient();

// ============================================================================
// 🛠️ CONFIGURATION DEFAULTS (Edit directly here or pass CLI flags)
// ============================================================================
const CONFIG = {
  // Drive Settings
  driveName: "Elite SDE Coding Assessment Drive (5:10 PM)",
  roleName: "Software Engineer (Coding Track)",
  assessmentDurationMinutes: 90, // Total candidate test time
  bufferMinutes: 10,             // Time before start candidate can enter lobby (5:00 PM)
  graceMinutes: 5,               // Disconnect recovery window

  // Date & Time Scheduling: 5:10 PM IST Today
  scheduleStartInput: "2026-09-01T17:10:00+05:30",
  driveActiveDays: 7,            // How many days the drive remains open

  // Candidates & Invites
  candidateCount: 5,             // Number of candidate invites to generate
  candidateEmailPrefix: "candidate",
  candidateDomain: "testmail.com",

  // URLs & Auth
  jwtSecret: process.env.JWT_SECRET || "dev-jwt-secret-key-12345!!!",
  frontendUrl: process.env.CANDIDATE_WEB_URL || "http://localhost:3000",
};

// ============================================================================
// 🧠 CLI ARGUMENT PARSER
// ============================================================================
function parseCliArgs() {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith("--drive-name=")) CONFIG.driveName = arg.split("=")[1];
    if (arg.startsWith("--role=")) CONFIG.roleName = arg.split("=")[1];
    if (arg.startsWith("--candidates=")) CONFIG.candidateCount = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--start=")) CONFIG.scheduleStartInput = arg.split("=")[1];
    if (arg.startsWith("--duration-days=")) CONFIG.driveActiveDays = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--test-minutes=")) CONFIG.assessmentDurationMinutes = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--buffer-mins=")) CONFIG.bufferMinutes = parseInt(arg.split("=")[1], 10);
    if (arg.startsWith("--frontend-url=")) CONFIG.frontendUrl = arg.split("=")[1];
  }
}

function parseScheduleDate(input: string): { start: Date; end: Date } {
  const now = new Date();
  let start = new Date(now);

  if (input === "now" || input === "today") {
    start = new Date(now);
  } else if (input.startsWith("+")) {
    const unit = input.slice(-1);
    const amount = parseInt(input.slice(1, -1), 10);
    if (unit === "h") start.setHours(start.getHours() + amount);
    else if (unit === "d") start.setDate(start.getDate() + amount);
    else if (unit === "m") start.setMinutes(start.getMinutes() + amount);
  } else if (!isNaN(Date.parse(input))) {
    start = new Date(input);
  }

  const end = new Date(start);
  end.setDate(end.getDate() + CONFIG.driveActiveDays);

  return { start, end };
}

// ============================================================================
// 📦 SAMPLE QUESTIONS DEFINITIONS (Rich Coding, SQL, MCQ)
// ============================================================================
const CODING_QUESTIONS = [
  {
    moduleType: ModuleType.CODING,
    role: "General",
    difficulty: "medium",
    tags: ["arrays", "two-sum", "algorithms"],
    content: {
      title: "Two Sum Problem",
      prompt:
        "Given a list of space-separated integers on standard input (stdin) followed by a target sum on the next line, print the 0-based indices of the two numbers that add up to target. If no pair exists, print -1.",
      constraints: [
        "Array length between 2 and 10^5",
        "Integers between -10^9 and 10^9",
        "Exactly one valid solution exists unless none is possible",
      ],
      starterCode: {
        python: `import sys

def two_sum(nums, target):
    # Write your solution here
    seen = {}
    for i, num in enumerate(nums):
        diff = target - num
        if diff in seen:
            return f"{seen[diff]} {i}"
        seen[num] = i
    return "-1"

lines = [line.strip() for line in sys.stdin if line.strip()]
if len(lines) >= 2:
    nums = list(map(int, lines[0].split()))
    target = int(lines[1])
    print(two_sum(nums, target))
`,
        javascript: `const fs = require('fs');

function twoSum(nums, target) {
  // Write your solution here
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    const diff = target - nums[i];
    if (seen.has(diff)) {
      return \`\${seen.get(diff)} \${i}\`;
    }
    seen.set(nums[i], i);
  }
  return "-1";
}

const input = fs.readFileSync(0, 'utf-8').trim();
if (input) {
  const lines = input.split('\\n').map(l => l.trim()).filter(Boolean);
  if (lines.length >= 2) {
    const nums = lines[0].split(/\\s+/).map(Number);
    const target = Number(lines[1]);
    console.log(twoSum(nums, target));
  }
}
`,
        cpp: `#include <iostream>
#include <vector>
#include <unordered_map>
#include <sstream>
using namespace std;

int main() {
    string line1, line2;
    if (getline(cin, line1) && getline(cin, line2)) {
        stringstream ss(line1);
        vector<int> nums;
        int val;
        while (ss >> val) nums.push_back(val);
        int target = stoi(line2);

        unordered_map<int, int> seen;
        for (int i = 0; i < nums.size(); i++) {
            int diff = target - nums[i];
            if (seen.count(diff)) {
                cout << seen[diff] << " " << i << endl;
                return 0;
            }
            seen[nums[i]] = i;
        }
        cout << "-1" << endl;
    }
    return 0;
}
`,
        java: `import java.util.*;

public class Main {
    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (!sc.hasNextLine()) return;
        String[] numStrs = sc.nextLine().trim().split("\\\\s+");
        if (!sc.hasNextInt()) return;
        int target = sc.nextInt();

        int[] nums = new int[numStrs.length];
        for (int i = 0; i < numStrs.length; i++) nums[i] = Integer.parseInt(numStrs[i]);

        Map<Integer, Integer> seen = new HashMap<>();
        for (int i = 0; i < nums.length; i++) {
            int diff = target - nums[i];
            if (seen.containsKey(diff)) {
                System.out.println(seen.get(diff) + " " + i);
                return;
            }
            seen.put(nums[i], i);
        }
        System.out.println("-1");
    }
}
`,
      },
      visibleTestCases: [
        {
          input: "2 7 11 15\n9",
          expectedOutput: "0 1",
          label: "Basic Pair",
          isHidden: false,
        },
        {
          input: "3 2 4\n6",
          expectedOutput: "1 2",
          label: "Non-Zero Index Pair",
          isHidden: false,
        },
      ],
      hiddenTestCases: [
        {
          input: "3 3\n6",
          expectedOutput: "0 1",
          label: "Duplicate Elements",
          isHidden: true,
        },
        {
          input: "-1 -2 -3 -4 -5\n-8",
          expectedOutput: "2 4",
          label: "Negative Numbers",
          isHidden: true,
        },
        {
          input: "1 5 8 12 19 25 33\n45",
          expectedOutput: "3 6",
          label: "Larger Array Case",
          isHidden: true,
        },
      ],
    },
    scoringConfig: {
      maxPoints: 50,
    },
  },

  // ── Question 2: Valid Palindrome ─────────────────────────────────────────
  {
    moduleType: ModuleType.CODING,
    role: "General",
    difficulty: "easy",
    tags: ["strings", "palindrome", "two-pointers"],
    content: {
      title: "Valid Palindrome",
      prompt:
        "Given a string on standard input (stdin), print 'true' if it is a palindrome considering only alphanumeric characters and ignoring cases, otherwise print 'false'.",
      constraints: [
        "1 <= s.length <= 2 * 10^5",
        "s consists only of printable ASCII characters",
      ],
      starterCode: {
        python: `import sys
import re

def is_palindrome(s: str) -> bool:
    cleaned = re.sub(r'[^a-zA-Z0-9]', '', s).lower()
    return cleaned == cleaned[::-1]

input_data = sys.stdin.read().strip()
if input_data:
    print("true" if is_palindrome(input_data) else "false")
else:
    print("true")
`,
        javascript: `const fs = require('fs');

function isPalindrome(s) {
  const cleaned = s.replace(/[^a-zA-Z0-9]/g, '').toLowerCase();
  let left = 0, right = cleaned.length - 1;
  while (left < right) {
    if (cleaned[left] !== cleaned[right]) return false;
    left++;
    right--;
  }
  return true;
}

const input = fs.readFileSync(0, 'utf-8').trim();
console.log(isPalindrome(input) ? "true" : "false");
`,
        cpp: `#include <iostream>
#include <string>
#include <cctype>
using namespace std;

bool isPalindrome(string s) {
    int left = 0, right = s.length() - 1;
    while (left < right) {
        while (left < right && !isalnum(s[left])) left++;
        while (left < right && !isalnum(s[right])) right--;
        if (tolower(s[left]) != tolower(s[right])) return false;
        left++;
        right--;
    }
    return true;
}

int main() {
    string input;
    if (getline(cin, input)) {
        cout << (isPalindrome(input) ? "true" : "false") << endl;
    } else {
        cout << "true" << endl;
    }
    return 0;
}
`,
        java: `import java.util.Scanner;

public class Main {
    public static boolean isPalindrome(String s) {
        int left = 0, right = s.length() - 1;
        while (left < right) {
            while (left < right && !Character.isLetterOrDigit(s.charAt(left))) left++;
            while (left < right && !Character.isLetterOrDigit(s.charAt(right))) right--;
            if (Character.toLowerCase(s.charAt(left)) != Character.toLowerCase(s.charAt(right))) {
                return false;
            }
            left++;
            right--;
        }
        return true;
    }

    public static void main(String[] args) {
        Scanner sc = new Scanner(System.in);
        if (sc.hasNextLine()) {
            String s = sc.nextLine();
            System.out.println(isPalindrome(s) ? "true" : "false");
        } else {
            System.out.println("true");
        }
    }
}
`,
      },
      visibleTestCases: [
        {
          input: "A man, a plan, a canal: Panama",
          expectedOutput: "true",
          label: "Standard Palindrome Sentence",
          isHidden: false,
        },
        {
          input: "race a car",
          expectedOutput: "false",
          label: "Non-Palindrome String",
          isHidden: false,
        },
      ],
      hiddenTestCases: [
        {
          input: " ",
          expectedOutput: "true",
          label: "Empty/Whitespace String",
          isHidden: true,
        },
        {
          input: "0P",
          expectedOutput: "false",
          label: "Alphanumeric Edge Case",
          isHidden: true,
        },
        {
          input: "Madam, I'm Adam",
          expectedOutput: "true",
          label: "Punctuation Palindrome",
          isHidden: true,
        },
      ],
    },
    scoringConfig: {
      maxPoints: 50,
    },
  },
];

// ============================================================================
// 🚀 MAIN SEED / GENERATOR LOGIC
// ============================================================================
async function main() {
  parseCliArgs();
  const { start: scheduleStart, end: scheduleEnd } = parseScheduleDate(CONFIG.scheduleStartInput);

  console.log("\n=======================================================");
  console.log("🚀 CD-RECRUIT DRIVE & INVITES GENERATOR");
  console.log("=======================================================");
  console.log(`Drive Name:       ${CONFIG.driveName}`);
  console.log(`Role Template:    ${CONFIG.roleName}`);
  console.log(`Duration:         ${CONFIG.assessmentDurationMinutes} mins (Buffer: ${CONFIG.bufferMinutes}m, Grace: ${CONFIG.graceMinutes}m)`);
  console.log(`Schedule Start:   ${scheduleStart.toISOString()}`);
  console.log(`Schedule End:     ${scheduleEnd.toISOString()}`);
  console.log(`Candidates:       ${CONFIG.candidateCount}`);
  console.log("=======================================================\n");

  // 1. Staff / Recruiter
  const staff = await prisma.staff.upsert({
    where: { email: "recruiter@protora.com" },
    update: {},
    create: {
      email: "recruiter@protora.com",
      name: "Lead Assessment Recruiter",
      role: "RECRUITER",
      keycloakUserId: "recruiter-keycloak-" + Math.floor(Math.random() * 10000),
    },
  });

  // 2. RoleTemplate
  let roleTemplate = await prisma.roleTemplate.findFirst({
    where: { roleName: CONFIG.roleName },
  });

  if (!roleTemplate) {
    roleTemplate = await prisma.roleTemplate.create({
      data: {
        roleName: CONFIG.roleName,
        weightingPreset: {
          CODING: 1.0,
          MCQ: 0.0,
          SQL: 0.0,
        },
        durationMinutes: CONFIG.assessmentDurationMinutes,
      },
    });
  }

  // 3. Create or Fetch Coding Questions
  const seededQuestions = [];
  for (const q of CODING_QUESTIONS) {
    let question = await prisma.question.findFirst({
      where: {
        moduleType: q.moduleType,
        tags: { has: q.tags[0] },
      },
    });

    if (!question) {
      question = await prisma.question.create({
        data: {
          moduleType: q.moduleType,
          role: q.role,
          difficulty: q.difficulty,
          tags: q.tags,
          content: q.content,
          scoringConfig: q.scoringConfig,
          version: 1,
          status: QuestionStatus.PUBLISHED,
        },
      });
      console.log(`✔ Created Question: "${q.content.title}" (ID: ${question.id})`);
    } else {
      question = await prisma.question.update({
        where: { id: question.id },
        data: { content: q.content, scoringConfig: q.scoringConfig },
      });
      console.log(`✔ Synced Question: "${q.content.title}" (ID: ${question.id})`);
    }
    seededQuestions.push(question);
  }

  // 4. Create Drive
  const drive = await prisma.drive.create({
    data: {
      name: `${CONFIG.driveName} - ${Date.now().toString().slice(-4)}`,
      roleTemplateId: roleTemplate.id,
      moduleConfig: {
        CODING: { enabled: true, weight: 1.0 },
        MCQ: { enabled: false, weight: 0.0 },
        SQL: { enabled: false, weight: 0.0 },
        AI_PROMPTING: { enabled: false, weight: 0.0 },
        SIMULATION: { enabled: false, weight: 0.0 },
      },
      status: DriveStatus.ACTIVE,
      scheduleStart,
      scheduleEnd,
      bufferMinutes: CONFIG.bufferMinutes,
      graceMinutes: CONFIG.graceMinutes,
      createdById: staff.id,
      originChannel: OriginChannel.DIRECT,
    },
  });
  console.log(`✔ Created Drive: "${drive.name}" (ID: ${drive.id})`);

  // Link questions to Drive
  for (const q of seededQuestions) {
    await prisma.driveQuestion.create({
      data: {
        driveId: drive.id,
        questionId: q.id,
        moduleType: q.moduleType,
        questionVersionSnapshot: q.version || 1,
        pointShare: 0.5,
      },
    });
  }

  // 5. Generate Candidates & Signed Invite Tokens
  const invitesGenerated = [];
  const ttlHours = CONFIG.driveActiveDays * 24;
  const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

  for (let i = 1; i <= CONFIG.candidateCount; i++) {
    const candidateEmail = `${CONFIG.candidateEmailPrefix}${i}_${Date.now().toString().slice(-4)}@${CONFIG.candidateDomain}`;
    const candidateName = `Candidate ${i}`;

    const candidate = await prisma.candidate.create({
      data: {
        email: candidateEmail,
        name: candidateName,
      },
    });

    const token = `inv_${crypto.randomBytes(12).toString("hex")}`;
    const inviteId = token;

    const invite = await prisma.invite.create({
      data: {
        id: inviteId,
        candidateEmail: candidate.email,
        candidateName: candidate.name,
        roleTemplateId: roleTemplate.id,
        driveId: drive.id,
        status: InviteStatus.PENDING,
        token,
        createdById: staff.id,
        expiresAt,
        isGenerated: true,
        scheduledTime: scheduleStart,
        bufferMinutes: CONFIG.bufferMinutes,
        graceMinutes: 120,
        originChannel: OriginChannel.DIRECT,
      },
    });

    invitesGenerated.push({
      email: candidate.email,
      name: candidate.name,
      token,
      url: `${CONFIG.frontendUrl}/login?token=${token}`,
    });
  }

  // 6. Print Formatted Summary
  console.log("\n=======================================================");
  console.log("📋 GENERATED DRIVE & CANDIDATE INVITE LINKS");
  console.log("=======================================================");
  console.log(`📌 Primary Coding Question ID: ${seededQuestions[0]?.id}`);
  console.log(`📌 Drive ID:                   ${drive.id}`);
  console.log("-------------------------------------------------------");

  invitesGenerated.forEach((inv, index) => {
    console.log(`\nCandidate #${index + 1}: ${inv.name} (${inv.email})`);
    console.log(`👉 Direct Login URL: ${inv.url}`);
    console.log(`🔑 Token:            ${inv.token.slice(0, 32)}...`);
  });

  console.log("\n=======================================================");
  console.log("💡 QUICK COPY FOR k6 / API TESTING:");
  console.log(`QUESTION_ID="${seededQuestions[0]?.id}"`);
  console.log(`SAMPLE_TOKEN="${invitesGenerated[0]?.token}"`);
  console.log("=======================================================\n");
}

main()
  .catch((e) => {
    console.error("❌ Error generating drive/invites:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
