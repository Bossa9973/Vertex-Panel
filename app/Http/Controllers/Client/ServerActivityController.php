<?php

namespace Convoy\Http\Controllers\Client;

use Convoy\Http\Controllers\ApiController;
use Convoy\Models\Server;
use Convoy\Services\Servers\FreeServerActivityService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Throwable;

class ServerActivityController extends ApiController
{
    /**
     * Start a new link verification session for a server.
     */
    public function startSession(Request $request, int $id, FreeServerActivityService $activityService): JsonResponse
    {
        $request->validate([
            'client_nonce' => 'nullable|string|max:128',
        ]);

        try {
            /** @var Server $server */
            $server = Server::where('user_id', $request->user()->id)->findOrFail($id);

            $data = $activityService->startRenewalSession(
                $server,
                $request->user(),
                $request,
                $request->input('client_nonce')
            );

            return response()->json([
                'success' => true,
                'data'    => $data,
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 400);
        }
    }

    /**
     * Anti-Bypass callback verification endpoint (called when user lands on /activity/claim).
     */
    public function verifyCallback(Request $request, FreeServerActivityService $activityService): JsonResponse
    {
        $request->validate([
            'session'          => 'required|string|size:48',
            'sig'              => 'required|string|size:64',
            'client_nonce'     => 'nullable|string|max:128',
            'gesture'          => 'nullable|array',
            'client_integrity' => 'nullable|string',
        ]);

        try {
            $data = $activityService->verifyCallback(
                $request->input('session'),
                $request->input('sig'),
                $request->user(),
                $request
            );

            return response()->json([
                'success' => true,
                'data'    => $data,
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 422);
        }
    }

    /**
     * @deprecated Claim codes have been removed. Returns 410 Gone.
     * Renewals are now auto-granted server-side when the user lands on the claim page.
     */
    public function claimCode(Request $request, int $id, FreeServerActivityService $activityService): JsonResponse
    {
        return response()->json([
            'success' => false,
            'message' => 'Claim codes have been removed. Your server is renewed automatically when you complete the sponsored link.',
        ], 410);
    }

    /**
     * Get real-time activity and recovery status for a server.
     */
    public function getStatus(Request $request, int $id, FreeServerActivityService $activityService): JsonResponse
    {
        try {
            /** @var Server $server */
            $server = Server::where('user_id', $request->user()->id)->findOrFail($id);

            $data = $activityService->getStatus($server);

            return response()->json([
                'success' => true,
                'data'    => $data,
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 400);
        }
    }

    /**
     * Lightweight poll endpoint: returns whether the active renewal session for this server
     * has been claimed (granted). The dashboard uses this to detect when landing verification completes.
     */
    public function sessionStatus(Request $request, int $id, FreeServerActivityService $activityService): JsonResponse
    {
        try {
            /** @var Server $server */
            $server = Server::where('user_id', $request->user()->id)->findOrFail($id);

            $data = $activityService->getActiveSessionStatus($server, $request->user());

            return response()->json([
                'success' => true,
                'data'    => $data,
            ]);
        } catch (Throwable $e) {
            return response()->json([
                'success' => false,
                'message' => $e->getMessage(),
            ], 400);
        }
    }
}
