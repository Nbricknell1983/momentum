import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation, useSearch } from 'wouter';
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Plus, Filter, Download, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RootState, updateLeadStage, addLead, updateLead, setStageFilter, setRegionFilter, setAreaFilter, addClient, archiveLead } from '@/store';
import { Stage, STAGE_ORDER, STAGE_LABELS, Lead, DEFAULT_NURTURE_FIELDS, Client, DEFAULT_CLIENT_FIELDS, calculateNextTouchDate } from '@/lib/types';
import { TERRITORY_CONFIG, getAreasForRegion, computeTerritoryFields, isAreaRequiredForRegion, validateTerritorySelection } from '@/lib/territoryConfig';
import KanbanColumnExpandable from '@/components/KanbanColumnExpandable';
import { v4 as uuidv4 } from 'uuid';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { createLead as createLeadInFirestore, updateLeadInFirestore, createClient as createClientInFirestore, createClientHistoryEntry } from '@/lib/firestoreService';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';

export default function PipelinePage() {
  const dispatch = useDispatch();
  const leads = useSelector((state: RootState) => state.app.leads);
  const cadences = useSelector((state: RootState) => state.app.cadences);
  const searchQuery = useSelector((state: RootState) => state.app.searchQuery);
  const stageFilter = useSelector((state: RootState) => state.app.stageFilter);
  const regionFilter = useSelector((state: RootState) => state.app.regionFilter);
  const areaFilter = useSelector((state: RootState) => state.app.areaFilter);
  const user = useSelector((state: RootState) => state.app.user);
  const { toast } = useToast();
  const { user: authUser, orgId, authReady, membershipReady } = useAuth();
  
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newStage, setNewStage] = useState<Stage>('suspect');
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');
  const [newRegionId, setNewRegionId] = useState('');
  const [newAreaId, setNewAreaId] = useState('');
  const [showArchivedWarning, setShowArchivedWarning] = useState(false);
  const [matchingArchivedLead, setMatchingArchivedLead] = useState<Lead | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  const [, setLocation] = useLocation();
  const searchString = useSearch();

  useEffect(() => {
    if (leads.length === 0) return;
    
    const params = new URLSearchParams(searchString);
    const openType = params.get('openType');
    const openId = params.get('openId');
    
    if (openType === 'lead' && openId) {
      const matchingLead = leads.find(l => l.id === openId);
      if (matchingLead) {
        setExpandedLeadId(openId);
        window.history.replaceState(null, '', '/pipeline');
      }
    }
  }, [searchString, leads]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Get available areas for the selected region filter
  const availableFilterAreas = regionFilter !== 'all' ? getAreasForRegion(regionFilter) : [];
  
  // Get available areas for the new lead form
  const availableNewLeadAreas = newRegionId ? getAreasForRegion(newRegionId) : [];

  // Filter leads using hierarchical territory fields
  const filteredLeads = leads.filter(lead => {
    if (lead.archived) return false;
    if (searchQuery && !lead.companyName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (stageFilter !== 'all' && lead.stage !== stageFilter) return false;
    
    // Territory filtering using persisted fields
    if (regionFilter !== 'all') {
      if (lead.regionId !== regionFilter) return false;
      if (areaFilter !== 'all' && lead.areaId !== areaFilter) return false;
    }
    
    return true;
  });

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const stage = over.id as Stage;
      if (STAGE_ORDER.includes(stage)) {
        const leadId = active.id as string;
        const lead = leads.find(l => l.id === leadId);
        
        // Handle conversion to client when moved to "won" stage
        if (stage === 'won' && lead && orgId && authReady) {
          try {
            // Create client from lead data - spread defaults first, then override with lead values
            const clientData: Omit<Client, 'id'> = {
              ...DEFAULT_CLIENT_FIELDS,
              userId: lead.userId,
              businessName: lead.companyName,
              primaryContactName: lead.contactName || '',
              phone: lead.phone,
              email: lead.email,
              address: lead.address,
              regionId: lead.regionId,
              regionName: lead.regionName,
              areaId: lead.areaId,
              areaName: lead.areaName,
              territoryKey: lead.territoryKey,
              ownerId: lead.userId,
              sourceType: 'deal',
              sourceDealId: lead.id,
              totalMRR: lead.mrr || 0,
              notes: lead.notes,
              createdAt: new Date(),
              updatedAt: new Date(),
              archived: false,
            };
            
            const savedClient = await createClientInFirestore(orgId, clientData, authReady);
            dispatch(addClient(savedClient));
            
            // Create client history entry
            await createClientHistoryEntry(orgId, savedClient.id, {
              clientId: savedClient.id,
              type: 'converted',
              summary: `Converted from deal: ${lead.companyName}`,
              userId: authUser?.uid,
              metadata: { sourceDealId: lead.id, sourceCompanyName: lead.companyName },
              createdAt: new Date(),
            }, authReady);
            
            // Archive the lead
            await updateLeadInFirestore(orgId, leadId, { stage: 'won', archived: true, updatedAt: new Date() }, authReady);
            dispatch(archiveLead(leadId));
            dispatch(updateLeadStage({ leadId, stage: 'won' }));
            
            toast({
              title: "Deal Won!",
              description: (
                <span>
                  {lead.companyName} is now a client.{' '}
                  <a 
                    href={`/clients?openId=${savedClient.id}`} 
                    className="underline font-medium"
                    onClick={(e) => {
                      e.preventDefault();
                      setLocation(`/clients?openId=${savedClient.id}`);
                    }}
                  >
                    View Client
                  </a>
                </span>
              ),
            });
          } catch (error) {
            console.error('Error converting lead to client:', error);
            toast({
              title: "Error",
              description: "Failed to convert deal to client. Please try again.",
              variant: "destructive",
            });
          }
        } else {
          // Normal stage update
          dispatch(updateLeadStage({ leadId, stage }));
          try {
            if (orgId && authReady) {
              // Build the Firestore update - must match Redux updateLeadStage logic
              const firestoreUpdates: Partial<Lead> = { stage, updatedAt: new Date() };
              
              // If moving to nurture stage and lead is not already in nurture, add nurture enrollment fields
              // This mirrors the auto-enrollment logic in the Redux reducer
              console.log('[Pipeline] Checking nurture enrollment:', { 
                stage, 
                leadId,
                leadNurtureMode: lead?.nurtureMode,
                hasLead: !!lead,
                condition: stage === 'nurture' && lead && lead.nurtureMode === 'none'
              });
              
              if (stage === 'nurture' && lead && lead.nurtureMode === 'none') {
                const passiveCadence = cadences.find(c => c.mode === 'passive');
                console.log('[Pipeline] Found passive cadence:', passiveCadence?.id);
                if (passiveCadence) {
                  const now = new Date();
                  firestoreUpdates.nurtureMode = 'passive';
                  firestoreUpdates.nurtureCadenceId = passiveCadence.id;
                  firestoreUpdates.nurtureStatus = 'new';
                  firestoreUpdates.nurtureStepIndex = 0;
                  firestoreUpdates.enrolledInNurtureAt = now;
                  firestoreUpdates.nextTouchAt = calculateNextTouchDate(now, 0, passiveCadence);
                  firestoreUpdates.touchesNoResponse = 0;
                  console.log('[Pipeline] Auto-enrolling in passive nurture:', { leadId, cadenceId: passiveCadence.id, firestoreUpdates });
                }
              }
              
              console.log('[Pipeline] Persisting to Firestore:', { orgId, leadId, firestoreUpdates });
              await updateLeadInFirestore(orgId, leadId, firestoreUpdates, authReady);
              console.log('[Pipeline] Firestore update successful');
            }
          } catch (error) {
            console.error('Error updating lead stage in Firestore:', error);
          }
        }
      }
    }
  };

  const handleAddLead = async () => {
    if (!newCompanyName.trim()) return;
    
    const archivedMatch = leads.find(
      l => l.archived && l.companyName.toLowerCase() === newCompanyName.toLowerCase().trim()
    );
    
    if (archivedMatch && !showArchivedWarning) {
      setMatchingArchivedLead(archivedMatch);
      setShowArchivedWarning(true);
      return;
    }
    
    // Validate territory selection
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
      if (!orgId) {
        throw new Error('Organization not found');
      }
      
      // Compute territory fields
      const territoryFields = computeTerritoryFields(newRegionId, newAreaId || null);
      
      const leadData = {
        userId: authUser?.uid || user?.id || 'demo',
        companyName: newCompanyName,
        stage: newStage,
        territory: territoryFields.regionName + (territoryFields.areaName ? ` - ${territoryFields.areaName}` : ''),
        regionId: territoryFields.regionId,
        regionName: territoryFields.regionName,
        areaId: territoryFields.areaId,
        areaName: territoryFields.areaName,
        territoryKey: territoryFields.territoryKey,
        contactName: newContactName || undefined,
        phone: newContactPhone || undefined,
        email: newContactEmail || undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        archived: false,
        ...DEFAULT_NURTURE_FIELDS,
      };
      
      const savedLead = await createLeadInFirestore(orgId, leadData, authReady);
      dispatch(addLead(savedLead));
      
      toast({
        title: "Company added",
        description: `${newCompanyName} has been saved.`,
      });
      
      setNewCompanyName('');
      setNewStage('suspect');
      setNewContactName('');
      setNewContactPhone('');
      setNewContactEmail('');
      setNewRegionId('');
      setNewAreaId('');
      setShowArchivedWarning(false);
      setMatchingArchivedLead(null);
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error('Error saving lead:', error);
      toast({
        title: "Error",
        description: "Failed to save company. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRestoreArchived = async () => {
    if (matchingArchivedLead && orgId && authReady) {
      setIsSaving(true);
      try {
        await updateLeadInFirestore(orgId, matchingArchivedLead.id, { archived: false, updatedAt: new Date() }, authReady);
        dispatch(updateLead({ ...matchingArchivedLead, archived: false, updatedAt: new Date() }));
        toast({
          title: "Company restored",
          description: `${matchingArchivedLead.companyName} has been restored.`,
        });
        setShowArchivedWarning(false);
        setMatchingArchivedLead(null);
        setNewCompanyName('');
        setIsAddDialogOpen(false);
      } catch (error) {
        console.error('Error restoring lead:', error);
        toast({
          title: "Error",
          description: "Failed to restore company. Please try again.",
          variant: "destructive",
        });
      } finally {
        setIsSaving(false);
      }
    }
  };

  const handleAddAnyway = async () => {
    // Validate territory selection
    const territoryValidation = validateTerritorySelection(newRegionId, newAreaId || null);
    if (!territoryValidation.valid) {
      toast({
        title: "Validation Error",
        description: territoryValidation.error,
        variant: "destructive",
      });
      return;
    }
    
    setShowArchivedWarning(false);
    setIsSaving(true);
    try {
      if (!orgId) {
        throw new Error('Organization not found');
      }
      
      // Compute territory fields
      const territoryFields = computeTerritoryFields(newRegionId, newAreaId || null);
      
      const leadData = {
        userId: authUser?.uid || user?.id || 'demo',
        companyName: newCompanyName,
        stage: newStage,
        territory: territoryFields.regionName + (territoryFields.areaName ? ` - ${territoryFields.areaName}` : ''),
        regionId: territoryFields.regionId,
        regionName: territoryFields.regionName,
        areaId: territoryFields.areaId,
        areaName: territoryFields.areaName,
        territoryKey: territoryFields.territoryKey,
        contactName: newContactName || undefined,
        phone: newContactPhone || undefined,
        email: newContactEmail || undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
        archived: false,
        ...DEFAULT_NURTURE_FIELDS,
      };
      const savedLead = await createLeadInFirestore(orgId, leadData, authReady);
      dispatch(addLead(savedLead));
      toast({
        title: "Company added",
        description: `${newCompanyName} has been saved.`,
      });
      setNewCompanyName('');
      setNewStage('suspect');
      setNewContactName('');
      setNewContactPhone('');
      setNewContactEmail('');
      setNewRegionId('');
      setNewAreaId('');
      setMatchingArchivedLead(null);
      setIsAddDialogOpen(false);
    } catch (error) {
      console.error('Error saving lead:', error);
      toast({
        title: "Error",
        description: "Failed to save company. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  const getLeadsByStage = (stage: Stage) => {
    return filteredLeads.filter(lead => lead.stage === stage);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Pipeline Controls */}
      <div className="flex items-center justify-between gap-4 p-4 border-b flex-wrap">
        <div className="flex items-center gap-2 flex-wrap">
          <Select value={stageFilter} onValueChange={(val) => dispatch(setStageFilter(val as Stage | 'all'))}>
            <SelectTrigger className="w-40" data-testid="select-filter-stage">
              <Filter className="h-4 w-4 mr-2" />
              <SelectValue placeholder="All Stages" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Stages</SelectItem>
              {STAGE_ORDER.map(stage => (
                <SelectItem key={stage} value={stage}>{STAGE_LABELS[stage]}</SelectItem>
              ))}
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

        <div className="flex items-center gap-2">
          <Button variant="outline" className="gap-2" data-testid="button-export">
            <Download className="h-4 w-4" />
            Export
          </Button>
          
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2" data-testid="button-add-company">
                <Plus className="h-4 w-4" />
                Add Company
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add New Company</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="company-name">Company Name</Label>
                  <Input
                    id="company-name"
                    value={newCompanyName}
                    onChange={(e) => setNewCompanyName(e.target.value)}
                    placeholder="Enter company name..."
                    data-testid="input-new-company"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="stage">Initial Stage</Label>
                  <Select value={newStage} onValueChange={(val) => setNewStage(val as Stage)}>
                    <SelectTrigger data-testid="select-new-stage">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STAGE_ORDER.map(stage => (
                        <SelectItem key={stage} value={stage}>{STAGE_LABELS[stage]}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
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
                      disabled={!newRegionId || availableNewLeadAreas.length === 0}
                    >
                      <SelectTrigger className="flex-1" data-testid="select-new-area">
                        <SelectValue placeholder={availableNewLeadAreas.length > 0 ? "Select area..." : "No areas"} />
                      </SelectTrigger>
                      <SelectContent>
                        {availableNewLeadAreas.map(area => (
                          <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="space-y-2">
                  <Label>Primary contact</Label>
                  <Input
                    value={newContactName}
                    onChange={(e) => setNewContactName(e.target.value)}
                    placeholder="Name"
                    data-testid="input-new-contact-name"
                  />
                  <Input
                    value={newContactPhone}
                    onChange={(e) => setNewContactPhone(e.target.value)}
                    placeholder="Phone"
                    data-testid="input-new-contact-phone"
                  />
                  <Input
                    value={newContactEmail}
                    onChange={(e) => setNewContactEmail(e.target.value)}
                    placeholder="Email"
                    type="email"
                    data-testid="input-new-contact-email"
                  />
                </div>
                {showArchivedWarning && matchingArchivedLead ? (
                  <div className="space-y-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-md border border-amber-200 dark:border-amber-800">
                    <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                      A company with this name was previously archived.
                    </p>
                    <p className="text-xs text-amber-700 dark:text-amber-300">
                      Would you like to restore "{matchingArchivedLead.companyName}" or add a new one?
                    </p>
                    <div className="flex gap-2">
                      <Button onClick={handleRestoreArchived} variant="outline" className="flex-1" data-testid="button-restore-archived">
                        Restore
                      </Button>
                      <Button onClick={handleAddAnyway} className="flex-1" data-testid="button-add-anyway">
                        Add New
                      </Button>
                    </div>
                  </div>
                ) : (
                  <Button onClick={handleAddLead} className="w-full" data-testid="button-confirm-add">
                    Add Company
                  </Button>
                )}
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Kanban Board */}
      <ScrollArea className="flex-1">
        <div className="p-4">
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <div className="flex gap-4 min-w-max">
              {STAGE_ORDER.slice(0, -2).map(stage => (
                <KanbanColumnExpandable
                  key={stage}
                  stage={stage}
                  leads={getLeadsByStage(stage)}
                  expandedLeadId={expandedLeadId}
                  onLeadToggle={setExpandedLeadId}
                  onAddLead={() => {
                    setNewStage(stage);
                    setIsAddDialogOpen(true);
                  }}
                />
              ))}
            </div>
          </DndContext>
        </div>
        <ScrollBar orientation="horizontal" />
      </ScrollArea>
    </div>
  );
}
