# MarkText fork: paieška per failus ir plano klausimai

1 iteracija — klausimai

Kiekvienas klausimas savarankiškas. Variantas su (rekomenduojama) yra mano
siūlymas; atsakymas – raidė arba laisvas tekstas eilutėje `Atsakymas:`.

Kontekstas, kurį jau žinau iš kodo: Ctrl+Shift+F dabar atidaro paiešką
šoninėje juostoje, ji ieško tik atidarytame projekto kataloge su ripgrep.
Ripgrep jau moka kelių eilučių regex (`Atsakymas:\n\n`), tik nėra UI tam
įvesti. Būsenos juosta (viršuje, kur žodžių skaičius) jau egzistuoja, ten
galima rodyti A/B. Ctrl+Shift+K šiuo metu užimtas (code fence įterpimas).

---

SVARBU - jei gali padaryti artimiau į phpstorm funkcionalumą ui/ux - būtų cool. jei daug kainuoja - darom kaip paprasčiau. tiesiog pripratęs prie phpstorm ir norisi to feel'ingo

## A. Paieška per failus (Ctrl+Shift+F)

**K1. Kur gyvena nauja paieška – atskiras langas kaip PhpStorm, ar perdaryta šoninė juosta?**

**Trumpai:** Šoninė juosta siaura, joje nėra vietos katalogo laukui, plėtinių
filtrui ir turinio peržiūrai apačioje. PhpStorm „Find in Files“ yra modalinis
langas per visą redaktorių: viršuje paieškos laukas ir nustatymai, viduryje
rezultatų sąrašas, apačioje peržiūra.

a) **naujas modalinis langas (kaip ekrano kopijoje), Ctrl+Shift+F atidaro jį;
 šoninės juostos paieška lieka kaip buvo** (rekomenduojama)
b) perdaryti šoninę juostą: pridėti katalogo lauką ir filtrą, peržiūrą rodyti
 redaktoriuje
c) kita

Atsakymas: a

**K2. Kaip pasirenkamas katalogas?**

**Trumpai:** Reikia numatyto „paskutinį kartą naudotas“ ir galimybės greitai
keisti. Variantai: tekstinis laukas su keliu, „…“ mygtukas (sistemos dialogas)
ir išskleidžiamas paskutinių 10 katalogų sąrašas.

a) **kelio laukas + „…“ mygtukas + paskutinių 10 katalogų istorija; numatytas
 – paskutinis naudotas; jei jo nėra – atidarytas projekto katalogas**
 (rekomenduojama)
b) tik atidarytas projekto katalogas ir jo subkatalogai (kaip dabar), bet su
 nauju langu
c) kita

Atsakymas: a

**K3. Failų plėtinių filtras: koks formatas ir numatyta reikšmė?**

**Trumpai:** PhpStorm „File mask“ priima `*.md`, `*.md, *.txt`, `!*.min.js`.
Ripgrep tai palaiko tiesiogiai (`--iglob`). Klausimas, kas rodoma pirmą
kartą ir ar prisimenama.

a) **laukas kaip PhpStorm (kableliais atskirti šablonai), prisimenama
 paskutinė reikšmė, pirmą kartą `*.md`; tuščias laukas – visi failai**
 (rekomenduojama)
b) pirmą kartą tuščias (visi failai)
c) kita

Atsakymas: a

**K4. Kaip įvedamas kelių eilučių tekstas (pvz. `Atsakymas:` ir po jo tuščia eilutė)?**

**Trumpai:** Ripgrep ieško per eilutes tik regex režimu, kai šablone yra
`\n`. Reikia UI: arba vartotojas pats rašo `\n` (`Atsakymas:\n\n`), arba
paieškos laukas yra kelių eilučių (Shift+Enter įterpia naują eilutę) ir
programa pati paverčia tai į regex.

a) **abu: laukas kelių eilučių (Shift+Enter – nauja eilutė) ir regex režime
 `\n` reiškia eilutės lūžį; `\r\n` failuose suvienodinamas automatiškai**
 (rekomenduojama)
b) tik `\n` regex režime (paprasčiau, bet reikia žinoti regex)
c) kita

Atsakymas: a

**K5. Ką rodo peržiūra apačioje?**

**Trumpai:** Pasirinkus rezultatą, apačioje matomas failo turinys su
paryškinta eilute. Klausimas – visas failas ar tik kontekstas, ir ar tai
šaltinio tekstas ar atvaizduotas markdown.

a) **visas failas kaip paprastas tekstas (šaltinis), peržiūra automatiškai
 nuslenka prie atitikmens ir jį paryškina; Enter / dvigubas paspaudimas
 atidaro failą kortelėje toje eilutėje** (rekomenduojama)
b) tik ±10 eilučių kontekstas
c) atvaizduotas markdown (gražiau, bet lėčiau ir sunkiau rasti vietą)

Atsakymas: a

**K6. Ar paieška gerbia `.gitignore` ir slepia paslėptus failus?**

**Trumpai:** Ripgrep pagal nutylėjimą praleidžia `.gitignore` failus ir
`.`-katalogus (pvz. `node_modules`, `.git`). Ieškant per visą diską tai
labai pagreitina, bet kartais reikia ir ignoruojamų failų.

a) **pagal nutylėjimą gerbti `.gitignore` ir slėpti paslėptus; langelis
 „Įtraukti ignoruojamus ir paslėptus“** (rekomenduojama)
b) visada ieškoti visur
c) kita

Atsakymas: b

**K7. Rezultatų riba ir atšaukimas?**

**Trumpai:** Per visą diską paieška gali rasti šimtus tūkstančių eilučių ir
užstrigdyti langą. Reikia ribos ir „Stop“ mygtuko.

a) **riba 5 000 atitikmenų (pasiekus – pranešimas „sustojo ties riba,
 patikslinkite“), „Stop“ mygtukas, rezultatai rodomi srautu dar ieškant**
 (rekomenduojama)
b) be ribos
c) kita riba: ____

Atsakymas: c 100

---

## B. Plano klausimai ir atsakymų skaitiklis A/B

**K8. Ar teisingai suprantu šabloną?**

**Trumpai:** Pagal jūsų pavyzdį: klausimas = eilutė `**K<nr>. tekstas**`;
variantai = eilutės `a)`, `b)` … (gali tęstis kelias eilutes, įtraukos
tęsiniai); atsakymo vieta = pirma eilutė `Atsakymas:` po klausimo.
Klausimas **atsakytas**, jei po `Atsakymas:` toje pačioje eilutėje yra
tekstas, arba žemiau (iki kito `**K` ar `---`) yra netuščių eilučių.

a) **taip, būtent toks šablonas** (rekomenduojama)
b) ne – atsakymas skaitomas tik iš tos pačios eilutės `Atsakymas: …`
c) kitaip: ____

Atsakymas: a tik nebūtinai K raidė priekyje. gali būti ir kitos raidės kaip N1 ir pan. Galima būtų sukurti šabloną kur simboliai "-*-"" galėtų apskliausti kiekvieną klausimą. galėsiu patobulinti 

**K9. Kur rodyti A/B?**

**Trumpai:** Būsenos juosta viršuje (prie failo pavadinimo ir žodžių
skaičiaus) – paprasta, tik atidarytam failui. Kortelės pavadinimas – matosi
visiems atidarytiems. Šoninis failų medis – reikėtų skaityti visus `.md`
diske ir stebėti pakeitimus; brangiau ir lėčiau.

a) **būsenos juostoje ir kortelėje (raudona, kol A<B; žalia, kai A=B);
 failų medyje – vėlesnė iteracija** (rekomenduojama)
b) tik būsenos juostoje
c) iš karto ir failų medyje

Atsakymas: a

**K10. Kurie failai laikomi planais?**

a) **bet kuris atidarytas `.md`, kuriame rastas bent vienas `**K<nr>.`
 klausimas; be klausimų – nieko nerodoma** (rekomenduojama)
b) tik failai, kurių pavadinime yra `plan`
c) kita

Atsakymas: a

**K11. Ctrl+Shift+K užimtas (code fence). Ką daryti?**

a) **wizard'ui atiduoti Ctrl+Shift+K, code fence perkelti į Ctrl+Alt+K**
 (rekomenduojama – kaip prašėte)
b) wizard'ui duoti laisvą Ctrl+Shift+A, code fence palikti
c) kita kombinacija: ____

Atsakymas: a

**K12. Kaip wizard'as įrašo atsakymą į failą?**

**Trumpai:** Wizard'as rodo po vieną klausimą su variantais (radio) ir
teksto lauku. Reikia nuspręsti, kas atsiduria po `Atsakymas:`.

a) **raidė, o jei įrašytas komentaras – `a — komentaras`; be varianto –
 tik tekstas** (rekomenduojama)
b) raidė ir visas varianto tekstas (`a) išjungti abu…`)
c) kita

Atsakymas: a

**K13. Kada atsakymas patenka į failą?**

a) **iš karto paspaudus „Toliau“ – į atidarytą dokumentą (kaip įprastas
 redagavimas); išsaugoma Ctrl+S arba auto-save** (rekomenduojama)
b) tik paspaudus „Baigti“ wizard'o gale
c) kita

Atsakymas: a

**K14. Nuo kurio klausimo pradeda wizard'as?**

a) **nuo pirmo neatsakyto; mygtukai „Atgal / Toliau / Praleisti“; galima
 peršokti į bet kurį iš sąrašo** (rekomenduojama)
b) visada nuo K1

Atsakymas: a

---

## C. Eiliškumas

**K15. Kokia tvarka daryti?**

**Trumpai:** Skaitiklis A/B ir wizard'as yra mažesnis darbas (tik
renderer'is, be naujų sisteminių dalių) ir jūsų kasdienis poreikis. Paieška
per failus – didesnis (naujas langas, IPC, peržiūra). Git – trečias.

a) **1) A/B skaitiklis + wizard'as, 2) paieška per failus, 3) git žymės ir
 blame** (rekomenduojama)
b) 1) paieška, 2) skaitiklis + wizard'as, 3) git
c) kita

Atsakymas: a

---
