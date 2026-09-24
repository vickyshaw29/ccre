#!/usr/bin/env node

import { Command } from "commander";
import { parseContractModel, parseWorkflowIntent, parseTopologyConfig, parseTransaction, getRawFileContent, CcreError } from "./core/parser.js";
import { dryRunRouting, formatRoutingTextReport } from "./core/router.js";
import { runPipeline } from "./core/pipeline.js";
import { runTopologyPipeline } from "./core/topology-pipeline.js";
import { generateCertificate, writeCertificate } from "./core/certificate.js";
import { formatTextReport, formatJsonReport, formatTopologyTextReport, formatTopologyJsonReport } from "./core/reporter.js";
import { EXIT_CODES } from "./types.js";
import { VERSION } from "./version.js";

const program = new Command();

program
  .name("ccre")
  .description("Canton Composition Reasoning Engine — Pre-execution validation for multi-app Canton workflows")
  .version(VERSION);

program
  .command("validate")
  .description("Validate a workflow intent against a contract model")
  .requiredOption("--schema <path>", "Path to contract interface JSON")
  .option("--intent <path>", "Path to workflow intent JSON (required unless --topology is provided)")
  .option("--topology <path>", "Path to topology configuration JSON (enables multi-synchronizer analysis)")
  .option("--json", "Output machine-readable JSON instead of text")
  .option("--cert <path>", "Path to write certificate file", "./ccre-cert.json")
  .action((opts) => {
    try {
      const model = parseContractModel(opts.schema);

      if (opts.topology) {
        const topology = parseTopologyConfig(opts.topology);
        const topoResult = runTopologyPipeline(model, topology);

        if (opts.json) {
          console.log(formatTopologyJsonReport(topoResult));
        } else {
          console.log(formatTopologyTextReport(topoResult));
        }

        const exitCode =
          topoResult.deployment_decision === "BLOCKED"
            ? EXIT_CODES.UNSAFE
            : topoResult.deployment_decision === "WARNING"
              ? EXIT_CODES.UNSUPPORTED
              : EXIT_CODES.SAFE;

        process.exit(exitCode);
      }

      if (!opts.intent) {
        console.error("Error: --intent is required when --topology is not provided");
        process.exit(EXIT_CODES.INPUT_ERROR);
      }

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

program
  .command("route")
  .description("Dry-run Canton's synchronizer router for a transaction against a topology")
  .requiredOption("--schema <path>", "Path to contract interface JSON")
  .requiredOption("--topology <path>", "Path to topology configuration JSON")
  .requiredOption("--tx <path>", "Path to transaction JSON (submitter and input contracts with their locations)")
  .option("--json", "Output machine-readable JSON instead of text")
  .action((opts) => {
    try {
      const model = parseContractModel(opts.schema);
      const topology = parseTopologyConfig(opts.topology);
      const tx = parseTransaction(opts.tx);
      const result = dryRunRouting(model, topology, tx);

      if (opts.json) {
        console.log(JSON.stringify(result, null, 2));
      } else {
        console.log(formatRoutingTextReport(result));
      }

      process.exit(result.decision === "ROUTABLE" ? EXIT_CODES.SAFE : EXIT_CODES.UNSAFE);
    } catch (err) {
      if (err instanceof CcreError) {
        console.error(`Error: ${err.message}`);
        process.exit(err.code);
      }
      throw err;
    }
  });

program.parse();
