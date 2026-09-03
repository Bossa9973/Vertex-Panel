<?php

namespace Convoy\Http\Controllers\Client;

use Convoy\Http\Controllers\Controller;
use Convoy\Jobs\Pterodactyl\ProvisionPterodactylVmJob;
use Convoy\Models\Location;
use Convoy\Models\Node;
use Convoy\Models\PterodactylDeploy;
use Convoy\Models\Server;
use Convoy\Models\Template;
use Convoy\Models\User;
use Convoy\Models\VpsPlan;
use Convoy\Services\Servers\ServerCreationService;
use Convoy\Helpers\PasswordHelper;
use Carbon\Carbon;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class ServerDeployController extends Controller
{
    public function getOptions(): JsonResponse
    {
        Cache::forget('deploy_options');

        $plans = VpsPlan::orderBy('price', 'asc')->get();
        if ($plans->isEmpty()) {
            $defaultPlans = [
                [
                    'name' => 'KVM Starter',
                    'ram' => 1024,
                    'cpu' => 1,
                    'disk' => 25,
                    'price' => 5.00,
                    'description' => 'Ideal for micro services, web hosting, and lightweight bots.',
                ],
                [
                    'name' => 'KVM Pro',
                    'ram' => 4096,
                    'cpu' => 2,
                    'disk' => 50,
                    'price' => 15.00,
                    'description' => 'High performance dual-core server for production applications.',
                ],
                [
                    'name' => 'KVM Enterprise',
                    'ram' => 8192,
                    'cpu' => 4,
                    'disk' => 100,
                    'price' => 30.00,
                    'description' => 'Dedicated quad-core performance for resource intensive workloads.',
                ],
            ];
            foreach ($defaultPlans as $dp) {
                VpsPlan::create($dp);
            }
            $plans = VpsPlan::orderBy('price', 'asc')->get();
        }

        $nodes = Node::with('location')->where('hidden', false)->get();
        if ($nodes->isEmpty()) {
            $anyNode = Node::first();
            if (!$anyNode) {
                $location = Location::first();
                if (!$location) {
                    $location = Location::create([
                        'short_code' => 'US-EAST',
                        'description' => 'North America (US East)',
                    ]);
                }

                $node = Node::create([
                    'location_id' => $location->id,
                    'name' => 'Node 1 (US-East)',
                    'cluster' => 'cluster-1',
                    'fqdn' => 'node1.vertexnodes.net',
                    'token_id' => Str::random(16),
                    'secret' => Str::random(32),
                    'port' => 8080,
                    'memory' => 64 * 1024,
                    'memory_overallocate' => 0,
                    'disk' => 1000 * 1024,
                    'disk_overallocate' => 0,
                    'vm_storage' => 'local-nvme',
                    'backup_storage' => 'local-backups',
                    'iso_storage' => 'local-iso',
                    'network' => 'vmbr0',
                    'hidden' => false,
                ]);

                $nodes = Node::with('location')->where('id', $node->id)->get();
            }
        }

        $visibleNodeIds = $nodes->pluck('id')->toArray();
        $locations = Location::with(['nodes' => function ($q) {
            $q->where('hidden', false);
        }])->whereHas('nodes', function ($q) {
            $q->where('hidden', false);
        })->get();

        $templates = Template::with('group')
            ->where('hidden', false)
            ->where(function ($q) use ($visibleNodeIds) {
                $q->whereNull('template_group_id')
                  ->orWhereHas('group', function ($gq) use ($visibleNodeIds) {
                      $gq->whereIn('node_id', $visibleNodeIds);
                  });
            })
            ->get();

        if ($templates->isEmpty()) {
            $firstNode = $nodes->first();
            $group = \Convoy\Models\TemplateGroup::firstOrCreate(
                ['name' => 'Linux'],
                ['node_id' => $firstNode ? $firstNode->id : 1]
            );

            $defaultTpls = [
                ['name' => 'Ubuntu 22.04 LTS', 'vmid' => 100, 'template_group_id' => $group->id, 'hidden' => false, 'order_column' => 1],
                ['name' => 'Debian 12 (Bookworm)', 'vmid' => 101, 'template_group_id' => $group->id, 'hidden' => false, 'order_column' => 2],
                ['name' => 'AlmaLinux 9', 'vmid' => 102, 'template_group_id' => $group->id, 'hidden' => false, 'order_column' => 3],
            ];

            foreach ($defaultTpls as $dt) {
                Template::create($dt);
            }
            $templates = Template::with('group')->get();
        }

        // Map OS SVG brand icons based on template name using exact brand SVGs
        $formattedTemplates = $templates->map(function ($tpl) {
            $nameLower = strtolower($tpl->name);
            $ubuntuIcon = 'data:image/svg+xml;utf8,%3Csvg%20role%3D%22img%22%20viewBox%3D%220%200%2024%2024%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ctitle%3EUbuntu%3C%2Ftitle%3E%3Cpath%20d%3D%22M17.61.455a3.41%203.41%200%200%200-3.41%203.41%203.41%203.41%200%200%200%203.41%203.41%203.41%203.41%200%200%200%203.41-3.41%203.41%203.41%200%200%200-3.41-3.41zM12.92.8C8.923.777%205.137%202.941%203.148%206.451a4.5%204.5%200%200%201%20.26-.007%204.92%204.92%200%200%201%202.585.737A8.316%208.316%200%200%201%2012.688%203.6%204.944%204.944%200%200%201%2013.723.834%2011.008%2011.008%200%200%200%2012.92.8zm9.226%204.994a4.915%204.915%200%200%201-1.918%202.246%208.36%208.36%200%200%201-.273%208.303%204.89%204.89%200%200%201%201.632%202.54%2011.156%2011.156%200%200%200%20.559-13.089zM3.41%207.932A3.41%203.41%200%200%200%200%2011.342a3.41%203.41%200%200%200%203.41%203.409%203.41%203.41%200%200%200%203.41-3.41%203.41%203.41%200%200%200-3.41-3.41zm2.027%207.866a4.908%204.908%200%200%201-2.915.358%2011.1%2011.1%200%200%200%207.991%206.698%2011.234%2011.234%200%200%200%202.422.249%204.879%204.879%200%200%201-.999-2.85%208.484%208.484%200%200%201-.836-.136%208.304%208.304%200%200%201-5.663-4.32zm11.405.928a3.41%203.41%200%200%200-3.41%203.41%203.41%203.41%200%200%200%203.41%203.41%203.41%203.41%200%200%200%203.41-3.41%203.41%203.41%200%200%200-3.41-3.41z%22%20fill%3D%22%23E95420%22%2F%3E%3C%2Fsvg%3E';
            $debianIcon = 'data:image/svg+xml;utf8,%3Csvg%20role%3D%22img%22%20viewBox%3D%220%200%2024%2024%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%3E%3Ctitle%3EDebian%3C%2Ftitle%3E%3Cpath%20d%3D%22M13.88%2012.685c-.4%200%20.08.2.601.28.14-.1.27-.22.39-.33a3.001%203.001%200%2001-.99.05m2.14-.53c.23-.33.4-.69.47-1.06-.06.27-.2.5-.33.73-.75.47-.07-.27%200-.56-.8%201.01-.11.6-.14.89m.781-2.05c.05-.721-.14-.501-.2-.221.07.04.13.5.2.22M12.38.31c.2.04.45.07.42.12.23-.05.28-.1-.43-.12m.43.12l-.15.03.14-.01V.43m6.633%209.944c.02.64-.2.95-.38%201.5l-.35.181c-.28.54.03.35-.17.78-.44.39-1.34%201.22-1.62%201.301-.201%200%20.14-.25.19-.34-.591.4-.481.6-1.371.85l-.03-.06c-2.221%201.04-5.303-1.02-5.253-3.842-.03.17-.07.13-.12.2a3.551%203.552%200%20012.001-3.501%203.361%203.362%200%20013.732.48%203.341%203.342%200%2000-2.721-1.3c-1.18.01-2.281.76-2.651%201.57-.6.38-.67%201.47-.93%201.661-.361%202.601.66%203.722%202.38%205.042.27.19.08.21.12.35a4.702%204.702%200%2001-1.53-1.16c.23.33.47.66.8.91-.55-.18-1.27-1.3-1.48-1.35.93%201.66%203.78%202.921%205.261%202.3a6.203%206.203%200%2001-2.33-.28c-.33-.16-.77-.51-.7-.57a5.802%205.803%200%20005.902-.84c.44-.35.93-.94%201.07-.95-.2.32.04.16-.12.44.44-.72-.2-.3.46-1.24l.24.33c-.09-.6.74-1.321.66-2.262.19-.3.2.3%200%20.97.29-.74.08-.85.15-1.46.08.2.18.42.23.63-.18-.7.2-1.2.28-1.6-.09-.05-.28.3-.32-.53%200-.37.1-.2.14-.28-.08-.05-.26-.32-.38-.861.08-.13.22.33.34.34-.08-.42-.2-.75-.2-1.08-.34-.68-.12.1-.4-.3-.34-1.091.3-.25.34-.74.54.77.84%201.96.981%202.46-.1-.6-.28-1.2-.49-1.76.16.07-.26-1.241.21-.37A7.823%207.824%200%200017.702%201.6c.18.17.42.39.33.42-.75-.45-.62-.48-.73-.67-.61-.25-.65.02-1.06%200C15.082.73%2014.862.8%2013.8.4l.05.23c-.77-.25-.9.1-1.73%200-.05-.04.27-.14.53-.18-.741.1-.701-.14-1.431.03.17-.13.36-.21.55-.32-.6.04-1.44.35-1.18.07C9.6.68%207.847%201.3%206.867%202.22L6.838%202c-.45.54-1.96%201.611-2.08%202.311l-.131.03c-.23.4-.38.85-.57%201.261-.3.52-.45.2-.4.28-.6%201.22-.9%202.251-1.16%203.102.18.27%200%201.65.07%202.76-.3%205.463%203.84%2010.776%208.363%2012.006.67.23%201.65.23%202.49.25-.99-.28-1.12-.15-2.08-.49-.7-.32-.85-.7-1.34-1.13l.2.35c-.971-.34-.57-.42-1.361-.67l.21-.27c-.31-.03-.83-.53-.97-.81l-.34.01c-.41-.501-.63-.871-.61-1.161l-.111.2c-.13-.21-1.52-1.901-.8-1.511-.13-.12-.31-.2-.5-.55l.14-.17c-.35-.44-.64-1.02-.62-1.2.2.24.32.3.45.33-.88-2.172-.93-.12-1.601-2.202l.15-.02c-.1-.16-.18-.34-.26-.51l.06-.6c-.63-.74-.18-3.102-.09-4.402.07-.54.53-1.1.88-1.981l-.21-.04c.4-.71%202.341-2.872%203.241-2.761.43-.55-.09%200-.18-.14.96-.991%201.26-.7%201.901-.88.7-.401-.6.16-.27-.151%201.2-.3.85-.7%202.421-.85.16.1-.39.14-.52.26%201-.49%203.151-.37%204.562.27%201.63.77%203.461%203.011%203.531%205.132l.08.02c-.04.85.13%201.821-.17%202.711l.2-.42M9.54%2013.236l-.05.28c.26.35.47.73.8%201.01-.24-.47-.42-.66-.75-1.3m.62-.02c-.14-.15-.22-.34-.31-.52.08.32.26.6.43.88l-.12-.36m10.945-2.382l-.07.15c-.1.76-.34%201.511-.69%202.212.4-.73.65-1.541.75-2.362M12.45.12c.27-.1.66-.05.95-.12-.37.03-.74.05-1.1.1l.15.02M3.006%205.142c.07.57-.43.8.11.42.3-.66-.11-.18-.1-.42m-.64%202.661c.12-.39.15-.62.2-.84-.35.44-.17.53-.2.83%22%20fill%3D%22%23A80030%22%2F%3E%3C%2Fsvg%3E';
            $windowsIcon = 'data:image/svg+xml;utf8,%3Csvg%20viewBox%3D%220%200%2088%2088%22%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20height%3D%2288%22%20width%3D%2288%22%3E%3Cpath%20d%3D%22m0%2012.402%2035.687-4.86.016%2034.423-35.67.203zm35.67%2033.529.028%2034.453L.028%2075.48.026%2045.7zm4.326-39.025L87.314%200v41.527l-47.318.376zm47.329%2039.349-.011%2041.34-47.318-6.678-.066-34.739z%22%20fill%3D%22%2300adef%22%2F%3E%3C%2Fsvg%3E';

            $icon = $ubuntuIcon;

            if (Str::contains($nameLower, 'debian')) {
                $icon = $debianIcon;
            } elseif (Str::contains($nameLower, 'windows')) {
                $icon = $windowsIcon;
            } elseif (Str::contains($nameLower, 'alpine')) {
                $icon = 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/alpine/alpine-original.svg';
            } elseif (Str::contains($nameLower, ['rocky', 'centos', 'alma', 'redhat'])) {
                $icon = 'https://cdn.jsdelivr.net/gh/devicons/devicon/icons/centos/centos-original.svg';
            }

            return [
                'id'          => $tpl->id,
                'uuid'        => $tpl->uuid,
                'name'        => $tpl->name,
                'node_id'     => $tpl->group ? $tpl->group->node_id : null,
                'category'    => $tpl->group ? $tpl->group->name : 'Linux',
                'icon_svg'    => $icon,
                'description' => 'System Image Template',
            ];
        });

        // Format nodes for selection
        $formattedNodes = $nodes->map(function ($node) {
            $locCode = $node->location ? strtolower($node->location->short_code) : '';
            $locDesc = $node->location ? strtolower($node->location->description ?? '') : '';
            $nodeName = strtolower($node->name ?? '');

            $flag = 'https://flagcdn.com/w40/de.png';
            if (Str::contains($locCode, ['in', 'ind']) || Str::contains($locDesc, ['india', 'mumbai', 'delhi', 'bangalore', 'chennai', 'hyderabad', 'pune', 'kolkata']) || Str::contains($nodeName, ['india', 'in-', 'in_', 'mumbai', 'delhi', 'bangalore', 'chennai', 'hyderabad', 'pune', 'kolkata', 'ind-'])) {
                $flag = 'https://flagcdn.com/w40/in.png';
            } elseif (Str::contains($locCode, 'us') || Str::contains($locDesc, ['united states', 'usa', 'america', 'new york', 'dallas', 'chicago', 'los angeles', 'miami']) || Str::contains($nodeName, ['us-', 'us_', 'usa', 'new york'])) {
                $flag = 'https://flagcdn.com/w40/us.png';
            } elseif (Str::contains($locCode, ['uk', 'gb']) || Str::contains($locDesc, ['united kingdom', 'london', 'great britain', 'england']) || Str::contains($nodeName, ['uk-', 'uk_', 'london'])) {
                $flag = 'https://flagcdn.com/w40/gb.png';
            } elseif (Str::contains($locCode, 'jp') || Str::contains($locDesc, ['japan', 'tokyo', 'osaka']) || Str::contains($nodeName, ['jp-', 'jp_', 'tokyo'])) {
                $flag = 'https://flagcdn.com/w40/jp.png';
            } elseif (Str::contains($locCode, 'sg') || Str::contains($locDesc, 'singapore') || Str::contains($nodeName, ['sg-', 'sg_', 'singapore'])) {
                $flag = 'https://flagcdn.com/w40/sg.png';
            } elseif (Str::contains($locCode, 'au') || Str::contains($locDesc, ['australia', 'sydney', 'melbourne']) || Str::contains($nodeName, ['au-', 'au_', 'sydney'])) {
                $flag = 'https://flagcdn.com/w40/au.png';
            } elseif (Str::contains($locCode, 'ca') || Str::contains($locDesc, ['canada', 'toronto', 'montreal', 'vancouver'])) {
                $flag = 'https://flagcdn.com/w40/ca.png';
            } elseif (Str::contains($locCode, 'fr') || Str::contains($locDesc, ['france', 'paris'])) {
                $flag = 'https://flagcdn.com/w40/fr.png';
            } elseif (Str::contains($locCode, ['de', 'ger']) || Str::contains($locDesc, ['germany', 'frankfurt', 'berlin'])) {
                $flag = 'https://flagcdn.com/w40/de.png';
            }

            return [
                'id'            => $node->id,
                'name'          => $node->name,
                'fqdn'          => $node->fqdn,
                'cluster'       => $node->cluster,
                'location_id'   => $node->location_id,
                'location_code' => $locCode,
                'location_name' => $node->location ? $node->location->description : $node->name,
                'flag'          => $flag,
            ];
        });

        $appInstallSetting = DB::table('settings')->where('key', 'app_installation_enabled')->first();
        $appInstallEnabled = $appInstallSetting ? ($appInstallSetting->value === 'true' || $appInstallSetting->value === '1') : true;

        return response()->json([
            'plans'                    => $plans,
            'nodes'                    => $formattedNodes,
            'locations'                => $locations,
            'templates'                => $formattedTemplates,
            'app_installation_enabled' => $appInstallEnabled,
        ]);
    }

    public function deploy(Request $request, ServerCreationService $creationService): JsonResponse
    {
        $validated = $request->validate([
            'plan_id'             => 'required|integer|exists:vps_plans,id',
            'node_id'             => 'required|integer|exists:nodes,id',
            'template_uuid'       => 'required|string|exists:templates,uuid',
            'name'                => 'required|string|min:2|max:40',
            'hostname'            => 'nullable|string|min:3|max:191',
            'account_password'    => 'required|string|min:8|max:100',
            'start_on_completion' => 'nullable|boolean',
            // Pterodactyl auto-deploy fields — only required when install_pterodactyl=true
            'install_pterodactyl' => 'nullable|boolean',
            'cf_tunnel_token'     => 'nullable|string|min:100',
            'panel_fqdn'          => 'nullable|string|regex:/^[a-zA-Z0-9.\-]+$/',
            'wings_fqdn'          => 'nullable|string|regex:/^[a-zA-Z0-9.\-]+$/',
            'admin_email'         => 'nullable|email',
            'admin_username'      => 'nullable|string|alpha_num|max:32',
            'admin_firstname'     => 'nullable|string|max:64',
            'admin_lastname'      => 'nullable|string|max:64',
        ]);

        // If Pterodactyl install was requested, enforce required fields
        if (!empty($validated['install_pterodactyl'])) {
            $appInstallSetting = DB::table('settings')->where('key', 'app_installation_enabled')->first();
            $appInstallEnabled = $appInstallSetting ? ($appInstallSetting->value === 'true' || $appInstallSetting->value === '1') : true;
            if (!$appInstallEnabled) {
                return response()->json([
                    'message' => 'Application auto-installation is currently disabled by the administrator.',
                ], 403);
            }

            $pteroRequired = ['cf_tunnel_token', 'panel_fqdn', 'wings_fqdn', 'admin_email', 'admin_username', 'admin_firstname', 'admin_lastname'];
            foreach ($pteroRequired as $field) {
                if (empty($validated[$field])) {
                    return response()->json([
                        'message' => "Field '{$field}' is required for Pterodactyl installation.",
                    ], 422);
                }
            }
        }


        /** @var User $user */
        $user = $request->user();

        if ($user && $user->suspended_until && \Carbon\Carbon::parse($user->suspended_until)->isFuture()) {
            $until = \Carbon\Carbon::parse($user->suspended_until)->format('Y-m-d H:i');
            return response()->json([
                'message' => "Your account is currently suspended from deploying VPS servers until {$until} due to policy violations.",
            ], 403);
        }

        // Enforce max VPS instances limit for non-admin users (limit = 2)
        if (!$user->root_admin) {
            $existingCount = Server::where('user_id', $user->id)->count();
            if ($existingCount >= 2) {
                return response()->json([
                    'message' => 'Non-admin accounts are limited to a maximum of 2 active VPS instances.',
                ], 400);
            }
        }

        /** @var VpsPlan $plan */
        $plan = VpsPlan::findOrFail($validated['plan_id']);

        // Enforce resource quotas for free tier servers:
        // Free users across non-paid instances cannot exceed: 16 CPU cores, 96 GB RAM, 800 GB SSD
        $freeServers = Server::where('user_id', $user->id)
            ->where(function ($q) {
                $q->where('plan_tier', '!=', 'paid')->orWhereNull('plan_tier');
            })
            ->get();

        $currentCores = $freeServers->sum(fn($s) => (float) $s->cpu);
        $currentRamBytes = $freeServers->sum(fn($s) => $s->memory > 100000 ? (int) $s->memory : (int) $s->memory * 1024 * 1024);
        $currentDiskBytes = $freeServers->sum(fn($s) => $s->disk > 100000 ? (int) $s->disk : (int) $s->disk * 1024 * 1024 * 1024);

        $planCores = (float) $plan->cpu;
        $planRamBytes = (int) $plan->ram * 1024 * 1024;           // MB -> bytes
        $planDiskBytes = (int) $plan->disk * 1024 * 1024 * 1024;  // GB -> bytes

        $maxCores = 16.0;
        $maxRamBytes = 96 * 1024 * 1024 * 1024;    // 96 GB in bytes
        $maxDiskBytes = 800 * 1024 * 1024 * 1024;  // 800 GB in bytes

        if (($currentCores + $planCores) > $maxCores) {
            return response()->json([
                'message' => "Free resource allocation limit exceeded: Maximum CPU core limit is 16 cores (Currently used: {$currentCores} cores, Requested: {$planCores} cores).",
            ], 422);
        }

        if (($currentRamBytes + $planRamBytes) > $maxRamBytes) {
            $usedRamGb = round($currentRamBytes / (1024 * 1024 * 1024), 1);
            $reqRamGb = round($planRamBytes / (1024 * 1024 * 1024), 1);
            return response()->json([
                'message' => "Free resource allocation limit exceeded: Maximum RAM limit is 96 GB (Currently used: {$usedRamGb} GB, Requested: {$reqRamGb} GB).",
            ], 422);
        }

        if (($currentDiskBytes + $planDiskBytes) > $maxDiskBytes) {
            $usedDiskGb = round($currentDiskBytes / (1024 * 1024 * 1024), 1);
            $reqDiskGb = round($planDiskBytes / (1024 * 1024 * 1024), 1);
            return response()->json([
                'message' => "Free resource allocation limit exceeded: Maximum SSD storage limit is 800 GB (Currently used: {$usedDiskGb} GB, Requested: {$reqDiskGb} GB).",
            ], 422);
        }

        /** @var Node $node */
        $node = Node::with('location')->findOrFail($validated['node_id']);

        if ($node->hidden) {
            return response()->json([
                'message' => 'The selected datacenter node is currently disabled or hidden from deployments.',
            ], 422);
        }

        /** @var Template $template */
        $template = Template::with('group')->where('uuid', $validated['template_uuid'])->firstOrFail();

        // Validate the template belongs to the selected node
        if ($template->group && $template->group->node_id !== $node->id) {
            return response()->json([
                'message' => 'The selected OS template is not available on the chosen hypervisor node.',
            ], 422);
        }

        if ((float) $user->credits < (float) $plan->price) {
            return response()->json([
                'message' => "Insufficient BOLTs balance. Required: {$plan->price} BOLTs, Available: {$user->credits} BOLTs.",
                'required' => $plan->price,
                'available' => (float) $user->credits,
            ], 400);
        }

        $hostname = !empty($validated['hostname'])
            ? $validated['hostname']
            : Str::slug($validated['name']) . '.vertexnodes.net';

        // Convert plan limits to bytes (Convoy expects bytes for memory and disk)
        $memoryBytes = (int) $plan->ram  * 1024 * 1024;       // MB → bytes
        $diskBytes   = (int) $plan->disk * 1024 * 1024 * 1024; // GB → bytes

        // Full Convoy-spec server creation payload
        $serverData = [
            'node_id'             => $node->id,
            'user_id'             => $user->id,
            'name'                => $validated['name'],
            'hostname'            => $hostname,
            'vmid'                => null, // let ServerCreationService auto-generate a unique VMID
            'limits'              => [
                'cpu'         => (int) $plan->cpu,
                'memory'      => $memoryBytes,
                'disk'        => $diskBytes,
                'snapshots'   => 0,
                'backups'     => null,
                'bandwidth'   => null,
                'address_ids' => [],
            ],
            'account_password'    => $validated['account_password'],
            'should_create_server'=> true,
            'template_uuid'       => $template->uuid,
            'start_on_completion' => (bool) ($validated['start_on_completion'] ?? true),
        ];

        try {
            $result = DB::transaction(function () use ($user, $plan, $node, $template, $serverData, $validated, $creationService) {
                // Re-read credits inside the transaction with a row lock to prevent race conditions
                $freshUser = \Convoy\Models\User::lockForUpdate()->findOrFail($user->id);

                if ((float) $freshUser->credits < (float) $plan->price) {
                    throw new \Illuminate\Validation\ValidationException(
                        validator([], []),
                        response()->json([
                            'message'   => "Insufficient BOLTs balance. Required: {$plan->price} BOLTs, Available: {$freshUser->credits} BOLTs.",
                            'required'  => $plan->price,
                            'available' => (float) $freshUser->credits,
                        ], 400)
                    );
                }

                $server = $creationService->handle($serverData);

                // Deduct credits only after successful server creation
                $freshUser->credits = (float) $freshUser->credits - (float) $plan->price;
                $freshUser->save();

                $freshUser->creditTransactions()->create([
                    'amount'       => -(float) $plan->price,
                    'type'         => 'deduction',
                    'description'  => "Deployed VPS: {$validated['name']} ({$plan->name} on {$node->name})",
                    'reference_id' => 'DEPLOY-' . Str::upper(Str::random(8)),
                ]);

                // Store plan/os metadata as description, set 30-day expiry
                $server->description = "Plan: {$plan->name} | OS: {$template->name} (Node: {$node->name})";
                $server->expires_at  = Carbon::now()->addDays(30);
                $server->save();

                return ['server' => $server, 'user' => $freshUser];
            });

            $server = $result['server'];
            $user   = $result['user'];

            // ── Pterodactyl auto-deploy: create deploy record and kick off job ──
            $pteroDeploy = null;
            if (!empty($validated['install_pterodactyl'])) {
                $node   = Node::with('location')->findOrFail($validated['node_id']);
                $locCode = $node->location ? strtoupper($node->location->short_code) : 'AUTO';

                $pteroConfig = [
                    'panel_fqdn'       => $validated['panel_fqdn'],
                    'wings_fqdn'       => $validated['wings_fqdn'],
                    'cf_tunnel_token'  => $validated['cf_tunnel_token'],
                    'admin_email'      => $validated['admin_email'],
                    'admin_username'   => $validated['admin_username'],
                    'admin_firstname'  => $validated['admin_firstname'],
                    'admin_lastname'   => $validated['admin_lastname'],
                    'admin_password'   => PasswordHelper::generate(),
                    'db_password'      => PasswordHelper::generate(),
                    'db_root_password' => PasswordHelper::generate(),
                    'timezone'         => $validated['timezone'] ?? 'UTC',
                    'node_name'        => 'vertex-node-' . $server->id,
                    'node_memory'      => (int) round(($validated['ram'] ?? 4096) * 0.8),
                    'node_disk'        => (int) round(($validated['disk'] ?? 51200) * 0.8),
                    'location_short'   => strtoupper(preg_replace('/[^a-zA-Z0-9]/', '', $locCode)),
                ];

                $pteroDeploy = PterodactylDeploy::create([
                    'user_id'       => $user->id,
                    'server_id'     => $server->id,
                    'status'        => 'pending',
                    'deploy_secret' => bin2hex(random_bytes(32)),
                    'config'        => $pteroConfig,
                    'panel_fqdn'    => $validated['panel_fqdn'],
                    'wings_fqdn'    => $validated['wings_fqdn'],
                ]);

                ProvisionPterodactylVmJob::dispatch($pteroDeploy->id)->onQueue('default');
            }

            try {
                \Convoy\Facades\Activity::event('server:create')
                    ->actor($user)
                    ->subject($server)
                    ->description("Deployed VPS server '{$server->name}' (Plan: {$plan->name}, Cost: {$plan->price} BOLTs, Node: {$node->name})")
                    ->property([
                        'server_name' => $server->name,
                        'plan_name'   => $plan->name,
                        'price'       => (float) $plan->price,
                        'node_name'   => $node->name,
                        'os_template' => $template->name,
                        'vmid'        => $server->vmid,
                    ])
                    ->withRequestMetadata()
                    ->log();

                \Convoy\Facades\Activity::event('bolts:spend-deploy')
                    ->actor($user)
                    ->subject($server)
                    ->description("Spent {$plan->price} BOLTs deploying VPS server '{$server->name}'")
                    ->property(['amount' => (float) $plan->price, 'server_name' => $server->name])
                    ->withRequestMetadata()
                    ->log();
            } catch (\Throwable $e) {}

            return response()->json([
                'success'      => true,
                'message'      => "Server '{$server->name}' is now provisioning on node {$node->name}!",
                'server'       => [
                    'id'          => $server->uuid_short,
                    'internal_id' => $server->id,
                    'name'        => $server->name,
                    'hostname'    => $server->hostname,
                    'status'      => $server->status ?? 'installing',
                    'location'    => $node->name,
                    'os_template' => $template->name,
                    'ip'          => $node->fqdn,
                    'price'       => $plan->price,
                    'expires_at'  => $server->expires_at->toIso8601String(),
                ],
                'user_credits'    => (float) $user->credits,
                'ptero_deploy_id' => $pteroDeploy?->id,
            ]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error("Server provisioning failed for user ID {$user->id}: " . $e->getMessage(), ['exception' => $e]);
            return response()->json([
                'message' => 'Server provisioning failed due to a hypervisor error. Please try again or contact support.',
            ], 500);
        }
    }

    public function destroy(Request $request, string $uuid): JsonResponse
    {
        /** @var User $user */
        $user = $request->user();

        $server = Server::where('user_id', $user->id)
            ->where(function ($q) use ($uuid) {
                $q->where('uuid', $uuid)
                  ->orWhere('uuid_short', $uuid)
                  ->orWhere('id', is_numeric($uuid) ? (int) $uuid : -1);
            })
            ->firstOrFail();

        $serverName = $server->name;
        $vmid = $server->vmid;

        $server->delete();

        try {
            \Convoy\Facades\Activity::event('server:delete')
                ->actor($user)
                ->description("Deleted VPS server '{$serverName}' (VMID: {$vmid})")
                ->property(['server_name' => $serverName, 'vmid' => $vmid])
                ->withRequestMetadata()
                ->log();
        } catch (\Throwable $e) {}

        return response()->json(['success' => true, 'message' => "Server '{$serverName}' has been deleted."]);
    }

    public function renew(Request $request, int $id): JsonResponse
    {
        try {
            /** @var User $user */
            $user = $request->user();

            /** @var Server $server */
            $server = Server::where('user_id', $user->id)->findOrFail($id);

            // Calculate actual VPS plan cost for renewal
            $renewCost = 10.00;
            if (!empty($server->description) && preg_match('/Plan:\s*([^|]+)/i', $server->description, $matches)) {
                $planName = trim($matches[1]);
                $plan = VpsPlan::where('name', $planName)->first();
                if ($plan) {
                    $renewCost = (float) $plan->price;
                }
            } else {
                $ramMb = $server->memory > 100000 ? (int) round($server->memory / (1024 * 1024)) : (int) $server->memory;
                if ($ramMb > 0) {
                    $plan = VpsPlan::where('ram', '>=', $ramMb)->orderBy('price', 'asc')->first();
                    if ($plan) {
                        $renewCost = (float) $plan->price;
                    }
                }
            }

            if ((float) $user->credits < $renewCost) {
                return response()->json([
                    'message' => 'Insufficient BOLTs to renew server. Required: ' . number_format($renewCost, 2) . ' BOLTs',
                ], 400);
            }

            $freshUser = DB::transaction(function () use ($user, $server, $renewCost) {
                // Re-read credits with a row lock to prevent race conditions
                $freshUser = \Convoy\Models\User::lockForUpdate()->findOrFail($user->id);

                if ((float) $freshUser->credits < $renewCost) {
                    return null;
                }

                $freshUser->credits = (float) $freshUser->credits - $renewCost;
                $freshUser->save();

                $freshUser->creditTransactions()->create([
                    'amount'       => -$renewCost,
                    'type'         => 'deduction',
                    'description'  => "Renewed VPS Instance: {$server->name} (+30 Days)",
                    'reference_id' => 'RENEW-' . Str::upper(Str::random(8)),
                ]);

                $currentExpires = $server->expires_at ? Carbon::parse($server->expires_at) : Carbon::now();
                if ($currentExpires->isPast()) {
                    $currentExpires = Carbon::now();
                }

                $server->expires_at = $currentExpires->addDays(30);
                $server->save();

                return $freshUser;
            });

            if (!$freshUser) {
                return response()->json([
                    'message' => 'Insufficient BOLTs to renew server. Required: ' . number_format($renewCost, 2) . ' BOLTs',
                ], 400);
            }

            try {
                \Convoy\Facades\Activity::event('server:renew')
                    ->actor($user)
                    ->subject($server)
                    ->description("Renewed VPS server '{$server->name}' for {$renewCost} BOLTs (+30 days)")
                    ->property(['server_name' => $server->name, 'cost' => $renewCost, 'expires_at' => (string) $server->expires_at])
                    ->withRequestMetadata()
                    ->log();

                \Convoy\Facades\Activity::event('bolts:spend-renew')
                    ->actor($user)
                    ->subject($server)
                    ->description("Spent {$renewCost} BOLTs renewing VPS server '{$server->name}'")
                    ->property(['amount' => $renewCost, 'server_name' => $server->name])
                    ->withRequestMetadata()
                    ->log();
            } catch (\Throwable $e) {}

            $expiresIso = $server->expires_at instanceof \Carbon\Carbon
                ? $server->expires_at->toIso8601String()
                : \Carbon\Carbon::parse($server->expires_at)->toIso8601String();

            return response()->json([
                'success'      => true,
                'message'      => "Server '{$server->name}' renewed for an additional 30 days!",
                'expires_at'   => $expiresIso,
                'user_credits' => (float) $freshUser->credits,
            ]);
        } catch (\Throwable $e) {
            \Illuminate\Support\Facades\Log::error('Server renewal failed', [
                'server_id' => $id,
                'user_id'   => $request->user()->id ?? null,
                'error'     => $e->getMessage(),
                'trace'     => $e->getTraceAsString(),
            ]);

            return response()->json([
                'success' => false,
                'message' => 'Failed to process server renewal: ' . $e->getMessage(),
            ], 400);
        }
    }
}
