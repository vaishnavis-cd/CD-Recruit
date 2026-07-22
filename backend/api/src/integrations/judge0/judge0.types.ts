export interface Judge0SubmissionResponse {
  token: string;
}

export interface Judge0Status {
  id: number;
  description: string;
}

export interface Judge0ExecutionResponse {
  token?: string;
  status: Judge0Status;
  stdout: string | null;
  stderr: string | null;
  compile_output: string | null;
  time: string | null; // execution time in seconds
  memory: number | null; // memory usage in KB
}
