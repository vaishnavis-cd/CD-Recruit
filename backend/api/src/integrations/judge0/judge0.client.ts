import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppConfig } from "../../config/configuration";
import { Judge0ExecutionResponse, Judge0SubmissionResponse } from "./judge0.types";
import CircuitBreaker = require("opossum");

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
  private readonly cpuTimeLimit: number;
  private readonly wallTimeLimit: number;
  private readonly maxRetryAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly breaker: CircuitBreaker;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    const rawUrl = this.configService.get<string>("judge0ApiUrl", { infer: true }) || "http://localhost:2358";
    this.apiUrl = rawUrl.replace(/\/+$/, "");
    this.apiKey = this.configService.get<string>("judge0ApiKey", { infer: true });

    this.cpuTimeLimit = this.configService.get<number>("judge0CpuTimeLimit", { infer: true }) ?? 5.0;
    this.wallTimeLimit = this.configService.get<number>("judge0WallTimeLimit", { infer: true }) ?? 10.0;
    this.maxRetryAttempts = this.configService.get<number>("judge0MaxRetryAttempts", { infer: true }) ?? 3;
    this.retryBaseDelayMs = this.configService.get<number>("judge0RetryBaseDelayMs", { infer: true }) ?? 500;

    const errorThresholdPercentage = this.configService.get<number>("circuitBreakerErrorThresholdPercent", { infer: true }) ?? 50;
    const resetTimeout = this.configService.get<number>("circuitBreakerResetTimeoutMs", { infer: true }) ?? 10000;
    const volumeThreshold = this.configService.get<number>("circuitBreakerVolumeThreshold", { infer: true }) ?? 5;

    const breakerOptions: CircuitBreaker.Options = {
      errorThresholdPercentage,
      resetTimeout,
      rollingCountTimeout: resetTimeout,
      volumeThreshold,
    };

    this.breaker = new CircuitBreaker(
      (actionFn: () => Promise<any>) => actionFn(),
      breakerOptions,
    );

    this.breaker.on("open", () => {
      this.logger.warn("[Circuit Breaker] OPEN: High Judge0 failure rate detected. Failing fast for cooldown period.");
    });
    this.breaker.on("halfOpen", () => {
      this.logger.log("[Circuit Breaker] HALF-OPEN: Testing Judge0 recovery...");
    });
    this.breaker.on("close", () => {
      this.logger.log("[Circuit Breaker] CLOSED: Judge0 service confirmed healthy.");
    });

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
   * Internal submission call executing retry-with-backoff.
   */
  private async executeSubmissionWithRetry(
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
      cpu_time_limit: this.cpuTimeLimit,
      wall_time_limit: this.wallTimeLimit,
      enable_per_process_and_thread_time_limit: true,
      enable_per_process_and_thread_memory_limit: true,
    };

    let attempts = 0;
    let delay = this.retryBaseDelayMs;

    while (attempts < this.maxRetryAttempts) {
      attempts++;
      try {
        this.logger.log(`Submitting code for language_id: ${languageId} to Judge0 (attempt ${attempts})...`);
        const response = await fetch(url, {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(payload),
        });

        if (response.status === 429 || response.status === 503) {
          if (attempts === this.maxRetryAttempts) {
            throw new Error(`Rate limit/Server busy (${response.status}) after ${this.maxRetryAttempts} attempts.`);
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
        if (attempts === this.maxRetryAttempts) {
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
   * Submit a single source code & stdin to Judge0 with wait=true through Circuit Breaker.
   */
  async createSubmission(
    sourceCodeBase64: string,
    languageId: number,
    stdinBase64?: string,
    expectedOutputBase64?: string,
  ): Promise<Judge0ExecutionResponse & { token: string }> {
    try {
      return (await this.breaker.fire(() =>
        this.executeSubmissionWithRetry(
          sourceCodeBase64,
          languageId,
          stdinBase64,
          expectedOutputBase64,
        ),
      )) as Judge0ExecutionResponse & { token: string };
    } catch (error: any) {
      if (error?.code === "EOPENBREAKER" || this.breaker.opened) {
        throw new Error("Execution service is currently busy, please try again shortly");
      }
      throw error;
    }
  }

  /**
   * Internal batch submission call executing retry-with-backoff using POST /submissions/batch.
   */
  private async executeBatchSubmissionWithRetry(
    items: BatchSubmissionItem[],
  ): Promise<Array<{ token: string }>> {
    const url = `${this.apiUrl}/submissions/batch?base64_encoded=true`;
    const payload = {
      submissions: items.map((item) => ({
        source_code: item.sourceCodeBase64,
        language_id: item.languageId,
        stdin: item.stdinBase64 || null,
        expected_output: item.expectedOutputBase64 || null,
        cpu_time_limit: this.cpuTimeLimit,
        wall_time_limit: this.wallTimeLimit,
        enable_per_process_and_thread_time_limit: true,
        enable_per_process_and_thread_memory_limit: true,
        // Note: callback_url: "..." for async webhook push notifications will be wired here in follow-up task
      })),
    };

    let attempts = 0;
    let delay = this.retryBaseDelayMs;

    while (attempts < this.maxRetryAttempts) {
      attempts++;
      try {
        this.logger.log(`Submitting batch of ${items.length} items to Judge0 POST /submissions/batch (attempt ${attempts})...`);
        const response = await fetch(url, {
          method: "POST",
          headers: this.getHeaders(),
          body: JSON.stringify(payload),
        });

        if (response.status === 429 || response.status === 503) {
          if (attempts === this.maxRetryAttempts) {
            throw new Error(`Rate limit/Server busy (${response.status}) after ${this.maxRetryAttempts} attempts.`);
          }
          this.logger.warn(`Judge0 server busy/rate limited (${response.status}). Retrying batch in ${delay}ms...`);
          await new Promise((resolve) => setTimeout(resolve, delay));
          delay *= 2;
          continue;
        }

        if (!response.ok) {
          const errorText = await response.text();
          this.logger.error(`Judge0 batch submission failed: ${response.status} - ${errorText}`);
          const nonRetryableError = new Error(`Judge0 API error: ${response.statusText} (${response.status})`);
          (nonRetryableError as any).isNonRetryable = true;
          throw nonRetryableError;
        }

        const tokens = (await response.json()) as Array<{ token: string }>;
        return tokens;
      } catch (error: any) {
        if (error?.isNonRetryable || attempts === this.maxRetryAttempts) {
          this.logger.error(`Error submitting batch to Judge0: ${error.message}`);
          throw error;
        }
        this.logger.warn(`Network/transient error on batch attempt ${attempts}: ${error.message}. Retrying in ${delay}ms...`);
        await new Promise((resolve) => setTimeout(resolve, delay));
        delay *= 2;
      }
    }

    throw new Error("Failed to submit batch to Judge0.");
  }

  /**
   * Submit a batch of test cases to Judge0 in a single async POST /submissions/batch request through Circuit Breaker.
   */
  async createBatchSubmissions(items: BatchSubmissionItem[]): Promise<Array<{ token: string }>> {
    if (items.length === 0) return [];
    try {
      return (await this.breaker.fire(() =>
        this.executeBatchSubmissionWithRetry(items),
      )) as Array<{ token: string }>;
    } catch (error: any) {
      if (error?.code === "EOPENBREAKER" || this.breaker.opened) {
        throw new Error("Execution service is currently busy, please try again shortly");
      }
      throw error;
    }
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
