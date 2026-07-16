export { SubmissionType, SqlExecutionStatus } from "@cd-recruit/shared-types";

export interface SqlQuestionContentJson {
  prompt: string;
  schema: string; // DDL schema creation SQL
  seedData: string; // DML data inserts
  expectedQuery?: string;
  explanation?: string;
}

export interface SqlQueryResult {
  columns: string[];
  rows: Record<string, any>[];
  rowCount: number;
}
