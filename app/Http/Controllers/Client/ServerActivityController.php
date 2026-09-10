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
        try {
            /** @var Server $server */
            $server = Server::where('user_id', $request->user()->id)->findOrFail($id);

            $data = $activityService->startSession($server, $request->user(), $request);

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
     * Submit a claim code to extend active timer or advance suspended recovery step.
     */
    public function claimCode(Request $request, int $id, FreeServerActivityService $activityService): JsonResponse
    {
        $request->validate([
            'code' => 'required|string|min:6|max:40',
        ]);

        try {
            /** @var Server $server */
            $server = Server::where('user_id', $request->user()->id)->findOrFail($id);

            $data = $activityService->claimCode(
                $server,
                $request->user(),
                $request->input('code')
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
}
