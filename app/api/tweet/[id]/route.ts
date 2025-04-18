import { fetchTweet } from 'react-tweet/api';
import { NextRequest, NextResponse } from 'next/server';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  const id = params.id;

  try {
    const tweet = await fetchTweet(id);
    return NextResponse.json(tweet);
  } catch (error) {
    console.error('Error fetching tweet:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tweet' },
      { status: 500 }
    );
  }
} 