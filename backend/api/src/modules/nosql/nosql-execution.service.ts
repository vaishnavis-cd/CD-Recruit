import { Injectable, BadRequestException, Logger } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MongoClient } from "mongodb";
import { MongoOperationObject } from "./nosql-validator.service";

export interface ExecutionResult {
  result: any;
  executionTimeMs: number;
}

@Injectable()
export class NosqlExecutionService {
  private readonly logger = new Logger(NosqlExecutionService.name);
  private client: MongoClient | null = null;
  private mongodbUrl: string;

  constructor(private readonly configService: ConfigService) {
    this.mongodbUrl =
      this.configService.get<string>("mongodbUrl") ||
      this.configService.get<string>("app.mongodbUrl") ||
      process.env.MONGODB_URL ||
      "mongodb://admin:adminpassword@localhost:27017/admin";
  }

  /**
   * Helper to execute a query on a client.
   * Leverages a client connection pool to execute operations safely.
   */
  async execute(sandboxDbName: string, operation: MongoOperationObject): Promise<ExecutionResult> {
    const client = new MongoClient(this.mongodbUrl, {
      serverSelectionTimeoutMS: 2000,
    });

    const start = performance.now();
    try {
      await client.connect();
      const db = client.db(sandboxDbName);
      const collection = db.collection(operation.collection);
      const payload = operation.payload || {};
      const maxTimeMS = 2000; // Strict limit: 2 seconds max execution time per query

      let result: any = null;

      // Switch statement ensures NO dynamic execution is possible: strict whitelisting.
      switch (operation.operator) {
        case "find": {
          const limit = Math.min(payload.options?.limit ?? 100, 100);
          result = await collection
            .find(payload.filter || {}, {
              projection: payload.projection,
              maxTimeMS,
            })
            .limit(limit)
            .toArray();
          break;
        }
        case "aggregate": {
          const pipeline = payload.pipeline || [];
          result = await collection
            .aggregate(pipeline, { maxTimeMS })
            .toArray();
          break;
        }
        case "insertOne": {
          result = await collection.insertOne(payload.document || {});
          break;
        }
        case "insertMany": {
          result = await collection.insertMany(payload.documents || []);
          break;
        }
        case "updateOne": {
          result = await collection.updateOne(
            payload.filter || {},
            payload.update || {},
            payload.options || {},
          );
          break;
        }
        case "updateMany": {
          result = await collection.updateMany(
            payload.filter || {},
            payload.update || {},
            payload.options || {},
          );
          break;
        }
        case "deleteOne": {
          result = await collection.deleteOne(payload.filter || {});
          break;
        }
        case "deleteMany": {
          result = await collection.deleteMany(payload.filter || {});
          break;
        }
        case "countDocuments": {
          result = await collection.countDocuments(payload.filter || {}, { maxTimeMS });
          break;
        }
        default:
          throw new BadRequestException(`Unsupported operation: ${operation.operator}`);
      }

      const executionTimeMs = Math.round(performance.now() - start);
      return { result, executionTimeMs };
    } catch (err: any) {
      this.logger.error(`MongoDB execution error: ${err.message}`);
      throw new BadRequestException(err.message || "MongoDB execution failed");
    } finally {
      await client.close().catch(() => {});
    }
  }
}
