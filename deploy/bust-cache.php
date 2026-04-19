<?php
/**
 * Cache-busting version injector.
 * Replaces ?v=XXXXXXXX in index.html with the current git short hash
 * (or a timestamp fallback), so browsers always fetch the latest CSS/JS.
 */

// shell_exec is often disabled on shared hosting — fall back to timestamp
$hash = '';
if (function_exists('shell_exec')) {
    $result = shell_exec('git rev-parse --short HEAD 2>/dev/null');
    if ($result) {
        $hash = trim($result);
    }
}
if (!$hash) {
    $hash = date('YmdHis');
}

$file = dirname(__DIR__) . '/index.html';
if (!file_exists($file)) {
    echo "Cache-bust: index.html not found at {$file}\n";
    exit(0);
}

$html = file_get_contents($file);
$updated = preg_replace('/(\?v=)[a-zA-Z0-9]+/', '$1' . $hash, $html);

if ($updated === $html) {
    echo "Cache-bust: no ?v= tokens found — nothing to update.\n";
} else {
    file_put_contents($file, $updated);
    echo "Cache-bust: injected version {$hash} into index.html\n";
}
