import { NextResponse } from 'next/server';
import { getSetting } from '@/lib/db';
import { ChargebeeService } from '@/lib/services/ChargebeeService';
import { ThingSpaceService } from '@/lib/services/ThingSpaceService';
import { FreeScoutService } from '@/lib/services/FreeScoutService';

const tools = [
  {
    type: 'function',
    function: {
      name: 'addPromotionalCredit',
      description: 'Adds promotional credit (in USD) to a Chargebee customer profile.',
      parameters: {
        type: 'object',
        properties: {
          customerId: { type: 'string', description: 'The Chargebee Customer ID' },
          amountInUSD: { type: 'number', description: 'Amount in dollars to credit (e.g. 15.00)' },
          description: { type: 'string', description: 'Reason for the credit' }
        },
        required: ['customerId', 'amountInUSD', 'description']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'updateSubscriptionPlan',
      description: 'Changes the active plan item for a Chargebee subscription.',
      parameters: {
        type: 'object',
        properties: {
          subscriptionId: { type: 'string', description: 'The Chargebee Subscription ID' },
          planId: { type: 'string', description: 'The precise new Plan ID (e.g. nomad-unlimited-travel-plan)' }
        },
        required: ['subscriptionId', 'planId']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'suspendSim',
      description: 'Suspends the data connection for a Verizon SIM card via ThingSpace.',
      parameters: {
        type: 'object',
        properties: { iccid: { type: 'string', description: 'The ICCID of the SIM' } },
        required: ['iccid']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'restoreSim',
      description: 'Restores the data connection for a suspended Verizon SIM card via ThingSpace.',
      parameters: {
        type: 'object',
        properties: { iccid: { type: 'string', description: 'The ICCID of the SIM' } },
        required: ['iccid']
      }
    }
  },
  {
    type: 'function',
    function: {
      name: 'addProfileNote',
      description: 'Leaves a private internal note for the team securely on the FreeScout customer ticket.',
      parameters: {
        type: 'object',
        properties: {
          ticketId: { type: 'number', description: 'The ID of the active FreeScout ticket' },
          text: { type: 'string', description: 'The internal note body' }
        },
        required: ['ticketId', 'text']
      }
    }
  }
];

export async function POST(request: Request) {
  try {
    const openaiKey = getSetting('openai_api_key');
    if (!openaiKey) {
      return NextResponse.json({ error: 'OpenAI API key not configured.' }, { status: 500 });
    }

    const { messages, contextData, ticketId } = await request.json();

    if (!messages || messages.length === 0) {
      return NextResponse.json({ error: 'No messages provided.' }, { status: 400 });
    }

    // Build the system prompt using live contextual data exactly like the Suggestion AI
    const systemInstruction = `
You are an advanced, completely autonomous AI Agent for Nomad Internet's customer support workspace.
You have the ability to execute physical actions on the system using Tools, but ONLY when the user explicitly instructs you to do so. Ensure you verify the exact IDs from the context provided below before triggering a tool. Do NOT guess IDs.

===== LIVE WORKSPACE CONTEXT =====
CHARGEBEE BILLING STATUS:
${JSON.stringify(contextData?.chargebeeData?.customers || 'No Chargebee data', null, 2)}

VERIZON THINGSPACE (SIM/NETWORK) STATUS:
${JSON.stringify(contextData?.thingSpaceRecords || 'No Verizon data', null, 2)}

SHOPIFY & SHIPSTATION (ORDERS & TRACKING) STATUS:
${JSON.stringify(contextData?.commerceData || 'No Order data', null, 2)}

Only execute a tool if the human request explicitly asks for an action. Otherwise, just communicate natively. 
    `;

    // Construct the payload for OpenAI
    const payloadMessages = [
      { role: 'system', content: systemInstruction },
      ...messages
    ];

    const makeOpenAIRequest = async (msgs: any[]) => {
      const res = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${openaiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: msgs,
          tools: tools,
          tool_choice: 'auto',
          temperature: 0.1
        })
      });

      if (!res.ok) {
        throw new Error(`OpenAI Error: ${await res.text()}`);
      }
      return res.json();
    };

    let responseData = await makeOpenAIRequest(payloadMessages);
    let message = responseData.choices[0].message;

    // Handle Tool Calls cleanly in the loop if any exist
    if (message.tool_calls) {
      payloadMessages.push(message); 
      
      const cbService = new ChargebeeService();
      const tsService = new ThingSpaceService();
      const fsService = new FreeScoutService();

      for (const toolCall of message.tool_calls) {
         try {
           const args = JSON.parse(toolCall.function.arguments);
           let result: any = null;

           if (toolCall.function.name === 'addPromotionalCredit') {
              // Convert USD to Cents for Chargebee integer schema
              const cents = Math.round(args.amountInUSD * 100);
              result = await cbService.addPromotionalCredit(args.customerId, cents, args.description);
           } 
           else if (toolCall.function.name === 'updateSubscriptionPlan') {
              result = await cbService.updateSubscriptionPlan(args.subscriptionId, args.planId);
           }
           else if (toolCall.function.name === 'suspendSim') {
              result = await tsService.performAction(args.iccid, 'suspend');
           }
           else if (toolCall.function.name === 'restoreSim') {
              result = await tsService.performAction(args.iccid, 'restore');
           }
           else if (toolCall.function.name === 'addProfileNote') {
              await fsService.addNote(args.ticketId || ticketId, args.text);
              result = { success: true, message: 'Note added to FreeScout successfully.' };
           }

           payloadMessages.push({
             role: 'tool',
             tool_call_id: toolCall.id,
             name: toolCall.function.name,
             content: JSON.stringify(result)
           });
         } catch (e: any) {
           payloadMessages.push({
             role: 'tool',
             tool_call_id: toolCall.id,
             name: toolCall.function.name,
             content: JSON.stringify({ error: e.message })
           });
         }
      }

      // Re-ping OpenAI so it can formulate the final message describing the result of the tools
      responseData = await makeOpenAIRequest(payloadMessages);
      message = responseData.choices[0].message;
    }

    return NextResponse.json({ reply: message.content });

  } catch (error: any) {
    console.error('Agent Orchestration Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
