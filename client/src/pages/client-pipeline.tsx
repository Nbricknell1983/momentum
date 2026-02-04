import { useState, useEffect, useMemo } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useSearch } from 'wouter';
import { DndContext, DragEndEvent, DragOverEvent, closestCenter, PointerSensor, useSensor, useSensors, DragOverlay } from '@dnd-kit/core';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { Filter, Loader2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { RootState, updateClient, setRegionFilter, setAreaFilter } from '@/store';
import { Client, ClientBoardStage, CLIENT_BOARD_STAGE_ORDER, CLIENT_BOARD_STAGE_LABELS, CLIENT_BOARD_STAGE_COLORS, getDefaultClientBoardStage } from '@/lib/types';
import { TERRITORY_CONFIG, getAreasForRegion } from '@/lib/territoryConfig';
import ClientPipelineCard from '@/components/ClientPipelineCard';
import { ScrollArea, ScrollBar } from '@/components/ui/scroll-area';
import { updateClientInFirestore, createClientHistoryEntry } from '@/lib/firestoreService';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { useDroppable } from '@dnd-kit/core';
import { Badge } from '@/components/ui/badge';

interface ClientPipelineColumnProps {
  stage: ClientBoardStage;
  clients: Client[];
  expandedClientId: string | null;
  onClientToggle: (clientId: string | null) => void;
}

function ClientPipelineColumn({ stage, clients, expandedClientId, onClientToggle }: ClientPipelineColumnProps) {
  const { setNodeRef, isOver } = useDroppable({ id: stage });
  const stageColor = CLIENT_BOARD_STAGE_COLORS[stage];
  const totalMRR = clients.reduce((sum, c) => sum + (c.totalMRR || 0), 0);

  return (
    <div
      ref={setNodeRef}
      className={`flex flex-col min-w-72 max-w-80 bg-muted/50 rounded-lg ${
        isOver ? 'ring-2 ring-primary ring-dashed' : ''
      }`}
      data-testid={`column-client-pipeline-${stage}`}
    >
      <div className="sticky top-0 z-10 p-3 bg-muted/80 backdrop-blur rounded-t-lg border-b">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${stageColor}`} />
            <h3 className="font-semibold text-sm">{CLIENT_BOARD_STAGE_LABELS[stage]}</h3>
            <Badge variant="secondary" className="text-xs px-2 py-0.5 rounded-full">
              {clients.length}
            </Badge>
          </div>
        </div>
        {totalMRR > 0 && (
          <p className="text-xs text-muted-foreground mt-1">
            ${totalMRR.toLocaleString()}/mo
          </p>
        )}
      </div>
      <ScrollArea className="flex-1 p-3">
        <SortableContext items={clients.map(c => c.id)} strategy={verticalListSortingStrategy}>
          <div className="flex flex-col gap-3">
            {clients.map((client) => (
              <ClientPipelineCard
                key={client.id}
                client={client}
                isExpanded={expandedClientId === client.id}
                onToggle={() => onClientToggle(expandedClientId === client.id ? null : client.id)}
              />
            ))}
            {clients.length === 0 && (
              <div className="py-8 text-center text-sm text-muted-foreground">
                No clients in this stage
              </div>
            )}
          </div>
        </SortableContext>
      </ScrollArea>
    </div>
  );
}

export default function ClientPipelinePage() {
  const dispatch = useDispatch();
  const clients = useSelector((state: RootState) => state.app.clients);
  const searchQuery = useSelector((state: RootState) => state.app.searchQuery);
  const regionFilter = useSelector((state: RootState) => state.app.regionFilter);
  const areaFilter = useSelector((state: RootState) => state.app.areaFilter);
  const { toast } = useToast();
  const { user: authUser, orgId, authReady } = useAuth();
  
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const searchString = useSearch();

  useEffect(() => {
    if (clients.length === 0) return;
    
    const params = new URLSearchParams(searchString);
    const openId = params.get('openId');
    
    if (openId) {
      const matchingClient = clients.find(c => c.id === openId);
      if (matchingClient) {
        setExpandedClientId(openId);
        window.history.replaceState(null, '', '/client-pipeline');
      }
    }
  }, [searchString, clients]);

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  const availableFilterAreas = regionFilter !== 'all' ? getAreasForRegion(regionFilter) : [];

  const filteredClients = clients.filter(client => {
    if (client.archived) return false;
    if (searchQuery && !client.businessName.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    
    if (regionFilter !== 'all') {
      if (client.regionId !== regionFilter) return false;
      if (areaFilter !== 'all' && client.areaId !== areaFilter) return false;
    }
    
    return true;
  });

  const getClientBoardStage = (client: Client): ClientBoardStage => {
    return client.boardStage || getDefaultClientBoardStage(client);
  };

  const clientsByStage = CLIENT_BOARD_STAGE_ORDER.reduce((acc, stage) => {
    acc[stage] = filteredClients.filter(c => getClientBoardStage(c) === stage);
    return acc;
  }, {} as Record<ClientBoardStage, Client[]>);

  const findColumnForClient = (clientId: string): ClientBoardStage | null => {
    for (const stage of CLIENT_BOARD_STAGE_ORDER) {
      if (clientsByStage[stage].some(c => c.id === clientId)) {
        return stage;
      }
    }
    return null;
  };

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    
    if (!over) return;

    const activeId = active.id as string;
    const overId = over.id as string;
    
    let newStage: ClientBoardStage | null = null;

    if (CLIENT_BOARD_STAGE_ORDER.includes(overId as ClientBoardStage)) {
      newStage = overId as ClientBoardStage;
    } else {
      newStage = findColumnForClient(overId);
    }

    if (newStage) {
      const clientId = activeId;
      const client = clients.find(c => c.id === clientId);
      const currentStage = client ? getClientBoardStage(client) : null;
      
      if (currentStage === newStage) return;
      
      if (client && orgId && authReady) {
        setIsLoading(true);
        try {
          const oldStage = getClientBoardStage(client);
          const updates = { 
            boardStage: newStage, 
            updatedAt: new Date() 
          };
          
          dispatch(updateClient({ ...client, ...updates }));
          await updateClientInFirestore(orgId, clientId, updates, authReady);
          
          await createClientHistoryEntry(orgId, clientId, {
            clientId,
            type: 'activity',
            summary: `Moved from ${CLIENT_BOARD_STAGE_LABELS[oldStage]} to ${CLIENT_BOARD_STAGE_LABELS[newStage]}`,
            userId: authUser?.uid,
            metadata: { fromStage: oldStage, toStage: newStage },
            createdAt: new Date(),
          }, authReady);
          
          toast({
            title: 'Client moved',
            description: `${client.businessName} moved to ${CLIENT_BOARD_STAGE_LABELS[newStage]}`,
          });
        } catch (error) {
          console.error('Error moving client:', error);
          toast({
            title: 'Error',
            description: 'Failed to move client. Please try again.',
            variant: 'destructive',
          });
        } finally {
          setIsLoading(false);
        }
      }
    }
  };

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between gap-4 p-4 border-b shrink-0">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-bold" data-testid="text-page-title">Client Pipeline</h1>
          {isLoading && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        </div>
        
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <Select value={regionFilter} onValueChange={(val) => {
            dispatch(setRegionFilter(val));
            dispatch(setAreaFilter('all'));
          }}>
            <SelectTrigger className="w-40" data-testid="select-region-filter">
              <SelectValue placeholder="All Regions" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Regions</SelectItem>
              {TERRITORY_CONFIG.map((region) => (
                <SelectItem key={region.id} value={region.id}>
                  {region.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          
          {availableFilterAreas.length > 0 && (
            <Select value={areaFilter} onValueChange={(val) => dispatch(setAreaFilter(val))}>
              <SelectTrigger className="w-40" data-testid="select-area-filter">
                <SelectValue placeholder="All Areas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Areas</SelectItem>
                {availableFilterAreas.map((area) => (
                  <SelectItem key={area.id} value={area.id}>
                    {area.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          )}
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <ScrollArea className="h-full">
            <div className="flex gap-4 p-4 min-h-full">
              {CLIENT_BOARD_STAGE_ORDER.map((stage) => (
                <ClientPipelineColumn
                  key={stage}
                  stage={stage}
                  clients={clientsByStage[stage]}
                  expandedClientId={expandedClientId}
                  onClientToggle={setExpandedClientId}
                />
              ))}
            </div>
            <ScrollBar orientation="horizontal" />
          </ScrollArea>
        </DndContext>
      </div>
    </div>
  );
}
