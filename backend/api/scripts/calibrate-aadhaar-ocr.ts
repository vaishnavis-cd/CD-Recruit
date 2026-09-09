import * as fs from "fs";
import * as path from "path";
import { IdOcrService } from "../src/integrations/ocr/id-ocr.service";
import { NameMatchService } from "../src/common/services/name-match.service";

/**
 * CLI Standalone Aadhaar / Multi-ID OCR & Name Matching Calibration Script
 *
 * Usage:
 *   npx tsx scripts/calibrate-aadhaar-ocr.ts --dir=./sample-aadhaars --csv=./ground_truth.csv
 *
 * Output:
 *   Outputs tabular performance analysis to console and exports output_calibration_results.csv
 */
async function main() {
  const args = process.argv.slice(2);
  const dirArg = args.find((a) => a.startsWith("--dir="))?.split("=")[1];
  const csvArg = args.find((a) => a.startsWith("--csv="))?.split("=")[1];

  if (!dirArg || !csvArg) {
    console.log(`
Usage:
  npx tsx scripts/calibrate-aadhaar-ocr.ts --dir=<path_to_images_dir> --csv=<path_to_ground_truth_csv>

Ground Truth CSV Format:
  filename,registeredName
  sample1.jpg,Vaishnavi S
  sample2.jpg,Sathya Narayanan
`);
    process.exit(1);
  }

  const imagesDir = path.resolve(process.cwd(), dirArg);
  const csvPath = path.resolve(process.cwd(), csvArg);

  if (!fs.existsSync(imagesDir)) {
    console.error(`Error: Images directory not found at ${imagesDir}`);
    process.exit(1);
  }
  if (!fs.existsSync(csvPath)) {
    console.error(`Error: Ground truth CSV not found at ${csvPath}`);
    process.exit(1);
  }

  console.log(`\n======================================================`);
  console.log(`  MULTI-ID OCR & NAME MATCHING CALIBRATION BENCHMARK`);
  console.log(`======================================================\n`);
  console.log(`Loading images from : ${imagesDir}`);
  console.log(`Loading ground truth: ${csvPath}\n`);

  // Parse CSV
  const csvContent = fs.readFileSync(csvPath, "utf-8");
  const csvLines = csvContent.split(/\r?\n/).filter((l) => l.trim().length > 0);

  const groundTruthMap = new Map<string, string>();
  for (let i = 0; i < csvLines.length; i++) {
    const line = csvLines[i];
    if (i === 0 && (line.toLowerCase().includes("filename") || line.toLowerCase().includes("imagefile"))) {
      continue; // skip header
    }
    const parts = line.split(",").map((p) => p.trim().replace(/^["']|["']$/g, ""));
    if (parts.length >= 2) {
      groundTruthMap.set(parts[0], parts[1]);
    }
  }

  const ocrService = new IdOcrService();
  await ocrService.onModuleInit();
  const nameService = new NameMatchService();

  const results: any[] = [];
  const outputCsvRows = [
    "imageFile,extractedName,registeredName,similarityScore,ocrConfidence,matched,ocrRawText",
  ];

  const files = fs.readdirSync(imagesDir).filter((f) => /\.(jpg|jpeg|png|webp)$/i.test(f));

  console.log(`Found ${files.length} test images. Running OCR pipeline...\n`);

  for (const file of files) {
    const imagePath = path.join(imagesDir, file);
    const registeredName = groundTruthMap.get(file) || "UNKNOWN_REGISTERED_NAME";

    const imageBuffer = fs.readFileSync(imagePath);
    const ocrRes = await ocrService.extractIdName(imageBuffer);
    const extractedName = ocrRes.name || "";

    let numConfidence = 0.5;
    if (ocrRes.confidence === "high") numConfidence = 0.95;
    else if (ocrRes.confidence === "medium") numConfidence = 0.8;
    else if (ocrRes.confidence === "low-medium") numConfidence = 0.65;
    else if (ocrRes.confidence === "low") numConfidence = 0.4;

    const nameRes = nameService.compareNames(registeredName, extractedName);

    const record = {
      imageFile: file,
      extractedName,
      registeredName,
      similarityScore: nameRes.similarity,
      ocrConfidence: numConfidence,
      matched: nameRes.matched,
      rawText: JSON.stringify(ocrRes.rawLines || []),
    };

    results.push(record);

    const cleanExtracted = `"${extractedName.replace(/"/g, '""')}"`;
    const cleanRegistered = `"${registeredName.replace(/"/g, '""')}"`;
    const cleanRaw = `"${record.rawText.replace(/"/g, '""')}"`;

    outputCsvRows.push(
      `${file},${cleanExtracted},${cleanRegistered},${record.similarityScore},${record.ocrConfidence},${record.matched},${cleanRaw}`,
    );

    console.log(
      `[${file}] Extracted: "${extractedName}" | Registered: "${registeredName}" | Sim: ${record.similarityScore} | Conf: ${record.ocrConfidence} | Match: ${record.matched ? "✓ YES" : "✗ NO"}`,
    );
  }

  const outputCsvPath = path.resolve(process.cwd(), "output_calibration_results.csv");
  fs.writeFileSync(outputCsvPath, outputCsvRows.join("\n"), "utf-8");

  console.log(`\n======================================================`);
  console.log(`  CALIBRATION BENCHMARK COMPLETED`);
  console.log(`======================================================`);
  console.log(`Exported full calibration CSV to: ${outputCsvPath}\n`);
}

main().catch((err) => {
  console.error("Fatal error during calibration benchmark:", err);
  process.exit(1);
});
