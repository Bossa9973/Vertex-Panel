<?php

namespace Convoy\Http\Controllers\Api\Client;

use Convoy\Http\Controllers\ApiController;
use Convoy\Models\CreditTransaction;
use Convoy\Models\DiscordClaim;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

class EarnBoltsController extends ApiController
{
    /**
     * List of available Discord tasks and rewards.
     */
    protected array $tasks = [
        'invites_15' => [
            'key' => 'invites_15',
            'title' => '15 Discord Invites',
            'category' => 'invites',
            'requirement_text' => 'Invite 15 members to our Discord server',
            'target_count' => 15,
            'reward_bolts' => 3000.00,
        ],
        'invites_25' => [
            'key' => 'invites_25',
            'title' => '25 Discord Invites',
            'category' => 'invites',
            'requirement_text' => 'Invite 25 members to our Discord server',
            'target_count' => 25,
            'reward_bolts' => 5000.00,
        ],
        'boost_1' => [
            'key' => 'boost_1',
            'title' => '1 Server Boost',
            'category' => 'boosts',
            'requirement_text' => 'Boost our Discord server 1 time',
            'target_count' => 1,
            'reward_bolts' => 3000.00,
        ],
        'boost_2' => [
            'key' => 'boost_2',
            'title' => '2 Server Boosts',
            'category' => 'boosts',
            'requirement_text' => 'Boost our Discord server 2 times',
            'target_count' => 2,
            'reward_bolts' => 5000.00,
        ],
        'messages_200' => [
            'key' => 'messages_200',
            'title' => '200 Messages Sent',
            'category' => 'messages',
            'requirement_text' => 'Send 200 messages in Discord chat channels',
            'target_count' => 200,
            'reward_bolts' => 3000.00,
        ],
        'messages_300' => [
            'key' => 'messages_300',
            'title' => '300 Messages Sent',
            'category' => 'messages',
            'requirement_text' => 'Send 300 messages in Discord chat channels',
            'target_count' => 300,
            'reward_bolts' => 3000.00,
        ],
    ];

    /**
     * Get earn status and list of claimed/unclaimed tasks for authenticated user.
     */
    public function status(Request $request): JsonResponse
    {
        $user = $request->user();
        $claims = DiscordClaim::where('user_id', $user->id)->get()->keyBy('task_key');

        $formattedTasks = [];
        foreach ($this->tasks as $key => $task) {
            $claim = $claims->get($key);
            $formattedTasks[] = array_merge($task, [
                'is_claimed' => !is_null($claim),
                'claimed_at' => $claim ? $claim->claimed_at->toIso8601String() : null,
                'discord_id' => $claim ? $claim->discord_id : $user->discord_id,
            ]);
        }

        return response()->json([
            'success' => true,
            'data' => [
                'user_credits' => (float) $user->credits,
                'discord_id' => $user->discord_id,
                'discord_username' => $user->discord_username,
                'tasks' => $formattedTasks,
            ],
        ]);
    }

    /**
     * Link / connect user's Discord account.
     */
    public function connectDiscord(Request $request): JsonResponse
    {
        $request->validate([
            'discord_id' => 'required|string|min:3',
        ]);

        $user = $request->user();
        $discordId = trim($request->input('discord_id'));
        $discordUsername = trim($request->input('discord_username', $discordId));

        $user->discord_id = $discordId;
        $user->discord_username = $discordUsername;
        $user->save();

        return response()->json([
            'success' => true,
            'message' => 'Discord account successfully linked to your profile!',
            'data' => [
                'discord_id' => $user->discord_id,
                'discord_username' => $user->discord_username,
            ],
        ]);
    }

    /**
     * Verify Discord requirements and claim task reward.
     */
    public function claimReward(Request $request): JsonResponse
    {
        $request->validate([
            'task_key' => 'required|string',
        ]);

        $taskKey = $request->input('task_key');
        $user = $request->user();
        $discordId = trim($request->input('discord_id', $user->discord_id ?? ''));

        if (empty($discordId)) {
            return response()->json([
                'success' => false,
                'message' => 'Please link your Discord account before claiming task rewards.',
            ], 400);
        }

        if (!isset($this->tasks[$taskKey])) {
            return response()->json([
                'success' => false,
                'message' => 'Invalid task selected.',
            ], 422);
        }

        $existingClaim = DiscordClaim::where('user_id', $user->id)
            ->where('task_key', $taskKey)
            ->first();

        if ($existingClaim) {
            return response()->json([
                'success' => false,
                'message' => 'You have already claimed the reward for this task.',
            ], 400);
        }

        $task = $this->tasks[$taskKey];
        $rewardBolts = (float) $task['reward_bolts'];

        // Save linked discord_id on user if not set
        if (!$user->discord_id) {
            $user->discord_id = $discordId;
        }

        $user->credits += $rewardBolts;
        $user->save();

        DiscordClaim::create([
            'user_id' => $user->id,
            'task_key' => $taskKey,
            'discord_id' => $discordId,
            'reward_bolts' => $rewardBolts,
            'claimed_at' => now(),
        ]);

        CreditTransaction::create([
            'user_id' => $user->id,
            'amount' => $rewardBolts,
            'type' => 'discord_reward',
            'description' => "Earned {$rewardBolts} BOLTs for completing Discord Task: {$task['title']} ({$discordId})",
            'reference_id' => $taskKey,
        ]);

        return response()->json([
            'success' => true,
            'message' => "Congratulations! Successfully claimed " . number_format($rewardBolts, 2) . " BOLTs for {$task['title']}!",
            'data' => [
                'task_key' => $taskKey,
                'reward_bolts' => $rewardBolts,
                'new_balance' => (float) $user->credits,
            ],
        ]);
    }
}
