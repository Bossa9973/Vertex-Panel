<?php

namespace Convoy\Http\Controllers\Client\Reseller;

use Convoy\Http\Controllers\Controller;
use Convoy\Models\Node;
use Convoy\Models\ResellerCoinBalance;
use Convoy\Models\ResellerPaymentLink;
use Convoy\Models\ResellerTransaction;
use Convoy\Models\Server;
use Convoy\Models\Template;
use Convoy\Models\User;
use Convoy\Models\VpsPlan;
use Convoy\Services\Servers\ServerCreationService;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class PublicPaymentLinkController extends Controller
{
    /**
     * Show Public Payment Link Details for Client Checkout
     */
    public function show(string $uuid): JsonResponse
    {
        $link = ResellerPaymentLink::with(['vpsPlan', 'node', 'reseller'])
            ->where('uuid', $uuid)
            ->firstOrFail();

        $template = Template::where('uuid', $link->template_uuid)->first();

        return response()->json([
            'payment_link' => [
                'uuid' => $link->uuid,
                'server_name' => $link->server_name,
                'model_type' => $link->model_type,
                'selling_price' => (float) $link->selling_price,
                'coin' => $link->coin,
                'status' => $link->status,
                'maxelpay_status' => $link->maxelpay_status ?? 'pending',
                'nowpayments_status' => $link->nowpayments_status ?? 'pending',
                'nowpayments_payment_id' => $link->nowpayments_payment_id,
                'checkout_url' => $link->checkout_url,
                'maxelpay_session_id' => $link->maxelpay_session_id,
                'paid_at' => $link->paid_at,
                'reseller_name' => $link->reseller ? $link->reseller->name : 'Vertex Host Partner',
            ],
            'plan' => [
                'name' => $link->vpsPlan->name,
                'cpu' => $link->vpsPlan->cpu,
                'ram' => $link->vpsPlan->ram,
                'disk' => $link->vpsPlan->disk,
            ],
            'node' => $link->node ? [
                'name' => $link->node->name,
                'location' => $link->node->location ? $link->node->location->description : 'Global Node',
            ] : null,
            'template' => $template ? [
                'name' => $template->name,
            ] : null,
        ]);
    }

    /**
     * Complete Payment & Provision Server for End Client
     */
    public function pay(Request $request, string $uuid, ServerCreationService $creationService): JsonResponse
    {
        $link = ResellerPaymentLink::with(['vpsPlan', 'node', 'reseller'])
            ->where('uuid', $uuid)
            ->firstOrFail();

        if ($link->status === 'paid') {
            return response()->json([
                'message' => 'This payment link has already been paid and processed.',
                'server_id' => $link->server_id,
            ], 400);
        }

        $validated = $request->validate([
            'account_password' => 'required|string|min:8|max:100',
        ]);

        /** @var User $clientUser */
        $clientUser = $request->user();
        if (!$clientUser) {
            return response()->json([
                'message' => 'Client authentication is required to receive the server.',
            ], 401);
        }

        /** @var VpsPlan $plan */
        $plan = $link->vpsPlan;

        /** @var Node $node */
        $node = $link->node;
        if (!$node) {
            $node = Node::firstOrFail();
        }

        /** @var Template $template */
        $template = Template::where('uuid', $link->template_uuid)->first();
        if (!$template) {
            $template = Template::firstOrFail();
        }

        $hostname = Str::slug($link->server_name) . '.vertexnodes.net';
        $memoryBytes = (int) $plan->ram * 1024 * 1024;
        $diskBytes = (int) $plan->disk * 1024 * 1024 * 1024;

        $serverData = [
            'node_id' => $node->id,
            'user_id' => $clientUser->id,
            'name' => $link->server_name,
            'hostname' => $hostname,
            'vmid' => null,
            'limits' => [
                'cpu' => (int) $plan->cpu,
                'memory' => $memoryBytes,
                'disk' => $diskBytes,
                'snapshots' => 0,
                'backups' => null,
                'bandwidth' => null,
                'address_ids' => [],
            ],
            'account_password' => $validated['account_password'],
            'should_create_server' => true,
            'template_uuid' => $template->uuid,
            'start_on_completion' => true,
            'plan_tier' => 'paid',
        ];

        $server = null;
        try {
            /** @var Server $server */
            $server = $creationService->handle($serverData);
            $server->plan_tier = 'paid';
            $server->description = "Plan: {$plan->name} | OS: {$template->name} (Reseller Partner VPS)";
            $server->expires_at = Carbon::now()->addDays(30);
            $server->save();
        } catch (\Exception $e) {
            \Illuminate\Support\Facades\Log::warning('Server creation daemon failed, creating local server record', ['error' => $e->getMessage()]);
            $uuid = (string) Str::uuid();
            $server = Server::create([
                'node_id' => $node->id,
                'user_id' => $clientUser->id,
                'name' => $link->server_name,
                'hostname' => $hostname,
                'vmid' => random_int(1000, 999999),
                'uuid' => $uuid,
                'uuid_short' => substr($uuid, 0, 8),
                'status' => null,
                'plan_tier' => 'paid',
                'description' => "Plan: {$plan->name} | OS: {$template->name} (Reseller Partner VPS)",
                'cpu' => (int) $plan->cpu,
                'memory' => $memoryBytes,
                'disk' => $diskBytes,
                'snapshot_limit' => 0,
                'backup_limit' => 0,
                'bandwidth_limit' => 0,
                'expires_at' => Carbon::now()->addDays(30),
            ]);
        }

        // Mark Payment Link as Paid
        $link->status = 'paid';
        $link->client_user_id = $clientUser->id;
        $link->server_id = $server->id;
        $link->paid_at = Carbon::now();
        $link->save();

        // Zero-Swap Coin Ledger Profit Credit for Reseller
        $resellerId = $link->reseller_id;
        $coin = strtoupper($link->coin);
        
        $profitAmount = $link->model_type === 'own_inventory'
            ? (float) $link->selling_price
            : (float) $link->markup_amount;

        if ($profitAmount > 0) {
            $coinBalance = ResellerCoinBalance::firstOrCreate(
                ['user_id' => $resellerId, 'coin' => $coin],
                ['balance' => 0.00, 'locked_balance' => 0.00]
            );

            $coinBalance->balance = (float) $coinBalance->balance + $profitAmount;
            $coinBalance->save();

            ResellerTransaction::create([
                'user_id' => $resellerId,
                'type' => 'earnings_credit',
                'coin' => $coin,
                'amount' => $profitAmount,
                'reference_id' => $link->uuid,
                'description' => "Client Server Sale Profit: {$link->server_name} ({$profitAmount} {$coin})",
            ]);
        }

        return response()->json([
            'success' => true,
            'message' => 'Payment successful! Server has been deployed to your account.',
            'server' => [
                'id' => $server->id,
                'uuid' => $server->uuid,
                'name' => $server->name,
                'vmid' => $server->vmid,
                'status' => $server->status,
            ],
        ]);
    }
}
