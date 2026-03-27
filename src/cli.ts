#!/usr/bin/env node

import { Command } from "commander";
import { parseContractModel, parseWorkflowIntent, getRawFileContent, CcreError } from "./core/parser.js";
import { runPipeline } from "./core/pipeline.js";
import { generateCertificate, writeCertificate } from "./core/certificate.js";
import { formatTextReport, formatJsonReport } from "./core/reporter.js";
import { EXIT_CODES } from "./types.js";

const program = new Command();

program
  .name("ccre")
  .description("Canton Composition Reasoning Engine — Pre-execution validation for multi-app Canton workflows")
  .version("0.1.0");

program
  .command("validate")
  .description("Validate a workflow intent against a contract model")
  .requiredOption("--schema <path>", "Path to contract interface JSON")
  .requiredOption("--intent <path>", "Path to workflow intent JSON")
  .option("--json", "Output machine-readable JSON instead of text")
  .option("--cert <path>", "Path to write certificate file", "./ccre-cert.json")
  .action((opts) => {
    try {
      const model = parseContractModel(opts.schema);
      const intent = parseWorkflowIntent(opts.intent);

      const result = runPipeline(model, intent);

      let certificate;
      if (result.verdict === "SAFE") {
        const schemaRaw = getRawFileContent(opts.schema);
        const intentRaw = getRawFileContent(opts.intent);
        certificate = generateCertificate(result, schemaRaw, intentRaw);
        writeCertificate(certificate, opts.cert);
      }

      if (opts.json) {
        console.log(formatJsonReport(result, certificate));
      } else {
        console.log(formatTextReport(result, certificate, opts.cert));
      }

      const exitCode =
        result.verdict === "SAFE"
          ? EXIT_CODES.SAFE
          : result.verdict === "UNSAFE"
            ? EXIT_CODES.UNSAFE
            : EXIT_CODES.UNSUPPORTED;

      process.exit(exitCode);
    } catch (err) {
      if (err instanceof CcreError) {
        console.error(`Error: ${err.message}`);
        process.exit(err.code);
      }
      throw err;
    }
  });

program.parse();
