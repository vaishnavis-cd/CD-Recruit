import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { PistonExecuteOptions, PistonRawResponse } from "./piston.contracts";

@Injectable()
export class PistonClient {
  private readonly logger = new Logger(PistonClient.name);
  private readonly apiUrl: string;
  private readonly timeoutMs: number = 25000; // 25s timeout cap as per v4 specification
  private readonly maxRetries: number = 3;
  private readonly baseDelayMs: number = 100;

  constructor(private readonly configService?: ConfigService) {
    const configuredUrl =
      this.configService?.get<string>("pistonApiUrl") ||
      process.env.PISTON_API_URL ||
      "http://127.0.0.1:2000";
    this.apiUrl = configuredUrl.replace(/\/+$/, "");
  }

  /**
   * Executes source code on Piston sandbox via POST /api/v2/execute with 25s timeout and 3x retry on transient errors.
   */
  async execute(
    language: string,
    version: string = "*",
    files: Array<{ name: string; content: string }>,
    options?: PistonExecuteOptions,
  ): Promise<PistonRawResponse> {
    const payload = {
      language,
      version,
      files,
      stdin: options?.stdin,
      args: options?.args,
      run_timeout: options?.run_timeout,
      compile_timeout: options?.compile_timeout,
      run_memory_limit: options?.run_memory_limit,
      compile_memory_limit: options?.compile_memory_limit,
    };

    let attempt = 0;
    let delay = this.baseDelayMs;

    while (attempt < this.maxRetries) {
      attempt++;
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), this.timeoutMs);

      try {
        const response = await fetch(`${this.apiUrl}/api/v2/execute`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        // Transient HTTP status codes: retry with backoff
        if (response.status === 429 || response.status >= 500) {
          const errText = await response.text();
          if (attempt >= this.maxRetries) {
            throw new Error(`Piston transient error (${response.status}): ${errText}`);
          }
          this.logger.warn(
            `[PistonClient] Transient error ${response.status} on attempt ${attempt}. Retrying in ${delay}ms...`,
          );
          await new Promise((r) => setTimeout(r, delay));
          delay *= 3;
          continue;
        }

        // Client errors (e.g. 400 Bad Request / unknown language): throw immediately without retry
        if (!response.ok) {
          const errText = await response.text();
          this.logger.error(`[PistonClient] Execution rejected (${response.status}): ${errText}`);
          throw new Error(`Piston error (${response.status}): ${errText}`);
        }

        const data = (await response.json()) as PistonRawResponse;
        return data;
      } catch (err: any) {
        clearTimeout(timeoutId);

        const isAbort = err.name === "AbortError";
        const isNetworkErr =
          isAbort ||
          err.code === "ECONNREFUSED" ||
          err.code === "ECONNRESET" ||
          err.code === "ETIMEDOUT" ||
          err.message?.includes("fetch failed");

        if (isNetworkErr && attempt < this.maxRetries) {
          this.logger.warn(
            `[PistonClient] Connection failure on attempt ${attempt} (${err.message}). Retrying in ${delay}ms...`,
          );
          await new Promise((r) => setTimeout(r, delay));
          delay *= 3;
          continue;
        }

        this.logger.error(`[PistonClient] Execution failed after ${attempt} attempts: ${err.message}`);
        throw err;
      }
    }

    throw new Error(`Failed to execute code on Piston after ${this.maxRetries} attempts.`);
  }

  /**
   * Health check verifying API availability via GET /api/v2/packages with 5s timeout.
   */
  async checkHealth(): Promise<boolean> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(`${this.apiUrl}/api/v2/packages`, { signal: controller.signal });
      clearTimeout(timeoutId);
      return res.status === 200;
    } catch {
      return false;
    }
  }

  /**
   * Returns currently installed runtimes on Piston via GET /api/v2/runtimes.
   */
  async getRuntimes(): Promise<any[]> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 5000);
    try {
      const res = await fetch(`${this.apiUrl}/api/v2/runtimes`, { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        return (await res.json()) as any[];
      }
      return [];
    } catch {
      return [];
    }
  }
}
