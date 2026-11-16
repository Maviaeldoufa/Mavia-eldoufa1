import { Bot, LifeBuoy, MessageSquare, Users } from 'lucide-react';
import { useState } from 'react';
import { useLanguage } from '../../context/LanguageContext';
import { GoldChip } from '../ui/GoldChip';
import { AiChatbotTab } from './AiChatbotTab';
import { BatchChatTab } from './BatchChatTab';
import { GroupLinksTab } from './GroupLinksTab';
import { SupportTicketsTab } from './SupportTicketsTab';

type CommunitySubTab = 'chat' | 'groups' | 'support' | 'ai';

export function CommunitySection() {
  const { tr } = useLanguage();
  const [activeTab, setActiveTab] = useState<CommunitySubTab>('chat');

  return (
    <div className="space-y-6">
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="space-y-1">
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F5F0E6]">
            {tr('مجتمع MVIA (Community)', 'MVIA Community Hub')}
          </h1>
          <p className="text-xs sm:text-sm text-[#A8A29E]">
            {tr(
              'تواصل مباشرة مع دفعتك داخل المنصة، انضم لجروبات الدفعات، أرسل تذكرة دعم فني، أو تحدث مع مساعد الذكاء الاصطناعي للتعرف على المنصة',
              'Chat live with your batch inside MVIA, join official groups, open support tickets, or ask the AI Guide about the platform'
            )}
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 p-2 rounded-2xl bg-[#121216] border border-white/10 w-fit">
        <GoldChip
          active={activeTab === 'chat'}
          layoutId="community-subtab"
          onClick={() => setActiveTab('chat')}
        >
          <MessageSquare className="w-4 h-4" />
          <span>{tr('شات الدفعة المباشر', 'Live Batch Chat')}</span>
        </GoldChip>

        <GoldChip
          active={activeTab === 'groups'}
          layoutId="community-subtab"
          onClick={() => setActiveTab('groups')}
        >
          <Users className="w-4 h-4" />
          <span>{tr('روابط الجروبات', 'Group Links')}</span>
        </GoldChip>

        <GoldChip
          active={activeTab === 'support'}
          layoutId="community-subtab"
          onClick={() => setActiveTab('support')}
        >
          <LifeBuoy className="w-4 h-4" />
          <span>{tr('تذاكر الدعم والبلاغات', 'Support Tickets')}</span>
        </GoldChip>

        <GoldChip
          active={activeTab === 'ai'}
          layoutId="community-subtab"
          onClick={() => setActiveTab('ai')}
        >
          <Bot className="w-4 h-4" />
          <span>{tr('شات بوت الذكاء الاصطناعي', 'AI Platform Guide')}</span>
        </GoldChip>
      </div>

      <section className="rounded-2xl bg-[#121216] border border-white/10 p-5 sm:p-6">
        {activeTab === 'chat' && <BatchChatTab />}
        {activeTab === 'groups' && <GroupLinksTab />}
        {activeTab === 'support' && <SupportTicketsTab />}
        {activeTab === 'ai' && <AiChatbotTab />}
      </section>
    </div>
  );
}
