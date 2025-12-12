import { configureStore, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { Lead, Activity, Task, DailyMetrics, UserProfile, Stage } from '@/lib/types';
import { mockLeads, mockActivities, mockTasks, mockDailyMetrics, mockUser } from '@/lib/mockData';

// todo: remove mock functionality - replace with Firebase

interface AppState {
  user: UserProfile | null;
  leads: Lead[];
  activities: Activity[];
  tasks: Task[];
  dailyMetrics: DailyMetrics[];
  selectedLeadId: string | null;
  isDrawerOpen: boolean;
  searchQuery: string;
  stageFilter: Stage | 'all';
  territoryFilter: string | 'all';
}

const initialState: AppState = {
  user: mockUser,
  leads: mockLeads,
  activities: mockActivities,
  tasks: mockTasks,
  dailyMetrics: mockDailyMetrics,
  selectedLeadId: null,
  isDrawerOpen: false,
  searchQuery: '',
  stageFilter: 'all',
  territoryFilter: 'all',
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
