import { createClient } from '@supabase/supabase-js';

export async function GET() {
  try {
	const supabase = createClient(
		process.env.NEXT_PUBLIC_SUPABASE_URL!,
		process.env.SUPABASE_SERVICE_ROLE_KEY!
	);
  
	const { data, error } = await supabase
		.from('winners')
		.select('*');

	if (error) throw error;

	for (const winner of data) {
		const winnerAddress = winner.winner_address;
		
		const dataRes = await fetch(`https://www.fc-data.xyz/address/${winnerAddress}`);
		
		if (!dataRes.ok) {
			continue;
		}
		
		const data = await dataRes.json();

		const farcasterUsername = data.username;
		const displayName = data.displayName;
		const twitterUsername = data.accounts.find((account: any) => account.platform === 'x')?.username;
		
		const updatedData: Record<string, string> = {};
		
		if (farcasterUsername !== winner.farcaster_username) {
			updatedData.farcaster_username = farcasterUsername;
		}
		if (displayName !== winner.display_name) {
			updatedData.display_name = displayName;
		}
		if (twitterUsername !== winner.twitter_username) {
			updatedData.twitter_username = twitterUsername;
		}

		if (Object.keys(updatedData).length === 0) {
			continue;
		}

		await supabase
			.from('winners')
			.update(updatedData)
			.eq('token_id', winner.token_id);
	}
  } catch (error) {
    return Response.json({ error: 'Failed to refresh winners' }, { status: 500 });
  }
}
