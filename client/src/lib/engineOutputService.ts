import { db, doc, setDoc } from './firebase';

export type ClientEngineType = 'websiteEngine' | 'seoEngine' | 'gbpEngine' | 'adsEngine' | 'learningInsight';
export type LeadEngineType = 'growthPrescription';
export type EngineType = ClientEngineType | LeadEngineType;

export interface EngineOutputMeta {
  runId: string;
  generatedAt: Date;
  engineType: EngineType;
  generatedBy: 'user';
  modelUsed: string;
}

export const ENGINE_STALE_DAYS: Record<EngineType, number> = {
  websiteEngine: 30,
  seoEngine: 30,
  gbpEngine: 30,
  adsEngine: 30,
  learningInsight: 14,
  growthPrescription: 90,
};

export function generateRunId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}

export function isOutputStale(
  generatedAt: Date | string | undefined,
  engineType: EngineType
): boolean {
  if (!generatedAt) return true;
  const days = ENGINE_STALE_DAYS[engineType] ?? 30;
  return Date.now() - new Date(generatedAt).getTime() > days * 86_400_000;
}

export function enrichWithMeta<T extends object>(
  output: T,
  engineType: EngineType,
  runId: string,
  model = 'gpt-4o-mini'
): T & EngineOutputMeta {
  return {
    ...output,
    runId,
    generatedAt: new Date(),
    engineType,
    generatedBy: 'user' as const,
    modelUsed: model,
  };
}

export async function persistEngineHistory(
  orgId: string,
  entityCollection: 'clients' | 'leads',
  entityId: string,
  runId: string,
  payload: Record<string, unknown>
): Promise<void> {
  try {
    const histRef = doc(
      db,
      'orgs', orgId,
      entityCollection, entityId,
      'engineHistory', runId
    );
    await setDoc(histRef, { ...payload, _savedAt: new Date() });
    console.log('[engineOutputService] history saved', { orgId, entityCollection, entityId, runId });
  } catch (err) {
    console.error('[engineOutputService] history write failed (non-blocking)', {
      orgId,
      entityCollection,
      entityId,
      runId,
    }, err);
  }
}
