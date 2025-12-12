import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { DndContext, DragEndEvent, closestCenter, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { Plus, Filter, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { RootState, updateLeadStage, addLead, setStageFilter, setTerritoryFilter } from '@/store';
import { Stage, STAGE_ORDER, STAGE_LABELS, Lead } from '@/lib/types';
import KanbanColumnExpandable from '@/components/KanbanColumnExpandable';
import { v4 as uuidv4 } from 'uuid';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';

export default function PipelinePage() {
  const dispatch = useDispatch();
  const leads = useSelector((state: RootState) => state.app.leads);
  const searchQuery = useSelector((state: RootState) => state.app.searchQuery);
  const stageFilter = useSelector((state: RootState) => state.app.stageFilter);
  const territoryFilter = useSelector((state: RootState) => state.app.territoryFilter);
  const user = useSelector((state: RootState) => state.app.user);
  
  const [expandedLeadId, setExpandedLeadId] = useState<string | null>(null);
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newStage, setNewStage] = useState<Stage>('suspect');
  const [newContactName, setNewContactName] = useState('');
  const [newContactPhone, setNewContactPhone] = useState('');
  const [newContactEmail, setNewContactEmail] = useState('');

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  // Filter leads
  const filteredLeads = leads.filter(lead => {
    if (lead.archived) return false;
    if (searchQuery && !lead.companyName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    if (stageFilter !== 'all' && lead.stage !== stageFilter) return false;
    if (territoryFilter !== 'all' && lead.territory !== territoryFilter) return false;
    return true;
  });

  // Get unique territories
  const territories = Array.from(new Set(leads.map(l => l.territory).filter(Boolean)));

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (over && active.id !== over.id) {
      const stage = over.id as Stage;
      if (STAGE_ORDER.includes(stage)) {
        dispatch(updateLeadStage({ leadId: active.id as string, stage }));
      }
    }
  };

  const handleAddLead = () => {
    if (!newCompanyName.trim()) return;
    
    const newLead: Lead = {
      id: uuidv4(),
      userId: user?.id || 'demo',
      companyName: newCompanyName,
      stage: newStage,
      territory: user?.territory || '',
      contactName: newContactName || undefined,
      phone: newContactPhone || undefined,
      email: newContactEmail || undefined,
      createdAt: new Date(),
      updatedAt: new Date(),
      archived: false,
    };
    
    dispatch(addLead(newLead));
    setNewCompanyName('');
    setNewStage('suspect');
    setNewContactName('');
    setNewContactPhone('');
    setNewContactEmail('');
    setIsAddDialogOpen(false);
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
          
          <Select value={territoryFilter} onValueChange={(val) => dispatch(setTerritoryFilter(val))}>
            <SelectTrigger className="w-40" data-testid="select-filter-territory">
              <SelectValue placeholder="All Territories" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Territories</SelectItem>
              {territories.map(territory => (
                <SelectItem key={territory} value={territory!}>{territory}</SelectItem>
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
                <Button onClick={handleAddLead} className="w-full" data-testid="button-confirm-add">
                  Add Company
                </Button>
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
