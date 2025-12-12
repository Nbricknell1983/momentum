import { Provider } from 'react-redux';
import { configureStore, createSlice } from '@reduxjs/toolkit';
import { mockLeads, mockActivities, mockUser } from '@/lib/mockData';
import LeadDrawer from '../LeadDrawer';

// Create a store with the drawer open for demo
const demoSlice = createSlice({
  name: 'app',
  initialState: {
    user: mockUser,
    leads: mockLeads,
    activities: mockActivities,
    tasks: [],
    dailyMetrics: [],
    selectedLeadId: mockLeads[0].id,
    isDrawerOpen: true,
    searchQuery: '',
    stageFilter: 'all',
    territoryFilter: 'all',
  },
  reducers: {
    toggleDrawer: () => {},
    updateLead: () => {},
    updateLeadStage: () => {},
    addActivity: () => {},
    archiveLead: () => {},
    deleteLead: () => {},
  },
});

const demoStore = configureStore({
  reducer: { app: demoSlice.reducer },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({ serializableCheck: false }),
});

export default function LeadDrawerExample() {
  return (
    <Provider store={demoStore}>
      <div className="h-screen">
        <LeadDrawer />
      </div>
    </Provider>
  );
}
