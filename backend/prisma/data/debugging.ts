import { ModuleType } from "@prisma/client";

export interface DebuggingTestCase {
  input: string;
  expectedOutput: string;
  label?: string;
  isHidden?: boolean;
}

export interface DebuggingContent {
  prompt: string;
  starterCode: Record<string, string>;
  fixedCode?: Record<string, string>;
  testCases: DebuggingTestCase[];
  constraints?: string[];
  difficulty: "easy" | "medium" | "hard";
  explanation?: string;
}

export interface DebuggingSeedEntry {
  moduleType: Extract<ModuleType, "DEBUGGING">;
  content: DebuggingContent;
}

export const debuggingQuestions: DebuggingSeedEntry[] = [
  {
    moduleType: "DEBUGGING",
    content: {
      prompt:
        "The function `findMax` is supposed to find the maximum integer in an array of numbers. However, it returns incorrect results for arrays containing negative numbers due to a bad initialization bug. Fix the bug so it works for all integer arrays.",
      starterCode: {
        javascript:
          "function findMax(arr) {\n  // BUG: Initialized to 0 instead of negative infinity or arr[0]\n  let maxVal = 0;\n  for (let i = 0; i < arr.length; i++) {\n    if (arr[i] > maxVal) {\n      maxVal = arr[i];\n    }\n  }\n  return maxVal;\n}\n\nconst fs = require('fs');\nconst input = fs.readFileSync(0, 'utf-8').trim();\nif (input) {\n  const arr = JSON.parse(input);\n  console.log(findMax(arr));\n}",
        python:
          "import sys\nimport json\n\ndef find_max(arr: list[int]) -> int:\n    # BUG: Initialized to 0 instead of negative infinity or arr[0]\n    max_val = 0\n    for num in arr:\n        if num > max_val:\n            max_val = num\n    return max_val\n\nfor line in sys.stdin:\n    if line.strip():\n        arr = json.loads(line.strip())\n        print(find_max(arr))",
        java:
          "import java.util.*;\nimport java.io.*;\n\npublic class Main {\n    public static int findMax(int[] arr) {\n        // BUG: Initialized to 0 instead of Integer.MIN_VALUE or arr[0]\n        int maxVal = 0;\n        for (int i = 0; i < arr.length; i++) {\n            if (arr[i] > maxVal) {\n                maxVal = arr[i];\n            }\n        }\n        return maxVal;\n    }\n\n    public static void main(String[] args) throws Exception {\n        BufferedReader br = new BufferedReader(new InputStreamReader(System.in));\n        String line = br.readLine();\n        if (line != null && !line.trim().isEmpty()) {\n            String[] parts = line.replace(\"[\", \"\").replace(\"]\", \"\").split(\",\");\n            int[] arr = new int[parts.length];\n            for (int i = 0; i < parts.length; i++) arr[i] = Integer.parseInt(parts[i].trim());\n            System.out.println(findMax(arr));\n        }\n    }\n}",
      },
      fixedCode: {
        javascript:
          "function findMax(arr) {\n  if (!arr || arr.length === 0) return 0;\n  let maxVal = arr[0];\n  for (let i = 1; i < arr.length; i++) {\n    if (arr[i] > maxVal) {\n      maxVal = arr[i];\n    }\n  }\n  return maxVal;\n}",
      },
      testCases: [
        { input: "[-5, -2, -9, -1]", expectedOutput: "-1", label: "All Negative Array" },
        { input: "[3, 10, -2, 5]", expectedOutput: "10", label: "Mixed Array" },
        { input: "[-100, -200]", expectedOutput: "-100", label: "Large Negative Array" },
      ],
      constraints: ["1 <= arr.length <= 10^5", "-10^9 <= arr[i] <= 10^9"],
      difficulty: "easy",
      explanation:
        "Initializing maxVal to 0 fails when all elements in the array are negative because 0 is greater than any negative number. Initialize maxVal to arr[0] or -Infinity.",
    },
  },
  {
    moduleType: "DEBUGGING",
    content: {
      prompt:
        "The function `isPalindrome` checks whether a given string is a palindrome ignoring case and non-alphanumeric characters. However, it currently contains an off-by-one pointer index error that causes invalid indexing out-of-bounds or skipping middle characters. Fix the bug.",
      starterCode: {
        javascript:
          "function isPalindrome(s) {\n  const clean = s.toLowerCase().replace(/[^a-z0-9]/g, '');\n  let left = 0;\n  let right = clean.length; // BUG: Should be clean.length - 1\n  while (left <= right) {\n    if (clean[left] !== clean[right]) {\n      return false;\n    }\n    left++;\n    right--;\n  }\n  return true;\n}\n\nconst fs = require('fs');\nconst input = fs.readFileSync(0, 'utf-8').trim();\nif (input) {\n  console.log(isPalindrome(input));\n}",
        python:
          "import sys\nimport re\n\ndef is_palindrome(s: str) -> bool:\n    clean = re.sub(r'[^a-zA-Z0-9]', '', s).lower()\n    left = 0\n    right = len(clean) # BUG: Should be len(clean) - 1\n    while left <= right:\n        if clean[left] != clean[right]:\n            return False\n        left += 1\n        right -= 1\n    return True\n\nfor line in sys.stdin:\n    if line.strip():\n        print(str(is_palindrome(line.strip())).lower())",
      },
      testCases: [
        { input: "A man, a plan, a canal: Panama", expectedOutput: "true", label: "Valid Palindrome" },
        { input: "race a car", expectedOutput: "false", label: "Invalid Palindrome" },
        { input: "Was it a car or a cat I saw?", expectedOutput: "true", label: "Sentence Palindrome" },
      ],
      difficulty: "medium",
      explanation:
        "Setting right = clean.length causes clean[right] to evaluate to undefined (out of bounds) on the first loop iteration.",
    },
  },
  {
    moduleType: "DEBUGGING",
    content: {
      prompt:
        "The function `binarySearch` is attempting to find a target value in a sorted array, but it suffers from an infinite loop bug when the target is not present because the pointer update is missing integer division or index decrement/increment. Fix the bug.",
      starterCode: {
        javascript:
          "function binarySearch(arr, target) {\n  let left = 0;\n  let right = arr.length - 1;\n  while (left <= right) {\n    let mid = Math.floor((left + right) / 2);\n    if (arr[mid] === target) return mid;\n    if (arr[mid] < target) {\n      left = mid; // BUG: Infinite loop when left doesn't advance (should be mid + 1)\n    } else {\n      right = mid - 1;\n    }\n  }\n  return -1;\n}\n\nconst fs = require('fs');\nconst input = fs.readFileSync(0, 'utf-8').trim();\nif (input) {\n  const parts = input.split('],');\n  const arr = JSON.parse(parts[0] + ']');\n  const target = parseInt(parts[1].trim(), 10);\n  console.log(binarySearch(arr, target));\n}",
        python:
          "import sys\nimport json\n\ndef binary_search(arr: list[int], target: int) -> int:\n    left, right = 0, len(arr) - 1\n    while left <= right:\n        mid = (left + right) // 2\n        if arr[mid] == target:\n            return mid\n        elif arr[mid] < target:\n            left = mid # BUG: Should be mid + 1\n        else:\n            right = mid - 1\n    return -1\n\nfor line in sys.stdin:\n    if line.strip():\n        parts = line.strip().split('],')\n        arr = json.loads(parts[0] + ']')\n        target = int(parts[1].strip())\n        print(binary_search(arr, target))",
      },
      testCases: [
        { input: "[1, 3, 5, 7, 9], 7", expectedOutput: "3", label: "Found Element" },
        { input: "[1, 3, 5, 7, 9], 4", expectedOutput: "-1", label: "Missing Element" },
        { input: "[2, 4, 6, 8, 10, 12], 2", expectedOutput: "0", label: "First Element" },
      ],
      difficulty: "hard",
      explanation:
        "Setting left = mid instead of left = mid + 1 prevents left from making progress when left and right are adjacent, causing an infinite while loop.",
    },
  },
];
