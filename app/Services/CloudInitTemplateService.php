<?php

namespace Convoy\Services;

use RuntimeException;

/**
 * Renders cloud-init YAML templates from storage/app/templates/.
 *
 * Templates use ##VARIABLE_NAME## placeholders. All variables must be replaced
 * before the YAML is returned — an unreplaced placeholder causes a hard throw
 * so the VM is never provisioned with a broken script.
 *
 * Templates are NEVER processed by Blade — they are raw YAML loaded with
 * file_get_contents() only. No PHP syntax, no @directives, no {{ }}.
 */
class CloudInitTemplateService
{
    public function render(string $templateName, array $vars): string
    {
        $path = storage_path("app/templates/{$templateName}");

        if (! file_exists($path)) {
            throw new RuntimeException("Cloud-init template not found: {$path}");
        }

        $template = file_get_contents($path);

        foreach ($vars as $key => $value) {
            // Escape backslashes first, then double quotes.
            // Even though passwords are alphanum-only and don't need this,
            // other values like FQDN or timezone could contain special chars.
            $safe        = str_replace(['\\', '"'], ['\\\\', '\\"'], (string) $value);
            $placeholder = '##' . $key . '##';
            $template    = str_replace($placeholder, $safe, $template);
        }

        // Hard fail before VM is provisioned — catch missing vars early
        if (preg_match_all('/##([A-Z_]+)##/', $template, $matches)) {
            $missing = implode(', ', $matches[1]);
            throw new RuntimeException(
                "Cloud-init template has unreplaced variables: {$missing}"
            );
        }

        return $template;
    }
}
