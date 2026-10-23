<?php

declare(strict_types=1);

namespace BensGames;

/**
 * Prüfung hochgeladener Community-Level von Nova Bastion. Übernimmt nur bekannte Felder mit sinnvollen Werten
 * (übertragen aus netlify/functions/community.mjs im Repo nova-bastion, dort gepflegt von Codex).
 * Ändert das Spiel sein Level-Format, muss diese Datei mitziehen – Auftrag über Ben an den Plattform-Chat.
 */
final class NovaBastionLevel
{
    public const STYLES = ['moon', 'ice', 'lava', 'station', 'crystal'];
    private const FOCUS = ['air', 'stealth', 'swarm', 'armor'];
    private const OBJ = ['convoy', 'survive', 'nests', 'budget'];

    /** @return array<string, mixed>|null bereinigtes Level oder null, wenn es unbrauchbar ist */
    public static function sanitize(mixed $lv): ?array
    {
        if (!is_array($lv) || !is_array($lv['paths'] ?? null) || $lv['paths'] === [] || count($lv['paths']) > 3) {
            return null;
        }
        $paths = [];
        foreach (array_values($lv['paths']) as $path) {
            $points = self::points($path, 40);
            if ($points === null) {
                return null;
            }
            $paths[] = $points;
        }
        $o = ['name' => self::clean($lv['name'] ?? '', 28) ?: 'Mein Level', 'paths' => $paths];

        if (is_array($lv['spots'] ?? null)) {
            $spots = [];
            foreach (array_slice(array_values($lv['spots']), 0, 40) as $s) {
                $x = self::num(is_array($s) ? ($s[0] ?? null) : null, 0, 480);
                $y = self::num(is_array($s) ? ($s[1] ?? null) : null, 0, 270);
                if ($x === null || $y === null) {
                    continue;
                }
                $type = in_array($s[2] ?? null, ['', 'high', 'node', 'rock'], true) ? $s[2] : '';
                $spot = [(int) round($x), (int) round($y), $type];
                if (is_array($s[3] ?? null)) {
                    $op = [];
                    $only = self::words($s[3]['only'] ?? null, 12);
                    if ($only) {
                        $op['only'] = $only;
                    }
                    if (is_string($s[3]['pre'] ?? null) && preg_match('/^[a-z]{2,12}$/', $s[3]['pre'])) {
                        $op['pre'] = $s[3]['pre'];
                        $op['pt'] = (int) round(self::num($s[3]['pt'] ?? null, 1, 3) ?: 1);
                    }
                    if ($op !== []) {
                        $spot[] = $op;
                    }
                }
                $spots[] = $spot;
            }
            $o['spots'] = $spots;
        } else {
            $o['spots'] = null;
        }
        $o['gates'] = !empty($lv['gates']) && count($paths) > 1;

        $d = is_array($lv['diff'] ?? null) ? $lv['diff'] : [];
        $o['diff'] = [
            'hp' => self::num($d['hp'] ?? null, 0.25, 5) ?? 1,
            'waves' => (int) round(self::num($d['waves'] ?? null, -10, 40) ?? 0),
            'gold' => self::num($d['gold'] ?? null, 0.25, 3) ?? 1,
            'lives' => (int) round(self::num($d['lives'] ?? null, -15, 50) ?? 0),
        ];
        foreach ([['spd', 0.5, 2], ['ws', 0.5, 3], ['gap', 2, 30], ['kg', 0, 3]] as [$key, $lo, $hi]) {
            $value = self::num($d[$key] ?? null, $lo, $hi);
            if ($value !== null) {
                $o['diff'][$key] = $value;
            }
        }
        $o['mini'] = is_string($lv['mini'] ?? null) && preg_match('/^[a-z]{2,12}$/', $lv['mini']) ? $lv['mini'] : false;
        $o['boss'] = is_string($lv['boss'] ?? null) && preg_match('/^[a-z]{2,12}$/', $lv['boss']) ? $lv['boss'] : 'classic';
        $o['obj'] = in_array($lv['obj'] ?? null, self::OBJ, true) ? $lv['obj'] : null;
        $o['focus'] = self::focus($lv['focus'] ?? null);
        // Ausrüstung der Spieler (ab Nova Bastion v1.7.0): fester Held oder frei, Skills Keine/Mittel/Voll
        $o['hero'] = is_string($lv['hero'] ?? null) && preg_match('/^[a-z]{2,12}$/', $lv['hero']) ? $lv['hero'] : null;
        $o['skills'] = in_array($lv['skills'] ?? null, ['none', 'mid', 'full'], true) ? $lv['skills'] : 'mid';
        $o['goal'] = null;
        $o['msg'] = self::clean($lv['msg'] ?? '', 180);
        $o['rules'] = self::words($lv['rules'] ?? null, 6) ?? [];
        $o['towers'] = self::words($lv['towers'] ?? null, 12);
        $o['pool'] = self::words($lv['pool'] ?? null, 30);

        $deco = [];
        foreach (is_array($lv['deco'] ?? null) ? array_slice(array_values($lv['deco']), 0, 150) : [] as $q) {
            $x = self::num(is_array($q) ? ($q[0] ?? null) : null, 0, 480);
            $y = self::num(is_array($q) ? ($q[1] ?? null) : null, 0, 270);
            if ($x !== null && $y !== null && is_string($q[2] ?? null) && preg_match('/^[a-z]{2,12}$/', $q[2])) {
                $deco[] = [(int) round($x), (int) round($y), $q[2]];
            }
        }
        $o['deco'] = $deco;
        $o['decoD'] = self::num($lv['decoD'] ?? null, 0, 3) ?? 1;

        $o['waveOv'] = null;
        if (is_array($lv['waveOv'] ?? null)) {
            $waves = [];
            foreach (array_slice($lv['waveOv'], 0, 60, true) as $key => $groups) {
                $i = (int) round(self::num($key, 0, 59) ?? -1);
                if ($i < 0 || !is_array($groups)) {
                    continue;
                }
                $list = [];
                foreach (array_slice(array_values($groups), 0, 12) as $g) {
                    if (is_array($g) && is_string($g[0] ?? null) && preg_match('/^[a-z]{2,12}$/', $g[0])) {
                        $list[] = [$g[0], (int) round(self::num($g[1] ?? null, 1, 200) ?: 1)];
                    }
                }
                if ($list !== []) {
                    $waves[(string) $i] = $list;
                }
            }
            // Als Objekt speichern ({"3": …}), auch wenn die Schlüssel zufällig 0, 1, 2 … sind.
            $o['waveOv'] = $waves === [] ? null : (object) $waves;
        }
        $o['pathOnly'] = null;
        if (is_array($lv['pathOnly'] ?? null)) {
            $only = [];
            foreach (array_slice($lv['pathOnly'], 0, 3, true) as $key => $list) {
                $i = (int) round(self::num($key, 0, 2) ?? -1);
                $words = self::words($list, 30);
                if ($i >= 0 && $words !== null) {
                    $only[(string) $i] = $words;
                }
            }
            $o['pathOnly'] = $only === [] ? null : (object) $only;
        }
        return $o;
    }

    public static function focus(mixed $value): ?string
    {
        return in_array($value, self::FOCUS, true) ? $value : null;
    }

    public static function clean(mixed $value, int $max): string
    {
        $text = is_scalar($value) ? (string) $value : '';
        $text = preg_replace('/\s+/u', ' ', str_replace(['<', '>', '&', '"', "'", '`', '\\'], '', $text)) ?? '';
        return mb_substr(trim($text), 0, $max);
    }

    /** Zahl zwischen lo und hi; null, wenn es keine Zahl ist. */
    public static function num(mixed $value, float $lo, float $hi): float|int|null
    {
        if (is_bool($value)) {
            $value = (int) $value;
        }
        if (is_string($value) && is_numeric(trim($value))) {
            $value = 0 + trim($value);
        }
        if (!is_int($value) && !is_float($value) || is_nan((float) $value) || is_infinite((float) $value)) {
            return null;
        }
        return max($lo, min($hi, $value));
    }

    /** @return list<list<int>>|null */
    private static function points(mixed $list, int $max): ?array
    {
        if (!is_array($list) || count($list) < 2 || count($list) > $max) {
            return null;
        }
        $out = [];
        foreach ($list as $p) {
            $x = self::num(is_array($p) ? ($p[0] ?? null) : null, 0, 480);
            $y = self::num(is_array($p) ? ($p[1] ?? null) : null, 0, 270);
            if ($x === null || $y === null) {
                return null;
            }
            $out[] = [(int) round($x), (int) round($y)];
        }
        return $out;
    }

    /** @return list<string>|null */
    private static function words(mixed $list, int $max): ?array
    {
        if (!is_array($list)) {
            return null;
        }
        $words = array_values(array_filter(
            array_map(static fn ($s): string => is_scalar($s) && !is_bool($s) ? (string) $s : '', array_values($list)),
            static fn (string $s): bool => preg_match('/^[a-z0-9]{2,16}$/', $s) === 1,
        ));
        return array_slice($words, 0, $max);
    }
}
