import { useState, useRef } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { X, ChevronLeft, ChevronRight, Archive, Trash2, Phone, Mail, ExternalLink, Copy, Mic, Calendar, MessageSquare, ThumbsDown } from 'lucide-react';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { RootState, toggleDrawer, updateLead, updateLeadStage, addActivity, archiveLead, deleteLead } from '@/store';
import { Lead, Stage, STAGE_LABELS, STAGE_ORDER, ActivityType, calculateNextTouchDate } from '@/lib/types';
import { TERRITORY_CONFIG, getAreasForRegion, computeTerritoryFields, getTerritoryDisplayName } from '@/lib/territoryConfig';
import { countActivitiesByType } from '@/lib/mockData';
import ActivityButton from './ActivityButton';
import TrafficLight from './TrafficLight';
import { getTrafficLightStatus } from '@/lib/types';
import { format } from 'date-fns';
import { v4 as uuidv4 } from 'uuid';
import { useAuth } from '@/contexts/AuthContext';
import { logPipelineAction, createRejectedBusiness, deleteLeadFromFirestore, updateLeadInFirestore } from '@/lib/firestoreService';
import { queryClient } from '@/lib/queryClient';
import { useToast } from '@/hooks/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';

const NEPQ_LABELS = [
  'Situation Aware',
  'Problem Aware',
  'Consequence Aware',
  'Solution Aware',
  'Commitment Ready',
];

export default function LeadDrawer() {
  const dispatch = useDispatch();
  const { orgId, authReady, user } = useAuth();
  const { toast } = useToast();
  const isOpen = useSelector((state: RootState) => state.app.isDrawerOpen);
  const selectedLeadId = useSelector((state: RootState) => state.app.selectedLeadId);
  const leads = useSelector((state: RootState) => state.app.leads);
  const cadences = useSelector((state: RootState) => state.app.cadences);
  const lead = leads.find(l => l.id === selectedLeadId);
  const [isRecording, setIsRecording] = useState(false);
  const [isMarkingNotInterested, setIsMarkingNotInterested] = useState(false);
  const [notInterestedReason, setNotInterestedReason] = useState('');

  if (!lead) return null;

  const activityCounts = countActivitiesByType(lead.id);
  const trafficStatus = getTrafficLightStatus(lead);

  const handleClose = () => {
    dispatch(toggleDrawer(false));
  };

  const handleStageChange = async (stage: Stage) => {
    dispatch(updateLeadStage({ leadId: lead.id, stage }));
    
    // Persist to Firestore with nurture enrollment if moving to nurture stage
    if (orgId && authReady) {
      try {
        const firestoreUpdates: Partial<Lead> = { stage, updatedAt: new Date() };
        
        if (stage === 'nurture' && (!lead.nurtureMode || lead.nurtureMode === 'none')) {
          const passiveCadence = cadences.find(c => c.mode === 'passive');
          if (passiveCadence) {
            const now = new Date();
            firestoreUpdates.nurtureMode = 'passive';
            firestoreUpdates.nurtureCadenceId = passiveCadence.id;
            firestoreUpdates.nurtureStatus = 'new';
            firestoreUpdates.nurtureStepIndex = 0;
            firestoreUpdates.enrolledInNurtureAt = now;
            firestoreUpdates.nextTouchAt = calculateNextTouchDate(now, 0, passiveCadence);
            firestoreUpdates.touchesNoResponse = 0;
          }
        }
        
        await updateLeadInFirestore(orgId, lead.id, firestoreUpdates, authReady);
      } catch (error) {
        console.error('Error updating lead stage:', error);
      }
    }
  };

  const handleMoveStage = async (direction: 'left' | 'right') => {
    const currentIndex = STAGE_ORDER.indexOf(lead.stage);
    const newIndex = direction === 'left' ? currentIndex - 1 : currentIndex + 1;
    if (newIndex >= 0 && newIndex < STAGE_ORDER.length) {
      const newStage = STAGE_ORDER[newIndex];
      dispatch(updateLeadStage({ leadId: lead.id, stage: newStage }));
      
      // Persist to Firestore with nurture enrollment if moving to nurture stage
      if (orgId && authReady) {
        try {
          const firestoreUpdates: Partial<Lead> = { stage: newStage, updatedAt: new Date() };
          
          if (newStage === 'nurture' && (!lead.nurtureMode || lead.nurtureMode === 'none')) {
            const passiveCadence = cadences.find(c => c.mode === 'passive');
            if (passiveCadence) {
              const now = new Date();
              firestoreUpdates.nurtureMode = 'passive';
              firestoreUpdates.nurtureCadenceId = passiveCadence.id;
              firestoreUpdates.nurtureStatus = 'new';
              firestoreUpdates.nurtureStepIndex = 0;
              firestoreUpdates.enrolledInNurtureAt = now;
              firestoreUpdates.nextTouchAt = calculateNextTouchDate(now, 0, passiveCadence);
              firestoreUpdates.touchesNoResponse = 0;
            }
          }
          
          await updateLeadInFirestore(orgId, lead.id, firestoreUpdates, authReady);
        } catch (error) {
          console.error('Error updating lead stage:', error);
        }
      }
    }
  };

  const handleLogActivity = async (type: ActivityType) => {
    // Update Redux for immediate UI feedback
    dispatch(addActivity({
      id: uuidv4(),
      userId: lead.userId,
      leadId: lead.id,
      type,
      createdAt: new Date(),
    }));
    
    // Create task in Firestore for Daily Plan integration
    if (orgId && authReady && user) {
      try {
        // Use lead.userId for proper Daily Plan attribution (not logged-in user)
        await logPipelineAction(orgId, {
          userId: lead.userId,
          leadId: lead.id,
          type,
          leadName: lead.companyName || lead.contactName,
        }, authReady);
        
        // Invalidate all Daily Plan queries (partial match)
        queryClient.invalidateQueries({ queryKey: ['/plan-tasks', orgId] });
        
        toast({ title: `${type.charAt(0).toUpperCase() + type.slice(1)} logged`, description: 'Task added to Daily Plan' });
      } catch (error) {
        console.error('Failed to log pipeline action to Daily Plan:', error);
      }
    }
  };

  const firestoreDebounceRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});

  const handleUpdateField = (field: keyof Lead, value: any) => {
    dispatch(updateLead({ ...lead, [field]: value, updatedAt: new Date() }));

    if (orgId && authReady) {
      if (firestoreDebounceRef.current[field]) {
        clearTimeout(firestoreDebounceRef.current[field]);
      }
      firestoreDebounceRef.current[field] = setTimeout(() => {
        updateLeadInFirestore(orgId, lead.id, { [field]: value, updatedAt: new Date() }, authReady)
          .catch(err => console.error(`[LeadDrawer] Failed to persist ${field} to Firestore:`, err));
        delete firestoreDebounceRef.current[field];
      }, 800);
    }
  };

  const handleMarkContactedToday = async () => {
    const now = new Date();
    dispatch(updateLead({
      ...lead,
      lastContactDate: now,
      updatedAt: now,
    }));
    if (orgId && authReady) {
      try {
        await updateLeadInFirestore(orgId, lead.id, { lastContactDate: now, updatedAt: now }, authReady);
      } catch (err) {
        console.error('[LeadDrawer] Failed to persist lastContactDate to Firestore:', err);
      }
    }
  };

  const handleArchive = async () => {
    dispatch(archiveLead(lead.id));
    if (orgId && authReady) {
      try {
        await updateLeadInFirestore(orgId, lead.id, { archived: true, updatedAt: new Date() }, authReady);
      } catch (err) {
        console.error('[LeadDrawer] Failed to persist archive to Firestore:', err);
      }
    }
    handleClose();
  };

  const handleDelete = async () => {
    if (!orgId || !authReady) {
      toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
      return;
    }
    try {
      await deleteLeadFromFirestore(orgId, lead.id, authReady);
      dispatch(deleteLead(lead.id));
      handleClose();
    } catch (error) {
      console.error('[LeadDrawer] Error deleting lead:', error);
      toast({ title: 'Error', description: 'Failed to delete deal', variant: 'destructive' });
    }
  };

  const handleMarkNotInterested = async () => {
    if (!orgId || !authReady) {
      toast({ title: 'Error', description: 'Not authenticated', variant: 'destructive' });
      return;
    }
    
    setIsMarkingNotInterested(true);
    try {
      await createRejectedBusiness(orgId, {
        businessName: lead.companyName,
        phone: lead.phone,
        email: lead.email,
        address: lead.address,
        googlePlaceId: lead.sourceData?.googlePlaceId,
        abn: lead.sourceData?.abn,
        reason: notInterestedReason || 'Not interested',
        rejectedAt: new Date(),
        rejectedBy: user?.uid || 'user',
        originalLeadId: lead.id,
      }, authReady);
      
      await deleteLeadFromFirestore(orgId, lead.id, authReady);
      dispatch(deleteLead(lead.id));
      
      toast({ 
        title: 'Marked as not interested', 
        description: 'This business will be flagged if you try to add them again' 
      });
      setNotInterestedReason('');
      handleClose();
    } catch (error) {
      console.error('[LeadDrawer] Error marking not interested:', error);
      toast({ title: 'Error', description: 'Failed to mark as not interested', variant: 'destructive' });
    } finally {
      setIsMarkingNotInterested(false);
    }
  };

  const toggleRecording = () => {
    setIsRecording(!isRecording);
    // todo: implement speech-to-text
    console.log(isRecording ? 'Stopped recording' : 'Started recording');
  };

  return (
    <Sheet open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <SheetContent className="w-96 sm:w-[450px] overflow-y-auto" data-testid="drawer-lead">
        <SheetHeader className="sticky top-0 z-10 bg-background pb-4 border-b -mx-6 px-6 -mt-6 pt-6">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <TrafficLight status={trafficStatus} size="md" />
              <SheetTitle className="truncate" data-testid="text-drawer-title">
                {lead.companyName}
              </SheetTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={handleClose} data-testid="button-close-drawer">
              <X className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        <div className="space-y-6 py-6">
          {/* Stage Controls */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleMoveStage('left')}
                disabled={STAGE_ORDER.indexOf(lead.stage) === 0}
                data-testid="button-move-left"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <Select value={lead.stage} onValueChange={(val) => handleStageChange(val as Stage)}>
                <SelectTrigger className="flex-1" data-testid="select-stage">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {STAGE_ORDER.map((stage) => (
                    <SelectItem key={stage} value={stage}>
                      {STAGE_LABELS[stage]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                variant="outline"
                size="icon"
                onClick={() => handleMoveStage('right')}
                disabled={STAGE_ORDER.indexOf(lead.stage) === STAGE_ORDER.length - 1}
                data-testid="button-move-right"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* MRR */}
          <div className="space-y-2">
            <Label htmlFor="mrr">Monthly Recurring Revenue</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="mrr"
                type="number"
                value={lead.mrr || ''}
                onChange={(e) => handleUpdateField('mrr', e.target.value ? Number(e.target.value) : undefined)}
                className="pl-7"
                placeholder="0"
                data-testid="input-mrr"
              />
            </div>
          </div>

          <Separator />

          {/* Territory */}
          <div className="space-y-2">
            <Label>Territory</Label>
            <div className="flex gap-2">
              <Select 
                value={lead.regionId || ''} 
                onValueChange={(val) => {
                  const fields = computeTerritoryFields(val, null);
                  const updates = {
                    regionId: fields.regionId,
                    regionName: fields.regionName,
                    areaId: null,
                    areaName: null,
                    territoryKey: fields.territoryKey,
                    territory: fields.regionName,
                    updatedAt: new Date(),
                  };
                  dispatch(updateLead({ ...lead, ...updates }));
                  if (orgId && authReady) {
                    updateLeadInFirestore(orgId, lead.id, updates, authReady)
                      .catch(err => console.error('[LeadDrawer] Failed to persist territory to Firestore:', err));
                  }
                }}
              >
                <SelectTrigger className="flex-1" data-testid="select-edit-region">
                  <SelectValue placeholder="Select region..." />
                </SelectTrigger>
                <SelectContent>
                  {TERRITORY_CONFIG.map(region => (
                    <SelectItem key={region.id} value={region.id}>{region.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select 
                value={lead.areaId || ''} 
                onValueChange={(val) => {
                  if (lead.regionId) {
                    const fields = computeTerritoryFields(lead.regionId, val);
                    const updates = {
                      areaId: fields.areaId,
                      areaName: fields.areaName,
                      territoryKey: fields.territoryKey,
                      territory: getTerritoryDisplayName(lead.regionId, val),
                      updatedAt: new Date(),
                    };
                    dispatch(updateLead({ ...lead, ...updates }));
                    if (orgId && authReady) {
                      updateLeadInFirestore(orgId, lead.id, updates, authReady)
                        .catch(err => console.error('[LeadDrawer] Failed to persist area to Firestore:', err));
                    }
                  }
                }}
                disabled={!lead.regionId || getAreasForRegion(lead.regionId || '').length === 0}
              >
                <SelectTrigger className="flex-1" data-testid="select-edit-area">
                  <SelectValue placeholder={lead.regionId && getAreasForRegion(lead.regionId).length > 0 ? "Select area..." : "No areas"} />
                </SelectTrigger>
                <SelectContent>
                  {getAreasForRegion(lead.regionId || '').map(area => (
                    <SelectItem key={area.id} value={area.id}>{area.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <Separator />

          {/* Activity Logging */}
          <div className="space-y-3">
            <Label>Log Activity</Label>
            <div className="grid grid-cols-2 gap-2">
              <ActivityButton type="call" count={activityCounts.call} onLog={() => handleLogActivity('call')} />
              <ActivityButton type="email" count={activityCounts.email} onLog={() => handleLogActivity('email')} />
              <ActivityButton type="sms" count={activityCounts.sms} onLog={() => handleLogActivity('sms')} />
              <ActivityButton type="meeting" count={activityCounts.meeting} onLog={() => handleLogActivity('meeting')} />
              <ActivityButton type="dropin" count={activityCounts.dropin} onLog={() => handleLogActivity('dropin')} />
            </div>
          </div>

          <Separator />

          {/* NEPQ Label */}
          <div className="space-y-2">
            <Label>NEPQ Label</Label>
            <Select value={lead.nepqLabel || ''} onValueChange={(val) => handleUpdateField('nepqLabel', val || undefined)}>
              <SelectTrigger data-testid="select-nepq">
                <SelectValue placeholder="Select label..." />
              </SelectTrigger>
              <SelectContent>
                {NEPQ_LABELS.map((label) => (
                  <SelectItem key={label} value={label}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Primary Contact */}
          <div className="space-y-3">
            <Label>Primary Contact</Label>
            <Input
              value={lead.contactName || ''}
              onChange={(e) => handleUpdateField('contactName', e.target.value)}
              placeholder="Contact name"
              data-testid="input-contact-name"
            />
            <div className="flex items-center gap-2">
              <Input
                value={lead.phone || ''}
                onChange={(e) => handleUpdateField('phone', e.target.value)}
                placeholder="Phone"
                className="flex-1"
                data-testid="input-phone"
              />
              {lead.phone && (
                <>
                  <Button variant="outline" size="icon" asChild>
                    <a href={`tel:${lead.phone}`} data-testid="button-call">
                      <Phone className="h-4 w-4" />
                    </a>
                  </Button>
                  <Button variant="outline" size="icon" asChild>
                    <a href={`sms:${lead.phone}`} data-testid="button-sms">
                      <MessageSquare className="h-4 w-4" />
                    </a>
                  </Button>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              <Input
                value={lead.email || ''}
                onChange={(e) => handleUpdateField('email', e.target.value)}
                placeholder="Email"
                className="flex-1"
                data-testid="input-email"
              />
              {lead.email && (
                <Button variant="outline" size="icon" asChild>
                  <a href={`mailto:${lead.email}`} data-testid="button-email">
                    <Mail className="h-4 w-4" />
                  </a>
                </Button>
              )}
            </div>
          </div>

          <Separator />

          {/* CRM Link */}
          <div className="space-y-2">
            <Label>CRM Link</Label>
            <div className="flex items-center gap-2">
              <Input
                value={lead.crmLink || ''}
                onChange={(e) => handleUpdateField('crmLink', e.target.value)}
                placeholder="Paste CRM link..."
                className="flex-1"
                data-testid="input-crm-link"
              />
              {lead.crmLink && (
                <>
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => navigator.clipboard.writeText(lead.crmLink!)}
                    data-testid="button-copy-crm"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="icon" asChild>
                    <a href={lead.crmLink} target="_blank" rel="noopener noreferrer" data-testid="button-open-crm">
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  </Button>
                </>
              )}
            </div>
          </div>

          <Separator />

          {/* Notes */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Notes</Label>
              <Button
                variant={isRecording ? 'destructive' : 'ghost'}
                size="sm"
                onClick={toggleRecording}
                className="gap-1"
                data-testid="button-dictation"
              >
                <Mic className="h-3 w-3" />
                {isRecording ? 'Stop' : 'Dictate'}
              </Button>
            </div>
            <Textarea
              value={lead.notes || ''}
              onChange={(e) => handleUpdateField('notes', e.target.value)}
              placeholder="Add notes..."
              rows={4}
              data-testid="textarea-notes"
            />
          </div>

          <Separator />

          {/* Next Contact Date */}
          <div className="space-y-2">
            <Label>Next Contact Date</Label>
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="flex-1 justify-start gap-2" data-testid="button-date-picker">
                    <Calendar className="h-4 w-4" />
                    {lead.nextContactDate
                      ? format(new Date(lead.nextContactDate), 'PPP')
                      : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <CalendarComponent
                    mode="single"
                    selected={lead.nextContactDate ? new Date(lead.nextContactDate) : undefined}
                    onSelect={(date) => handleUpdateField('nextContactDate', date)}
                  />
                </PopoverContent>
              </Popover>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleMarkContactedToday}
              className="w-full"
              data-testid="button-mark-contacted"
            >
              Mark Contacted Today
            </Button>
          </div>

          <Separator />

          {/* Actions */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center gap-2">
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="outline" className="flex-1 gap-2" data-testid="button-archive">
                    <Archive className="h-4 w-4" />
                    Archive
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Archive this lead?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This will move the lead to the archive. You can restore it later.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleArchive}>Archive</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>

              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="destructive" className="flex-1 gap-2" data-testid="button-delete">
                    <Trash2 className="h-4 w-4" />
                    Delete
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete this lead?</AlertDialogTitle>
                    <AlertDialogDescription>
                      This action cannot be undone. The lead and all associated data will be permanently deleted.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancel</AlertDialogCancel>
                    <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </div>

            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button 
                  variant="outline" 
                  className="w-full gap-2 text-amber-600 border-amber-200 hover:bg-amber-50 dark:border-amber-800 dark:hover:bg-amber-900/30" 
                  disabled={isMarkingNotInterested}
                  data-testid="button-not-interested"
                >
                  <ThumbsDown className="h-4 w-4" />
                  {isMarkingNotInterested ? 'Saving...' : 'Not Interested'}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Mark as Not Interested?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will remove the lead and flag the business so you'll be warned if you try to add them again.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <div className="py-4">
                  <Label htmlFor="drawer-not-interested-reason" className="text-sm">Reason (optional)</Label>
                  <Textarea
                    id="drawer-not-interested-reason"
                    placeholder="e.g., Already has marketing agency, not a good fit..."
                    value={notInterestedReason}
                    onChange={(e) => setNotInterestedReason(e.target.value)}
                    className="mt-2"
                  />
                </div>
                <AlertDialogFooter>
                  <AlertDialogCancel disabled={isMarkingNotInterested}>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleMarkNotInterested} disabled={isMarkingNotInterested}>
                    <ThumbsDown className="h-4 w-4 mr-2" />
                    Not Interested
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
