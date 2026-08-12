<?php

namespace Convoy\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class NowPaymentsService
{
    protected string $apiKey;
    protected string $ipnSecret;
    protected string $baseUrl;
    protected bool $isSandbox;

    public function __construct()
    {
        $this->isSandbox = strtoupper(config('services.nowpayments.mode', 'SANDBOX')) === 'SANDBOX';
        $this->apiKey    = config('services.nowpayments.api_key', '');
        $this->ipnSecret = config('services.nowpayments.ipn_secret', '');
        $this->baseUrl   = $this->isSandbox
            ? 'https://api-sandbox.nowpayments.io/v1'
            : 'https://api.nowpayments.io/v1';
    }

    /**
     * Create a NOWPayments invoice.
     *
     * @param array{
     *   orderId: string,
     *   amount: float,
     *   currency: string,
     *   payCurrency: string,
     *   description: string,
     *   successUrl: string,
     *   cancelUrl: string,
     *   ipnCallbackUrl: string,
     * } $data
     * @return array{paymentId: string, invoiceUrl: string, status: string}
     * @throws \Exception
     */
    public function createInvoice(array $data): array
    {
        $payload = [
            'price_amount'     => $data['amount'],
            'price_currency'   => strtolower($data['currency'] ?? 'usd'),
            'pay_currency'     => strtolower($data['payCurrency'] ?? 'usdttrc20'),
            'order_id'         => $data['orderId'],
            'order_description'=> $data['description'] ?? '',
            'ipn_callback_url' => $data['ipnCallbackUrl'],
            'success_url'      => $data['successUrl'],
            'cancel_url'       => $data['cancelUrl'],
        ];

        // In sandbox mode, include `case=success` so the payment auto-completes instantly
        if ($this->isSandbox) {
            $payload['case'] = 'success';
        }

        $response = Http::timeout(15)->withoutVerifying()
            ->withHeaders([
                'x-api-key'    => $this->apiKey,
                'Content-Type' => 'application/json',
            ])
            ->post("{$this->baseUrl}/invoice", $payload);

        if (!$response->successful()) {
            Log::error('NOWPayments createInvoice failed', [
                'status' => $response->status(),
                'body'   => $response->json(),
            ]);
            throw new \Exception('NOWPayments invoice creation failed: ' . $response->body());
        }

        $json = $response->json();

        if (empty($json['id']) || empty($json['invoice_url'])) {
            throw new \Exception('NOWPayments returned unexpected response: ' . json_encode($json));
        }

        return [
            'paymentId'  => (string) $json['id'],
            'invoiceUrl' => $json['invoice_url'],
            'status'     => $json['payment_status'] ?? 'waiting',
        ];
    }

    /**
     * Verify a NOWPayments IPN webhook signature.
     * NOWPayments signs the sorted JSON payload with HMAC-SHA512 using your IPN secret.
     * Header: x-nowpayments-sig
     */
    public function verifyIpnSignature(string $rawPayload, string $signature): bool
    {
        if (empty($this->ipnSecret)) {
            Log::warning('NOWPayments IPN secret not configured, skipping signature verification');
            return true; // Allow in dev if not configured
        }

        $data = json_decode($rawPayload, true);
        if (!is_array($data)) {
            return false;
        }

        // NOWPayments requires keys to be sorted before HMAC
        ksort($data);
        $sorted = json_encode($data);

        $expected = hash_hmac('sha512', $sorted, $this->ipnSecret);
        return hash_equals($expected, strtolower($signature));
    }
}
