# Joc de training · Biasuri cognitive

Aplicație web fără build (HTML + JS simplu), conectată la Supabase.

## Structură
- `index.html` + `learner.js` — pagina cursanților (link/QR primit de la trainer)
- `admin.html` + `admin.js` — panoul trainerului (login, management carduri, control sesiune live)
- `config.js` — cheile Supabase (URL + anon key)
- `style.css` — identitate vizuală comună

## Cum pui aplicația pe GitHub Pages

1. Creează un repository nou pe GitHub (public sau privat, ambele merg cu GitHub Pages dacă ai cont Pro; pentru cont gratuit trebuie public)
2. Încarcă toate fișierele din acest folder în repository (root, nu într-un subfolder)
3. Mergi la **Settings → Pages** din repository
4. La **Source**, alege **Deploy from a branch** → branch `main`, folder `/ (root)` → **Save**
5. După 1-2 minute, aplicația va fi live la:
   `https://<username-ul-tau>.github.io/<numele-repo-ului>/`

## Cum se folosește

1. **Tu (trainer):** intri pe `.../admin.html`, te loghezi cu email + parola contului creat în Supabase Authentication
2. Adaugi carduri (titlu, imagine față, imagine verso, explicație) — o singură dată, rămân în deck pentru toate sesiunile viitoare
3. Apeși **„Generează sesiune nouă”** → primești un link unic + cod QR
4. Trimiți link-ul pe Teams/Zoom sau afișezi codul QR pe ecranul partajat
5. Cursanții intră pe link (fără cont) și văd toate cardurile cu fața inițială
6. Din panoul de control, apeși pe un card → se evidențiază live la toți cursanții
7. Apeși **„Permite răsturnarea”** pe cardul respectiv → cursanții pot da click pentru a-l întoarce (animație, local la fiecare, nu se sincronizează între ei)
8. La final, apeși **„Încheie sesiunea”**

## Notă despre securitate

Cheia `anon` din `config.js` este publică prin design — accesul e controlat de politicile RLS din Supabase (scrierea e permisă doar userilor autentificați, adică ție ca trainer).
