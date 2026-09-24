import { z } from "zod";

// Canton 3.3 renamed "domain" to "synchronizer". Topology files written for
// CCRE 0.1 use "domains"; they are still accepted and normalized here.
function renameLegacyDomains(value: unknown): unknown {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return value;
  const obj = value as Record<string, unknown>;
  if (obj.synchronizers !== undefined || obj.domains === undefined) return obj;
  const { domains, ...rest } = obj;
  return { ...rest, synchronizers: domains };
}

export const ParticipantSchema = z.preprocess(
  renameLegacyDomains,
  z.object({
    id: z.string().min(1),
    synchronizers: z.array(z.string().min(1)).min(1),
    parties: z.array(z.string().min(1)).min(1),
    // Optional: package ids this participant has vetted. When present, the
    // router dry-run requires input packages to be vetted by hosting participants.
    vettedPackages: z.array(z.string().min(1)).optional(),
  }),
);

export const SynchronizerSchema = z.object({
  id: z.string().min(1),
  // Optional: synchronizer priority used by Canton's router as the first tie-breaker.
  priority: z.number().int().optional(),
});

export const TopologyConfigSchema = z.preprocess(
  renameLegacyDomains,
  z.object({
    version: z.string(),
    synchronizers: z.array(SynchronizerSchema).min(1),
    participants: z.array(ParticipantSchema).min(1),
  }),
);

export type Participant = z.infer<typeof ParticipantSchema>;
export type Synchronizer = z.infer<typeof SynchronizerSchema>;
export type TopologyConfig = z.infer<typeof TopologyConfigSchema>;
