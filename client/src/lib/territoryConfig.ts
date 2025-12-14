// Central territory configuration for hierarchical territories
// Regions are top-level territories, Areas are sub-regions within regions

export interface Area {
  id: string;
  name: string;
}

export interface Region {
  id: string;
  name: string;
  areas: Area[];
}

// Territory configuration - source of truth for all regions and areas
export const TERRITORY_CONFIG: Region[] = [
  {
    id: 'brisbane',
    name: 'Brisbane',
    areas: [
      { id: 'north', name: 'North' },
      { id: 'south', name: 'South' },
      { id: 'east', name: 'East' },
      { id: 'west', name: 'West' },
    ],
  },
  {
    id: 'gold-coast',
    name: 'Gold Coast',
    areas: [],
  },
  {
    id: 'logan',
    name: 'Logan',
    areas: [],
  },
];

// Helper functions for territory operations

export function getRegionById(regionId: string): Region | undefined {
  return TERRITORY_CONFIG.find(r => r.id === regionId);
}

export function getAreaById(regionId: string, areaId: string): Area | undefined {
  const region = getRegionById(regionId);
  return region?.areas.find(a => a.id === areaId);
}

export function getAreasForRegion(regionId: string): Area[] {
  const region = getRegionById(regionId);
  return region?.areas || [];
}

export function regionHasAreas(regionId: string): boolean {
  const region = getRegionById(regionId);
  return (region?.areas.length ?? 0) > 0;
}

export function isAreaRequiredForRegion(regionId: string): boolean {
  return regionHasAreas(regionId);
}

// Compute territory key from region and area
// Format: "{regionId}:{areaId}" or "{regionId}:all" if no area
export function computeTerritoryKey(regionId: string, areaId?: string | null): string {
  if (areaId) {
    return `${regionId}:${areaId}`;
  }
  return `${regionId}:all`;
}

// Parse territory key back to regionId and areaId
export function parseTerritoryKey(territoryKey: string): { regionId: string; areaId: string | null } {
  const [regionId, areaId] = territoryKey.split(':');
  return {
    regionId,
    areaId: areaId === 'all' ? null : areaId,
  };
}

// Compute all territory fields for saving to Firestore
export function computeTerritoryFields(regionId: string, areaId?: string | null): {
  regionId: string;
  regionName: string;
  areaId: string | null;
  areaName: string | null;
  territoryKey: string;
} {
  const region = getRegionById(regionId);
  const area = areaId ? getAreaById(regionId, areaId) : null;
  
  return {
    regionId,
    regionName: region?.name || regionId,
    areaId: areaId || null,
    areaName: area?.name || null,
    territoryKey: computeTerritoryKey(regionId, areaId),
  };
}

// Validate territory selection
export function validateTerritorySelection(regionId: string, areaId?: string | null): {
  valid: boolean;
  error?: string;
} {
  if (!regionId) {
    return { valid: false, error: 'Region is required' };
  }
  
  const region = getRegionById(regionId);
  if (!region) {
    return { valid: false, error: 'Invalid region' };
  }
  
  if (isAreaRequiredForRegion(regionId) && !areaId) {
    return { valid: false, error: `Area is required for ${region.name}` };
  }
  
  if (areaId && !getAreaById(regionId, areaId)) {
    return { valid: false, error: 'Invalid area for this region' };
  }
  
  return { valid: true };
}

// Get display name for territory
export function getTerritoryDisplayName(regionId?: string, areaId?: string | null): string {
  if (!regionId) return '';
  
  const region = getRegionById(regionId);
  if (!region) return regionId;
  
  if (areaId) {
    const area = getAreaById(regionId, areaId);
    return `${region.name} - ${area?.name || areaId}`;
  }
  
  return region.name;
}

// Migration helper: map old territory string to new fields
export function migrateOldTerritory(oldTerritory: string): {
  regionId: string;
  regionName: string;
  areaId: string | null;
  areaName: string | null;
  territoryKey: string;
} | null {
  if (!oldTerritory) return null;
  
  const normalized = oldTerritory.toLowerCase().trim();
  
  // Try to match exact region names
  for (const region of TERRITORY_CONFIG) {
    if (normalized === region.name.toLowerCase() || normalized === region.id) {
      return computeTerritoryFields(region.id, null);
    }
    
    // Check for region + area patterns like "Brisbane North" or "Brisbane - North"
    for (const area of region.areas) {
      const patterns = [
        `${region.name.toLowerCase()} ${area.name.toLowerCase()}`,
        `${region.name.toLowerCase()} - ${area.name.toLowerCase()}`,
        `${region.name.toLowerCase()}-${area.name.toLowerCase()}`,
        `${region.id}:${area.id}`,
      ];
      
      if (patterns.some(p => normalized === p)) {
        return computeTerritoryFields(region.id, area.id);
      }
    }
  }
  
  // If no match, create a fallback using the old territory as regionId
  return {
    regionId: normalized.replace(/\s+/g, '-'),
    regionName: oldTerritory,
    areaId: null,
    areaName: null,
    territoryKey: `${normalized.replace(/\s+/g, '-')}:all`,
  };
}
