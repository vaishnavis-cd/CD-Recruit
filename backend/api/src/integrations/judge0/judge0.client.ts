import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppConfig } from "../../config/configuration";
import { Judge0ExecutionResponse, Judge0SubmissionResponse } from "./judge0.types";

export interface BatchSubmissionItem {
  sourceCodeBase64: string;
  languageId: number;
  stdinBase64?: string;
  expectedOutputBase64?: string;
}

@Injectable()
export class Judge0Client {
  private readonly logger = new Logger(Judge0Client.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const rawUrl =
      this.configService.get<string>("judge0ApiUrl", { infer: true }) ||
      process.env.JUDGE0_API_URL ||
      process.env.JUDGE0_URL ||
      (process.env.NODE_ENV === "production" ? "http://judge0-server:2358" : "http://localhost:2358");
    this.apiUrl = rawUrl.replace(/\/+$/, "");
    this.apiKey = this.configService.get<string>("judge0ApiKey", { infer: true }) || process.env.JUDGE0_API_KEY || "";

    this.logger.log(`Judge0 Primary Sandbox Engine configured at: ${this.apiUrl}`);
  }

  getApiUrl(): string {
    return this.apiUrl || "http://localhost:2358";
  }

  isConfigured(): boolean {
    return true;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
    };
    if (this.apiKey) {
      headers["X-RapidAPI-Key"] = this.apiKey;
      if (this.apiUrl.includes("rapidapi.com")) {
        headers["X-RapidAPI-Host"] = new URL(this.apiUrl).hostname;
      }
    }
    return headers;
  }

  /**
   * Submit a single source code & stdin to Judge0.
   */
  /**
   * Submit a single source code & stdin to Judge0 with wait=true.
   */
  async createSubmission(
    sourceCodeBase64: string,
    languageId: number,
    stdinBase64?: string,
    expectedOutputBase64?: string,
  ): Promise<Judge0ExecutionResponse & { token: string }> {
    const url = `${this.apiUrl}/submissions?base64_encoded=true&wait=true`;
    const payload = {
      source_code: sourceCodeBase64,
      language_id: languageId,
      stdin: stdinBase64 || null,
      expected_output: expectedOutputBase64 || null,
      cpu_time_limit: 5.0,
      wall_time_limit: 10.0,
      enable_per_process_and_thread_time_limit: true,
      enable_per_process_and_thread_memory_limit: true,
      memory_limit: 512000,
    };

    let attempts = 0;
    const maxAttempts = 3;
    let delay = 500;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        this.logger.log(`Submitting code for language_id: ${languageId} to Judge0 (attempt ${attempts})...`);
        const response = await fetch(url, {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(payload),
        });

        if (response.status === 429 || response.status === 503) {
          if (attempts === maxAttempts) {
            throw new Error(`Rate limit/Server busy (${response.status}) after ${maxAttempts} attempts.`);
          }
          this.logger.warn(`Judge0 server busy/rate limited (${response.status}). Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error(`Judge0 submission failed: ${response.status} - ${errorText}`);
          throw new Error(`Judge0 API error: ${response.statusText}`);
        }

        const data = (await response.json()) as Judge0ExecutionResponse & { token: string };
        return data;
      } catch (error: any) {
        if (attempts === maxAttempts) {
          this.logger.error(`Error connecting to Judge0 for submission: ${error.message}`);
          throw error;
        }
        this.logger.warn(`Connection error on attempt ${attempts}: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }

    throw new Error("Failed to submit code to Judge0.");
  }

  /**
   * Submit a batch of test cases to Judge0 in parallel synchronous HTTP POST requests with wait=true.
   */
  async createBatchSubmissions(items: BatchSubmissionItem[]): Promise<Array<Judge0ExecutionResponse & { token: string }>> {
    if (items.length === 0) return [];
    
    // Execute all test cases concurrently using synchronous POST requests (wait=true)
    return Promise.all(
      items.map((item) =>
        this.createSubmission(
          item.sourceCodeBase64,
          item.languageId,
          item.stdinBase64,
          item.expectedOutputBase64
        )
      )
    );
  }

  /**
   * Fetch a single submission result from Judge0.
   */
  async getSubmission(token: string): Promise<Judge0ExecutionResponse> {
    const url = `${this.apiUrl}/submissions/${token}?base64_encoded=true`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Judge0 getSubmission failed for token ${token}: ${response.status} - ${errorText}`);
        throw new Error(`Judge0 API error: ${response.statusText}`);
      }

      return (await response.json()) as Judge0ExecutionResponse;
    } catch (error: any) {
      this.logger.error(`Error fetching submission status from Judge0 for token ${token}: ${error.message}`);
      throw error;
    }
  }

  /**
   * Fetch results for a batch of tokens in a single HTTP GET request.
   */
  async getBatchSubmissions(tokens: string[]): Promise<Judge0ExecutionResponse[]> {
    if (tokens.length === 0) return [];
    if (tokens.length === 1) {
      const res = await this.getSubmission(tokens[0]);
      return [res];
    }

    const tokenList = tokens.join(",");
    const url = `${this.apiUrl}/submissions/batch?tokens=${encodeURIComponent(tokenList)}&base64_encoded=true&fields=token,status,stdout,stderr,compile_output,time,memory`;

    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(`Judge0 getBatchSubmissions failed: ${response.status} - ${errorText}`);
        throw new Error(`Judge0 API error: ${response.statusText}`);
      }

      const data = (await response.json()) as { submissions: Judge0ExecutionResponse[] };
      return data.submissions || [];
    } catch (error: any) {
      this.logger.error(`Error fetching batch submission status from Judge0: ${error.message}`);
      throw error;
    }
  }
}
