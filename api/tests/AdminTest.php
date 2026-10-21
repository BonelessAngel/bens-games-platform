<?php
// Zentrale, Stufe 1 (Phase 5a): Trennung von Webseite und Zentrale, Zugang, Rechte, Konten, Protokoll.

declare(strict_types=1);

use BensGames\Request;
use BensGames\Totp;

/** Konto mit Zwei-Faktor-Anmeldung anlegen. @return string TOTP-Schlüssel */
function accountWith2fa(TestApp $app, string $email, string $name): string
{
    $session = $app->signedIn($email, 'ein sicheres Passwort', $name);
    return enableTwoFactor($app, $session)['secret'];
}

/** In der Zentrale anmelden (Passwort + Code). @return array{cookies: array<string, string>, csrf: string} */
function adminLogin(TestApp $app, string $email, string $secret): array
{
    $step1 = $app->adminPost('auth/login', ['email' => $email, 'password' => 'ein sicheres Passwort', 'remember' => true]);
    same(200, $step1->status, 'Zentrale: Passwort');
    same('two_factor_required', $step1->body['status']);
    $app->time += 30;
    $step2 = $app->adminPost('auth/login/two-factor', ['challenge' => $step1->body['challenge'], 'code' => Totp::code($secret, intdiv($app->time, 30))]);
    same(200, $step2->status, 'Zentrale: Code');
    same(0, $step2->cookies[0]['expires'], 'Zentrale nie „Angemeldet bleiben“');
    return ['cookies' => [$step2->cookies[0]['name'] => $step2->cookies[0]['value']], 'csrf' => $step2->body['csrf']];
}

dbTest('Webseite und Zentrale haben getrennte Routen', function (): void {
    $app = new TestApp();
    $site = $app->signedIn();
    same(404, $app->api->handle(new Request('GET', 'admin/overview', [], '', $site['cookies']))->status, 'Zentrale auf der Webseite');
    same(404, $app->api->handle(new Request('GET', 'admin/users'))->status);
    same(404, $app->adminPost('auth/register', ['email' => 'x@example.org', 'display_name' => 'Xaver', 'password' => 'ein sicheres Passwort'])->status, 'Registrierung in der Zentrale');
    same(404, $app->adminGet('games/nova-bastion/save')->status);
    same(404, $app->adminPost('admin/migrate')->status, 'Migration nur über die Webseite');
});

dbTest('Zugang zur Zentrale nur mit Rechten und Zwei-Faktor', function (): void {
    $app = new TestApp();
    $app->registered('ohne@example.org', 'ein sicheres Passwort', 'Ohne');
    $denied = $app->adminPost('auth/login', ['email' => 'ohne@example.org', 'password' => 'ein sicheres Passwort']);
    same(403, $denied->status, 'ohne Rechte');
    same('no_panel_access', $denied->body['error']);

    $app->registered('owner@example.org', 'ein sicheres Passwort', 'Inhaber');
    $app->grantRole('owner@example.org', 'owner');
    $response = $app->adminPost('auth/login', ['email' => 'owner@example.org', 'password' => 'ein sicheres Passwort']);
    same(403, $response->status);
    same('two_factor_setup_required', $response->body['error']);
});

dbTest('Sitzungen der Zentrale gelten nicht auf der Webseite und umgekehrt', function (): void {
    $app = new TestApp();
    $secret = accountWith2fa($app, 'owner@example.org', 'Inhaber');
    $app->grantRole('owner@example.org', 'owner');
    $admin = adminLogin($app, 'owner@example.org', $secret);

    same(200, $app->adminGet('admin/me', $admin)->status);
    same(401, $app->api->handle(new Request('GET', 'account/me', [], '', $admin['cookies']))->status, 'Zentrale-Cookie auf der Webseite');

    $app->time += 30;
    $siteLogin = $app->post('auth/login', ['email' => 'owner@example.org', 'password' => 'ein sicheres Passwort']);
    $site = $app->post('auth/login/two-factor', ['challenge' => $siteLogin->body['challenge'], 'code' => Totp::code($secret, intdiv($app->time, 30))]);
    same(200, $site->status);
    same(401, $app->adminGet('admin/me', ['cookies' => [$site->cookies[0]['name'] => $site->cookies[0]['value']]])->status, 'Webseiten-Cookie in der Zentrale');

    $app->time += 8 * 3600 + 1;
    same(401, $app->adminGet('admin/me', $admin)->status, 'Zentrale nach 8 Stunden abgelaufen');
});

dbTest('Übersicht und Kontenliste – E-Mail nur mit users.view_email', function (): void {
    $app = new TestApp();
    $secret = accountWith2fa($app, 'owner@example.org', 'Inhaber');
    $app->grantRole('owner@example.org', 'owner');
    $app->registered('anna@example.org', 'ein sicheres Passwort', 'Anna');
    $admin = adminLogin($app, 'owner@example.org', $secret);

    $overview = $app->adminGet('admin/overview', $admin);
    same(200, $overview->status);
    same(2, $overview->body['users']['total']);
    same(1, $overview->body['users']['two_factor']);

    $users = $app->adminGet('admin/users', $admin, ['q' => 'ann']);
    same(1, $users->body['total']);
    same('anna@example.org', $users->body['users'][0]['email'], 'Besitzer sieht E-Mail');
    check(!isset($users->body['users'][0]['password_hash']), 'Passwort-Hash sichtbar');

    // Moderator: Kontenliste ja, E-Mail nein, Übersicht nein
    $modSecret = accountWith2fa($app, 'mod@example.org', 'Mona');
    $app->grantRole('mod@example.org', 'moderator');
    $mod = adminLogin($app, 'mod@example.org', $modSecret);
    $list = $app->adminGet('admin/users', $mod);
    same(200, $list->status);
    check(!array_key_exists('email', $list->body['users'][0]), 'Moderator sieht E-Mail');
    same(0, $app->adminGet('admin/users', $mod, ['q' => 'anna@example'])->body['total'], 'Suche nach E-Mail ohne Recht');
    same(403, $app->adminGet('admin/overview', $mod)->status);
});

dbTest('Konten sperren und Sitzungen beenden – nie sich selbst oder den Besitzer', function (): void {
    $app = new TestApp();
    $secret = accountWith2fa($app, 'owner@example.org', 'Inhaber');
    $app->grantRole('owner@example.org', 'owner');
    $anna = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');
    $admin = adminLogin($app, 'owner@example.org', $secret);
    $annaId = $app->userId('anna@example.org');

    same(403, $app->adminPost('admin/users/lock', ['id' => $app->userId('owner@example.org'), 'locked' => true], $admin)->status, 'sich selbst');
    same(401, $app->adminPost('admin/users/lock', ['id' => $annaId, 'locked' => true])->status, 'ohne Anmeldung');
    same(403, $app->adminPost('admin/users/lock', ['id' => $annaId, 'locked' => true], ['cookies' => $admin['cookies']])->status, 'ohne CSRF-Token');
    same(200, $app->adminPost('admin/users/lock', ['id' => $annaId, 'locked' => true], $admin)->status);
    same(401, $app->get('account/me', $anna['cookies'])->status, 'gesperrt → abgemeldet');
    same(403, $app->post('auth/login', ['email' => 'anna@example.org', 'password' => 'ein sicheres Passwort'])->status);

    same(200, $app->adminPost('admin/users/lock', ['id' => $annaId, 'locked' => false], $admin)->status);
    $again = $app->login('anna@example.org');
    same(200, $app->adminPost('admin/users/revoke-sessions', ['id' => $annaId], $admin)->status);
    same(401, $app->get('account/me', $again['cookies'])->status);
});

dbTest('Rechte vergeben: nur Besitzer, nie owner/roles.manage, nie an sich selbst', function (): void {
    $app = new TestApp();
    $secret = accountWith2fa($app, 'owner@example.org', 'Inhaber');
    $app->grantRole('owner@example.org', 'owner');
    $modSecret = accountWith2fa($app, 'mod@example.org', 'Mona');
    $admin = adminLogin($app, 'owner@example.org', $secret);
    $modId = $app->userId('mod@example.org');

    same(403, $app->adminPost('auth/login', ['email' => 'mod@example.org', 'password' => 'ein sicheres Passwort'])->status, 'vor der Vergabe');

    same(422, $app->adminPost('admin/rights/set', ['id' => $modId, 'roles' => ['owner'], 'permissions' => []], $admin)->status);
    same(422, $app->adminPost('admin/rights/set', ['id' => $modId, 'roles' => [], 'permissions' => ['roles.manage']], $admin)->status);
    same(422, $app->adminPost('admin/rights/set', ['id' => $modId, 'roles' => [], 'permissions' => ['erfunden']], $admin)->status);
    same(403, $app->adminPost('admin/rights/set', ['id' => $app->userId('owner@example.org'), 'roles' => [], 'permissions' => []], $admin)->status, 'an sich selbst');

    $set = $app->adminPost('admin/rights/set', ['id' => $modId, 'roles' => ['moderator'], 'permissions' => ['app.nova-bastion.beta']], $admin);
    same(200, $set->status);
    same(['app.nova-bastion.beta', 'moderation', 'users.view'], $set->body['effective']);
    same(['moderator'], $app->adminGet('admin/rights', $admin, ['id' => (string) $modId])->body['roles']);

    $mod = adminLogin($app, 'mod@example.org', $modSecret);
    same(403, $app->adminGet('admin/rights', $mod, ['id' => (string) $modId])->status, 'Moderator darf keine Rechte sehen');
    same(403, $app->adminPost('admin/rights/set', ['id' => $modId, 'roles' => ['admin'], 'permissions' => []], $mod)->status, 'Moderator darf sich nichts geben');

    // Rechte entziehen → Sitzung in der Zentrale endet
    same(200, $app->adminPost('admin/rights/set', ['id' => $modId, 'roles' => [], 'permissions' => []], $admin)->status);
    check(in_array($app->adminGet('admin/me', $mod)->status, [401, 403], true), 'Zentrale nach Entzug noch offen');
});

dbTest('Protokoll zeigt Admin-Aktionen, nur mit audit.view', function (): void {
    $app = new TestApp();
    $secret = accountWith2fa($app, 'owner@example.org', 'Inhaber');
    $app->grantRole('owner@example.org', 'owner');
    $app->registered('anna@example.org', 'ein sicheres Passwort', 'Anna');
    $admin = adminLogin($app, 'owner@example.org', $secret);
    $app->adminPost('admin/users/lock', ['id' => $app->userId('anna@example.org'), 'locked' => true], $admin);

    $log = $app->adminGet('admin/audit', $admin, ['action' => 'admin']);
    same(200, $log->status);
    same('admin.user_locked', $log->body['entries'][0]['action']);
    same('Inhaber', $log->body['entries'][0]['actor_name']);
    check(count($app->adminGet('admin/audit', $admin)->body['entries']) > 3, 'ungefiltertes Protokoll');
});
