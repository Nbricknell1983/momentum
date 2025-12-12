import { useState } from 'react';
import { X, Send, Sparkles, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface AgentPanelProps {
  isOpen: boolean;
  onClose: () => void;
  context?: {
    type: 'dashboard' | 'pipeline' | 'lead';
    leadId?: string;
    leadName?: string;
  };
}

// todo: remove mock functionality - replace with actual AI integration
const MOCK_RESPONSES: Record<string, string> = {
  'next best action': `Based on your pipeline snapshot:

1. **Call DataPrime Inc** - Proposal was sent 3 days ago and is now overdue. High-value opportunity ($8,500 MRR). Ask about budget approval status.

2. **Follow up with TechFlow Solutions** - Due today. They need SSO integration info. Prepare technical specs.

3. **Email Quantum Dynamics** - Due tomorrow. Good fit for mid-tier. Send case study on similar implementation.

Rationale: Focus on closing the high-value proposal first, then nurture the discovery lead.`,
  'follow up email': `Here's a professional follow-up email draft:

---

Subject: Next Steps - [Your Company] Proposal

Hi [Contact],

I wanted to follow up on the proposal we sent last week. I understand these decisions take time, and I'm here to help answer any questions your team might have.

Would it be helpful to schedule a brief call this week to address any concerns? I'm available [suggest 2-3 time slots].

Looking forward to hearing from you.

Best regards,
[Your name]

---

Note: Customize the time slots based on your availability.`,
  'meeting prep': `Meeting Preparation for TechFlow Solutions:

**Objective:** Advance from Discovery to Proposal stage

**Agenda:**
1. Review current pain points (5 min)
2. Demo SSO integration capabilities (15 min)  
3. Discuss implementation timeline (10 min)
4. Address pricing and next steps (10 min)

**Key Questions:**
- What's driving the urgency for SSO?
- Who else needs to sign off on this decision?
- What's your ideal go-live date?

**Potential Objections:**
- "We need more security certifications" - Prepare SOC 2 docs
- "Budget is tight" - Offer quarterly billing option

**Close Plan:** Aim to send proposal within 24 hours of meeting`,
};

export default function AgentPanel({ isOpen, onClose, context }: AgentPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: context?.type === 'lead'
        ? `I can help you with ${context.leadName}. Try asking for:\n- Follow-up email/SMS\n- Call script and objection handling\n- NEPQ discovery questions\n- Meeting preparation`
        : 'I can help you with your sales activities. Try asking for:\n- Next best actions\n- End of day debrief\n- Pipeline insights',
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSend = () => {
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: input,
      timestamp: new Date(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    // todo: replace with actual AI call
    setTimeout(() => {
      const lowerInput = input.toLowerCase();
      let response = "I'm analyzing your request. In the full version, I would provide detailed, context-aware coaching based on your pipeline data.";
      
      if (lowerInput.includes('next') || lowerInput.includes('action')) {
        response = MOCK_RESPONSES['next best action'];
      } else if (lowerInput.includes('email') || lowerInput.includes('follow')) {
        response = MOCK_RESPONSES['follow up email'];
      } else if (lowerInput.includes('meeting') || lowerInput.includes('prep')) {
        response = MOCK_RESPONSES['meeting prep'];
      }

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response,
        timestamp: new Date(),
      };
      setMessages(prev => [...prev, assistantMessage]);
      setIsLoading(false);
    }, 1500);
  };

  if (!isOpen) return null;

  return (
    <Card className="fixed bottom-6 right-6 w-96 max-h-[500px] flex flex-col shadow-xl z-50" data-testid="panel-agent">
      <div className="flex items-center justify-between gap-2 p-4 border-b">
        <div className="flex items-center gap-2">
          <Sparkles className="h-5 w-5 text-primary" />
          <h3 className="font-semibold">Momentum Agent</h3>
        </div>
        <Button variant="ghost" size="icon" onClick={onClose} data-testid="button-close-agent">
          <X className="h-4 w-4" />
        </Button>
      </div>
      
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
            >
              <div
                className={`max-w-[85%] rounded-lg p-3 text-sm whitespace-pre-wrap ${
                  message.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-muted'
                }`}
                data-testid={`message-${message.role}-${message.id}`}
              >
                {message.content}
              </div>
            </div>
          ))}
          {isLoading && (
            <div className="flex justify-start">
              <div className="bg-muted rounded-lg p-3">
                <Loader2 className="h-4 w-4 animate-spin" />
              </div>
            </div>
          )}
        </div>
      </ScrollArea>

      <div className="p-4 border-t">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSend();
          }}
          className="flex items-center gap-2"
        >
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Ask for coaching..."
            disabled={isLoading}
            data-testid="input-agent-message"
          />
          <Button type="submit" size="icon" disabled={isLoading || !input.trim()} data-testid="button-send-agent">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
    </Card>
  );
}
