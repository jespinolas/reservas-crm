import { z } from "zod";
import { newId } from "@/lib/db/ids";

export const resourceKindSchema = z.enum([
  "football_field",
  "room",
  "venue",
  "cabin",
  "other",
]);

export type ResourceKind = z.infer<typeof resourceKindSchema>;

export type BusinessConfiguration = {
  id: string;
  organizationId: string;
  timezone: string;
  defaultSlotMinutes: number;
  defaultHoldMinutes: number;
  holdsBlockAvailability: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type ReservableResource = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  kind: ResourceKind;
  location: string | null;
  capacity: number;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export type ReservationServiceDefinition = {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  durationMinutes: number;
  active: boolean;
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
};

export interface ReservationCatalogRepository {
  saveBusinessConfiguration(configuration: BusinessConfiguration): Promise<void>;
  findBusinessConfiguration(organizationId: string): Promise<BusinessConfiguration | null>;
  saveResource(resource: ReservableResource): Promise<void>;
  findResourceById(organizationId: string, id: string): Promise<ReservableResource | null>;
  findActiveResourceByName(
    organizationId: string,
    name: string
  ): Promise<ReservableResource | null>;
  listResources(organizationId: string): Promise<ReservableResource[]>;
  saveReservationService(service: ReservationServiceDefinition): Promise<void>;
  findReservationServiceById(
    organizationId: string,
    id: string
  ): Promise<ReservationServiceDefinition | null>;
  findActiveReservationServiceByName(
    organizationId: string,
    name: string
  ): Promise<ReservationServiceDefinition | null>;
  listReservationServices(organizationId: string): Promise<ReservationServiceDefinition[]>;
}

const configurationInputSchema = z.object({
  timezone: z.string().min(1).default("America/Asuncion"),
  defaultSlotMinutes: z.number().int().min(5).max(1440).default(60),
  defaultHoldMinutes: z.number().int().min(1).max(1440).default(10),
  holdsBlockAvailability: z.boolean().default(true),
});

const resourceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  kind: resourceKindSchema.default("other"),
  location: z.string().trim().max(240).nullable().optional(),
  capacity: z.number().int().min(1).max(10000).default(1),
  sortOrder: z.number().int().min(0).default(0),
});

const serviceInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  description: z.string().trim().max(1000).nullable().optional(),
  durationMinutes: z.number().int().min(5).max(1440),
  sortOrder: z.number().int().min(0).default(0),
});

export class ReservationCatalogError extends Error {
  constructor(readonly code: "duplicate" | "not_found") {
    super(code);
    this.name = "ReservationCatalogError";
  }
}

export class ReservationCatalogService {
  constructor(private readonly repository: ReservationCatalogRepository) {}

  async getOrCreateBusinessConfiguration(input: {
    organizationId: string;
    now?: Date;
  }): Promise<BusinessConfiguration> {
    const organizationId = organizationIdSchema.parse(input.organizationId);
    const existing = await this.repository.findBusinessConfiguration(organizationId);
    if (existing) return existing;
    const now = input.now ?? new Date();
    const configuration: BusinessConfiguration = {
      id: newId("businessConfiguration"),
      organizationId,
      timezone: "America/Asuncion",
      defaultSlotMinutes: 60,
      defaultHoldMinutes: 10,
      holdsBlockAvailability: true,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.saveBusinessConfiguration(configuration);
    return cloneConfiguration(configuration);
  }

  async updateBusinessConfiguration(input: {
    organizationId: string;
    timezone?: string;
    defaultSlotMinutes?: number;
    defaultHoldMinutes?: number;
    holdsBlockAvailability?: boolean;
    now?: Date;
  }): Promise<BusinessConfiguration> {
    const organizationId = organizationIdSchema.parse(input.organizationId);
    const current = await this.getOrCreateBusinessConfiguration({
      organizationId,
      now: input.now,
    });
    const parsed = configurationInputSchema.parse({
      timezone: input.timezone ?? current.timezone,
      defaultSlotMinutes: input.defaultSlotMinutes ?? current.defaultSlotMinutes,
      defaultHoldMinutes: input.defaultHoldMinutes ?? current.defaultHoldMinutes,
      holdsBlockAvailability: input.holdsBlockAvailability ?? current.holdsBlockAvailability,
    });
    const updated: BusinessConfiguration = {
      ...current,
      ...parsed,
      updatedAt: input.now ?? new Date(),
    };
    await this.repository.saveBusinessConfiguration(updated);
    return cloneConfiguration(updated);
  }

  async createResource(input: {
    organizationId: string;
    name: string;
    description?: string | null;
    kind?: ResourceKind;
    location?: string | null;
    capacity?: number;
    sortOrder?: number;
    now?: Date;
  }): Promise<ReservableResource> {
    const organizationId = organizationIdSchema.parse(input.organizationId);
    const parsed = resourceInputSchema.parse(input);
    await this.assertUniqueResourceName(organizationId, parsed.name);
    const now = input.now ?? new Date();
    const resource: ReservableResource = {
      id: newId("resource"),
      organizationId,
      name: parsed.name,
      description: parsed.description ?? null,
      kind: parsed.kind,
      location: parsed.location ?? null,
      capacity: parsed.capacity,
      active: true,
      sortOrder: parsed.sortOrder,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.saveResource(resource);
    return cloneResource(resource);
  }

  async updateResource(input: {
    organizationId: string;
    id: string;
    name?: string;
    description?: string | null;
    kind?: ResourceKind;
    location?: string | null;
    capacity?: number;
    sortOrder?: number;
    now?: Date;
  }): Promise<ReservableResource> {
    const organizationId = organizationIdSchema.parse(input.organizationId);
    const current = await this.requireResource(organizationId, input.id);
    const parsed = resourceInputSchema.partial().parse(input);
    const nextName = parsed.name ?? current.name;
    if (current.active && nextName !== current.name) {
      await this.assertUniqueResourceName(organizationId, nextName, current.id);
    }
    const updated: ReservableResource = {
      ...current,
      name: nextName,
      description: parsed.description === undefined ? current.description : parsed.description,
      kind: parsed.kind ?? current.kind,
      location: parsed.location === undefined ? current.location : parsed.location,
      capacity: parsed.capacity ?? current.capacity,
      sortOrder: parsed.sortOrder ?? current.sortOrder,
      updatedAt: input.now ?? new Date(),
    };
    await this.repository.saveResource(updated);
    return cloneResource(updated);
  }

  async disableResource(input: {
    organizationId: string;
    id: string;
    now?: Date;
  }): Promise<ReservableResource> {
    const resource = await this.requireResource(input.organizationId, input.id);
    const disabled = { ...resource, active: false, updatedAt: input.now ?? new Date() };
    await this.repository.saveResource(disabled);
    return cloneResource(disabled);
  }

  async listResources(organizationId: string): Promise<ReservableResource[]> {
    return this.repository.listResources(organizationIdSchema.parse(organizationId));
  }

  async createReservationService(input: {
    organizationId: string;
    name: string;
    description?: string | null;
    durationMinutes: number;
    sortOrder?: number;
    now?: Date;
  }): Promise<ReservationServiceDefinition> {
    const organizationId = organizationIdSchema.parse(input.organizationId);
    const parsed = serviceInputSchema.parse(input);
    await this.assertUniqueReservationServiceName(organizationId, parsed.name);
    const now = input.now ?? new Date();
    const service: ReservationServiceDefinition = {
      id: newId("reservationService"),
      organizationId,
      name: parsed.name,
      description: parsed.description ?? null,
      durationMinutes: parsed.durationMinutes,
      active: true,
      sortOrder: parsed.sortOrder,
      createdAt: now,
      updatedAt: now,
    };
    await this.repository.saveReservationService(service);
    return cloneService(service);
  }

  async disableReservationService(input: {
    organizationId: string;
    id: string;
    now?: Date;
  }): Promise<ReservationServiceDefinition> {
    const service = await this.requireReservationService(input.organizationId, input.id);
    const disabled = { ...service, active: false, updatedAt: input.now ?? new Date() };
    await this.repository.saveReservationService(disabled);
    return cloneService(disabled);
  }

  async listReservationServices(
    organizationId: string
  ): Promise<ReservationServiceDefinition[]> {
    return this.repository.listReservationServices(organizationIdSchema.parse(organizationId));
  }

  private async requireResource(
    organizationId: string,
    id: string
  ): Promise<ReservableResource> {
    const resource = await this.repository.findResourceById(
      organizationIdSchema.parse(organizationId),
      z.string().min(1).parse(id)
    );
    if (!resource) throw new ReservationCatalogError("not_found");
    return resource;
  }

  private async requireReservationService(
    organizationId: string,
    id: string
  ): Promise<ReservationServiceDefinition> {
    const service = await this.repository.findReservationServiceById(
      organizationIdSchema.parse(organizationId),
      z.string().min(1).parse(id)
    );
    if (!service) throw new ReservationCatalogError("not_found");
    return service;
  }

  private async assertUniqueResourceName(
    organizationId: string,
    name: string,
    exceptId?: string
  ) {
    const existing = await this.repository.findActiveResourceByName(organizationId, name);
    if (existing && existing.id !== exceptId) throw new ReservationCatalogError("duplicate");
  }

  private async assertUniqueReservationServiceName(
    organizationId: string,
    name: string
  ) {
    const existing = await this.repository.findActiveReservationServiceByName(
      organizationId,
      name
    );
    if (existing) throw new ReservationCatalogError("duplicate");
  }
}

export class InMemoryReservationCatalogRepository implements ReservationCatalogRepository {
  private readonly configurations = new Map<string, BusinessConfiguration>();
  private readonly resources = new Map<string, ReservableResource>();
  private readonly services = new Map<string, ReservationServiceDefinition>();

  async saveBusinessConfiguration(configuration: BusinessConfiguration): Promise<void> {
    this.configurations.set(configuration.organizationId, cloneConfiguration(configuration));
  }

  async findBusinessConfiguration(organizationId: string): Promise<BusinessConfiguration | null> {
    const configuration = this.configurations.get(organizationId);
    return configuration ? cloneConfiguration(configuration) : null;
  }

  async saveResource(resource: ReservableResource): Promise<void> {
    this.resources.set(resource.id, cloneResource(resource));
  }

  async findResourceById(
    organizationId: string,
    id: string
  ): Promise<ReservableResource | null> {
    const resource = this.resources.get(id);
    return resource?.organizationId === organizationId ? cloneResource(resource) : null;
  }

  async findActiveResourceByName(
    organizationId: string,
    name: string
  ): Promise<ReservableResource | null> {
    const resource = [...this.resources.values()].find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        candidate.active &&
        candidate.name === name
    );
    return resource ? cloneResource(resource) : null;
  }

  async listResources(organizationId: string): Promise<ReservableResource[]> {
    return [...this.resources.values()]
      .filter((resource) => resource.organizationId === organizationId)
      .sort(sortCatalogItems)
      .map(cloneResource);
  }

  async saveReservationService(service: ReservationServiceDefinition): Promise<void> {
    this.services.set(service.id, cloneService(service));
  }

  async findReservationServiceById(
    organizationId: string,
    id: string
  ): Promise<ReservationServiceDefinition | null> {
    const service = this.services.get(id);
    return service?.organizationId === organizationId ? cloneService(service) : null;
  }

  async findActiveReservationServiceByName(
    organizationId: string,
    name: string
  ): Promise<ReservationServiceDefinition | null> {
    const service = [...this.services.values()].find(
      (candidate) =>
        candidate.organizationId === organizationId &&
        candidate.active &&
        candidate.name === name
    );
    return service ? cloneService(service) : null;
  }

  async listReservationServices(
    organizationId: string
  ): Promise<ReservationServiceDefinition[]> {
    return [...this.services.values()]
      .filter((service) => service.organizationId === organizationId)
      .sort(sortCatalogItems)
      .map(cloneService);
  }
}

const organizationIdSchema = z.string().min(1);

function sortCatalogItems<T extends { sortOrder: number; name: string }>(a: T, b: T): number {
  return a.sortOrder - b.sortOrder || a.name.localeCompare(b.name);
}

function cloneConfiguration(configuration: BusinessConfiguration): BusinessConfiguration {
  return {
    ...configuration,
    createdAt: new Date(configuration.createdAt),
    updatedAt: new Date(configuration.updatedAt),
  };
}

function cloneResource(resource: ReservableResource): ReservableResource {
  return {
    ...resource,
    createdAt: new Date(resource.createdAt),
    updatedAt: new Date(resource.updatedAt),
  };
}

function cloneService(service: ReservationServiceDefinition): ReservationServiceDefinition {
  return {
    ...service,
    createdAt: new Date(service.createdAt),
    updatedAt: new Date(service.updatedAt),
  };
}
