import { useState } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { RootState, addCadence, updateCadence, deleteCadence } from '@/store';
import { Cadence, CadenceStep, TouchChannel } from '@/lib/types';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Pencil, Trash2, GripVertical, Phone, Mail, MessageSquare, Clock, Zap } from 'lucide-react';
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
                      value={step.dayOffset}
                      onChange={(e) => updateStep(index, { dayOffset: parseInt(e.target.value) || 1 })}
                      className="w-16"
                      data-testid={`input-step-day-${index}`}
                    />
                  </div>
                  <Select
                    value={step.channel}
                    onValueChange={(value: TouchChannel) => updateStep(index, { channel: value })}
                  >
                    <SelectTrigger className="w-28" data-testid={`select-step-channel-${index}`}>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="call">Call</SelectItem>
                      <SelectItem value="email">Email</SelectItem>
                      <SelectItem value="sms">SMS</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                {formData.steps.length > 1 && (
                  <Button 
                    type="button" 
                    size="icon" 
                    variant="ghost" 
                    onClick={() => removeStep(index)}
                    data-testid={`button-remove-step-${index}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button type="button" variant="outline" onClick={onCancel} data-testid="button-cancel-cadence">
          Cancel
        </Button>
        <Button type="submit" data-testid="button-save-cadence">
          {isEditing ? 'Save Changes' : 'Create Cadence'}
        </Button>
      </div>
    </form>
  );
}

export default function SettingsPage() {
  const dispatch = useDispatch();
  const { toast } = useToast();
  const cadences = useSelector((state: RootState) => state.app.cadences);
  
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCadence, setEditingCadence] = useState<Cadence | null>(null);

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
    toast({
      title: 'Cadence deleted',
      description: 'The cadence has been removed.',
    });
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
            <p className="text-muted-foreground">Manage your nurture cadences and preferences</p>
          </div>
        </div>

        <Tabs defaultValue="cadences" className="space-y-4">
          <TabsList>
            <TabsTrigger value="cadences" data-testid="tab-cadences">
              <Zap className="h-4 w-4 mr-1" />
              Cadences
            </TabsTrigger>
          </TabsList>

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
    </div>
  );
}
