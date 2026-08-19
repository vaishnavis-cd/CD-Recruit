import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { HeartbeatService } from "./heartbeat.service";
<<<<<<< HEAD

@Processor("heartbeat-monitor")
export class HeartbeatMonitorProcessor extends WorkerHost {
  constructor(private readonly heartbeatService: HeartbeatService) {
=======
import { NosqlSandboxService } from "../modules/nosql/nosql-sandbox.service";

@Processor("heartbeat-monitor")
export class HeartbeatMonitorProcessor extends WorkerHost {
  constructor(
    private readonly heartbeatService: HeartbeatService,
    private readonly nosqlSandboxService: NosqlSandboxService,
  ) {
>>>>>>> origin/dev-phase2
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name === "scan") {
      await this.heartbeatService.scanAndMarkStale();
    } else if (job.name === "retention-cleanup") {
      await this.heartbeatService.cleanupExpiredBiometrics();
<<<<<<< HEAD
=======
    } else if (job.name === "drop-sandbox") {
      const { sandboxDbName } = job.data;
      await this.nosqlSandboxService.dropSandbox(sandboxDbName);
>>>>>>> origin/dev-phase2
    }
  }
}
