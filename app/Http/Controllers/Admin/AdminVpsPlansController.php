<?php

namespace Convoy\Http\Controllers\Admin;

use Convoy\Http\Controllers\Controller;
use Convoy\Models\VpsPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;

class AdminVpsPlansController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'plans' => VpsPlan::orderBy('price', 'asc')->get(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'id' => 'nullable|integer|exists:vps_plans,id',
            'name' => 'required|string|max:191',
            'ram' => 'required|integer|min:128',
            'cpu' => 'required|integer|min:1',
            'disk' => 'required|integer|min:1',
            'price' => 'required|numeric|min:0',
            'description' => 'nullable|string|max:255',
        ]);

        if (!empty($data['id'])) {
            $plan = VpsPlan::findOrFail($data['id']);
            $plan->update($data);
            $actionEvent = 'admin:plan-update';
            $msg = "Updated VPS Plan '{$plan->name}' ({$plan->price} BOLTs)";
        } else {
            $plan = VpsPlan::create($data);
            $actionEvent = 'admin:plan-create';
            $msg = "Created new VPS Plan '{$plan->name}' ({$plan->price} BOLTs)";
        }

        try {
            \Convoy\Facades\Activity::event($actionEvent)
                ->actor($request->user())
                ->description($msg)
                ->property(['plan_id' => $plan->id, 'name' => $plan->name, 'price' => $plan->price])
                ->withRequestMetadata()
                ->log();
        } catch (\Throwable $e) {}

        Cache::forget('deploy_options');

        return response()->json([
            'success' => true,
            'plan' => $plan,
        ]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $plan = VpsPlan::findOrFail($id);
        $planName = $plan->name;
        $plan->delete();

        Cache::forget('deploy_options');

        try {
            \Convoy\Facades\Activity::event('admin:plan-delete')
                ->actor($request->user())
                ->description("Deleted VPS Plan '{$planName}'")
                ->property(['plan_id' => $id, 'name' => $planName])
                ->withRequestMetadata()
                ->log();
        } catch (\Throwable $e) {}

        return response()->json([
            'success' => true,
        ]);
    }
}
