<?php

namespace Convoy\Http\Controllers\Auth;

use Convoy\Models\User;
use Convoy\Models\SSOToken;
use Illuminate\Http\Request;
use Convoy\Services\Api\JWTService;
use Illuminate\Contracts\View\View;
use Illuminate\Support\Facades\Auth;
use Convoy\Http\Controllers\Controller;
use Illuminate\Contracts\View\Factory as ViewFactory;
use Convoy\Exceptions\Service\Api\InvalidJWTException;
use Symfony\Component\HttpKernel\Exception\UnauthorizedHttpException;

class LoginController extends Controller
{
    public function __construct(private ViewFactory $view, private JWTService $JWTService) {}

    public function index(): View
    {
        return $this->view->make('app');
    }

    public function authorizeToken(Request $request)
    {
        try {
            $token = $this->JWTService->decode(config('app.key'), $request->token);
        } catch (InvalidJWTException) {
            throw new UnauthorizedHttpException('', 'Invalid JWT token');
        }

        /** @var User $user */
        $user = User::where('uuid', '=', $token->claims()->get('user_uuid'))->first();

        if (!$user) {
            throw new UnauthorizedHttpException('', 'Invalid JWT claims');
        }

        Auth::loginUsingId($user->id);

        $request->session()->regenerate();

        return redirect()->route('index');
    }

    public function login(Request $request)
    {
        $credentials = $request->validate([
            'email'    => 'required|email',
            'password' => 'required|string',
        ]);

        if (Auth::attempt($credentials, $request->boolean('rememberMe'))) {
            $request->session()->regenerate();

            return response()->json([
                'success' => true,
                'user'    => Auth::user(),
            ]);
        }

        return response()->json([
            'message' => 'The provided email or password does not match our records.',
        ], 422);
    }
}
