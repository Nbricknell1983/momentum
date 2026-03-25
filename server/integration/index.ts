// =============================================================================
// AI SYSTEMS INTEGRATION — BARREL EXPORT
// =============================================================================

export { integrationRouter }               from './router';
export { isIntegrationConfigured, getIntegrationConfig, REQUIRED_ENV_VARS, OPTIONAL_ENV_VARS } from './config';
export { checkProvisioningReadiness, actionCreateTenant, actionRetryProvisioning, actionRefreshStatus, actionSendPatch, getProvisioningLog } from './actions';
export { provisionTenant, readIntegrationMapping, writeIntegrationMapping } from './provisioning';
export { pollTenantStatus }                from './status';
export { sendTenantPatch }                 from './patch';
export { writeProvisioningLog, getRecentProvisioningLog } from './audit';
export type { TenantProvisionPayload, AiSystemsIntegration, ProvisioningLogEntry, CreateTenantResponse, TenantStatusResponse, PatchTenantResponse, TenantLifecycleState, PatchDomain } from './types';
export { TenantProvisionPayloadSchema }    from './schema';
