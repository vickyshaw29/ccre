export function getVisibilityFix(templateName: string, actor: string): {
  fix: string;
  why: string;
  safetyWarning: string;
} {
  return {
    fix: `Modify ${templateName} template definition to include ${actor} as observer`,
    why: "Observers are included in the contract's visibility set, allowing the actor to see the contract",
    safetyWarning: `Modifying template visibility affects all workflows using ${templateName}`,
  };
}

export function getAuthorizationFix(
  templateName: string,
  actor: string,
  choiceName: string,
): { fix: string; why: string; safetyWarning: string } {
  return {
    fix: `Modify ${templateName} template definition to include ${actor} as controller for ${choiceName}`,
    why: "Controllers are the only parties authorized to exercise a choice",
    safetyWarning: `Changing controllers on ${choiceName} may alter business logic and authorization policies`,
  };
}
