# Firestore Rules Deployment

Firestore security rules are defined in `firestore.rules` in the project root.  
They are **NOT** automatically deployed when the app is deployed — you must deploy them manually using the Firebase CLI.

## First-time setup

```bash
npm install -g firebase-tools
firebase login
firebase use prospectr-a8ef3
```

## Deploy rules

```bash
firebase deploy --only firestore:rules
```

## Verify rules are live

1. Go to the [Firebase Console](https://console.firebase.google.com/project/prospectr-a8ef3/firestore/rules)
2. Check the "Rules" tab — the published version should match the contents of `firestore.rules`
3. Use the **Rules Playground** to simulate reads/writes with a test UID and orgId

## What's covered

| Collection path | Read | Write | Notes |
|---|---|---|---|
| `/orgs/{orgId}/settings/{settingId}` | org member | org manager | automationRules, openclawConfig, gbpConfig |
| `/orgs/{orgId}/bullpenComms/{commId}` | org member | members create, managers update/delete | |
| `/orgs/{orgId}/growthPlays/{playId}` | org member | org member | |
| `/reports/{reportId}` | public | no | Public strategy report URLs |
| `/strategyReports/{reportId}` | public | no | |

## Critical rules

- `isOrgMember(orgId)` — checks `orgs/{orgId}/members/{uid}` exists **and** `active == true`
- `isOrgManager(orgId)` — additionally requires `role` in `['owner', 'admin']`
- All unmatched paths **deny read and write** via the catch-all `/{document=**}` rule

## After updating `firestore.rules`

Always run `firebase deploy --only firestore:rules` immediately after editing the file.  
Rules in the file have no effect until deployed.
