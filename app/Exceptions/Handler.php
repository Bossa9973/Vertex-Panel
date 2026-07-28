<?php

namespace Convoy\Exceptions;

use Exception;
use Throwable;
use Illuminate\Container\Container;
use Illuminate\Foundation\Exceptions\Handler as ExceptionHandler;
use Illuminate\Http\JsonResponse;

class Handler extends ExceptionHandler
{
    /**
     * A list of the inputs that are never flashed to the session on validation exceptions.
     *
     * @var array<int, string>
     */
    protected $dontFlash = [
        'current_password',
        'password',
        'password_confirmation',
    ];

    /**
     * Register the exception handling callbacks for the application.
     */
    public function register(): void
    {
        $this->reportable(function (Throwable $e) {
            //
        });
    }

    /**
     * Render an exception into an HTTP response.
     */
    public function render($request, Throwable $e)
    {
        // Graceful handling for Horizon API polling when Redis is not active/running
        if ($request->is('horizon/api/*') || $request->is('horizon/*')) {
            $msg = strtolower($e->getMessage());
            if (
                str_contains($msg, 'refused') ||
                str_contains($msg, 'redis') ||
                str_contains($msg, 'connection') ||
                $e instanceof \Predis\Connection\Resource\Exception\StreamInitException
            ) {
                if ($request->is('horizon/api/stats')) {
                    return response()->json([
                        'jobsPerMinute' => 0,
                        'recentlyFailed' => 0,
                        'status' => 'inactive',
                        'wait' => [],
                    ]);
                }

                if ($request->is('horizon/api/masters')) {
                    return response()->json([]);
                }

                if ($request->is('horizon/api/workload')) {
                    return response()->json([]);
                }

                if ($request->is('horizon/api/jobs/*')) {
                    return response()->json(['jobs' => [], 'total' => 0]);
                }

                return response()->json([]);
            }
        }

        return parent::render($request, $e);
    }

    /**
     * Return an array of exceptions that should not be reported.
     */
    public static function isReportable(Exception $exception): bool
    {
        return (new static(Container::getInstance()))->shouldReport($exception);
    }

    /**
     * Helper method to allow reaching into the handler to convert an exception
     * into the expected array response type.
     */
    public static function toArray(Throwable $e): array
    {
        return (new self(app()))->convertExceptionToArray($e);
    }
}
