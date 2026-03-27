import { z } from "zod";

export const WorkflowStepSchema = z.object({
  action: z.string().min(1),
  role: z.string().min(1),
  by: z.string().min(1),
});

export const WorkflowIntentSchema = z.object({
  pattern: z.string().min(1),
  steps: z.array(WorkflowStepSchema).min(1),
  bindings: z.record(z.string().min(1), z.string().min(1)),
});

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>;
export type WorkflowIntent = z.infer<typeof WorkflowIntentSchema>;
