import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/queryClient';
import { AutomationRulesSchema } from '../../../../shared/controlPlaneSchemas';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useToast } from '@/hooks/use-toast';
import {
  CheckCircle2,
  ChevronRight,
  Bot,
  XCircle,
  Info,
  Clock,
} from 'lucide-react';

// ─── All supported task types ─────────────────────────────────────────────────

const ALL_TASK_TYPES = [
  { value: 'website_xray',        label: 'Website X-Ray' },
  { value: 'serp',                label: 'SERP / SEO' },
  { value: 'gbp',                 label: 'GBP' },
  { value: 'ads',                 label: 'Google Ads' },
  { value: 'strategy',            label: 'Strategy' },
  { value: 'growth_prescription', label: 'Growth Rx' },
  { value: 'enrichment',          label: 'Enrichment' },
  { value: 'prep',                label: 'Prep Pack' },
];

// ─── Form schema (autopilot subset) ──────────────────────────────────────────

const AutopilotFormSchema = AutomationRulesSchema.pick({
  autopilotEnabled: true,
  quietHoursUtc:    true,
  perDayCap:        true,
  taskTypeAllow:    true,
  taskTypeDeny:     true,
});
type AutopilotForm = z.infer<typeof AutopilotFormSchema>;

// ─── Task type toggle list ─────────────────────────────────────────────────────

function TaskTypeList({
  label,
  selected,
  onChange,
  excludedByOther,
  testPrefix,
}: {
  label: string;
  selected: string[];
  onChange: (v: string[]) => void;
  excludedByOther: string[];
  testPrefix: string;
}) {
  function toggle(value: string) {
    if (selected.includes(value)) {
      onChange(selected.filter(v => v !== value));
    } else {
      onChange([...selected, value]);
    }
  }
  return (
    <div>
      <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">{label}</div>
      <div className="flex flex-wrap gap-1.5">
        {ALL_TASK_TYPES.map(t => {
          const isSelected   = selected.includes(t.value);
          const isExcluded   = excludedByOther.includes(t.value);
          return (
            <button
              key={t.value}
              type="button"
              disabled={isExcluded}
              onClick={() => toggle(t.value)}
              data-testid={`${testPrefix}-${t.value}`}
              className={[
                'px-2.5 py-1 rounded-full text-xs font-medium border transition-colors',
                isExcluded
                  ? 'opacity-30 cursor-not-allowed border-border bg-muted text-muted-foreground'
                  : isSelected
                    ? 'bg-primary text-primary-foreground border-primary'
                    : 'bg-background text-foreground border-border hover:bg-muted',
              ].join(' ')}
            >
              {t.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Effective Policy summary ─────────────────────────────────────────────────

function PolicySummary({ values }: { values: AutopilotForm }) {
  const allow = values.taskTypeAllow?.length ? values.taskTypeAllow : null;
  const deny  = allow ? null : values.taskTypeDeny;

  return (
    <div className="flex flex-wrap gap-2 items-center text-xs">
      <Badge
        variant="outline"
        className={values.autopilotEnabled
          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30'
          : 'bg-muted text-muted-foreground'}
      >
        {values.autopilotEnabled ? 'Autopilot ON' : 'Autopilot OFF'}
      </Badge>
      <Badge variant="outline" className="text-xs">
        <Clock className="h-3 w-3 mr-1" />
        Quiet {values.quietHoursUtc.start}–{values.quietHoursUtc.end} UTC
      </Badge>
      <Badge variant="outline" className="text-xs">
        Cap {values.perDayCap.toLocaleString()}/day
      </Badge>
      {allow && (
        <Badge variant="outline" className="text-xs bg-blue-500/10 text-blue-600 border-blue-500/30">
          Allow only: {allow.join(', ')}
        </Badge>
      )}
      {deny && deny.length > 0 && (
        <Badge variant="outline" className="text-xs bg-amber-500/10 text-amber-600 border-amber-500/30">
          Deny: {deny.join(', ')}
        </Badge>
      )}
      {!allow && (!deny || deny.length === 0) && (
        <Badge variant="outline" className="text-xs text-muted-foreground">All tasks enabled</Badge>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export default function AutopilotSettingsPage() {
  const { isManager, orgId, authReady } = useAuth();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [savedAt, setSavedAt] = useState<string | null>(null);

  // Load current settings
  const { data: rulesData, isLoading } = useQuery<{ status: string; data: AutopilotForm }>({
    queryKey: ['/api/settings/automation-rules'],
    queryFn: async () => {
      const res = await apiRequest('GET', '/api/settings/automation-rules');
      return res.json();
    },
    enabled: authReady && isManager && !!orgId,
  });

  const defaults: AutopilotForm = {
    autopilotEnabled: false,
    quietHoursUtc:    { start: '22:00', end: '06:00' },
    perDayCap:        500,
    taskTypeAllow:    null,
    taskTypeDeny:     null,
  };

  const form = useForm<AutopilotForm>({
    resolver: zodResolver(AutopilotFormSchema),
    values: rulesData?.data
      ? {
          autopilotEnabled: rulesData.data.autopilotEnabled ?? defaults.autopilotEnabled,
          quietHoursUtc:    rulesData.data.quietHoursUtc    ?? defaults.quietHoursUtc,
          perDayCap:        rulesData.data.perDayCap        ?? defaults.perDayCap,
          taskTypeAllow:    rulesData.data.taskTypeAllow     ?? defaults.taskTypeAllow,
          taskTypeDeny:     rulesData.data.taskTypeDeny      ?? defaults.taskTypeDeny,
        }
      : defaults,
  });

  const { watch, handleSubmit, reset, formState: { isDirty, isSubmitting } } = form;
  const values = watch();

  const saveMutation = useMutation({
    mutationFn: async (data: AutopilotForm) => {
      // Normalize: if allow is non-empty, clear deny
      const normalized = {
        ...data,
        taskTypeDeny: (data.taskTypeAllow?.length ?? 0) > 0 ? null : data.taskTypeDeny,
      };
      const res = await apiRequest('POST', '/api/settings/automation-rules', { rules: normalized });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Autopilot settings saved', description: 'Changes will take effect on the next scan.' });
      setSavedAt(new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', second: '2-digit' }));
      qc.invalidateQueries({ queryKey: ['/api/settings/automation-rules'] });
    },
    onError: (err: Error) => {
      toast({ title: 'Save failed', description: err.message, variant: 'destructive' });
    },
  });

  // Access control
  if (authReady && !isManager) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <XCircle className="h-10 w-10 text-muted-foreground" />
        <div className="text-lg font-semibold">Access Denied</div>
        <div className="text-sm text-muted-foreground">This page is restricted to managers.</div>
      </div>
    );
  }

  const allowList = values.taskTypeAllow ?? [];
  const denyList  = values.taskTypeDeny  ?? [];

  return (
    <div className="flex flex-col gap-5 p-6 max-w-3xl mx-auto">
      {/* Breadcrumb */}
      <div className="flex items-center gap-1 text-xs text-muted-foreground">
        <span>Admin</span>
        <ChevronRight className="h-3 w-3" />
        <span className="text-foreground font-medium">Autopilot Settings</span>
      </div>

      {/* Header */}
      <div className="flex items-center gap-3">
        <Bot className="h-6 w-6 text-primary" />
        <div>
          <h1 className="text-xl font-bold tracking-tight">Autopilot Settings</h1>
          <p className="text-sm text-muted-foreground">Control how the agent job scanner runs for your org.</p>
        </div>
      </div>

      {/* Invalid data warning */}
      {rulesData?.status === 'invalid' && (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription>
            Stored settings failed validation and have been reset to defaults.
          </AlertDescription>
        </Alert>
      )}

      <Form {...form}>
        <form onSubmit={handleSubmit(data => saveMutation.mutateAsync(data))} className="space-y-4">

          {/* Enabled toggle */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Autopilot</CardTitle>
              <CardDescription className="text-xs">
                When enabled, the system will automatically scan and enqueue agent jobs every 5 minutes.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <FormField
                control={form.control}
                name="autopilotEnabled"
                render={({ field }) => (
                  <FormItem className="flex items-center justify-between">
                    <div>
                      <FormLabel className="text-sm font-medium">Enable Autopilot</FormLabel>
                      <FormDescription className="text-xs">
                        Overrides the server AUTOPILOT_ENABLE env var for this org.
                      </FormDescription>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                        data-testid="toggle-autopilot-enabled"
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Quiet hours */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Quiet Hours (UTC)</CardTitle>
              <CardDescription className="text-xs">
                No new jobs will be enqueued during this window.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <div className="flex items-center gap-3">
                <FormField
                  control={form.control}
                  name="quietHoursUtc.start"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel className="text-xs">Start (HH:MM)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="22:00"
                          className="font-mono text-sm"
                          data-testid="input-quiet-hours-start"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <div className="pt-5 text-muted-foreground text-sm">to</div>
                <FormField
                  control={form.control}
                  name="quietHoursUtc.end"
                  render={({ field }) => (
                    <FormItem className="flex-1">
                      <FormLabel className="text-xs">End (HH:MM)</FormLabel>
                      <FormControl>
                        <Input
                          {...field}
                          placeholder="06:00"
                          className="font-mono text-sm"
                          data-testid="input-quiet-hours-end"
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              </div>
            </CardContent>
          </Card>

          {/* Per-day cap */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Per-Day Cap</CardTitle>
              <CardDescription className="text-xs">
                Maximum number of new jobs to enqueue per day for this org.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4">
              <FormField
                control={form.control}
                name="perDayCap"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <Input
                        type="number"
                        min={0}
                        max={100000}
                        {...field}
                        onChange={e => field.onChange(parseInt(e.target.value, 10))}
                        className="w-32 font-mono text-sm"
                        data-testid="input-per-day-cap"
                      />
                    </FormControl>
                    <FormDescription className="text-xs">Range: 0 – 100,000</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Task type allow / deny */}
          <Card>
            <CardHeader className="pb-2 pt-4 px-4">
              <CardTitle className="text-sm font-semibold">Task Type Filter</CardTitle>
              <CardDescription className="text-xs">
                Limit which task types the autopilot will enqueue. Allow list takes priority over deny list — if any tasks are in Allow, Deny is ignored.
              </CardDescription>
            </CardHeader>
            <CardContent className="px-4 pb-4 space-y-4">
              <FormField
                control={form.control}
                name="taskTypeAllow"
                render={({ field }) => (
                  <FormItem>
                    <TaskTypeList
                      label="Allow Only"
                      selected={field.value ?? []}
                      onChange={v => field.onChange(v.length ? v : null)}
                      excludedByOther={[]}
                      testPrefix="button-allow"
                    />
                    <FormDescription className="text-xs mt-1">
                      If set, autopilot will only enqueue these task types.
                    </FormDescription>
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="taskTypeDeny"
                render={({ field }) => (
                  <FormItem>
                    <TaskTypeList
                      label="Deny List"
                      selected={field.value ?? []}
                      onChange={v => field.onChange(v.length ? v : null)}
                      excludedByOther={allowList}
                      testPrefix="button-deny"
                    />
                    <FormDescription className="text-xs mt-1">
                      {allowList.length > 0
                        ? 'Deny list is ignored when Allow list is non-empty.'
                        : 'These task types will never be auto-enqueued.'}
                    </FormDescription>
                  </FormItem>
                )}
              />
            </CardContent>
          </Card>

          {/* Effective Policy summary */}
          <Card className="bg-muted/40">
            <CardContent className="px-4 py-3">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">
                Effective Policy
              </div>
              <PolicySummary values={values} />
            </CardContent>
          </Card>

          {/* Save / Cancel */}
          <div className="flex items-center justify-between pt-1">
            <div className="flex items-center gap-3">
              <Button
                type="submit"
                disabled={!isDirty || isSubmitting || saveMutation.isPending}
                data-testid="button-save-autopilot"
              >
                {saveMutation.isPending ? 'Saving…' : 'Save Changes'}
              </Button>
              <Button
                type="button"
                variant="ghost"
                disabled={!isDirty}
                onClick={() => reset()}
                data-testid="button-cancel-autopilot"
              >
                Cancel
              </Button>
            </div>
            {savedAt && (
              <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="h-3.5 w-3.5" />
                Saved at {savedAt}
              </div>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
