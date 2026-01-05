import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSearch } from 'wouter';
import { Plus, Filter, Users, Phone, Mail, MapPin, Building2, AlertCircle, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, Package, Clock, CircleDot, Check, X, Loader2, Target, Calendar, FileText, Trash2, Sparkles, Copy, LayoutDashboard, TrendingUp, Lightbulb, PenTool, Play, ArrowUp, ArrowDown, Share2, ExternalLink, MessageSquare, ClipboardList, Navigation, Send } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Legend, Tooltip } from 'recharts';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Checkbox } from '@/components/ui/checkbox';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { RootState, setHealthFilter, setRegionFilter, setAreaFilter, addClient, updateClient, selectClient } from '@/store';
import { Client, HealthStatus, HEALTH_STATUS_LABELS, CADENCE_TIER_LABELS, StrategyStatus, ChannelStatuses, Deliverable, DeliverableStatus, DELIVERABLE_STATUS_LABELS, StrategySession, StrategyPlan, PRIMARY_GOAL_LABELS, PrimaryGoal, ContentDraft, ContentDraftStatus, ContentDraftType, NBAAction, NBAActionType, ChannelInsight, InsightChannel, INSIGHT_CHANNEL_LABELS, DEFAULT_CHANNEL_EVIDENCE, AnalysisStatus, ANALYSIS_STATUS_LABELS, EvidenceTask, EvidenceTaskStatus, AnalyticsSnapshot, Activity, ACTIVITY_LABELS, Task, getTodayDDMMYYYY, TaskType, ActivityType, AITaskAssistResponse, TaskChecklistItem, TaskPriority } from '@/lib/types';
import { TERRITORY_CONFIG, getAreasForRegion, computeTerritoryFields, validateTerritorySelection } from '@/lib/territoryConfig';
import { createClient as createClientInFirestore, updateClientInFirestore, fetchDeliverables, createDeliverable, updateDeliverable, deleteDeliverable, fetchStrategySessions, createStrategySession, deleteStrategySession, fetchStrategyPlan, saveStrategyPlan, fetchContentDrafts, updateContentDraft, createNBAAction, fetchChannelInsights, saveChannelInsight, fetchEvidenceTasks, createEvidenceTask, updateEvidenceTask, fetchAnalyticsSnapshots, createAnalyticsSnapshot, logClientAction, createClientTask, addClientNote, fetchClientActivities, fetchClientTasks, updatePlanTask } from '@/lib/firestoreService';
import { BusinessProfile, DEFAULT_BUSINESS_PROFILE, ServiceAreaType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { DictationButton } from '@/components/DictationButton';

const healthIcons: Record<HealthStatus, React.ReactNode> = {
  green: <CheckCircle className="h-4 w-4 text-green-500" />,
  amber: <AlertTriangle className="h-4 w-4 text-amber-500" />,
  red: <AlertCircle className="h-4 w-4 text-red-500" />,
};

const healthBadgeVariant: Record<HealthStatus, 'default' | 'secondary' | 'destructive' | 'outline'> = {
  green: 'default',
  amber: 'secondary',
  red: 'destructive',
};

const deliverableStatusIcons: Record<DeliverableStatus, React.ReactNode> = {
  not_started: <CircleDot className="h-4 w-4 text-muted-foreground" />,
  in_progress: <Clock className="h-4 w-4 text-blue-500" />,
  blocked: <AlertCircle className="h-4 w-4 text-red-500" />,
  completed: <Check className="h-4 w-4 text-green-500" />,
};

// Confidence badge styling based on analysis status
const confidenceBadgeStyles: Record<AnalysisStatus, { variant: 'default' | 'secondary' | 'outline'; className: string; icon: React.ReactNode }> = {
  assumed: { variant: 'outline', className: 'text-muted-foreground border-dashed', icon: <AlertCircle className="h-3 w-3" /> },
  evidence_provided: { variant: 'secondary', className: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', icon: <FileText className="h-3 w-3" /> },
  verified: { variant: 'default', className: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle className="h-3 w-3" /> },
};

// Helper to get overall confidence level from channel insights
function getOverallConfidenceStatus(channelInsights: ChannelInsight[]): AnalysisStatus {
  if (!channelInsights || channelInsights.length === 0) return 'assumed';
  
  const hasVerified = channelInsights.some(i => i.analysisStatus === 'verified');
  if (hasVerified) return 'verified';
  
  const hasEvidence = channelInsights.some(i => i.analysisStatus === 'evidence_provided');
  if (hasEvidence) return 'evidence_provided';
  
  return 'assumed';
}

// Get confidence status for a specific channel type from channel OKR
function getChannelConfidenceStatus(channelName: string, channelInsights: ChannelInsight[]): AnalysisStatus {
  if (!channelInsights || channelInsights.length === 0) return 'assumed';
  
  // Comprehensive map of channel plan names to insight channel types
  const channelMap: Record<string, InsightChannel> = {
    'website': 'website',
    'web': 'website',
    'site': 'website',
    'gbp': 'gbp',
    'google business': 'gbp',
    'google business profile': 'gbp',
    'business profile': 'gbp',
    'local': 'gbp',
    'seo': 'seo',
    'organic': 'seo',
    'search': 'seo',
    'ppc': 'ppc',
    'paid': 'ppc',
    'ads': 'ppc',
    'google ads': 'ppc',
    'paid ads': 'ppc',
    'social': 'content',
    'content': 'content',
    'blog': 'content',
    'social media': 'content',
    'analytics': 'analytics',
    'data': 'analytics',
    'reporting': 'analytics',
    'email': 'content',
  };
  
  const normalizedName = channelName.toLowerCase().trim();
  const insightChannel = channelMap[normalizedName];
  
  // If no mapping found, return overall confidence instead of defaulting to website
  if (!insightChannel) {
    return getOverallConfidenceStatus(channelInsights);
  }
  
  const insight = channelInsights.find(i => i.channel === insightChannel);
  return insight?.analysisStatus || 'assumed';
}

// Confidence Badge Component
function ConfidenceBadge({ status, size = 'sm' }: { status: AnalysisStatus; size?: 'sm' | 'xs' }) {
  const style = confidenceBadgeStyles[status];
  const label = status === 'assumed' ? 'Assumed' : status === 'evidence_provided' ? 'Evidence' : 'Verified';
  
  return (
    <Badge 
      variant={style.variant} 
      className={`${style.className} ${size === 'xs' ? 'text-[10px] px-1 py-0' : 'text-xs px-1.5 py-0.5'} gap-1 font-normal`}
      data-testid={`badge-confidence-${status}`}
    >
      {style.icon}
      {label}
    </Badge>
  );
}

// Custom Tooltip for Spider Chart
interface ChartDataPoint {
  channel: string;
  current: number;
  target: number;
  evidenceStatus: AnalysisStatus;
  insightChannel: InsightChannel;
}

function SpiderChartTooltip({ active, payload }: { active?: boolean; payload?: Array<{ payload: ChartDataPoint }> }) {
  if (!active || !payload || payload.length === 0) return null;
  
  const data = payload[0].payload;
  const statusLabel = ANALYSIS_STATUS_LABELS[data.evidenceStatus];
  const style = confidenceBadgeStyles[data.evidenceStatus];
  const gap = data.target - data.current;
  const gapText = gap > 0 ? `${gap} points below target` : gap < 0 ? `${Math.abs(gap)} points above target` : 'On target';
  
  return (
    <div className="bg-popover border rounded-md shadow-md p-3 min-w-[180px]" data-testid="spider-chart-tooltip">
      <div className="font-semibold mb-2">{data.channel}</div>
      <div className="space-y-1.5 text-sm">
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Current:</span>
          <span className="font-medium">{data.current}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Target:</span>
          <span className="font-medium">{data.target}%</span>
        </div>
        <div className="flex justify-between gap-4">
          <span className="text-muted-foreground">Gap:</span>
          <span className={`font-medium ${gap > 20 ? 'text-red-500' : gap > 0 ? 'text-amber-500' : 'text-green-500'}`}>
            {gapText}
          </span>
        </div>
        <div className="pt-1.5 border-t mt-1.5">
          <div className="flex items-center justify-between gap-2">
            <span className="text-muted-foreground">Evidence:</span>
            <Badge 
              variant={style.variant} 
              className={`${style.className} text-[10px] px-1.5 py-0 gap-1 font-normal`}
            >
              {style.icon}
              {data.evidenceStatus === 'assumed' ? 'Assumed' : data.evidenceStatus === 'evidence_provided' ? 'Evidence' : 'Verified'}
            </Badge>
          </div>
        </div>
      </div>
    </div>
  );
}

// Normalizer for StrategyPlan - ensures all arrays/objects have safe defaults
function normalizeStrategyPlan(rawPlan: StrategyPlan | null | undefined): StrategyPlan | null {
  if (!rawPlan) return null;
  return {
    ...rawPlan,
    id: rawPlan.id || '',
    clientId: rawPlan.clientId || '',
    status: rawPlan.status || 'active',
    goal: rawPlan.goal || null,
    coreStrategy: rawPlan.coreStrategy || '',
    gapSummary: rawPlan.gapSummary || '',
    currentState: {
      summary: rawPlan.currentState?.summary || '',
      strengths: rawPlan.currentState?.strengths || [],
      weaknesses: rawPlan.currentState?.weaknesses || [],
    },
    targetState: {
      summary: rawPlan.targetState?.summary || '',
      outcomes: rawPlan.targetState?.outcomes || [],
    },
    channelPlan: rawPlan.channelPlan || [],
    channelOKRs: rawPlan.channelOKRs || [],
    roadmap30: rawPlan.roadmap30 || [],
    roadmap60: rawPlan.roadmap60 || [],
    roadmap90: rawPlan.roadmap90 || [],
    roadmap_30_60_90: rawPlan.roadmap_30_60_90 || [],
    initiatives: rawPlan.initiatives || [],
    createdAt: rawPlan.createdAt || new Date(),
    updatedAt: rawPlan.updatedAt || new Date(),
  };
}

// Normalizer for BusinessProfile - ensures all arrays/strings have safe defaults
function normalizeBusinessProfile(rawProfile: BusinessProfile | null | undefined): BusinessProfile {
  if (!rawProfile) return { ...DEFAULT_BUSINESS_PROFILE };
  return {
    industry: rawProfile.industry || '',
    primaryServices: rawProfile.primaryServices || [],
    secondaryServices: rawProfile.secondaryServices || [],
    primaryLocations: rawProfile.primaryLocations || [],
    secondaryLocations: rawProfile.secondaryLocations || [],
    serviceAreaType: rawProfile.serviceAreaType || 'local',
    idealJobType: rawProfile.idealJobType || '',
    averageJobValue: rawProfile.averageJobValue ?? null,
    seasonalityNotes: rawProfile.seasonalityNotes ?? null,
    primaryGoal: rawProfile.primaryGoal ?? null,
    websiteUrl: rawProfile.websiteUrl || '',
    gbpUrl: rawProfile.gbpUrl || '',
    facebookUrl: rawProfile.facebookUrl || '',
    instagramUrl: rawProfile.instagramUrl || '',
    workingWell: rawProfile.workingWell || [],
    notWorkingWell: rawProfile.notWorkingWell || [],
    additionalNotes: rawProfile.additionalNotes || '',
  };
}

export default function ClientsPage() {
  const dispatch = useDispatch();
  const clients = useSelector((state: RootState) => state.app.clients);
  const searchQuery = useSelector((state: RootState) => state.app.searchQuery);
  const healthFilter = useSelector((state: RootState) => state.app.healthFilter);
  const regionFilter = useSelector((state: RootState) => state.app.regionFilter);
  const areaFilter = useSelector((state: RootState) => state.app.areaFilter);
  const user = useSelector((state: RootState) => state.app.user);
  const { toast } = useToast();
  const { user: authUser, orgId, authReady, membershipReady } = useAuth();
  const userId = authUser?.uid;

  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newBusinessName, setNewBusinessName] = useState('');
  const [newContactName, setNewContactName] = useState('');
  const [newPhone, setNewPhone] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newRegionId, setNewRegionId] = useState('');
  const [newAreaId, setNewAreaId] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const [clientDeliverables, setClientDeliverables] = useState<Record<string, Deliverable[]>>({});
  const [loadingDeliverables, setLoadingDeliverables] = useState<string | null>(null);
  const [isAddDeliverableOpen, setIsAddDeliverableOpen] = useState(false);
  const [newDeliverableTitle, setNewDeliverableTitle] = useState('');
  const [newDeliverableProduct, setNewDeliverableProduct] = useState('');
  const [newDeliverableNotes, setNewDeliverableNotes] = useState('');
  const [savingDeliverable, setSavingDeliverable] = useState(false);

  const [clientStrategySessions, setClientStrategySessions] = useState<Record<string, StrategySession[]>>({});
  const [clientStrategyPlan, setClientStrategyPlan] = useState<Record<string, StrategyPlan | null>>({});
  const [loadingStrategy, setLoadingStrategy] = useState<string | null>(null);
  const [isAddSessionOpen, setIsAddSessionOpen] = useState(false);
  const [newSessionAgenda, setNewSessionAgenda] = useState('');
  const [newSessionNotes, setNewSessionNotes] = useState('');
  const [savingSession, setSavingSession] = useState(false);

  const [isAIToolsOpen, setIsAIToolsOpen] = useState(false);
  const [aiToolType, setAiToolType] = useState<'seo' | 'facebook' | 'meeting'>('seo');
  const [aiToolInput, setAiToolInput] = useState('');
  const [aiToolResult, setAiToolResult] = useState<any>(null);
  const [generatingAI, setGeneratingAI] = useState(false);

  const [activeClientTab, setActiveClientTab] = useState<string>('details');
  const [activeStrategySubTab, setActiveStrategySubTab] = useState<string>('overview');

  const [isWizardOpen, setIsWizardOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(1);
  const [wizardClientId, setWizardClientId] = useState<string | null>(null);
  const [wizardData, setWizardData] = useState<BusinessProfile>({ ...DEFAULT_BUSINESS_PROFILE });
  const [savingWizard, setSavingWizard] = useState(false);
  const [generatingStrategy, setGeneratingStrategy] = useState<string | null>(null);

  const [clientContentDrafts, setClientContentDrafts] = useState<Record<string, ContentDraft[]>>({});
  const [loadingContentDrafts, setLoadingContentDrafts] = useState<string | null>(null);
  const [updatingDraft, setUpdatingDraft] = useState<string | null>(null);
  const [shareDialogClientId, setShareDialogClientId] = useState<string | null>(null);

  const [clientChannelInsights, setClientChannelInsights] = useState<Record<string, ChannelInsight[]>>({});
  const [loadingInsights, setLoadingInsights] = useState<string | null>(null);
  const [savingInsight, setSavingInsight] = useState<string | null>(null);
  const [editingInsight, setEditingInsight] = useState<{clientId: string, channel: InsightChannel, urls: string, pastedText: string, notes: string} | null>(null);

  const [clientEvidenceTasks, setClientEvidenceTasks] = useState<Record<string, EvidenceTask[]>>({});
  const [loadingEvidenceTasks, setLoadingEvidenceTasks] = useState<string | null>(null);
  const [savingEvidenceTask, setSavingEvidenceTask] = useState<string | null>(null);

  const [clientAnalyticsSnapshots, setClientAnalyticsSnapshots] = useState<Record<string, AnalyticsSnapshot[]>>({});
  const [loadingSnapshots, setLoadingSnapshots] = useState<string | null>(null);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [showSnapshotForm, setShowSnapshotForm] = useState(false);
  const [snapshotFormData, setSnapshotFormData] = useState({
    dateRange: '',
    sessions: '',
    users: '',
    conversions: '',
    conversionRate: '',
    topPages: '',
    topKeywords: '',
    notes: '',
  });

  // Activity tab state
  const [clientActivities, setClientActivities] = useState<Record<string, Activity[]>>({});
  const [clientTasks, setClientTasks] = useState<Record<string, Task[]>>({});
  const [loadingClientActivity, setLoadingClientActivity] = useState<string | null>(null);
  const [loggingAction, setLoggingAction] = useState(false);
  const [newClientNote, setNewClientNote] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [isAddTaskDialogOpen, setIsAddTaskDialogOpen] = useState(false);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const [newTaskType, setNewTaskType] = useState<TaskType>('check_in');
  const [newTaskDueDate, setNewTaskDueDate] = useState(getTodayDDMMYYYY());
  const [savingClientTask, setSavingClientTask] = useState(false);
  // AI Task Assist state
  const [aiAssisting, setAiAssisting] = useState(false);
  const [aiResult, setAiResult] = useState<AITaskAssistResponse | null>(null);
  const [aiChecklist, setAiChecklist] = useState<TaskChecklistItem[]>([]);
  const [aiOutcome, setAiOutcome] = useState('');
  const [aiPriority, setAiPriority] = useState<TaskPriority>('medium');
  const [aiFollowUp, setAiFollowUp] = useState('');
  const [aiEmailTemplate, setAiEmailTemplate] = useState('');
  const [aiCallScript, setAiCallScript] = useState('');

  const searchString = useSearch();

  useEffect(() => {
    if (clients.length === 0) return;
    const params = new URLSearchParams(searchString);
    const openType = params.get('openType');
    const openId = params.get('openId');
    if (openType === 'client' && openId) {
      const matchingClient = clients.find(c => c.id === openId);
      if (matchingClient) {
        setExpandedClientId(openId);
        window.history.replaceState(null, '', '/clients');
      }
    }
  }, [searchString, clients]);

  useEffect(() => {
    if (expandedClientId && orgId && authReady && !clientDeliverables[expandedClientId]) {
      setLoadingDeliverables(expandedClientId);
      fetchDeliverables(orgId, expandedClientId, authReady)
        .then(deliverables => {
          setClientDeliverables(prev => ({ ...prev, [expandedClientId]: deliverables }));
        })
        .finally(() => setLoadingDeliverables(null));
    }
  }, [expandedClientId, orgId, authReady]);

  useEffect(() => {
    if (expandedClientId && orgId && authReady && clientStrategySessions[expandedClientId] === undefined) {
      setLoadingStrategy(expandedClientId);
      Promise.all([
        fetchStrategySessions(orgId, expandedClientId, authReady),
        fetchStrategyPlan(orgId, expandedClientId, authReady),
      ])
        .then(([sessions, plan]) => {
          setClientStrategySessions(prev => ({ ...prev, [expandedClientId]: sessions }));
          setClientStrategyPlan(prev => ({ ...prev, [expandedClientId]: plan }));
        })
        .finally(() => setLoadingStrategy(null));
    }
  }, [expandedClientId, orgId, authReady]);

  useEffect(() => {
    if (expandedClientId && orgId && authReady && clientContentDrafts[expandedClientId] === undefined) {
      setLoadingContentDrafts(expandedClientId);
      fetchContentDrafts(orgId, expandedClientId, authReady)
        .then(drafts => {
          setClientContentDrafts(prev => ({ ...prev, [expandedClientId]: drafts }));
        })
        .finally(() => setLoadingContentDrafts(null));
    }
  }, [expandedClientId, orgId, authReady]);

  useEffect(() => {
    // Reset editing state when client changes
    setEditingInsight(null);
    
    if (expandedClientId && orgId && authReady && clientChannelInsights[expandedClientId] === undefined) {
      setLoadingInsights(expandedClientId);
      fetchChannelInsights(orgId, expandedClientId, authReady)
        .then(insights => {
          setClientChannelInsights(prev => ({ ...prev, [expandedClientId]: insights }));
        })
        .finally(() => setLoadingInsights(null));
    }
  }, [expandedClientId, orgId, authReady]);

  useEffect(() => {
    if (expandedClientId && orgId && authReady && clientEvidenceTasks[expandedClientId] === undefined) {
      setLoadingEvidenceTasks(expandedClientId);
      fetchEvidenceTasks(orgId, expandedClientId, authReady)
        .then(tasks => {
          setClientEvidenceTasks(prev => ({ ...prev, [expandedClientId]: tasks }));
        })
        .finally(() => setLoadingEvidenceTasks(null));
    }
  }, [expandedClientId, orgId, authReady]);

  useEffect(() => {
    if (expandedClientId && orgId && authReady && clientAnalyticsSnapshots[expandedClientId] === undefined) {
      setLoadingSnapshots(expandedClientId);
      fetchAnalyticsSnapshots(orgId, expandedClientId, authReady)
        .then(snapshots => {
          setClientAnalyticsSnapshots(prev => ({ ...prev, [expandedClientId]: snapshots }));
        })
        .finally(() => setLoadingSnapshots(null));
    }
  }, [expandedClientId, orgId, authReady]);

  // Load client activities and tasks when a client is expanded
  useEffect(() => {
    if (expandedClientId && orgId && authReady && clientActivities[expandedClientId] === undefined) {
      setLoadingClientActivity(expandedClientId);
      Promise.all([
        fetchClientActivities(orgId, expandedClientId, authReady),
        fetchClientTasks(orgId, expandedClientId, authReady),
      ])
        .then(([activities, tasks]) => {
          setClientActivities(prev => ({ ...prev, [expandedClientId]: activities }));
          setClientTasks(prev => ({ ...prev, [expandedClientId]: tasks }));
        })
        .finally(() => setLoadingClientActivity(null));
    }
  }, [expandedClientId, orgId, authReady]);

  // Handler to log a client action (call, email, meeting, etc.)
  const handleLogClientAction = async (clientId: string, clientName: string, actionType: ActivityType) => {
    if (!orgId || !userId) return;
    setLoggingAction(true);
    try {
      await logClientAction(orgId, {
        userId,
        clientId,
        type: actionType,
        clientName,
      }, authReady);
      
      // Refresh activities
      const activities = await fetchClientActivities(orgId, clientId, authReady);
      setClientActivities(prev => ({ ...prev, [clientId]: activities }));
      
      toast({ 
        title: 'Activity logged', 
        description: `${ACTIVITY_LABELS[actionType] || actionType} logged for ${clientName}` 
      });
    } catch (error) {
      console.error('Error logging client action:', error);
      toast({ title: 'Error', description: 'Failed to log activity.', variant: 'destructive' });
    } finally {
      setLoggingAction(false);
    }
  };

  // Handler to add a note to client history
  const handleAddClientNote = async (clientId: string) => {
    if (!orgId || !userId || !newClientNote.trim()) return;
    setSavingNote(true);
    try {
      await addClientNote(orgId, {
        userId,
        clientId,
        notes: newClientNote.trim(),
      }, authReady);
      
      // Refresh activities
      const activities = await fetchClientActivities(orgId, clientId, authReady);
      setClientActivities(prev => ({ ...prev, [clientId]: activities }));
      setNewClientNote('');
      
      toast({ title: 'Note added', description: 'Note has been saved to client history.' });
    } catch (error) {
      console.error('Error adding note:', error);
      toast({ title: 'Error', description: 'Failed to add note.', variant: 'destructive' });
    } finally {
      setSavingNote(false);
    }
  };

  // Handler to create a task for a client
  const handleCreateClientTask = async (clientId: string, clientName: string) => {
    // Validate required fields
    if (!orgId) {
      toast({ title: 'Error', description: 'No organization selected.', variant: 'destructive' });
      return;
    }
    if (!userId) {
      toast({ title: 'Error', description: 'User not authenticated.', variant: 'destructive' });
      return;
    }
    if (!newTaskTitle.trim()) {
      toast({ title: 'Error', description: 'Please enter a task title.', variant: 'destructive' });
      return;
    }
    if (!authReady) {
      toast({ title: 'Error', description: 'Please wait for authentication to complete.', variant: 'destructive' });
      return;
    }
    
    setSavingClientTask(true);
    try {
      console.log('[Task] Creating task:', { orgId, userId, clientId, clientName, title: newTaskTitle, dueDate: newTaskDueDate });
      
      await createClientTask(orgId, {
        userId,
        clientId,
        clientName,
        title: newTaskTitle.trim(),
        taskType: newTaskType,
        dueDate: newTaskDueDate,
        // AI-enhanced fields
        ...(aiResult && {
          aiEnhanced: true,
          outcomeStatement: aiOutcome,
          checklist: aiChecklist,
          priority: aiPriority,
          suggestedFollowUp: aiFollowUp,
          emailTemplate: aiEmailTemplate || undefined,
          callScript: aiCallScript || undefined,
        }),
      }, authReady);
      
      console.log('[Task] Task created successfully, refreshing list...');
      
      // Refresh tasks and activities
      const [tasks, activities] = await Promise.all([
        fetchClientTasks(orgId, clientId, authReady),
        fetchClientActivities(orgId, clientId, authReady),
      ]);
      setClientTasks(prev => ({ ...prev, [clientId]: tasks }));
      setClientActivities(prev => ({ ...prev, [clientId]: activities }));
      
      setNewTaskTitle('');
      setNewTaskType('check_in');
      setNewTaskDueDate(getTodayDDMMYYYY());
      resetAiAssistState();
      setIsAddTaskDialogOpen(false);
      
      toast({ title: 'Task created', description: 'Task has been added to your plan.' });
    } catch (error: any) {
      console.error('[Task] Error creating task:', error);
      const errorMessage = error?.message || 'Unknown error occurred';
      toast({ title: 'Failed to create task', description: errorMessage, variant: 'destructive' });
    } finally {
      setSavingClientTask(false);
    }
  };

  // AI Task Assist handler
  const handleAITaskAssist = async (client: Client) => {
    if (!newTaskTitle.trim()) {
      toast({ title: 'Enter task first', description: 'Type a rough task description, then click AI Assist.', variant: 'destructive' });
      return;
    }
    
    setAiAssisting(true);
    try {
      const response = await fetch('/api/ai/task-assist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          roughTask: newTaskTitle,
          clientName: client.businessName,
          clientContext: client.businessProfile?.industry || '',
          lastContactDate: client.lastContactDate ? client.lastContactDate.toLocaleDateString('en-AU') : 'Unknown',
          pipelineStage: client.strategyStatus || 'active',
          products: client.products?.map(p => p.productType) || [],
          todayDate: getTodayDDMMYYYY(),
        }),
      });
      
      if (!response.ok) throw new Error('Failed to get AI assistance');
      
      const result: AITaskAssistResponse = await response.json();
      setAiResult(result);
      
      // Populate form fields with AI suggestions
      setNewTaskTitle(result.enhancedTitle);
      setNewTaskDueDate(result.suggestedDueDate);
      setNewTaskType(result.suggestedTaskType as TaskType);
      setAiOutcome(result.outcomeStatement);
      setAiPriority(result.priority);
      setAiFollowUp(result.suggestedFollowUp);
      setAiChecklist(result.checklist.map((text, idx) => ({
        id: `check-${idx}`,
        text,
        completed: false,
      })));
      setAiEmailTemplate(result.emailTemplate || '');
      setAiCallScript(result.callScript || '');
      
      toast({ title: 'AI Assist Complete', description: 'Task has been enhanced with actionable details.' });
    } catch (error) {
      console.error('AI Task Assist error:', error);
      toast({ title: 'AI Assist Failed', description: 'Could not enhance task. Please try again.', variant: 'destructive' });
    } finally {
      setAiAssisting(false);
    }
  };

  // Reset AI assist state when dialog closes
  const resetAiAssistState = () => {
    setAiResult(null);
    setAiChecklist([]);
    setAiOutcome('');
    setAiPriority('medium');
    setAiFollowUp('');
    setAiEmailTemplate('');
    setAiCallScript('');
  };

  // Handler to complete a client task
  const handleCompleteClientTask = async (clientId: string, taskId: string) => {
    if (!orgId) return;
    try {
      await updatePlanTask(orgId, taskId, {
        status: 'completed',
        completedAt: new Date(),
      }, authReady);
      
      // Refresh tasks
      const tasks = await fetchClientTasks(orgId, clientId, authReady);
      setClientTasks(prev => ({ ...prev, [clientId]: tasks }));
      
      toast({ title: 'Task completed!' });
    } catch (error) {
      console.error('Error completing task:', error);
      toast({ title: 'Error', description: 'Failed to complete task.', variant: 'destructive' });
    }
  };

  const handleCreateEvidenceTask = async (clientId: string, task: string, channel: InsightChannel, definition: string, impactMetric: string) => {
    if (!orgId) return;
    setSavingEvidenceTask('new');
    try {
      const taskData: Omit<EvidenceTask, 'id'> = {
        clientId,
        task,
        channel,
        definition,
        evidenceRequired: ['screenshot', 'url'],
        evidenceProvided: [],
        status: 'pending',
        impactMetric,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const saved = await createEvidenceTask(orgId, clientId, taskData, authReady);
      setClientEvidenceTasks(prev => ({
        ...prev,
        [clientId]: [saved, ...(prev[clientId] || [])],
      }));
      toast({ title: "Task created", description: "Evidence task has been added." });
    } catch (error) {
      console.error('Error creating evidence task:', error);
      toast({ title: "Error", description: "Failed to create task.", variant: "destructive" });
    } finally {
      setSavingEvidenceTask(null);
    }
  };

  const handleUpdateEvidenceTaskStatus = async (clientId: string, taskId: string, newStatus: EvidenceTaskStatus) => {
    if (!orgId) return;
    setSavingEvidenceTask(taskId);
    try {
      const updates: Partial<EvidenceTask> = { 
        status: newStatus,
        updatedAt: new Date(),
      };
      if (newStatus === 'completed') updates.completedAt = new Date();
      if (newStatus === 'verified') updates.verifiedAt = new Date();
      
      await updateEvidenceTask(orgId, clientId, taskId, updates, authReady);
      setClientEvidenceTasks(prev => ({
        ...prev,
        [clientId]: (prev[clientId] || []).map(t => 
          t.id === taskId ? { ...t, ...updates } : t
        ),
      }));
      toast({ title: "Task updated", description: `Task marked as ${newStatus}.` });
    } catch (error) {
      console.error('Error updating evidence task:', error);
      toast({ title: "Error", description: "Failed to update task.", variant: "destructive" });
    } finally {
      setSavingEvidenceTask(null);
    }
  };

  const handleCreateAnalyticsSnapshot = async (clientId: string) => {
    if (!orgId) return;
    setSavingSnapshot(true);
    try {
      const snapshotData: Omit<AnalyticsSnapshot, 'id'> = {
        clientId,
        dateRange: snapshotFormData.dateRange,
        sessions: snapshotFormData.sessions ? parseInt(snapshotFormData.sessions) : null,
        users: snapshotFormData.users ? parseInt(snapshotFormData.users) : null,
        conversions: snapshotFormData.conversions ? parseInt(snapshotFormData.conversions) : null,
        conversionRate: snapshotFormData.conversionRate ? parseFloat(snapshotFormData.conversionRate) : null,
        topPages: snapshotFormData.topPages ? snapshotFormData.topPages.split('\n').filter(p => p.trim()) : [],
        topKeywords: snapshotFormData.topKeywords ? snapshotFormData.topKeywords.split('\n').filter(k => k.trim()) : [],
        notes: snapshotFormData.notes,
        createdAt: new Date(),
      };
      const saved = await createAnalyticsSnapshot(orgId, clientId, snapshotData, authReady);
      setClientAnalyticsSnapshots(prev => ({
        ...prev,
        [clientId]: [saved, ...(prev[clientId] || [])],
      }));
      setShowSnapshotForm(false);
      setSnapshotFormData({
        dateRange: '',
        sessions: '',
        users: '',
        conversions: '',
        conversionRate: '',
        topPages: '',
        topKeywords: '',
        notes: '',
      });
      toast({ title: "Snapshot saved", description: "Analytics snapshot has been recorded." });
    } catch (error) {
      console.error('Error creating analytics snapshot:', error);
      toast({ title: "Error", description: "Failed to save snapshot.", variant: "destructive" });
    } finally {
      setSavingSnapshot(false);
    }
  };

  const getSnapshotComparison = (snapshots: AnalyticsSnapshot[]) => {
    if (snapshots.length < 2) return null;
    const current = snapshots[0];
    const previous = snapshots[1];
    const calcChange = (curr: number | null, prev: number | null) => {
      if (curr === null || prev === null || prev === 0) return null;
      const value = curr - prev;
      const percent = ((curr - prev) / prev) * 100;
      return { value, percent };
    };
    return {
      sessions: calcChange(current.sessions, previous.sessions),
      users: calcChange(current.users, previous.users),
      conversions: calcChange(current.conversions, previous.conversions),
      conversionRate: calcChange(current.conversionRate, previous.conversionRate),
    };
  };

  // Generate strategy feedback insights based on evidence and analytics
  const generateStrategyFeedback = (
    clientId: string,
    channelInsights: ChannelInsight[],
    analyticsSnapshots: AnalyticsSnapshot[],
    evidenceTasks: EvidenceTask[],
    strategyPlan: StrategyPlan | null
  ): { type: 'success' | 'warning' | 'action'; message: string; channel?: InsightChannel }[] => {
    const feedback: { type: 'success' | 'warning' | 'action'; message: string; channel?: InsightChannel }[] = [];
    
    // Analytics-based feedback
    const comparison = getSnapshotComparison(analyticsSnapshots);
    if (comparison) {
      if (comparison.sessions && comparison.sessions.percent > 20) {
        feedback.push({ type: 'success', message: `Sessions up ${comparison.sessions.percent.toFixed(0)}% - SEO/content strategy is working. Consider doubling down on successful tactics.` });
      } else if (comparison.sessions && comparison.sessions.percent < -10) {
        feedback.push({ type: 'warning', message: `Sessions down ${Math.abs(comparison.sessions.percent).toFixed(0)}% - Review recent changes and check for technical issues.` });
      }
      
      if (comparison.conversions && comparison.conversions.percent > 15) {
        feedback.push({ type: 'success', message: `Conversions up ${comparison.conversions.percent.toFixed(0)}% - Great progress toward lead generation goals!` });
      } else if (comparison.conversions && comparison.conversions.percent < -15) {
        feedback.push({ type: 'warning', message: `Conversions down ${Math.abs(comparison.conversions.percent).toFixed(0)}% - Check landing pages and CTAs, consider A/B testing.` });
      }
      
      if (comparison.conversionRate && comparison.conversionRate.percent < -20) {
        feedback.push({ type: 'action', message: `Conversion rate dropped significantly. Traffic quality may be declining - review traffic sources.` });
      }
    }
    
    // Evidence coverage feedback
    const channels: InsightChannel[] = ['website', 'seo', 'gbp', 'content', 'ppc', 'analytics'];
    const verifiedChannels = channelInsights.filter(i => i.analysisStatus === 'verified').map(i => i.channel);
    const evidenceChannels = channelInsights.filter(i => i.analysisStatus === 'evidence_provided').map(i => i.channel);
    const assumedChannels = channels.filter(c => !verifiedChannels.includes(c) && !evidenceChannels.includes(c));
    
    if (verifiedChannels.length >= 4) {
      feedback.push({ type: 'success', message: `Strong evidence coverage! ${verifiedChannels.length}/6 channels verified - strategy recommendations are high-confidence.` });
    } else if (assumedChannels.length >= 4) {
      feedback.push({ type: 'action', message: `Low evidence coverage. ${assumedChannels.length}/6 channels still assumed. Add evidence to improve strategy accuracy.` });
    }
    
    // Evidence recently provided - suggest verification
    evidenceChannels.forEach(channel => {
      const insight = channelInsights.find(i => i.channel === channel);
      if (insight && insight.providedAt) {
        const daysSinceProvided = Math.floor((Date.now() - new Date(insight.providedAt).getTime()) / (1000 * 60 * 60 * 24));
        if (daysSinceProvided <= 7) {
          feedback.push({ type: 'action', message: `${INSIGHT_CHANNEL_LABELS[channel]} evidence added recently - review and verify to update confidence.`, channel });
        }
      }
    });
    
    // Evidence tasks feedback
    const completedTasks = evidenceTasks.filter(t => t.status === 'completed').length;
    const verifiedTasks = evidenceTasks.filter(t => t.status === 'verified').length;
    const pendingTasks = evidenceTasks.filter(t => t.status === 'pending' || t.status === 'in_progress').length;
    
    if (completedTasks > 0 && completedTasks > verifiedTasks) {
      feedback.push({ type: 'action', message: `${completedTasks - verifiedTasks} completed task(s) awaiting verification. Verify to confirm strategy impact.` });
    }
    
    if (pendingTasks > 3) {
      feedback.push({ type: 'warning', message: `${pendingTasks} evidence tasks pending. Consider prioritizing key tasks to build strategy confidence.` });
    }
    
    // Strategy-specific feedback based on goal
    if (strategyPlan?.goal) {
      const websiteInsight = channelInsights.find(i => i.channel === 'website');
      const gbpInsight = channelInsights.find(i => i.channel === 'gbp');
      const seoInsight = channelInsights.find(i => i.channel === 'seo');
      
      if (strategyPlan.goal === 'map_pack' && gbpInsight?.analysisStatus === 'assumed') {
        feedback.push({ type: 'action', message: `Map Pack goal set but GBP evidence is assumed. Add GBP evidence to validate strategy.`, channel: 'gbp' });
      }
      if (strategyPlan.goal === 'organic_rankings' && seoInsight?.analysisStatus === 'assumed') {
        feedback.push({ type: 'action', message: `Organic rankings goal set but SEO evidence is assumed. Add keyword/ranking data.`, channel: 'seo' });
      }
      if (strategyPlan.goal === 'more_leads' && websiteInsight?.analysisStatus === 'assumed') {
        feedback.push({ type: 'action', message: `Lead generation goal set but website evidence is assumed. Add conversion data.`, channel: 'website' });
      }
    }
    
    return feedback.slice(0, 5); // Limit to 5 most relevant insights
  };

  const handleSaveChannelInsight = async (clientId: string, channel: InsightChannel, urls: string, pastedText: string, notes: string) => {
    if (!orgId) return;
    setSavingInsight(channel);
    try {
      const existingInsight = clientChannelInsights[clientId]?.find(i => i.channel === channel);
      const urlList = urls.split('\n').map(u => u.trim()).filter(u => u);
      const hasEvidence = urlList.length > 0 || pastedText.trim() || notes.trim();
      // Preserve verified status if already set; otherwise determine from evidence
      let newStatus: AnalysisStatus;
      if (existingInsight?.analysisStatus === 'verified' && hasEvidence) {
        newStatus = 'verified'; // Keep verified if there's still evidence
      } else {
        newStatus = hasEvidence ? 'evidence_provided' : 'assumed';
      }
      
      const insightData = {
        clientId,
        channel,
        analysisStatus: newStatus,
        evidence: {
          screenshots: existingInsight?.evidence?.screenshots || [],
          urls: urlList,
          pastedText: pastedText.trim(),
          notes: notes.trim(),
        },
        providedBy: hasEvidence ? (authUser?.uid || null) : null,
        providedAt: hasEvidence ? new Date() : null,
        aiAnalysis: existingInsight?.aiAnalysis || null,
        createdAt: existingInsight?.createdAt || new Date(),
        updatedAt: new Date(),
      };
      
      const saved = await saveChannelInsight(orgId, clientId, insightData, authReady);
      setClientChannelInsights(prev => {
        const existing = prev[clientId] || [];
        const idx = existing.findIndex(i => i.channel === channel);
        if (idx >= 0) {
          return { ...prev, [clientId]: [...existing.slice(0, idx), saved, ...existing.slice(idx + 1)] };
        }
        return { ...prev, [clientId]: [...existing, saved] };
      });
      setEditingInsight(null);
      toast({ title: "Evidence saved", description: `${INSIGHT_CHANNEL_LABELS[channel]} evidence has been updated.` });
    } catch (error) {
      console.error('Error saving channel insight:', error);
      toast({ title: "Error", description: "Failed to save evidence.", variant: "destructive" });
    } finally {
      setSavingInsight(null);
    }
  };

  const handleMarkInsightVerified = async (clientId: string, channel: InsightChannel) => {
    if (!orgId) return;
    setSavingInsight(channel);
    try {
      const existingInsight = clientChannelInsights[clientId]?.find(i => i.channel === channel);
      if (!existingInsight) {
        toast({ title: "Error", description: "No evidence to verify.", variant: "destructive" });
        return;
      }
      
      const insightData = {
        ...existingInsight,
        analysisStatus: 'verified' as AnalysisStatus,
        updatedAt: new Date(),
      };
      
      const saved = await saveChannelInsight(orgId, clientId, insightData, authReady);
      setClientChannelInsights(prev => {
        const existing = prev[clientId] || [];
        const idx = existing.findIndex(i => i.channel === channel);
        if (idx >= 0) {
          return { ...prev, [clientId]: [...existing.slice(0, idx), saved, ...existing.slice(idx + 1)] };
        }
        return { ...prev, [clientId]: [...existing, saved] };
      });
      toast({ title: "Verified", description: `${INSIGHT_CHANNEL_LABELS[channel]} has been marked as verified.` });
    } catch (error) {
      console.error('Error verifying channel insight:', error);
      toast({ title: "Error", description: "Failed to verify.", variant: "destructive" });
    } finally {
      setSavingInsight(null);
    }
  };

  const handleUpdateDraftStatus = async (clientId: string, draftId: string, newStatus: ContentDraftStatus, feedback?: string) => {
    if (!orgId) return;
    setUpdatingDraft(draftId);
    try {
      const updates: Partial<ContentDraft> = { status: newStatus };
      if (feedback) updates.feedback = feedback;
      if (newStatus === 'published') updates.publishedAt = new Date();
      
      await updateContentDraft(orgId, clientId, draftId, updates, authReady);
      setClientContentDrafts(prev => ({
        ...prev,
        [clientId]: prev[clientId]?.map(d => d.id === draftId ? { ...d, ...updates, updatedAt: new Date() } : d) || [],
      }));
      toast({ title: "Draft updated", description: `Content has been ${newStatus === 'approved' ? 'approved' : newStatus === 'rejected' ? 'rejected' : 'updated'}.` });
    } catch (error) {
      console.error('Error updating draft:', error);
      toast({ title: "Error", description: "Failed to update draft.", variant: "destructive" });
    } finally {
      setUpdatingDraft(null);
    }
  };

  const handleAddSession = async (clientId: string) => {
    if (!newSessionAgenda.trim()) {
      toast({ title: "Validation Error", description: "Agenda is required.", variant: "destructive" });
      return;
    }
    setSavingSession(true);
    try {
      if (!orgId) throw new Error('Organization not found');
      const sessionData: Omit<StrategySession, 'id'> = {
        clientId,
        sessionDate: new Date(),
        attendees: [],
        agenda: newSessionAgenda.trim(),
        notes: newSessionNotes.trim() || '',
        actionItems: [],
        createdAt: new Date(),
      };
      const saved = await createStrategySession(orgId, clientId, sessionData, authReady);
      setClientStrategySessions(prev => ({
        ...prev,
        [clientId]: [saved, ...(prev[clientId] || [])],
      }));
      toast({ title: "Session added", description: "Strategy session has been created." });
      setNewSessionAgenda('');
      setNewSessionNotes('');
      setIsAddSessionOpen(false);
    } catch (error) {
      console.error('Error creating strategy session:', error);
      toast({ title: "Error", description: "Failed to create session.", variant: "destructive" });
    } finally {
      setSavingSession(false);
    }
  };

  const handleDeleteSession = async (clientId: string, sessionId: string) => {
    if (!orgId) return;
    try {
      await deleteStrategySession(orgId, clientId, sessionId, authReady);
      setClientStrategySessions(prev => ({
        ...prev,
        [clientId]: prev[clientId]?.filter(s => s.id !== sessionId) || [],
      }));
      toast({ title: "Session deleted", description: "Strategy session has been removed." });
    } catch (error) {
      console.error('Error deleting strategy session:', error);
      toast({ title: "Error", description: "Failed to delete session.", variant: "destructive" });
    }
  };

  const handleGenerateAIContent = async (client: Client) => {
    if (!aiToolInput.trim() && aiToolType !== 'meeting') {
      toast({ title: "Input required", description: "Please enter a topic or details.", variant: "destructive" });
      return;
    }
    setGeneratingAI(true);
    setAiToolResult(null);
    try {
      let endpoint = '';
      let body: any = { client };
      
      switch (aiToolType) {
        case 'seo':
          endpoint = '/api/clients/ai/seo-blog';
          body.topic = aiToolInput;
          break;
        case 'facebook':
          endpoint = '/api/clients/ai/facebook-post';
          body.postType = 'engagement';
          body.promotion = aiToolInput || undefined;
          break;
        case 'meeting':
          endpoint = '/api/clients/ai/meeting-prep';
          body.meetingType = aiToolInput || 'check-in';
          body.strategyPlan = clientStrategyPlan[client.id];
          break;
      }
      
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      
      if (!response.ok) throw new Error('Failed to generate content');
      const data = await response.json();
      setAiToolResult(data);
      toast({ title: "Content generated", description: "AI content is ready!" });
    } catch (error) {
      console.error('Error generating AI content:', error);
      toast({ title: "Error", description: "Failed to generate AI content.", variant: "destructive" });
    } finally {
      setGeneratingAI(false);
    }
  };

  const handleAddDeliverable = async (clientId: string) => {
    if (!newDeliverableTitle.trim() || !newDeliverableProduct.trim()) {
      toast({ title: "Validation Error", description: "Title and product type are required.", variant: "destructive" });
      return;
    }
    setSavingDeliverable(true);
    try {
      if (!orgId) throw new Error('Organization not found');
      const deliverableData: Omit<Deliverable, 'id'> = {
        clientId,
        productType: newDeliverableProduct.trim(),
        title: newDeliverableTitle.trim(),
        status: 'not_started',
        milestones: [],
        notes: newDeliverableNotes || undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      const saved = await createDeliverable(orgId, clientId, deliverableData, authReady);
      setClientDeliverables(prev => ({
        ...prev,
        [clientId]: [saved, ...(prev[clientId] || [])],
      }));
      toast({ title: "Deliverable added", description: `${newDeliverableTitle} has been created.` });
      setNewDeliverableTitle('');
      setNewDeliverableProduct('');
      setNewDeliverableNotes('');
      setIsAddDeliverableOpen(false);
    } catch (error) {
      console.error('Error creating deliverable:', error);
      toast({ title: "Error", description: "Failed to create deliverable.", variant: "destructive" });
    } finally {
      setSavingDeliverable(false);
    }
  };

  const handleUpdateDeliverableStatus = async (clientId: string, deliverableId: string, newStatus: DeliverableStatus) => {
    if (!orgId) return;
    try {
      await updateDeliverable(orgId, clientId, deliverableId, { status: newStatus }, authReady);
      setClientDeliverables(prev => ({
        ...prev,
        [clientId]: prev[clientId]?.map(d => d.id === deliverableId ? { ...d, status: newStatus, updatedAt: new Date() } : d) || [],
      }));
    } catch (error) {
      console.error('Error updating deliverable:', error);
      toast({ title: "Error", description: "Failed to update deliverable.", variant: "destructive" });
    }
  };

  const handleToggleMilestone = async (clientId: string, deliverableId: string, milestoneId: string, completed: boolean) => {
    if (!orgId) return;
    const deliverable = clientDeliverables[clientId]?.find(d => d.id === deliverableId);
    if (!deliverable) return;
    const updatedMilestones = deliverable.milestones.map(m =>
      m.id === milestoneId ? { ...m, completed, completedAt: completed ? new Date() : undefined } : m
    );
    try {
      await updateDeliverable(orgId, clientId, deliverableId, { milestones: updatedMilestones }, authReady);
      setClientDeliverables(prev => ({
        ...prev,
        [clientId]: prev[clientId]?.map(d => d.id === deliverableId ? { ...d, milestones: updatedMilestones } : d) || [],
      }));
    } catch (error) {
      console.error('Error updating milestone:', error);
    }
  };

  const availableFilterAreas = regionFilter !== 'all' ? getAreasForRegion(regionFilter) : [];
  const availableNewClientAreas = newRegionId ? getAreasForRegion(newRegionId) : [];

  const filteredClients = clients.filter(client => {
    if (client.archived) return false;
    if (searchQuery && !client.businessName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (healthFilter !== 'all' && client.healthStatus !== healthFilter) return false;
    if (regionFilter !== 'all') {
      if (client.regionId !== regionFilter) return false;
      if (areaFilter !== 'all' && client.areaId !== areaFilter) return false;
    }
    return true;
  });

  const healthCounts = {
    green: clients.filter(c => !c.archived && c.healthStatus === 'green').length,
    amber: clients.filter(c => !c.archived && c.healthStatus === 'amber').length,
    red: clients.filter(c => !c.archived && c.healthStatus === 'red').length,
  };

  const handleAddClient = async () => {
    if (!newBusinessName.trim() || !newContactName.trim()) {
      toast({
        title: "Validation Error",
        description: "Business name and contact name are required.",
        variant: "destructive",
      });
      return;
    }

    const territoryValidation = validateTerritorySelection(newRegionId, newAreaId || null);
    if (!territoryValidation.valid) {
      toast({
        title: "Validation Error",
        description: territoryValidation.error,
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      if (!orgId) throw new Error('Organization not found');

      const territoryFields = computeTerritoryFields(newRegionId, newAreaId || null);
      const now = new Date();

      const clientData: Omit<Client, 'id'> = {
        userId: authUser?.uid || user?.id || 'demo',
        businessName: newBusinessName.trim(),
        primaryContactName: newContactName.trim(),
        phone: newPhone || undefined,
        email: newEmail || undefined,
        regionId: territoryFields.regionId,
        regionName: territoryFields.regionName,
        areaId: territoryFields.areaId,
        areaName: territoryFields.areaName,
        territoryKey: territoryFields.territoryKey,
        ownerId: authUser?.uid || user?.id || 'demo',
        products: [],
        businessProfile: null,
        strategyStatus: 'not_started' as StrategyStatus,
        healthStatus: 'green',
        churnRiskScore: 0,
        healthReasons: [],
        channelStatus: { website: 'not_started', gbp: 'not_started', seo: 'not_started', ppc: 'not_started' } as ChannelStatuses,
        cadenceTier: 'standard',
        preferredContactCadenceDays: 14,
        sourceType: 'manual',
        totalMRR: 0,
        createdAt: now,
        updatedAt: now,
        archived: false,
      };

      const savedClient = await createClientInFirestore(orgId, clientData, authReady);
      dispatch(addClient(savedClient));

      toast({
        title: "Client added",
        description: `${newBusinessName} has been saved.`,
      });

      setNewBusinessName('');
      setNewContactName('');
      setNewPhone('');
      setNewEmail('');
      setNewRegionId('');
      setNewAreaId('');
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error('Error saving client:', error);
      toast({
        title: "Error",
        description: "Failed to save client. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const openWizard = (client: Client) => {
    setWizardClientId(client.id);
    setWizardData(client.businessProfile || { ...DEFAULT_BUSINESS_PROFILE });
    setWizardStep(1);
    setIsWizardOpen(true);
  };

  const closeWizard = () => {
    setIsWizardOpen(false);
    setWizardStep(1);
    setWizardClientId(null);
    setWizardData({ ...DEFAULT_BUSINESS_PROFILE });
  };

  const handleWizardNext = () => {
    if (wizardStep < 6) setWizardStep(wizardStep + 1);
  };

  const handleWizardBack = () => {
    if (wizardStep > 1) setWizardStep(wizardStep - 1);
  };

  const handleWizardSave = async () => {
    if (!wizardClientId || !orgId) return;
    setSavingWizard(true);
    try {
      await updateClientInFirestore(orgId, wizardClientId, {
        businessProfile: wizardData,
        strategyStatus: 'in_progress' as StrategyStatus,
      }, authReady);
      
      const clientToUpdate = clients.find(c => c.id === wizardClientId);
      if (clientToUpdate) {
        dispatch(updateClient({
          ...clientToUpdate,
          businessProfile: wizardData,
          strategyStatus: 'in_progress' as StrategyStatus,
          updatedAt: new Date(),
        }));
      }
      
      toast({ title: "Strategy saved", description: "Business profile has been captured." });
      closeWizard();
    } catch (error) {
      console.error('Error saving wizard:', error);
      toast({ title: "Error", description: "Failed to save strategy data.", variant: "destructive" });
    } finally {
      setSavingWizard(false);
    }
  };

  const handleGenerateStrategy = async (client: Client) => {
    if (!client.businessProfile || !orgId) {
      toast({ title: "Missing Information", description: "Please complete the strategy wizard first.", variant: "destructive" });
      return;
    }
    setGeneratingStrategy(client.id);
    try {
      const response = await fetch('/api/clients/ai/generate-strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client, businessProfile: client.businessProfile }),
      });
      
      if (!response.ok) throw new Error('Failed to generate strategy');
      const strategyData = await response.json();
      
      const planToSave = {
        clientId: client.id,
        status: 'active' as const,
        goal: client.businessProfile.primaryGoal,
        ...strategyData,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      
      const savedPlan = await saveStrategyPlan(orgId, client.id, planToSave, authReady);
      setClientStrategyPlan(prev => ({ ...prev, [client.id]: savedPlan }));
      
      await updateClientInFirestore(orgId, client.id, {
        strategyStatus: 'completed' as StrategyStatus,
        activeStrategyPlanId: savedPlan.id,
      }, authReady);
      
      dispatch(updateClient({
        ...client,
        strategyStatus: 'completed' as StrategyStatus,
        activeStrategyPlanId: savedPlan.id,
        updatedAt: new Date(),
      }));
      
      // Auto-generate Action Queue items from roadmap milestones
      if (strategyData.roadmap_30_60_90 && Array.isArray(strategyData.roadmap_30_60_90)) {
        const now = new Date();
        const actionPromises = strategyData.roadmap_30_60_90.slice(0, 5).map((milestone: { id: string; title: string; description: string; phase: string; channel: string }, idx: number) => {
          // Calculate due date based on phase (30, 60, or 90 days)
          const phaseDays = milestone.phase === '30' ? 30 : milestone.phase === '60' ? 60 : 90;
          const dueDate = new Date(now);
          dueDate.setDate(dueDate.getDate() + phaseDays);
          
          // Map channel to action type
          const channelToActionType: Record<string, NBAActionType> = {
            'website': 'meeting',
            'gbp': 'research',
            'seo': 'research',
            'ppc': 'meeting',
            'content': 'email',
          };
          const actionType = channelToActionType[milestone.channel?.toLowerCase()] || 'followup';
          
          const actionData: Omit<NBAAction, 'id'> = {
            targetType: 'client',
            targetId: client.id,
            title: `[Strategy] ${milestone.title}`,
            suggestedActionType: actionType,
            suggestedMessage: milestone.description,
            suggestedEmail: null,
            nepqQuestions: ['What progress have you seen?', 'Any blockers we should discuss?', 'What would make this a win?'],
            reason: `Part of ${milestone.phase}-day strategy roadmap for ${client.businessName}`,
            whyBullets: [
              `Phase ${milestone.phase} milestone`,
              `Channel: ${milestone.channel}`,
              `From AI-generated strategy plan`,
            ],
            suggestedNextStep: `Complete: ${milestone.title}`,
            priorityScore: 100 - (idx * 10),
            points: 5,
            dueAt: dueDate,
            status: 'open',
            createdAt: now,
            updatedAt: now,
            aiModelVersion: 'strategy-v1',
            suppressUntil: null,
            dismissedReason: null,
            dismissedAt: null,
            fingerprint: `strategy-${client.id}-${savedPlan.id}-${milestone.id || idx}`,
          };
          
          return createNBAAction(orgId, actionData, authReady);
        });
        
        await Promise.all(actionPromises);
      }
      
      toast({ title: "Strategy Generated", description: "AI strategy plan and action items have been created." });
    } catch (error) {
      console.error('Error generating strategy:', error);
      toast({ title: "Error", description: "Failed to generate strategy.", variant: "destructive" });
    } finally {
      setGeneratingStrategy(null);
    }
  };

  const updateWizardField = <K extends keyof BusinessProfile>(field: K, value: BusinessProfile[K]) => {
    setWizardData(prev => ({ ...prev, [field]: value }));
  };

  const addToWizardArray = (field: 'primaryServices' | 'secondaryServices' | 'primaryLocations' | 'secondaryLocations' | 'workingWell' | 'notWorkingWell', value: string) => {
    const cleaned = value.trim();
    if (!cleaned) return;
    setWizardData(prev => {
      const existing = prev[field] || [];
      // Prevent duplicates (case-insensitive)
      if (existing.some(item => item.toLowerCase() === cleaned.toLowerCase())) {
        return prev;
      }
      return {
        ...prev,
        [field]: [...existing, cleaned],
      };
    });
  };

  const removeFromWizardArray = (field: 'primaryServices' | 'secondaryServices' | 'primaryLocations' | 'secondaryLocations' | 'workingWell' | 'notWorkingWell', index: number) => {
    setWizardData(prev => ({
      ...prev,
      [field]: prev[field].filter((_, i) => i !== index),
    }));
  };

  const formatMRR = (mrr: number) => {
    return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', minimumFractionDigits: 0 }).format(mrr);
  };

  const formatDate = (date: Date | undefined) => {
    if (!date) return '-';
    return new Date(date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 p-4 border-b flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 mr-2">
            <Badge variant="outline" className="gap-1" data-testid="badge-health-green">
              <CheckCircle className="h-3 w-3 text-green-500" />
              {healthCounts.green}
            </Badge>
            <Badge variant="outline" className="gap-1" data-testid="badge-health-amber">
              <AlertTriangle className="h-3 w-3 text-amber-500" />
              {healthCounts.amber}
            </Badge>
            <Badge variant="outline" className="gap-1" data-testid="badge-health-red">
              <AlertCircle className="h-3 w-3 text-red-500" />
              {healthCounts.red}
            </Badge>
          </div>

          <Select value={healthFilter} onValueChange={(val) => dispatch(setHealthFilter(val as HealthStatus | 'all'))}>
            <SelectTrigger className="w-36" data-testid="select-filter-health">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Health" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Health</SelectItem>
              <SelectItem value="green">Healthy</SelectItem>
              <SelectItem value="amber">At Risk</SelectItem>
              <SelectItem value="red">Critical</SelectItem>
            </SelectContent>
          </Select>

          <Select value={regionFilter} onValueChange={(val) => dispatch(setRegionFilter(val))}>
            <SelectTrigger className="w-40" data-testid="select-filter-region">
              <SelectValue placeholder="All Regions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {TERRITORY_CONFIG.map(region => (
                <SelectItem key={region.id} value={region.id}>{region.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={areaFilter}
            onValueChange={(val) => dispatch(setAreaFilter(val))}
            disabled={regionFilter === 'all' || availableFilterAreas.length === 0}
          >
            <SelectTrigger className="w-40" data-testid="select-filter-area">
              <SelectValue placeholder="All Areas" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Areas</SelectItem>
              {availableFilterAreas.map(area => (
                <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button className="gap-2" data-testid="button-add-client">
              <Plus className="h-4 w-4" />
              Add Client
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Client</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="business-name">Business Name</Label>
                <Input
                  id="business-name"
                  value={newBusinessName}
                  onChange={(e) => setNewBusinessName(e.target.value)}
                  placeholder="Enter business name..."
                  data-testid="input-new-business"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="contact-name">Primary Contact</Label>
                <Input
                  id="contact-name"
                  value={newContactName}
                  onChange={(e) => setNewContactName(e.target.value)}
                  placeholder="Contact name..."
                  data-testid="input-new-contact"
                />
              </div>
              <div className="space-y-2">
                <Label>Contact Details</Label>
                <Input
                  value={newPhone}
                  onChange={(e) => setNewPhone(e.target.value)}
                  placeholder="Phone"
                  data-testid="input-new-phone"
                />
                <Input
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="Email"
                  type="email"
                  data-testid="input-new-email"
                />
              </div>
              <div className="space-y-2">
                <Label>Territory</Label>
                <div className="flex gap-2">
                  <Select
                    value={newRegionId}
                    onValueChange={(val) => {
                      setNewRegionId(val);
                      setNewAreaId('');
                    }}
                  >
                    <SelectTrigger className="flex-1" data-testid="select-new-region">
                      <SelectValue placeholder="Select region..." />
                    </SelectTrigger>
                    <SelectContent>
                      {TERRITORY_CONFIG.map(region => (
                        <SelectItem key={region.id} value={region.id}>{region.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Select
                    value={newAreaId}
                    onValueChange={setNewAreaId}
                    disabled={!newRegionId || availableNewClientAreas.length === 0}
                  >
                    <SelectTrigger className="flex-1" data-testid="select-new-area">
                      <SelectValue placeholder={availableNewClientAreas.length > 0 ? "Select area..." : "No areas"} />
                    </SelectTrigger>
                    <SelectContent>
                      {availableNewClientAreas.map(area => (
                        <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={handleAddClient} className="w-full" disabled={isSaving} data-testid="button-confirm-add">
                {isSaving ? 'Saving...' : 'Add Client'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <ScrollArea className="flex-1">
        <div className="p-4 space-y-3">
          {filteredClients.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <Users className="h-12 w-12 text-muted-foreground mb-4" />
                <p className="text-lg font-medium text-muted-foreground">No clients found</p>
                <p className="text-sm text-muted-foreground">Add your first client to get started</p>
              </CardContent>
            </Card>
          ) : (
            filteredClients.map(client => (
              <Collapsible
                key={client.id}
                open={expandedClientId === client.id}
                onOpenChange={(open) => setExpandedClientId(open ? client.id : null)}
              >
                <Card className="overflow-visible" data-testid={`card-client-${client.id}`}>
                  <CollapsibleTrigger asChild>
                    <CardHeader className="cursor-pointer">
                      <div className="flex items-center justify-between gap-4">
                        <div className="flex items-center gap-3 min-w-0 flex-1">
                          <div className="flex-shrink-0">
                            {healthIcons[client.healthStatus]}
                          </div>
                          <div className="min-w-0 flex-1">
                            <CardTitle className="text-base truncate" data-testid={`text-client-name-${client.id}`}>
                              {client.businessName}
                            </CardTitle>
                            <p className="text-sm text-muted-foreground truncate">
                              {client.primaryContactName}
                              {client.regionName && ` • ${client.regionName}${client.areaName ? ` - ${client.areaName}` : ''}`}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 flex-shrink-0">
                          <Badge variant={healthBadgeVariant[client.healthStatus]}>
                            {HEALTH_STATUS_LABELS[client.healthStatus]}
                          </Badge>
                          {client.totalMRR > 0 && (
                            <Badge variant="outline">
                              {formatMRR(client.totalMRR)}/mo
                            </Badge>
                          )}
                          <Badge variant="outline">
                            {CADENCE_TIER_LABELS[client.cadenceTier]}
                          </Badge>
                          {expandedClientId === client.id ? (
                            <ChevronUp className="h-4 w-4 text-muted-foreground" />
                          ) : (
                            <ChevronDown className="h-4 w-4 text-muted-foreground" />
                          )}
                        </div>
                      </div>
                    </CardHeader>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <CardContent className="border-t pt-4">
                      <Tabs value={activeClientTab} onValueChange={setActiveClientTab} className="w-full">
                        <TabsList className="mb-4 w-full justify-start">
                          <TabsTrigger value="details" data-testid={`tab-details-${client.id}`}>
                            <Users className="h-4 w-4 mr-2" />
                            Details
                          </TabsTrigger>
                          <TabsTrigger value="deliverables" data-testid={`tab-deliverables-${client.id}`}>
                            <Package className="h-4 w-4 mr-2" />
                            Deliverables
                          </TabsTrigger>
                          <TabsTrigger value="strategy" data-testid={`tab-strategy-${client.id}`}>
                            <Target className="h-4 w-4 mr-2" />
                            Strategy
                          </TabsTrigger>
                          <TabsTrigger value="activity" data-testid={`tab-activity-${client.id}`}>
                            <ClipboardList className="h-4 w-4 mr-2" />
                            Activity
                          </TabsTrigger>
                        </TabsList>

                        <TabsContent value="details" className="space-y-4">
                          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium">Contact Details</h4>
                              <div className="space-y-1 text-sm text-muted-foreground">
                                {client.phone && (
                                  <div className="flex items-center gap-2">
                                    <Phone className="h-3 w-3" />
                                    <a href={`tel:${client.phone}`} className="hover:underline">{client.phone}</a>
                                  </div>
                                )}
                                {client.email && (
                                  <div className="flex items-center gap-2">
                                    <Mail className="h-3 w-3" />
                                    <a href={`mailto:${client.email}`} className="hover:underline">{client.email}</a>
                                  </div>
                                )}
                                {client.address && (
                                  <div className="flex items-center gap-2">
                                    <MapPin className="h-3 w-3" />
                                    <span>{client.address}</span>
                                  </div>
                                )}
                              </div>
                            </div>

                            <div className="space-y-2">
                              <h4 className="text-sm font-medium">Products</h4>
                              {client.products.length > 0 ? (
                                <div className="flex flex-wrap gap-1">
                                  {client.products.map((product, idx) => (
                                    <Badge key={idx} variant="outline">
                                      {product.productType}
                                    </Badge>
                                  ))}
                                </div>
                              ) : (
                                <p className="text-sm text-muted-foreground">No products</p>
                              )}
                            </div>

                            <div className="space-y-2">
                              <h4 className="text-sm font-medium">Activity</h4>
                              <div className="text-sm text-muted-foreground space-y-1">
                                <p>Last Contact: {formatDate(client.lastContactDate)}</p>
                                <p>Next Contact: {formatDate(client.nextContactDate)}</p>
                                <p>Created: {formatDate(client.createdAt)}</p>
                              </div>
                            </div>
                          </div>

                          {client.healthReasons.length > 0 && (
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium">Health Reasons</h4>
                              <ul className="text-sm text-muted-foreground list-disc list-inside">
                                {client.healthReasons.map((reason, idx) => (
                                  <li key={idx}>{reason}</li>
                                ))}
                              </ul>
                            </div>
                          )}

                          {client.notes && (
                            <div className="space-y-2">
                              <h4 className="text-sm font-medium">Notes</h4>
                              <p className="text-sm text-muted-foreground">{client.notes}</p>
                            </div>
                          )}
                        </TabsContent>

                        <TabsContent value="deliverables" className="space-y-3">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-medium flex items-center gap-2">
                            <Package className="h-4 w-4" />
                            Deliverables
                          </h4>
                          <Dialog open={isAddDeliverableOpen && expandedClientId === client.id} onOpenChange={(open) => {
                            setIsAddDeliverableOpen(open);
                            if (!open) {
                              setNewDeliverableTitle('');
                              setNewDeliverableProduct('');
                              setNewDeliverableNotes('');
                            }
                          }}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" data-testid={`button-add-deliverable-${client.id}`}>
                                <Plus className="h-3 w-3 mr-1" />
                                Add
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Add Deliverable</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                  <Label htmlFor="deliverable-title">Title</Label>
                                  <Input
                                    id="deliverable-title"
                                    value={newDeliverableTitle}
                                    onChange={(e) => setNewDeliverableTitle(e.target.value)}
                                    placeholder="e.g., Website Launch"
                                    data-testid="input-deliverable-title"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="deliverable-product">Product Type</Label>
                                  <Input
                                    id="deliverable-product"
                                    value={newDeliverableProduct}
                                    onChange={(e) => setNewDeliverableProduct(e.target.value)}
                                    placeholder="e.g., Website, SEO, PPC"
                                    data-testid="input-deliverable-product"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="deliverable-notes">Notes (optional)</Label>
                                  <Textarea
                                    id="deliverable-notes"
                                    value={newDeliverableNotes}
                                    onChange={(e) => setNewDeliverableNotes(e.target.value)}
                                    placeholder="Additional notes..."
                                    data-testid="input-deliverable-notes"
                                  />
                                </div>
                                <Button onClick={() => handleAddDeliverable(client.id)} className="w-full" disabled={savingDeliverable} data-testid="button-confirm-deliverable">
                                  {savingDeliverable ? 'Saving...' : 'Add Deliverable'}
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                        
                        {loadingDeliverables === client.id ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : (clientDeliverables[client.id]?.length || 0) === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">No deliverables yet</p>
                        ) : (
                          <div className="space-y-2">
                            {clientDeliverables[client.id]?.map(deliverable => (
                              <div key={deliverable.id} className="border rounded-md p-3 space-y-2" data-testid={`deliverable-${deliverable.id}`}>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2 min-w-0">
                                    {deliverableStatusIcons[deliverable.status]}
                                    <span className="font-medium text-sm truncate">{deliverable.title}</span>
                                    <Badge variant="outline">{deliverable.productType}</Badge>
                                  </div>
                                  <Select
                                    value={deliverable.status}
                                    onValueChange={(val) => handleUpdateDeliverableStatus(client.id, deliverable.id, val as DeliverableStatus)}
                                  >
                                    <SelectTrigger className="w-32 h-8" data-testid={`select-status-${deliverable.id}`}>
                                      <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                      <SelectItem value="not_started">Not Started</SelectItem>
                                      <SelectItem value="in_progress">In Progress</SelectItem>
                                      <SelectItem value="blocked">Blocked</SelectItem>
                                      <SelectItem value="completed">Completed</SelectItem>
                                    </SelectContent>
                                  </Select>
                                </div>
                                {deliverable.blocker && (
                                  <p className="text-xs text-red-500 flex items-center gap-1">
                                    <AlertCircle className="h-3 w-3" />
                                    Blocker: {deliverable.blocker}
                                  </p>
                                )}
                                {deliverable.milestones.length > 0 && (
                                  <div className="space-y-1 pt-1">
                                    {deliverable.milestones.map(milestone => (
                                      <div key={milestone.id} className="flex items-center gap-2 text-sm">
                                        <Checkbox
                                          checked={milestone.completed}
                                          onCheckedChange={(checked) => handleToggleMilestone(client.id, deliverable.id, milestone.id, !!checked)}
                                          data-testid={`checkbox-milestone-${milestone.id}`}
                                        />
                                        <span className={milestone.completed ? 'line-through text-muted-foreground' : ''}>
                                          {milestone.title}
                                        </span>
                                      </div>
                                    ))}
                                  </div>
                                )}
                                {deliverable.notes && (
                                  <p className="text-xs text-muted-foreground">{deliverable.notes}</p>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                        </TabsContent>

                        <TabsContent value="strategy" className="space-y-4">
                          <Tabs value={activeStrategySubTab} onValueChange={setActiveStrategySubTab} className="w-full">
                            <TabsList className="mb-4">
                              <TabsTrigger value="overview" data-testid={`tab-strategy-overview-${client.id}`}>
                                <LayoutDashboard className="h-4 w-4 mr-2" />
                                Overview
                              </TabsTrigger>
                              <TabsTrigger value="plan" data-testid={`tab-strategy-plan-${client.id}`}>
                                <TrendingUp className="h-4 w-4 mr-2" />
                                Plan
                              </TabsTrigger>
                              <TabsTrigger value="insights" data-testid={`tab-strategy-insights-${client.id}`}>
                                <Lightbulb className="h-4 w-4 mr-2" />
                                Insights
                              </TabsTrigger>
                              <TabsTrigger value="content" data-testid={`tab-strategy-content-${client.id}`}>
                                <PenTool className="h-4 w-4 mr-2" />
                                Content
                              </TabsTrigger>
                            </TabsList>

                            <TabsContent value="overview" className="space-y-4">
                              <div className="flex items-center justify-between gap-4 p-4 border rounded-md bg-muted/20">
                                <div className="space-y-1">
                                  <div className="flex items-center gap-2">
                                    <Target className="h-5 w-5 text-muted-foreground" />
                                    <span className="font-medium">Strategy Status</span>
                                  </div>
                                  <Badge variant={client.strategyStatus === 'completed' ? 'default' : 'secondary'}>
                                    {client.strategyStatus === 'not_started' ? 'Not Started' : 
                                     client.strategyStatus === 'in_progress' ? 'In Progress' :
                                     client.strategyStatus === 'completed' ? 'Completed' :
                                     client.strategyStatus === 'needs_review' ? 'Needs Review' : 'Unknown'}
                                  </Badge>
                                </div>
                                <div className="flex items-center gap-2">
                                  {client.strategyStatus === 'completed' && clientStrategyPlan[client.id] && (
                                    <Button 
                                      variant="outline" 
                                      className="gap-2"
                                      onClick={() => setShareDialogClientId(client.id)}
                                      data-testid={`button-share-strategy-${client.id}`}
                                    >
                                      <Share2 className="h-4 w-4" />
                                      Share
                                    </Button>
                                  )}
                                  <Button 
                                    variant="default" 
                                    className="gap-2"
                                    onClick={() => openWizard(client)}
                                    data-testid={`button-start-strategy-${client.id}`}
                                  >
                                    <Play className="h-4 w-4" />
                                    {client.strategyStatus === 'not_started' ? 'Start Strategy Wizard' : 'Edit Strategy'}
                                  </Button>
                                </div>
                              </div>

                              {client.businessProfile && (
                                <div className="p-4 border rounded-md space-y-3">
                                  <h5 className="font-medium">Business Profile Summary</h5>
                                  <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                      <span className="text-muted-foreground">Industry:</span> {client.businessProfile.industry}
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Service Area:</span> {client.businessProfile.serviceAreaType}
                                    </div>
                                    {client.businessProfile.primaryGoal && (
                                      <div className="col-span-2">
                                        <span className="text-muted-foreground">Primary Goal:</span> {PRIMARY_GOAL_LABELS[client.businessProfile.primaryGoal]}
                                      </div>
                                    )}
                                  </div>
                                </div>
                              )}

                              {/* Generate Strategy Button */}
                              {client.businessProfile && (
                                <div className="flex items-center justify-between gap-4 p-4 border rounded-md">
                                  <div className="space-y-1">
                                    <span className="font-medium flex items-center gap-2">
                                      <Sparkles className="h-4 w-4" />
                                      AI Strategy Plan
                                    </span>
                                    <p className="text-sm text-muted-foreground">
                                      {clientStrategyPlan[client.id] ? 'Strategy plan generated and saved' : 'Generate a comprehensive 90-day marketing strategy'}
                                    </p>
                                  </div>
                                  <Button
                                    onClick={() => handleGenerateStrategy(client)}
                                    disabled={generatingStrategy === client.id}
                                    data-testid={`button-generate-strategy-${client.id}`}
                                  >
                                    {generatingStrategy === client.id ? (
                                      <>
                                        <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                        Generating...
                                      </>
                                    ) : (
                                      <>
                                        <Sparkles className="h-4 w-4 mr-2" />
                                        {clientStrategyPlan[client.id] ? 'Regenerate' : 'Generate Strategy'}
                                      </>
                                    )}
                                  </Button>
                                </div>
                              )}

                              {/* Display Generated Strategy */}
                              {clientStrategyPlan[client.id] && (
                                <div className="p-4 border rounded-md space-y-4">
                                  <div className="space-y-2">
                                    <h5 className="font-medium">Core Strategy</h5>
                                    <p className="text-sm">{clientStrategyPlan[client.id]?.coreStrategy}</p>
                                  </div>
                                  <div className="grid grid-cols-2 gap-4">
                                    <div className="space-y-2">
                                      <h6 className="text-sm font-medium text-muted-foreground">Current State</h6>
                                      <p className="text-sm">{clientStrategyPlan[client.id]?.currentState?.summary}</p>
                                      {(clientStrategyPlan[client.id]?.currentState?.strengths ?? []).length > 0 && (
                                        <div>
                                          <span className="text-xs font-medium text-green-600">Strengths:</span>
                                          <ul className="text-xs mt-1 space-y-1">
                                            {(clientStrategyPlan[client.id]?.currentState?.strengths ?? []).map((s, i) => (
                                              <li key={i} className="flex items-start gap-1">
                                                <CheckCircle className="h-3 w-3 text-green-500 mt-0.5 flex-shrink-0" />
                                                {s}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    </div>
                                    <div className="space-y-2">
                                      <h6 className="text-sm font-medium text-muted-foreground">Target State</h6>
                                      <p className="text-sm">{clientStrategyPlan[client.id]?.targetState?.summary}</p>
                                      {(clientStrategyPlan[client.id]?.targetState?.outcomes ?? []).length > 0 && (
                                        <div>
                                          <span className="text-xs font-medium text-blue-600">Outcomes:</span>
                                          <ul className="text-xs mt-1 space-y-1">
                                            {(clientStrategyPlan[client.id]?.targetState?.outcomes ?? []).map((o, i) => (
                                              <li key={i} className="flex items-start gap-1">
                                                <Target className="h-3 w-3 text-blue-500 mt-0.5 flex-shrink-0" />
                                                {o}
                                              </li>
                                            ))}
                                          </ul>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                  <div className="text-sm text-muted-foreground italic border-l-2 border-muted pl-3">
                                    {clientStrategyPlan[client.id]?.gapSummary}
                                  </div>
                                </div>
                              )}

                      <div className="space-y-3 border-t pt-3">
                        <div className="flex items-center justify-between gap-2">
                          <h4 className="text-sm font-medium flex items-center gap-2">
                            <Target className="h-4 w-4" />
                            Strategy Sessions
                          </h4>
                          <Dialog open={isAddSessionOpen && expandedClientId === client.id} onOpenChange={(open) => {
                            setIsAddSessionOpen(open);
                            if (!open) {
                              setNewSessionAgenda('');
                              setNewSessionNotes('');
                            }
                          }}>
                            <DialogTrigger asChild>
                              <Button variant="outline" size="sm" data-testid={`button-add-session-${client.id}`}>
                                <Plus className="h-3 w-3 mr-1" />
                                Add Session
                              </Button>
                            </DialogTrigger>
                            <DialogContent>
                              <DialogHeader>
                                <DialogTitle>Add Strategy Session</DialogTitle>
                              </DialogHeader>
                              <div className="space-y-4 py-4">
                                <div className="space-y-2">
                                  <Label htmlFor="session-agenda">Agenda</Label>
                                  <Textarea
                                    id="session-agenda"
                                    value={newSessionAgenda}
                                    onChange={(e) => setNewSessionAgenda(e.target.value)}
                                    placeholder="What topics will be discussed..."
                                    data-testid="input-session-agenda"
                                  />
                                </div>
                                <div className="space-y-2">
                                  <Label htmlFor="session-notes">Notes (optional)</Label>
                                  <Textarea
                                    id="session-notes"
                                    value={newSessionNotes}
                                    onChange={(e) => setNewSessionNotes(e.target.value)}
                                    placeholder="Additional notes..."
                                    data-testid="input-session-notes"
                                  />
                                </div>
                                <Button onClick={() => handleAddSession(client.id)} className="w-full" disabled={savingSession} data-testid="button-confirm-session">
                                  {savingSession ? 'Saving...' : 'Add Session'}
                                </Button>
                              </div>
                            </DialogContent>
                          </Dialog>
                        </div>
                        
                        {loadingStrategy === client.id ? (
                          <div className="flex items-center justify-center py-4">
                            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                          </div>
                        ) : (clientStrategySessions[client.id]?.length || 0) === 0 ? (
                          <p className="text-sm text-muted-foreground py-2">No strategy sessions yet</p>
                        ) : (
                          <div className="space-y-2">
                            {clientStrategySessions[client.id]?.map(session => (
                              <div key={session.id} className="border rounded-md p-3 space-y-2" data-testid={`session-${session.id}`}>
                                <div className="flex items-center justify-between gap-2 flex-wrap">
                                  <div className="flex items-center gap-2 min-w-0">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    <span className="text-sm font-medium">{formatDate(session.sessionDate)}</span>
                                  </div>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => handleDeleteSession(client.id, session.id)}
                                    data-testid={`button-delete-session-${session.id}`}
                                  >
                                    <Trash2 className="h-4 w-4 text-muted-foreground" />
                                  </Button>
                                </div>
                                <div className="space-y-1">
                                  <div className="flex items-start gap-2">
                                    <FileText className="h-3 w-3 mt-1 text-muted-foreground" />
                                    <span className="text-sm">{session.agenda}</span>
                                  </div>
                                  {session.notes && (
                                    <p className="text-xs text-muted-foreground pl-5">{session.notes}</p>
                                  )}
                                </div>
                                {session.actionItems.length > 0 && (
                                  <div className="pt-1">
                                    <p className="text-xs font-medium text-muted-foreground mb-1">Action Items:</p>
                                    <ul className="text-xs text-muted-foreground list-disc list-inside">
                                      {session.actionItems.map((item, idx) => (
                                        <li key={idx}>{item}</li>
                                      ))}
                                    </ul>
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}

                        {clientStrategyPlan[client.id] && (
                          <div className="border rounded-md p-3 space-y-2 mt-3 bg-muted/20" data-testid={`strategy-plan-${client.id}`}>
                            <h5 className="text-sm font-medium">Strategy Plan</h5>
                            {clientStrategyPlan[client.id]?.coreStrategy && (
                              <p className="text-sm text-muted-foreground">{clientStrategyPlan[client.id]?.coreStrategy}</p>
                            )}
                            {(clientStrategyPlan[client.id]?.roadmap30?.length || 0) > 0 && (
                              <div className="pt-1">
                                <p className="text-xs font-medium">30-Day Roadmap:</p>
                                <ul className="text-xs text-muted-foreground list-disc list-inside">
                                  {clientStrategyPlan[client.id]?.roadmap30.map((item, idx) => (
                                    <li key={idx}>{item}</li>
                                  ))}
                                </ul>
                              </div>
                            )}
                          </div>
                        )}

                        <div className="space-y-3 pt-3 border-t mt-3">
                          <div className="flex items-center justify-between gap-2">
                            <h4 className="text-sm font-medium flex items-center gap-2">
                              <Sparkles className="h-4 w-4" />
                              AI Tools
                            </h4>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            <Dialog open={isAIToolsOpen && expandedClientId === client.id && aiToolType === 'seo'} onOpenChange={(open) => { if (!open) { setIsAIToolsOpen(false); setAiToolResult(null); setAiToolInput(''); } }}>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" onClick={() => { setAiToolType('seo'); setAiToolResult(null); setAiToolInput(''); setIsAIToolsOpen(true); }} data-testid={`button-ai-seo-${client.id}`}>
                                  <FileText className="h-4 w-4 mr-1" />
                                  SEO Blog
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle className="flex items-center gap-2">
                                    <Sparkles className="h-5 w-5" />
                                    Generate SEO Blog for {client.businessName}
                                  </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  <div className="space-y-2">
                                    <Label htmlFor="seo-topic">Blog Topic</Label>
                                    <Input
                                      id="seo-topic"
                                      value={aiToolInput}
                                      onChange={(e) => setAiToolInput(e.target.value)}
                                      placeholder="e.g., Top 10 tips for local SEO..."
                                      data-testid="input-seo-topic"
                                    />
                                  </div>
                                  <Button onClick={() => handleGenerateAIContent(client)} disabled={generatingAI} className="w-full" data-testid="button-generate-seo">
                                    {generatingAI ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : 'Generate Blog Post'}
                                  </Button>
                                  {aiToolResult && (
                                    <div className="space-y-3 border rounded-md p-4 bg-muted/20">
                                      <div className="flex items-center justify-between gap-2">
                                        <h5 className="font-medium">{aiToolResult.title}</h5>
                                        <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(aiToolResult.content || ''); toast({ title: 'Copied!', description: 'Blog content copied to clipboard.' }); }} data-testid="button-copy-seo">
                                          <Copy className="h-4 w-4" />
                                        </Button>
                                      </div>
                                      <p className="text-sm text-muted-foreground">{aiToolResult.metaDescription}</p>
                                      <div className="text-sm whitespace-pre-wrap">{aiToolResult.content}</div>
                                      <p className="text-xs text-muted-foreground">CTA: {aiToolResult.callToAction}</p>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>

                            <Dialog open={isAIToolsOpen && expandedClientId === client.id && aiToolType === 'facebook'} onOpenChange={(open) => { if (!open) { setIsAIToolsOpen(false); setAiToolResult(null); setAiToolInput(''); } }}>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" onClick={() => { setAiToolType('facebook'); setAiToolResult(null); setAiToolInput(''); setIsAIToolsOpen(true); }} data-testid={`button-ai-facebook-${client.id}`}>
                                  <Target className="h-4 w-4 mr-1" />
                                  Facebook Post
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-lg">
                                <DialogHeader>
                                  <DialogTitle className="flex items-center gap-2">
                                    <Sparkles className="h-5 w-5" />
                                    Generate Facebook Post for {client.businessName}
                                  </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  <div className="space-y-2">
                                    <Label htmlFor="fb-promo">Promotion/Offer (optional)</Label>
                                    <Input
                                      id="fb-promo"
                                      value={aiToolInput}
                                      onChange={(e) => setAiToolInput(e.target.value)}
                                      placeholder="e.g., 20% off this weekend..."
                                      data-testid="input-fb-promo"
                                    />
                                  </div>
                                  <Button onClick={() => handleGenerateAIContent(client)} disabled={generatingAI} className="w-full" data-testid="button-generate-facebook">
                                    {generatingAI ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : 'Generate Post'}
                                  </Button>
                                  {aiToolResult && (
                                    <div className="space-y-3 border rounded-md p-4 bg-muted/20">
                                      <div className="flex items-center justify-between gap-2">
                                        <h5 className="font-medium">Primary Post</h5>
                                        <Button variant="ghost" size="icon" onClick={() => { navigator.clipboard.writeText(aiToolResult.primaryPost || ''); toast({ title: 'Copied!', description: 'Post copied to clipboard.' }); }} data-testid="button-copy-facebook">
                                          <Copy className="h-4 w-4" />
                                        </Button>
                                      </div>
                                      <p className="text-sm">{aiToolResult.primaryPost}</p>
                                      <div className="flex flex-wrap gap-1">{aiToolResult.hashtags?.map((tag: string, idx: number) => <Badge key={idx} variant="secondary" className="text-xs">{tag}</Badge>)}</div>
                                      <p className="text-xs text-muted-foreground">Best time: {aiToolResult.bestTimeToPost}</p>
                                      <p className="text-xs text-muted-foreground">Tip: {aiToolResult.engagementTip}</p>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>

                            <Dialog open={isAIToolsOpen && expandedClientId === client.id && aiToolType === 'meeting'} onOpenChange={(open) => { if (!open) { setIsAIToolsOpen(false); setAiToolResult(null); setAiToolInput(''); } }}>
                              <DialogTrigger asChild>
                                <Button variant="outline" size="sm" onClick={() => { setAiToolType('meeting'); setAiToolResult(null); setAiToolInput('check-in'); setIsAIToolsOpen(true); }} data-testid={`button-ai-meeting-${client.id}`}>
                                  <Calendar className="h-4 w-4 mr-1" />
                                  Meeting Prep
                                </Button>
                              </DialogTrigger>
                              <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                                <DialogHeader>
                                  <DialogTitle className="flex items-center gap-2">
                                    <Sparkles className="h-5 w-5" />
                                    Meeting Prep for {client.businessName}
                                  </DialogTitle>
                                </DialogHeader>
                                <div className="space-y-4 py-4">
                                  <div className="space-y-2">
                                    <Label htmlFor="meeting-type">Meeting Type</Label>
                                    <Select value={aiToolInput} onValueChange={setAiToolInput}>
                                      <SelectTrigger data-testid="select-meeting-type">
                                        <SelectValue placeholder="Select meeting type" />
                                      </SelectTrigger>
                                      <SelectContent>
                                        <SelectItem value="check-in">Regular Check-in</SelectItem>
                                        <SelectItem value="strategy">Strategy Review</SelectItem>
                                        <SelectItem value="upsell">Upsell Discussion</SelectItem>
                                        <SelectItem value="retention">Retention/Save</SelectItem>
                                      </SelectContent>
                                    </Select>
                                  </div>
                                  <Button onClick={() => handleGenerateAIContent(client)} disabled={generatingAI} className="w-full" data-testid="button-generate-meeting">
                                    {generatingAI ? <><Loader2 className="h-4 w-4 mr-2 animate-spin" />Generating...</> : 'Generate Meeting Prep'}
                                  </Button>
                                  {aiToolResult && (
                                    <div className="space-y-3 border rounded-md p-4 bg-muted/20">
                                      <div>
                                        <h5 className="font-medium mb-2">Agenda</h5>
                                        <ul className="list-disc list-inside text-sm space-y-1">{(aiToolResult.agenda ?? []).map((item: string, idx: number) => <li key={idx}>{item}</li>)}</ul>
                                      </div>
                                      <div>
                                        <h5 className="font-medium mb-2">Key Talking Points</h5>
                                        <ul className="list-disc list-inside text-sm space-y-1">{(aiToolResult.keyTalkingPoints ?? []).map((item: string, idx: number) => <li key={idx}>{item}</li>)}</ul>
                                      </div>
                                      <div>
                                        <h5 className="font-medium mb-2">Questions to Ask</h5>
                                        <ul className="list-disc list-inside text-sm space-y-1">{(aiToolResult.questionsToAsk ?? []).map((item: string, idx: number) => <li key={idx}>{item}</li>)}</ul>
                                      </div>
                                      {(aiToolResult.upsellOpportunities ?? []).length > 0 && (
                                        <div>
                                          <h5 className="font-medium mb-2">Upsell Opportunities</h5>
                                          <ul className="list-disc list-inside text-sm space-y-1">{(aiToolResult.upsellOpportunities ?? []).map((item: string, idx: number) => <li key={idx}>{item}</li>)}</ul>
                                        </div>
                                      )}
                                      <div>
                                        <h5 className="font-medium mb-2">Proposed Next Steps</h5>
                                        <ul className="list-disc list-inside text-sm space-y-1">{(aiToolResult.nextStepsToPropose ?? []).map((item: string, idx: number) => <li key={idx}>{item}</li>)}</ul>
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </DialogContent>
                            </Dialog>
                          </div>
                        </div>
                      </div>
                            </TabsContent>

                            <TabsContent value="plan" className="space-y-4">
                              {clientStrategyPlan[client.id] ? (
                                <div className="space-y-4">
                                  {/* Core Strategy */}
                                  <div className="p-4 border rounded-md bg-primary/5">
                                    <h4 className="font-semibold text-lg mb-2 flex items-center gap-2">
                                      <Target className="h-5 w-5" />
                                      Core Strategy
                                    </h4>
                                    <p className="text-sm">{clientStrategyPlan[client.id]?.coreStrategy}</p>
                                  </div>

                                  {/* 30/60/90 Roadmap Phases */}
                                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                    {/* 30 Days */}
                                    <div className="p-4 border rounded-md">
                                      <div className="flex items-center gap-2 mb-3">
                                        <Badge variant="default">30 Days</Badge>
                                        <span className="text-sm font-medium">Foundation</span>
                                      </div>
                                      <ul className="space-y-2">
                                        {(clientStrategyPlan[client.id]?.roadmap30 ?? []).map((item: string, idx: number) => (
                                          <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                            <Check className="h-4 w-4 mt-0.5 text-muted-foreground/50 flex-shrink-0" />
                                            {item}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>

                                    {/* 60 Days */}
                                    <div className="p-4 border rounded-md">
                                      <div className="flex items-center gap-2 mb-3">
                                        <Badge variant="secondary">60 Days</Badge>
                                        <span className="text-sm font-medium">Growth</span>
                                      </div>
                                      <ul className="space-y-2">
                                        {(clientStrategyPlan[client.id]?.roadmap60 ?? []).map((item: string, idx: number) => (
                                          <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                            <Check className="h-4 w-4 mt-0.5 text-muted-foreground/50 flex-shrink-0" />
                                            {item}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>

                                    {/* 90 Days */}
                                    <div className="p-4 border rounded-md">
                                      <div className="flex items-center gap-2 mb-3">
                                        <Badge variant="outline">90 Days</Badge>
                                        <span className="text-sm font-medium">Scale</span>
                                      </div>
                                      <ul className="space-y-2">
                                        {(clientStrategyPlan[client.id]?.roadmap90 ?? []).map((item: string, idx: number) => (
                                          <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                            <Check className="h-4 w-4 mt-0.5 text-muted-foreground/50 flex-shrink-0" />
                                            {item}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>

                                  {/* Detailed Milestones */}
                                  {(clientStrategyPlan[client.id]?.roadmap_30_60_90 ?? []).length > 0 && (
                                    <div className="p-4 border rounded-md">
                                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                                        <Calendar className="h-4 w-4" />
                                        Milestone Tracker
                                      </h4>
                                      <div className="space-y-2">
                                        {(clientStrategyPlan[client.id]?.roadmap_30_60_90 ?? []).map((milestone: { id: string; title: string; description: string; phase: string; channel: string; status: string }, idx: number) => (
                                          <div key={milestone.id || idx} className="flex items-center gap-3 p-2 rounded-md hover-elevate">
                                            <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-medium ${
                                              milestone.status === 'completed' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' :
                                              milestone.status === 'in_progress' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300' :
                                              'bg-muted text-muted-foreground'
                                            }`}>
                                              {milestone.phase}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                              <p className="text-sm font-medium truncate">{milestone.title}</p>
                                              <p className="text-xs text-muted-foreground truncate">{milestone.description}</p>
                                            </div>
                                            <Badge variant="outline">{milestone.channel}</Badge>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Key Initiatives */}
                                  {(clientStrategyPlan[client.id]?.initiatives ?? []).length > 0 && (
                                    <div className="p-4 border rounded-md">
                                      <h4 className="font-semibold mb-3">Key Initiatives</h4>
                                      <div className="flex flex-wrap gap-2">
                                        {(clientStrategyPlan[client.id]?.initiatives ?? []).map((initiative: string, idx: number) => (
                                          <Badge key={idx} variant="secondary">{initiative}</Badge>
                                        ))}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div className="p-4 border rounded-md text-center text-muted-foreground">
                                  <TrendingUp className="h-8 w-8 mx-auto mb-2" />
                                  <p className="font-medium">30/60/90 Day Roadmap</p>
                                  <p className="text-sm">Complete the Strategy Wizard and generate a strategy to see your marketing roadmap.</p>
                                </div>
                              )}
                            </TabsContent>

                            <TabsContent value="insights" className="space-y-4">
                              {clientStrategyPlan[client.id] ? (
                                <div className="space-y-6">
                                  {/* Gap Summary */}
                                  <div className="p-4 border rounded-md bg-muted/30">
                                    <h4 className="font-semibold text-lg mb-2 flex items-center gap-2">
                                      <Lightbulb className="h-5 w-5 text-amber-500" />
                                      Gap Analysis Summary
                                    </h4>
                                    <p className="text-sm text-muted-foreground">{clientStrategyPlan[client.id]?.gapSummary}</p>
                                  </div>

                                  {/* Evidence Panels */}
                                  <div className="p-4 border rounded-md">
                                    <h4 className="font-semibold mb-4 flex items-center gap-2">
                                      <FileText className="h-5 w-5 text-blue-500" />
                                      Channel Evidence
                                    </h4>
                                    <p className="text-sm text-muted-foreground mb-4">
                                      Add evidence for each channel to improve strategy accuracy. Provide URLs, paste relevant text, or add notes.
                                    </p>
                                    
                                    {loadingInsights === client.id ? (
                                      <div className="flex items-center justify-center p-4">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                      </div>
                                    ) : (
                                      <div className="space-y-3">
                                        {(['website', 'seo', 'gbp', 'content', 'ppc', 'analytics'] as InsightChannel[]).map((channel) => {
                                          const insight = clientChannelInsights[client.id]?.find(i => i.channel === channel);
                                          const isEditing = editingInsight?.clientId === client.id && editingInsight?.channel === channel;
                                          // Safe access with defaults for evidence
                                          const evidenceUrls = insight?.evidence?.urls || [];
                                          const evidencePastedText = insight?.evidence?.pastedText || '';
                                          const evidenceNotes = insight?.evidence?.notes || '';
                                          const hasEvidence = evidenceUrls.length > 0 || evidencePastedText || evidenceNotes;
                                          const canVerify = hasEvidence && insight?.analysisStatus === 'evidence_provided';
                                          
                                          return (
                                            <div key={channel} className="p-3 border rounded-md bg-background" data-testid={`evidence-panel-${channel}-${client.id}`}>
                                              <div className="flex items-center justify-between gap-2 mb-2">
                                                <div className="flex items-center gap-2">
                                                  <span className="font-medium text-sm">{INSIGHT_CHANNEL_LABELS[channel]}</span>
                                                  <Badge 
                                                    variant={insight?.analysisStatus === 'verified' ? 'default' : insight?.analysisStatus === 'evidence_provided' ? 'secondary' : 'outline'}
                                                    className="text-xs"
                                                  >
                                                    {insight ? ANALYSIS_STATUS_LABELS[insight.analysisStatus] : 'Assumed'}
                                                  </Badge>
                                                </div>
                                                <div className="flex items-center gap-1">
                                                  {canVerify && !isEditing && (
                                                    <Button
                                                      variant="outline"
                                                      size="sm"
                                                      onClick={() => handleMarkInsightVerified(client.id, channel)}
                                                      disabled={savingInsight === channel}
                                                      data-testid={`button-verify-evidence-${channel}-${client.id}`}
                                                    >
                                                      {savingInsight === channel ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                                                      Verify
                                                    </Button>
                                                  )}
                                                  {!isEditing && (
                                                    <Button
                                                      variant="ghost"
                                                      size="sm"
                                                      onClick={() => setEditingInsight({
                                                        clientId: client.id,
                                                        channel,
                                                        urls: evidenceUrls.join('\n'),
                                                        pastedText: evidencePastedText,
                                                        notes: evidenceNotes,
                                                      })}
                                                      data-testid={`button-edit-evidence-${channel}-${client.id}`}
                                                    >
                                                      {hasEvidence ? 'Edit' : 'Add Evidence'}
                                                    </Button>
                                                  )}
                                                </div>
                                              </div>
                                              
                                              {isEditing ? (
                                                <div className="space-y-3 mt-2">
                                                  <div>
                                                    <Label className="text-xs">URLs (one per line)</Label>
                                                    <Textarea
                                                      placeholder="https://example.com/page..."
                                                      className="mt-1 text-sm"
                                                      rows={2}
                                                      value={editingInsight.urls}
                                                      onChange={(e) => setEditingInsight({...editingInsight, urls: e.target.value})}
                                                      data-testid={`input-urls-${channel}-${client.id}`}
                                                    />
                                                  </div>
                                                  <div>
                                                    <Label className="text-xs">Pasted Text (from reports, tools, etc.)</Label>
                                                    <Textarea
                                                      placeholder="Paste relevant text from analytics, SEO tools, etc..."
                                                      className="mt-1 text-sm"
                                                      rows={3}
                                                      value={editingInsight.pastedText}
                                                      onChange={(e) => setEditingInsight({...editingInsight, pastedText: e.target.value})}
                                                      data-testid={`input-text-${channel}-${client.id}`}
                                                    />
                                                  </div>
                                                  <div>
                                                    <Label className="text-xs">Notes</Label>
                                                    <Textarea
                                                      placeholder="Additional observations or notes..."
                                                      className="mt-1 text-sm"
                                                      rows={2}
                                                      value={editingInsight.notes}
                                                      onChange={(e) => setEditingInsight({...editingInsight, notes: e.target.value})}
                                                      data-testid={`input-notes-${channel}-${client.id}`}
                                                    />
                                                  </div>
                                                  <div className="flex items-center gap-2 pt-2">
                                                    <Button
                                                      size="sm"
                                                      onClick={() => handleSaveChannelInsight(client.id, channel, editingInsight.urls, editingInsight.pastedText, editingInsight.notes)}
                                                      disabled={savingInsight === channel}
                                                      data-testid={`button-save-evidence-${channel}-${client.id}`}
                                                    >
                                                      {savingInsight === channel ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                                                      Save
                                                    </Button>
                                                    <Button
                                                      size="sm"
                                                      variant="ghost"
                                                      onClick={() => setEditingInsight(null)}
                                                      data-testid={`button-cancel-evidence-${channel}-${client.id}`}
                                                    >
                                                      Cancel
                                                    </Button>
                                                  </div>
                                                </div>
                                              ) : hasEvidence ? (
                                                <div className="text-xs text-muted-foreground space-y-1">
                                                  {evidenceUrls.length > 0 && (
                                                    <div className="flex items-start gap-1">
                                                      <ExternalLink className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                                      <span>{evidenceUrls.length} URL(s)</span>
                                                    </div>
                                                  )}
                                                  {evidencePastedText && (
                                                    <div className="flex items-start gap-1">
                                                      <FileText className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                                      <span className="line-clamp-1">{evidencePastedText.substring(0, 100)}...</span>
                                                    </div>
                                                  )}
                                                  {evidenceNotes && (
                                                    <div className="flex items-start gap-1">
                                                      <PenTool className="h-3 w-3 mt-0.5 flex-shrink-0" />
                                                      <span className="line-clamp-1">{evidenceNotes.substring(0, 100)}...</span>
                                                    </div>
                                                  )}
                                                </div>
                                              ) : (
                                                <p className="text-xs text-muted-foreground">No evidence provided yet.</p>
                                              )}
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}
                                  </div>

                                  {/* Radar Chart */}
                                  <div className="p-4 border rounded-md">
                                    <h4 className="font-semibold mb-4">Channel Readiness Assessment</h4>
                                    <div className="h-72">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart data={[
                                          { 
                                            channel: 'Website', 
                                            current: client.channelStatus.website === 'live' ? 90 : client.channelStatus.website === 'in_progress' ? 50 : 20, 
                                            target: 90,
                                            evidenceStatus: getChannelConfidenceStatus('website', clientChannelInsights[client.id] || []),
                                            insightChannel: 'website' as InsightChannel
                                          },
                                          { 
                                            channel: 'GBP', 
                                            current: client.channelStatus.gbp === 'live' ? 90 : client.channelStatus.gbp === 'in_progress' ? 50 : 20, 
                                            target: 85,
                                            evidenceStatus: getChannelConfidenceStatus('gbp', clientChannelInsights[client.id] || []),
                                            insightChannel: 'gbp' as InsightChannel
                                          },
                                          { 
                                            channel: 'SEO', 
                                            current: client.channelStatus.seo === 'live' ? 90 : client.channelStatus.seo === 'in_progress' ? 50 : 20, 
                                            target: 80,
                                            evidenceStatus: getChannelConfidenceStatus('seo', clientChannelInsights[client.id] || []),
                                            insightChannel: 'seo' as InsightChannel
                                          },
                                          { 
                                            channel: 'PPC', 
                                            current: client.channelStatus.ppc === 'live' ? 90 : client.channelStatus.ppc === 'in_progress' ? 50 : 20, 
                                            target: 75,
                                            evidenceStatus: getChannelConfidenceStatus('ppc', clientChannelInsights[client.id] || []),
                                            insightChannel: 'ppc' as InsightChannel
                                          },
                                          { 
                                            channel: 'Content', 
                                            current: 30, 
                                            target: 70,
                                            evidenceStatus: getChannelConfidenceStatus('content', clientChannelInsights[client.id] || []),
                                            insightChannel: 'content' as InsightChannel
                                          },
                                        ]}>
                                          <PolarGrid />
                                          <PolarAngleAxis dataKey="channel" tick={{ fontSize: 12 }} />
                                          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                                          <Radar name="Current State" dataKey="current" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.3} />
                                          <Radar name="Target State" dataKey="target" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                                          <Tooltip content={<SpiderChartTooltip />} />
                                          <Legend />
                                        </RadarChart>
                                      </ResponsiveContainer>
                                    </div>
                                  </div>

                                  {/* Current vs Target State */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 border rounded-md">
                                      <div className="flex items-center justify-between gap-2 mb-3">
                                        <h4 className="font-semibold flex items-center gap-2">
                                          <ArrowDown className="h-4 w-4 text-amber-500" />
                                          Current State
                                        </h4>
                                        <ConfidenceBadge status={getOverallConfidenceStatus(clientChannelInsights[client.id] || [])} size="xs" />
                                      </div>
                                      <p className="text-sm text-muted-foreground mb-3">{clientStrategyPlan[client.id]?.currentState?.summary}</p>
                                      <div className="space-y-2">
                                        <div>
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-medium text-green-600">Strengths:</span>
                                            <ConfidenceBadge status={getOverallConfidenceStatus(clientChannelInsights[client.id] || [])} size="xs" />
                                          </div>
                                          <ul className="list-disc list-inside text-xs text-muted-foreground">
                                            {(clientStrategyPlan[client.id]?.currentState?.strengths ?? []).map((s: string, idx: number) => (
                                              <li key={idx}>{s}</li>
                                            ))}
                                          </ul>
                                        </div>
                                        <div>
                                          <div className="flex items-center gap-2 mb-1">
                                            <span className="text-xs font-medium text-red-600">Weaknesses:</span>
                                            <ConfidenceBadge status={getOverallConfidenceStatus(clientChannelInsights[client.id] || [])} size="xs" />
                                          </div>
                                          <ul className="list-disc list-inside text-xs text-muted-foreground">
                                            {(clientStrategyPlan[client.id]?.currentState?.weaknesses ?? []).map((w: string, idx: number) => (
                                              <li key={idx}>{w}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="p-4 border rounded-md">
                                      <div className="flex items-center justify-between gap-2 mb-3">
                                        <h4 className="font-semibold flex items-center gap-2">
                                          <ArrowUp className="h-4 w-4 text-green-500" />
                                          Target State (90 Days)
                                        </h4>
                                        <ConfidenceBadge status={getOverallConfidenceStatus(clientChannelInsights[client.id] || [])} size="xs" />
                                      </div>
                                      <p className="text-sm text-muted-foreground mb-3">{clientStrategyPlan[client.id]?.targetState?.summary}</p>
                                      <div>
                                        <div className="flex items-center gap-2 mb-1">
                                          <span className="text-xs font-medium text-foreground">Expected Outcomes:</span>
                                          <ConfidenceBadge status={getOverallConfidenceStatus(clientChannelInsights[client.id] || [])} size="xs" />
                                        </div>
                                        <ul className="list-disc list-inside text-xs text-muted-foreground">
                                          {(clientStrategyPlan[client.id]?.targetState?.outcomes ?? []).map((o: string, idx: number) => (
                                            <li key={idx}>{o}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Channel OKRs */}
                                  {(clientStrategyPlan[client.id]?.channelOKRs ?? []).length > 0 && (
                                    <div className="p-4 border rounded-md">
                                      <div className="flex items-center justify-between gap-2 mb-3">
                                        <h4 className="font-semibold">Channel Objectives & Key Results</h4>
                                        <ConfidenceBadge status={getOverallConfidenceStatus(clientChannelInsights[client.id] || [])} size="xs" />
                                      </div>
                                      <div className="space-y-3">
                                        {(clientStrategyPlan[client.id]?.channelOKRs ?? []).map((okr: { channel: string; objective: string; keyResults: string[] }, idx: number) => (
                                          <div key={idx} className="p-3 bg-muted/30 rounded-md">
                                            <div className="flex items-center flex-wrap gap-2 mb-1">
                                              <Badge variant="outline">{okr.channel}</Badge>
                                              <ConfidenceBadge status={getChannelConfidenceStatus(okr.channel, clientChannelInsights[client.id] || [])} size="xs" />
                                              <span className="text-sm font-medium">{okr.objective}</span>
                                            </div>
                                            <ul className="list-disc list-inside text-xs text-muted-foreground ml-2">
                                              {(okr.keyResults ?? []).map((kr: string, krIdx: number) => (
                                                <li key={krIdx}>{kr}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}

                                  {/* Evidence-Driven Tasks */}
                                  <div className="p-4 border rounded-md">
                                    <div className="flex items-center justify-between gap-2 mb-3">
                                      <h4 className="font-semibold flex items-center gap-2">
                                        <Target className="h-4 w-4" />
                                        Evidence-Driven Tasks
                                      </h4>
                                      {loadingEvidenceTasks === client.id ? (
                                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                                      ) : (
                                        <Badge variant="outline">
                                          {(clientEvidenceTasks[client.id] || []).filter(t => t.status !== 'verified').length} active
                                        </Badge>
                                      )}
                                    </div>
                                    
                                    {loadingEvidenceTasks === client.id ? (
                                      <div className="flex items-center justify-center p-4">
                                        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                      </div>
                                    ) : (clientEvidenceTasks[client.id] || []).length > 0 ? (
                                      <div className="space-y-2">
                                        {(clientEvidenceTasks[client.id] || []).map((task) => (
                                          <div 
                                            key={task.id} 
                                            className={`p-3 rounded-md border ${
                                              task.status === 'verified' ? 'bg-green-50 dark:bg-green-900/10 border-green-200 dark:border-green-800' :
                                              task.status === 'completed' ? 'bg-blue-50 dark:bg-blue-900/10 border-blue-200 dark:border-blue-800' :
                                              task.status === 'in_progress' ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800' :
                                              'bg-muted/30 border-border'
                                            }`}
                                            data-testid={`evidence-task-${task.id}`}
                                          >
                                            <div className="flex items-start justify-between gap-2">
                                              <div className="flex-1 min-w-0">
                                                <div className="flex items-center flex-wrap gap-2 mb-1">
                                                  <Badge 
                                                    variant={
                                                      task.status === 'verified' ? 'default' :
                                                      task.status === 'completed' ? 'secondary' :
                                                      task.status === 'in_progress' ? 'outline' : 'outline'
                                                    }
                                                    className={
                                                      task.status === 'verified' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' :
                                                      task.status === 'completed' ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' :
                                                      task.status === 'in_progress' ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' :
                                                      ''
                                                    }
                                                  >
                                                    {task.status === 'verified' && <CheckCircle className="h-3 w-3 mr-1" />}
                                                    {task.status === 'completed' && <Check className="h-3 w-3 mr-1" />}
                                                    {task.status === 'in_progress' && <Clock className="h-3 w-3 mr-1" />}
                                                    {task.status === 'pending' && <CircleDot className="h-3 w-3 mr-1" />}
                                                    {task.status.replace('_', ' ')}
                                                  </Badge>
                                                  <Badge variant="outline">{INSIGHT_CHANNEL_LABELS[task.channel]}</Badge>
                                                </div>
                                                <p className="text-sm font-medium">{task.task}</p>
                                                {task.definition && (
                                                  <p className="text-xs text-muted-foreground mt-1">{task.definition}</p>
                                                )}
                                                {task.impactMetric && (
                                                  <p className="text-xs text-muted-foreground mt-1">
                                                    <span className="font-medium">Impact:</span> {task.impactMetric}
                                                  </p>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-1 flex-shrink-0">
                                                {task.status === 'pending' && (
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleUpdateEvidenceTaskStatus(client.id, task.id, 'in_progress')}
                                                    disabled={savingEvidenceTask === task.id}
                                                    data-testid={`button-start-task-${task.id}`}
                                                  >
                                                    {savingEvidenceTask === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3" />}
                                                  </Button>
                                                )}
                                                {task.status === 'in_progress' && (
                                                  <Button
                                                    size="sm"
                                                    variant="ghost"
                                                    onClick={() => handleUpdateEvidenceTaskStatus(client.id, task.id, 'completed')}
                                                    disabled={savingEvidenceTask === task.id}
                                                    data-testid={`button-complete-task-${task.id}`}
                                                  >
                                                    {savingEvidenceTask === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                                                  </Button>
                                                )}
                                                {task.status === 'completed' && (
                                                  <Button
                                                    size="sm"
                                                    variant="default"
                                                    onClick={() => handleUpdateEvidenceTaskStatus(client.id, task.id, 'verified')}
                                                    disabled={savingEvidenceTask === task.id}
                                                    data-testid={`button-verify-task-${task.id}`}
                                                  >
                                                    {savingEvidenceTask === task.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle className="h-3 w-3 mr-1" />}
                                                    Verify
                                                  </Button>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                        ))}
                                      </div>
                                    ) : (
                                      <div className="text-center text-muted-foreground py-4">
                                        <Target className="h-6 w-6 mx-auto mb-2 opacity-50" />
                                        <p className="text-sm">No evidence tasks yet.</p>
                                        <p className="text-xs">Tasks will be generated from strategy gaps or can be added manually.</p>
                                      </div>
                                    )}
                                    
                                    {/* Quick Add Task from Gap */}
                                    {clientStrategyPlan[client.id]?.gapSummary && (
                                      <div className="mt-3 pt-3 border-t">
                                        <p className="text-xs text-muted-foreground mb-2">Quick add task from identified gap:</p>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => {
                                            const gap = clientStrategyPlan[client.id]?.gapSummary || '';
                                            if (gap) {
                                              handleCreateEvidenceTask(
                                                client.id,
                                                `Address gap: ${gap.slice(0, 100)}${gap.length > 100 ? '...' : ''}`,
                                                'website',
                                                gap,
                                                'Improve overall strategy confidence'
                                              );
                                            }
                                          }}
                                          disabled={savingEvidenceTask === 'new'}
                                          data-testid={`button-add-gap-task-${client.id}`}
                                        >
                                          {savingEvidenceTask === 'new' ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Plus className="h-3 w-3 mr-1" />}
                                          Create Task from Gap
                                        </Button>
                                      </div>
                                    )}
                                  </div>

                                  {/* Analytics Snapshots */}
                                <div className="p-4 border rounded-md">
                                  <div className="flex items-center justify-between gap-2 mb-3">
                                    <div className="flex items-center gap-2">
                                      <TrendingUp className="h-4 w-4 text-primary" />
                                      <h5 className="font-medium">Analytics Snapshots</h5>
                                    </div>
                                    {loadingSnapshots === client.id ? (
                                      <Loader2 className="h-4 w-4 animate-spin" />
                                    ) : (
                                      <Badge variant="outline">
                                        {(clientAnalyticsSnapshots[client.id] || []).length} recorded
                                      </Badge>
                                    )}
                                  </div>

                                  {loadingSnapshots === client.id ? (
                                    <div className="flex justify-center py-4">
                                      <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                                    </div>
                                  ) : (
                                    <>
                                      {/* Comparison View */}
                                      {(clientAnalyticsSnapshots[client.id] || []).length >= 2 && (() => {
                                        const comparison = getSnapshotComparison(clientAnalyticsSnapshots[client.id] || []);
                                        if (!comparison) return null;
                                        return (
                                          <div className="mb-4 p-3 bg-muted/50 rounded-md">
                                            <p className="text-xs text-muted-foreground mb-2">Before/After Comparison</p>
                                            <div className="grid grid-cols-2 gap-3 text-sm">
                                              {comparison.sessions && (
                                                <div className="flex items-center gap-1">
                                                  {comparison.sessions.percent > 0 ? (
                                                    <ArrowUp className="h-3 w-3 text-green-500" />
                                                  ) : (
                                                    <ArrowDown className="h-3 w-3 text-red-500" />
                                                  )}
                                                  <span>Sessions: {comparison.sessions.percent > 0 ? '+' : ''}{comparison.sessions.percent.toFixed(1)}%</span>
                                                </div>
                                              )}
                                              {comparison.users && (
                                                <div className="flex items-center gap-1">
                                                  {comparison.users.percent > 0 ? (
                                                    <ArrowUp className="h-3 w-3 text-green-500" />
                                                  ) : (
                                                    <ArrowDown className="h-3 w-3 text-red-500" />
                                                  )}
                                                  <span>Users: {comparison.users.percent > 0 ? '+' : ''}{comparison.users.percent.toFixed(1)}%</span>
                                                </div>
                                              )}
                                              {comparison.conversions && (
                                                <div className="flex items-center gap-1">
                                                  {comparison.conversions.percent > 0 ? (
                                                    <ArrowUp className="h-3 w-3 text-green-500" />
                                                  ) : (
                                                    <ArrowDown className="h-3 w-3 text-red-500" />
                                                  )}
                                                  <span>Conversions: {comparison.conversions.percent > 0 ? '+' : ''}{comparison.conversions.percent.toFixed(1)}%</span>
                                                </div>
                                              )}
                                              {comparison.conversionRate && (
                                                <div className="flex items-center gap-1">
                                                  {comparison.conversionRate.percent > 0 ? (
                                                    <ArrowUp className="h-3 w-3 text-green-500" />
                                                  ) : (
                                                    <ArrowDown className="h-3 w-3 text-red-500" />
                                                  )}
                                                  <span>Conv Rate: {comparison.conversionRate.percent > 0 ? '+' : ''}{comparison.conversionRate.percent.toFixed(1)}%</span>
                                                </div>
                                              )}
                                            </div>
                                          </div>
                                        );
                                      })()}

                                      {/* Snapshot History */}
                                      {(clientAnalyticsSnapshots[client.id] || []).length > 0 ? (
                                        <div className="space-y-2 mb-3">
                                          {(clientAnalyticsSnapshots[client.id] || []).slice(0, 3).map((snapshot) => (
                                            <div key={snapshot.id} className="p-2 border rounded text-sm" data-testid={`snapshot-${snapshot.id}`}>
                                              <div className="flex items-center justify-between gap-2 mb-1">
                                                <span className="font-medium">{snapshot.dateRange || 'No date range'}</span>
                                                <span className="text-xs text-muted-foreground">
                                                  {new Date(snapshot.createdAt).toLocaleDateString()}
                                                </span>
                                              </div>
                                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground">
                                                {snapshot.sessions !== null && <span>Sessions: {snapshot.sessions.toLocaleString()}</span>}
                                                {snapshot.users !== null && <span>Users: {snapshot.users.toLocaleString()}</span>}
                                                {snapshot.conversions !== null && <span>Conversions: {snapshot.conversions}</span>}
                                                {snapshot.conversionRate !== null && <span>Conv Rate: {snapshot.conversionRate}%</span>}
                                              </div>
                                              {snapshot.notes && (
                                                <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{snapshot.notes}</p>
                                              )}
                                            </div>
                                          ))}
                                        </div>
                                      ) : (
                                        <div className="text-center text-muted-foreground py-3 mb-3">
                                          <p className="text-sm">No analytics snapshots recorded yet.</p>
                                          <p className="text-xs">Add snapshots to track performance over time.</p>
                                        </div>
                                      )}

                                      {/* Add Snapshot Form */}
                                      {showSnapshotForm ? (
                                        <div className="space-y-3 p-3 border rounded-md bg-muted/30">
                                          <div className="grid grid-cols-2 gap-3">
                                            <div>
                                              <Label className="text-xs">Date Range</Label>
                                              <Input
                                                placeholder="e.g., Dec 1-15, 2025"
                                                value={snapshotFormData.dateRange}
                                                onChange={(e) => setSnapshotFormData(prev => ({ ...prev, dateRange: e.target.value }))}
                                                data-testid="input-snapshot-daterange"
                                              />
                                            </div>
                                            <div>
                                              <Label className="text-xs">Sessions</Label>
                                              <Input
                                                type="number"
                                                placeholder="e.g., 1500"
                                                value={snapshotFormData.sessions}
                                                onChange={(e) => setSnapshotFormData(prev => ({ ...prev, sessions: e.target.value }))}
                                                data-testid="input-snapshot-sessions"
                                              />
                                            </div>
                                            <div>
                                              <Label className="text-xs">Users</Label>
                                              <Input
                                                type="number"
                                                placeholder="e.g., 1200"
                                                value={snapshotFormData.users}
                                                onChange={(e) => setSnapshotFormData(prev => ({ ...prev, users: e.target.value }))}
                                                data-testid="input-snapshot-users"
                                              />
                                            </div>
                                            <div>
                                              <Label className="text-xs">Conversions</Label>
                                              <Input
                                                type="number"
                                                placeholder="e.g., 25"
                                                value={snapshotFormData.conversions}
                                                onChange={(e) => setSnapshotFormData(prev => ({ ...prev, conversions: e.target.value }))}
                                                data-testid="input-snapshot-conversions"
                                              />
                                            </div>
                                            <div>
                                              <Label className="text-xs">Conversion Rate (%)</Label>
                                              <Input
                                                type="number"
                                                step="0.1"
                                                placeholder="e.g., 2.5"
                                                value={snapshotFormData.conversionRate}
                                                onChange={(e) => setSnapshotFormData(prev => ({ ...prev, conversionRate: e.target.value }))}
                                                data-testid="input-snapshot-convrate"
                                              />
                                            </div>
                                          </div>
                                          <div>
                                            <Label className="text-xs">Top Pages (one per line)</Label>
                                            <Textarea
                                              placeholder="/services&#10;/contact&#10;/about"
                                              value={snapshotFormData.topPages}
                                              onChange={(e) => setSnapshotFormData(prev => ({ ...prev, topPages: e.target.value }))}
                                              className="min-h-[60px]"
                                              data-testid="input-snapshot-toppages"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs">Top Keywords (one per line)</Label>
                                            <Textarea
                                              placeholder="plumber near me&#10;emergency plumber&#10;plumbing services"
                                              value={snapshotFormData.topKeywords}
                                              onChange={(e) => setSnapshotFormData(prev => ({ ...prev, topKeywords: e.target.value }))}
                                              className="min-h-[60px]"
                                              data-testid="input-snapshot-topkeywords"
                                            />
                                          </div>
                                          <div>
                                            <Label className="text-xs">Notes</Label>
                                            <Textarea
                                              placeholder="Any observations or context..."
                                              value={snapshotFormData.notes}
                                              onChange={(e) => setSnapshotFormData(prev => ({ ...prev, notes: e.target.value }))}
                                              className="min-h-[60px]"
                                              data-testid="input-snapshot-notes"
                                            />
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <Button
                                              size="sm"
                                              onClick={() => handleCreateAnalyticsSnapshot(client.id)}
                                              disabled={savingSnapshot || !snapshotFormData.dateRange}
                                              data-testid="button-save-snapshot"
                                            >
                                              {savingSnapshot ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <Check className="h-3 w-3 mr-1" />}
                                              Save Snapshot
                                            </Button>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => setShowSnapshotForm(false)}
                                              data-testid="button-cancel-snapshot"
                                            >
                                              Cancel
                                            </Button>
                                          </div>
                                        </div>
                                      ) : (
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => setShowSnapshotForm(true)}
                                          data-testid="button-add-snapshot"
                                        >
                                          <Plus className="h-3 w-3 mr-1" />
                                          Add Analytics Snapshot
                                        </Button>
                                      )}
                                    </>
                                  )}
                                </div>

                                  {/* Strategy Feedback Loop */}
                                  <div className="p-4 border rounded-md bg-gradient-to-br from-primary/5 to-transparent">
                                    <div className="flex items-center gap-2 mb-3">
                                      <Sparkles className="h-4 w-4 text-primary" />
                                      <h5 className="font-medium">Strategy Feedback Loop</h5>
                                    </div>
                                    <p className="text-xs text-muted-foreground mb-3">
                                      Real-time insights based on evidence and analytics changes to help refine your strategy.
                                    </p>
                                    
                                    {(() => {
                                      const feedbackItems = generateStrategyFeedback(
                                        client.id,
                                        clientChannelInsights[client.id] || [],
                                        clientAnalyticsSnapshots[client.id] || [],
                                        clientEvidenceTasks[client.id] || [],
                                        clientStrategyPlan[client.id] || null
                                      );
                                      
                                      if (feedbackItems.length === 0) {
                                        return (
                                          <div className="text-center text-muted-foreground py-3">
                                            <CheckCircle className="h-5 w-5 mx-auto mb-1 opacity-50" />
                                            <p className="text-xs">No actionable feedback at this time.</p>
                                            <p className="text-xs">Add evidence or analytics snapshots to receive insights.</p>
                                          </div>
                                        );
                                      }
                                      
                                      return (
                                        <div className="space-y-2" data-testid="strategy-feedback-loop">
                                          {feedbackItems.map((item, idx) => (
                                            <div 
                                              key={idx} 
                                              className={`p-2.5 rounded-md text-sm flex items-start gap-2 ${
                                                item.type === 'success' ? 'bg-green-100/50 dark:bg-green-900/20 text-green-800 dark:text-green-300' :
                                                item.type === 'warning' ? 'bg-amber-100/50 dark:bg-amber-900/20 text-amber-800 dark:text-amber-300' :
                                                'bg-blue-100/50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-300'
                                              }`}
                                              data-testid={`feedback-item-${item.type}-${idx}`}
                                            >
                                              {item.type === 'success' ? (
                                                <CheckCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                              ) : item.type === 'warning' ? (
                                                <AlertTriangle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                              ) : (
                                                <Target className="h-4 w-4 mt-0.5 flex-shrink-0" />
                                              )}
                                              <div className="flex-1">
                                                <span>{item.message}</span>
                                                {item.channel && (
                                                  <Badge variant="outline" className="ml-2 text-[10px] py-0">
                                                    {INSIGHT_CHANNEL_LABELS[item.channel]}
                                                  </Badge>
                                                )}
                                              </div>
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    })()}
                                  </div>
                                </div>
                              ) : (
                                <div className="p-4 border rounded-md text-center text-muted-foreground">
                                  <Lightbulb className="h-8 w-8 mx-auto mb-2" />
                                  <p className="font-medium">Gap Analysis & Insights</p>
                                  <p className="text-sm">Complete the Strategy Wizard and generate a strategy to see competitive gaps and opportunities.</p>
                                </div>
                              )}
                            </TabsContent>

                            <TabsContent value="content" className="space-y-4">
                              {loadingContentDrafts === client.id ? (
                                <div className="flex items-center justify-center p-8">
                                  <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                                </div>
                              ) : (clientContentDrafts[client.id] ?? []).length > 0 ? (
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between gap-2">
                                    <h4 className="font-semibold">Content Approval Queue</h4>
                                    <Badge variant="outline">
                                      {(clientContentDrafts[client.id] ?? []).filter(d => d.status === 'pending_approval').length} pending
                                    </Badge>
                                  </div>
                                  
                                  <div className="space-y-3">
                                    {(clientContentDrafts[client.id] ?? []).map((draft) => (
                                      <div key={draft.id} className="p-4 border rounded-md space-y-3" data-testid={`content-draft-${draft.id}`}>
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                              <Badge variant={
                                                draft.status === 'approved' ? 'default' :
                                                draft.status === 'rejected' ? 'destructive' :
                                                draft.status === 'published' ? 'default' :
                                                draft.status === 'pending_approval' ? 'secondary' : 'outline'
                                              }>
                                                {draft.status === 'pending_approval' ? 'Pending' : 
                                                 draft.status.charAt(0).toUpperCase() + draft.status.slice(1)}
                                              </Badge>
                                              <Badge variant="outline">{draft.type}</Badge>
                                            </div>
                                            <h5 className="font-medium">{draft.title}</h5>
                                            <p className="text-sm text-muted-foreground mt-1 line-clamp-3">{draft.content}</p>
                                          </div>
                                        </div>
                                        
                                        {draft.feedback && (
                                          <div className="p-2 bg-muted/50 rounded text-sm">
                                            <span className="text-muted-foreground">Feedback:</span> {draft.feedback}
                                          </div>
                                        )}
                                        
                                        <div className="flex items-center gap-2 pt-2 border-t">
                                          {draft.status === 'pending_approval' && (
                                            <>
                                              <Button
                                                size="sm"
                                                variant="default"
                                                onClick={() => handleUpdateDraftStatus(client.id, draft.id, 'approved')}
                                                disabled={updatingDraft === draft.id}
                                                data-testid={`button-approve-draft-${draft.id}`}
                                              >
                                                {updatingDraft === draft.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3 mr-1" />}
                                                Approve
                                              </Button>
                                              <Button
                                                size="sm"
                                                variant="destructive"
                                                onClick={() => handleUpdateDraftStatus(client.id, draft.id, 'rejected')}
                                                disabled={updatingDraft === draft.id}
                                                data-testid={`button-reject-draft-${draft.id}`}
                                              >
                                                <X className="h-3 w-3 mr-1" />
                                                Reject
                                              </Button>
                                            </>
                                          )}
                                          {draft.status === 'approved' && (
                                            <Button
                                              size="sm"
                                              variant="outline"
                                              onClick={() => handleUpdateDraftStatus(client.id, draft.id, 'published')}
                                              disabled={updatingDraft === draft.id}
                                              data-testid={`button-publish-draft-${draft.id}`}
                                            >
                                              {updatingDraft === draft.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Play className="h-3 w-3 mr-1" />}
                                              Mark Published
                                            </Button>
                                          )}
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => navigator.clipboard.writeText(draft.content)}
                                            data-testid={`button-copy-draft-${draft.id}`}
                                          >
                                            <Copy className="h-3 w-3 mr-1" />
                                            Copy
                                          </Button>
                                          <span className="text-xs text-muted-foreground ml-auto">
                                            {new Date(draft.createdAt).toLocaleDateString()}
                                          </span>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              ) : (
                                <div className="p-4 border rounded-md text-center text-muted-foreground">
                                  <PenTool className="h-8 w-8 mx-auto mb-2" />
                                  <p className="font-medium">No Content Drafts</p>
                                  <p className="text-sm">AI-generated content for review will appear here after strategy generation.</p>
                                </div>
                              )}
                            </TabsContent>
                          </Tabs>
                        </TabsContent>

                        {/* Activity Tab - Tasks, Notes, and History */}
                        <TabsContent value="activity" className="space-y-4">
                          {loadingClientActivity === client.id ? (
                            <div className="flex items-center justify-center p-8">
                              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                            </div>
                          ) : (
                            <div className="space-y-6">
                              {/* Quick Actions */}
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium flex items-center gap-2">
                                  <Sparkles className="h-4 w-4" />
                                  Log Activity
                                </h4>
                                <div className="flex flex-wrap gap-2">
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleLogClientAction(client.id, client.businessName, 'call')}
                                    disabled={loggingAction}
                                    data-testid={`button-log-call-${client.id}`}
                                  >
                                    <Phone className="h-4 w-4 mr-2" />
                                    Call
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleLogClientAction(client.id, client.businessName, 'email')}
                                    disabled={loggingAction}
                                    data-testid={`button-log-email-${client.id}`}
                                  >
                                    <Mail className="h-4 w-4 mr-2" />
                                    Email
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleLogClientAction(client.id, client.businessName, 'meeting')}
                                    disabled={loggingAction}
                                    data-testid={`button-log-meeting-${client.id}`}
                                  >
                                    <Calendar className="h-4 w-4 mr-2" />
                                    Meeting
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => handleLogClientAction(client.id, client.businessName, 'dropin')}
                                    disabled={loggingAction}
                                    data-testid={`button-log-dropin-${client.id}`}
                                  >
                                    <Navigation className="h-4 w-4 mr-2" />
                                    Drop-in
                                  </Button>
                                </div>
                              </div>

                              {/* Add Note */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <h4 className="text-sm font-medium flex items-center gap-2">
                                    <MessageSquare className="h-4 w-4" />
                                    Add Note
                                  </h4>
                                  <DictationButton
                                    onTranscript={(text) => setNewClientNote(prev => prev + (prev ? ' ' : '') + text)}
                                    data-testid={`button-dictate-note-${client.id}`}
                                  />
                                </div>
                                <div className="flex gap-2">
                                  <Textarea
                                    value={newClientNote}
                                    onChange={(e) => setNewClientNote(e.target.value)}
                                    placeholder="Add a note to client history... (or use microphone to dictate)"
                                    className="min-h-[80px]"
                                    data-testid={`input-note-${client.id}`}
                                  />
                                </div>
                                <Button
                                  size="sm"
                                  onClick={() => handleAddClientNote(client.id)}
                                  disabled={savingNote || !newClientNote.trim()}
                                  data-testid={`button-save-note-${client.id}`}
                                >
                                  {savingNote ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
                                  Save Note
                                </Button>
                              </div>

                              {/* Tasks Section */}
                              <div className="space-y-2">
                                <div className="flex items-center justify-between gap-2">
                                  <h4 className="text-sm font-medium flex items-center gap-2">
                                    <ClipboardList className="h-4 w-4" />
                                    Tasks
                                  </h4>
                                  <Dialog open={isAddTaskDialogOpen && expandedClientId === client.id} onOpenChange={(open) => {
                                    setIsAddTaskDialogOpen(open);
                                    if (!open) {
                                      setNewTaskTitle('');
                                      setNewTaskType('check_in');
                                      setNewTaskDueDate(getTodayDDMMYYYY());
                                      resetAiAssistState();
                                    }
                                  }}>
                                    <DialogTrigger asChild>
                                      <Button 
                                        size="sm" 
                                        variant="outline" 
                                        data-testid={`button-add-task-${client.id}`}
                                      >
                                        <Plus className="h-4 w-4 mr-1" />
                                        Add Task
                                      </Button>
                                    </DialogTrigger>
                                    <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
                                      <DialogHeader>
                                        <DialogTitle>Create Task for {client.businessName}</DialogTitle>
                                      </DialogHeader>
                                      <div className="space-y-4 py-4">
                                        <div className="space-y-2">
                                          <div className="flex items-center justify-between gap-2">
                                            <Label>Task Title</Label>
                                            <div className="flex items-center gap-2">
                                              <DictationButton
                                                onTranscript={(text) => setNewTaskTitle(prev => prev + (prev ? ' ' : '') + text)}
                                                data-testid="button-dictate-task"
                                              />
                                              <Button
                                                size="sm"
                                                variant="secondary"
                                                onClick={() => handleAITaskAssist(client)}
                                                disabled={aiAssisting || !newTaskTitle.trim()}
                                                data-testid="button-ai-assist"
                                              >
                                                {aiAssisting ? (
                                                  <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                                                ) : (
                                                  <Sparkles className="h-4 w-4 mr-1" />
                                                )}
                                                AI Assist
                                              </Button>
                                            </div>
                                          </div>
                                          <Input
                                            value={newTaskTitle}
                                            onChange={(e) => setNewTaskTitle(e.target.value)}
                                            placeholder="e.g., Follow up on proposal... then click AI Assist"
                                            data-testid="input-new-task-title"
                                          />
                                        </div>
                                        
                                        <div className="grid grid-cols-2 gap-4">
                                          <div className="space-y-2">
                                            <Label>Task Type</Label>
                                            <Select value={newTaskType} onValueChange={(v) => setNewTaskType(v as TaskType)}>
                                              <SelectTrigger data-testid="select-task-type">
                                                <SelectValue />
                                              </SelectTrigger>
                                              <SelectContent>
                                                <SelectItem value="check_in">Check-in</SelectItem>
                                                <SelectItem value="follow_up">Follow-up</SelectItem>
                                                <SelectItem value="meeting">Meeting</SelectItem>
                                                <SelectItem value="delivery">Delivery</SelectItem>
                                                <SelectItem value="renewal">Renewal</SelectItem>
                                                <SelectItem value="upsell">Upsell</SelectItem>
                                                <SelectItem value="prospecting">Prospecting</SelectItem>
                                                <SelectItem value="admin">Admin</SelectItem>
                                              </SelectContent>
                                            </Select>
                                          </div>
                                          <div className="space-y-2">
                                            <Label>Due Date (DD-MM-YYYY)</Label>
                                            <Input
                                              value={newTaskDueDate}
                                              onChange={(e) => setNewTaskDueDate(e.target.value)}
                                              placeholder="DD-MM-YYYY"
                                              data-testid="input-task-due-date"
                                            />
                                          </div>
                                        </div>
                                        
                                        {aiResult && (
                                          <div className="space-y-4 p-3 bg-muted/50 rounded-md border">
                                            <div className="flex items-center gap-2">
                                              <Sparkles className="h-4 w-4 text-primary" />
                                              <span className="text-sm font-medium">AI-Enhanced Task</span>
                                              <Badge variant="secondary" className="text-xs">{aiPriority}</Badge>
                                            </div>
                                            
                                            <div className="space-y-2">
                                              <Label className="text-xs text-muted-foreground">Outcome (what done looks like)</Label>
                                              <Input
                                                value={aiOutcome}
                                                onChange={(e) => setAiOutcome(e.target.value)}
                                                placeholder="What does done look like?"
                                                className="text-sm"
                                                data-testid="input-outcome"
                                              />
                                            </div>
                                            
                                            {aiChecklist.length > 0 && (
                                              <div className="space-y-2">
                                                <Label className="text-xs text-muted-foreground">Checklist</Label>
                                                <div className="space-y-1">
                                                  {aiChecklist.map((item, idx) => (
                                                    <div key={item.id} className="flex items-center gap-2 text-sm">
                                                      <Checkbox
                                                        checked={item.completed}
                                                        onCheckedChange={(checked) => {
                                                          setAiChecklist(prev => prev.map((it, i) =>
                                                            i === idx ? { ...it, completed: !!checked } : it
                                                          ));
                                                        }}
                                                        data-testid={`checkbox-checklist-${idx}`}
                                                      />
                                                      <span className={item.completed ? 'line-through text-muted-foreground' : ''}>{item.text}</span>
                                                    </div>
                                                  ))}
                                                </div>
                                              </div>
                                            )}
                                            
                                            {aiFollowUp && (
                                              <div className="space-y-1">
                                                <Label className="text-xs text-muted-foreground">Follow-up if no response</Label>
                                                <p className="text-sm text-muted-foreground">{aiFollowUp}</p>
                                              </div>
                                            )}
                                            
                                            {aiEmailTemplate && (
                                              <Collapsible>
                                                <CollapsibleTrigger asChild>
                                                  <Button variant="ghost" size="sm" className="w-full justify-between">
                                                    <span className="flex items-center gap-2">
                                                      <Mail className="h-4 w-4" />
                                                      Email Template
                                                    </span>
                                                    <ChevronDown className="h-4 w-4" />
                                                  </Button>
                                                </CollapsibleTrigger>
                                                <CollapsibleContent>
                                                  <Textarea
                                                    value={aiEmailTemplate}
                                                    onChange={(e) => setAiEmailTemplate(e.target.value)}
                                                    className="text-xs min-h-[100px] mt-2"
                                                    data-testid="textarea-email-template"
                                                  />
                                                </CollapsibleContent>
                                              </Collapsible>
                                            )}
                                            
                                            {aiCallScript && (
                                              <Collapsible>
                                                <CollapsibleTrigger asChild>
                                                  <Button variant="ghost" size="sm" className="w-full justify-between">
                                                    <span className="flex items-center gap-2">
                                                      <Phone className="h-4 w-4" />
                                                      Call Script
                                                    </span>
                                                    <ChevronDown className="h-4 w-4" />
                                                  </Button>
                                                </CollapsibleTrigger>
                                                <CollapsibleContent>
                                                  <Textarea
                                                    value={aiCallScript}
                                                    onChange={(e) => setAiCallScript(e.target.value)}
                                                    className="text-xs min-h-[100px] mt-2"
                                                    data-testid="textarea-call-script"
                                                  />
                                                </CollapsibleContent>
                                              </Collapsible>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                      <div className="flex justify-end gap-2">
                                        <Button variant="outline" onClick={() => setIsAddTaskDialogOpen(false)}>
                                          Cancel
                                        </Button>
                                        <Button
                                          onClick={() => handleCreateClientTask(client.id, client.businessName)}
                                          disabled={savingClientTask || !newTaskTitle.trim()}
                                          data-testid="button-create-task-submit"
                                        >
                                          {savingClientTask ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                                          {aiResult ? 'Create AI-Enhanced Task' : 'Create Task'}
                                        </Button>
                                      </div>
                                    </DialogContent>
                                  </Dialog>
                                </div>

                                {(clientTasks[client.id] ?? []).filter(t => t.status === 'pending').length > 0 ? (
                                  <div className="space-y-2">
                                    {(clientTasks[client.id] ?? [])
                                      .filter(t => t.status === 'pending')
                                      .slice(0, 5)
                                      .map(task => (
                                        <div
                                          key={task.id}
                                          className="flex items-center gap-3 p-3 border rounded-md"
                                          data-testid={`task-${task.id}`}
                                        >
                                          <Checkbox
                                            checked={task.status === 'completed'}
                                            onCheckedChange={() => handleCompleteClientTask(client.id, task.id)}
                                            data-testid={`checkbox-task-${task.id}`}
                                          />
                                          <div className="flex-1 min-w-0">
                                            <p className="text-sm font-medium truncate">{task.title}</p>
                                            <p className="text-xs text-muted-foreground">
                                              Due: {task.planDate || 'Not set'}
                                            </p>
                                          </div>
                                          <Badge variant="outline" className="text-xs">
                                            {task.taskType || 'task'}
                                          </Badge>
                                        </div>
                                      ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground py-2" data-testid={`text-no-tasks-${client.id}`}>No pending tasks</p>
                                )}
                              </div>

                              {/* Activity History */}
                              <div className="space-y-2">
                                <h4 className="text-sm font-medium flex items-center gap-2">
                                  <Clock className="h-4 w-4" />
                                  Recent Activity
                                </h4>
                                {(clientActivities[client.id] ?? []).length > 0 ? (
                                  <div className="space-y-2 max-h-[300px] overflow-y-auto">
                                    {(clientActivities[client.id] ?? []).slice(0, 10).map(activity => (
                                      <div
                                        key={activity.id}
                                        className="flex items-start gap-3 p-3 border rounded-md bg-muted/30"
                                        data-testid={`activity-${activity.id}`}
                                      >
                                        <div className="flex-shrink-0 mt-0.5">
                                          {activity.type === 'call' && <Phone className="h-4 w-4 text-blue-500" />}
                                          {activity.type === 'email' && <Mail className="h-4 w-4 text-green-500" />}
                                          {activity.type === 'meeting' && <Calendar className="h-4 w-4 text-purple-500" />}
                                          {activity.type === 'dropin' && <Navigation className="h-4 w-4 text-orange-500" />}
                                          {activity.type === 'followup' && <MessageSquare className="h-4 w-4 text-muted-foreground" />}
                                          {!['call', 'email', 'meeting', 'dropin', 'followup'].includes(activity.type) && (
                                            <CircleDot className="h-4 w-4 text-muted-foreground" />
                                          )}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                          <div className="flex items-center gap-2 mb-1">
                                            <Badge variant="outline" className="text-xs">
                                              {ACTIVITY_LABELS[activity.type] || activity.type}
                                            </Badge>
                                            <span className="text-xs text-muted-foreground">
                                              {new Date(activity.createdAt).toLocaleDateString()} at {new Date(activity.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                          </div>
                                          {activity.notes && (
                                            <p className="text-sm text-muted-foreground">{activity.notes}</p>
                                          )}
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                ) : (
                                  <p className="text-sm text-muted-foreground py-2" data-testid={`text-no-activity-${client.id}`}>No activity recorded yet</p>
                                )}
                              </div>
                            </div>
                          )}
                        </TabsContent>
                      </Tabs>

                      <div className="flex gap-2 pt-2">
                        <Button variant="outline" size="sm" data-testid={`button-contact-${client.id}`}>
                          <Phone className="h-4 w-4 mr-2" />
                          Contact
                        </Button>
                        <Button variant="outline" size="sm" data-testid={`button-view-${client.id}`}>
                          <Building2 className="h-4 w-4 mr-2" />
                          View Details
                        </Button>
                      </div>
                    </CardContent>
                  </CollapsibleContent>
                </Card>
              </Collapsible>
            ))
          )}
        </div>
      </ScrollArea>

      <Dialog open={isWizardOpen} onOpenChange={(open) => { if (!open) closeWizard(); }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Target className="h-5 w-5" />
              Strategy Kickoff Wizard - Step {wizardStep} of 6
            </DialogTitle>
          </DialogHeader>

          <div className="flex gap-1 mb-4">
            {[1, 2, 3, 4, 5, 6].map((step) => (
              <div
                key={step}
                className={`h-2 flex-1 rounded ${step <= wizardStep ? 'bg-primary' : 'bg-muted'}`}
              />
            ))}
          </div>

          <div className="space-y-4 py-2">
            {wizardStep === 1 && (
              <div className="space-y-4">
                <h3 className="font-medium">Business Basics</h3>
                <div className="space-y-2">
                  <Label>Industry</Label>
                  <Input
                    value={wizardData.industry}
                    onChange={(e) => updateWizardField('industry', e.target.value)}
                    placeholder="e.g., Plumbing, Roofing, HVAC..."
                    data-testid="input-wizard-industry"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Primary Services</Label>
                  <div className="flex gap-2">
                    <Input
                      id="wizard-service-input"
                      placeholder="Add a service..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.target as HTMLInputElement;
                          addToWizardArray('primaryServices', input.value);
                          input.value = '';
                        }
                      }}
                      data-testid="input-wizard-service"
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        const input = document.getElementById('wizard-service-input') as HTMLInputElement;
                        if (input) {
                          addToWizardArray('primaryServices', input.value);
                          input.value = '';
                          input.focus();
                        }
                      }}
                      data-testid="button-add-service"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {wizardData.primaryServices.length === 0 && (
                    <p className="text-xs text-muted-foreground">Add at least one primary service</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {wizardData.primaryServices.map((s, i) => (
                      <Badge key={i} variant="secondary" className="gap-1">
                        {s}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => removeFromWizardArray('primaryServices', i)} />
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Service Area Type</Label>
                  <Select value={wizardData.serviceAreaType} onValueChange={(val) => updateWizardField('serviceAreaType', val as ServiceAreaType)}>
                    <SelectTrigger data-testid="select-wizard-area-type">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="local">Local (Single city/suburb)</SelectItem>
                      <SelectItem value="regional">Regional (Multiple suburbs)</SelectItem>
                      <SelectItem value="multi-location">Multi-location</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Primary Service Locations</Label>
                  <div className="flex gap-2">
                    <Input
                      id="wizard-location-input"
                      placeholder="Add a location..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          const input = e.target as HTMLInputElement;
                          addToWizardArray('primaryLocations', input.value);
                          input.value = '';
                        }
                      }}
                      data-testid="input-wizard-location"
                    />
                    <Button 
                      type="button" 
                      variant="outline" 
                      size="sm"
                      onClick={() => {
                        const input = document.getElementById('wizard-location-input') as HTMLInputElement;
                        if (input) {
                          addToWizardArray('primaryLocations', input.value);
                          input.value = '';
                          input.focus();
                        }
                      }}
                      data-testid="button-add-location"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                  {wizardData.primaryLocations.length === 0 && (
                    <p className="text-xs text-muted-foreground">Add at least one primary location</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {wizardData.primaryLocations.map((l, i) => (
                      <Badge key={i} variant="secondary" className="gap-1">
                        {l}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => removeFromWizardArray('primaryLocations', i)} />
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 2 && (
              <div className="space-y-4">
                <h3 className="font-medium">Digital Presence</h3>
                <div className="space-y-2">
                  <Label>Website URL</Label>
                  <Input
                    value={wizardData.websiteUrl || ''}
                    onChange={(e) => updateWizardField('websiteUrl', e.target.value)}
                    placeholder="https://..."
                    data-testid="input-wizard-website"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Google Business Profile URL</Label>
                  <Input
                    value={wizardData.gbpUrl || ''}
                    onChange={(e) => updateWizardField('gbpUrl', e.target.value)}
                    placeholder="https://maps.google.com/..."
                    data-testid="input-wizard-gbp"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Facebook Page URL</Label>
                  <Input
                    value={wizardData.facebookUrl || ''}
                    onChange={(e) => updateWizardField('facebookUrl', e.target.value)}
                    placeholder="https://facebook.com/..."
                    data-testid="input-wizard-facebook"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Instagram URL</Label>
                  <Input
                    value={wizardData.instagramUrl || ''}
                    onChange={(e) => updateWizardField('instagramUrl', e.target.value)}
                    placeholder="https://instagram.com/..."
                    data-testid="input-wizard-instagram"
                  />
                </div>
              </div>
            )}

            {wizardStep === 3 && (
              <div className="space-y-4">
                <h3 className="font-medium">Current Marketing</h3>
                <div className="space-y-2">
                  <Label>What's working well?</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add something that's working..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addToWizardArray('workingWell', (e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                      data-testid="input-wizard-working"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {wizardData.workingWell.map((w, i) => (
                      <Badge key={i} variant="default" className="gap-1">
                        {w}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => removeFromWizardArray('workingWell', i)} />
                      </Badge>
                    ))}
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>What's not working?</Label>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add something that needs improvement..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addToWizardArray('notWorkingWell', (e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                      data-testid="input-wizard-not-working"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {wizardData.notWorkingWell.map((w, i) => (
                      <Badge key={i} variant="destructive" className="gap-1">
                        {w}
                        <X className="h-3 w-3 cursor-pointer" onClick={() => removeFromWizardArray('notWorkingWell', i)} />
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {wizardStep === 4 && (
              <div className="space-y-4">
                <h3 className="font-medium">Goals</h3>
                <div className="space-y-2">
                  <Label>Primary Goal</Label>
                  <Select value={wizardData.primaryGoal || ''} onValueChange={(val) => updateWizardField('primaryGoal', val as PrimaryGoal)}>
                    <SelectTrigger data-testid="select-wizard-goal">
                      <SelectValue placeholder="Select primary goal..." />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="map_pack">Map Pack (Top 3)</SelectItem>
                      <SelectItem value="more_leads">More Calls/Leads</SelectItem>
                      <SelectItem value="organic_rankings">Organic Rankings</SelectItem>
                      <SelectItem value="lower_cpl">Lower CPL / Better Lead Quality</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Ideal Job Type</Label>
                  <Input
                    value={wizardData.idealJobType}
                    onChange={(e) => updateWizardField('idealJobType', e.target.value)}
                    placeholder="e.g., Hot water replacements, commercial jobs..."
                    data-testid="input-wizard-ideal-job"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Average Job Value ($)</Label>
                  <Input
                    type="number"
                    value={wizardData.averageJobValue || ''}
                    onChange={(e) => updateWizardField('averageJobValue', e.target.value ? Number(e.target.value) : null)}
                    placeholder="e.g., 500"
                    data-testid="input-wizard-job-value"
                  />
                </div>
              </div>
            )}

            {wizardStep === 5 && (
              <div className="space-y-4">
                <h3 className="font-medium">Challenges & Notes</h3>
                <div className="space-y-2">
                  <Label>Seasonality Notes</Label>
                  <Textarea
                    value={wizardData.seasonalityNotes || ''}
                    onChange={(e) => updateWizardField('seasonalityNotes', e.target.value)}
                    placeholder="Any seasonal patterns in their business..."
                    data-testid="input-wizard-seasonality"
                  />
                </div>
                <div className="space-y-2">
                  <Label>Additional Notes</Label>
                  <Textarea
                    value={wizardData.additionalNotes || ''}
                    onChange={(e) => updateWizardField('additionalNotes', e.target.value)}
                    placeholder="Any other important information..."
                    data-testid="input-wizard-notes"
                  />
                </div>
              </div>
            )}

            {wizardStep === 6 && (
              <div className="space-y-4">
                <h3 className="font-medium">Review & Confirm</h3>
                <div className="space-y-3 text-sm border rounded-md p-4">
                  <div className="grid grid-cols-2 gap-2">
                    <div><span className="text-muted-foreground">Industry:</span> {wizardData.industry || '-'}</div>
                    <div><span className="text-muted-foreground">Area Type:</span> {wizardData.serviceAreaType}</div>
                  </div>
                  <div>
                    <span className="text-muted-foreground">Services:</span> {wizardData.primaryServices.join(', ') || '-'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Locations:</span> {wizardData.primaryLocations.join(', ') || '-'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Website:</span> {wizardData.websiteUrl || '-'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Goal:</span> {wizardData.primaryGoal ? PRIMARY_GOAL_LABELS[wizardData.primaryGoal] : '-'}
                  </div>
                  <div>
                    <span className="text-muted-foreground">Ideal Job:</span> {wizardData.idealJobType || '-'}
                  </div>
                  {wizardData.averageJobValue && (
                    <div>
                      <span className="text-muted-foreground">Avg Job Value:</span> ${wizardData.averageJobValue}
                    </div>
                  )}
                  {wizardData.workingWell.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Working Well:</span> {wizardData.workingWell.join(', ')}
                    </div>
                  )}
                  {wizardData.notWorkingWell.length > 0 && (
                    <div>
                      <span className="text-muted-foreground">Not Working:</span> {wizardData.notWorkingWell.join(', ')}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-between gap-2 pt-4 border-t">
            <Button variant="outline" onClick={closeWizard} data-testid="button-wizard-cancel">
              Cancel
            </Button>
            <div className="flex gap-2">
              {wizardStep > 1 && (
                <Button variant="outline" onClick={handleWizardBack} data-testid="button-wizard-back">
                  Back
                </Button>
              )}
              {wizardStep < 6 ? (
                <Button onClick={handleWizardNext} data-testid="button-wizard-next">
                  Next
                </Button>
              ) : (
                <Button onClick={handleWizardSave} disabled={savingWizard} data-testid="button-wizard-save">
                  {savingWizard ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Save Strategy
                </Button>
              )}
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Share Strategy Dialog */}
      <Dialog open={shareDialogClientId !== null} onOpenChange={(open) => { if (!open) setShareDialogClientId(null); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Share2 className="h-5 w-5" />
              Share Strategy
            </DialogTitle>
          </DialogHeader>
          
          {shareDialogClientId && (() => {
            const shareClient = clients.find(c => c.id === shareDialogClientId);
            const sharePlan = clientStrategyPlan[shareDialogClientId];
            const shareUrl = `${window.location.origin}/strategy/${shareDialogClientId}`;
            
            return (
              <div className="space-y-6">
                <div className="text-center space-y-2">
                  <p className="text-sm text-muted-foreground">
                    Share this strategy with <span className="font-medium">{shareClient?.businessName}</span>
                  </p>
                </div>
                
                <div className="flex justify-center p-4 bg-white rounded-md">
                  <QRCodeSVG 
                    value={shareUrl} 
                    size={180}
                    level="M"
                    includeMargin={true}
                    data-testid="qr-code-strategy"
                  />
                </div>
                
                <div className="space-y-2">
                  <Label>Shareable Link</Label>
                  <div className="flex gap-2">
                    <Input 
                      value={shareUrl} 
                      readOnly 
                      className="font-mono text-xs"
                      data-testid="input-share-url"
                    />
                    <Button 
                      variant="outline" 
                      size="icon"
                      onClick={() => {
                        navigator.clipboard.writeText(shareUrl);
                        toast({ title: "Link copied", description: "Strategy link copied to clipboard." });
                      }}
                      data-testid="button-copy-share-url"
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                
                <div className="flex justify-between gap-2 pt-2 border-t">
                  <Button 
                    variant="outline" 
                    onClick={() => setShareDialogClientId(null)}
                    data-testid="button-close-share-dialog"
                  >
                    Close
                  </Button>
                  <Button 
                    variant="default"
                    onClick={() => window.open(shareUrl, '_blank')}
                    data-testid="button-open-share-link"
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    Open Link
                  </Button>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>
    </div>
  );
}
