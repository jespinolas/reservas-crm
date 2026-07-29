import { count, eq } from "drizzle-orm";
import { getDb, schema } from "@/lib/db";

export type SetupStepStatus = "complete" | "incomplete" | "warning";

export type SetupStep = {
  id:
    | "business_profile"
    | "resources"
    | "services"
    | "availability"
    | "booking_rules"
    | "whatsapp"
    | "google_calendar"
    | "ai_readiness";
  label: string;
  status: SetupStepStatus;
  detail: string;
};

export type BusinessSetupStatus = {
  completed: boolean;
  reservationReady: boolean;
  integrationsReady: boolean;
  steps: SetupStep[];
  summary: {
    activeResources: number;
    activeServices: number;
    activeSchedules: number;
    whatsappConnected: boolean;
    googleCalendarConnected: boolean;
    aiConfigured: boolean;
  };
};

export interface SetupStatusRepository {
  getSnapshot(organizationId: string): Promise<{
    organizationName: string | null;
    businessConfiguration: {
      timezone: string;
      defaultSlotMinutes: number;
      defaultHoldMinutes: number;
    } | null;
    activeResources: number;
    activeServices: number;
    activeSchedules: number;
    whatsappConnected: boolean;
    googleCalendarConnected: boolean;
    aiConfigured: boolean;
  }>;
}

export class SetupStatusService {
  constructor(private readonly repository: SetupStatusRepository) {}

  async getStatus(organizationId: string): Promise<BusinessSetupStatus> {
    const snapshot = await this.repository.getSnapshot(organizationId);
    const steps: SetupStep[] = [
      {
        id: "business_profile",
        label: "Perfil del negocio",
        status: snapshot.organizationName && snapshot.businessConfiguration ? "complete" : "incomplete",
        detail: snapshot.businessConfiguration
          ? `${snapshot.organizationName ?? "Negocio"} · ${snapshot.businessConfiguration.timezone}`
          : "Falta configurar zona horaria y perfil base",
      },
      {
        id: "resources",
        label: "Recursos",
        status: snapshot.activeResources > 0 ? "complete" : "incomplete",
        detail:
          snapshot.activeResources > 0
            ? `${snapshot.activeResources} recursos activos`
            : "Agrega al menos un recurso reservable",
      },
      {
        id: "services",
        label: "Servicios",
        status: snapshot.activeServices > 0 ? "complete" : "incomplete",
        detail:
          snapshot.activeServices > 0
            ? `${snapshot.activeServices} servicios activos`
            : "Agrega al menos un servicio con duración",
      },
      {
        id: "availability",
        label: "Horarios",
        status: snapshot.activeSchedules > 0 ? "complete" : "incomplete",
        detail:
          snapshot.activeSchedules > 0
            ? `${snapshot.activeSchedules} bloques horarios activos`
            : "Configura horarios para los recursos",
      },
      {
        id: "booking_rules",
        label: "Reglas de reserva",
        status: snapshot.businessConfiguration ? "complete" : "incomplete",
        detail: snapshot.businessConfiguration
          ? `${snapshot.businessConfiguration.defaultSlotMinutes} min por bloque · hold ${snapshot.businessConfiguration.defaultHoldMinutes} min`
          : "Faltan reglas base de reserva",
      },
      {
        id: "whatsapp",
        label: "WhatsApp",
        status: snapshot.whatsappConnected ? "complete" : "warning",
        detail: snapshot.whatsappConnected
          ? "Número conectado"
          : "Conecta tu WhatsApp Business con Meta para recibir y responder mensajes",
      },
      {
        id: "google_calendar",
        label: "Google Calendar",
        status: snapshot.googleCalendarConnected ? "complete" : "warning",
        detail: snapshot.googleCalendarConnected
          ? "Calendario conectado"
          : "Pendiente, sincronización desactivada",
      },
      {
        id: "ai_readiness",
        label: "Agente IA",
        status: snapshot.aiConfigured ? "complete" : "warning",
        detail: snapshot.aiConfigured
          ? "Perfil del agente configurado"
          : "Pendiente, no habilita booking autónomo",
      },
    ];
    const reservationReady = steps
      .filter((step) =>
        ["business_profile", "resources", "services", "availability", "booking_rules"].includes(
          step.id
        )
      )
      .every((step) => step.status === "complete");
    return {
      completed: reservationReady,
      reservationReady,
      integrationsReady: snapshot.whatsappConnected && snapshot.googleCalendarConnected,
      steps,
      summary: {
        activeResources: snapshot.activeResources,
        activeServices: snapshot.activeServices,
        activeSchedules: snapshot.activeSchedules,
        whatsappConnected: snapshot.whatsappConnected,
        googleCalendarConnected: snapshot.googleCalendarConnected,
        aiConfigured: snapshot.aiConfigured,
      },
    };
  }
}

type Db = ReturnType<typeof getDb>;

export class DrizzleSetupStatusRepository implements SetupStatusRepository {
  constructor(private readonly db: Db = getDb()) {}

  async getSnapshot(organizationId: string) {
    const [
      organizations,
      configurations,
      resources,
      services,
      schedules,
      metaCredentials,
      googleConnections,
      agentProfiles,
    ] = await Promise.all([
      this.db
        .select({ name: schema.organization.name })
        .from(schema.organization)
        .where(eq(schema.organization.id, organizationId))
        .limit(1),
      this.db
        .select({
          timezone: schema.businessConfiguration.timezone,
          defaultSlotMinutes: schema.businessConfiguration.defaultSlotMinutes,
          defaultHoldMinutes: schema.businessConfiguration.defaultHoldMinutes,
        })
        .from(schema.businessConfiguration)
        .where(eq(schema.businessConfiguration.organizationId, organizationId))
        .limit(1),
      this.db
        .select({ value: count() })
        .from(schema.resource)
        .where(eq(schema.resource.organizationId, organizationId)),
      this.db
        .select({ value: count() })
        .from(schema.reservationService)
        .where(eq(schema.reservationService.organizationId, organizationId)),
      this.db
        .select({ value: count() })
        .from(schema.resourceSchedule)
        .where(eq(schema.resourceSchedule.organizationId, organizationId)),
      this.db
        .select({ id: schema.metaCredentials.id })
        .from(schema.metaCredentials)
        .where(eq(schema.metaCredentials.organizationId, organizationId))
        .limit(1),
      this.db
        .select({ status: schema.googleCalendarConnection.status })
        .from(schema.googleCalendarConnection)
        .where(eq(schema.googleCalendarConnection.organizationId, organizationId))
        .limit(1),
      this.db
        .select({ enabled: schema.agentProfile.enabled, instructions: schema.agentProfile.instructions })
        .from(schema.agentProfile)
        .where(eq(schema.agentProfile.organizationId, organizationId))
        .limit(1),
    ]);
    return {
      organizationName: organizations[0]?.name ?? null,
      businessConfiguration: configurations[0] ?? null,
      activeResources: Number(resources[0]?.value ?? 0),
      activeServices: Number(services[0]?.value ?? 0),
      activeSchedules: Number(schedules[0]?.value ?? 0),
      whatsappConnected: Boolean(metaCredentials[0]),
      googleCalendarConnected: googleConnections[0]?.status === "connected",
      aiConfigured: Boolean(agentProfiles[0]?.enabled || agentProfiles[0]?.instructions),
    };
  }
}

export function createSetupStatusService(): SetupStatusService {
  return new SetupStatusService(new DrizzleSetupStatusRepository());
}
