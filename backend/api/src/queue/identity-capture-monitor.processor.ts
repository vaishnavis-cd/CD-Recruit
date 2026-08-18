import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { IdentityCaptureService } from "./identity-capture.service";

@Processor("identity-capture-monitor")
export class IdentityCaptureMonitorProcessor extends WorkerHost {
  constructor(
    private readonly identityCaptureService: IdentityCaptureService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === "scan") {
      await this.identityCaptureService.scanAndMarkMissed();
    }
  }
}
