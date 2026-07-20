import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class CorrelationEngineClient {
  private readonly logger = new Logger(CorrelationEngineClient.name);
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.baseUrl = this.configService.get<string>("CORRELATION_ENGINE_URL") || "http://localhost:8000";
  }

  async triggerCorrelation(sessionId: string): Promise<boolean> {
    try {
      this.logger.log(`Triggering Say-Do correlation scoring for session: ${sessionId}`);
      const response = await fetch(`${this.baseUrl}/api/v1/correlate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ session_id: sessionId }),
      });

      if (!response.ok) {
        this.logger.error(`Correlation engine returned status ${response.status}: ${await response.text()}`);
        return false;
      }

      this.logger.log(`Successfully completed Say-Do scoring for session: ${sessionId}`);
      return true;
    } catch (error) {
      this.logger.error(`Failed to trigger Say-Do correlation scoring: ${error.message}`);
      return false;
    }
  }
}
