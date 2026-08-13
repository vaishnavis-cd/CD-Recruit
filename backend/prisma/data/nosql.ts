import { ModuleType } from "@prisma/client";

export interface NosqlContent {
  title: string;
  prompt: string;
  datasetRef: string;
  collections: string[];
  allowedOperations: string[];
  validatorType: "OUTPUT_COMPARISON" | "STATE_COMPARISON";
  expectedOperation: any;
  hint?: string;
}

export interface NosqlSeedEntry {
  moduleType: Extract<ModuleType, "NOSQL">;
  difficulty?: string;
  content: NosqlContent;
}

export const nosqlQuestions: NosqlSeedEntry[] = [
  {
    moduleType: "NOSQL",
    difficulty: "easy",
    content: {
      title: "Find Employees in Sales",
      prompt: "Write a MongoDB query to find all documents in the 'employees' collection where the department is 'Sales'. Project only the 'name' field, and exclude the '_id' field.",
      datasetRef: "datasets/employees.json",
      collections: ["employees"],
      allowedOperations: ["find"],
      validatorType: "OUTPUT_COMPARISON",
      expectedOperation: {
        collection: "employees",
        operator: "find",
        payload: {
          filter: {
            department: "Sales"
          },
          projection: {
            _id: 0,
            name: 1
          }
        }
      },
      hint: "Use db.employees.find({ department: 'Sales' }, { _id: 0, name: 1 })"
    }
  },
  {
    moduleType: "NOSQL",
    difficulty: "medium",
    content: {
      title: "Find High Earners in Engineering",
      prompt: "Write a MongoDB query to find all documents in the 'employees' collection where the department is 'Engineering' and the salary is strictly greater than 80000. Project only the fields 'name' and 'salary', and exclude '_id'.",
      datasetRef: "datasets/employees.json",
      collections: ["employees"],
      allowedOperations: ["find"],
      validatorType: "OUTPUT_COMPARISON",
      expectedOperation: {
        collection: "employees",
        operator: "find",
        payload: {
          filter: {
            department: "Engineering",
            salary: { $gt: 80000 }
          },
          projection: {
            _id: 0,
            name: 1,
            salary: 1
          }
        }
      },
      hint: "Use db.employees.find({ department: 'Engineering', salary: { $gt: 80000 } }, { _id: 0, name: 1, salary: 1 })"
    }
  },
  {
    moduleType: "NOSQL",
    difficulty: "hard",
    content: {
      title: "Average Salary by Department",
      prompt: "Write a MongoDB aggregation query to calculate the average salary for each department. Group by 'department', and name the average salary field 'avgSalary'. Sort the results by 'avgSalary' in descending order.",
      datasetRef: "datasets/employees.json",
      collections: ["employees"],
      allowedOperations: ["aggregate"],
      validatorType: "OUTPUT_COMPARISON",
      expectedOperation: {
        collection: "employees",
        operator: "aggregate",
        payload: {
          pipeline: [
            {
              $group: {
                _id: "$department",
                avgSalary: { $avg: "$salary" }
              }
            },
            {
              $sort: {
                avgSalary: -1
              }
            }
          ]
        }
      },
      hint: "Use db.employees.aggregate([{ $group: { _id: '$department', avgSalary: { $avg: '$salary' } } }, { $sort: { avgSalary: -1 } }])"
    }
  }
];
