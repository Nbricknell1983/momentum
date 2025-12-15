import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { useLocation } from 'wouter';
import { useAuth } from '@/contexts/AuthContext';
import {
  Phone, MessageSquare, Mail, Calendar, Building2, Search,
  CheckCircle2, X, Copy, ChevronDown, ChevronUp, ExternalLink
} from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { RootState } from '@/store';
import { completeNBAAction, dismissNBAAction } from '@/store';
import { NBAAction, NBAActionType, NBA_ACTION_LABELS, Lead } from '@/lib/types';
import { useToast } from '@/hooks/use-toast';
import { 
  completeNBAAction as completeNBAActionFirestore, 
  dismissNBAAction as dismissNBAActionFirestore,
  createActivity 
} from '@/lib/firestoreService';

interface ActionQueueCardProps {
  maxItems?: number;
  showHeader?: boolean;
  onViewLead?: (leadId: string) => void;
}

export default function ActionQueueCard({ 
  maxItems = 10, 
  showHeader = true,
  onViewLead 
}: ActionQueueCardProps) {
  const dispatch = useDispatch();
  const [, setLocation] = useLocation();
  const { toast } = useToast();
  
  const nbaQueue = useSelector((state: RootState) => state.app.nbaQueue);
  const leads = useSelector((state: RootState) => state.app.leads);
  const focusMode = useSelector((state: RootState) => state.app.focusMode);
  const { orgId, authReady, user } = useAuth();
  
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [dismissDialogOpen, setDismissDialogOpen] = useState(false);
  const [dismissingAction, setDismissingAction] = useState<NBAAction | null>(null);
  const [dismissReason, setDismissReason] = useState('');

  const openActions = nbaQueue
    .filter(a => a.status === 'open')
    .slice(0, maxItems);

  const focusActions = focusMode?.enabled
    ? openActions.filter(a => focusMode.topActionIds.includes(a.id))
    : openActions;

  const displayActions = focusMode?.enabled ? focusActions : openActions;

  const getLeadForAction = (action: NBAAction): Lead | undefined => {
    return leads.find(l => l.id === action.targetId);
  };

  const getActionIcon = (type: NBAActionType) => {
    switch (type) {
      case 'call': return <Phone className="h-4 w-4" />;
      case 'sms': return <MessageSquare className="h-4 w-4" />;
      case 'email': return <Mail className="h-4 w-4" />;
      case 'meeting': return <Calendar className="h-4 w-4" />;
      case 'dropin': return <Building2 className="h-4 w-4" />;
      case 'research': return <Search className="h-4 w-4" />;
      case 'proposal': return <Mail className="h-4 w-4" />;
      case 'followup': return <Phone className="h-4 w-4" />;
      default: return <Phone className="h-4 w-4" />;
    }
  };

  const getActionButtonLabel = (type: NBAActionType): string => {
    switch (type) {
      case 'call': return 'Call';
      case 'sms': return 'Text';
      case 'email': return 'Email';
      case 'meeting': return 'Book';
      case 'dropin': return 'Visit';
      case 'research': return 'Research';
      case 'proposal': return 'Send';
      case 'followup': return 'Follow Up';
      default: return 'Action';
    }
  };

  const handlePrimaryAction = (action: NBAAction, lead: Lead | undefined) => {
    if (!lead) return;
    
    switch (action.suggestedActionType) {
      case 'call':
        if (lead.phone) {
          window.location.href = `tel:${lead.phone}`;
        }
        break;
      case 'sms':
        if (lead.phone) {
          const message = encodeURIComponent(action.suggestedMessage || '');
          window.location.href = `sms:${lead.phone}?body=${message}`;
        }
        break;
      case 'email':
        if (lead.email) {
          const subject = encodeURIComponent(action.suggestedEmail?.subject || '');
          const body = encodeURIComponent(action.suggestedEmail?.body || action.suggestedMessage || '');
          window.location.href = `mailto:${lead.email}?subject=${subject}&body=${body}`;
        }
        break;
      case 'meeting':
      case 'dropin':
      case 'proposal':
      case 'followup':
      case 'research':
        if (onViewLead) {
          onViewLead(action.targetId);
        } else {
          setLocation(`/pipeline?openType=${action.targetType}&openId=${action.targetId}`);
        }
        break;
    }
  };

  const handleComplete = async (action: NBAAction) => {
    dispatch(completeNBAAction(action.id));
    toast({ 
      title: 'Action completed', 
      description: `+${action.points} points earned!` 
    });
    
    if (orgId && authReady) {
      try {
        await completeNBAActionFirestore(orgId, action.id, authReady);
        
        if (action.targetType === 'lead' && action.targetId && user) {
          await createActivity(orgId, {
            userId: user.uid,
            leadId: action.targetId,
            type: 'nba_completed',
            notes: `Completed action: ${action.title}`,
            metadata: {
              actionType: action.suggestedActionType,
              actionId: action.id,
              points: action.points,
            },
            createdAt: new Date(),
          }, authReady);
        }
      } catch (error) {
        console.error('[NBA] Failed to sync completion to Firestore:', error);
      }
    }
  };

  const handleDismissClick = async (action: NBAAction) => {
    if (focusMode?.enabled) {
      setDismissingAction(action);
      setDismissDialogOpen(true);
    } else {
      const reason = 'Dismissed by user';
      dispatch(dismissNBAAction({ id: action.id, reason }));
      toast({ title: 'Action dismissed', description: 'This action is suppressed for 48 hours.' });
      
      if (orgId && authReady) {
        try {
          await dismissNBAActionFirestore(orgId, action.id, reason, authReady);
          
          if (action.targetType === 'lead' && action.targetId && user) {
            await createActivity(orgId, {
              userId: user.uid,
              leadId: action.targetId,
              type: 'nba_dismissed',
              notes: `Dismissed action: ${action.title}`,
              metadata: {
                actionType: action.suggestedActionType,
                actionId: action.id,
                reason,
              },
              createdAt: new Date(),
            }, authReady);
          }
        } catch (error) {
          console.error('[NBA] Failed to sync dismissal to Firestore:', error);
        }
      }
    }
  };

  const handleDismissConfirm = async () => {
    if (dismissingAction) {
      const reason = dismissReason || 'No reason provided';
      dispatch(dismissNBAAction({ 
        id: dismissingAction.id, 
        reason 
      }));
      toast({ title: 'Action dismissed', description: 'This action is suppressed for 48 hours.' });
      
      if (orgId && authReady) {
        try {
          await dismissNBAActionFirestore(orgId, dismissingAction.id, reason, authReady);
          
          if (dismissingAction.targetType === 'lead' && dismissingAction.targetId && user) {
            await createActivity(orgId, {
              userId: user.uid,
              leadId: dismissingAction.targetId,
              type: 'nba_dismissed',
              notes: `Dismissed action: ${dismissingAction.title}`,
              metadata: {
                actionType: dismissingAction.suggestedActionType,
                actionId: dismissingAction.id,
                reason,
              },
              createdAt: new Date(),
            }, authReady);
          }
        } catch (error) {
          console.error('[NBA] Failed to sync dismissal to Firestore:', error);
        }
      }
    }
    setDismissDialogOpen(false);
    setDismissingAction(null);
    setDismissReason('');
  };

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    toast({ title: 'Copied', description: `${label} copied to clipboard` });
  };

  const handleViewLead = (action: NBAAction) => {
    if (onViewLead) {
      onViewLead(action.targetId);
    } else {
      setLocation(`/pipeline?openType=${action.targetType}&openId=${action.targetId}`);
    }
  };

  if (displayActions.length === 0) {
    return (
      <Card className="p-6">
        {showHeader && (
          <h2 className="font-semibold mb-4 flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4" />
            Action Queue
          </h2>
        )}
        <p className="text-sm text-muted-foreground text-center py-8">
          No actions in queue. Generate recommendations to get started.
        </p>
      </Card>
    );
  }

  return (
    <>
      <Card className="p-6">
        {showHeader && (
          <div className="flex items-center justify-between gap-2 mb-4 flex-wrap">
            <h2 className="font-semibold flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4" />
              Action Queue
            </h2>
            {focusMode?.enabled && (
              <Badge variant="secondary" className="text-xs">
                Focus Mode: {focusActions.filter(a => a.status === 'open').length}/3 remaining
              </Badge>
            )}
          </div>
        )}
        
        <ScrollArea className="h-[500px]">
          <div className="space-y-3 pr-2">
            {displayActions.map((action, index) => {
              const lead = getLeadForAction(action);
              const isExpanded = expandedId === action.id;
              
              return (
                <Collapsible
                  key={action.id}
                  open={isExpanded}
                  onOpenChange={(open) => setExpandedId(open ? action.id : null)}
                >
                  <div
                    className="rounded-lg bg-muted/50 border border-transparent hover:border-border transition-colors"
                    data-testid={`nba-action-${action.id}`}
                  >
                    <div className="p-3">
                      <div className="flex items-start gap-3">
                        <div className="shrink-0 mt-0.5 text-primary">
                          {getActionIcon(action.suggestedActionType)}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <p className="font-medium text-sm truncate" data-testid={`nba-action-title-${action.id}`}>
                                {action.title}
                              </p>
                              <p className="text-xs text-muted-foreground truncate">
                                {lead?.companyName || 'Unknown business'}
                                {lead?.contactName && ` • ${lead.contactName}`}
                              </p>
                            </div>
                            <Badge variant="outline" className="shrink-0 text-xs">
                              +{action.points}
                            </Badge>
                          </div>
                          
                          <div className="flex items-center gap-2 mt-3 flex-wrap">
                            <Button
                              size="sm"
                              onClick={() => handlePrimaryAction(action, lead)}
                              disabled={
                                (action.suggestedActionType === 'call' && !lead?.phone) ||
                                (action.suggestedActionType === 'sms' && !lead?.phone) ||
                                (action.suggestedActionType === 'email' && !lead?.email)
                              }
                              data-testid={`button-action-${action.id}`}
                            >
                              {getActionIcon(action.suggestedActionType)}
                              <span className="ml-1.5">{getActionButtonLabel(action.suggestedActionType)}</span>
                            </Button>
                            
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleComplete(action)}
                              data-testid={`button-complete-${action.id}`}
                            >
                              <CheckCircle2 className="h-4 w-4 text-green-500" />
                            </Button>
                            
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => handleDismissClick(action)}
                              data-testid={`button-dismiss-${action.id}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            
                            {action.suggestedMessage && (
                              <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => handleCopy(action.suggestedMessage, 'Message')}
                                data-testid={`button-copy-${action.id}`}
                              >
                                <Copy className="h-4 w-4" />
                              </Button>
                            )}
                            
                            <CollapsibleTrigger asChild>
                              <Button size="icon" variant="ghost" data-testid={`button-expand-${action.id}`}>
                                {isExpanded ? (
                                  <ChevronUp className="h-4 w-4" />
                                ) : (
                                  <ChevronDown className="h-4 w-4" />
                                )}
                              </Button>
                            </CollapsibleTrigger>
                          </div>
                        </div>
                      </div>
                    </div>
                    
                    <CollapsibleContent>
                      <div className="px-3 pb-3 pt-0 border-t border-border/50 mt-2">
                        <div className="pt-3 space-y-4">
                          <div>
                            <p className="text-xs font-medium text-muted-foreground mb-1">Why This Action</p>
                            <p className="text-sm">{action.reason}</p>
                          </div>
                          
                          {action.whyBullets && action.whyBullets.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">Key Factors</p>
                              <ul className="space-y-1">
                                {action.whyBullets.map((bullet, i) => (
                                  <li key={i} className="text-sm flex items-start gap-2">
                                    <span className="text-primary mt-1">•</span>
                                    {bullet}
                                  </li>
                                ))}
                              </ul>
                            </div>
                          )}
                          
                          {action.suggestedMessage && (
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="text-xs font-medium text-muted-foreground">Suggested Copy</p>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-xs"
                                  onClick={() => handleCopy(action.suggestedMessage, 'Message')}
                                >
                                  <Copy className="h-3 w-3 mr-1" />
                                  Copy
                                </Button>
                              </div>
                              <p className="text-sm bg-muted rounded-md p-2 whitespace-pre-wrap">
                                {action.suggestedMessage}
                              </p>
                            </div>
                          )}
                          
                          {action.suggestedEmail && (
                            <div>
                              <div className="flex items-center justify-between gap-2 mb-1">
                                <p className="text-xs font-medium text-muted-foreground">Email Template</p>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-6 text-xs"
                                  onClick={() => handleCopy(
                                    `Subject: ${action.suggestedEmail!.subject}\n\n${action.suggestedEmail!.body}`,
                                    'Email'
                                  )}
                                >
                                  <Copy className="h-3 w-3 mr-1" />
                                  Copy
                                </Button>
                              </div>
                              <div className="text-sm bg-muted rounded-md p-2">
                                <p className="font-medium mb-1">Subject: {action.suggestedEmail.subject}</p>
                                <p className="whitespace-pre-wrap">{action.suggestedEmail.body}</p>
                              </div>
                            </div>
                          )}
                          
                          {action.nepqQuestions && action.nepqQuestions.length > 0 && (
                            <div>
                              <p className="text-xs font-medium text-muted-foreground mb-1">NEPQ Questions</p>
                              <ol className="space-y-1 list-decimal list-inside">
                                {action.nepqQuestions.map((question, i) => (
                                  <li key={i} className="text-sm">{question}</li>
                                ))}
                              </ol>
                            </div>
                          )}
                          
                          <div className="flex items-center justify-between gap-2 pt-2 border-t border-border/50">
                            <div className="text-xs text-muted-foreground">
                              Priority Score: {action.priorityScore}
                              {action.dueAt && (
                                <> • Due: {new Date(action.dueAt).toLocaleDateString()}</>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => handleViewLead(action)}
                              data-testid={`button-view-lead-${action.id}`}
                            >
                              View Record
                              <ExternalLink className="h-3 w-3 ml-1" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </CollapsibleContent>
                  </div>
                </Collapsible>
              );
            })}
          </div>
        </ScrollArea>
      </Card>
      
      <Dialog open={dismissDialogOpen} onOpenChange={setDismissDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dismiss Action</DialogTitle>
            <DialogDescription>
              In Focus Mode, please provide a reason for dismissing this action.
            </DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Textarea
              placeholder="Why are you dismissing this action?"
              value={dismissReason}
              onChange={(e) => setDismissReason(e.target.value)}
              className="min-h-[100px]"
              data-testid="input-dismiss-reason"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDismissDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleDismissConfirm} data-testid="button-confirm-dismiss">
              Dismiss
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
