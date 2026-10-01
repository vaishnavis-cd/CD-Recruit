import { Module } from "@nestjs/common";
import { PrismaModule } from "../../prisma/prisma.module";
import { PriceBookService } from "./price-book.service";

@Module({
  imports: [PrismaModule],
  providers: [PriceBookService],
  exports: [PriceBookService],
})
export class PriceBookModule {}
