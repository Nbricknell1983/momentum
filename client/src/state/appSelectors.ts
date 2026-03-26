/**
 * Centralized Redux selectors for Momentum app state.
 *
 * ALWAYS import from here — never access state.app.* inline.
 * The ESLint rule `no-direct-state-access` will flag any violation.
 */
import type { RootState } from '@/store';

// ── Lead selectors ────────────────────────────────────────────────────────────

export const selectLeads   = (state: RootState) => state.app.leads   ?? [];
export const selectClients = (state: RootState) => state.app.clients ?? [];

// ── Activity / task selectors ─────────────────────────────────────────────────

export const selectActivities   = (state: RootState) => state.app.activities   ?? [];
export const selectTasks        = (state: RootState) => state.app.tasks        ?? [];
export const selectTouches      = (state: RootState) => state.app.touches      ?? [];
export const selectCadences     = (state: RootState) => state.app.cadences     ?? [];
export const selectDailyMetrics = (state: RootState) => state.app.dailyMetrics ?? [];
export const selectDailyPlan    = (state: RootState) => state.app.dailyPlan;
export const selectNbaQueue     = (state: RootState) => state.app.nbaQueue     ?? [];

// ── UI / filter selectors ─────────────────────────────────────────────────────

export const selectUser                = (state: RootState) => state.app.user;
export const selectSelectedLeadId      = (state: RootState) => state.app.selectedLeadId;
export const selectSelectedClientId   = (state: RootState) => state.app.selectedClientId;
export const selectIsDrawerOpen        = (state: RootState) => state.app.isDrawerOpen;
export const selectIsClientDrawerOpen  = (state: RootState) => state.app.isClientDrawerOpen;
export const selectSearchQuery         = (state: RootState) => state.app.searchQuery;
export const selectStageFilter         = (state: RootState) => state.app.stageFilter;
export const selectTerritoryFilter     = (state: RootState) => state.app.territoryFilter;
export const selectRegionFilter        = (state: RootState) => state.app.regionFilter;
export const selectAreaFilter          = (state: RootState) => state.app.areaFilter;
export const selectHealthFilter        = (state: RootState) => state.app.healthFilter;
export const selectFocusMode           = (state: RootState) => state.app.focusMode;
