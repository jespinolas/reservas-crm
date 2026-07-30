import { describe, expect, it } from "vitest";
import { buildCalendarMappingCoverage } from "@/lib/calendar-mapping-coverage";

describe("buildCalendarMappingCoverage", () => {
  it("reports active resources without mappings as missing", () => {
    const coverage = buildCalendarMappingCoverage({
      resources: [
        { id: "res_1", name: "Casa 1", active: true },
        { id: "res_2", name: "Casa 2", active: true },
      ],
      mappingsByResourceId: new Map([
        ["res_1", { resourceId: "res_1", status: "connected" }],
      ]),
    });

    expect(coverage).toEqual({
      totalActiveResources: 2,
      connectedResources: 1,
      missingResourceNames: ["Casa 2"],
      unhealthyResourceNames: [],
      ready: false,
    });
  });

  it("reports sync-failed and disabled mappings as unhealthy", () => {
    const coverage = buildCalendarMappingCoverage({
      resources: [
        { id: "res_1", name: "Casa 1", active: true },
        { id: "res_2", name: "Casa 2", active: true },
      ],
      mappingsByResourceId: new Map([
        ["res_1", { resourceId: "res_1", status: "sync_failed" }],
        ["res_2", { resourceId: "res_2", status: "disabled" }],
      ]),
    });

    expect(coverage).toMatchObject({
      connectedResources: 0,
      missingResourceNames: [],
      unhealthyResourceNames: ["Casa 1", "Casa 2"],
      ready: false,
    });
  });

  it("returns ready when every active resource has connected mapping", () => {
    const coverage = buildCalendarMappingCoverage({
      resources: [
        { id: "res_1", name: "Casa 1", active: true },
        { id: "res_inactive", name: "Archivada", active: false },
      ],
      mappingsByResourceId: new Map([
        ["res_1", { resourceId: "res_1", status: "connected" }],
      ]),
    });

    expect(coverage).toEqual({
      totalActiveResources: 1,
      connectedResources: 1,
      missingResourceNames: [],
      unhealthyResourceNames: [],
      ready: true,
    });
  });
});
