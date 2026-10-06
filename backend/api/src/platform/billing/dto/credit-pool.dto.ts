import { ApiProperty } from "@nestjs/swagger";
import { IsUUID } from "class-validator";

export class CreditPoolIdParamDto {
  @ApiProperty({ description: "Credit pool UUID" })
  @IsUUID()
  id: string;
}
