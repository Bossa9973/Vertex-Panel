<?php

namespace Convoy\Http\Controllers\Admin;

use Convoy\Http\Controllers\Controller;
use Convoy\Models\VpsPlan;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;

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
        } else {
            $plan = VpsPlan::create($data);
        }

        return response()->json([
            'success' => true,
            'plan' => $plan,
        ]);
    }

    public function destroy(int $id): JsonResponse
    {
        $plan = VpsPlan::findOrFail($id);
        $plan->delete();

        return response()->json([
            'success' => true,
        ]);
    }
}
