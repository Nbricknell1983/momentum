import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Lead, Activity, Task, DailyMetrics, UserProfile, Stage, NurtureMode, NurtureStatus, TouchChannel, Touch, Cadence, DEFAULT_CADENCES, calculateNextTouchDate, calculateNurturePriorityScore, DailyPlan, ActionQueueItem, TimeBlock, DailyPlanSummary, DailyDebrief, RouteStop, createDefaultDailyPlan, BATTLE_SCORE_POINTS, ActionType, NBAAction, FocusModeSettings, NBAActionStatus, Client, HealthStatus } from '@/lib/types';
import { mockLeads, mockActivities, mockTasks, mockDailyMetrics, mockUser } from '@/lib/mockData';

// todo: remove mock functionality - replace with Firebase

interface AppState {
  user: UserProfile | null;
  leads: Lead[];
  clients: Client[];
  activities: Activity[];
  tasks: Task[];
  touches: Touch[];
  cadences: Cadence[];
  dailyMetrics: DailyMetrics[];
  dailyPlan: DailyPlan | null;
  selectedLeadId: string | null;
  selectedClientId: string | null;
  isDrawerOpen: boolean;
  isClientDrawerOpen: boolean;
  searchQuery: string;
  stageFilter: Stage | 'all';
  territoryFilter: string | 'all';
  regionFilter: string | 'all';
  areaFilter: string | 'all';
  healthFilter: HealthStatus | 'all';
  nurtureTab: 'active' | 'passive';
  nbaQueue: NBAAction[];
  focusMode: FocusModeSettings | null;
}

const initialState: AppState = {
  user: mockUser,
  leads: mockLeads,
  clients: [],
  activities: mockActivities,
  tasks: mockTasks,
  touches: [],
  cadences: [...DEFAULT_CADENCES],
  dailyMetrics: mockDailyMetrics,
  dailyPlan: createDefaultDailyPlan(new Date()),
  selectedLeadId: null,
  selectedClientId: null,
  isDrawerOpen: false,
  isClientDrawerOpen: false,
  searchQuery: '',
  stageFilter: 'all',
  territoryFilter: 'all',
  regionFilter: 'all',
  areaFilter: 'all',
  healthFilter: 'all',
  nurtureTab: 'active',
  nbaQueue: [],
  focusMode: null,
};

const appSlice = createSlice({
  name: 'app',
  initialState,
  reducers: {
    setUser(state, action: PayloadAction<UserProfile | null>) {
      state.user = action.payload;
    },
    setLeads(state, action: PayloadAction<Lead[]>) {
      state.leads = action.payload;
    },
    updateLead(state, action: PayloadAction<Lead>) {
      const index = state.leads.findIndex(l => l.id === action.payload.id);
      if (index !== -1) {
        state.leads[index] = action.payload;
      }
    },
    updateLeadStage(state, action: PayloadAction<{ leadId: string; stage: Stage }>) {
      const lead = state.leads.find(l => l.id === action.payload.leadId);
      if (lead) {
        lead.stage = action.payload.stage;
        lead.updatedAt = new Date();
        
        // Auto-enroll in passive nurture when stage is set to "nurture"
        if (action.payload.stage === 'nurture' && lead.nurtureMode === 'none') {
          const cadence = state.cadences.find(c => c.mode === 'passive');
          if (cadence) {
            const now = new Date();
            lead.nurtureMode = 'passive';
            lead.nurtureCadenceId = cadence.id;
            lead.nurtureStatus = 'new';
            lead.nurtureStepIndex = 0;
            lead.enrolledInNurtureAt = now;
            lead.nextTouchAt = calculateNextTouchDate(now, 0, cadence);
            lead.touchesNoResponse = 0;
            // Switch to passive tab so user sees the enrolled lead
            state.nurtureTab = 'passive';
          }
        }
      }
    },
    addLead(state, action: PayloadAction<Lead>) {
      state.leads.push(action.payload);
    },
    deleteLead(state, action: PayloadAction<string>) {
      state.leads = state.leads.filter(l => l.id !== action.payload);
    },
    archiveLead(state, action: PayloadAction<string>) {
      const lead = state.leads.find(l => l.id === action.payload);
      if (lead) {
        lead.archived = true;
        lead.updatedAt = new Date();
      }
    },
    setActivities(state, action: PayloadAction<Activity[]>) {
      state.activities = action.payload;
    },
    addActivity(state, action: PayloadAction<Activity>) {
      state.activities.push(action.payload);
      // Update lead's lastActivityAt and lastContactDate
      const lead = state.leads.find(l => l.id === action.payload.leadId);
      if (lead) {
        lead.lastActivityAt = action.payload.createdAt;
        lead.lastContactDate = action.payload.createdAt;
        lead.updatedAt = new Date();
      }
    },
    setTasks(state, action: PayloadAction<Task[]>) {
      state.tasks = action.payload;
    },
    updateTask(state, action: PayloadAction<Task>) {
      const index = state.tasks.findIndex(t => t.id === action.payload.id);
      if (index !== -1) {
        state.tasks[index] = action.payload;
      }
    },
    addTask(state, action: PayloadAction<Task>) {
      state.tasks.push(action.payload);
    },
    completeTask(state, action: PayloadAction<string>) {
      const task = state.tasks.find(t => t.id === action.payload);
      if (task) {
        task.status = 'completed';
      }
    },
    snoozeTask(state, action: PayloadAction<{ taskId: string; dueAt: Date }>) {
      const task = state.tasks.find(t => t.id === action.payload.taskId);
      if (task) {
        task.status = 'snoozed';
        task.dueAt = action.payload.dueAt;
      }
    },
    selectLead(state, action: PayloadAction<string | null>) {
      state.selectedLeadId = action.payload;
      state.isDrawerOpen = action.payload !== null;
    },
    toggleDrawer(state, action: PayloadAction<boolean>) {
      state.isDrawerOpen = action.payload;
      if (!action.payload) {
        state.selectedLeadId = null;
      }
    },
    setSearchQuery(state, action: PayloadAction<string>) {
      state.searchQuery = action.payload;
    },
    setStageFilter(state, action: PayloadAction<Stage | 'all'>) {
      state.stageFilter = action.payload;
    },
    setTerritoryFilter(state, action: PayloadAction<string | 'all'>) {
      state.territoryFilter = action.payload;
    },
    setRegionFilter(state, action: PayloadAction<string | 'all'>) {
      state.regionFilter = action.payload;
      state.areaFilter = 'all';
    },
    setAreaFilter(state, action: PayloadAction<string | 'all'>) {
      state.areaFilter = action.payload;
    },
    setNurtureTab(state, action: PayloadAction<'active' | 'passive'>) {
      state.nurtureTab = action.payload;
    },
    addCadence(state, action: PayloadAction<Cadence>) {
      state.cadences.push(action.payload);
    },
    updateCadence(state, action: PayloadAction<Cadence>) {
      const index = state.cadences.findIndex(c => c.id === action.payload.id);
      if (index !== -1) {
        state.cadences[index] = action.payload;
      }
    },
    deleteCadence(state, action: PayloadAction<string>) {
      const cadence = state.cadences.find(c => c.id === action.payload);
      if (cadence && !cadence.isDefault) {
        state.cadences = state.cadences.filter(c => c.id !== action.payload);
      }
    },
    // Nurture enrollment - MANUAL ONLY per requirements
    enrollInNurture(state, action: PayloadAction<{ leadId: string; mode: 'active' | 'passive'; cadenceId?: string }>) {
      const lead = state.leads.find(l => l.id === action.payload.leadId);
      if (lead) {
        let cadence: Cadence | undefined;
        if (action.payload.cadenceId) {
          cadence = state.cadences.find(c => c.id === action.payload.cadenceId);
        } else {
          cadence = state.cadences.find(c => c.mode === action.payload.mode);
        }
        if (cadence) {
          const now = new Date();
          lead.nurtureMode = action.payload.mode;
          lead.nurtureCadenceId = cadence.id;
          lead.nurtureStatus = 'new';
          lead.nurtureStepIndex = 0;
          lead.enrolledInNurtureAt = now;
          lead.nextTouchAt = calculateNextTouchDate(now, 0, cadence);
          lead.touchesNoResponse = 0;
          lead.updatedAt = now;
        }
      }
    },
    // Remove from nurture - stops all automation
    removeFromNurture(state, action: PayloadAction<string>) {
      const lead = state.leads.find(l => l.id === action.payload);
      if (lead) {
        lead.nurtureMode = 'none';
        lead.nurtureCadenceId = null;
        lead.nurtureStatus = null;
        lead.nurtureStepIndex = null;
        lead.enrolledInNurtureAt = null;
        lead.nextTouchAt = null;
        lead.updatedAt = new Date();
      }
    },
    // Update nurture status (for Kanban drag-drop)
    updateNurtureStatus(state, action: PayloadAction<{ leadId: string; status: NurtureStatus }>) {
      const lead = state.leads.find(l => l.id === action.payload.leadId);
      if (lead && lead.nurtureMode !== 'none') {
        lead.nurtureStatus = action.payload.status;
        lead.updatedAt = new Date();
      }
    },
    // Log nurture touch - advances cadence
    logNurtureTouch(state, action: PayloadAction<{ leadId: string; channel: TouchChannel; responseReceived: boolean; notes?: string }>) {
      const lead = state.leads.find(l => l.id === action.payload.leadId);
      if (lead && lead.nurtureMode !== 'none' && lead.nurtureCadenceId) {
        const cadence = state.cadences.find(c => c.id === lead.nurtureCadenceId);
        if (cadence) {
          const now = new Date();
          // Update lead touch info
          lead.lastTouchAt = now;
          lead.lastTouchChannel = action.payload.channel;
          
          // Handle response tracking
          if (!action.payload.responseReceived) {
            lead.touchesNoResponse++;
            lead.nurtureStatus = 'touched_waiting';
          } else {
            lead.touchesNoResponse = 0;
            lead.nurtureStatus = 'reengaged';
          }
          
          // Advance cadence
          const nextIndex = (lead.nurtureStepIndex ?? 0) + 1;
          lead.nurtureStepIndex = nextIndex;
          
          if (nextIndex >= cadence.steps.length) {
            // Cadence complete - move to exit
            lead.nurtureStatus = 'exit';
            lead.nextTouchAt = null;
          } else if (lead.enrolledInNurtureAt) {
            lead.nextTouchAt = calculateNextTouchDate(lead.enrolledInNurtureAt, nextIndex, cadence);
            lead.nurtureStatus = 'needs_touch';
          }
          
          // Recalculate priority score
          lead.nurturePriorityScore = calculateNurturePriorityScore(lead);
          lead.updatedAt = now;
          
          // Add touch record
          const touch: Touch = {
            id: Date.now().toString(),
            leadId: action.payload.leadId,
            userId: state.user?.id || 'demo',
            channel: action.payload.channel,
            responseReceived: action.payload.responseReceived,
            notes: action.payload.notes,
            createdAt: now,
          };
          state.touches.push(touch);
        }
      }
    },
    // Snooze nurture touch
    snoozeNurtureTouch(state, action: PayloadAction<{ leadId: string; days: number }>) {
      const lead = state.leads.find(l => l.id === action.payload.leadId);
      if (lead && lead.nurtureMode !== 'none') {
        const newDate = new Date();
        newDate.setDate(newDate.getDate() + action.payload.days);
        lead.nextTouchAt = newDate;
        lead.updatedAt = new Date();
      }
    },
    // Move back to pipeline from nurture
    moveToPipeline(state, action: PayloadAction<{ leadId: string; stage: Stage }>) {
      const lead = state.leads.find(l => l.id === action.payload.leadId);
      if (lead) {
        lead.stage = action.payload.stage;
        lead.nurtureMode = 'none';
        lead.nurtureCadenceId = null;
        lead.nurtureStatus = null;
        lead.nurtureStepIndex = null;
        lead.enrolledInNurtureAt = null;
        lead.nextTouchAt = null;
        lead.updatedAt = new Date();
      }
    },

    // ============================================
    // Daily Plan Actions
    // ============================================
    
    setDailyPlan(state, action: PayloadAction<DailyPlan>) {
      state.dailyPlan = action.payload;
    },
    
    initializeDailyPlan(state, action: PayloadAction<Date>) {
      state.dailyPlan = createDefaultDailyPlan(action.payload);
    },
    
    setDailyPlanSummary(state, action: PayloadAction<DailyPlanSummary>) {
      if (state.dailyPlan) {
        state.dailyPlan.summary = action.payload;
      }
    },
    
    addActionToQueue(state, action: PayloadAction<ActionQueueItem>) {
      if (state.dailyPlan) {
        state.dailyPlan.actionQueue.push(action.payload);
      }
    },
    
    removeActionFromQueue(state, action: PayloadAction<string>) {
      if (state.dailyPlan) {
        state.dailyPlan.actionQueue = state.dailyPlan.actionQueue.filter(
          a => a.id !== action.payload
        );
      }
    },
    
    completeAction(state, action: PayloadAction<string>) {
      if (state.dailyPlan) {
        const actionItem = state.dailyPlan.actionQueue.find(a => a.id === action.payload);
        if (actionItem && actionItem.status === 'pending') {
          actionItem.status = 'completed';
          actionItem.completedAt = new Date();
          
          state.dailyPlan.battleScoreEarned += actionItem.battleScorePoints;
          
          if (actionItem.timeBlockId) {
            const timeBlock = state.dailyPlan.timeBlocks.find(
              tb => tb.id === actionItem.timeBlockId
            );
            if (timeBlock) {
              timeBlock.activitiesCompleted++;
            }
          }
          
          const actionType = actionItem.type;
          if (actionType === 'call') {
            state.dailyPlan.targets.prospecting.calls.completed++;
          } else if (actionType === 'door') {
            state.dailyPlan.targets.prospecting.doors.completed++;
          } else if (actionType === 'meeting') {
            state.dailyPlan.targets.prospecting.meetingsBooked.completed++;
          } else if (actionType === 'follow_up') {
            state.dailyPlan.targets.clients.followUps.completed++;
          } else if (actionType === 'check_in') {
            state.dailyPlan.targets.clients.checkIns.completed++;
          }
        }
      }
    },
    
    skipAction(state, action: PayloadAction<string>) {
      if (state.dailyPlan) {
        const actionItem = state.dailyPlan.actionQueue.find(a => a.id === action.payload);
        if (actionItem && actionItem.status === 'pending') {
          actionItem.status = 'skipped';
        }
      }
    },
    
    updateTimeBlock(state, action: PayloadAction<TimeBlock>) {
      if (state.dailyPlan) {
        const index = state.dailyPlan.timeBlocks.findIndex(
          tb => tb.id === action.payload.id
        );
        if (index !== -1) {
          state.dailyPlan.timeBlocks[index] = action.payload;
        }
      }
    },
    
    incrementTimeBlockActivity(state, action: PayloadAction<string>) {
      if (state.dailyPlan) {
        const timeBlock = state.dailyPlan.timeBlocks.find(tb => tb.id === action.payload);
        if (timeBlock) {
          timeBlock.activitiesCompleted++;
        }
      }
    },
    
    addRouteStop(state, action: PayloadAction<RouteStop>) {
      if (state.dailyPlan) {
        state.dailyPlan.routeStops.push(action.payload);
      }
    },
    
    removeRouteStop(state, action: PayloadAction<string>) {
      if (state.dailyPlan) {
        state.dailyPlan.routeStops = state.dailyPlan.routeStops.filter(
          rs => rs.id !== action.payload
        );
      }
    },
    
    completeRouteStop(state, action: PayloadAction<string>) {
      if (state.dailyPlan) {
        const stop = state.dailyPlan.routeStops.find(rs => rs.id === action.payload);
        if (stop) {
          stop.completed = true;
        }
      }
    },
    
    reorderRouteStops(state, action: PayloadAction<RouteStop[]>) {
      if (state.dailyPlan) {
        state.dailyPlan.routeStops = action.payload;
      }
    },
    
    submitDebrief(state, action: PayloadAction<DailyDebrief>) {
      if (state.dailyPlan) {
        state.dailyPlan.debrief = action.payload;
      }
    },
    
    markQueuesInitialized(state) {
      if (state.dailyPlan) {
        state.dailyPlan.isQueuesInitialized = true;
      }
    },
    
    updateDailyTargets(state, action: PayloadAction<{
      category: 'prospecting' | 'clients';
      metric: string;
      value: number;
    }>) {
      if (state.dailyPlan) {
        const { category, metric, value } = action.payload;
        if (category === 'prospecting') {
          const prospecting = state.dailyPlan.targets.prospecting as Record<string, { target: number; completed: number }>;
          if (prospecting[metric]) {
            prospecting[metric].completed = value;
          }
        } else {
          const clients = state.dailyPlan.targets.clients as Record<string, { target: number; completed: number }>;
          if (clients[metric]) {
            clients[metric].completed = value;
          }
        }
      }
    },
    
    addBattleScore(state, action: PayloadAction<number>) {
      if (state.dailyPlan) {
        state.dailyPlan.battleScoreEarned += action.payload;
      }
    },

    // ============================================
    // NBA (Next Best Action) Actions
    // ============================================
    
    setNBAQueue(state, action: PayloadAction<NBAAction[]>) {
      state.nbaQueue = action.payload;
    },
    
    addNBAAction(state, action: PayloadAction<NBAAction>) {
      state.nbaQueue.push(action.payload);
      state.nbaQueue.sort((a, b) => b.priorityScore - a.priorityScore);
    },
    
    updateNBAAction(state, action: PayloadAction<{ id: string; updates: Partial<NBAAction> }>) {
      const index = state.nbaQueue.findIndex(a => a.id === action.payload.id);
      if (index !== -1) {
        state.nbaQueue[index] = { ...state.nbaQueue[index], ...action.payload.updates, updatedAt: new Date() };
      }
    },
    
    removeNBAAction(state, action: PayloadAction<string>) {
      state.nbaQueue = state.nbaQueue.filter(a => a.id !== action.payload);
    },
    
    completeNBAAction(state, action: PayloadAction<string>) {
      const nbaAction = state.nbaQueue.find(a => a.id === action.payload);
      if (nbaAction && nbaAction.status === 'open') {
        nbaAction.status = 'done';
        nbaAction.updatedAt = new Date();
      }
    },
    
    dismissNBAAction(state, action: PayloadAction<{ id: string; reason: string }>) {
      const nbaAction = state.nbaQueue.find(a => a.id === action.payload.id);
      if (nbaAction && nbaAction.status === 'open') {
        nbaAction.status = 'dismissed';
        nbaAction.dismissedReason = action.payload.reason;
        nbaAction.dismissedAt = new Date();
        const suppressUntil = new Date();
        suppressUntil.setHours(suppressUntil.getHours() + 48);
        nbaAction.suppressUntil = suppressUntil;
        nbaAction.updatedAt = new Date();
      }
    },
    
    setFocusMode(state, action: PayloadAction<FocusModeSettings | null>) {
      state.focusMode = action.payload;
    },
    
    toggleFocusMode(state) {
      if (state.focusMode) {
        if (state.focusMode.enabled) {
          state.focusMode = { ...state.focusMode, enabled: false, updatedAt: new Date() };
        } else {
          const topThree = state.nbaQueue
            .filter(a => a.status === 'open')
            .slice(0, 3)
            .map(a => a.id);
          state.focusMode = {
            enabled: true,
            topActionIds: topThree,
            startedAt: new Date(),
            updatedAt: new Date(),
          };
        }
      } else {
        const topThree = state.nbaQueue
          .filter(a => a.status === 'open')
          .slice(0, 3)
          .map(a => a.id);
        state.focusMode = {
          enabled: true,
          topActionIds: topThree,
          startedAt: new Date(),
          updatedAt: new Date(),
        };
      }
    },

    // ============================================
    // Client Management Actions
    // ============================================
    
    setClients(state, action: PayloadAction<Client[]>) {
      state.clients = action.payload;
    },
    
    addClient(state, action: PayloadAction<Client>) {
      state.clients.push(action.payload);
    },
    
    updateClient(state, action: PayloadAction<Client>) {
      const index = state.clients.findIndex(c => c.id === action.payload.id);
      if (index !== -1) {
        state.clients[index] = action.payload;
      }
    },
    
    deleteClient(state, action: PayloadAction<string>) {
      state.clients = state.clients.filter(c => c.id !== action.payload);
    },
    
    archiveClient(state, action: PayloadAction<string>) {
      const client = state.clients.find(c => c.id === action.payload);
      if (client) {
        client.archived = true;
        client.updatedAt = new Date();
      }
    },
    
    selectClient(state, action: PayloadAction<string | null>) {
      state.selectedClientId = action.payload;
      state.isClientDrawerOpen = action.payload !== null;
    },
    
    toggleClientDrawer(state, action: PayloadAction<boolean>) {
      state.isClientDrawerOpen = action.payload;
      if (!action.payload) {
        state.selectedClientId = null;
      }
    },
    
    setHealthFilter(state, action: PayloadAction<HealthStatus | 'all'>) {
      state.healthFilter = action.payload;
    },
  },
});

export const {
  setUser,
  setLeads,
  updateLead,
  updateLeadStage,
  addLead,
  deleteLead,
  archiveLead,
  setActivities,
  addActivity,
  setTasks,
  updateTask,
  addTask,
  completeTask,
  snoozeTask,
  selectLead,
  toggleDrawer,
  setSearchQuery,
  setStageFilter,
  setTerritoryFilter,
  setRegionFilter,
  setAreaFilter,
  setNurtureTab,
  addCadence,
  updateCadence,
  deleteCadence,
  enrollInNurture,
  removeFromNurture,
  updateNurtureStatus,
  logNurtureTouch,
  snoozeNurtureTouch,
  moveToPipeline,
  setDailyPlan,
  initializeDailyPlan,
  setDailyPlanSummary,
  addActionToQueue,
  removeActionFromQueue,
  completeAction,
  skipAction,
  updateTimeBlock,
  incrementTimeBlockActivity,
  addRouteStop,
  removeRouteStop,
  completeRouteStop,
  reorderRouteStops,
  submitDebrief,
  markQueuesInitialized,
  updateDailyTargets,
  addBattleScore,
  setNBAQueue,
  addNBAAction,
  updateNBAAction,
  removeNBAAction,
  completeNBAAction,
  dismissNBAAction,
  setFocusMode,
  toggleFocusMode,
  setClients,
  addClient,
  updateClient,
  deleteClient,
  archiveClient,
  selectClient,
  toggleClientDrawer,
  setHealthFilter,
} = appSlice.actions;

export const store = configureStore({
  reducer: {
    app: appSlice.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: false,
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
