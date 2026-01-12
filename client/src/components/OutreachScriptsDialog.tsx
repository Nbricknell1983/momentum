import { useState } from 'react';
import { Loader2, Sparkles, MessageSquare, Mail, Phone, Copy, FileText } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { Lead, LeadSourceData } from '@/lib/types';

interface OutreachScriptsDialogProps {
  lead: Lead;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScriptsGenerated?: (scripts: { textScript: string; emailScript: string; callScript: string }) => void;
}

interface OutreachScripts {
  textScript: string;
  emailScript: string;
  callScript: string;
}

export function OutreachScriptsDialog({ lead, open, onOpenChange, onScriptsGenerated }: OutreachScriptsDialogProps) {
  const { toast } = useToast();
  const [activeTab, setActiveTab] = useState<'text' | 'email' | 'call'>('text');
  const [isGenerating, setIsGenerating] = useState(false);
  const [scripts, setScripts] = useState<OutreachScripts | null>(null);
  const [reason, setReason] = useState('');

  const sourceData = lead.sourceData as LeadSourceData | undefined;
  const existingScripts = sourceData && (sourceData.textScript || sourceData.emailScript || sourceData.callScript);

  const copyToClipboard = (text: string, type: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied!',
      description: `${type} script copied to clipboard`,
    });
  };

  const generateScripts = async () => {
    setIsGenerating(true);
    
    try {
      const businessSignals: string[] = [];
      
      if (sourceData) {
        if (sourceData.source === 'google_places') {
          if (sourceData.googleReviewCount !== undefined && sourceData.googleReviewCount < 10) {
            businessSignals.push('Likely new business (few reviews)');
          }
          if (sourceData.googleRating && sourceData.googleRating >= 4.5) {
            businessSignals.push('High customer rating');
          }
        }
        if (sourceData.source === 'abr') {
          businessSignals.push('Active ABN - registered business');
        }
        if (sourceData.businessSignals) {
          businessSignals.push(...sourceData.businessSignals);
        }
      }
      
      if (lead.website) businessSignals.push('Has website presence');

      const response = await fetch('/api/leads/generate-outreach-scripts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessName: lead.companyName,
          businessType: 'Business',
          location: lead.territory || lead.address,
          phone: lead.phone,
          website: lead.website,
          rating: sourceData?.source === 'google_places' ? sourceData.googleRating : undefined,
          reviewCount: sourceData?.source === 'google_places' ? sourceData.googleReviewCount : undefined,
          source: sourceData?.source || 'manual',
          addedReason: reason || sourceData?.addedReason || 'Added as a potential prospect',
          businessSignals,
        }),
      });

      if (!response.ok) {
        throw new Error('Failed to generate scripts');
      }

      const newScripts = await response.json();
      setScripts(newScripts);
      onScriptsGenerated?.(newScripts);
      
      toast({
        title: 'Scripts Generated',
        description: 'AI outreach scripts are ready to use',
      });
    } catch (err) {
      console.error('Error generating scripts:', err);
      toast({
        title: 'Error',
        description: 'Failed to generate outreach scripts',
        variant: 'destructive',
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const displayScripts: OutreachScripts | null = scripts || (existingScripts ? {
    textScript: sourceData?.textScript || '',
    emailScript: sourceData?.emailScript || '',
    callScript: sourceData?.callScript || '',
  } : null);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto" data-testid="dialog-outreach-scripts">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Outreach Scripts
          </DialogTitle>
          <DialogDescription>
            AI-generated scripts for {lead.companyName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {!displayScripts && (
            <div className="space-y-4">
              <div className="p-4 bg-muted/50 rounded-lg">
                <p className="text-sm text-muted-foreground">
                  No outreach scripts have been generated for this lead yet. 
                  Add context about why you're reaching out to get personalized scripts.
                </p>
              </div>
              
              <div className="space-y-2">
                <Label htmlFor="outreach-reason">Context for outreach</Label>
                <Textarea
                  id="outreach-reason"
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  placeholder="e.g., New business in my territory, needs help with marketing..."
                  className="min-h-[80px]"
                  data-testid="input-outreach-reason"
                />
              </div>
              
              <Button
                onClick={generateScripts}
                disabled={isGenerating}
                className="w-full gap-2"
                data-testid="button-generate-scripts"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Generating AI Scripts...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Generate Outreach Scripts
                  </>
                )}
              </Button>
            </div>
          )}

          {displayScripts && (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" />
                <span className="font-medium text-sm">AI-Generated Scripts</span>
                <Badge variant="outline" className="text-xs">
                  NEPQ / Jeb Blount / Chris Voss
                </Badge>
              </div>

              <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as 'text' | 'email' | 'call')}>
                <TabsList className="w-full justify-start">
                  <TabsTrigger value="text" className="gap-1" data-testid="tab-script-text">
                    <MessageSquare className="h-3 w-3" />
                    Text
                  </TabsTrigger>
                  <TabsTrigger value="email" className="gap-1" data-testid="tab-script-email">
                    <Mail className="h-3 w-3" />
                    Email
                  </TabsTrigger>
                  <TabsTrigger value="call" className="gap-1" data-testid="tab-script-call">
                    <Phone className="h-3 w-3" />
                    Call
                  </TabsTrigger>
                </TabsList>

                <TabsContent value="text" className="mt-3">
                  <div className="relative">
                    <div className="p-4 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
                      {displayScripts.textScript || 'No text script available'}
                    </div>
                    {displayScripts.textScript && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-7 w-7"
                        onClick={() => copyToClipboard(displayScripts.textScript, 'Text')}
                        data-testid="button-copy-text"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="email" className="mt-3">
                  <div className="relative">
                    <div className="p-4 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap">
                      {displayScripts.emailScript || 'No email script available'}
                    </div>
                    {displayScripts.emailScript && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-7 w-7"
                        onClick={() => copyToClipboard(displayScripts.emailScript, 'Email')}
                        data-testid="button-copy-email"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TabsContent>

                <TabsContent value="call" className="mt-3">
                  <div className="relative">
                    <ScrollArea className="h-48">
                      <div className="p-4 bg-muted/50 rounded-lg text-sm whitespace-pre-wrap pr-8">
                        {displayScripts.callScript || 'No call script available'}
                      </div>
                    </ScrollArea>
                    {displayScripts.callScript && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-2 right-2 h-7 w-7"
                        onClick={() => copyToClipboard(displayScripts.callScript, 'Call')}
                        data-testid="button-copy-call"
                      >
                        <Copy className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </TabsContent>
              </Tabs>

              <Button
                variant="outline"
                size="sm"
                onClick={generateScripts}
                disabled={isGenerating}
                className="gap-1"
                data-testid="button-regenerate-scripts"
              >
                {isGenerating ? (
                  <Loader2 className="h-3 w-3 animate-spin" />
                ) : (
                  <Sparkles className="h-3 w-3" />
                )}
                Regenerate Scripts
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
