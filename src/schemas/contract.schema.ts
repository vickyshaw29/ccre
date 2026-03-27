import { z } from "zod";

export const ChoiceSchema = z.object({
  name: z.string().min(1),
  controllers: z.array(z.string().min(1)).min(1),
  consuming: z.boolean(),
});

export const ContractTemplateSchema = z.object({
  name: z.string().min(1),
  packageId: z.string().min(1),
  signatories: z.array(z.string().min(1)).min(1),
  observers: z.array(z.string().min(1)),
  choices: z.array(ChoiceSchema).min(1),
});

export const ContractModelSchema = z.object({
  version: z.string(),
  templates: z.array(ContractTemplateSchema).min(1),
});

export type Choice = z.infer<typeof ChoiceSchema>;
export type ContractTemplate = z.infer<typeof ContractTemplateSchema>;
export type ContractModel = z.infer<typeof ContractModelSchema>;
