<?php

namespace Convoy\Helpers;

class PasswordHelper
{
    /**
     * Generate a cryptographically secure alphanumeric password.
     *
     * Alphanumeric only — eliminates the entire class of shell injection bugs
     * where a password containing `"`, `\`, `$`, or `` ` `` breaks cloud-init
     * bash scripts or JSON webhook payloads.
     *
     * Do NOT use Str::random() — it includes `+`, `/`, `=` from base64.
     */
    public static function generate(int $length = 24): string
    {
        $chars  = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
        $max    = strlen($chars) - 1;
        $result = '';

        for ($i = 0; $i < $length; $i++) {
            // random_int is cryptographically secure (uses OS CSPRNG)
            $result .= $chars[random_int(0, $max)];
        }

        return $result;
    }
}
