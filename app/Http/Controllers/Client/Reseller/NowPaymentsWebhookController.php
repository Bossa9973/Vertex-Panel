<?php

namespace Convoy\Http\Controllers\Client\Reseller;

use Carbon\Carbon;
use Convoy\Http\Controllers\Controller;
use Convoy\Models\ResellerCoinBalance;
use Convoy\Models\ResellerPaymentLink;
use Convoy\Models\ResellerTransaction;
use Convoy\Models\Server;
use Convoy\Models\Template;
use Convoy\Services\NowPaymentsService;
use Convoy\Services\Servers\ServerCreationService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Log;
use Illuminate\Support\Str;

class NowPaymentsWebhookController extends Controller
{
    public function handle(Request $request, NowPaymentsService $nowpayments, ServerCreationService $creationService): JsonResponse
    {
        $rawPayload = $request->getContent();
        $signature  = $request->header('x-nowpayments-sig', '');

        // Verify IPN signature
        if (!$nowpayments->verifyIpnSignature($rawPayload, $signature)) {
            Log::warning('NOWPayments IPN signature verification failed', [
                'ip'        => $request->ip(),
                'signature' => $signature,
            ]);
            return response()->json(['message' => 'Invalid signature'], 401);
        }

        $data          = $request->all();
        $paymentStatus = $data['payment_status'] ?? '';
        $orderId       = $data['order_id'] ?? null;

        Log::info('NOWPayments IPN received', [
            'payment_status' => $paymentStatus,
            'order_id'       => $orderId,
            'payment_id'     => $data['payment_id'] ?? null,
        ]);

        // Only process finished / confirmed payments
        if (!in_array($paymentStatus, ['finished', 'confirmed', 'partially_paid'], true)) {
            return response()->json(['message' => 'Status ignored: ' . $paymentStatus], 200);
        }

        if (!$orderId) {
            return response()->json(['message' => 'Missing order_id'], 400);
        }

        // Extract UUID from order_id (format: RESELLER-{uuid})
        $uuid = Str::after($orderId, 'RESELLER-');

        $link = ResellerPaymentLink::where('uuid', $uuid)
            ->where('status', 'pending')
            ->first();

        if (!$link) {
            Log::info('NOWPayments IPN: link not found or already paid', ['uuid' => $uuid]);
            return response()->json(['message' => 'Link not found or already processed'], 200);
        }

        // Mark the payment as received
        $link->nowpayments_status = 'paid';
        $link->save();

        // Provision VPS server
        $plan     = $link->vpsPlan;
        $node     = $link->node ?? \Convoy\Models\Node::firstOrFail();
        $template = Template::where('uuid', $link->template_uuid)->first() ?? Template::firstOrFail();

        $clientUserId = $link->client_user_id ?? $link->reseller_id;
        $hostname     = Str::slug($link->server_name) . '.vertexnodes.net';
        $memoryBytes  = (int) $plan->ram  * 1024 * 1024;
        $diskBytes    = (int) $plan->disk * 1024 * 1024 * 1024;

        $serverData = [
            'node_id'             => $node->id,
            'user_id'             => $clientUserId,
            'name'                => $link->server_name,
            'hostname'            => $hostname,
            'vmid'                => null,
            'limits'              => [
                'cpu'         => (int) $plan->cpu,
                'memory'      => $memoryBytes,
                'disk'        => $diskBytes,
                'snapshots'   => 0,
                'backups'     => null,
                'bandwidth'   => null,
                'address_ids' => [],
            ],
            'account_password'    => Str::random(16),
            'should_create_server'=> true,
            'template_uuid'       => $template->uuid,
            'start_on_completion' => true,
            'plan_tier'           => 'paid',
        ];

        $server = null;
        try {
            /** @var Server $server */
            $server = $creationService->handle($serverData);
            $server->plan_tier   = 'paid';
            $server->description = "Plan: {$plan->name} | OS: {$template->name} (Reseller VPS)";
            $server->expires_at  = Carbon::now()->addDays(30);
            $server->save();
        } catch (\Exception $e) {
            Log::warning('NOWPayments IPN: daemon unreachable, creating local server record', ['error' => $e->getMessage()]);
            $newUuid = (string) Str::uuid();
            $server  = Server::create([
                'node_id'          => $node->id,
                'user_id'          => $clientUserId,
                'name'             => $link->server_name,
                'hostname'         => $hostname,
                'vmid'             => random_int(1000, 999999),
                'uuid'             => $newUuid,
                'uuid_short'       => substr($newUuid, 0, 8),
                'status'           => null,
                'plan_tier'        => 'paid',
                'description'      => "Plan: {$plan->name} | OS: {$template->name} (Reseller VPS)",
                'cpu'              => (int) $plan->cpu,
                'memory'           => $memoryBytes,
                'disk'             => $diskBytes,
                'snapshot_limit'   => 0,
                'backup_limit'     => 0,
                'bandwidth_limit'  => 0,
                'expires_at'       => Carbon::now()->addDays(30),
            ]);
        }

        // Mark link as paid & provisioned
        $link->status    = 'paid';
        $link->server_id = $server->id;
        $link->paid_at   = Carbon::now();
        $link->save();

        // Credit reseller profit in the exact coin
        $resellerId   = $link->reseller_id;
        $coin         = strtoupper($link->coin);
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
                'user_id'      => $resellerId,
                'type'         => 'earnings_credit',
                'coin'         => $coin,
                'amount'       => $profitAmount,
                'reference_id' => $link->uuid,
                'description'  => "Client sale: {$link->server_name} ({$profitAmount} {$coin}) via NOWPayments",
            ]);
        }

        Log::info('NOWPayments IPN: server provisioned', [
            'server_id' => $server->id,
            'link_uuid' => $link->uuid,
        ]);

        return response()->json(['success' => true, 'server_id' => $server->id]);
    }
}
