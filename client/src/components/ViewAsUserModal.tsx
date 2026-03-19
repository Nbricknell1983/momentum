import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '@/contexts/AuthContext';
import { auth } from '@/lib/firebase';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Eye, Shield, Crown, User, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { TeamMemberRole } from '@/lib/types';

type OrgMember = {
  uid: string;
  email: string;
  displayName?: string;
  role: TeamMemberRole;
  active: boolean;
};

type Props = {
  open: boolean;
  onClose: () => void;
};

const ROLE_ICON: Record<string, any> = {
  owner: Crown,
  admin: Shield,
  member: User,
};

const ROLE_COLOR: Record<string, string> = {
  owner: 'text-violet-400',
  admin: 'text-blue-400',
  member: 'text-slate-400',
};

export default function ViewAsUserModal({ open, onClose }: Props) {
  const { orgId, user, setViewAsUser } = useAuth();
  const { toast } = useToast();
  const [loading, setLoading] = useState<string | null>(null);

  const { data: members, isLoading } = useQuery<OrgMember[]>({
    queryKey: ['/api/org/members', orgId],
    queryFn: async () => {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/org/members', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error('Failed to load members');
      return res.json();
    },
    enabled: open && !!orgId,
  });

  const otherMembers = (members || []).filter(m => m.uid !== user?.uid && m.active);

  const handleViewAs = async (member: OrgMember) => {
    setLoading(member.uid);
    try {
      const token = await auth.currentUser?.getIdToken();
      const res = await fetch('/api/impersonation/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          event: 'started',
          targetUid: member.uid,
          targetEmail: member.email,
          targetName: member.displayName || member.email,
          targetRole: member.role,
        }),
      });
      const data = res.ok ? await res.json() : {};

      setViewAsUser({
        uid: member.uid,
        email: member.email,
        displayName: member.displayName || member.email,
        role: member.role,
        logId: data.logId || null,
      });
      onClose();
      toast({
        title: 'Support view active',
        description: `Now viewing as ${member.displayName || member.email}. An audit record has been created.`,
      });
    } catch (e) {
      toast({ title: 'Failed to start view', variant: 'destructive' });
    } finally {
      setLoading(null);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-md" data-testid="modal-view-as-user">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-4 w-4 text-amber-500" />
            View As User
          </DialogTitle>
          <DialogDescription>
            Select a team member to view the app as they see it. A support view audit record will be created automatically.
          </DialogDescription>
        </DialogHeader>

        <div className="bg-amber-500/10 border border-amber-500/25 rounded-lg px-4 py-3 flex items-start gap-2.5 mb-2">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <div className="text-xs text-amber-300 space-y-1">
            <p className="font-semibold">Support view is fully audited.</p>
            <p className="text-amber-400/80">An audit record is written when you start and when you exit. This is for support and debugging only.</p>
          </div>
        </div>

        {isLoading ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : otherMembers.length === 0 ? (
          <div className="text-center py-8 text-sm text-muted-foreground">
            No other active team members found.
          </div>
        ) : (
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {otherMembers.map(member => {
              const RoleIcon = ROLE_ICON[member.role] || User;
              const roleColor = ROLE_COLOR[member.role] || 'text-slate-400';
              const isLoading = loading === member.uid;
              return (
                <div
                  key={member.uid}
                  data-testid={`option-view-as-${member.uid}`}
                  className="flex items-center gap-3 border border-border rounded-xl px-4 py-3 hover:bg-muted/50 transition-colors"
                >
                  <div className="h-9 w-9 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    <span className="text-sm font-medium text-muted-foreground">
                      {(member.displayName || member.email).charAt(0).toUpperCase()}
                    </span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {member.displayName || member.email}
                    </p>
                    {member.displayName && (
                      <p className="text-xs text-muted-foreground truncate">{member.email}</p>
                    )}
                    <div className="flex items-center gap-1 mt-0.5">
                      <RoleIcon className={`h-3 w-3 ${roleColor}`} />
                      <span className={`text-[10px] font-semibold uppercase tracking-wider ${roleColor}`}>
                        {member.role}
                      </span>
                    </div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-8 text-xs gap-1.5 flex-shrink-0"
                    onClick={() => handleViewAs(member)}
                    disabled={!!loading}
                    data-testid={`button-start-view-as-${member.uid}`}
                  >
                    {isLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Eye className="h-3.5 w-3.5" />
                    )}
                    View As
                  </Button>
                </div>
              );
            })}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
