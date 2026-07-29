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
    const rawUrl = this.configService.get<string>("judge0ApiUrl", { infer: true }) || "http://localhost:2358";
    this.apiUrl = rawUrl.replace(/\/+$/, "");
    this.apiKey = this.configService.get<string>("judge0ApiKey", { infer: true });

    this.logger.log(`Judge0 Primary Sandbox Engine configured at: ${this.apiUrl || "http://localhost:2358"}`);
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
  async createSubmission(
    sourceCodeBase64: string,
    languageId: number,
    stdinBase64?: string,
    expectedOutputBase64?: string,
  ): Promise<string> {
    const url = `${this.apiUrl}/submissions?base64_encoded=true&wait=false`;
    const payload = {
      source_code: sourceCodeBase64,
      language_id: languageId,
      stdin: stdinBase64 || null,
      expected_output: expectedOutputBase64 || null,
      enable_per_process_and_thread_time_limit: true,
      enable_per_process_and_thread_memory_limit: true,
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

        const data = (await response.json()) as Judge0SubmissionResponse;
        return data.token;
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
   * Submit a batch of test cases to Judge0 in a single HTTP POST request.
   */
  async createBatchSubmissions(items: BatchSubmissionItem[]): Promise<string[]> {
    if (items.length === 0) return [];
    if (items.length === 1) {
      const token = await this.createSubmission(
        items[0].sourceCodeBase64,
        items[0].languageId,
        items[0].stdinBase64,
        items[0].expectedOutputBase64,
      );
      return [token];
    }

    const url = `${this.apiUrl}/submissions/batch?base64_encoded=true`;
    const payload = {
      submissions: items.map((item) => ({
        source_code: item.sourceCodeBase64,
        language_id: item.languageId,
        stdin: item.stdinBase64 || null,
        expected_output: item.expectedOutputBase64 || null,
        enable_per_process_and_thread_time_limit: true,
        enable_per_process_and_thread_memory_limit: true,
      })),
    };

    let attempts = 0;
    const maxAttempts = 3;
    let delay = 500;

    while (attempts < maxAttempts) {
      attempts++;
      try {
        this.logger.log(`Submitting batch of ${items.length} test cases to Judge0 (attempt ${attempts})...`);
        const response = await fetch(url, {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(payload),
        });

        if (response.status === 429 || response.status === 503) {
          if (attempts === maxAttempts) {
            throw new Error(`Rate limit/Server busy (${response.status}) after ${maxAttempts} attempts.`);
          }
          this.logger.warn(`Judge0 batch submission rate limited (${response.status}). Retrying in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error(`Judge0 batch submission failed: ${response.status} - ${errorText}`);
          throw new Error(`Judge0 API error: ${response.statusText}`);
        }

        const data = (await response.json()) as Array<{ token: string }>;
        return data.map((d) => d.token);
      } catch (error: any) {
        if (attempts === maxAttempts) {
          this.logger.error(`Error connecting to Judge0 for batch submission: ${error.message}`);
          throw error;
        }
        this.logger.warn(`Connection error on attempt ${attempts}: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }

    throw new Error("Failed to submit batch to Judge0.");
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

  async getWorkers(): Promise<Array<{ queue: string; size: number; available: number; idle: number; working: number; paused: number; failed: number }>> {
    const url = `${this.apiUrl}/workers`;
    try {
      const response = await fetch(url, {
        method: "GET",
        headers: this.getHeaders(),
      });
      if (!response.ok) {
        throw new Error(`Judge0 API error: ${response.statusText}`);
      }
      return await response.json() as any;
    } catch (error: any) {
      this.logger.error(`Error fetching workers status from Judge0: ${error.message}`);
      throw error;
    }
  }
}
