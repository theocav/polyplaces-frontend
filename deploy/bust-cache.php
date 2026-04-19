<?php
/**
 * Cache-busting version injector.
 * Replaces ?v=XXXXXXXX in index.html with the current git short hash,
 * so browsers always fetch the latest CSS/JS after a deploy.
 */

$hash = trim(shell_exec('git rev-parse --short HEAD 2>/dev/null') ?? '');
if (!$hash) {
    $hash = date('YmdHis'); // fallback: timestamp
}

$file = __DIR__ . '/../index.html';
$html = file_get_contents($file);

// Replace every ?v=<anything> query string on asset links
$updated = preg_replace('/(\?v=)[a-zA-Z0-9]+/', '$1' . $hash, $html);

if ($updated === $html) {
    echo "Cache-bust: no ?v= tokens found — nothing changed.\n";
} else {
    file_put_contents($file, $updated);
    echo "Cache-bust: injected version {$hash} into index.html\n";
}
