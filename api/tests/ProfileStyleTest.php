<?php
// Spielerprofile gestalten: Rang, Titel, Banner, angepinnte Abzeichen, Seltenheit, Aktivitäts-Kalender.

declare(strict_types=1);

use BensGames\Profiles;

test('Spieler-Rang steigt mit Punkten und kennt den nächsten Rang', function (): void {
    same('Rekrut', Profiles::rank(0)['name']);
    same('Kadett', Profiles::rank(60)['name']);
    $leutnant = Profiles::rank(225);
    same('Leutnant', $leutnant['name']);
    same('Hauptmann', $leutnant['next']);
    same(0.5, $leutnant['progress']);
    $legende = Profiles::rank(5000);
    same('Legende', $legende['name']);
    same(null, $legende['next']);
    same(1.0, $legende['progress']);
});

dbTest('Profil gestalten: nur Freigeschaltetes, nur eigene Abzeichen, öffentlich sichtbar', function (): void {
    $app = new TestApp();
    $lea = $app->signedIn('lea@example.org', 'ein sicheres Passwort', 'Lea');
    $app->postAs($lea, 'games/nova-bastion/scores', ['board' => '1', 'score' => 9000]);
    same(200, $app->postAs($lea, 'games/nova-bastion/save/put', [
        'data' => json_encode(['camp' => ['stars' => array_fill(0, 10, 3), 'crystals' => 0, 'xp' => 0]]),
        't' => 1,
        'achievements' => ['a1', 'a2', 'a3', 'a4', 'a5'],
    ])->status);

    $options = $app->get('account/profile-style', $lea['cookies']);
    same(200, $options->status);
    $titles = array_column($options->body['titles'], 'unlocked', 'id');
    $banners = array_column($options->body['banners'], 'unlocked', 'id');
    same(true, $titles['champion'], 'Platz 1 schaltet „Champion“ frei');
    same(false, $titles['sammler'], 'erst ab 10 Erfolgen');
    same(true, $banners['gold']);
    same(true, $banners['aurora'], '5 Erfolge');
    same(true, $banners['sternenstaub'], '30 Sterne in Nova');
    same(false, $banners['lava']);
    same(5, count($options->body['achievements']));

    same(422, $app->postAs($lea, 'account/profile-style/save', ['banner' => 'lava'])->status, 'gesperrtes Banner');
    same(422, $app->postAs($lea, 'account/profile-style/save', ['title' => 'legende'])->status, 'gesperrter Titel');
    same(422, $app->postAs($lea, 'account/profile-style/save', ['pins' => ['nova-bastion:fremd']])->status, 'fremdes Abzeichen');
    same(422, $app->postAs($lea, 'account/profile-style/save', ['pins' => ['nova-bastion:a1', 'nova-bastion:a2', 'nova-bastion:a3', 'nova-bastion:a4']])->status, 'mehr als 3');
    same(200, $app->postAs($lea, 'account/profile-style/save', ['banner' => 'gold', 'title' => 'champion', 'pins' => ['nova-bastion:a2'], 'activity' => true])->status);

    $profile = siteGet($app, 'players/profile', ['name' => 'Lea'])->body['profile'];
    same('gold', $profile['banner']);
    same('Champion', $profile['title']['name']);
    same(['nova-bastion:a2'], $profile['pins']);
    same(1.0, $profile['rarity']['nova-bastion:a2'], 'einzige Spielerin mit dem Erfolg');
    same('Kadett', $profile['rank']['name'], '5 Erfolge (50) + Platz 1 (60) + 30 Sterne = 140 Punkte');
    same(30, $profile['stats']['nova_stars']);
    check(is_array($profile['activity']), 'Kalender mit Zustimmung sichtbar');
    same(0, $profile['activity']['active_days']);

    // Widerspruch gegen die Statistik blendet den Kalender aus – auch wenn er eingeschaltet ist.
    same(200, $app->postAs($lea, 'account/stats/settings', ['opt_out' => true])->status);
    same(null, siteGet($app, 'players/profile', ['name' => 'Lea'])->body['profile']['activity']);
});

dbTest('Ohne eigene Wahl: Standard-Banner, kein Titel, kein Kalender', function (): void {
    $app = new TestApp();
    $app->signedIn('max@example.org', 'ein sicheres Passwort', 'Max');
    $session = $app->login('max@example.org');
    $app->postAs($session, 'games/nova-bastion/scores', ['board' => '2', 'score' => 10]);
    $profile = siteGet($app, 'players/profile', ['name' => 'Max'])->body['profile'];
    same('nacht', $profile['banner']);
    same(null, $profile['title']);
    same(null, $profile['activity']);
    same([], $profile['levels']);
});

dbTest('Besondere Royal-Blocks-Erfolge schalten Casino-Banner und Titel frei', function (): void {
    $app = new TestApp();
    $mia = $app->signedIn('mia@example.org', 'ein sicheres Passwort', 'Mia');
    $app->postAs($mia, 'games/royal-blocks/scores', ['board' => 'standard', 'score' => 1200]);
    same(200, $app->postAs($mia, 'games/royal-blocks/save/put', [
        'data' => json_encode(['version' => 1, 't' => 1, 'values' => ['chips' => '10']]),
        't' => 1,
        'achievements' => ['shop_legendary', 'slot_jackpot', 'royal_flush'],
    ])->status);
    $options = $app->get('account/profile-style', $mia['cookies']);
    $titles = array_column($options->body['titles'], 'unlocked', 'id');
    $banners = array_column($options->body['banners'], 'unlocked', 'id');
    same(true, $banners['casino'], 'Legendärer Fund → Casino Royale');
    same(true, $titles['glueckspilz'], 'Hauptgewinn am Automaten');
    same(false, $titles['highroller']);
    same(false, $titles['albummeister']);
    same(200, $app->postAs($mia, 'account/profile-style/save', ['banner' => 'casino', 'title' => 'glueckspilz'])->status);
    $profile = siteGet($app, 'players/profile', ['name' => 'Mia'])->body['profile'];
    same('casino', $profile['banner']);
    same('Glückspilz', $profile['title']['name']);
    same(422, $app->postAs($mia, 'account/profile-style/save', ['title' => 'highroller'])->status, 'noch gesperrt');
});
