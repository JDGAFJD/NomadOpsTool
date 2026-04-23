import { NextResponse } from 'next/server';
import { AIService } from '@/lib/services/AIService';

export async function POST(request: Request) {
  try {
    const aiService = new AIService();
    
    if (!aiService.isConfigured()) {
      return NextResponse.json({ error: 'OpenAI integration is not configured' }, { status: 500 });
    }

    const body = await request.json();
    const { threads, chargebeeData, thingSpaceRecords, commerceData, customPrompt } = body;

    const reply = await aiService.generateSuggestion({
      threads,
      chargebeeData,
      thingSpaceRecords,
      commerceData,
      customPrompt
    });

    return NextResponse.json({ reply });
  } catch (error: any) {
    console.error('AI Suggestion Route Error:', error);
    return NextResponse.json({ error: error.message || 'Internal Server Error' }, { status: 500 });
  }
}
