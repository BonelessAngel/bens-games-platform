<?php
// Zwei-Faktor-Anmeldung (Phase 3.4).

declare(strict_types=1);

use BensGames\SecretBox;
use BensGames\Totp;

const RFC_SECRET = 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'; // „12345678901234567890“ aus RFC 6238

test('TOTP stimmt mit den Testwerten aus RFC 6238 überein', function (): void {
    same('12345678901234567890', Totp::base32Decode(RFC_SECRET));
    same(RFC_SECRET, Totp::base32Encode('12345678901234567890'));
    // RFC 6238, Anhang B (SHA1), letzte 6 Ziffern
    foreach ([59 => '287082', 1111111109 => '081804', 1111111111 => '050471', 1234567890 => '005924', 2000000000 => '279037'] as $time => $code) {
        same($code, Totp::code(RFC_SECRET, intdiv($time, 30)), "Zeit $time");
    }
});

test('TOTP akzeptiert nur den aktuellen und je einen Nachbar-Zeitschritt', function (): void {
    $time = 1_800_000_000;
    $step = intdiv($time, 30);
    same($step, Totp::verify(RFC_SECRET, Totp::code(RFC_SECRET, $step), $time));
    same($step - 1, Totp::verify(RFC_SECRET, Totp::code(RFC_SECRET, $step - 1), $time));
    same($step + 1, Totp::verify(RFC_SECRET, Totp::code(RFC_SECRET, $step + 1), $time));
    same(null, Totp::verify(RFC_SECRET, Totp::code(RFC_SECRET, $step - 2), $time));
    same(null, Totp::verify(RFC_SECRET, 'abcdef', $time));
    same($step, Totp::verify(RFC_SECRET, substr_replace(Totp::code(RFC_SECRET, $step), ' ', 3, 0), $time), 'mit Leerzeichen');
});

test('Verschlüsselung der Schlüssel', function (): void {
    $box = new SecretBox(str_repeat('k', 64), 'totp');
    $stored = $box->encrypt(RFC_SECRET);
    check(!str_contains($stored, RFC_SECRET), 'Klartext sichtbar');
    same(RFC_SECRET, $box->decrypt($stored));
    check($box->encrypt(RFC_SECRET) !== $stored, 'gleiche Verschlüsselung zweimal');
    throws(fn () => (new SecretBox(str_repeat('x', 64), 'totp'))->decrypt($stored), '/fehlgeschlagen/');
    $tampered = substr($stored, 0, -2) . (str_ends_with($stored, 'A') ? 'B' : 'A') . substr($stored, -1);
    throws(fn () => $box->decrypt($tampered), '/fehlgeschlagen|Ungültig/');
});

/** Richtet 2FA ein und gibt Schlüssel und Wiederherstellungscodes zurück. */
function enableTwoFactor(TestApp $app, array $session): array
{
    $setup = $app->postAs($session, 'account/2fa/setup', ['password' => 'ein sicheres Passwort']);
    same(200, $setup->status, 'Einrichtung');
    $secret = $setup->body['secret'];
    check(str_starts_with($setup->body['uri'], 'otpauth://totp/Bens%20Games:'), 'otpauth-Adresse');
    $enable = $app->postAs($session, 'account/2fa/enable', ['code' => Totp::code($secret, intdiv($app->time, 30))]);
    same(200, $enable->status, 'Aktivierung');
    return ['secret' => $secret, 'codes' => $enable->body['recovery_codes']];
}

dbTest('Einrichtung: Passwort, Code aus der App, Wiederherstellungscodes', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();
    same(403, $app->postAs($session, 'account/2fa/setup', ['password' => 'falsch'])->status);
    same(409, $app->postAs($session, 'account/2fa/enable', ['code' => '123456'])->status, 'ohne Einrichtung');

    $setup = $app->postAs($session, 'account/2fa/setup', ['password' => 'ein sicheres Passwort']);
    same(403, $app->postAs($session, 'account/2fa/enable', ['code' => '000000'])->status, 'falscher Code');
    $enable = $app->postAs($session, 'account/2fa/enable', ['code' => Totp::code($setup->body['secret'], intdiv($app->time, 30))]);
    same(200, $enable->status);
    same(10, count($enable->body['recovery_codes']));
    check((bool) preg_match('/^[a-z2-7]{5}-[a-z2-7]{5}$/', $enable->body['recovery_codes'][0]), 'Format der Codes');

    $me = $app->get('account/me', $session['cookies']);
    same(true, $me->body['user']['two_factor']);
    same(10, $me->body['user']['recovery_codes_left']);

    $stored = $app->pdo->query('SELECT totp_secret FROM users')->fetchColumn();
    check(!str_contains($stored, $setup->body['secret']), 'Schlüssel im Klartext gespeichert');
    same(0, (int) $app->pdo->query("SELECT COUNT(*) FROM recovery_codes WHERE code_hash LIKE '%-%'")->fetchColumn(), 'Codes im Klartext');
    same(409, $app->postAs($session, 'account/2fa/setup', ['password' => 'ein sicheres Passwort'])->status, 'zweimal einrichten');
});

dbTest('Anmeldung mit Zwei-Faktor: erst Passwort, dann Code – jeder Code nur einmal', function (): void {
    $app = new TestApp();
    $setup = enableTwoFactor($app, $app->signedIn());

    $step1 = $app->post('auth/login', ['email' => 'ben@example.org', 'password' => 'ein sicheres Passwort', 'remember' => true]);
    same(200, $step1->status);
    same('two_factor_required', $step1->body['status']);
    same([], $step1->cookies, 'Sitzung vor dem zweiten Faktor');

    // Der Code aus der Einrichtung ist schon verbraucht.
    $sameStep = Totp::code($setup['secret'], intdiv($app->time, 30));
    same(403, $app->post('auth/login/two-factor', ['challenge' => $step1->body['challenge'], 'code' => $sameStep])->status, 'wiederverwendeter Code');

    $app->time += 30;
    $code = Totp::code($setup['secret'], intdiv($app->time, 30));
    $step2 = $app->post('auth/login/two-factor', ['challenge' => $step1->body['challenge'], 'code' => $code]);
    same(200, $step2->status);
    check($step2->cookies[0]['expires'] > 0, '„Angemeldet bleiben“ geht verloren');
    same(200, $app->get('account/me', [$step2->cookies[0]['name'] => $step2->cookies[0]['value']])->status);

    same(400, $app->post('auth/login/two-factor', ['challenge' => $step1->body['challenge'], 'code' => $code])->status, 'Zwischenschritt zweimal');
    $again = $app->post('auth/login', ['email' => 'ben@example.org', 'password' => 'ein sicheres Passwort']);
    same(403, $app->post('auth/login/two-factor', ['challenge' => $again->body['challenge'], 'code' => $code])->status, 'Code zweimal');
});

dbTest('Wiederherstellungscode gilt genau einmal', function (): void {
    $app = new TestApp();
    $setup = enableTwoFactor($app, $app->signedIn());
    $code = strtoupper(str_replace('-', ' ', $setup['codes'][3])); // Eingabe darf anders aussehen

    $first = $app->post('auth/login', ['email' => 'ben@example.org', 'password' => 'ein sicheres Passwort']);
    same(200, $app->post('auth/login/two-factor', ['challenge' => $first->body['challenge'], 'code' => $code])->status);
    $second = $app->post('auth/login', ['email' => 'ben@example.org', 'password' => 'ein sicheres Passwort']);
    same(403, $app->post('auth/login/two-factor', ['challenge' => $second->body['challenge'], 'code' => $code])->status);
});

dbTest('Zwischenschritt: höchstens 5 Versuche und 5 Minuten', function (): void {
    $app = new TestApp();
    $setup = enableTwoFactor($app, $app->signedIn());
    $step1 = $app->post('auth/login', ['email' => 'ben@example.org', 'password' => 'ein sicheres Passwort']);
    for ($i = 0; $i < 5; $i++) {
        same(403, $app->post('auth/login/two-factor', ['challenge' => $step1->body['challenge'], 'code' => sprintf('%06d', $i)])->status);
    }
    $app->time += 30;
    $valid = Totp::code($setup['secret'], intdiv($app->time, 30));
    same(429, $app->post('auth/login/two-factor', ['challenge' => $step1->body['challenge'], 'code' => $valid])->status, 'sechster Versuch');

    $late = $app->post('auth/login', ['email' => 'ben@example.org', 'password' => 'ein sicheres Passwort']);
    $app->time += 301;
    same(400, $app->post('auth/login/two-factor', ['challenge' => $late->body['challenge'], 'code' => Totp::code($setup['secret'], intdiv($app->time, 30))])->status, 'abgelaufen');
});

dbTest('Einschalten meldet andere Geräte ab; Ausschalten braucht Passwort und Code', function (): void {
    $app = new TestApp();
    $app->registered();
    $phone = $app->login(agent: 'Telefon');
    $laptop = $app->login(agent: 'Laptop');
    $setup = enableTwoFactor($app, $laptop);
    same(401, $app->get('account/me', $phone['cookies'])->status, 'anderes Gerät');
    same(200, $app->get('account/me', $laptop['cookies'])->status);

    $app->time += 30;
    $code = Totp::code($setup['secret'], intdiv($app->time, 30));
    same(403, $app->postAs($laptop, 'account/2fa/disable', ['password' => 'falsch', 'code' => $code])->status);
    same(403, $app->postAs($laptop, 'account/2fa/disable', ['password' => 'ein sicheres Passwort', 'code' => '000000'])->status);
    same(200, $app->postAs($laptop, 'account/2fa/disable', ['password' => 'ein sicheres Passwort', 'code' => $code])->status);

    same(false, $app->get('account/me', $laptop['cookies'])->body['user']['two_factor']);
    same(0, (int) $app->pdo->query('SELECT COUNT(*) FROM recovery_codes')->fetchColumn());
    $login = $app->post('auth/login', ['email' => 'ben@example.org', 'password' => 'ein sicheres Passwort']);
    same('logged_in', $login->body['status'], 'Anmeldung wieder ohne Code');
});

dbTest('Neue Wiederherstellungscodes machen die alten ungültig', function (): void {
    $app = new TestApp();
    $session = $app->signedIn();
    $setup = enableTwoFactor($app, $session);
    $fresh = $app->postAs($session, 'account/2fa/recovery-codes', ['password' => 'ein sicheres Passwort']);
    same(200, $fresh->status);

    $login = $app->post('auth/login', ['email' => 'ben@example.org', 'password' => 'ein sicheres Passwort']);
    same(403, $app->post('auth/login/two-factor', ['challenge' => $login->body['challenge'], 'code' => $setup['codes'][0]])->status, 'alter Code');
    same(200, $app->post('auth/login/two-factor', ['challenge' => $login->body['challenge'], 'code' => $fresh->body['recovery_codes'][0]])->status, 'neuer Code');
});
