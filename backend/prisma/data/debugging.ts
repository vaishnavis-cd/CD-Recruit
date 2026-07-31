import { ModuleType } from "@prisma/client";

export interface DebuggingSeedEntry {
  moduleType: Extract<ModuleType, "CODING">;
  content: {
    prompt: string;
    starterCode: Record<string, string>;
    testCases: Array<{ input: string; expectedOutput: string; label?: string; isHidden?: boolean }>;
    constraints?: string[];
    difficulty: "easy" | "medium" | "hard";
    explanation?: string;
  };
}

export const debuggingQuestions: DebuggingSeedEntry[] = [
  {
    moduleType: "CODING",
    content: {
      prompt:
        "DEBUGGING CHALLENGE: The following function is intended to validate whether an array of integers forms a valid sequence where each element is strictly greater than the previous element. However, QA reported that duplicate numbers and off-by-one boundary cases are passing incorrectly. Identify the bug in the logic and fix it.",
      starterCode: {
        javascript: `const fs = require('fs');

function isStrictlyIncreasing(arr) {
  // BUGGY IMPLEMENTATION: Missing strict inequality and boundary check
  for (let i = 1; i < arr.length; i++) {
    if (arr[i] <= arr[i - 1]) {
      return false;
    }
  }
  return true;
}

const input = fs.readFileSync(0, 'utf-8').trim();
if (input) {
  const lines = input.split('\\n');
  for (const line of lines) {
    if (!line.trim()) continue;
    const arr = JSON.parse(line.trim());
    console.log(isStrictlyIncreasing(arr) ? 'true' : 'false');
  }
}`,
        python: `import sys
import json

def is_strictly_increasing(arr: list[int]) -> bool:
    # BUGGY IMPLEMENTATION: Non-strict comparison allows duplicates
    for i in range(1, len(arr)):
        if arr[i] <= arr[i - 1]:
            return False
    return True

for line in sys.stdin:
    if not line.strip():
        continue
    arr = json.loads(line.strip())
    print('true' if is_strictly_increasing(arr) else 'false')`,
      },
      testCases: [
        { input: "[1, 2, 3, 4, 5]", expectedOutput: "true", label: "Valid Increasing Sequence" },
        { input: "[1, 2, 2, 4]", expectedOutput: "false", label: "Duplicate Element Bug Check" },
        { input: "[5, 4, 3, 2, 1]", expectedOutput: "false", label: "Decreasing Sequence Check" },
        { input: "[10]", expectedOutput: "true", label: "Single Element Array", isHidden: true },
        { input: "[1, 3, 2]", expectedOutput: "false", label: "Unsorted Array Check", isHidden: true },
      ],
      constraints: ["1 <= arr.length <= 10^4", "-10^9 <= arr[i] <= 10^9"],
      difficulty: "easy",
      explanation: "Strictly increasing sequence requires arr[i] > arr[i-1] for all i > 0, prohibiting equal adjacent elements.",
    },
  },
  {
    moduleType: "CODING",
    content: {
      prompt:
        "DEBUGGING CHALLENGE: Memory Leak & Event Listener Cleanup. A frontend service accumulates orphaned window event listeners when components unmount, causing high browser memory usage over time. Inspect the handler registration logic and fix the cleanup callback function.",
      starterCode: {
        javascript: `const fs = require('fs');

class EventTracker {
  constructor() {
    this.listeners = [];
  }

  subscribe(event, callback) {
    this.listeners.push({ event, callback });
    return () => this.unsubscribe(event);
  }

  unsubscribe(event) {
    this.listeners = this.listeners.filter(l => l.event !== event);
  }

  getListenerCount() {
    return this.listeners.length;
  }
}

const input = fs.readFileSync(0, 'utf-8').trim();
if (input) {
  const tracker = new EventTracker();
  tracker.subscribe('click', () => {});
  tracker.subscribe('scroll', () => {});
  tracker.unsubscribe('click');
  console.log(tracker.getListenerCount() === 1 ? 'true' : 'false');
}`,
        python: `import sys

class EventTracker:
    def __init__(self):
        self.listeners = []

    def subscribe(self, event, callback):
        self.listeners.append({'event': event, 'callback': callback})

    def unsubscribe(self, event):
        self.listeners = [l for l in self.listeners if l['event'] != event]

    def get_listener_count(self):
        return len(self.listeners)

for line in sys.stdin:
    tracker = EventTracker()
    tracker.subscribe('click', lambda: None)
    tracker.subscribe('scroll', lambda: None)
    tracker.unsubscribe('click')
    print('true' if tracker.get_listener_count() == 1 else 'false')`,
      },
      testCases: [
        { input: "test", expectedOutput: "true", label: "Listener Unsubscribe Verification" },
      ],
      constraints: ["Memory leak cleanup must be O(N) or better"],
      difficulty: "medium",
      explanation: "Ensure event listeners are properly removed from the array when unsubscribed.",
    },
  },
];
