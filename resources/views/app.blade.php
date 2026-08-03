<!DOCTYPE html>
<html lang="{{ str_replace('_', '-', app()->getLocale()) }}" class="dark">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">

    <title>{{ config('app.name', 'Laravel') }}</title>

    <link rel="icon" href="favicon.svg" sizes="any" type="image/svg+xml">

    <!-- Fonts -->
    <link rel="preconnect" href="https://fonts.googleapis.com">
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
    <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;600;700;800&display=swap">

    <!-- Inject Data -->
    @if(!is_null(Auth::user()))
        <script>
            window.ConvoyUser = {!! json_encode(Auth::user()->toReactObject()) !!};
        </script>
    @endif

    @if(!empty($siteConfiguration))
        <script>
            window.SiteConfiguration = {!! json_encode($siteConfiguration) !!};
        </script>
    @endif

    <!-- Scripts -->
    @viteReactRefresh
    @vite('resources/scripts/main.tsx')

    <!-- Analytics -->
    <!-- Vertex Cloud Analytics -->
    <script>
        window.plausible = window.plausible || function() {
            (window.plausible.q = window.plausible.q || []).push(arguments)
        }
    </script>
    <script>
        plausible('meta', {
            props: {
                version: '{{ config('app.version') }}',
            },
        })
    </script>
</head>
<body class="font-sans antialiased">
<div id="root"></div>
</body>
</html>
