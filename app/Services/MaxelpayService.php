<?php

namespace Convoy\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;

class MaxelpayService
{
    protected string $apiKey;
    protected string $secretKey;
    protected string $baseUrl;
    protected bool $isStaging;

    public function __construct()
    {
        $this->apiKey = config('services.maxelpay.api_key', '');
        $this->secretKey = config('services.maxelpay.secret_key', '');
        $this->isStaging = strtoupper(config('services.maxelpay.mode', 'STAGING')) === 'STAGING';
        $this->baseUrl = 'https://api.maxelpay.com/api/v1';
    }

    /**
     * Create a Maxelpay payment session.
     *
     * @param array{
     *   orderId: string,
     *   amount: float,
     *   currency: string,
     *   description: string,
     *   successUrl: string,
     *   cancelUrl: string,
     *   callbackUrl: string,
     *   metadata?: array
     * } $data
     * @return array{sessionId: string, paymentUrl: string, status: string}
     * @throws \Exception
     */
    public function createSession(array $data): array
    {
        $response = Http::timeout(15)->withoutVerifying()->withHeaders([
            'X-API-KEY' => $this->apiKey,
            'Content-Type' => 'application/json',
        ])->post("{$this->baseUrl}/payments/sessions", $data);

        if (!$response->successful()) {
            Log::error('Maxelpay createSession failed', [
                'status' => $response->status(),
                'body' => $response->json(),
            ]);
            throw new \Exception('Maxelpay payment session creation failed: ' . $response->body());
        }

        $json = $response->json();

        if (empty($json['data']['sessionId']) || empty($json['data']['paymentUrl'])) {
            throw new \Exception('Maxelpay returned unexpected response: ' . json_encode($json));
        }

        return [
            'sessionId' => $json['data']['sessionId'],
            'paymentUrl' => $json['data']['paymentUrl'],
            'status' => $json['data']['status'] ?? 'pending',
        ];
    }

    /**
     * Get the status of a Maxelpay payment session.
     */
    public function getSessionStatus(string $sessionId): array
    {
        $response = Http::timeout(15)->withHeaders([
            'X-API-KEY' => $this->apiKey,
            'Content-Type' => 'application/json',
        ])->get("{$this->baseUrl}/payments/sessions/{$sessionId}/status");

        if (!$response->successful()) {
            throw new \Exception('Maxelpay getSessionStatus failed: ' . $response->body());
        }

        return $response->json('data', []);
    }

    /**
     * Verify a Maxelpay webhook signature.
     * Maxelpay signs the raw JSON payload with HMAC-SHA256 using your secret key.
     * Header: X-MaxelPay-Signature
     */
    public function verifyWebhookSignature(string $rawPayload, string $signature): bool
    {
        if (empty($this->secretKey)) {
            Log::warning('Maxelpay secret key not configured, skipping signature verification');
            return true; // Allow in dev if not configured
        }

        $expected = hash_hmac('sha256', $rawPayload, $this->secretKey);
        return hash_equals($expected, $signature);
    }
}

