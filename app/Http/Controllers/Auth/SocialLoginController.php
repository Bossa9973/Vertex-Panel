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
     * Redirect the user to the provider authentication page.
     */
    public function redirect(Request $request, string $provider)
    {
        if (!in_array($provider, ['google', 'discord'])) {
            return redirect('/auth/login')->with('error', 'Unsupported authentication provider.');
        }

        $mode = $request->query('mode', 'login');
        session(['social_auth_mode' => $mode]);

        $baseUrl = config('app.url', 'http://localhost:8888');

        if ($provider === 'google') {
            $clientId = config('services.google.client_id', env('GOOGLE_CLIENT_ID'));
            $redirectUri = config('services.google.redirect', env('GOOGLE_REDIRECT_URI', "{$baseUrl}/auth/social/google/callback"));

            if (empty($clientId)) {
                return redirect('/auth/login')->with('error', 'Google Client ID is not configured in .env file.');
            }

            $query = http_build_query([
                'client_id' => $clientId,
                'redirect_uri' => $redirectUri,
                'response_type' => 'code',
                'scope' => 'openid email profile',
                'access_type' => 'online',
                'prompt' => 'select_account',
            ]);

            return redirect("https://accounts.google.com/o/oauth2/v2/auth?{$query}");
        }

        if ($provider === 'discord') {
            $clientId = config('services.discord.client_id', env('DISCORD_CLIENT_ID'));
            $redirectUri = config('services.discord.redirect', env('DISCORD_REDIRECT_URI', "{$baseUrl}/auth/social/discord/callback"));

            if (empty($clientId)) {
                $target = Auth::check() ? '/earn?error=Discord+Client+ID+is+missing+in+.env+file' : '/auth/login?error=Discord+Client+ID+is+missing+in+.env+file';
                return redirect($target);
            }

            $query = http_build_query([
                'client_id' => $clientId,
                'redirect_uri' => $redirectUri,
                'response_type' => 'code',
                'scope' => 'identify email',
                'prompt' => 'consent',
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
        $baseUrl = config('app.url', 'http://localhost:8888');

        if (empty($code)) {
            $error = $request->query('error_description', $request->query('error', 'Authentication cancelled.'));
            return redirect("/auth/{$mode}?error=" . urlencode($error));
        }

        try {
            $socialUser = null;

            if ($provider === 'google') {
                $clientId = env('GOOGLE_CLIENT_ID');
                $clientSecret = env('GOOGLE_CLIENT_SECRET');
                $redirectUri = env('GOOGLE_REDIRECT_URI', "{$baseUrl}/auth/social/google/callback");

                // Exchange authorization code for access token
                $tokenResponse = Http::post('https://oauth2.googleapis.com/token', [
                    'client_id' => $clientId,
                    'client_secret' => $clientSecret,
                    'code' => $code,
                    'grant_type' => 'authorization_code',
                    'redirect_uri' => $redirectUri,
                ]);

                if (!$tokenResponse->successful()) {
                    return redirect("/auth/{$mode}?error=" . urlencode('Failed to fetch Google OAuth access token.'));
                }

                $accessToken = $tokenResponse->json('access_token');

                // Fetch Google User Profile
                $userResponse = Http::withToken($accessToken)->get('https://www.googleapis.com/oauth2/v3/userinfo');

                if (!$userResponse->successful()) {
                    return redirect("/auth/{$mode}?error=" . urlencode('Failed to fetch Google user profile.'));
                }

                $googleData = $userResponse->json();
                $socialUser = [
                    'email' => strtolower($googleData['email'] ?? ''),
                    'name' => $googleData['name'] ?? $googleData['email'],
                ];
            }

            if ($provider === 'discord') {
                $clientId = env('DISCORD_CLIENT_ID');
                $clientSecret = env('DISCORD_CLIENT_SECRET');
                $redirectUri = env('DISCORD_REDIRECT_URI', "{$baseUrl}/auth/social/discord/callback");

                // Exchange authorization code for access token
                $tokenResponse = Http::asForm()->post('https://discord.com/api/oauth2/token', [
                    'client_id' => $clientId,
                    'client_secret' => $clientSecret,
                    'grant_type' => 'authorization_code',
                    'code' => $code,
                    'redirect_uri' => $redirectUri,
                ]);

                if (!$tokenResponse->successful()) {
                    return redirect("/auth/{$mode}?error=" . urlencode('Failed to fetch Discord OAuth token.'));
                }

                $accessToken = $tokenResponse->json('access_token');

                // Fetch Discord User Profile
                $userResponse = Http::withToken($accessToken)->get('https://discord.com/api/users/@me');

                if (!$userResponse->successful()) {
                    return redirect("/auth/{$mode}?error=" . urlencode('Failed to fetch Discord user profile.'));
                }

                $discordData = $userResponse->json();
                $email = strtolower($discordData['email'] ?? '');
                $username = $discordData['global_name'] ?? $discordData['username'] ?? 'Discord User';

                if (empty($email)) {
                    return redirect("/auth/{$mode}?error=" . urlencode('Discord account email is unverified or missing.'));
                }

                $socialUser = [
                    'email' => $email,
                    'name' => $username,
                ];
            }

            if (!$socialUser || empty($socialUser['email'])) {
                return redirect("/auth/{$mode}?error=" . urlencode('Could not retrieve user email from provider.'));
            }

            /** @var User $user */
            $user = User::where('email', $socialUser['email'])->first();

            if ($mode === 'register' && $user) {
                return redirect('/auth/login?error=' . urlencode('An account with this email address already exists. Please sign in instead.'));
            }

            if (!$user) {
                $user = User::create([
                    'name' => $socialUser['name'],
                    'email' => $socialUser['email'],
                    'password' => Hash::make(Str::random(32)),
                    'credits' => 10.00, // Welcome bonus
                    'root_admin' => false,
                ]);

                $user->creditTransactions()->create([
                    'amount' => 10.00,
                    'type' => 'bonus',
                    'description' => ucfirst($provider) . ' Social Sign-Up Bonus',
                    'reference_id' => 'SOCIAL-' . Str::upper(Str::random(8)),
                ]);
            }

            Auth::login($user);
            $request->session()->regenerate();

            return redirect('/');
        } catch (\Throwable $e) {
            return redirect("/auth/{$mode}?error=" . urlencode($e->getMessage()));
        }
    }
}
