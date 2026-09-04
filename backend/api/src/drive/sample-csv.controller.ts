import { Controller, Get, Res, UseGuards } from "@nestjs/common";
import { Response } from "express";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import { RolesGuard } from "../common/guards/roles.guard";
import { Roles } from "../common/decorators/roles.decorator";
import { StaffRole } from "@cd-recruit/shared-types";

@Controller("admin/drives/sample-csv")
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(StaffRole.RECRUITER, StaffRole.ADMIN)
export class SampleCsvController {
  @Get("questions")
  getSampleQuestionsCsv(@Res() res: Response) {
    const csvContent = `moduleType,title,description,difficulty,targetLevel,preferredLanguage,options,correctAnswer
MCQ,Array Complexity,What is the worst case time complexity of accessing an array element by index?,EASY,0-1,javascript,"O(1)|O(n)|O(log n)|O(n^2)",O(1)
MCQ,SQL Joins,Which join returns all matching rows from both tables?,MEDIUM,2-5,sql,"INNER JOIN|LEFT JOIN|FULL OUTER JOIN|CROSS JOIN",FULL OUTER JOIN
DEBUGGING,Fix Array Index Bug,Fix off-by-one error in array loop,MEDIUM,6-10,javascript,"[{\"input\":\"[1,2,3]\",\"expected\":\"3\"}]",let i=0; i<arr.length; i++
CODING,Binary Search Implementation,Implement binary search for a sorted array,HARD,11-15,python,"[{\"input\":\"[1,3,5], 3\",\"expected\":\"1\"}]",def search(nums, target): return nums.index(target) if target in nums else -1`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="sample_questions.csv"');
    return res.send(csvContent);
  }

  @Get("simulation-json")
  getSampleSimulationJson(@Res() res: Response) {
    const sampleSimulation = {
      moduleType: "SIMULATION",
      role: "SOFTWARE_ENGINEERING",
      difficulty: "HARD",
      targetLevel: "6-10",
      content: {
        title: "Authentication Token Expiration & Memory Leak Incident",
        description: "Diagnose and resolve an off-by-one token renewal bug in authentication middleware while ensuring regression unit tests pass.",
        defaultFile: "src/auth/validation.py",
        starterCode: {
          python: "def validate_username(username: str) -> bool:\n    # Fix: Ensure username format is strictly validated without memory leakage\n    if not username:\n        return False\n    return username.isalnum() and len(username) <= 32\n",
          javascript: "function validateUsername(username) {\n    // Fix: Ensure username format is strictly validated without memory leakage\n    if (!username) return false;\n    return /^[a-zA-Z0-9]{1,32}$/.test(username);\n}\n"
        },
        readonlyFiles: {
          "login/auth.py": "# Core Auth Handler (Read-only reference)\nfrom login_validation import validate_username\n\ndef authenticate_user(user: str, hash_val: str):\n    if not validate_username(user):\n        raise ValueError('Invalid user')\n    return {'status': 'authenticated', 'user': user}\n",
          "login/middleware.py": "# Request Middleware (Read-only reference)\nclass AuthenticationMiddleware:\n    def process_request(self, req):\n        pass\n",
          "tests/test_validation.py": "# QA Unit & Regression Test Suite (Read-only reference)\nimport pytest\nfrom login_validation import validate_username\n\ndef test_valid():\n    assert validate_username('admin_01') == True\n",
          "config/settings.yaml": "environment: production\nservice: auth-service\nversion: 2.4.1\ntimeout_seconds: 300\n"
        },
        terminalInfo: {
          repository: "cdrecruit/auth-service",
          branch: "fix/incident-auth-leak",
          initialLogs: [
            "pytest tests/",
            "Repository: cdrecruit/auth-service [fix/incident-auth-leak]",
            "Ready. Run diagnostics to test your changes."
          ]
        },
        incidentContext: {
          jiraTicket: {
            id: "PROD-4921",
            title: "P1: Intermittent 504 gateway timeouts under auth traffic spike",
            reporter: "On-Call SRE",
            severity: "High"
          },
          slackLogs: [
            { user: "DevOps Bot", message: "Alert: Auth cluster memory consumption exceeded 85%" }
          ]
        }
      },
      tags: ["simulation", "incident", "auth", "python"]
    };

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="sample_simulation_question.json"');
    return res.send(JSON.stringify(sampleSimulation, null, 2));
  }

  @Get("questions-json")
  getSampleQuestionsJson(@Res() res: Response) {
    const sampleQuestions = [
      {
        moduleType: "MCQ",
        role: "SOFTWARE_ENGINEERING",
        difficulty: "EASY",
        targetLevel: "0-1",
        content: {
          title: "Array Access Complexity",
          question: "What is the worst-case time complexity of accessing an element by index in a dynamic array?",
          options: ["O(1)", "O(n)", "O(log n)", "O(n^2)"],
          correctAnswer: "O(1)"
        },
        tags: ["mcq", "arrays", "dsa"]
      },
      {
        moduleType: "SQL",
        role: "DATA_ENGINEERING",
        difficulty: "MEDIUM",
        targetLevel: "2-5",
        content: {
          title: "Highest Salary by Department",
          description: "Write a SQL query to find the employee with the highest salary in each department.",
          databaseEngine: "PostgreSQL",
          expectedOutputSchema: ["department_id", "employee_name", "salary"],
          solutionQuery: "SELECT department_id, employee_name, salary FROM (SELECT *, DENSE_RANK() OVER (PARTITION BY department_id ORDER BY salary DESC) as rnk FROM employees) t WHERE rnk = 1"
        },
        tags: ["sql", "window-functions", "postgresql"]
      },
      {
        moduleType: "CODING",
        role: "SOFTWARE_ENGINEERING",
        difficulty: "HARD",
        targetLevel: "6-10",
        content: {
          title: "Longest Substring Without Repeating Characters",
          problemStatement: "Given a string s, find the length of the longest substring without duplicate characters.",
          testCases: [
            { input: "abcabcbb", expected: "3" },
            { input: "bbbbb", expected: "1" }
          ]
        },
        tags: ["coding", "sliding-window", "strings"]
      }
    ];

    res.setHeader("Content-Type", "application/json");
    res.setHeader("Content-Disposition", 'attachment; filename="sample_questions.json"');
    return res.send(JSON.stringify(sampleQuestions, null, 2));
  }

  @Get("candidates")
  getSampleCandidatesCsv(@Res() res: Response) {
    const csvContent = `name,email
Alice Johnson,alice.johnson@example.com
Bob Smith,bob.smith@example.com
Carol White,carol.white@example.com
David Miller,david.miller@example.com`;

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", 'attachment; filename="sample_candidates.csv"');
    return res.send(csvContent);
  }
}
