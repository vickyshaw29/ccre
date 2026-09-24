import { z } from "zod";

export const TransactionInputSchema = z.object({
  template: z.string().min(1),
  // Synchronizer the input contract is currently assigned to.
  location: z.string().min(1),
});

export const TransactionSchema = z.object({
  version: z.string(),
  name: z.string().min(1),
  submitter: z.string().min(1),
  inputs: z.array(TransactionInputSchema).min(1),
});

export type TransactionInput = z.infer<typeof TransactionInputSchema>;
export type Transaction = z.infer<typeof TransactionSchema>;
