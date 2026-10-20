<?php
// Eindeutige Namen, Passwort vergessen/ändern, Angemeldet bleiben, Geräte, Konto löschen (Phase 3.3).

declare(strict_types=1);

use BensGames\Names;
use BensGames\Sessions;

test('reservierte Namen', function (): void {
    foreach (['Ben', 'ben', 'B3n', 'Bens Games', 'bens_games', 'Admin', 'Admin2', 'Moderator Max', 'Support', 'Nova Bastion', 'BonelessAngel'] as $name) {
        check(Names::isReserved($name), "„$name“ müsste reserviert sein");
    }
    foreach (['Benny', 'Spieler', 'Anna', 'Max2', 'Modelbauer', 'Teamplayer'] as $name) {
        check(!Names::isReserved($name), "„$name“ dürfte nicht reserviert sein");
    }
});

dbTest('Namen sind eindeutig – ohne Groß-/Kleinschreibung', function (): void {
    $app = new TestApp();
    $app->registered('anna@example.org', 'ein sicheres Passwort', 'Anna');
    foreach (['Anna', 'ANNA', 'anna'] as $name) {
        $response = $app->post('auth/register', ['email' => "x$name@example.org", 'display_name' => $name, 'password' => 'ein sicheres Passwort']);
        same(422, $response->status, $name);
        same('Dieser Name ist schon vergeben.', $response->body['fields']['display_name']);
    }
    $reserved = $app->post('auth/register', ['email' => 'ben@example.org', 'display_name' => 'Ben', 'password' => 'ein sicheres Passwort']);
    same(422, $reserved->status);
    check(str_contains($reserved->body['fields']['display_name'], 'reserviert'), 'reservierter Name nicht abgelehnt');
    same(1, (int) $app->pdo->query('SELECT COUNT(*) FROM users')->fetchColumn());
});

dbTest('Passwort vergessen: neuer Link, neues Passwort, alle Geräte abgemeldet', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();

    same(202, $app->post('auth/forgot-password', ['email' => 'BEN@example.org'])->status);
    $token = $app->mailer->lastLink('passwort-neu');

    same(422, $app->post('auth/reset-password', ['token' => $token, 'password' => 'kurz'])->status, 'zu kurzes Passwort');
    same(200, $app->post('auth/reset-password', ['token' => $token, 'password' => 'mein neues Passwort'])->status);
    same('Dein Passwort bei Bens Games wurde geändert', $app->mailer->lastSubject());

    same(401, $app->get('account/me', $session['cookies'])->status, 'alte Sitzung');
    same(401, $app->post('auth/login', ['email' => 'ben@example.org', 'password' => 'ein sicheres Passwort'])->status, 'altes Passwort');
    $app->login('ben@example.org', 'mein neues Passwort');
    same(400, $app->post('auth/reset-password', ['token' => $token, 'password' => 'noch ein Passwort'])->status, 'Link zweimal');
});

dbTest('Passwort vergessen verrät nichts und der Link läuft nach einer Stunde ab', function (): void {
    $app = new TestApp();
    $app->registered();
    $before = count($app->mailer->sent);
    same(202, $app->post('auth/forgot-password', ['email' => 'niemand@example.org'])->status);
    same($before, count($app->mailer->sent), 'Mail an unbekannte Adresse');

    $app->post('auth/forgot-password', ['email' => 'ben@example.org']);
    $token = $app->mailer->lastLink('passwort-neu');
    $app->time += 3601;
    same(400, $app->post('auth/reset-password', ['token' => $token, 'password' => 'mein neues Passwort'])->status);
});

dbTest('Passwort ändern: altes Passwort nötig, andere Geräte abgemeldet, dieses bleibt', function (): void {
    $app = new TestApp();
    $app->registered();
    $phone = $app->login(agent: 'Telefon');
    $laptop = $app->login(agent: 'Laptop');

    same(403, $app->postAs($laptop, 'account/password', ['current_password' => 'falsch', 'new_password' => 'mein neues Passwort'])->status);
    same(422, $app->postAs($laptop, 'account/password', ['current_password' => 'ein sicheres Passwort', 'new_password' => 'kurz'])->status);
    same(200, $app->postAs($laptop, 'account/password', ['current_password' => 'ein sicheres Passwort', 'new_password' => 'mein neues Passwort'])->status);

    same(200, $app->get('account/me', $laptop['cookies'])->status, 'eigenes Gerät');
    same(401, $app->get('account/me', $phone['cookies'])->status, 'anderes Gerät');
});

dbTest('Angemeldet bleiben: Cookie mit Ablaufdatum, 30 Tage gültig', function (): void {
    $app = new TestApp();
    $app->registered();
    $short = $app->login();
    same(0, $short['response']->cookies[0]['expires'], 'ohne Häkchen nur Browser-Sitzung');

    $long = $app->login(remember: true);
    same($app->time + Sessions::PERSISTENT_LIFETIME, $long['response']->cookies[0]['expires']);

    $app->time += Sessions::LIFETIME + 60;
    same(401, $app->get('account/me', $short['cookies'])->status, 'kurze Sitzung nach 24 Stunden');
    same(200, $app->get('account/me', $long['cookies'])->status, 'lange Sitzung nach 24 Stunden');
    $app->time += Sessions::PERSISTENT_LIFETIME;
    same(401, $app->get('account/me', $long['cookies'])->status, 'lange Sitzung nach 30 Tagen');
});

dbTest('Geräte: Liste, einzeln und überall abmelden – nur eigene Sitzungen', function (): void {
    $app = new TestApp();
    $app->registered();
    $phone = $app->login(agent: 'Telefon');
    $laptop = $app->login(agent: 'Laptop');
    $other = $app->signedIn('anna@example.org', 'ein sicheres Passwort', 'Anna');

    $list = $app->api->handle(new BensGames\Request('GET', 'account/sessions', [], '', $laptop['cookies'], '203.0.113.7'));
    same(200, $list->status);
    same(2, count($list->body['sessions']));
    $current = array_values(array_filter($list->body['sessions'], fn (array $s): bool => $s['current']));
    same('Laptop', $current[0]['user_agent']);
    same('203.0.113.0', $current[0]['ip_prefix']);
    $phoneId = array_values(array_filter($list->body['sessions'], fn (array $s): bool => !$s['current']))[0]['id'];

    $annaSession = (int) $app->pdo->query("SELECT s.id FROM sessions s JOIN users u ON u.id = s.user_id WHERE u.display_name = 'Anna'")->fetchColumn();
    same(404, $app->postAs($laptop, 'account/sessions/revoke', ['id' => $annaSession])->status, 'fremde Sitzung');
    same(200, $app->get('account/me', $other['cookies'])->status, 'fremde Sitzung bleibt');

    same(200, $app->postAs($laptop, 'account/sessions/revoke', ['id' => $phoneId])->status);
    same(401, $app->get('account/me', $phone['cookies'])->status);

    $tablet = $app->login(agent: 'Tablet');
    $result = $app->postAs($laptop, 'account/sessions/revoke-others');
    same(1, $result->body['count']);
    same(401, $app->get('account/me', $tablet['cookies'])->status);
    same(200, $app->get('account/me', $laptop['cookies'])->status);
});

dbTest('Konto löschen: Passwort und Bestätigung nötig, danach alles weg', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();
    same(403, $app->postAs($session, 'account/delete', ['password' => 'falsch', 'confirm' => true])->status);
    same(422, $app->postAs($session, 'account/delete', ['password' => 'ein sicheres Passwort'])->status, 'ohne Bestätigung');

    $deleted = $app->postAs($session, 'account/delete', ['password' => 'ein sicheres Passwort', 'confirm' => true]);
    same(200, $deleted->status);
    same(-1, $deleted->cookies[0]['expires']);
    same('Dein Konto bei Bens Games wurde gelöscht', $app->mailer->lastSubject());

    foreach (['users', 'sessions', 'email_tokens'] as $table) {
        same(0, (int) $app->pdo->query("SELECT COUNT(*) FROM $table")->fetchColumn(), $table);
    }
    same(401, $app->get('account/me', $session['cookies'])->status);
    // Adresse und Name sind wieder frei.
    $app->registered();
});

dbTest('zu viele falsche Passwörter bei heiklen Aktionen werden gebremst', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();
    for ($i = 0; $i < 10; $i++) {
        same(403, $app->postAs($session, 'account/delete', ['password' => "falsch $i", 'confirm' => true])->status);
    }
    same(429, $app->postAs($session, 'account/delete', ['password' => 'ein sicheres Passwort', 'confirm' => true])->status);
});
