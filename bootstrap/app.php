<?php

if (!defined('SIGHUP')) define('SIGHUP', 1);
if (!defined('SIGINT')) define('SIGINT', 2);
if (!defined('SIGQUIT')) define('SIGQUIT', 3);
if (!defined('SIGILL')) define('SIGILL', 4);
if (!defined('SIGTRAP')) define('SIGTRAP', 5);
if (!defined('SIGABRT')) define('SIGABRT', 6);
if (!defined('SIGBUS')) define('SIGBUS', 7);
if (!defined('SIGFPE')) define('SIGFPE', 8);
if (!defined('SIGKILL')) define('SIGKILL', 9);
if (!defined('SIGUSR1')) define('SIGUSR1', 10);
if (!defined('SIGSEGV')) define('SIGSEGV', 11);
if (!defined('SIGUSR2')) define('SIGUSR2', 12);
if (!defined('SIGPIPE')) define('SIGPIPE', 13);
if (!defined('SIGALRM')) define('SIGALRM', 14);
if (!defined('SIGTERM')) define('SIGTERM', 15);
if (!defined('SIGSTKFLT')) define('SIGSTKFLT', 16);
if (!defined('SIGCHLD')) define('SIGCHLD', 17);
if (!defined('SIGCONT')) define('SIGCONT', 18);
if (!defined('SIGSTOP')) define('SIGSTOP', 19);
if (!defined('SIGTSTP')) define('SIGTSTP', 20);
if (!defined('SIGTTIN')) define('SIGTTIN', 21);
if (!defined('SIGTTOU')) define('SIGTTOU', 22);
if (!defined('SIGURG')) define('SIGURG', 23);
if (!defined('SIGXCPU')) define('SIGXCPU', 24);
if (!defined('SIGXFSZ')) define('SIGXFSZ', 25);
if (!defined('SIGVTALRM')) define('SIGVTALRM', 26);
if (!defined('SIGPROF')) define('SIGPROF', 27);
if (!defined('SIGWINCH')) define('SIGWINCH', 28);
if (!defined('SIGIO')) define('SIGIO', 29);
if (!defined('SIGPOLL')) define('SIGPOLL', 29);
if (!defined('SIGPWR')) define('SIGPWR', 30);
if (!defined('SIGSYS')) define('SIGSYS', 31);

if (!function_exists('pcntl_async_signals')) {
    function pcntl_async_signals($enable = null) { return true; }
}
if (!function_exists('pcntl_signal')) {
    function pcntl_signal($signo, $handler, $restart_syscalls = true) { return true; }
}
if (!function_exists('pcntl_alarm')) {
    function pcntl_alarm($seconds) { return 0; }
}
if (!function_exists('pcntl_fork')) {
    function pcntl_fork() { return -1; }
}
if (!function_exists('pcntl_wait')) {
    function pcntl_wait(&$status, $options = 0) { return -1; }
}
if (!function_exists('pcntl_signal_dispatch')) {
    function pcntl_signal_dispatch() { return true; }
}

$app = new Illuminate\Foundation\Application(
    $_ENV['APP_BASE_PATH'] ?? dirname(__DIR__)
);

/*
|--------------------------------------------------------------------------
| Bind Important Interfaces
|--------------------------------------------------------------------------
|
| Next, we need to bind some important interfaces into the container so
| we will be able to resolve them when needed. The kernels serve the
| incoming requests to this application from both the web and CLI.
|
*/

$app->singleton(
    Illuminate\Contracts\Http\Kernel::class,
    Convoy\Http\Kernel::class
);

$app->singleton(
    Illuminate\Contracts\Console\Kernel::class,
    Convoy\Console\Kernel::class
);

$app->singleton(
    Illuminate\Contracts\Debug\ExceptionHandler::class,
    Convoy\Exceptions\Handler::class
);

/*
|--------------------------------------------------------------------------
| Return The Application
|--------------------------------------------------------------------------
|
| This script returns the application instance. The instance is given to
| the calling script so we can separate the building of the instances
| from the actual running of the application and sending responses.
|
*/

return $app;
