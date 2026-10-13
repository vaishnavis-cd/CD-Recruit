import { Module } from "@nestjs/common";
import { ConfigModule } from "@nestjs/config";
import { PistonClient } from "./piston.client";

@Module({
  imports: [ConfigModule],
  providers: [PistonClient],
  exports: [PistonClient],
})
export class PistonModule {}
