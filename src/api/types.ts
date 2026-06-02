/**
 * Re-exports the generated schema types we use throughout the app.
 * Import from here, not directly from schema.d.ts.
 */

import type { components } from "./schema";

export type UserMeResponse = components["schemas"]["UserMeResponse"];
export type AgentResponse = components["schemas"]["AgentResponse"];
export type AgentListResponse = components["schemas"]["AgentListResponse"];
export type BranchAccess = components["schemas"]["BranchAccess"];

// Auth tokens
export type AuthTokenResponse = components["schemas"]["app__schemas__auth__TokenResponse"];
export type AccessTokenResponse = components["schemas"]["AccessTokenResponse"];

// Customers
export type CustomerResponse = components["schemas"]["CustomerResponse"];
export type CustomerListResponse = components["schemas"]["CustomerListResponse"];
export type CustomerCreate = components["schemas"]["CustomerCreate"];
export type CustomerUpdate = components["schemas"]["CustomerUpdate"];

// Appointments
export type AppointmentDetailResponse = components["schemas"]["AppointmentDetailResponse"];
export type AppointmentStatus = components["schemas"]["AppointmentStatusEnum"];

// Services
export type ServiceResponse = components["schemas"]["ServiceResponse"];
export type ServiceVariationResponse = components["schemas"]["ServiceVariationResponse"];
export type ServiceTitleResponse = components["schemas"]["ServiceTitleResponse"];
export type ServiceTitleWithServicesResponse = components["schemas"]["ServiceTitleWithServicesResponse"];
export type ServiceCatalogueResponse = components["schemas"]["ServiceCatalogueResponse"];
export type ServiceCreate = components["schemas"]["ServiceCreate"];
export type ServiceVariationCreate = components["schemas"]["ServiceVariationCreate"];

// Staff Me (returned from /staff/me — same shape as UserMeResponse + extra fields)
// The backend uses the same UserMeResponse schema for both
export type StaffMeResponse = UserMeResponse & {
  agent_id?: number;
  agent_name?: string;
};

/** Backend error response shape */
export interface ApiError {
  detail?: string;
  code?: string;
  errors?: Array<{ field: string; message: string }>;
}
