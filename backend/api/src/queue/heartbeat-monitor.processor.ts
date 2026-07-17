import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Job } from "bullmq";
import { HeartbeatService } from "./heartbeat.service";

@Processor("heartbeat-monitor")
export class HeartbeatMonitorProcessor extends WorkerHost {
  constructor(private readonly heartbeatService: HeartbeatService) {
    super();
  }

  async process(job: Job): Promise<void> {
    await this.heartbeatService.scanAndMarkStale();
  }
}
