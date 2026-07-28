<?php

// Parse the requested URI path
$uri = urldecode(parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH));

// Serve real static files from the public/ directory
$publicFile = __DIR__ . '/public' . $uri;
if ($uri !== '/' && file_exists($publicFile) && !is_dir($publicFile)) {
    return false;
}

// All other requests (including virtual .json routes) go through Laravel
$_SERVER['DOCUMENT_ROOT'] = __DIR__ . '/public';
chdir(__DIR__ . '/public');
require_once __DIR__ . '/public/index.php';
