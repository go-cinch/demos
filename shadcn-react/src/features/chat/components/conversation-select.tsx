'use client';

import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import type { Conversation } from '../utils/types';

interface ConversationSelectProps {
  conversations: Conversation[];
  selectedId: string;
  onSelect: (id: string) => void;
}

export function ConversationSelect({
  conversations,
  selectedId,
  onSelect
}: ConversationSelectProps) {
  return (
    <div className='border-border/40 bg-background/75 flex flex-col gap-3 rounded-2xl border p-3 backdrop-blur sm:gap-4 sm:rounded-3xl sm:p-4 lg:hidden'>
      <div className='flex items-center justify-between gap-2 sm:gap-3'>
        <div>
          <p className='text-foreground text-xs font-semibold sm:text-sm'>Messenger</p>
          <p className='text-muted-foreground text-[0.65rem] sm:text-xs'>
            {conversations.length} active conversation
            {conversations.length === 1 ? '' : 's'}
          </p>
        </div>
        <Badge
          variant='outline'
          className='bg-primary/15 text-primary hover:bg-primary/15 hover:text-primary border-border/50 rounded-full border px-2 py-0.5 text-[0.65rem] tracking-[0.2em] uppercase sm:px-3 sm:py-1 sm:text-[0.7rem] sm:tracking-[0.24em]'
        >
          Live
        </Badge>
      </div>
      <div className='space-y-1.5 sm:space-y-2'>
        <label
          htmlFor='messenger-conversation'
          className='text-muted-foreground text-[0.65rem] font-medium sm:text-xs'
        >
          Conversation
        </label>
        <Select value={selectedId} onValueChange={(value) => value != null && onSelect(value)}>
          <SelectTrigger id='messenger-conversation' className='w-full'>
            <SelectValue>{conversations.find((item) => item.id === selectedId)?.name}</SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectGroup>
              {conversations.map((conversation) => (
                <SelectItem key={conversation.id} value={conversation.id}>
                  {conversation.name}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
