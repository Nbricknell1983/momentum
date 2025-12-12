import { useSelector } from 'react-redux';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { RootState } from '@/store';

export default function SettingsPage() {
  const user = useSelector((state: RootState) => state.app.user);
  const targets = user?.targets || { calls: 25, doors: 5, meetings: 3, followups: 15, proposals: 2, deals: 1 };
  const weights = user?.momentumWeights || { call: 1, email: 1, sms: 1, dropin: 2, meeting: 5, proposal: 6, deal: 15 };

  return (
    <div className="p-6 space-y-6 overflow-auto h-full max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold" data-testid="text-settings-title">Settings</h1>
        <p className="text-muted-foreground">Manage your account and preferences</p>
      </div>

      {/* Profile */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4">Profile</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="name">Name</Label>
            <Input id="name" defaultValue={user?.name} data-testid="input-name" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" defaultValue={user?.email} data-testid="input-email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="territory">Territory</Label>
            <Input id="territory" defaultValue={user?.territory} data-testid="input-territory" />
          </div>
        </div>
        <Button className="mt-4" data-testid="button-save-profile">Save Profile</Button>
      </Card>

      {/* Daily Targets */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4">Daily Targets</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Set your daily activity goals to track momentum
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="space-y-2">
            <Label htmlFor="target-calls">Calls</Label>
            <Input id="target-calls" type="number" defaultValue={targets.calls} data-testid="input-target-calls" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-doors">Drop-ins</Label>
            <Input id="target-doors" type="number" defaultValue={targets.doors} data-testid="input-target-doors" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-meetings">Meetings</Label>
            <Input id="target-meetings" type="number" defaultValue={targets.meetings} data-testid="input-target-meetings" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-followups">Follow-ups</Label>
            <Input id="target-followups" type="number" defaultValue={targets.followups} data-testid="input-target-followups" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-proposals">Proposals</Label>
            <Input id="target-proposals" type="number" defaultValue={targets.proposals} data-testid="input-target-proposals" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="target-deals">Deals</Label>
            <Input id="target-deals" type="number" defaultValue={targets.deals} data-testid="input-target-deals" />
          </div>
        </div>
        <Button className="mt-4" data-testid="button-save-targets">Save Targets</Button>
      </Card>

      {/* Momentum Weights */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4">Momentum Score Weights</h2>
        <p className="text-sm text-muted-foreground mb-4">
          Customize point values for each activity type
        </p>
        <div className="grid gap-4 sm:grid-cols-4">
          <div className="space-y-2">
            <Label htmlFor="weight-call">Call</Label>
            <Input id="weight-call" type="number" defaultValue={weights.call} data-testid="input-weight-call" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weight-email">Email</Label>
            <Input id="weight-email" type="number" defaultValue={weights.email} data-testid="input-weight-email" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weight-sms">SMS</Label>
            <Input id="weight-sms" type="number" defaultValue={weights.sms} data-testid="input-weight-sms" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weight-dropin">Drop-in</Label>
            <Input id="weight-dropin" type="number" defaultValue={weights.dropin} data-testid="input-weight-dropin" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weight-meeting">Meeting</Label>
            <Input id="weight-meeting" type="number" defaultValue={weights.meeting} data-testid="input-weight-meeting" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weight-proposal">Proposal</Label>
            <Input id="weight-proposal" type="number" defaultValue={weights.proposal} data-testid="input-weight-proposal" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="weight-deal">Deal</Label>
            <Input id="weight-deal" type="number" defaultValue={weights.deal} data-testid="input-weight-deal" />
          </div>
        </div>
        <Button className="mt-4" data-testid="button-save-weights">Save Weights</Button>
      </Card>

      {/* Data */}
      <Card className="p-6">
        <h2 className="font-semibold mb-4">Data Management</h2>
        <div className="flex items-center gap-4 flex-wrap">
          <Button variant="outline" data-testid="button-export-leads">
            Export Leads (CSV)
          </Button>
          <Button variant="outline" data-testid="button-export-activities">
            Export Activities (CSV)
          </Button>
          <Button variant="outline" data-testid="button-import">
            Import Data
          </Button>
        </div>
      </Card>
    </div>
  );
}
