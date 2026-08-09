<?php

namespace Convoy\Http\Controllers\Client\Reseller;

use Convoy\Http\Controllers\Controller;
use Convoy\Models\Node;
use Convoy\Models\ResellerCoinBalance;
use Convoy\Models\ResellerPaymentLink;
use Convoy\Models\ResellerPlan;
use Convoy\Models\ResellerTransaction;
use Convoy\Models\ResellerWithdrawal;
use Convoy\Models\Template;
use Convoy\Models\User;
use Convoy\Models\VpsPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Str;

class ResellerController extends Controller
{
    /**
     * Get Reseller Overview Stats and Coin Balances
     */
    public function overview(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        // Get or initialize default coin balances
        $coins = ['USDT', 'SOL', 'BTC', 'LTC', 'ETH'];
        $balances = [];

        foreach ($coins as $coin) {
            $record = ResellerCoinBalance::firstOrCreate(
                ['user_id' => $user->id, 'coin' => $coin],
                ['balance' => 0.00, 'locked_balance' => 0.00]
            );
            $balances[] = [
                'coin' => $coin,
                'balance' => (float) $record->balance,
                'locked_balance' => (float) $record->locked_balance,
                'available_balance' => (float) ($record->balance - $record->locked_balance),
            ];
        }

        $totalLinks = ResellerPaymentLink::where('reseller_id', $user->id)->count();
        $paidLinks = ResellerPaymentLink::where('reseller_id', $user->id)->where('status', 'paid')->count();
        $totalWithdrawals = ResellerWithdrawal::where('user_id', $user->id)->count();

        return response()->json([
            'is_reseller' => (bool) ($user->is_reseller || $user->root_admin),
            'balances' => $balances,
            'stats' => [
                'total_links' => $totalLinks,
                'paid_links' => $paidLinks,
                'total_withdrawals' => $totalWithdrawals,
                'min_withdrawal_usd' => 10.00,
            ],
        ]);
    }

    /**
     * Get Reseller Plans and Configured Markups
     */
    public function getPlans(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $vpsPlans = VpsPlan::orderBy('price', 'asc')->get();
        $resellerPlans = ResellerPlan::where('reseller_id', $user->id)->get()->keyBy('vps_plan_id');

        $formatted = $vpsPlans->map(function ($plan) use ($resellerPlans) {
            $rPlan = $resellerPlans->get($plan->id);

            return [
                'vps_plan_id' => $plan->id,
                'name' => $plan->name,
                'base_price' => (float) $plan->price,
                'cpu' => $plan->cpu,
                'ram' => $plan->ram,
                'disk' => $plan->disk,
                'model_type' => $rPlan ? $rPlan->model_type : 'zero_cost',
                'markup_percent' => $rPlan ? (float) $rPlan->markup_percent : 0.00,
                'custom_price' => $rPlan ? (float) $rPlan->custom_price : (float) $plan->price,
                'max_zero_cost_markup' => 30.00,
                'active' => $rPlan ? (bool) $rPlan->active : true,
            ];
        });

        return response()->json([
            'plans' => $formatted,
        ]);
    }

    /**
     * Update/Save Plan Markup Config
     */
    public function savePlanMarkup(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'vps_plan_id' => 'required|integer|exists:vps_plans,id',
            'model_type' => 'required|string|in:own_inventory,zero_cost',
            'markup_percent' => 'required|numeric|min:0',
            'custom_price' => 'required|numeric|min:0',
        ]);

        /** @var User $user */
        $user = $request->user();
        $vpsPlan = VpsPlan::findOrFail($validated['vps_plan_id']);

        if ($validated['model_type'] === 'zero_cost') {
            // Strict 30% markup validation for 0-cost model
            if ($validated['markup_percent'] > 30.00) {
                return response()->json([
                    'message' => 'Zero-Cost model markup is strictly capped at a maximum of 30%.',
                ], 422);
            }
            $calculatedPrice = round($vpsPlan->price * (1 + ($validated['markup_percent'] / 100)), 2);
        } else {
            $calculatedPrice = round($validated['custom_price'], 2);
        }

        $resellerPlan = ResellerPlan::updateOrCreate(
            [
                'reseller_id' => $user->id,
                'vps_plan_id' => $vpsPlan->id,
            ],
            [
                'model_type' => $validated['model_type'],
                'base_price' => $vpsPlan->price,
                'markup_percent' => $validated['markup_percent'],
                'custom_price' => $calculatedPrice,
                'active' => true,
            ]
        );

        return response()->json([
            'message' => 'Reseller plan configuration updated successfully!',
            'plan' => $resellerPlan,
        ]);
    }

    /**
     * Generate a Payment Link for Reseller Client (creates Maxelpay session)
     */
    public function createPaymentLink(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'vps_plan_id' => 'required|integer|exists:vps_plans,id',
            'node_id' => 'required|integer|exists:nodes,id',
            'template_uuid' => 'nullable|string',
            'server_name' => 'required|string|min:2|max:40',
            'coin' => 'required|string|in:USDT,SOL,BTC,LTC,ETH',
        ]);

        /** @var User $user */
        $user = $request->user();
        $vpsPlan = VpsPlan::findOrFail($validated['vps_plan_id']);

        $template = !empty($validated['template_uuid']) 
            ? Template::where('uuid', $validated['template_uuid'])->first()
            : null;
        if (!$template) {
            $template = Template::firstOrFail();
        }
        $templateUuid = $template->uuid;

        $resellerPlan = ResellerPlan::where('reseller_id', $user->id)
            ->where('vps_plan_id', $vpsPlan->id)
            ->first();

        $modelType = $resellerPlan ? $resellerPlan->model_type : ($user->reseller_plan_type ?? 'zero_cost');
        $basePrice = (float) $vpsPlan->price;

        if ($resellerPlan) {
            $sellingPrice = (float) $resellerPlan->custom_price;
            $markupAmount = max(0, $sellingPrice - $basePrice);
        } else {
            $sellingPrice = $basePrice;
            $markupAmount = 0.00;
        }

        $uuid = (string) Str::uuid();

        $link = ResellerPaymentLink::create([
            'uuid' => $uuid,
            'reseller_id' => $user->id,
            'reseller_plan_id' => $resellerPlan?->id,
            'vps_plan_id' => $vpsPlan->id,
            'node_id' => $validated['node_id'],
            'template_uuid' => $templateUuid,
            'server_name' => $validated['server_name'],
            'model_type' => $modelType,
            'base_price' => $basePrice,
            'selling_price' => $sellingPrice,
            'markup_amount' => $markupAmount,
            'coin' => $validated['coin'],
            'status' => 'pending',
            'maxelpay_status' => 'pending',
            'nowpayments_status' => 'pending',
        ]);

        $appUrl = config('app.url', 'http://localhost:8000');
        $host = parse_url($appUrl, PHP_URL_HOST) ?? 'localhost';
        if ($host === 'localhost' || $host === '127.0.0.1') {
            $publicBaseUrl = 'https://vertexnodes.net';
        } else {
            $publicBaseUrl = str_starts_with($appUrl, 'http://') ? 'https://' . substr($appUrl, 7) : $appUrl;
        }

        $checkoutUrl = url("/pay/{$uuid}");

        // Attempt NOWPayments invoice creation first if configured
        $nowpaymentsApiKey = config('services.nowpayments.api_key', '');
        if (!empty($nowpaymentsApiKey)) {
            try {
                /** @var \Convoy\Services\NowPaymentsService $nowpayments */
                $nowpayments = app(\Convoy\Services\NowPaymentsService::class);
                $invoice = $nowpayments->createInvoice([
                    'orderId'        => "RESELLER-{$uuid}",
                    'amount'         => $sellingPrice,
                    'currency'       => 'usd',
                    'payCurrency'    => strtolower($validated['coin'] === 'USDT' ? 'usdttrc20' : $validated['coin']),
                    'description'    => "VPS: {$validated['server_name']} ({$vpsPlan->name})",
                    'successUrl'     => "{$publicBaseUrl}/pay/{$uuid}?status=success",
                    'cancelUrl'      => "{$publicBaseUrl}/pay/{$uuid}?status=cancelled",
                    'ipnCallbackUrl' => "{$publicBaseUrl}/api/client/webhooks/nowpayments",
                ]);

                $link->nowpayments_payment_id = $invoice['paymentId'];
                $link->nowpayments_status     = 'pending';
                $link->checkout_url           = $invoice['invoiceUrl'];
                $link->save();
                $checkoutUrl = $invoice['invoiceUrl'];
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::warning('NOWPayments invoice creation failed, trying Maxelpay or local fallback', [
                    'error' => $e->getMessage(),
                ]);
            }
        }

        // Fallback to Maxelpay if NOWPayments was not used/failed and Maxelpay is set
        if ($checkoutUrl === url("/pay/{$uuid}") && !empty(config('services.maxelpay.api_key'))) {
            try {
                $maxelpay = app(\Convoy\Services\MaxelpayService::class);
                $session = $maxelpay->createSession([
                    'orderId' => "RESELLER-{$uuid}",
                    'amount' => $sellingPrice,
                    'currency' => 'USD',
                    'description' => "VPS: {$validated['server_name']} ({$vpsPlan->name})",
                    'successUrl' => "{$publicBaseUrl}/pay/{$uuid}?status=success",
                    'cancelUrl' => "{$publicBaseUrl}/pay/{$uuid}?status=cancelled",
                    'callbackUrl' => "{$publicBaseUrl}/api/client/webhooks/maxelpay",
                    'metadata' => [
                        'reseller_id' => $user->id,
                        'link_uuid' => $uuid,
                        'coin' => $validated['coin'],
                    ],
                ]);

                $link->maxelpay_session_id = $session['sessionId'];
                $link->checkout_url = $session['paymentUrl'];
                $link->save();
                $checkoutUrl = $session['paymentUrl'];
            } catch (\Exception $e) {
                \Illuminate\Support\Facades\Log::warning('Maxelpay session creation failed, falling back to local checkout', [
                    'error' => $e->getMessage(),
                ]);
                $link->checkout_url = url("/pay/{$uuid}");
                $link->save();
            }
        }

        return response()->json([
            'message' => 'Payment link created successfully!',
            'payment_link' => $link,
            'checkout_url' => $checkoutUrl,
        ]);
    }

    /**
     * Get Payment Links List
     */
    public function getPaymentLinks(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $links = ResellerPaymentLink::with(['vpsPlan', 'node', 'client', 'server'])
            ->where('reseller_id', $user->id)
            ->orderBy('id', 'desc')
            ->paginate(20);

        return response()->json([
            'links' => $links,
        ]);
    }

    /**
     * Submit Crypto Withdrawal Request ($10 min check, balance locking)
     */
    public function withdraw(Request $request): JsonResponse
    {
        $validated = $request->validate([
            'coin' => 'required|string|in:USDT,SOL,BTC,LTC,ETH',
            'amount' => 'required|numeric|min:0.00000001',
            'wallet_address' => 'required|string|min:10|max:191',
        ]);

        /** @var User $user */
        $user = $request->user();
        $coin = strtoupper($validated['coin']);
        $amount = (float) $validated['amount'];

        // Standard minimum USD equivalence check ($10 minimum requirement)
        // For simplicity and 0-risk, minimum amount for USDT is 10, or equivalent unit
        $minThresholds = [
            'USDT' => 10.00,
            'SOL' => 0.05,
            'BTC' => 0.0002,
            'LTC' => 0.15,
            'ETH' => 0.003,
        ];

        $minAmount = $minThresholds[$coin] ?? 10.00;
        if ($amount < $minAmount) {
            return response()->json([
                'message' => "Minimum withdrawal threshold for {$coin} is {$minAmount} (approx $10 USD).",
            ], 422);
        }

        $balance = ResellerCoinBalance::firstOrCreate(
            ['user_id' => $user->id, 'coin' => $coin],
            ['balance' => 0, 'locked_balance' => 0]
        );

        $available = (float) ($balance->balance - $balance->locked_balance);

        if ($amount > $available) {
            return response()->json([
                'message' => "Insufficient available {$coin} balance. Available: {$available} {$coin}.",
            ], 422);
        }

        // Lock balance
        $balance->locked_balance += $amount;
        $balance->save();

        $withdrawal = ResellerWithdrawal::create([
            'uuid' => (string) Str::uuid(),
            'user_id' => $user->id,
            'coin' => $coin,
            'amount' => $amount,
            'wallet_address' => $validated['wallet_address'],
            'status' => 'pending',
        ]);

        ResellerTransaction::create([
            'user_id' => $user->id,
            'type' => 'withdrawal_locked',
            'coin' => $coin,
            'amount' => $amount,
            'reference_id' => $withdrawal->uuid,
            'description' => "Withdrawal request for {$amount} {$coin} to {$validated['wallet_address']}",
        ]);

        return response()->json([
            'message' => 'Withdrawal request submitted! It is now pending admin approval.',
            'withdrawal' => $withdrawal,
        ]);
    }

    /**
     * Get Withdrawal History
     */
    public function getWithdrawals(Request $request): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $withdrawals = ResellerWithdrawal::where('user_id', $user->id)
            ->orderBy('id', 'desc')
            ->paginate(15);

        return response()->json([
            'withdrawals' => $withdrawals,
        ]);
    }
}
