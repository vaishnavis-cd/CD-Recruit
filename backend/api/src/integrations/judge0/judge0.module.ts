import { Module } from "@nestjs/common";
import { Judge0Client } from "./judge0.client";
import { Judge0Service } from "./judge0.service";

@Module({
  providers: [Judge0Client, Judge0Service],
  exports: [Judge0Service],
})
export class Judge0Module {}
