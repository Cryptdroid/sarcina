import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { tasks, planner, mood } = await request.json();

    // Mock LLM response
    const priorityScores = tasks.map((task: any) => ({
      ...task,
      priorityScore: Math.random(),
    }));

    const ambientTheme = mood === 'Focus' ? 'fuchsia-500/30' : 'emerald-500/20';

    return NextResponse.json({ priorityScores, ambientTheme });
  } catch (error) {
    console.error('Error in AI orchestration:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
