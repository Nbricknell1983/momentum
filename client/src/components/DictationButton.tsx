import { Mic, MicOff, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';
import { useEffect, useCallback } from 'react';

interface DictationButtonProps {
  onTranscript: (text: string) => void;
  disabled?: boolean;
  className?: string;
  'data-testid'?: string;
}

export function DictationButton({ 
  onTranscript, 
  disabled = false, 
  className = '',
  'data-testid': testId 
}: DictationButtonProps) {
  const handleResult = useCallback((transcript: string) => {
    onTranscript(transcript);
  }, [onTranscript]);

  const { 
    isListening, 
    startListening, 
    stopListening, 
    isSupported,
  } = useSpeechRecognition(handleResult);

  const handleClick = () => {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  };

  if (!isSupported) {
    return null;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="icon"
          variant={isListening ? 'default' : 'outline'}
          onClick={handleClick}
          disabled={disabled}
          className={`${className} ${isListening ? 'bg-destructive text-destructive-foreground animate-pulse' : ''}`}
          data-testid={testId}
        >
          {isListening ? (
            <MicOff className="h-4 w-4" />
          ) : (
            <Mic className="h-4 w-4" />
          )}
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {isListening ? 'Stop dictating' : 'Start dictating'}
      </TooltipContent>
    </Tooltip>
  );
}
