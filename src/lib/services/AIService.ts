import { getSetting } from '../db';
import { Thread } from './FreeScoutService';
import { UnifiedOrder } from './CommerceService';

export interface AIContextPayload {
  threads: Thread[];
  chargebeeData: any;
  thingSpaceRecords: any[];
  commerceData: UnifiedOrder[];
  customPrompt?: string;
}

export class AIService {
  private openaiKey: string;

  constructor() {
    this.openaiKey = getSetting('openai_api_key') || '';
  }

  isConfigured(): boolean {
    return Boolean(this.openaiKey);
  }

  async generateSuggestion(context: AIContextPayload): Promise<string> {
    if (!this.isConfigured()) {
      throw new Error('OpenAI API Key is not configured in settings.');
    }

    // Build the Knowledge Graph string
    const systemInstruction = `
You are an expert, highly intelligent customer support agent for Nomad Internet.
You resolve customer tickets elegantly and professionally. Do not include signature lines or placeholder values you cannot resolve. Keep tone highly empathetic but authoritative and brief.

===== SUPPORT CONTEXT DATA =====
CHARGEBEE BILLING STATUS:
${JSON.stringify(context.chargebeeData ? context.chargebeeData.customers : 'No Chargebee data', null, 2)}

VERIZON THINGSPACE (SIM/NETWORK) STATUS:
${JSON.stringify(context.thingSpaceRecords || 'No Verizon data', null, 2)}

SHOPIFY & SHIPSTATION (ORDERS & TRACKING) STATUS:
${JSON.stringify(context.commerceData || 'No Order data', null, 2)}

You are replying to the most recent message in the thread. 
Draft a complete, send-ready response. Do not use variables like [Your Name].
Use the provided Billing, Network, and Shipping JSON to deduce the issue immediately (e.g., if they ask about shipping, look at the tracking data; if internet is down, look at their Verizon state or Dues).
`;

    // Process chat history
    const messages: any[] = [{ role: 'system', content: systemInstruction }];
    
    // Sort threads so oldest is first, newest at the end
    const sortedThreads = [...(context.threads || [])].reverse();
    for (const t of sortedThreads) {
      if (t.type === 'message' || t.type === 'customer') {
        const role = t.createdBy?.id === t.customer?.id ? 'user' : 'user'; 
        // FreeScout threads might not easily distinguish user vs agent without id maps, 
        // but 'customer' type usually indicates customer reply.
        const isAgent = t.type !== 'customer' && !t.createdBy?.email?.includes('@thefurman'); 
        messages.push({
           role: isAgent ? 'assistant' : 'user',
           content: t.text || t.body || '[No content]',
        });
      }
    }

    // Custom instruction over-ride
    if (context.customPrompt) {
      messages.push({
        role: 'user',
        content: `I am the agent. Please draft the final response to the customer using this exact direction: "${context.customPrompt}"`
      });
    }

    const requestBody = {
      model: 'gpt-4o',
      messages,
      temperature: 0.7,
      max_tokens: 600,
    };

    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.openaiKey}`
      },
      body: JSON.stringify(requestBody)
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`OpenAI API failed: ${res.status} ${errorText}`);
    }

    const data = await res.json();
    return data.choices[0].message.content;
  }
}
