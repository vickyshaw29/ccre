import { z } from "zod";

export const ParticipantSchema = z.object({
  id: z.string().min(1),
  domains: z.array(z.string().min(1)).min(1),
  parties: z.array(z.string().min(1)).min(1),
  // Optional: package ids this participant has vetted. When present, the
  // router dry-run requires input packages to be vetted by hosting participants.
  vettedPackages: z.array(z.string().min(1)).optional(),
});

export const DomainSchema = z.object({
  id: z.string().min(1),
  // Optional: synchronizer priority used by Canton's router as the first tie-breaker.
  priority: z.number().int().optional(),
});

export const TopologyConfigSchema = z.object({
  version: z.string(),
  domains: z.array(DomainSchema).min(1),
  participants: z.array(ParticipantSchema).min(1),
});

export type Participant = z.infer<typeof ParticipantSchema>;
export type Domain = z.infer<typeof DomainSchema>;
export type TopologyConfig = z.infer<typeof TopologyConfigSchema>;
