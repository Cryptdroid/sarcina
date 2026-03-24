import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  try {
    const { task } = await request.json();

    // Mock LLM response for sub-tasks
    const subTasks = [
      { id: `sub-${Date.now()}-1`, text: `Sub-task 1 for "${task.text}"`, completed: false },
      { id: `sub-${Date.now()}-2`, text: `Sub-task 2 for "${task.text}"`, completed: false },
      { id: `sub-${Date.now()}-3`, text: `Sub-task 3 for "${task.text}"`, completed: false },
    ];

    return NextResponse.json({ subTasks });
  } catch (error) {
    console.error('Error in AI breakdown:', error);
    return new Response('Internal Server Error', { status: 500 });
  }
}
