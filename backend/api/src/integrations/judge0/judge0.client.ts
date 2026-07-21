import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { AppConfig } from "../../config/configuration";
import { Judge0ExecutionResponse, Judge0SubmissionResponse } from "./judge0.types";

@Injectable()
export class Judge0Client {
  private readonly logger = new Logger(Judge0Client.name);
  private readonly apiUrl: string;
  private readonly apiKey: string;

  constructor(private readonly configService: ConfigService<AppConfig, true>) {
    this.apiUrl = this.configService.get<string>("judge0ApiUrl", { infer: true });
    this.apiKey = this.configService.get<string>("judge0ApiKey", { infer: true });

    if (!this.apiUrl || this.apiUrl.trim() === "") {
      const errMsg = "FATAL: JUDGE0_API_URL is not set. Refusing to boot application.";
      this.logger.error(errMsg);
      throw new Error(errMsg);
    }
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

        if (response.status === 429) {
          if (attempts === maxAttempts) {
            throw new Error(`Rate limit exceeded (HTTP 429) after ${maxAttempts} attempts.`);
          }
          this.logger.warn(`Judge0 rate limited (HTTP 429). Retrying in ${delay}ms...`);
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
}
