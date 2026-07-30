export type CalendarMappingCoverageResource = {
  id: string;
  name: string;
  active: boolean;
};

export type CalendarMappingCoverageMapping = {
  resourceId: string;
  status: "connected" | "sync_failed" | "disabled";
} | null;

export type CalendarMappingCoverageSummary = {
  totalActiveResources: number;
  connectedResources: number;
  missingResourceNames: string[];
  unhealthyResourceNames: string[];
  ready: boolean;
};

export function buildCalendarMappingCoverage(input: {
  resources: CalendarMappingCoverageResource[];
  mappingsByResourceId: Map<string, CalendarMappingCoverageMapping>;
}): CalendarMappingCoverageSummary {
  const activeResources = input.resources.filter((resource) => resource.active);
  const missingResourceNames: string[] = [];
  const unhealthyResourceNames: string[] = [];
  let connectedResources = 0;

  for (const resource of activeResources) {
    const mapping = input.mappingsByResourceId.get(resource.id) ?? null;
    if (!mapping) {
      missingResourceNames.push(resource.name);
      continue;
    }
    if (mapping.status === "connected") {
      connectedResources += 1;
      continue;
    }
    unhealthyResourceNames.push(resource.name);
  }

  return {
    totalActiveResources: activeResources.length,
    connectedResources,
    missingResourceNames,
    unhealthyResourceNames,
    ready:
      activeResources.length > 0 &&
      missingResourceNames.length === 0 &&
      unhealthyResourceNames.length === 0,
  };
}
