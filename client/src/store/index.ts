import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Lead, Activity, Task, DailyMetrics, UserProfile, Stage, NurtureMode, NurtureStatus, TouchChannel, Touch, Cadence, DEFAULT_CADENCES, calculateNextTouchDate, calculateNurturePriorityScore } from '@/lib/types';
import { mockLeads, mockActivities, mockTasks, mockDailyMetrics, mockUser } from '@/lib/mockData';

// todo: remove mock functionality - replace with Firebase

interface AppState {
  user: UserProfile | null;
  leads: Lead[];
  activities: Activity[];
  tasks: Task[];
  touches: Touch[];
  cadences: Cadence[];
  dailyMetrics: DailyMetrics[];
  selectedLeadId: string | null;
  isDrawerOpen: boolean;
  searchQuery: string;
  stageFilter: Stage | 'all';
  territoryFilter: string | 'all';
  nurtureTab: 'active' | 'passive';
}

const initialState: AppState = {
  user: mockUser,
  leads: mockLeads,
  activities: mockActivities,
  tasks: mockTasks,
  touches: [],
  cadences: [...DEFAULT_CADENCES],
  dailyMetrics: mockDailyMetrics,
  selectedLeadId: null,
  isDrawerOpen: false,
  searchQuery: '',
  stageFilter: 'all',
  territoryFilter: 'all',
  nurtureTab: 'active',
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
