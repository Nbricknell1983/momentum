/**
 * Settings Audit Writer
 *
 * Writes immutable audit entries to:
 *   orgs/{orgId}/settingsHistory/{settingType}/entries/{autoId}
 *
 * Writes use Firebase Admin SDK and bypass Firestore security rules.
 * Audit entries are never updated or deleted.
 */

import type { Firestore } from 'firebase-admin/firestore';
import type { SettingsAuditEntry } from '../../shared/controlPlaneSchemas';

export async function writeSettingsAudit(
  firestoreDb: Firestore,
  entry: SettingsAuditEntry,
): Promise<void> {
  try {
    await firestoreDb
      .collection('orgs')
      .doc(entry.orgId)
      .collection('settingsHistory')
      .doc(entry.settingType)
      .collection('entries')
      .add(entry);
  } catch (err) {
    // Audit writes must never block the main settings write.
    // Log the failure but do not throw.
    console.error('[settingsAudit] Failed to write audit entry:', err);
  }
}
