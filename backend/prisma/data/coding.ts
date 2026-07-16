import { ModuleType } from "@prisma/client";

export interface TestCase {
  input: string;
  expectedOutput: string;
  label?: string;
}

export interface CodingContent {
  prompt: string;
  starterCode?: Record<string, string>;
  testCases: TestCase[];
  hiddenTests?: TestCase[];
  constraints?: string[];
  difficulty: "easy" | "medium" | "hard";
  explanation?: string;
}

export interface CodingSeedEntry {
  moduleType: Extract<ModuleType, "CODING">;
  content: CodingContent;
}

export const codingQuestions: CodingSeedEntry[] = [
  {
    moduleType: "CODING",
    content: {
      prompt:
        "Write a function `twoSum(nums, target)` that returns the indices of the two numbers such that they add up to the `target`. You may assume that each input would have exactly one solution, and you may not use the same element twice. You can return the answer in any order.",
      starterCode: {
        javascript:
          "function twoSum(nums, target) {\n  // Write your code here\n}",
        python:
          "def two_sum(nums: list[int], target: int) -> list[int]:\n    # Write your code here\n    pass",
      },
      testCases: [
        {
          input: "[2, 7, 11, 15], 9",
          expectedOutput: "[0, 1]",
          label: "Example 1",
        },
        { input: "[3, 2, 4], 6", expectedOutput: "[1, 2]", label: "Example 2" },
      ],
      hiddenTests: [
        { input: "[3, 3], 6", expectedOutput: "[0, 1]" },
        { input: "[1, 5, 8, 12, 14], 20", expectedOutput: "[2, 3]" },
      ],
      constraints: [
        "2 <= nums.length <= 10^4",
        "-10^9 <= nums[i] <= 10^9",
        "-10^9 <= target <= 10^9",
      ],
      difficulty: "easy",
      explanation:
        "Use a hash map to store the index of each number. For each number, check if target - number is already in the map.",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "Given a string `s` containing just the characters '(', ')', '{', '}', '[' and ']', determine if the input string is valid. An input string is valid if open brackets are closed by the same type of brackets, and in the correct order.",
      starterCode: {
        javascript: "function isValid(s) {\n  // Write your code here\n}",
        python:
          "def is_valid(s: str) -> bool:\n    # Write your code here\n    pass",
      },
      testCases: [
        { input: "'()'", expectedOutput: "true", label: "Simple parenthesis" },
        {
          input: "'()[]{}'",
          expectedOutput: "true",
          label: "Multiple brackets",
        },
        {
          input: "'(]'",
          expectedOutput: "false",
          label: "Mismatched brackets",
        },
      ],
      hiddenTests: [
        { input: "'([)]'", expectedOutput: "false" },
        { input: "'{[]}'", expectedOutput: "true" },
      ],
      constraints: [
        "1 <= s.length <= 10^4",
        "s consists of parenthetical characters only",
      ],
      difficulty: "easy",
      explanation:
        "A stack is the optimal data structure. Push open brackets onto the stack and pop to match them when closing brackets are encountered.",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "Merge two sorted linked lists and return it as a new sorted list. The new list should be made by splicing together the nodes of the first two lists.",
      starterCode: {
        javascript:
          "function mergeTwoLists(l1, l2) {\n  // Write your code here\n}",
        python:
          "def merge_two_lists(l1: ListNode, l2: ListNode) -> ListNode:\n    # Write your code here\n    pass",
      },
      testCases: [
        { input: "[1,2,4], [1,3,4]", expectedOutput: "[1,1,2,3,4,4]" },
        { input: "[], []", expectedOutput: "[]" },
      ],
      constraints: [
        "The number of nodes in both lists is in the range [0, 50].",
        "-100 <= Node.val <= 100",
      ],
      difficulty: "easy",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "Given an integer array `nums`, find the contiguous subarray (containing at least one number) which has the largest sum and return its sum.",
      starterCode: {
        javascript:
          "function maxSubArray(nums) {\n  // Write your code here\n}",
        python:
          "def max_sub_array(nums: list[int]) -> int:\n    # Write your code here\n    pass",
      },
      testCases: [
        {
          input: "[-2,1,-3,4,-1,2,1,-5,4]",
          expectedOutput: "6",
          label: "Standard case",
        },
        { input: "[1]", expectedOutput: "1" },
      ],
      hiddenTests: [{ input: "[5,4,-1,7,8]", expectedOutput: "23" }],
      constraints: ["1 <= nums.length <= 10^5", "-10^4 <= nums[i] <= 10^4"],
      difficulty: "medium",
      explanation:
        "Use Kadane's Algorithm. Maintain the maximum subarray sum ending at each index, updating the global max.",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "Given a string `s`, find the length of the longest substring without repeating characters.",
      starterCode: {
        javascript:
          "function lengthOfLongestSubstring(s) {\n  // Write your code here\n}",
        python:
          "def length_of_longest_substring(s: str) -> int:\n    # Write your code here\n    pass",
      },
      testCases: [
        { input: "'abcabcbb'", expectedOutput: "3" },
        { input: "'bbbbb'", expectedOutput: "1" },
      ],
      hiddenTests: [{ input: "'pwwkew'", expectedOutput: "3" }],
      constraints: [
        "0 <= s.length <= 5 * 10^4",
        "s consists of English letters, digits, symbols and spaces.",
      ],
      difficulty: "medium",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "Given two strings `s` and `t`, return `true` if `t` is an anagram of `s`, and `false` otherwise.",
      starterCode: {
        javascript: "function isAnagram(s, t) {\n  // Write your code here\n}",
        python:
          "def is_anagram(s: str, t: str) -> bool:\n    # Write your code here\n    pass",
      },
      testCases: [
        { input: "'anagram', 'nagaram'", expectedOutput: "true" },
        { input: "'rat', 'car'", expectedOutput: "false" },
      ],
      constraints: [
        "1 <= s.length, t.length <= 5 * 10^4",
        "s and t consist of lowercase English letters.",
      ],
      difficulty: "easy",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "Given `n` non-negative integers `a_1, a_2, ..., a_n`, where each represents a point at coordinate `(i, a_i)`. Find two lines that together with the x-axis forms a container, such that the container contains the most water. Return the maximum amount of water.",
      starterCode: {
        javascript: "function maxArea(height) {\n  // Write your code here\n}",
        python:
          "def max_area(height: list[int]) -> int:\n    # Write your code here\n    pass",
      },
      testCases: [
        { input: "[1,8,6,2,5,4,8,3,7]", expectedOutput: "49" },
        { input: "[1,1]", expectedOutput: "1" },
      ],
      constraints: [
        "n == height.length",
        "2 <= n <= 10^5",
        "0 <= height[i] <= 10^4",
      ],
      difficulty: "medium",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "Given an array of strings `strs`, group the anagrams together. You can return the answer in any order.",
      starterCode: {
        javascript:
          "function groupAnagrams(strs) {\n  // Write your code here\n}",
        python:
          "def group_anagrams(strs: list[str]) -> list[list[str]]:\n    # Write your code here\n    pass",
      },
      testCases: [
        {
          input: "['eat','tea','tan','ate','nat','bat']",
          expectedOutput: "[['bat'],['nat','tan'],['ate','eat','tea']]",
        },
      ],
      constraints: ["1 <= strs.length <= 10^4", "0 <= strs[i].length <= 100"],
      difficulty: "medium",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "Suppose an array of length `n` sorted in ascending order is rotated between 1 and `n` times. Given the sorted rotated array `nums` of unique elements, return the minimum element of this array. Write an algorithm that runs in `O(log n)` time.",
      starterCode: {
        javascript: "function findMin(nums) {\n  // Write your code here\n}",
        python:
          "def find_min(nums: list[int]) -> int:\n    # Write your code here\n    pass",
      },
      testCases: [
        { input: "[3,4,5,1,2]", expectedOutput: "1" },
        { input: "[4,5,6,7,0,1,2]", expectedOutput: "0" },
      ],
      constraints: [
        "n == nums.length",
        "1 <= n <= 5000",
        "-5000 <= nums[i] <= 5000",
      ],
      difficulty: "medium",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "Given an array of integers `nums` which is sorted in ascending order, and an integer `target`, write a function to search `target` in `nums`. If `target` exists, then return its index. Otherwise, return -1.",
      starterCode: {
        javascript:
          "function search(nums, target) {\n  // Write your code here\n}",
        python:
          "def search(nums: list[int], target: int) -> int:\n    # Write your code here\n    pass",
      },
      testCases: [
        { input: "[-1,0,3,5,9,12], 9", expectedOutput: "4" },
        { input: "[-1,0,3,5,9,12], 2", expectedOutput: "-1" },
      ],
      constraints: [
        "1 <= nums.length <= 10^4",
        "-10^4 < nums[i], target < 10^4",
      ],
      difficulty: "easy",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "You are climbing a staircase. It takes `n` steps to reach the top. Each time you can either climb 1 or 2 steps. In how many distinct ways can you climb to the top?",
      starterCode: {
        javascript: "function climbStairs(n) {\n  // Write your code here\n}",
        python:
          "def climb_stairs(n: int) -> int:\n    # Write your code here\n    pass",
      },
      testCases: [
        { input: "2", expectedOutput: "2" },
        { input: "3", expectedOutput: "3" },
      ],
      constraints: ["1 <= n <= 45"],
      difficulty: "easy",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "You are a professional robber planning to rob houses along a street. Each house has a certain amount of money stashed, the only constraint stopping you from robbing each of them is that adjacent houses have security systems connected and it will automatically contact the police if two adjacent houses were broken into on the same night. Given an integer array `nums` representing the amount of money of each house, return the maximum amount of money you can rob tonight without alerting the police.",
      starterCode: {
        javascript: "function rob(nums) {\n  // Write your code here\n}",
        python:
          "def rob(nums: list[int]) -> int:\n    # Write your code here\n    pass",
      },
      testCases: [
        { input: "[1,2,3,1]", expectedOutput: "4" },
        { input: "[2,7,9,3,1]", expectedOutput: "12" },
      ],
      constraints: ["1 <= nums.length <= 100", "0 <= nums[i] <= 400"],
      difficulty: "medium",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "There are a total of `numCourses` courses you have to take, labeled from `0` to `numCourses - 1`. You are given an array `prerequisites` where `prerequisites[i] = [a, b]` indicates that you must take course `b` first if you want to take course `a`. Return `true` if you can finish all courses. Otherwise, return `false`.",
      starterCode: {
        javascript:
          "function canFinish(numCourses, prerequisites) {\n  // Write your code here\n}",
        python:
          "def can_finish(num_courses: int, prerequisites: list[list[int]]) -> bool:\n    # Write your code here\n    pass",
      },
      testCases: [
        { input: "2, [[1,0]]", expectedOutput: "true" },
        { input: "2, [[1,0],[0,1]]", expectedOutput: "false" },
      ],
      constraints: [
        "1 <= numCourses <= 2000",
        "0 <= prerequisites.length <= 5000",
      ],
      difficulty: "medium",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "Given an array of `intervals` where `intervals[i] = [start_i, end_i]`, merge all overlapping intervals, and return an array of the non-overlapping intervals that cover all the intervals in the input.",
      starterCode: {
        javascript: "function merge(intervals) {\n  // Write your code here\n}",
        python:
          "def merge(intervals: list[list[int]]) -> list[list[int]]:\n    # Write your code here\n    pass",
      },
      testCases: [
        {
          input: "[[1,3],[2,6],[8,10],[15,18]]",
          expectedOutput: "[[1,6],[8,10],[15,18]]",
        },
        { input: "[[1,4],[4,5]]", expectedOutput: "[[1,5]]" },
      ],
      constraints: [
        "1 <= intervals.length <= 10^4",
        "intervals[i].length == 2",
      ],
      difficulty: "medium",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "Given the root of a binary tree, determine if it is a valid binary search tree (BST).",
      starterCode: {
        javascript: "function isValidBST(root) {\n  // Write your code here\n}",
        python:
          "def is_valid_bst(root: TreeNode) -> bool:\n    # Write your code here\n    pass",
      },
      testCases: [
        { input: "[2,1,3]", expectedOutput: "true" },
        { input: "[5,1,4,null,null,3,6]", expectedOutput: "false" },
      ],
      constraints: [
        "The number of nodes in the tree is in the range [1, 10^4].",
        "-2^31 <= Node.val <= 2^31 - 1",
      ],
      difficulty: "medium",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "Given a string `s`, return the longest palindromic substring in `s`.",
      starterCode: {
        javascript:
          "function longestPalindrome(s) {\n  // Write your code here\n}",
        python:
          "def longest_palindrome(s: str) -> str:\n    # Write your code here\n    pass",
      },
      testCases: [
        { input: "'babad'", expectedOutput: "'bab'" },
        { input: "'cbbd'", expectedOutput: "'bb'" },
      ],
      constraints: [
        "1 <= s.length <= 1000",
        "s consists of only digits and English letters.",
      ],
      difficulty: "medium",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "Given an integer array `nums` and an integer `k`, return the `k` most frequent elements. You may return the answer in any order. (O(n log k) time complexity or better).",
      starterCode: {
        javascript:
          "function topKFrequent(nums, k) {\n  // Write your code here\n}",
        python:
          "def top_k_frequent(nums: list[int], k: int) -> list[int]:\n    # Write your code here\n    pass",
      },
      testCases: [
        { input: "[1,1,1,2,2,3], 2", expectedOutput: "[1, 2]" },
        { input: "[1], 1", expectedOutput: "[1]" },
      ],
      constraints: [
        "1 <= nums.length <= 10^5",
        "k is in the range [1, the number of unique elements in the array].",
      ],
      difficulty: "medium",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "Given an unsorted array of integers `nums`, return the length of the longest consecutive elements sequence. Write an algorithm that runs in `O(n)` time.",
      starterCode: {
        javascript:
          "function longestConsecutive(nums) {\n  // Write your code here\n}",
        python:
          "def longest_consecutive(nums: list[int]) -> int:\n    # Write your code here\n    pass",
      },
      testCases: [
        { input: "[100,4,200,1,3,2]", expectedOutput: "4" },
        { input: "[0,3,7,2,5,8,4,6,0,1]", expectedOutput: "9" },
      ],
      constraints: ["0 <= nums.length <= 10^5", "-10^9 <= nums[i] <= 10^9"],
      difficulty: "medium",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "You are given an integer array `coins` representing coins of different denominations and an integer `amount` representing a total amount of money. Return the fewest number of coins that you need to make up that amount. If that amount of money cannot be made up by any combination of the coins, return -1.",
      starterCode: {
        javascript:
          "function coinChange(coins, amount) {\n  // Write your code here\n}",
        python:
          "def coin_change(coins: list[int], amount: int) -> int:\n    # Write your code here\n    pass",
      },
      testCases: [
        { input: "[1,2,5], 11", expectedOutput: "3" },
        { input: "[2], 3", expectedOutput: "-1" },
      ],
      constraints: [
        "1 <= coins.length <= 12",
        "1 <= coins[i] <= 2^31 - 1",
        "0 <= amount <= 10^4",
      ],
      difficulty: "medium",
    },
  },
];
