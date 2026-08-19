import { Injectable, Logger, InternalServerErrorException, NotFoundException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { MongoClient, ObjectId } from "mongodb";
import { MinioService } from "../../integrations/minio/minio.service";
import { PrismaService } from "../../prisma/prisma.service";
import * as crypto from "crypto";

@Injectable()
export class NosqlSandboxService {
  private readonly logger = new Logger(NosqlSandboxService.name);
  private mongodbUrl: string;
  private bucketGeneral: string;

  constructor(
    private readonly configService: ConfigService,
    private readonly minioService: MinioService,
    private readonly prisma: PrismaService,
  ) {
    this.mongodbUrl =
      this.configService.get<string>("mongodbUrl") ||
      this.configService.get<string>("app.mongodbUrl") ||
      process.env.MONGODB_URL ||
      "mongodb://admin:adminpassword@localhost:27017/admin";

    this.bucketGeneral =
      this.configService.get<string>("minio.bucketGeneral") ||
      this.configService.get<string>("app.minio.bucketGeneral") ||
      "cd-recruit-general";
  }

  /**
   * Helper to parse Extended JSON representation of BSON types (like $oid, $date).
   */
  private parseExtendedJson(val: any): any {
    if (val === null || val === undefined) return val;
    if (Array.isArray(val)) {
      return val.map((item) => this.parseExtendedJson(item));
    }
    if (typeof val === "object") {
      if (val.$oid && typeof val.$oid === "string") {
        try {
          return new ObjectId(val.$oid);
        } catch {
          return val.$oid;
        }
      }
      if (val.$date) {
        if (typeof val.$date === "string") {
          return new Date(val.$date);
        }
        if (typeof val.$date === "number") {
          return new Date(val.$date);
        }
        if (val.$date.$numberLong && typeof val.$date.$numberLong === "string") {
          return new Date(parseInt(val.$date.$numberLong, 10));
        }
      }
      const parsedObj: Record<string, any> = {};
      for (const key of Object.keys(val)) {
        parsedObj[key] = this.parseExtendedJson(val[key]);
      }
      return parsedObj;
    }
    return val;
  }

  /**
   * Helper to retrieve and parse the seed JSON from MinIO.
   */
  private async getSeedDataFromMinio(datasetRef: string): Promise<Record<string, any[]>> {
    let stream = null;
    try {
      stream = await this.minioService.getObjectStream(this.bucketGeneral, datasetRef);
    } catch (err: any) {
      this.logger.warn(`Failed to open seed stream from MinIO: ${err.message}`);
    }

    if (!stream) {
      this.logger.warn(`Failed to get seed stream for datasetRef: ${datasetRef} (MinIO may be offline or object missing). Creating and auto-uploading default seed.`);
      const defaultSeed = {
        employees: [
          { _id: { $oid: "60c72b2f9b1d8e25d8f6d654" }, name: "Alice", salary: 95000, department: "Engineering" },
          { _id: { $oid: "60c72b2f9b1d8e25d8f6d655" }, name: "Bob", salary: 45000, department: "Sales" },
          { _id: { $oid: "60c72b2f9b1d8e25d8f6d656" }, name: "Charlie", salary: 110000, department: "Engineering" },
          { _id: { $oid: "60c72b2f9b1d8e25d8f6d657" }, name: "David", salary: 60000, department: "HR" },
        ],
      };
      await this.minioService.putObject(
        this.bucketGeneral,
        datasetRef,
        Buffer.from(JSON.stringify(defaultSeed, null, 2)),
        { "Content-Type": "application/json" }
      ).catch((err) => {
        this.logger.error(`Failed to auto-upload seed data to MinIO: ${err.message}`);
      });
      return defaultSeed;
    }

    return new Promise((resolve, reject) => {
      let data = "";
      stream.on("data", (chunk) => (data += chunk.toString()));
      stream.on("end", () => {
        try {
          const parsed = JSON.parse(data);
          resolve(parsed);
        } catch (err: any) {
          reject(new Error(`Failed to parse seed JSON: ${err.message}`));
        }
      });
      stream.on("error", (err) => reject(err));
    });
  }

  /**
   * Generates a unique database name, initializes it, seeds the collections, and stores it in the attempt.
   */
  async createSandbox(sessionId: string, questionId: string): Promise<{ sandboxDbName: string }> {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question) {
      throw new NotFoundException("Question not found");
    }

    const content = question.content as any;
    const datasetRef = content?.datasetRef || "";
    const collections = content?.collections || [];

    // Generate unique database sandbox name (under 64-byte limit)
    const randomSuffix = crypto.randomBytes(4).toString("hex");
    const dbHash = crypto.createHash("md5").update(sessionId + questionId).digest("hex");
    const sandboxDbName = `nosql_${dbHash}_${randomSuffix}`;

    const client = new MongoClient(this.mongodbUrl);
    try {
      await client.connect();
      const db = client.db(sandboxDbName);

      // Create collections and load seed data
      if (datasetRef) {
        const seedData = await this.getSeedDataFromMinio(datasetRef);
        for (const colName of collections) {
          const rawDocs = seedData[colName] || [];
          const parsedDocs = this.parseExtendedJson(rawDocs);

          if (parsedDocs.length > 0) {
            await db.collection(colName).insertMany(parsedDocs);
          } else {
            // Ensure collection is created even if empty
            await db.createCollection(colName);
          }
        }
      } else {
        // Fallback: create empty collections if no datasetRef provided
        for (const colName of collections) {
          await db.createCollection(colName);
        }
      }

      this.logger.log(`Created and seeded NoSQL sandbox DB: ${sandboxDbName}`);

      // Save sandbox db name to attempt row
      await this.prisma.moduleResponse.upsert({
        where: {
          sessionId_questionId: {
            sessionId,
            questionId,
          },
        },
        update: {
          sandboxDbName,
        },
        create: {
          sessionId,
          questionId,
          sandboxDbName,
          responsePayload: {},
        },
      });

      return { sandboxDbName };
    } catch (err: any) {
      this.logger.error(`Failed to create/seed sandbox ${sandboxDbName}: ${err.message}`);
      throw new InternalServerErrorException(err.message || "Failed to initialize NoSQL sandbox");
    } finally {
      await client.close().catch(() => {});
    }
  }

  /**
   * Resets an existing sandbox database back to its seed state.
   */
  async resetSandbox(sandboxDbName: string, questionId: string): Promise<void> {
    const question = await this.prisma.question.findUnique({
      where: { id: questionId },
    });
    if (!question) {
      throw new NotFoundException("Question not found");
    }

    const content = question.content as any;
    const datasetRef = content?.datasetRef || "";
    const collections = content?.collections || [];

    const client = new MongoClient(this.mongodbUrl);
    try {
      await client.connect();
      const db = client.db(sandboxDbName);

      // Drop all collections to clear state
      const existingCollections = await db.listCollections().toArray();
      for (const col of existingCollections) {
        await db.collection(col.name).drop().catch(() => {});
      }

      // Re-seed collections
      if (datasetRef) {
        const seedData = await this.getSeedDataFromMinio(datasetRef);
        for (const colName of collections) {
          const rawDocs = seedData[colName] || [];
          const parsedDocs = this.parseExtendedJson(rawDocs);

          if (parsedDocs.length > 0) {
            await db.collection(colName).insertMany(parsedDocs);
          } else {
            await db.createCollection(colName);
          }
        }
      } else {
        for (const colName of collections) {
          await db.createCollection(colName);
        }
      }

      this.logger.log(`Successfully reset NoSQL sandbox DB: ${sandboxDbName}`);
    } catch (err: any) {
      this.logger.error(`Failed to reset sandbox ${sandboxDbName}: ${err.message}`);
      throw new InternalServerErrorException(err.message || "Failed to reset NoSQL sandbox");
    } finally {
      await client.close().catch(() => {});
    }
  }

  /**
   * Drops a sandbox database completely.
   */
  async dropSandbox(sandboxDbName: string): Promise<void> {
    if (!sandboxDbName) return;

    const client = new MongoClient(this.mongodbUrl);
    try {
      await client.connect();
      const db = client.db(sandboxDbName);
      await db.dropDatabase();
      this.logger.log(`Dropped NoSQL sandbox DB: ${sandboxDbName}`);
    } catch (err: any) {
      this.logger.error(`Failed to drop sandbox DB ${sandboxDbName}: ${err.message}`);
    } finally {
      await client.close().catch(() => {});
    }
  }
}
