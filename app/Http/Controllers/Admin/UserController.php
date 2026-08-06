<?php

namespace Convoy\Http\Controllers\Admin;

use Carbon\CarbonImmutable;
use Convoy\Http\Controllers\ApiController;
use Convoy\Http\Requests\Admin\Users\StoreUserRequest;
use Convoy\Http\Requests\Admin\Users\UpdateUserRequest;
use Convoy\Models\Filters\FiltersUserWildcard;
use Convoy\Models\User;
use Convoy\Services\Api\JWTService;
use Convoy\Transformers\Admin\UserTransformer;
use Illuminate\Database\ConnectionInterface;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Spatie\QueryBuilder\AllowedFilter;
use Spatie\QueryBuilder\QueryBuilder;
use Symfony\Component\HttpFoundation\JsonResponse;
use Symfony\Component\HttpKernel\Exception\BadRequestHttpException;

use function is_null;

class UserController extends ApiController
{
    public function __construct(
        private JWTService $JWTService,
        private ConnectionInterface $connection,
    ) {
    }

    public function index(Request $request)
    {
        $users = QueryBuilder::for(User::query())
            ->withCount(['servers'])
            ->allowedFilters(
                [AllowedFilter::exact('id'), 'name', AllowedFilter::exact(
                    'email',
                ), AllowedFilter::custom('*', new FiltersUserWildcard())],
            )
            ->paginate(min($request->query('per_page', 50), 100))->appends(
                $request->query(),
            );

        return fractal($users, new UserTransformer())->respond();
    }

    public function show(User $user)
    {
        $user->loadCount(['servers']);

        return fractal($user, new UserTransformer())->respond();
    }

    public function store(StoreUserRequest $request)
    {
        $user = User::create([
            'name' => $request->name,
            'email' => $request->email,
            'password' => Hash::make($request->password),
            'root_admin' => $request->root_admin,
        ])->loadCount(['servers']);

        \Convoy\Facades\Activity::event('admin:user-create')
            ->subject($user)
            ->property(['email' => $user->email, 'name' => $user->name, 'root_admin' => (bool) $user->root_admin])
            ->log("Created user account {$user->email}");

        return fractal($user, new UserTransformer())->respond();
    }

    public function update(UpdateUserRequest $request, User $user)
    {
        $this->connection->transaction(function () use ($request, $user) {
            $requestRootAdmin = $request->boolean('root_admin');
            if ($user->root_admin !== $requestRootAdmin && ! $requestRootAdmin) {
                $user->tokens()->delete();
            }

            $user->update([
                'name' => $request->name,
                'email' => $request->email,
                'root_admin' => $request->root_admin,
                ...(is_null($request->password) ? [] : ['password' => Hash::make($request->password)]),
            ]);
        });

        \Convoy\Facades\Activity::event('admin:user-update')
            ->subject($user)
            ->property(['email' => $user->email, 'name' => $user->name])
            ->log("Updated user account {$user->email}");

        $user->loadCount(['servers']);

        return fractal($user, new UserTransformer())->respond();
    }

    public function destroy(User $user)
    {
        $user->loadCount('servers');

        if ($user->servers_count > 0) {
            throw new BadRequestHttpException(
                'The user cannot be deleted with servers still associated.',
            );
        }

        $userEmail = $user->email;
        $userId = $user->id;

        $user->tokens()->delete();
        $user->delete();

        \Convoy\Facades\Activity::event('admin:user-delete')
            ->property(['email' => $userEmail, 'target_user_id' => $userId])
            ->log("Deleted user account {$userEmail}");

        return $this->returnNoContent();
    }

    public function getSSOToken(User $user)
    {
        $token = $this->JWTService
            ->setExpiresAt(CarbonImmutable::now()->addSeconds(15))
            ->setUser($user)
            ->handle(config('app.key'), config('app.url'), $user->uuid);

        return new JsonResponse([
            'data' => [
                'user_id' => $user->id,
                'token' => $token->toString(),
            ],
        ]);
    }
}
