import { Lead } from './types';
import { migrateOldTerritory, computeTerritoryFields } from './territoryConfig';

export function migrateLeadTerritory(lead: Lead): Partial<Lead> | null {
  if (lead.regionId && lead.territoryKey) {
    return null;
  }
  
  if (lead.territory) {
    const migrated = migrateOldTerritory(lead.territory);
    if (migrated) {
      return {
        regionId: migrated.regionId,
        regionName: migrated.regionName,
        areaId: migrated.areaId,
        areaName: migrated.areaName,
        territoryKey: migrated.territoryKey,
      };
    }
  }
  
  return null;
}

export function migrateAllLeads(leads: Lead[]): Map<string, Partial<Lead>> {
  const updates = new Map<string, Partial<Lead>>();
  
  for (const lead of leads) {
    const update = migrateLeadTerritory(lead);
    if (update) {
      updates.set(lead.id, update);
    }
  }
  
  return updates;
}

export function countLeadsNeedingMigration(leads: Lead[]): number {
  return leads.filter(lead => !lead.regionId || !lead.territoryKey).length;
}
