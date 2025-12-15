import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSearch } from 'wouter';
import { Plus, Filter, Users, Phone, Mail, MapPin, Building2, AlertCircle, CheckCircle, AlertTriangle, ChevronDown, ChevronUp, Package, Clock, CircleDot, Check, X, Loader2 } from 'lucide-react';
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
import { RootState, setHealthFilter, setRegionFilter, setAreaFilter, addClient, selectClient } from '@/store';
import { Client, HealthStatus, HEALTH_STATUS_LABELS, CADENCE_TIER_LABELS, StrategyStatus, ChannelStatuses, Deliverable, DeliverableStatus, DELIVERABLE_STATUS_LABELS } from '@/lib/types';
import { TERRITORY_CONFIG, getAreasForRegion, computeTerritoryFields, validateTerritorySelection } from '@/lib/territoryConfig';
import { createClient as createClientInFirestore, fetchDeliverables, createDeliverable, updateDeliverable, deleteDeliverable } from '@/lib/firestoreService';
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
                    <CardContent className="border-t pt-4 space-y-4">
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

                      <div className="space-y-3 pt-2 border-t">
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
                                    <Badge variant="outline" size="sm">{deliverable.productType}</Badge>
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
                      </div>

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
    </div>
  );
}
