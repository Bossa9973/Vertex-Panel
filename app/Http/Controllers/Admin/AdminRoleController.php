<?php

namespace Convoy\Http\Controllers\Admin;

use Convoy\Http\Controllers\Controller;
use Convoy\Models\AdminRole;
use Convoy\Models\User;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Config;

class AdminRoleController extends Controller
{
    /** The CEO email that always has super-admin rights. */
    private function superAdminEmail(): string
    {
        return Config::get('app.super_admin_email', 'ceo@vertexnodes.top');
    }

    /** Assert the request comes from the CEO. */
    private function assertCeo(Request $request): void
    {
        if ($request->user()?->email !== $this->superAdminEmail()) {
            abort(403, 'Only the Super Admin can manage roles.');
        }
    }

    // ─── Permission catalogue ────────────────────────────────────────────────
    /**
     * GET /api/admin/roles/permissions
     * Returns the full catalogue of permission keys so the frontend can render toggles.
     */
    public function permissions(): JsonResponse
    {
        return response()->json([
            'data' => AdminRole::PERMISSIONS,
        ]);
    }

    // ─── Role CRUD ───────────────────────────────────────────────────────────
    /**
     * GET /api/admin/roles
     * List all roles with the count of users assigned to each.
     */
    public function index(): JsonResponse
    {
        $roles = AdminRole::withCount('users')->orderBy('name')->get()->map(fn ($r) => [
            'id'           => $r->id,
            'name'         => $r->name,
            'color'        => $r->color,
            'description'  => $r->description,
            'permissions'  => $r->permissions ?? [],
            'users_count'  => $r->users_count,
            'created_at'   => $r->created_at?->toIso8601String(),
        ]);

        return response()->json(['data' => $roles]);
    }

    /**
     * POST /api/admin/roles
     */
    public function store(Request $request): JsonResponse
    {
        $this->assertCeo($request);

        $validated = $request->validate([
            'name'        => 'required|string|max:100',
            'color'       => 'required|string|regex:/^#[0-9a-fA-F]{6}$/',
            'description' => 'nullable|string|max:500',
            'permissions' => 'required|array',
            'permissions.*' => 'string|in:' . implode(',', array_keys(AdminRole::PERMISSIONS)),
        ]);

        $role = AdminRole::create($validated);

        return response()->json([
            'data'    => $this->formatRole($role),
            'message' => "Role '{$role->name}' created successfully.",
        ], 201);
    }

    /**
     * PUT /api/admin/roles/{role}
     */
    public function update(Request $request, AdminRole $role): JsonResponse
    {
        $this->assertCeo($request);

        $validated = $request->validate([
            'name'        => 'sometimes|required|string|max:100',
            'color'       => 'sometimes|required|string|regex:/^#[0-9a-fA-F]{6}$/',
            'description' => 'nullable|string|max:500',
            'permissions' => 'sometimes|required|array',
            'permissions.*' => 'string|in:' . implode(',', array_keys(AdminRole::PERMISSIONS)),
        ]);

        $role->update($validated);

        return response()->json([
            'data'    => $this->formatRole($role->fresh()),
            'message' => "Role '{$role->name}' updated successfully.",
        ]);
    }

    /**
     * DELETE /api/admin/roles/{role}
     * Detaches all users (sets admin_role_id = null via nullOnDelete) then deletes.
     */
    public function destroy(Request $request, AdminRole $role): JsonResponse
    {
        $this->assertCeo($request);

        $name = $role->name;
        $role->delete();

        return response()->json(['message' => "Role '{$name}' deleted. Affected users have been reverted to full access."]);
    }

    // ─── User Assignment ─────────────────────────────────────────────────────
    /**
     * GET /api/admin/roles/admin-users
     * Returns all root_admin users with their current role info.
     */
    public function adminUsers(): JsonResponse
    {
        $users = User::where('root_admin', true)
            ->with('adminRole')
            ->orderBy('name')
            ->get()
            ->map(fn ($u) => [
                'id'             => $u->id,
                'name'           => $u->name,
                'email'          => $u->email,
                'admin_role_id'  => $u->admin_role_id,
                'admin_role_name'  => $u->adminRole?->name,
                'admin_role_color' => $u->adminRole?->color,
                'is_super_admin' => $u->email === $this->superAdminEmail(),
                'hide_ip_in_audit' => (bool) $u->hide_ip_in_audit,
            ]);

        return response()->json(['data' => $users]);
    }

    /**
     * POST /api/admin/roles/toggle-ip-privacy
     */
    public function toggleIpPrivacy(Request $request): JsonResponse
    {
        if (! $request->user()?->hasAdminPermission('manage_ip_privacy')) {
            abort(403, 'Only Head Admin or authorized roles can manage user IP privacy.');
        }

        $validated = $request->validate([
            'user_id'          => 'required|integer|exists:users,id',
            'hide_ip_in_audit' => 'required|boolean',
        ]);

        $user = User::findOrFail($validated['user_id']);
        $user->hide_ip_in_audit = $validated['hide_ip_in_audit'];
        $user->save();

        return response()->json([
            'success' => true,
            'message' => $user->hide_ip_in_audit
                ? "IP hiding enabled for {$user->name}."
                : "IP hiding disabled for {$user->name}.",
            'data' => [
                'user_id'          => $user->id,
                'hide_ip_in_audit' => (bool) $user->hide_ip_in_audit,
            ],
        ]);
    }

    /**
     * POST /api/admin/roles/assign
     * Body: { user_id: int, role_id: int|null }
     */
    public function assignRole(Request $request): JsonResponse
    {
        $this->assertCeo($request);

        $validated = $request->validate([
            'user_id' => 'required|integer|exists:users,id',
            'role_id' => 'nullable|integer|exists:admin_roles,id',
        ]);

        $user = User::findOrFail($validated['user_id']);

        if (! $user->root_admin) {
            abort(422, 'Only root_admin users can be assigned admin roles.');
        }

        if ($user->email === $this->superAdminEmail()) {
            abort(422, 'The Super Admin cannot be assigned a role.');
        }

        $user->admin_role_id = $validated['role_id'];
        $user->save();

        return response()->json([
            'message' => $validated['role_id']
                ? "Role assigned to {$user->name}."
                : "Role removed from {$user->name} (full access restored).",
        ]);
    }

    // ─── Helpers ─────────────────────────────────────────────────────────────
    private function formatRole(AdminRole $role): array
    {
        return [
            'id'          => $role->id,
            'name'        => $role->name,
            'color'       => $role->color,
            'description' => $role->description,
            'permissions' => $role->permissions ?? [],
            'users_count' => $role->loadCount('users')->users_count,
            'created_at'  => $role->created_at?->toIso8601String(),
        ];
    }
}
