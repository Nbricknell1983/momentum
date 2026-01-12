import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Loader2, RefreshCw, Send, Copy, MessageSquare, Mail, Sparkles, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Lead, LeadSourceData } from '@/lib/types';

interface AIMessageModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  channel: 'sms' | 'email';
  lead?: Lead;
  client?: {
    id: string;
    businessName: string;
    phone?: string;
    email?: string;
    contactName?: string;
    notes?: string;
  };
  activityHistory?: string[];
}

interface GeneratedMessage {
  channel: string;
  framework: string;
  frameworkReason: string;
  message?: string;
  subject?: string;
  body?: string;
  recipientPhone?: string;
  recipientEmail?: string;
  companyName: string;
}

export function AIMessageModal({ 
  open, 
  onOpenChange, 
  channel, 
  lead, 
  client,
  activityHistory = []
}: AIMessageModalProps) {
  const { toast } = useToast();
  const [isGenerating, setIsGenerating] = useState(false);
  const [generated, setGenerated] = useState<GeneratedMessage | null>(null);
  const [editedMessage, setEditedMessage] = useState('');
  const [editedSubject, setEditedSubject] = useState('');
  const [userContext, setUserContext] = useState('');

  const entity = lead || client;
  const entityName = lead?.companyName || client?.businessName || 'Unknown';
  const entityPhone = lead?.phone || client?.phone;
  const entityEmail = lead?.email || client?.email;
  const entityContactName = lead?.contactName || client?.contactName;
  const entityNotes = lead?.notes || client?.notes;
  const entityStage = lead?.stage;

  useEffect(() => {
    if (open && entity) {
      generateMessage();
    }
  }, [open]);

  useEffect(() => {
    if (generated) {
      if (channel === 'sms' && generated.message) {
        setEditedMessage(generated.message);
      } else if (channel === 'email') {
        setEditedSubject(generated.subject || '');
        setEditedMessage(generated.body || '');
      }
    }
  }, [generated, channel]);

  const generateMessage = async () => {
    if (!entity) return;

    setIsGenerating(true);
    try {
      const response = await fetch('/api/messages/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel,
          companyName: entityName,
          phone: entityPhone,
          email: entityEmail,
          stage: entityStage,
          notes: entityNotes,
          sourceData: lead?.sourceData,
          activityHistory,
          contactName: entityContactName,
          userContext: userContext || undefined
        })
      });

      if (!response.ok) {
        throw new Error('Failed to generate message');
      }

      const data = await response.json();
      setGenerated(data);
    } catch (error) {
      console.error('Error generating message:', error);
      toast({
        title: 'Error',
        description: 'Failed to generate message. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleRegenerate = () => {
    generateMessage();
  };

  const handleCopy = () => {
    const textToCopy = channel === 'email' 
      ? `Subject: ${editedSubject}\n\n${editedMessage}`
      : editedMessage;
    navigator.clipboard.writeText(textToCopy);
    toast({
      title: 'Copied',
      description: 'Message copied to clipboard'
    });
  };

  const handleSend = () => {
    if (channel === 'sms' && entityPhone) {
      const encodedMessage = encodeURIComponent(editedMessage);
      window.open(`sms:${entityPhone}?body=${encodedMessage}`, '_self');
    } else if (channel === 'email' && entityEmail) {
      const encodedSubject = encodeURIComponent(editedSubject);
      const encodedBody = encodeURIComponent(editedMessage);
      window.open(`mailto:${entityEmail}?subject=${encodedSubject}&body=${encodedBody}`, '_self');
    }
    onOpenChange(false);
  };

  const getFrameworkColor = (framework: string) => {
    switch (framework) {
      case 'NEPQ': return 'bg-purple-100 text-purple-700 border-purple-200 dark:bg-purple-900/30 dark:text-purple-300';
      case 'Jeb Blount': return 'bg-orange-100 text-orange-700 border-orange-200 dark:bg-orange-900/30 dark:text-orange-300';
      case 'Chris Voss': return 'bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {channel === 'sms' ? (
              <MessageSquare className="h-5 w-5 text-green-600" />
            ) : (
              <Mail className="h-5 w-5 text-blue-600" />
            )}
            AI-Generated {channel === 'sms' ? 'Text Message' : 'Email'}
          </DialogTitle>
          <DialogDescription>
            Personalized message for {entityName}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {isGenerating ? (
            <div className="flex flex-col items-center justify-center py-8 gap-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">Generating personalized message...</p>
            </div>
          ) : generated ? (
            <>
              <div className="flex items-center gap-2 flex-wrap">
                <Badge variant="outline" className={getFrameworkColor(generated.framework)}>
                  <Sparkles className="h-3 w-3 mr-1" />
                  {generated.framework}
                </Badge>
                <span className="text-xs text-muted-foreground">{generated.frameworkReason}</span>
              </div>

              {channel === 'email' && (
                <div className="space-y-2">
                  <Label className="text-xs">Subject Line</Label>
                  <Input
                    value={editedSubject}
                    onChange={(e) => setEditedSubject(e.target.value)}
                    placeholder="Email subject..."
                    data-testid="input-email-subject"
                  />
                </div>
              )}

              <div className="space-y-2">
                <Label className="text-xs">{channel === 'sms' ? 'Message' : 'Email Body'}</Label>
                <Textarea
                  value={editedMessage}
                  onChange={(e) => setEditedMessage(e.target.value)}
                  rows={channel === 'sms' ? 4 : 8}
                  placeholder="Your message..."
                  className="resize-none"
                  data-testid="textarea-message-body"
                />
                {channel === 'sms' && (
                  <p className="text-xs text-muted-foreground">
                    {editedMessage.length} characters 
                    {editedMessage.length > 160 && <span className="text-amber-600"> (may be split into multiple texts)</span>}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label className="text-xs">Add Context (optional)</Label>
                <Input
                  value={userContext}
                  onChange={(e) => setUserContext(e.target.value)}
                  placeholder="E.g., 'mention our holiday special' or 'they seemed busy last time'"
                  data-testid="input-user-context"
                />
              </div>

              <div className="flex items-center gap-2 flex-wrap pt-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRegenerate}
                  disabled={isGenerating}
                  className="gap-1.5"
                  data-testid="button-regenerate"
                >
                  <RefreshCw className="h-3 w-3" />
                  Regenerate
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCopy}
                  className="gap-1.5"
                  data-testid="button-copy-message"
                >
                  <Copy className="h-3 w-3" />
                  Copy
                </Button>
                <Button
                  size="sm"
                  onClick={handleSend}
                  disabled={!editedMessage || (channel === 'sms' ? !entityPhone : !entityEmail)}
                  className="gap-1.5 ml-auto"
                  data-testid="button-send-message"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open in {channel === 'sms' ? 'Messages' : 'Email'}
                </Button>
              </div>

              {channel === 'sms' && !entityPhone && (
                <p className="text-xs text-amber-600">No phone number available for this contact</p>
              )}
              {channel === 'email' && !entityEmail && (
                <p className="text-xs text-amber-600">No email address available for this contact</p>
              )}
            </>
          ) : (
            <div className="text-center py-8">
              <p className="text-sm text-muted-foreground">No message generated yet</p>
              <Button onClick={generateMessage} className="mt-4">Generate Message</Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
