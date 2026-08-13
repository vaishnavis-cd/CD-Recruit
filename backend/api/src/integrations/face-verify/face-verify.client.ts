import { Injectable, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";

@Injectable()
export class FaceVerifyClient {
  private readonly logger = new Logger(FaceVerifyClient.name);
  private readonly baseUrl: string;

  constructor(private configService: ConfigService) {
    this.baseUrl =
      this.configService.get<string>("FACE_VERIFY_SERVICE_URL") ||
      this.configService.get<string>("faceVerifyServiceUrl") ||
      "http://localhost:8001";
  }

  async enroll(
    imageBuffer: Buffer,
    filename: string,
  ): Promise<{ embedding: number[]; model: string }> {
    try {
      this.logger.log(`Enrolling face ID proof image: ${filename}`);

      const formData = new FormData();
      const blob = new Blob([new Uint8Array(imageBuffer)]);
      formData.append("image", blob, filename);

      const response = await fetch(`${this.baseUrl}/enroll`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Face verify service /enroll returned status ${response.status}: ${errorText}`,
        );
        let detail = `Face enrolment failed with status ${response.status}`;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.detail) detail = parsed.detail;
        } catch (_) {}

        const err: any = new Error(detail);
        err.status = response.status;
        throw err;
      }

      const result = (await response.json()) as {
        embedding: number[];
        model: string;
      };
      this.logger.log(`Successfully enrolled face ID proof for ${filename}`);
      return result;
    } catch (error: any) {
      this.logger.error(`Failed to enroll face ID proof: ${error.message}`);
      throw error;
    }
  }

  async verify(
    imageBuffer: Buffer,
    filename: string,
    storedEmbedding: number[],
  ): Promise<{ matched: boolean; distance: number; threshold: number }> {
    try {
      this.logger.log(
        `Verifying live selfie ${filename} against stored face embedding`,
      );

      const formData = new FormData();
      const blob = new Blob([new Uint8Array(imageBuffer)]);
      formData.append("image", blob, filename);
      formData.append("embedding", JSON.stringify(storedEmbedding));

      const response = await fetch(`${this.baseUrl}/verify`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const errorText = await response.text();
        this.logger.error(
          `Face verify service /verify returned status ${response.status}: ${errorText}`,
        );
        let detail = `Face verification service failed with status ${response.status}`;
        try {
          const parsed = JSON.parse(errorText);
          if (parsed.detail) detail = parsed.detail;
        } catch (_) {}

        const err: any = new Error(detail);
        err.status = response.status;
        throw err;
      }

      const result = (await response.json()) as {
        matched: boolean;
        distance: number;
        threshold: number;
      };
      this.logger.log(
        `Face verification result: matched=${result.matched}, distance=${result.distance}`,
      );
      return result;
    } catch (error: any) {
      this.logger.error(`Failed to execute face verification: ${error.message}`);
      throw error;
    }
  }
}
