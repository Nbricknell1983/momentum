import { useState, useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, addCadence, updateCadence, deleteCadence } from '@/store';
import { Cadence, CadenceStep, TouchChannel, Organization, TeamMember, AUSTRALIAN_TIMEZONES } from '@/lib/types';
import { fetchOrganization, updateOrganization, fetchTeamMembers, addTeamMember, updateTeamMember, removeTeamMember } from '@/lib/firestoreService';
import { useAuth } from '@/contexts/AuthContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Separator } from '@/components/ui/separator';
import { Plus, Pencil, Trash2, GripVertical, Phone, Mail, MessageSquare, Clock, Zap, Building2, Users, Save, Loader2, UserPlus, Crown, Shield, User, KeyRound } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';

const CHANNEL_ICONS: Record<TouchChannel, typeof Phone> = {
  call: Phone,
  email: Mail,
  sms: MessageSquare,
};

const CHANNEL_LABELS: Record<TouchChannel, string> = {
  call: 'Call',
  email: 'Email',
  sms: 'SMS',
};

interface CadenceFormData {
  name: string;
  description: string;
  mode: 'active' | 'passive';
  steps: CadenceStep[];
}

function CadenceCard({ cadence, onEdit, onDelete }: { cadence: Cadence; onEdit: () => void; onDelete: () => void }) {
  return (
    <Card data-testid={`card-cadence-${cadence.id}`}>
      <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0 pb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <CardTitle className="text-base" data-testid={`text-cadence-name-${cadence.id}`}>{cadence.name}</CardTitle>
            <Badge variant={cadence.mode === 'active' ? 'default' : 'secondary'} className="text-xs">
              {cadence.mode === 'active' ? 'Active' : 'Passive'}
            </Badge>
            {cadence.isDefault && (
              <Badge variant="outline" className="text-xs">Default</Badge>
            )}
          </div>
          {cadence.description && (
            <CardDescription className="mt-1">{cadence.description}</CardDescription>
          )}
        </div>
        <div className="flex items-center gap-1">
          <Button size="icon" variant="ghost" onClick={onEdit} data-testid={`button-edit-cadence-${cadence.id}`}>
            <Pencil className="h-4 w-4" />
          </Button>
          {!cadence.isDefault && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="icon" variant="ghost" data-testid={`button-delete-cadence-${cadence.id}`}>
                  <Trash2 className="h-4 w-4" />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete Cadence</AlertDialogTitle>
                  <AlertDialogDescription>
                    Are you sure you want to delete "{cadence.name}"? This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={onDelete} data-testid="button-confirm-delete">Delete</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="flex items-center gap-2 flex-wrap">
          {cadence.steps.map((step, index) => {
            const Icon = CHANNEL_ICONS[step.channel];
            return (
              <div key={step.id} className="flex items-center gap-1">
                {index > 0 && <span className="text-muted-foreground mx-1">-</span>}
                <div className="flex items-center gap-1 text-sm text-muted-foreground">
                  <Clock className="h-3 w-3" />
                  <span>Day {step.dayOffset}</span>
                </div>
                <Badge variant="outline" className="gap-1">
                  <Icon className="h-3 w-3" />
                  {CHANNEL_LABELS[step.channel]}
                </Badge>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

function CadenceBuilder({ 
  initialData, 
  onSave, 
  onCancel,
  isEditing,
}: { 
  initialData?: Cadence; 
  onSave: (data: CadenceFormData) => void; 
  onCancel: () => void;
  isEditing: boolean;
}) {
  const [formData, setFormData] = useState<CadenceFormData>({
    name: initialData?.name || '',
    description: initialData?.description || '',
    mode: initialData?.mode || 'active',
    steps: initialData?.steps || [{ id: `step_${Date.now()}`, dayOffset: 1, channel: 'call' }],
  });

  const addStep = () => {
    const lastStep = formData.steps[formData.steps.length - 1];
    const newDayOffset = lastStep ? lastStep.dayOffset + 3 : 1;
    setFormData({
      ...formData,
      steps: [
        ...formData.steps,
        { id: `step_${Date.now()}`, dayOffset: newDayOffset, channel: 'call' },
      ],
    });
  };

  const removeStep = (index: number) => {
    if (formData.steps.length <= 1) return;
    const newSteps = [...formData.steps];
    newSteps.splice(index, 1);
    setFormData({ ...formData, steps: newSteps });
  };

  const updateStep = (index: number, updates: Partial<CadenceStep>) => {
    const newSteps = [...formData.steps];
    newSteps[index] = { ...newSteps[index], ...updates };
    setFormData({ ...formData, steps: newSteps });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim()) return;
    if (formData.steps.length === 0) return;
    onSave(formData);
  };

  const isDefault = initialData?.isDefault;

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="name">Cadence Name</Label>
          <Input
            id="name"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Aggressive Follow-up"
            disabled={isDefault}
            data-testid="input-cadence-name"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea
            id="description"
            value={formData.description}
            onChange={(e) => setFormData({ ...formData, description: e.target.value })}
            placeholder="Brief description of this cadence..."
            className="resize-none"
            rows={2}
            disabled={isDefault}
            data-testid="input-cadence-description"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="mode">Mode</Label>
          <Select
            value={formData.mode}
            onValueChange={(value: 'active' | 'passive') => setFormData({ ...formData, mode: value })}
            disabled={isDefault}
          >
            <SelectTrigger data-testid="select-cadence-mode">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active (intensive follow-up)</SelectItem>
              <SelectItem value="passive">Passive (light touch)</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <Label>Cadence Steps</Label>
          <Button type="button" size="sm" variant="outline" onClick={addStep} data-testid="button-add-step">
            <Plus className="h-4 w-4 mr-1" />
            Add Step
          </Button>
        </div>
        <ScrollArea className="max-h-[300px]">
          <div className="space-y-2 pr-2">
            {formData.steps.map((step, index) => (
              <div 
                key={step.id} 
                className="flex items-center gap-3 p-3 rounded-md border bg-muted/30"
                data-testid={`step-row-${index}`}
              >
                <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                <Badge variant="secondary" className="shrink-0">Step {index + 1}</Badge>
                <div className="flex items-center gap-2 flex-1 flex-wrap">
                  <div className="flex items-center gap-1">
                    <Label className="text-sm text-muted-foreground shrink-0">Day</Label>
                    <Input
                      type="number"
                      min={1}
                      max={365}
                      value={step.dayOffset}
                      onChange={(e) => updateStep(index, { dayOffset: parseInt(e.target.value) || 1 })}
                      className="w-16 h-8"
                      data-testid={`input-step-day-${index}`}
                    />
                  </div>
                  <Select
                    value={step.channel}
                    onValueChange={(value: TouchChannel) => updateStep(index, { channel: value })}
                  >
                    <SelectTrigger className="w-28 h-8" data-testid={`select-step-channel-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  onClick={() => removeStep(index)}
                  disabled={formData.steps.length <= 1}
                  className="shrink-0"
                  data-testid={`button-remove-step-${index}`}
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <DialogFooter className="gap-2">
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
        <Button type="submit" data-testid="button-save-cadence">
          {isEditing ? 'Save Changes' : 'Create Cadence'}
        </Button>
      </DialogFooter>
    </form>
  );
}

const ROLE_ICONS = {
  owner: Crown,
  admin: Shield,
  member: User,
};

const ROLE_LABELS = {
  owner: 'Owner',
  admin: 'Admin',
  member: 'Member',
};

export default function SettingsPage() {
  const dispatch = useDispatch();
  const { orgId, user, authReady, isManager } = useAuth();
  const { toast } = useToast();
  const cadences = useSelector((state: RootState) => state.app.cadences);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCadence, setEditingCadence] = useState<Cadence | null>(null);
  
  // Organization state
  const [organization, setOrganization] = useState<Organization | null>(null);
  const [isLoadingOrg, setIsLoadingOrg] = useState(true);
  const [isSavingOrg, setIsSavingOrg] = useState(false);
  const [orgForm, setOrgForm] = useState({
    name: '',
    email: '',
    phone: '',
    timezone: 'Australia/Sydney',
    serviceAreas: '',
    enableEmergencyRules: false,
  });
  
  // Team state
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [isLoadingTeam, setIsLoadingTeam] = useState(true);
  const [isInviteDialogOpen, setIsInviteDialogOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePassword, setInvitePassword] = useState('');
  const [inviteRole, setInviteRole] = useState<'admin' | 'member'>('member');
  const [isInviting, setIsInviting] = useState(false);
  const [createdPassword, setCreatedPassword] = useState<string | null>(null);
  
  // Password reset state
  const [isPasswordResetDialogOpen, setIsPasswordResetDialogOpen] = useState(false);
  const [passwordResetMember, setPasswordResetMember] = useState<TeamMember | null>(null);
  const [newPassword, setNewPassword] = useState('');
  const [isResettingPassword, setIsResettingPassword] = useState(false);
  
  // Compute current user's role for RBAC
  const currentUserRole = teamMembers.find(m => m.email === user?.email)?.role || 
    (organization?.ownerId === user?.uid ? 'owner' : 'member');
  const canManageTeam = currentUserRole === 'owner' || currentUserRole === 'admin';
  const canEditOrgSettings = currentUserRole === 'owner' || currentUserRole === 'admin';

  // Load organization data
  useEffect(() => {
    if (orgId && authReady) {
      setIsLoadingOrg(true);
      fetchOrganization(orgId, authReady)
        .then((org) => {
          setOrganization(org);
          if (org) {
            setOrgForm({
              name: org.name || '',
              email: org.email || '',
              phone: org.phone || '',
              timezone: org.timezone || 'Australia/Sydney',
              serviceAreas: org.serviceAreas || '',
              enableEmergencyRules: org.settings?.enableEmergencyRules || false,
            });
          }
        })
        .catch(console.error)
        .finally(() => setIsLoadingOrg(false));
    }
  }, [orgId, authReady]);
  
  // Load team members
  useEffect(() => {
    if (orgId && authReady) {
      setIsLoadingTeam(true);
      fetchTeamMembers(orgId, authReady)
        .then(setTeamMembers)
        .catch(console.error)
        .finally(() => setIsLoadingTeam(false));
    }
  }, [orgId, authReady]);

  const handleSaveOrganization = async () => {
    if (!orgId || !authReady) return;
    
    setIsSavingOrg(true);
    try {
      await updateOrganization(orgId, {
        name: orgForm.name,
        email: orgForm.email,
        phone: orgForm.phone,
        timezone: orgForm.timezone,
        serviceAreas: orgForm.serviceAreas,
        settings: {
          ...organization?.settings,
          enableEmergencyRules: orgForm.enableEmergencyRules,
        },
      }, authReady);
      
      toast({ title: 'Settings saved', description: 'Your business profile has been updated.' });
    } catch (error) {
      console.error('[Settings] Error saving organization:', error);
      toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
    } finally {
      setIsSavingOrg(false);
    }
  };
  
  const handleInviteMember = async () => {
    if (!orgId || !authReady || !inviteEmail.trim() || !invitePassword.trim()) return;
    
    if (invitePassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    
    setIsInviting(true);
    try {
      // Get the current user's ID token for authentication
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      
      if (!token) {
        throw new Error('Not authenticated');
      }
      
      // Create Firebase Auth account via server
      const response = await fetch('/api/admin/create-team-member', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: inviteEmail.trim().toLowerCase(),
          password: invitePassword,
          orgId,
          role: inviteRole,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to create team member');
      }
      
      // Refresh team members list
      const updatedMembers = await fetchTeamMembers(orgId, authReady);
      setTeamMembers(updatedMembers);
      
      // Store the password to show it to the admin
      setCreatedPassword(invitePassword);
      
      toast({ 
        title: data.alreadyExists ? 'User already exists' : 'Team member created', 
        description: data.alreadyExists 
          ? `${inviteEmail} already has an account. They can log in with their existing password.`
          : `Account created for ${inviteEmail}. Share the password with them.`
      });
      
      // Reset form but keep dialog open to show the password
      setInviteEmail('');
      setInvitePassword('');
      setInviteRole('member');
      
      if (data.alreadyExists) {
        setIsInviteDialogOpen(false);
        setCreatedPassword(null);
      }
    } catch (error: any) {
      console.error('[Settings] Error inviting member:', error);
      toast({ title: 'Error', description: error.message || 'Failed to create team member', variant: 'destructive' });
    } finally {
      setIsInviting(false);
    }
  };
  
  const handleRemoveMember = async (member: TeamMember) => {
    if (!orgId || !authReady) return;
    
    try {
      await removeTeamMember(orgId, member.id, authReady);
      setTeamMembers(teamMembers.filter(m => m.id !== member.id));
      toast({ title: 'Member removed', description: `${member.email} has been removed from the team.` });
    } catch (error) {
      console.error('[Settings] Error removing member:', error);
      toast({ title: 'Error', description: 'Failed to remove member', variant: 'destructive' });
    }
  };
  
  const openPasswordResetDialog = (member: TeamMember) => {
    setPasswordResetMember(member);
    setNewPassword('');
    setIsPasswordResetDialogOpen(true);
  };
  
  const handleResetPassword = async () => {
    if (!orgId || !passwordResetMember || !newPassword) return;
    
    if (newPassword.length < 6) {
      toast({ title: 'Error', description: 'Password must be at least 6 characters', variant: 'destructive' });
      return;
    }
    
    setIsResettingPassword(true);
    try {
      // Get the current user's ID token for authentication
      const { getAuth } = await import('firebase/auth');
      const auth = getAuth();
      const token = await auth.currentUser?.getIdToken();
      
      if (!token) {
        throw new Error('Not authenticated');
      }
      
      const response = await fetch('/api/admin/reset-password', {
        method: 'POST',
        headers: { 
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          email: passwordResetMember.email,
          newPassword,
          orgId,
        }),
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }
      
      toast({ title: 'Password reset', description: `Password updated for ${passwordResetMember.email}` });
      setIsPasswordResetDialogOpen(false);
      setPasswordResetMember(null);
      setNewPassword('');
    } catch (error: any) {
      console.error('[Settings] Error resetting password:', error);
      toast({ title: 'Error', description: error.message || 'Failed to reset password', variant: 'destructive' });
    } finally {
      setIsResettingPassword(false);
    }
  };

  const handleCreateCadence = () => {
    setEditingCadence(null);
    setIsDialogOpen(true);
  };

  const handleEditCadence = (cadence: Cadence) => {
    setEditingCadence(cadence);
    setIsDialogOpen(true);
  };

  const handleDeleteCadence = (id: string) => {
    dispatch(deleteCadence(id));
    toast({ title: 'Cadence deleted' });
  };

  const handleSaveCadence = (data: CadenceFormData) => {
    if (editingCadence) {
      const updated: Cadence = {
        ...editingCadence,
        name: editingCadence.isDefault ? editingCadence.name : data.name,
        description: editingCadence.isDefault ? editingCadence.description : data.description,
        mode: editingCadence.isDefault ? editingCadence.mode : data.mode,
        steps: data.steps,
        updatedAt: new Date(),
      };
      dispatch(updateCadence(updated));
      toast({
        title: 'Cadence updated',
        description: `"${updated.name}" has been updated.`,
      });
    } else {
      const newCadence: Cadence = {
        id: `cadence_${Date.now()}`,
        name: data.name,
        description: data.description,
        mode: data.mode,
        steps: data.steps,
        isDefault: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      dispatch(addCadence(newCadence));
      toast({
        title: 'Cadence created',
        description: `"${newCadence.name}" has been added.`,
      });
    }
    setIsDialogOpen(false);
    setEditingCadence(null);
  };

  const activeCadences = cadences.filter(c => c.mode === 'active');
  const passiveCadences = cadences.filter(c => c.mode === 'passive');

  return (
    <div className="h-full overflow-auto">
      <div className="container max-w-4xl py-6 space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl font-semibold" data-testid="text-page-title">Settings</h1>
            <p className="text-muted-foreground">Manage your business configuration and preferences</p>
          </div>
        </div>

        <Tabs defaultValue="business" className="space-y-4">
          <TabsList>
            <TabsTrigger value="business" data-testid="tab-business">
              <Building2 className="h-4 w-4 mr-1" />
              Business
            </TabsTrigger>
            <TabsTrigger value="team" data-testid="tab-team">
              <Users className="h-4 w-4 mr-1" />
              Team
            </TabsTrigger>
            <TabsTrigger value="cadences" data-testid="tab-cadences">
              <Zap className="h-4 w-4 mr-1" />
              Cadences
            </TabsTrigger>
          </TabsList>

          {/* Business Profile Tab */}
          <TabsContent value="business" className="space-y-6">
            <Card>
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
                    <Building2 className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <CardTitle>Business Profile</CardTitle>
                    <CardDescription>Your company details for bookings and invoices</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-6">
                {isLoadingOrg ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="businessName">Business Name</Label>
                        <Input
                          id="businessName"
                          value={orgForm.name}
                          onChange={(e) => setOrgForm({ ...orgForm, name: e.target.value })}
                          placeholder="Your Business Name"
                          data-testid="input-business-name"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="businessEmail">Email</Label>
                        <Input
                          id="businessEmail"
                          type="email"
                          value={orgForm.email}
                          onChange={(e) => setOrgForm({ ...orgForm, email: e.target.value })}
                          placeholder="contact@yourbusiness.com"
                          data-testid="input-business-email"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="businessPhone">Phone</Label>
                        <Input
                          id="businessPhone"
                          type="tel"
                          value={orgForm.phone}
                          onChange={(e) => setOrgForm({ ...orgForm, phone: e.target.value })}
                          placeholder="(02) 1234 5678"
                          data-testid="input-business-phone"
                        />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="timezone">Timezone</Label>
                        <Select
                          value={orgForm.timezone}
                          onValueChange={(value) => setOrgForm({ ...orgForm, timezone: value })}
                        >
                          <SelectTrigger data-testid="select-timezone">
                            <SelectValue placeholder="Select timezone" />
                          </SelectTrigger>
                          <SelectContent>
                            {AUSTRALIAN_TIMEZONES.map((tz) => (
                              <SelectItem key={tz.value} value={tz.value}>
                                {tz.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    
                    <div className="space-y-2">
                      <Label htmlFor="serviceAreas">Service Areas</Label>
                      <Textarea
                        id="serviceAreas"
                        value={orgForm.serviceAreas}
                        onChange={(e) => setOrgForm({ ...orgForm, serviceAreas: e.target.value })}
                        placeholder="Brisbane CBD, Gold Coast, Sunshine Coast..."
                        className="min-h-[80px]"
                        data-testid="input-service-areas"
                      />
                    </div>
                    
                    <Separator />
                    
                    <div className="flex items-center justify-between">
                      <div className="space-y-0.5">
                        <Label htmlFor="emergencyRules" className="text-base">Emergency Rules</Label>
                        <p className="text-sm text-muted-foreground">Enable emergency booking options</p>
                      </div>
                      <Switch
                        id="emergencyRules"
                        checked={orgForm.enableEmergencyRules}
                        onCheckedChange={(checked) => setOrgForm({ ...orgForm, enableEmergencyRules: checked })}
                        data-testid="switch-emergency-rules"
                      />
                    </div>
                    
                    <div className="flex items-center justify-between">
                      {!canEditOrgSettings && (
                        <p className="text-sm text-muted-foreground">
                          Only admins and owners can edit settings
                        </p>
                      )}
                      <div className="flex-1" />
                      <Button onClick={handleSaveOrganization} disabled={isSavingOrg || !canEditOrgSettings} data-testid="button-save-business">
                        {isSavingOrg ? (
                          <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        ) : (
                          <Save className="h-4 w-4 mr-2" />
                        )}
                        Save Changes
                      </Button>
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Team Tab */}
          <TabsContent value="team" className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-medium">Team Members</h2>
                <p className="text-sm text-muted-foreground">
                  {canManageTeam 
                    ? 'Manage who has access to your organization' 
                    : 'Your account details within the organization'}
                </p>
              </div>
              {canManageTeam && (
                <Button onClick={() => setIsInviteDialogOpen(true)} data-testid="button-invite-member">
                  <UserPlus className="h-4 w-4 mr-1" />
                  Invite Member
                </Button>
              )}
            </div>
            
            <Card>
              <CardContent className="p-0">
                {isLoadingTeam ? (
                  <div className="flex items-center justify-center py-8">
                    <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                  </div>
                ) : teamMembers.length === 0 ? (
                  <div className="py-8 text-center text-muted-foreground">
                    <Users className="h-8 w-8 mx-auto mb-2 opacity-50" />
                    <p>No team members yet</p>
                    <p className="text-sm">Invite people to collaborate with you</p>
                  </div>
                ) : (
                  <div className="divide-y">
                    {(isManager ? teamMembers : teamMembers.filter(m => m.id === user?.uid || m.email === user?.email)).map((member) => {
                      const RoleIcon = ROLE_ICONS[member.role];
                      return (
                        <div key={member.id} className="flex items-center justify-between p-4 gap-4" data-testid={`member-row-${member.id}`}>
                          <div className="flex items-center gap-3">
                            <Avatar>
                              <AvatarImage src={member.photoURL} />
                              <AvatarFallback>
                                {member.displayName?.[0] || member.email[0].toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div>
                              <p className="font-medium">{member.displayName || member.email}</p>
                              <p className="text-sm text-muted-foreground">{member.email}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge variant={member.status === 'pending' ? 'secondary' : 'outline'} className="gap-1">
                              <RoleIcon className="h-3 w-3" />
                              {ROLE_LABELS[member.role]}
                            </Badge>
                            {member.status === 'pending' && (
                              <Badge variant="outline" className="text-amber-600 border-amber-200">
                                Pending
                              </Badge>
                            )}
                            {canManageTeam && member.role !== 'owner' && (
                              <>
                                <Button 
                                  size="icon" 
                                  variant="ghost" 
                                  onClick={() => openPasswordResetDialog(member)}
                                  title="Reset Password"
                                  data-testid={`button-reset-password-${member.id}`}
                                >
                                  <KeyRound className="h-4 w-4" />
                                </Button>
                                <AlertDialog>
                                  <AlertDialogTrigger asChild>
                                    <Button size="icon" variant="ghost" data-testid={`button-remove-member-${member.id}`}>
                                      <Trash2 className="h-4 w-4" />
                                    </Button>
                                  </AlertDialogTrigger>
                                  <AlertDialogContent>
                                    <AlertDialogHeader>
                                      <AlertDialogTitle>Remove Team Member</AlertDialogTitle>
                                      <AlertDialogDescription>
                                        Are you sure you want to remove {member.email} from your team? They will lose access to this organization.
                                      </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                      <AlertDialogCancel>Cancel</AlertDialogCancel>
                                      <AlertDialogAction onClick={() => handleRemoveMember(member)}>Remove</AlertDialogAction>
                                    </AlertDialogFooter>
                                  </AlertDialogContent>
                                </AlertDialog>
                              </>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cadences Tab */}
          <TabsContent value="cadences" className="space-y-6">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <h2 className="text-lg font-medium">Nurture Cadences</h2>
                <p className="text-sm text-muted-foreground">Define touch sequences for nurturing leads</p>
              </div>
              <Button onClick={handleCreateCadence} data-testid="button-create-cadence">
                <Plus className="h-4 w-4 mr-1" />
                Create Cadence
              </Button>
            </div>

            <div className="space-y-6">
              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">Active Cadences ({activeCadences.length})</h3>
                <div className="space-y-3">
                  {activeCadences.map(cadence => (
                    <CadenceCard
                      key={cadence.id}
                      cadence={cadence}
                      onEdit={() => handleEditCadence(cadence)}
                      onDelete={() => handleDeleteCadence(cadence.id)}
                    />
                  ))}
                  {activeCadences.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">No active cadences</p>
                  )}
                </div>
              </div>

              <div className="space-y-3">
                <h3 className="text-sm font-medium text-muted-foreground">Passive Cadences ({passiveCadences.length})</h3>
                <div className="space-y-3">
                  {passiveCadences.map(cadence => (
                    <CadenceCard
                      key={cadence.id}
                      cadence={cadence}
                      onEdit={() => handleEditCadence(cadence)}
                      onDelete={() => handleDeleteCadence(cadence.id)}
                    />
                  ))}
                  {passiveCadences.length === 0 && (
                    <p className="text-sm text-muted-foreground py-4 text-center">No passive cadences</p>
                  )}
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {/* Cadence Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingCadence ? 'Edit Cadence' : 'Create New Cadence'}</DialogTitle>
            <DialogDescription>
              {editingCadence?.isDefault 
                ? 'You can modify the steps of this default cadence, but not its name or mode.'
                : 'Define a touch sequence with specific timing and channels.'}
            </DialogDescription>
          </DialogHeader>
          <CadenceBuilder
            initialData={editingCadence || undefined}
            onSave={handleSaveCadence}
            onCancel={() => setIsDialogOpen(false)}
            isEditing={!!editingCadence}
          />
        </DialogContent>
      </Dialog>
      
      {/* Invite Member Dialog */}
      <Dialog open={isInviteDialogOpen} onOpenChange={(open) => {
        setIsInviteDialogOpen(open);
        if (!open) {
          setCreatedPassword(null);
          setInviteEmail('');
          setInvitePassword('');
          setInviteRole('member');
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Team Member</DialogTitle>
            <DialogDescription>
              Create an account for a new team member. You'll set their initial password and share it with them.
            </DialogDescription>
          </DialogHeader>
          
          {createdPassword ? (
            <div className="space-y-4 py-4">
              <div className="bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 rounded-md p-4">
                <p className="text-sm font-medium text-green-800 dark:text-green-200 mb-2">Account created successfully!</p>
                <p className="text-sm text-green-700 dark:text-green-300 mb-3">
                  Share these login details with the team member:
                </p>
                <div className="bg-white dark:bg-gray-900 rounded p-3 space-y-2 font-mono text-sm">
                  <p><span className="text-muted-foreground">Password:</span> {createdPassword}</p>
                </div>
                <p className="text-xs text-muted-foreground mt-3">
                  They can change their password after logging in.
                </p>
              </div>
              <DialogFooter>
                <Button onClick={() => {
                  setIsInviteDialogOpen(false);
                  setCreatedPassword(null);
                }}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="inviteEmail">Email Address</Label>
                  <Input
                    id="inviteEmail"
                    type="email"
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague@example.com"
                    data-testid="input-invite-email"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invitePassword">Initial Password</Label>
                  <Input
                    id="invitePassword"
                    type="text"
                    value={invitePassword}
                    onChange={(e) => setInvitePassword(e.target.value)}
                    placeholder="Set a temporary password (min 6 characters)"
                    data-testid="input-invite-password"
                  />
                  <p className="text-xs text-muted-foreground">
                    You'll need to share this password with them securely.
                  </p>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="inviteRole">Role</Label>
                  <Select value={inviteRole} onValueChange={(v: 'admin' | 'member') => setInviteRole(v)}>
                    <SelectTrigger data-testid="select-invite-role">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="member">Member - Can view and manage leads</SelectItem>
                      <SelectItem value="admin">Admin - Full access including settings</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsInviteDialogOpen(false)}>Cancel</Button>
                <Button 
                  onClick={handleInviteMember} 
                  disabled={isInviting || !inviteEmail.trim() || invitePassword.length < 6} 
                  data-testid="button-send-invite"
                >
                  {isInviting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <UserPlus className="h-4 w-4 mr-2" />}
                  Create Account
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
      
      {/* Password Reset Dialog */}
      <Dialog open={isPasswordResetDialogOpen} onOpenChange={setIsPasswordResetDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>
              Set a new password for {passwordResetMember?.email}. They will need to use this password to log in.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="newPassword">New Password</Label>
              <Input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Enter new password (min 6 characters)"
                data-testid="input-new-password"
              />
              <p className="text-xs text-muted-foreground">
                Make sure to share this password securely with the team member.
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsPasswordResetDialogOpen(false)}>Cancel</Button>
            <Button 
              onClick={handleResetPassword} 
              disabled={isResettingPassword || newPassword.length < 6} 
              data-testid="button-confirm-reset-password"
            >
              {isResettingPassword ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <KeyRound className="h-4 w-4 mr-2" />}
              Reset Password
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
