<?php
// Registrierung, Bestätigung, Anmeldung, Abmeldung und Schutzmechanismen (Phase 3.2).

declare(strict_types=1);

use BensGames\Sessions;

dbTest('Registrierung: Bestätigungs-Mail mit Link, Konto ohne Rechte', function (): void {
    $app = new TestApp();
    $response = $app->post('auth/register', ['email' => 'Ben@Example.org', 'display_name' => 'Spieler', 'password' => 'ein sicheres Passwort']);
    same(202, $response->status);
    same(['status' => 'check_email'], $response->body);
    same(1, count($app->mailer->sent));
    same('Ben@Example.org', $app->mailer->sent[0]['to']);
    check(str_contains($app->mailer->sent[0]['text'], TEST_ORIGIN . '/konto/bestaetigen/#'), 'Link zeigt nicht auf die eigene Adresse');

    $user = $app->pdo->query('SELECT * FROM users')->fetch();
    same('ben@example.org', $user['email_normalized']);
    same('active', $user['status']);
    same(null, $user['email_verified_at']);
    check(password_verify('ein sicheres Passwort', $user['password_hash']), 'Passwort-Hash passt nicht');
    check(!str_contains($user['password_hash'], 'ein sicheres Passwort'), 'Passwort im Klartext gespeichert');
    same(0, (int) $app->pdo->query("SELECT COUNT(*) FROM email_tokens WHERE token_hash = '" . $app->mailer->lastLink() . "'")->fetchColumn(), 'Link im Klartext gespeichert');
});

dbTest('Registrierung prüft die Eingaben', function (): void {
    $app = new TestApp();
    $response = $app->post('auth/register', ['email' => 'keine-mail', 'display_name' => 'x', 'password' => 'kurz']);
    same(422, $response->status);
    same(['email', 'display_name', 'password'], array_keys($response->body['fields']));
    same(0, count($app->mailer->sent));
});

dbTest('doppelte Registrierung verrät nichts und legt kein zweites Konto an', function (): void {
    $app = new TestApp();
    $app->signedIn('ben@example.org');
    $again = $app->post('auth/register', ['email' => 'BEN@example.org', 'display_name' => 'Fremd', 'password' => 'anderes Passwort!']);
    same(202, $again->status);
    same(['status' => 'check_email'], $again->body);
    same(1, (int) $app->pdo->query('SELECT COUNT(*) FROM users')->fetchColumn());
    check(str_contains(end($app->mailer->sent)['subject'], 'bereits ein Konto'), 'Hinweis-Mail fehlt');
});

dbTest('Anmeldung erst nach Bestätigung der E-Mail', function (): void {
    $app = new TestApp();
    $app->post('auth/register', ['email' => 'ben@example.org', 'display_name' => 'Spieler', 'password' => 'ein sicheres Passwort']);
    $login = $app->post('auth/login', ['email' => 'ben@example.org', 'password' => 'ein sicheres Passwort']);
    same(403, $login->status);
    same('email_not_verified', $login->body['error']);

    same(200, $app->post('auth/verify', ['token' => $app->mailer->lastLink()])->status);
    same(200, $app->post('auth/login', ['email' => 'ben@example.org', 'password' => 'ein sicheres Passwort'])->status);
});

dbTest('Bestätigungslink gilt nur einmal und nur 24 Stunden', function (): void {
    $app = new TestApp();
    $app->post('auth/register', ['email' => 'ben@example.org', 'display_name' => 'Spieler', 'password' => 'ein sicheres Passwort']);
    $token = $app->mailer->lastLink();
    same(200, $app->post('auth/verify', ['token' => $token])->status);
    same(400, $app->post('auth/verify', ['token' => $token])->status, 'zweite Verwendung');
    same(400, $app->post('auth/verify', ['token' => str_repeat('0', 64)])->status, 'erfundener Link');

    $app->post('auth/register', ['email' => 'anna@example.org', 'display_name' => 'Anna', 'password' => 'ein sicheres Passwort']);
    $expired = $app->mailer->lastLink();
    $app->time += 86400 + 1;
    same(400, $app->post('auth/verify', ['token' => $expired])->status, 'abgelaufener Link');
});

dbTest('Anmeldung setzt ein sicheres Sitzungs-Cookie', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();
    same([Sessions::COOKIE], array_keys($session['cookies']));
    check(str_starts_with(Sessions::COOKIE, '__Host-'), 'Cookie ohne __Host-Präfix');
    $stored = $app->pdo->query('SELECT token_hash, ip_prefix FROM sessions')->fetch();
    check($stored['token_hash'] !== $session['cookies'][Sessions::COOKIE], 'Sitzung im Klartext gespeichert');
    same('203.0.113.0', $stored['ip_prefix']);

    $me = $app->get('account/me', $session['cookies']);
    same(200, $me->status);
    same('Spieler', $me->body['user']['display_name']);
    same(true, $me->body['user']['email_verified']);
    same($session['csrf'], $me->body['csrf']);
});

dbTest('falsches Passwort und unbekannte Adresse sehen gleich aus', function (): void {
    $app = new TestApp();
    $app->signedIn();
    $wrong = $app->post('auth/login', ['email' => 'ben@example.org', 'password' => 'falsches Passwort']);
    $unknown = $app->post('auth/login', ['email' => 'niemand@example.org', 'password' => 'falsches Passwort']);
    same(401, $wrong->status);
    same($wrong->body, $unknown->body);
    same(2, (int) $app->pdo->query("SELECT COUNT(*) FROM audit_log WHERE action = 'user.login_failed'")->fetchColumn());
});

dbTest('zu viele Fehlversuche werden gebremst und später wieder erlaubt', function (): void {
    $app = new TestApp();
    $app->signedIn();
    for ($i = 0; $i < 10; $i++) {
        same(401, $app->post('auth/login', ['email' => 'ben@example.org', 'password' => 'falsch ' . $i])->status);
    }
    $blocked = $app->post('auth/login', ['email' => 'ben@example.org', 'password' => 'ein sicheres Passwort']);
    same(429, $blocked->status, 'elfter Versuch');
    same('too_many_attempts', $blocked->body['error']);

    $app->time += 901;
    same(200, $app->post('auth/login', ['email' => 'ben@example.org', 'password' => 'ein sicheres Passwort'])->status, 'nach 15 Minuten');
});

dbTest('Abmelden braucht das CSRF-Token und beendet die Sitzung', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();
    same(403, $app->post('auth/logout', null, [], $session['cookies'])->status, 'ohne Token');
    same(403, $app->post('auth/logout', null, ['x-csrf-token' => str_repeat('f', 64)], $session['cookies'])->status, 'falsches Token');

    $logout = $app->postAs($session, 'auth/logout');
    same(200, $logout->status);
    same(-1, $logout->cookies[0]['expires'], 'Cookie wird gelöscht');
    same(401, $app->get('account/me', $session['cookies'])->status, 'Sitzung nach Abmeldung');
});

dbTest('Anfragen von fremden Seiten werden abgelehnt', function (): void {
    $app = new TestApp();
    $credentials = ['email' => 'ben@example.org', 'display_name' => 'Spieler', 'password' => 'ein sicheres Passwort'];
    same(403, $app->post('auth/register', $credentials, ['origin' => 'https://boese.example'])->status);
    same(403, $app->post('auth/register', $credentials, ['origin' => ''])->status);
    same(415, $app->post('auth/register', $credentials, ['content-type' => 'text/plain'])->status);
    same(0, (int) $app->pdo->query('SELECT COUNT(*) FROM users')->fetchColumn());
});

dbTest('Sitzungen laufen nach 24 Stunden ab', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();
    $app->time += Sessions::LIFETIME + 1;
    same(401, $app->get('account/me', $session['cookies'])->status);
});

dbTest('gesperrte Konten können sich nicht anmelden', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();
    $app->pdo->exec("UPDATE users SET status = 'locked'");
    same(401, $app->get('account/me', $session['cookies'])->status, 'bestehende Sitzung');
    same(403, $app->post('auth/login', ['email' => 'ben@example.org', 'password' => 'ein sicheres Passwort'])->status);
});

dbTest('Bestätigungslink erneut anfordern', function (): void {
    $app = new TestApp();
    $app->post('auth/register', ['email' => 'ben@example.org', 'display_name' => 'Spieler', 'password' => 'ein sicheres Passwort']);
    same(202, $app->post('auth/resend-verification', ['email' => 'ben@example.org'])->status);
    same(2, count($app->mailer->sent));
    same(202, $app->post('auth/resend-verification', ['email' => 'niemand@example.org'])->status, 'unbekannte Adresse');
    same(2, count($app->mailer->sent));
    same(200, $app->post('auth/verify', ['token' => $app->mailer->lastLink()])->status, 'neuer Link funktioniert');
});
