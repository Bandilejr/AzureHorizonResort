import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { sendChatMessage, listenForChatMessages } from '@/services/firebase-services';
import { MOCK_ROOM_GUIDE } from '@/services/mock-data';
import { GoogleGenerativeAI } from '@google/generative-ai';
import type { ChatMessage, GuideSection, User as CustomUser } from '@/types';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Input } from '@/components/ui/input';
import { 
  MessageSquare, 
  BookOpen, 
  Send, 
  Bot,
  MapPin,
  UtensilsCrossed,
  Sparkles,
  Palmtree,
  Home,
  Wifi,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Zap
} from 'lucide-react';

interface GuestExperienceProps {
  onBack: () => void;
}

export function GuestExperience({ onBack }: GuestExperienceProps) {
  const { user } = useAuth();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  // FIX: Initialized with mock data directly to avoid cascading render warning
  const [guideSections] = useState<GuideSection[]>(MOCK_ROOM_GUIDE);
  const [expandedSection, setExpandedSection] = useState<string | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    // FIX: Using CustomUser type instead of any, handling both id and uid
    const u = user as CustomUser & { uid?: string };
    const userId = u?.id || u?.uid;
    
    if (!userId) return;

    const unsubscribe = listenForChatMessages(userId, (updatedMessages) => {
      setMessages(updatedMessages as ChatMessage[]);
    });
    
    return () => unsubscribe();
  }, [user]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSendMessage = async () => {
    if (!newMessage.trim() || !user) return;

    const u = user as CustomUser & { uid?: string };
    const userId = u?.id || u?.uid || 'guest';
    const userName = u?.name || 'Guest';
    const userMsg = newMessage;
    setNewMessage('');

    // Save the guest's message
    await sendChatMessage({
      senderId: userId,
      senderName: userName,
      senderRole: 'guest',
      message: userMsg,
      isRead: false
    } as ChatMessage);

    setIsTyping(true);

    // Generate AI response
    try {
      // Phase 1: Gemini key removed from client. Local keyword fallback only.
      const GEMINI_API_KEY = '';
      let aiResponse = '';

      if (GEMINI_API_KEY) {
        const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });

        const systemPrompt = `You are the AI Concierge for Azure Horizon Resort, a luxury 5-star coastal resort. Your name is Azure.

Resort details:
- Restaurant: Open 7am-10pm, serves South African & international cuisine. Signature dishes include Bobotie and Malva Pudding.
- Pool: Open 6am-9pm. Heated infinity pool overlooking the ocean. Towels provided poolside.
- Spa: Open 9am-7pm. Offers massages, facials, aromatherapy. Book via the Spa Services tab.
- Tours: Daily excursions including harbour tours, whale watching, sunset cruises. Book via Tours & Excursions tab.
- Room Service: Available for checked-in residents. Request housekeeping or maintenance via the Room Service tab.
- Checkout: Standard checkout is 11am. Late checkout available for Gold/Platinum loyalty members.
- WiFi: Complimentary throughout the resort. Network: AzureHorizon_Guest, Password: Welcome2Azure
- Billing: All charges can be viewed in the My Bill tab. Residents can charge to room.

Rules:
- Be warm, professional, concise (2-3 sentences max).
- If asked about something outside the resort, politely redirect.
- Always suggest the relevant app feature/tab when applicable.
- Use emojis sparingly for warmth.`;

        const result = await model.generateContent([
          { text: systemPrompt },
          { text: `Guest ${u.name} asks: ${userMsg}` }
        ]);
        aiResponse = result.response.text();
      } else {
        // Fallback keyword matching if no API key
        const lower = userMsg.toLowerCase();
        if (lower.includes('pool') || lower.includes('swim')) {
          aiResponse = '🏊 Our heated infinity pool is open from 6am to 9pm daily. Towels are provided poolside. Enjoy the ocean views!';
        } else if (lower.includes('restaurant') || lower.includes('food') || lower.includes('menu') || lower.includes('eat')) {
          aiResponse = '🍽️ Our restaurant is open 7am-10pm. I recommend trying the Bobotie or Malva Pudding! You can browse the full menu in the Restaurant tab.';
        } else if (lower.includes('spa') || lower.includes('massage')) {
          aiResponse = '💆 Our spa is open 9am-7pm with a range of treatments. You can book directly from the Spa Services tab on your dashboard!';
        } else if (lower.includes('tour') || lower.includes('excursion') || lower.includes('whale')) {
          aiResponse = '🚢 We have daily tours including harbour cruises and whale watching! Check the Tours & Excursions tab to browse and book.';
        } else if (lower.includes('checkout') || lower.includes('check out') || lower.includes('bill')) {
          aiResponse = '💳 Standard checkout is at 11am. You can view all your charges in the My Bill tab and download a consolidated invoice.';
        } else if (lower.includes('wifi') || lower.includes('internet')) {
          aiResponse = '📶 WiFi is complimentary! Network: AzureHorizon_Guest, Password: Welcome2Azure. Available throughout the resort.';
        } else {
          aiResponse = '✨ Thank you for reaching out! I\'m here to help with anything about the resort — dining, spa, tours, room service, or billing. What can I assist you with?';
        }
      }

      // Small delay for realism
      await new Promise(r => setTimeout(r, 800));

      // Save AI response as concierge message — route to guest's chat path
      await sendChatMessage({
        senderId: 'azure-concierge',
        senderName: 'Azure AI Concierge',
        senderRole: 'concierge',
        message: aiResponse,
        isRead: false
      } as ChatMessage, userId);
    } catch (error) {
      console.error('AI Concierge error:', error);
      await sendChatMessage({
        senderId: 'azure-concierge',
        senderName: 'Azure AI Concierge',
        senderRole: 'concierge',
        message: 'I apologize for the inconvenience. Please try again or contact our front desk for immediate assistance.',
        isRead: false
      } as ChatMessage, userId);
    } finally {
      setIsTyping(false);
    }
  };

  const getIconForSection = (iconName: string) => {
    const icons: Record<string, React.ElementType> = {
      MapPin, UtensilsCrossed, Sparkles, Palmtree, Home, Wifi,
    };
    const Icon = icons[iconName] || MapPin;
    return <Icon className="h-5 w-5" />;
  };

  const formatTime = (timestamp: string) => {
    if (!timestamp) return '';
    return new Date(timestamp).toLocaleTimeString([], { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
  };

  // Quick action suggestions
  const quickActions = [
    { label: '🍽️ Restaurant Hours', msg: 'What are the restaurant hours?' },
    { label: '🏊 Pool Info', msg: 'Tell me about the pool' },
    { label: '💆 Spa Booking', msg: 'How do I book a spa treatment?' },
    { label: '📶 WiFi Password', msg: 'What is the WiFi password?' },
  ];

  return (
    <div className="max-w-6xl mx-auto">
      <div className="flex items-center gap-4 mb-6">
        <Button variant="ghost" size="icon" onClick={onBack} className="text-[#1e3a5f] dark:text-blue-400">
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div>
          <h2 className="text-2xl font-serif font-bold text-[#1e3a5f] dark:text-white">Guest Experience</h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">AI-powered concierge & room information</p>
        </div>
      </div>

      <Tabs defaultValue="chat" className="w-full">
        <TabsList className="grid w-full grid-cols-2 bg-gray-100 dark:bg-slate-800">
          <TabsTrigger value="chat" className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
            <MessageSquare className="h-4 w-4" />
            AI Concierge
          </TabsTrigger>
          <TabsTrigger value="guide" className="flex items-center gap-2 data-[state=active]:bg-white dark:data-[state=active]:bg-slate-700">
            <BookOpen className="h-4 w-4" />
            Room Guide
          </TabsTrigger>
        </TabsList>

        <TabsContent value="chat" className="mt-4">
          <div className="h-[640px] flex flex-col rounded-2xl overflow-hidden shadow-xl border border-gray-200 dark:border-slate-700">
            
            {/* Chat Header */}
            <div className="bg-gradient-to-r from-[#1e3a5f] to-[#2c5282] px-6 py-4 flex items-center gap-4 shrink-0">
              <div className="relative">
                <div className="w-12 h-12 bg-white/15 backdrop-blur-sm rounded-full flex items-center justify-center border border-white/20">
                  <Bot className="h-6 w-6 text-white" />
                </div>
                <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-green-400 rounded-full border-2 border-[#1e3a5f]" />
              </div>
              <div className="flex-1">
                <h3 className="text-white font-bold text-lg">Azure AI Concierge</h3>
                <div className="flex items-center gap-1.5">
                  <Zap className="h-3 w-3 text-[#c9a227]" />
                  <span className="text-white/70 text-xs">Powered by Gemini AI • Available 24/7</span>
                </div>
              </div>
            </div>

            {/* Chat Messages Area */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-gradient-to-b from-gray-50 to-white dark:from-slate-800 dark:to-slate-900">
              
              {/* Welcome message if no messages */}
              {messages.length === 0 && !isTyping && (
                <div className="flex flex-col items-center justify-center h-full text-center px-6 animate-in fade-in duration-700">
                  <div className="w-20 h-20 bg-gradient-to-br from-[#1e3a5f] to-[#4a7c9b] rounded-2xl flex items-center justify-center mb-5 shadow-lg">
                    <Bot className="h-10 w-10 text-white" />
                  </div>
                  <h3 className="text-lg font-bold text-gray-800 dark:text-white mb-2">Welcome to Azure Concierge</h3>
                  <p className="text-sm text-gray-500 dark:text-gray-400 mb-6 max-w-md">
                    I'm your AI-powered resort assistant. Ask me anything about dining, spa, tours, or resort facilities!
                  </p>
                  <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                    {quickActions.map((qa) => (
                      <button
                        key={qa.label}
                        onClick={() => { setNewMessage(qa.msg); }}
                        className="text-left text-xs p-3 rounded-xl border border-gray-200 dark:border-slate-600 bg-white dark:bg-slate-700 hover:bg-[#1e3a5f]/5 dark:hover:bg-slate-600 hover:border-[#1e3a5f]/30 transition-all text-gray-700 dark:text-gray-200 font-medium"
                      >
                        {qa.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Message Bubbles */}
              {messages.map((message) => (
                <div
                  key={message.id}
                  className={`flex ${
                    message.senderRole === 'guest' ? 'justify-end' : 'justify-start'
                  } animate-in slide-in-from-bottom-2 duration-300`}
                >
                  {/* AI Avatar */}
                  {message.senderRole !== 'guest' && (
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1e3a5f] to-[#4a7c9b] flex items-center justify-center mr-2 mt-1 shrink-0">
                      <Bot className="h-4 w-4 text-white" />
                    </div>
                  )}

                  <div
                    className={`max-w-[75%] ${
                      message.senderRole === 'guest'
                        ? 'bg-gradient-to-br from-[#1e3a5f] to-[#2c5282] text-white rounded-2xl rounded-br-md'
                        : 'bg-white dark:bg-slate-700 text-gray-800 dark:text-gray-100 rounded-2xl rounded-bl-md border border-gray-100 dark:border-slate-600 shadow-sm'
                    } px-4 py-3`}
                  >
                    {message.senderRole !== 'guest' && (
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <Zap className="h-3 w-3 text-[#c9a227]" />
                        <span className="text-[10px] font-bold text-[#c9a227] uppercase tracking-wider">
                          Azure AI
                        </span>
                      </div>
                    )}
                    <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.message}</p>
                    <p className={`text-[10px] mt-1.5 text-right ${
                      message.senderRole === 'guest' ? 'text-white/50' : 'text-gray-400 dark:text-gray-500'
                    }`}>
                      {formatTime(message.timestamp)}
                    </p>
                  </div>
                </div>
              ))}
              
              {/* Typing Indicator */}
              {isTyping && (
                <div className="flex justify-start animate-in fade-in duration-300">
                  <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#1e3a5f] to-[#4a7c9b] flex items-center justify-center mr-2 mt-1 shrink-0">
                    <Bot className="h-4 w-4 text-white" />
                  </div>
                  <div className="bg-white dark:bg-slate-700 rounded-2xl rounded-bl-md px-5 py-4 border border-gray-100 dark:border-slate-600 shadow-sm">
                    <div className="flex items-center gap-1.5">
                      <div className="w-2 h-2 bg-[#1e3a5f] dark:bg-blue-400 rounded-full animate-bounce" />
                      <div className="w-2 h-2 bg-[#1e3a5f] dark:bg-blue-400 rounded-full animate-bounce [animation-delay:0.15s]" />
                      <div className="w-2 h-2 bg-[#1e3a5f] dark:bg-blue-400 rounded-full animate-bounce [animation-delay:0.3s]" />
                    </div>
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="px-4 py-4 bg-white dark:bg-slate-800 border-t border-gray-200 dark:border-slate-700 shrink-0">
              {/* Quick actions row when messages exist */}
              {messages.length > 0 && (
                <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
                  {quickActions.map((qa) => (
                    <button
                      key={qa.label}
                      onClick={() => setNewMessage(qa.msg)}
                      className="text-[10px] px-3 py-1.5 rounded-full border border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 hover:bg-[#1e3a5f]/5 dark:hover:bg-slate-600 whitespace-nowrap text-gray-600 dark:text-gray-300 font-medium transition-colors"
                    >
                      {qa.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="flex gap-2">
                <Input
                  placeholder="Ask me anything about the resort..."
                  value={newMessage}
                  onChange={(e) => setNewMessage(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && handleSendMessage()}
                  className="flex-1 rounded-xl border-gray-200 dark:border-slate-600 bg-gray-50 dark:bg-slate-700 focus-visible:ring-[#c9a227] dark:text-white dark:placeholder:text-gray-500 h-11"
                />
                <Button
                  className="bg-[#1e3a5f] hover:bg-[#163058] text-white rounded-xl h-11 w-11 p-0"
                  onClick={handleSendMessage}
                  disabled={!newMessage.trim() || isTyping}
                >
                  {isTyping ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                </Button>
              </div>
            </div>
          </div>
        </TabsContent>

        <TabsContent value="guide" className="mt-4">
          <div className="grid md:grid-cols-2 gap-4">
            {guideSections.map((section) => (
              <Card 
                key={section.id}
                className={`cursor-pointer transition-all hover:shadow-md border-none shadow-sm ${
                  expandedSection === section.id ? 'ring-2 ring-[#c9a227]' : ''
                }`}
                onClick={() => setExpandedSection(
                  expandedSection === section.id ? null : section.id
                )}
              >
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 bg-[#1e3a5f]/10 dark:bg-[#1e3a5f]/30 rounded-lg flex items-center justify-center text-[#1e3a5f] dark:text-blue-400">
                        {getIconForSection(section.icon)}
                      </div>
                      <CardTitle className="text-lg">{section.title}</CardTitle>
                    </div>
                    <ChevronRight className={`h-5 w-5 text-gray-400 transition-transform ${
                      expandedSection === section.id ? 'rotate-90' : ''
                    }`} />
                  </div>
                </CardHeader>
                
                {expandedSection === section.id && (
                  <CardContent className="pt-0 animate-in slide-in-from-top-2 duration-300">
                    <div className="border-t dark:border-slate-700 pt-4">
                      <p className="text-gray-600 dark:text-gray-300 text-sm leading-relaxed whitespace-pre-line">
                        {section.content}
                      </p>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}