import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSearch } from 'wouter';
import { Plus, Filter, Users, Phone, Mail, MapPin, Building2, AlertCircle, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, Package, Clock, CircleDot, Check, X, Loader2, Target, Calendar, FileText, Trash2, Sparkles, Copy, LayoutDashboard, TrendingUp, Lightbulb, PenTool, Play, ArrowUp, ArrowDown } from 'lucide-react';
import { RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar, ResponsiveContainer, Legend } from 'recharts';
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
import { Client, HealthStatus, HEALTH_STATUS_LABELS, CADENCE_TIER_LABELS, StrategyStatus, ChannelStatuses, Deliverable, DeliverableStatus, DELIVERABLE_STATUS_LABELS, StrategySession, StrategyPlan, PRIMARY_GOAL_LABELS, PrimaryGoal, ContentDraft, ContentDraftStatus, ContentDraftType } from '@/lib/types';
import { TERRITORY_CONFIG, getAreasForRegion, computeTerritoryFields, validateTerritorySelection } from '@/lib/territoryConfig';
import { createClient as createClientInFirestore, updateClientInFirestore, fetchDeliverables, createDeliverable, updateDeliverable, deleteDeliverable, fetchStrategySessions, createStrategySession, deleteStrategySession, fetchStrategyPlan, saveStrategyPlan, fetchContentDrafts, updateContentDraft } from '@/lib/firestoreService';
import { BusinessProfile, DEFAULT_BUSINESS_PROFILE, ServiceAreaType } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

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

export default function ClientsPage() {
  const dispatch = useDispatch();
  const clients = useSelector((state: RootState) => state.app.clients);
  const searchQuery = useSelector((state: RootState) => state.app.searchQuery);
  const healthFilter = useSelector((state: RootState) => state.app.healthFilter);
  const regionFilter = useSelector((state: RootState) => state.app.regionFilter);
  const areaFilter = useSelector((state: RootState) => state.app.areaFilter);
  const user = useSelector((state: RootState) => state.app.user);
  const { toast } = useToast();
  const { user: authUser, orgId, authReady } = useAuth();

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
      
      dispatch(updateClient({
        id: wizardClientId,
        updates: {
          businessProfile: wizardData,
          strategyStatus: 'in_progress' as StrategyStatus,
        },
      }));
      
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
        id: client.id,
        updates: {
          strategyStatus: 'completed' as StrategyStatus,
          activeStrategyPlanId: savedPlan.id,
        },
      }));
      
      toast({ title: "Strategy Generated", description: "AI strategy plan has been created and saved." });
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
    if (!value.trim()) return;
    setWizardData(prev => ({
      ...prev,
      [field]: [...(prev[field] || []), value.trim()],
    }));
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

                              {client.businessProfile && (
                                <div className="p-4 border rounded-md space-y-3">
                                  <h5 className="font-medium">Business Profile Summary</h5>
                                  <div className="grid grid-cols-2 gap-3 text-sm">
                                    <div>
                                      <span className="text-muted-foreground">Industry:</span> {client.businessProfile.industry}
                                    </div>
                                    <div>
                                      <span className="text-muted-foreground">Business Type:</span> {client.businessProfile.businessType}
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
                                      {clientStrategyPlan[client.id]?.currentState?.strengths?.length > 0 && (
                                        <div>
                                          <span className="text-xs font-medium text-green-600">Strengths:</span>
                                          <ul className="text-xs mt-1 space-y-1">
                                            {clientStrategyPlan[client.id]?.currentState?.strengths?.map((s, i) => (
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
                                      {clientStrategyPlan[client.id]?.targetState?.outcomes?.length > 0 && (
                                        <div>
                                          <span className="text-xs font-medium text-blue-600">Outcomes:</span>
                                          <ul className="text-xs mt-1 space-y-1">
                                            {clientStrategyPlan[client.id]?.targetState?.outcomes?.map((o, i) => (
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
                                        <ul className="list-disc list-inside text-sm space-y-1">{aiToolResult.agenda?.map((item: string, idx: number) => <li key={idx}>{item}</li>)}</ul>
                                      </div>
                                      <div>
                                        <h5 className="font-medium mb-2">Key Talking Points</h5>
                                        <ul className="list-disc list-inside text-sm space-y-1">{aiToolResult.keyTalkingPoints?.map((item: string, idx: number) => <li key={idx}>{item}</li>)}</ul>
                                      </div>
                                      <div>
                                        <h5 className="font-medium mb-2">Questions to Ask</h5>
                                        <ul className="list-disc list-inside text-sm space-y-1">{aiToolResult.questionsToAsk?.map((item: string, idx: number) => <li key={idx}>{item}</li>)}</ul>
                                      </div>
                                      {aiToolResult.upsellOpportunities?.length > 0 && (
                                        <div>
                                          <h5 className="font-medium mb-2">Upsell Opportunities</h5>
                                          <ul className="list-disc list-inside text-sm space-y-1">{aiToolResult.upsellOpportunities.map((item: string, idx: number) => <li key={idx}>{item}</li>)}</ul>
                                        </div>
                                      )}
                                      <div>
                                        <h5 className="font-medium mb-2">Proposed Next Steps</h5>
                                        <ul className="list-disc list-inside text-sm space-y-1">{aiToolResult.nextStepsToPropose?.map((item: string, idx: number) => <li key={idx}>{item}</li>)}</ul>
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
                                        {clientStrategyPlan[client.id]?.roadmap30?.map((item: string, idx: number) => (
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
                                        {clientStrategyPlan[client.id]?.roadmap60?.map((item: string, idx: number) => (
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
                                        {clientStrategyPlan[client.id]?.roadmap90?.map((item: string, idx: number) => (
                                          <li key={idx} className="text-sm text-muted-foreground flex items-start gap-2">
                                            <Check className="h-4 w-4 mt-0.5 text-muted-foreground/50 flex-shrink-0" />
                                            {item}
                                          </li>
                                        ))}
                                      </ul>
                                    </div>
                                  </div>

                                  {/* Detailed Milestones */}
                                  {clientStrategyPlan[client.id]?.roadmap_30_60_90 && clientStrategyPlan[client.id]!.roadmap_30_60_90.length > 0 && (
                                    <div className="p-4 border rounded-md">
                                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                                        <Calendar className="h-4 w-4" />
                                        Milestone Tracker
                                      </h4>
                                      <div className="space-y-2">
                                        {clientStrategyPlan[client.id]?.roadmap_30_60_90?.map((milestone: { id: string; title: string; description: string; phase: string; channel: string; status: string }, idx: number) => (
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
                                  {clientStrategyPlan[client.id]?.initiatives && clientStrategyPlan[client.id]!.initiatives.length > 0 && (
                                    <div className="p-4 border rounded-md">
                                      <h4 className="font-semibold mb-3">Key Initiatives</h4>
                                      <div className="flex flex-wrap gap-2">
                                        {clientStrategyPlan[client.id]?.initiatives?.map((initiative: string, idx: number) => (
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

                                  {/* Radar Chart */}
                                  <div className="p-4 border rounded-md">
                                    <h4 className="font-semibold mb-4">Channel Readiness Assessment</h4>
                                    <div className="h-72">
                                      <ResponsiveContainer width="100%" height="100%">
                                        <RadarChart data={[
                                          { channel: 'Website', current: client.channelStatus.website === 'live' ? 90 : client.channelStatus.website === 'in_progress' ? 50 : 20, target: 90 },
                                          { channel: 'GBP', current: client.channelStatus.gbp === 'live' ? 90 : client.channelStatus.gbp === 'in_progress' ? 50 : 20, target: 85 },
                                          { channel: 'SEO', current: client.channelStatus.seo === 'live' ? 90 : client.channelStatus.seo === 'in_progress' ? 50 : 20, target: 80 },
                                          { channel: 'PPC', current: client.channelStatus.ppc === 'live' ? 90 : client.channelStatus.ppc === 'in_progress' ? 50 : 20, target: 75 },
                                          { channel: 'Content', current: 30, target: 70 },
                                        ]}>
                                          <PolarGrid />
                                          <PolarAngleAxis dataKey="channel" tick={{ fontSize: 12 }} />
                                          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10 }} />
                                          <Radar name="Current State" dataKey="current" stroke="hsl(var(--destructive))" fill="hsl(var(--destructive))" fillOpacity={0.3} />
                                          <Radar name="Target State" dataKey="target" stroke="hsl(var(--primary))" fill="hsl(var(--primary))" fillOpacity={0.3} />
                                          <Legend />
                                        </RadarChart>
                                      </ResponsiveContainer>
                                    </div>
                                  </div>

                                  {/* Current vs Target State */}
                                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div className="p-4 border rounded-md">
                                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                                        <ArrowDown className="h-4 w-4 text-amber-500" />
                                        Current State
                                      </h4>
                                      <p className="text-sm text-muted-foreground mb-3">{clientStrategyPlan[client.id]?.currentState?.summary}</p>
                                      <div className="space-y-2">
                                        <div>
                                          <span className="text-xs font-medium text-green-600">Strengths:</span>
                                          <ul className="list-disc list-inside text-xs text-muted-foreground mt-1">
                                            {clientStrategyPlan[client.id]?.currentState?.strengths?.map((s: string, idx: number) => (
                                              <li key={idx}>{s}</li>
                                            ))}
                                          </ul>
                                        </div>
                                        <div>
                                          <span className="text-xs font-medium text-red-600">Weaknesses:</span>
                                          <ul className="list-disc list-inside text-xs text-muted-foreground mt-1">
                                            {clientStrategyPlan[client.id]?.currentState?.weaknesses?.map((w: string, idx: number) => (
                                              <li key={idx}>{w}</li>
                                            ))}
                                          </ul>
                                        </div>
                                      </div>
                                    </div>
                                    <div className="p-4 border rounded-md">
                                      <h4 className="font-semibold mb-3 flex items-center gap-2">
                                        <ArrowUp className="h-4 w-4 text-green-500" />
                                        Target State (90 Days)
                                      </h4>
                                      <p className="text-sm text-muted-foreground mb-3">{clientStrategyPlan[client.id]?.targetState?.summary}</p>
                                      <div>
                                        <span className="text-xs font-medium text-primary">Expected Outcomes:</span>
                                        <ul className="list-disc list-inside text-xs text-muted-foreground mt-1">
                                          {clientStrategyPlan[client.id]?.targetState?.outcomes?.map((o: string, idx: number) => (
                                            <li key={idx}>{o}</li>
                                          ))}
                                        </ul>
                                      </div>
                                    </div>
                                  </div>

                                  {/* Channel OKRs */}
                                  {clientStrategyPlan[client.id]?.channelOKRs && clientStrategyPlan[client.id]!.channelOKRs.length > 0 && (
                                    <div className="p-4 border rounded-md">
                                      <h4 className="font-semibold mb-3">Channel Objectives & Key Results</h4>
                                      <div className="space-y-3">
                                        {clientStrategyPlan[client.id]?.channelOKRs?.map((okr: { channel: string; objective: string; keyResults: string[] }, idx: number) => (
                                          <div key={idx} className="p-3 bg-muted/30 rounded-md">
                                            <div className="flex items-center gap-2 mb-1">
                                              <Badge variant="outline" size="sm">{okr.channel}</Badge>
                                              <span className="text-sm font-medium">{okr.objective}</span>
                                            </div>
                                            <ul className="list-disc list-inside text-xs text-muted-foreground ml-2">
                                              {okr.keyResults?.map((kr: string, krIdx: number) => (
                                                <li key={krIdx}>{kr}</li>
                                              ))}
                                            </ul>
                                          </div>
                                        ))}
                                      </div>
                                    </div>
                                  )}
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
                              ) : clientContentDrafts[client.id]?.length > 0 ? (
                                <div className="space-y-4">
                                  <div className="flex items-center justify-between gap-2">
                                    <h4 className="font-semibold">Content Approval Queue</h4>
                                    <Badge variant="outline" size="sm">
                                      {clientContentDrafts[client.id]?.filter(d => d.status === 'pending_approval').length || 0} pending
                                    </Badge>
                                  </div>
                                  
                                  <div className="space-y-3">
                                    {clientContentDrafts[client.id]?.map((draft) => (
                                      <div key={draft.id} className="p-4 border rounded-md space-y-3" data-testid={`content-draft-${draft.id}`}>
                                        <div className="flex items-start justify-between gap-2">
                                          <div className="flex-1">
                                            <div className="flex items-center gap-2 mb-1">
                                              <Badge variant={
                                                draft.status === 'approved' ? 'default' :
                                                draft.status === 'rejected' ? 'destructive' :
                                                draft.status === 'published' ? 'default' :
                                                draft.status === 'pending_approval' ? 'secondary' : 'outline'
                                              } size="sm">
                                                {draft.status === 'pending_approval' ? 'Pending' : 
                                                 draft.status.charAt(0).toUpperCase() + draft.status.slice(1)}
                                              </Badge>
                                              <Badge variant="outline" size="sm">{draft.type}</Badge>
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
                      placeholder="Add a service..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addToWizardArray('primaryServices', (e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                      data-testid="input-wizard-service"
                    />
                  </div>
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
                      placeholder="Add a location..."
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          addToWizardArray('primaryLocations', (e.target as HTMLInputElement).value);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }}
                      data-testid="input-wizard-location"
                    />
                  </div>
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
    </div>
  );
}
