<?php

namespace Convoy\Http\Controllers\Auth;

use Convoy\Http\Controllers\Controller;
use Convoy\Models\User;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Str;

class SocialLoginController extends Controller
{
    /**
     * Return a pre-configured HTTP client.
     * Disables SSL verification in local/development environments where
     * the system CA bundle may be incomplete (e.g. Windows + WSL).
     */
    private function httpClient(): \Illuminate\Http\Client\PendingRequest
    {
        $verify = app()->environment('production');
        return Http::withOptions(['verify' => $verify]);
    }

    /**
     * Dynamically resolve the OAuth redirect URI for a provider.
     */
    private function getRedirectUri(Request $request, string $provider): string
    {
        $custom = config("services.{$provider}.redirect") ?: env(strtoupper($provider) . '_REDIRECT_URI');

        // Use custom URI if specified AND it does not point to localhost / 127.0.0.1
        if (!empty($custom) && !str_contains($custom, 'localhost') && !str_contains($custom, '127.0.0.1')) {
            return $custom;
        }

        // Determine base URL dynamically from config('app.url') or current request
        $appUrl = config('app.url');
        if (!empty($appUrl) && !str_contains($appUrl, 'localhost') && !str_contains($appUrl, '127.0.0.1')) {
            $baseUrl = rtrim($appUrl, '/');
        } else {
            $baseUrl = rtrim($request->schemeAndHttpHost(), '/');
        }

        return "{$baseUrl}/auth/social/{$provider}/callback";
    }

    /**
     * Redirect the user to the provider authentication page.
     */
    public function redirect(Request $request, string $provider)
    {
        if (!in_array($provider, ['google', 'discord'])) {
            return redirect('/auth/login')->with('error', 'Unsupported authentication provider.');
        }

        $mode = $request->query('mode', 'login');

        // If the user is already authenticated, they want to link a new provider — not log in
        if (Auth::check()) {
            $mode = 'link';
        }

        session(['social_auth_mode' => $mode]);

        if ($provider === 'google') {
            $clientId    = config('services.google.client_id') ?: env('GOOGLE_CLIENT_ID');
            $redirectUri = $this->getRedirectUri($request, 'google');

            if (empty($clientId)) {
                return $mode === 'link'
                    ? redirect('/account?error=' . urlencode('Google Client ID is not configured in .env file.'))
                    : redirect('/auth/login')->with('error', 'Google Client ID is not configured in .env file.');
            }

            $query = http_build_query([
                'client_id'     => $clientId,
                'redirect_uri'  => $redirectUri,
                'response_type' => 'code',
                'scope'         => 'openid email profile',
                'access_type'   => 'online',
                'prompt'        => 'select_account',
            ]);

            return redirect("https://accounts.google.com/o/oauth2/v2/auth?{$query}");
        }

        if ($provider === 'discord') {
            $clientId    = config('services.discord.client_id') ?: env('DISCORD_CLIENT_ID');
            $redirectUri = $this->getRedirectUri($request, 'discord');

            if (empty($clientId)) {
                return $mode === 'link'
                    ? redirect('/account?error=' . urlencode('Discord Client ID is not configured in .env file.'))
                    : redirect('/auth/login?error=' . urlencode('Discord Client ID is not configured in .env file.'));
            }

            $query = http_build_query([
                'client_id'     => $clientId,
                'redirect_uri'  => $redirectUri,
                'response_type' => 'code',
                'scope'         => 'identify email',
                'prompt'        => 'consent',
            ]);

            return redirect("https://discord.com/api/oauth2/authorize?{$query}");
        }

        return redirect('/auth/login');
    }

    /**
     * Obtain the user information from the provider callback.
     */
    public function callback(Request $request, string $provider)
    {
        $code = $request->query('code');
        $mode = session('social_auth_mode', 'login');

        if (empty($code)) {
            $error = $request->query('error_description', $request->query('error', 'Authentication cancelled.'));

            if ($mode === 'link') {
                return redirect('/account?error=' . urlencode($error));
            }

            return redirect("/auth/{$mode}?error=" . urlencode($error));
        }

        try {
            $socialUser = null;

            // ─── Fetch Google Profile ──────────────────────────────────────
            if ($provider === 'google') {
                $clientId     = config('services.google.client_id') ?: env('GOOGLE_CLIENT_ID');
                $clientSecret = config('services.google.client_secret') ?: env('GOOGLE_CLIENT_SECRET');
                $redirectUri  = $this->getRedirectUri($request, 'google');

                $tokenResponse = $this->httpClient()->post('https://oauth2.googleapis.com/token', [
                    'client_id'     => $clientId,
                    'client_secret' => $clientSecret,
                    'code'          => $code,
                    'grant_type'    => 'authorization_code',
                    'redirect_uri'  => $redirectUri,
                ]);

                if (!$tokenResponse->successful()) {
                    $errMsg = 'Failed to fetch Google OAuth access token.';
                    return $mode === 'link'
                        ? redirect('/account?error=' . urlencode($errMsg))
                        : redirect("/auth/{$mode}?error=" . urlencode($errMsg));
                }

                $accessToken  = $tokenResponse->json('access_token');
                $userResponse = $this->httpClient()->withToken($accessToken)->get('https://www.googleapis.com/oauth2/v3/userinfo');

                if (!$userResponse->successful()) {
                    $errMsg = 'Failed to fetch Google user profile.';
                    return $mode === 'link'
                        ? redirect('/account?error=' . urlencode($errMsg))
                        : redirect("/auth/{$mode}?error=" . urlencode($errMsg));
                }

                $googleData = $userResponse->json();
                $socialUser = [
                    'email'        => strtolower($googleData['email'] ?? ''),
                    'name'         => $googleData['name'] ?? $googleData['email'],
                    'google_id'    => (string) ($googleData['sub'] ?? ''),
                    'google_email' => strtolower($googleData['email'] ?? ''),
                ];
            }

            // ─── Fetch Discord Profile ─────────────────────────────────────
            if ($provider === 'discord') {
                $clientId     = config('services.discord.client_id') ?: env('DISCORD_CLIENT_ID');
                $clientSecret = config('services.discord.client_secret') ?: env('DISCORD_CLIENT_SECRET');
                $redirectUri  = $this->getRedirectUri($request, 'discord');

                $tokenResponse = $this->httpClient()->asForm()->post('https://discord.com/api/oauth2/token', [
                    'client_id'     => $clientId,
                    'client_secret' => $clientSecret,
                    'grant_type'    => 'authorization_code',
                    'code'          => $code,
                    'redirect_uri'  => $redirectUri,
                ]);

                if (!$tokenResponse->successful()) {
                    $errMsg = 'Failed to fetch Discord OAuth token.';
                    return $mode === 'link'
                        ? redirect('/account?error=' . urlencode($errMsg))
                        : redirect("/auth/{$mode}?error=" . urlencode($errMsg));
                }

                $accessToken  = $tokenResponse->json('access_token');
                $userResponse = $this->httpClient()->withToken($accessToken)->get('https://discord.com/api/users/@me');

                if (!$userResponse->successful()) {
                    $errMsg = 'Failed to fetch Discord user profile.';
                    return $mode === 'link'
                        ? redirect('/account?error=' . urlencode($errMsg))
                        : redirect("/auth/{$mode}?error=" . urlencode($errMsg));
                }

                $discordData = $userResponse->json();
                $email       = strtolower($discordData['email'] ?? '');
                $username    = $discordData['global_name'] ?? $discordData['username'] ?? 'Discord User';

                if (empty($email)) {
                    $errMsg = 'Discord account email is unverified or missing. Please enable email on your Discord account.';
                    return $mode === 'link'
                        ? redirect('/account?error=' . urlencode($errMsg))
                        : redirect("/auth/{$mode}?error=" . urlencode($errMsg));
                }

                $socialUser = [
                    'email'            => $email,
                    'name'             => $username,
                    'discord_id'       => (string) ($discordData['id'] ?? ''),
                    'discord_username' => $username,
                ];
            }

            if (!$socialUser || empty($socialUser['email'])) {
                $errMsg = 'Could not retrieve user email from provider.';
                return $mode === 'link'
                    ? redirect('/account?error=' . urlencode($errMsg))
                    : redirect("/auth/{$mode}?error=" . urlencode($errMsg));
            }

            // ═════════════════════════════════════════════════════════════════
            // LINK MODE: Authenticated user linking a new provider to their account
            // ═════════════════════════════════════════════════════════════════
            if ($mode === 'link' && Auth::check()) {
                /** @var User $currentUser */
                $currentUser = Auth::user();

                // Guard: refuse if the social provider's email already belongs to a different account
                $emailConflict = User::where('email', $socialUser['email'])
                    ->where('id', '!=', $currentUser->id)
                    ->first();

                if ($emailConflict) {
                    $errMsg = "The {$provider} account email (" . $socialUser['email'] . ") is already registered to a different Vertex account. "
                        . "Please use a different {$provider} account or log in to the account that owns that email address.";
                    return redirect('/account?error=' . urlencode($errMsg));
                }

                // Link Google
                if ($provider === 'google' && !empty($socialUser['google_id'])) {
                    $googleConflict = User::where('google_id', $socialUser['google_id'])
                        ->where('id', '!=', $currentUser->id)
                        ->first();

                    if ($googleConflict) {
                        $errMsg = 'This Google account is already linked to another Vertex account. Unlink it there first.';
                        return redirect('/account?error=' . urlencode($errMsg));
                    }

                    $currentUser->google_id    = $socialUser['google_id'];
                    $currentUser->google_email = $socialUser['google_email'];
                    $currentUser->save();

                    return redirect('/account?success=' . urlencode('Google account successfully linked to your profile!'));
                }

                // Link Discord
                if ($provider === 'discord' && !empty($socialUser['discord_id'])) {
                    $discordConflict = User::where('discord_id', $socialUser['discord_id'])
                        ->where('id', '!=', $currentUser->id)
                        ->first();

                    if ($discordConflict) {
                        $errMsg = 'This Discord account is already linked to another Vertex account. Unlink it there first.';
                        return redirect('/account?error=' . urlencode($errMsg));
                    }

                    $currentUser->discord_id       = $socialUser['discord_id'];
                    $currentUser->discord_username = $socialUser['discord_username'];
                    $currentUser->save();

                    return redirect('/account?success=' . urlencode('Discord account successfully linked to your profile!'));
                }

                return redirect('/account?error=' . urlencode('Unable to link provider: no ID returned from ' . $provider . '.'));
            }

            // ═════════════════════════════════════════════════════════════════
            // LOGIN / REGISTER MODE: Guest authenticating via social provider
            // ═════════════════════════════════════════════════════════════════

            /** @var User $user */
            $user = User::where('email', $socialUser['email'])->first();

            if ($mode === 'register' && $user) {
                return redirect('/auth/login?error=' . urlencode('An account with this email address already exists. Please sign in instead.'));
            }

            if (!$user) {
                $user = User::create([
                    'name'                  => $socialUser['name'],
                    'email'                 => $socialUser['email'],
                    'password'              => Hash::make(Str::random(32)),
                    'credits'               => 10.00,
                    'primary_auth_provider' => $provider,
                    'root_admin'            => false,
                ]);

                $user->creditTransactions()->create([
                    'amount'       => 10.00,
                    'type'         => 'bonus',
                    'description'  => ucfirst($provider) . ' Social Sign-Up Bonus',
                    'reference_id' => 'SOCIAL-' . Str::upper(Str::random(8)),
                ]);
            }

            // Persist social provider IDs on the user record
            if ($provider === 'discord' && !empty($socialUser['discord_id'])) {
                $user->discord_id       = $socialUser['discord_id'];
                $user->discord_username = $socialUser['discord_username'];
                $user->save();
            }

            if ($provider === 'google' && !empty($socialUser['google_id'])) {
                $user->google_id    = $socialUser['google_id'];
                $user->google_email = $socialUser['google_email'];
                $user->save();
            }

            Auth::login($user);
            $request->session()->regenerate();

            return redirect('/');

        } catch (\Throwable $e) {
            $errMsg = config('app.debug')
                ? $e->getMessage()
                : 'An unexpected error occurred during authentication. Please try again.';

            if ($mode === 'link') {
                return redirect('/account?error=' . urlencode($errMsg));
            }

            return redirect("/auth/{$mode}?error=" . urlencode($errMsg));
        }
    }
}
