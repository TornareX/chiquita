# Tactique du padel en 2 contre 2 — référence pour les IA de Padel Smash

Étude documentaire (octobre 2026) : blogs de coaching, écoles de padel, études publiées sur des
matchs WPT / Premier Padel. Complète `research/padel-pro/NOTES.md` (comment se gagnent les points,
chiffres de rythme) : ici, **où se placer, comment bouger à deux, quel coup jouer et où**.

Le document est écrit pour être traduit en règles de bot : chaque principe est suivi, quand c'est
possible, d'une valeur en mètres dans le repère du jeu et d'un pseudo-code.

Légende : **[consensus]** = dit par plusieurs sources indépendantes ; **[source]** = une seule source
(nommée) ; **[mesuré]** = chiffre d'une étude ; **[estimation]** = valeur proposée ici pour le jeu,
à régler en jouant.

---

## 0. Résumé en 13 règles

0. **Un joueur de droite, un joueur de gauche.** Chacun garde son côté tout le set (et en pratique
   tout le match) et est responsable de sa moitié : son couloir le long de sa vitre et ses lobs.
   Seul le centre se partage (§3.0) [consensus].
1. **Le filet gagne.** ~80 % des points sont gagnés par l'équipe au filet [mesuré]. Tout le jeu
   consiste à prendre le filet, le garder, ou en déloger l'adversaire.
2. **Les deux sur la même bande.** Les deux au filet ou les deux au fond, jamais un devant et un
   derrière : la diagonale entre eux est un boulevard [consensus].
3. **La corde.** Les partenaires sont reliés par une corde de ~3 à 3,7 m : quand l'un bouge (côté,
   avant, arrière), l'autre bouge du même côté et de la même distance [consensus].
4. **On bascule vers la balle.** L'équipe glisse latéralement vers le côté où l'adversaire frappe.
   Le joueur en face du frappeur couvre la ligne (le parallèle), le joueur en diagonale couvre
   le milieu. Le croisé large du côté opposé est le trou qu'on accepte [consensus].
5. **Le milieu d'abord.** On ferme le centre ; on oblige l'adversaire à réussir le coup le plus
   risqué, le long de la ligne [consensus].
6. **Pas de no man's land.** Entre la ligne de service et la position de filet, on ne fait que
   passer ; on n'y attend jamais la frappe adverse [consensus].
7. **Du fond, on ne gagne pas le point.** Au fond, on remet haut et profond (lob), bas et lent
   (chiquita) ou on attend la balle facile ; attaquer depuis le fond est la faute tactique n°1
   [consensus].
8. **Le lob est l'arme pour reprendre le filet** (~60 % des montées au filet) [mesuré]. Il doit être
   profond : un lob court donne un smash [consensus].
9. **La bandeja sert à garder le filet, pas à gagner.** Sur un lob que l'on ne peut pas smasher,
   bandeja / víbora vers le coin, puis on remonte [consensus].
10. **Smash seulement sur une balle haute, lente, courte, prise en équilibre** ; sinon, bandeja
    [consensus].
11. **Au filet, viser le milieu et les pieds** : le milieu crée l'hésitation entre les deux
    adversaires et revient au milieu ; les pieds obligent à remonter la balle [consensus].
12. **On monte derrière un bon coup, ensemble, par étapes** (coup d'approche, 2–3 pas, pas
    d'arrêt — *split step* — au moment de la frappe adverse) [consensus].

---

## 1. Repère et vocabulaire pour le code

Repère du jeu (`src/sim/constants.ts`) : origine au centre du filet, `z` dans la longueur,
`x` en largeur, terrain 20 × 10 m. Pour la tactique, on raisonne **dans le repère de l'équipe** :

| Grandeur | Définition | Bornes |
|---|---|---|
| `d` (profondeur) | distance au filet, de son côté : `d = z * side` | 0 (filet) → 10 (vitre du fond) |
| `x` (latéral) | position en largeur, **vue du joueur qui regarde le filet** : + = à droite | −5 → +5 |
| ligne de service | `d = 6,95` | |
| côté **drive** | moitié droite (x > 0) vue du joueur | |
| côté **revés** | moitié gauche (x < 0) | |

Repères du terrain réel, utiles pour les coups :

- **Vitre latérale** : deux panneaux de 2 m depuis le fond, donc de `d = 8` à `d = 10` ; au-delà
  (`d < 8`), grillage (rebond imprévisible, mort).
- **Le « T »** : intersection ligne de service / ligne centrale, `d = 6,95, x = 0`.
- **Coin** : jonction vitre du fond / vitre latérale (`d ≈ 10, |x| ≈ 5`) ; la balle y fait deux
  vitres (« doble pared ») et devient difficile.
- **Zones de l'équipe** (d'après Babolat et Bounce) :

| Zone | `d` | Ce qu'on y fait |
|---|---|---|
| **Filet (verte)** | 0 → 3 | volée, bandeja, víbora, smash : on conclut |
| **Transition (orange)** | 3 → 7,5 | on traverse ; on joue ce qui vient selon la hauteur |
| **Défense (rouge)** | 7,5 → 10 | lob, remise en jeu, jeu après la vitre |

Couleur de balle (`src/sim/pressure.ts`) : **verte** = confortable, **jaune** = transition,
**rouge** = balle basse/rapide/sans temps. Ce vocabulaire recoupe exactement celui des coachs
(balle « offensive / neutre / défensive ») ; tout le tableau de choix du §5 l'utilise.

Types de coups du jeu : `normal`, `slice` (coupé : chiquita, volée basse), `lob`, `overhead`
(`bandeja`, `vibora`, `remate`, `bajada`).

---

## 2. Positions de base

### 2.1 Au filet (attaque)

| Paramètre | Valeur | Source |
|---|---|---|
| Profondeur standard | **`d ≈ 2–2,5 m`** | padeladdict (~2 m), Padel Browser (2–2,5 m), courtsfinder (2,5–3 m) [consensus] |
| Plus près pour conclure | `d ≈ 1,5 m` quand l'adversaire est à la vitre, déséquilibré, ou joue une balle basse | Padel Browser [consensus] |
| Plus loin, pour le lob | **un demi-pas en arrière** (`d ≈ 3 m`) dès que l'adversaire se place sous une balle haute / confortable (il peut lober) | Padel Browser, padeladdict [consensus] |
| Trop près | `d < 1,5` en permanence : tout lob normal passe | [consensus] |
| Écart entre partenaires | **3–3,7 m** | Padel Browser, courtsfinder |

> Note jeu : `NET_DEPTH = 3,5` dans `duel.ts` est la limite haute réelle (déjà « un demi-pas en
> arrière »). Pour un 2v2, viser **2,5 m de base**, 3–3,5 m contre une balle verte adverse, 1,5–2 m
> pour conclure. [estimation]

**Escalonné (ataque escalonado)** — les deux ne sont pas à la même hauteur [padeladdict, Padel
Browser, courtsfinder] :

- Le joueur **du côté de la balle** (en face du frappeur) est plus près du filet et couvre la ligne.
- Le joueur **en diagonale** est un demi-pas à un pas **plus en arrière et vers le centre** : il
  couvre le milieu et lit le lob.
- Si la balle adverse est dangereuse (rapide, basse, croisée), le joueur en diagonale peut avancer ;
  si elle est confortable (lob possible), il reste un pas derrière.
- Le joueur de devant **ne se contente pas de son parallèle** : il cède un peu de ligne et aide au
  centre, parce que la balle le long de la ligne est la plus risquée pour l'adversaire.
- Escalonné **seulement** quand la balle est dans un des deux coins adverses ; balle au centre →
  les deux **en ligne**, chacun au milieu de sa moitié.

### 2.2 Au fond (défense)

| Paramètre | Valeur | Source |
|---|---|---|
| Profondeur | **`d ≈ 8–8,5 m`** : un pas derrière la ligne de service, **1–1,5 m devant la vitre** | Padel Browser, simplepadel [consensus] |
| Pourquoi pas collé à la vitre | il faut de la place derrière soi pour laisser la balle rebondir et la jouer après la vitre | [consensus] |
| Pourquoi pas plus devant | le lob adverse passe au-dessus, la balle arrive dans les pieds | [consensus] |
| Latéral | « deux pas du mur latéral », ~1,5 m de la vitre : `|x| ≈ 2,5–3,5` | simplepadel, actu-padel |
| Contre un smash | **les deux reculent et s'écartent vers les coins**, sans s'agglutiner au centre ; bas sur les jambes pour lire le rebond | simplepadel, courtsfinder |
| Contre une bandeja | rester plus haut (`d ≈ 7,5`) pour prendre la balle tôt, devant soi, et la remettre aux pieds | Padel Tonic |

> Note jeu : `HOME_DEPTH = 8,5` correspond. [estimation] : défense de base `d = 8,2`, `|x| = 2,5` ;
> contre un smash `d = 9`, `|x| = 3,2`.

### 2.3 Transition

- On ne s'y arrête pas : on traverse pendant le vol de la balle, et on fait un **pas d'arrêt**
  (split step) au moment où l'adversaire frappe, pour pouvoir partir dans tous les sens.
- Si on s'y fait prendre (balle adverse arrivée trop tôt) : se baisser, défendre les pieds (volée
  basse, bloc), puis finir le mouvement au coup suivant (monter ou reculer) [courtsfinder].

---

## 3. Bouger à deux

### 3.0 Chacun son côté, chacun sa moitié (le socle de tout le reste)

En padel, une paire **n'est pas** deux joueurs qui se partagent le terrain au fil de l'échange :
c'est un **joueur de droite** (drive) et un **joueur de gauche** (revés), chacun **propriétaire de
sa moitié** dans le sens de la longueur [Red Bull, Padel Browser, padeladdict]. Tout ce qui suit
(corde, escalonné, milieu, lobs) se fait **à partir de ce découpage**, pas à sa place.

**Côtés fixes.**

- Chaque joueur a un côté et **le garde** : au fond comme au filet, en attaque comme en défense,
  le joueur de gauche revient toujours dans la moitié gauche, celui de droite dans la droite.
- Règle FIP : au retour de service, l'ordre de réception est choisi au premier jeu du set et ne
  change plus du set — chacun reçoit **toujours du même côté** pendant tout le set [Bounce, The
  Padel School, padel1969]. En pratique les pros gardent leur côté tout le match, et souvent toute
  leur carrière (Tapia à gauche, Sanyo à droite) [Padel Browser].
- Au service, le serveur sert alternativement de la moitié droite et de la moitié gauche ; quand
  il sert de la moitié qui n'est pas la sienne, la paire **se recroise pour revenir sur ses
  côtés** dès que l'échange le permet [estimation — pratique courante, pas trouvée écrite dans une
  source].
- Après un croisement forcé (§3.5), même règle : on se **re-croise au premier temps mort** (balle
  longue chez l'adversaire, lob qui vole) [estimation].

**Ce que « s'occuper de sa moitié » veut dire.** La moitié n'est pas un mur, c'est une
responsabilité, découpée en trois bandes (vue d'un joueur, pour deux droitiers) :

| Bande | Largeur [estimation] | À qui |
|---|---|---|
| **Couloir extérieur** de ma moitié (le long de **ma** vitre latérale) | `|x| > ~1,5` de mon côté | **toujours à moi**. Le partenaire n'y va **jamais** — les balles volées au partenaire près de sa vitre « finissent mal » [padeladdict] |
| **Bande centrale** | `|x - centreÉquipe| < ~0,7` | partagée, règles du milieu (§3.4) : par défaut **le joueur de gauche** (coup droit au centre) |
| Couloir intérieur du partenaire | entre la bande centrale et son couloir | à lui ; j'y entre **seulement** pour couvrir le centre quand il est sorti large, ou pour un poach au filet décidé |

**Lobs : chacun les siens.**

- Un lob au-dessus de ma moitié est **à moi** : je me retourne, je recule, je joue (bandeja,
  smash, ou après la vitre). Mon partenaire recule **avec** moi (même bande), il ne vient pas la
  prendre à ma place.
- Lob **au centre** : le joueur de gauche (droitier) le prend en coup droit / smash [Padel
  Browser]. Pour le joueur de droite, la plupart des lobs arrivent **au-dessus de l'épaule
  gauche** — c'est son côté difficile, d'où plus de bandejas / ganchos et moins de víboras
  [The Padel School].
- Lob qui **passe** au-dessus d'un joueur et qu'il ne peut pas rattraper à temps : c'est là, et
  seulement là, que le partenaire part en diagonale et qu'on fait le **cambio** (§3.5).
- Smash qui part vers le partenaire alors que je suis mieux placé : je peux le prendre, **à
  condition que ce soit convenu** dans la paire [padeladdict]. Pour un bot : règle fixe de paire.

**Envahir la moitié du partenaire : quand et quand pas** [padeladdict] :

- **Oui** : pour couvrir le centre pendant que le partenaire défend son parallèle ; surtout au
  filet ; au fond quand le partenaire est enfermé dans un coin.
- **Oui** : le joueur de gauche, finisseur, glisse volontairement dans la moitié droite au filet
  pour **intercepter** (poach) — c'est le joueur le plus mobile de la paire [Padel Browser].
- **Non** : jouer surtout dans sa moitié ; ne jamais aller chercher une balle clairement destinée
  au partenaire, surtout près de **sa** vitre ; **ne jamais laisser sa propre moitié vide**.

**Gauchers.** Un gaucher joue normalement **à droite** : avec un droitier à gauche, les deux coups
droits sont au centre, les deux revers aux vitres ; la bande centrale revient alors au mieux placé,
et les lobs du milieu au plus offensif du moment [Padel Browser, padeladdict]. Deux gauchers :
tout se fait en miroir.

**Rôles qui en découlent** (détail au §9) : la moitié droite est celle du **constructeur**
(échange croisé coup droit contre le joueur de droite adverse, jeu après la vitre, lobs croisés) ;
la moitié gauche celle du **finisseur** (balle du milieu, smashes, por tres, poach).

```text
// Propriété d'un point d'impact p (repère de l'équipe, x>0 = droite).
// centre = centre de l'équipe (§3.1). G = joueur de gauche, D = joueur de droite.
proprietaire(p):
  si p.x < centre - 0.7 → G                 // moitié gauche (couloir + intérieur)
  si p.x > centre + 0.7 → D                 // moitié droite
  sinon → regleDuMilieu(p)                  // §3.4 ; par défaut G pour deux droitiers
exceptions :
  - le propriétaire ne peut pas y arriver (lob passé, sorti large) ET le partenaire si → cambio
  - au filet, G peut poacher une balle de D si elle passe à portée sans recul (fort uniquement)
après le coup : chacun revient vers SA base (xG = centre - écart/2, xD = centre + écart/2)
```

### 3.1 La corde (basculement latéral)

L'équipe se déplace comme un bloc : écart quasi constant, centre de l'équipe qui suit la balle.

```text
// Position de base de l'équipe au moment où l'adversaire va frapper (repère de l'équipe).
// striker.x : position latérale du frappeur adverse, ramenée dans notre repère (miroir : son
// côté droit est notre gauche → xStrikerNous = -striker.xSonRepere).
centre   = clamp(K * xStrikerNous, -1.5, +1.5)      // K ≈ 0.4 [estimation]
ecart    = 3.2 (filet)  |  3.0 (fond)  |  3.6 (fond contre smash)
xGauche  = centre - ecart/2
xDroite  = centre + ecart/2
```

Pourquoi `K ≈ 0,4` : le frappeur dans un coin peut jouer la ligne (droit devant lui) ou le
croisé ; on se place sur la bissectrice de ses angles de frappe, qui passe un peu du côté de la
balle. On ne suit pas la balle à 100 %, sinon le croisé s'ouvre [estimation, principe :
padeladdict « limpiaparabrisas »].

### 3.2 Qui couvre quoi au filet

D'après padeladdict (« Cómo cubrir la red ») et Padel Browser :

| L'adversaire frappe… | Joueur **en face** de lui | Joueur **en diagonale** |
|---|---|---|
| depuis un coin | couvre la **ligne** (parallèle), plus près du filet | couvre le **milieu**, un demi-pas derrière, lit le lob |
| depuis le centre | les deux **en ligne**, chacun au centre de sa moitié | |

Règle simple pour le bot : **le joueur dont la diagonale passe par le frappeur prend le milieu**.

### 3.3 Avant / arrière ensemble

- Monter : les deux montent ensemble ; jamais un partenaire abandonné au fond [consensus].
- Reculer : si l'un est lobé et recule, **l'autre recule aussi** (même bande) [consensus].
  Exception : le lob ne passe pas (le partenaire va le jouer en bandeja/smash) → on reste au filet.
- Quand l'un recule pour frapper (bandeja), le partenaire recule de quelques pas, puis **les deux
  remontent ensemble dans la direction du coup** [padeladdict].
- Après chaque coup, retour à la distance de base (pas de « je reste où j'ai frappé ») [consensus].

### 3.4 Qui prend la balle du milieu

Ne concerne que la **bande centrale** (§3.0) : hors de cette bande, la balle appartient au
propriétaire de la moitié. Priorités dans l'ordre [Padel Browser, padeladdict, simplepadel] :

1. **Celui qui l'a annoncée / engagée le premier** (pour un bot : celui qui a déjà commencé sa
   course vers le point d'impact).
2. **Celui qui se déplace vers la balle** (plutôt que celui qui doit reculer ou revenir).
3. Balle **rapide** au milieu : le joueur **en diagonale du frappeur** (il est déjà au centre, cf. 3.2).
4. Balle **lente** au milieu : **le coup droit au centre**. Deux droitiers → le joueur de **gauche**
   (revés), dont le coup droit est au milieu. Gaucher + droitier bien placés → deux coups droits
   au milieu, celui qui est le mieux placé.
5. **Smash/bandeja au milieu** : le joueur de gauche (son coup droit au-dessus de la tête couvre le
   centre) pour deux droitiers [courtsfinder].

```text
// Attribution déterministe d'une balle de la bande centrale entre A et B
// (hors bande centrale : proprietaire(p) du §3.0).
si A.engage et pas B.engage → A
si B.engage et pas A.engage → B
tA, tB = temps pour atteindre le point d'impact (planIntercept)
si |tA - tB| > 0.15 s → le plus rapide
sinon → celui qui a le coup droit vers le point d'impact (droitier : point à sa droite)
le perdant : ne frappe pas, se replace en couverture (il prend la place libérée, cf. 3.5)
```

Erreur classique à éviter : **les deux sur la même balle**, ou **les deux qui la laissent passer**.
C'est précisément ce que l'adversaire cherche en jouant au milieu (§6.1).

### 3.5 Croisement (« cambio », X)

- Quand un joueur part dans un coin pour une balle, le partenaire **glisse vers le centre** sans
  dépasser exagérément la ligne médiane [simplepadel].
- Lob qui passe au-dessus d'un joueur côté opposé : le partenaire part en diagonale chercher la
  balle, l'autre **change de côté** (croisement en X). Il faut que **les deux** croisent, sinon un
  grand trou en diagonale s'ouvre [simplepadel]. Pour un bot, le croisement est décidé par le
  joueur qui va frapper ; le partenaire prend automatiquement la moitié libérée. Le croisement est
  l'exception : chacun reprend son côté dès le premier temps mort (§3.0).

### 3.6 Annonces (ce que l'IA doit simuler)

Les coachs insistent : « moi / à toi / change / recule / monte » sur chaque balle. Un bot n'en a
pas besoin pour lui-même, mais les annonces sont la façon **naturelle** de rendre l'équipe
lisible pour un humain partenaire : bulle ou voix « ¡Mía! », « ¡Tuya! », « ¡Cambio! ». Et
« **deux au filet !** » quand le partenaire est lobé et que l'adversaire est monté : il sait alors
qu'un passing est risqué et qu'il faut relober [tiendapadelpoint]. [estimation pour le jeu]

---

## 4. Transitions : monter, tenir, reculer

### 4.1 Quand monter au filet (feux verts)

[consensus : Padel Browser, courtsfinder, simplepadel, tiendapadelpoint]

| Après ce coup à moi | Monter ? |
|---|---|
| **Lob profond qui passe** les joueurs au filet (ils se retournent / reculent à la vitre) | **Oui**, tout de suite, pendant que la balle vole |
| **Chiquita** basse dans les pieds du joueur au filet | **Oui, mais après sa réponse** : s'il remonte la balle haute et molle, on fonce |
| **Bajada** / attaque forte et profonde depuis le fond | Oui |
| Drive profond qui fait reculer l'adversaire | Oui |
| Balle flottante au milieu du terrain | **Non** : il attaque nos pieds pendant qu'on monte |
| Balle courte sans pression | Non |

Mécanique de montée : coup d'approche → 2–3 pas → pas d'arrêt au moment de la frappe adverse →
finir la montée au coup suivant. On arrive **avant** que la balle ne revienne.

Données : le lob est utilisé dans **60 %** des conquêtes du filet, à tous les niveaux [mesuré,
Muñoz Marín 2017] ; mais **65 %** des lobs ne passent pas les joueurs au filet [mesuré, Master
Madrid 2021] → l'IA doit vérifier que le lob **passe** avant de monter (c'est déjà la logique de
`bot.ts` : il reste derrière si l'adversaire arme un coup au-dessus de la tête).

### 4.2 Garder le filet

- Sur un lob atteignable : **se tourner de profil dès que l'adversaire passe sous la balle**,
  petits pas arrière, et jouer **bandeja/víbora** — puis remonter tout de suite. La boucle de base
  du padel est : **lob → bandeja → volée** [Bounce].
- On ne garde pas le filet à tout prix : un lob au-delà de la portée de la bandeja se laisse
  passer → on recule et on rejoue après la vitre [courtsfinder].

### 4.3 Quand reculer

- Lob qui passe au-dessus : **les deux reculent ensemble**, se replacent au fond, reconstruisent
  [consensus]. Laisser un joueur seul au filet = plusieurs points perdus d'affilée.
- Smash arrivant d'un adversaire bien placé sous un lob court : reculer clairement si le smash est
  profond ; s'il est moyen/court, garder l'option d'avancer bloquer. **Ne pas reculer trop tôt** sur
  un smash moyen (ça ouvre l'espace devant) [actu-padel].

### 4.4 Machine d'états d'équipe

```text
DEFENSE (les deux au fond)
  └─ mon coup = lob qui passe | bajada profonde | chiquita basse (après sa réponse molle)
     → MONTEE (les deux avancent vers d=2.5, pas d'arrêt à la frappe adverse)
MONTEE
  ├─ arrivés à d ≤ 3.5 → ATTAQUE
  └─ adversaire lobe et le lob passe → REPLI
ATTAQUE (les deux au filet)
  ├─ lob atteignable → l'un joue bandeja/víbora/smash, l'autre recule de 1–2 pas puis remonte
  └─ lob qui passe → REPLI
REPLI (les deux reculent vers d=8.5, se retournent, jouent après la vitre)
  └─ → DEFENSE
```

Règle de cohérence : **l'état est celui de l'équipe, pas du joueur**. Un seul joueur ne change pas
d'état seul (sauf frappe en cours).

---

## 5. Quel coup jouer — tableau de décision

Entrées : ma zone, la zone des adversaires, la couleur de la balle reçue, sa hauteur à l'impact,
si elle sort d'une vitre. Sortie : type de coup + cible (§6).

### 5.1 Je suis au fond, ils sont au filet (situation la plus fréquente en défense)

| Balle reçue | Coup | Cible | Raison |
|---|---|---|---|
| **Rouge** (basse, rapide, pas le temps) | **lob haut** de dégagement, ou **bloc** au milieu | lob profond croisé ; bloc au centre, bas | survivre ; « du fond on ne gagne pas » [consensus] |
| **Jaune** | **lob profond** (choix principal) | coin du fond, plutôt **croisé** | le lob croisé a le plus de marge, il gêne la bajada adverse [The Padel School] |
| Jaune, adversaires **loin du filet** (d > 3) | **chiquita** | pieds du joueur au filet, bas et lent | ils doivent remonter la balle → on monte [The Padel School, Noxsport] |
| **Verte**, adversaires bien placés | lob offensif (plus tendu) ou chiquita | coin / pieds | prendre le filet |
| Verte, un adversaire **trop près** du filet (d < 1,5) | **lob** par-dessus lui | derrière lui | il ne peut pas reculer à temps |
| Verte, adversaire **décalé** / trou au milieu | **frappe au milieu** ou au corps, ou passing le long de la ligne | milieu ; corps ; ligne si ouverte | punir le placement, rarement gagnant direct |
| **Balle haute qui ressort de la vitre** (verte) | **bajada** (attaque après la vitre) | milieu ou pieds, puis monter | c'est la seule vraie attaque du fond [Padel Browser, The Padel School] |
| Balle collée à la vitre / derrière la hanche | remise en jeu, lob | profond | ne pas forcer |
| Lob adverse très profond (sort du coin) | **laisser rebondir** sur la vitre, puis lob ou bajada | | [consensus] |

Lecture après la vitre (coin, « doble pared ») [The Padel School, Padel Browser] : premier rebond
bas et rasant → se mettre derrière et jouer plus haut en croisé ; rebond moyen → coup compact ;
rebond haut → avancer et la prendre tôt. **Anticiper où la balle va finir, pas où elle touche la
vitre.**

### 5.2 Je suis au filet, ils sont au fond (attaque)

| Balle reçue | Coup | Cible | Raison |
|---|---|---|---|
| Rouge, basse dans les pieds | **volée basse coupée**, bloquée | profond au milieu, ou vers la vitre latérale | ne pas vouloir conclure une balle basse [consensus] |
| Jaune, hauteur hanche–épaule | **volée profonde** | **milieu** ou **pieds** de celui qui est le plus loin ; vers la **vitre latérale** pour le faire tourner | construire, garder le filet |
| Verte au-dessus du filet, adversaire déséquilibré | **volée qui conclut** | angle court croisé, ou pieds, ou trou au milieu | conclure [consensus] |
| Lob **court et lent**, pris au-dessus de l'épaule **sans reculer**, en équilibre, à d ≤ ~5 | **smash** (remate) | à plat dans le trou, ou **por tres** (sort par le côté) si d ≤ 4 | coup gagnant n°1 (35–43 %) [mesuré] |
| Lob moyen, on recule ou on frappe à hauteur de tête | **bandeja** | **croisée**, profonde, vers la **vitre latérale avant / coin** pour un rebond bas | garder le filet [consensus] |
| Lob moyen, équilibre correct, coin visé clair | **víbora** | coin du fond, effet latéral qui sort bas de la vitre | attaque contrôlée |
| Lob profond, au-delà de la portée (d > ~6,5–7,5 selon le niveau) | **laisser passer**, reculer, jouer après la vitre | lob ou bajada | ne pas offrir le filet [consensus] |

Arbre de décision au-dessus de la tête (consensus Bounce, Padel Browser, padel.how) :

```text
si balle prise loin (d > maxDepth) → laisser rebondir, reculer (REPLI)
sinon si courte (d ≤ 4–5) ET haute ET lente ET équilibré ET sans reculer
     → remate : à plat vers le trou ; por tres si d ≤ 4 et très haute (sort par le côté) ;
                por cuatro (sort par le fond) en variation
sinon si équilibré ET coin libre → víbora vers le coin
sinon → bandeja croisée profonde, puis remonter au filet
```

Données : le smash à plat fait le plus de coups gagnants (52 % des winners en smash, juniors)
et la bandeja le plus de fautes de smash — la bandeja n'est pas un coup pour gagner [mesuré,
étude juniors 2012]. Smasher toutes les balles fait **perdre le filet** [Bounce].

### 5.3 Les quatre au filet (échange de volées)

| Situation | Coup | Cible |
|---|---|---|
| Balle basse sous le filet | volée basse, lente | **pieds** de l'adversaire |
| Balle à hauteur de poitrine | volée rapide | **au corps** (côté hanche/raquette), ou **milieu** |
| Adversaire très près (d < 1,5) et balle confortable | **lob de volée** (globo) | derrière lui |
| Balle haute | conclure | pieds, angle, milieu |

### 5.4 Les quatre au fond

Rare chez les bons joueurs. Coup profond croisé, puis **le premier qui obtient une balle verte
lobe profond ou bajade et monte** [estimation, déduit du principe « le filet gagne »].

### 5.5 Pseudo-code du choix de coup

```text
choisirCoup(moi, adv, balle):
  si moi.zone == FOND et adv.zone == FILET:
    si balle.sortDeVitre et balle.haute → bajada (cible milieu/pieds), puis MONTEE
    si balle.rouge → lob haut profond croisé (90 %) | bloc milieu (10 %)
    si adv.dMin < 1.5 et balle != rouge → lob par-dessus le plus proche
    si adv.dMin > 3 et balle != rouge → chiquita (pieds)
    sinon → lob profond croisé (≈ 65 %) | chiquita (≈ 20 %) | frappe au milieu/corps (≈ 15 %)
  si moi.zone == FILET et adv.zone == FOND:
    si balle au-dessus de la tête → arbre §5.2
    si balle.rouge → volée basse profonde au milieu
    si balle.verte et adv.desequilibre → volée qui conclut (angle / pieds / trou)
    sinon → volée profonde milieu | vers vitre latérale
  si moi.zone == FILET et adv.zone == FILET:
    balle basse → pieds ; balle haute → conclure ; adv trop près → lob de volée
  si moi.zone == TRANSITION:
    balle haute (≥ épaule) → accélération croisée ou pieds ; balle basse → profond, neutre
```

Les parts entre parenthèses sont des points de départ [estimation] ; `bot.ts` les a déjà sous
forme de `choices: { lob, chiquita, body, cut }`.

---

## 6. Où viser

### 6.1 Le milieu (« la zone du divorce »)

Pourquoi viser entre les deux adversaires [Head, LTA, Babolat, Bounce] :

- **hésitation** : qui prend ? collisions, ou les deux la laissent passer ;
- **retour prévisible** : une balle au milieu revient au milieu, on sait où se placer ;
- **pas d'angle offert** : un angle court qu'on joue ouvre l'angle court pour la riposte ;
- **marge** : le milieu est loin des lignes et des vitres latérales.

Pour un bot, viser le milieu est le **coup par défaut au filet** ; les angles sont réservés à la
balle verte qui conclut.

### 6.2 Les pieds

Contre un joueur au filet ou en transition : la balle qui tombe dans ses pieds l'oblige à
**remonter la balle** — elle revient haute, donc attaquable [consensus]. C'est aussi la cible de la
chiquita et du retour de service contre un serveur qui monte.

### 6.3 Les vitres comme cibles (côté attaque)

- **Bandeja** : vers la **vitre latérale avant** (premier panneau près du fond) ou **la partie
  arrière du grillage latéral** ; la balle doit sortir **basse** de la vitre du fond [The Padel
  School, Babolat].
- **Volée profonde vers le coin** : la balle fait deux vitres, le défenseur doit se retourner.
- **Grillage** (`d < 8` sur le côté) : la balle meurt ; bonne cible d'une volée d'angle.
- **Smash por tres / por cuatro** : la balle sort du terrain par le côté / le fond → point sauf
  sortie de piste du défenseur.

### 6.4 Direction du lob [The Padel School]

| Direction | Avantages | Risques |
|---|---|---|
| **Croisé** (choix par défaut) | diagonale la plus longue → le plus de marge ; bajada adverse difficile | — |
| **Long de la ligne** | colle l'adversaire au grillage → smash et bandeja difficiles | ligne la plus courte, peu de marge |
| **Milieu** | — | le plus facile à attaquer en bajada ; si on le joue, plus **tendu** que haut |

Profondeur : lob qui retombe à **≥ 5,5 m du filet** = rallye long, bon ; **≈ 8,5 m** = excellent ;
**≤ 5 m** = échange court, perdu le plus souvent (35 % de points gagnés seulement) [mesuré,
Ramón-Llin 2019]. Viser le **coin du fond** (jonction vitres fond/latérale) [Bounce].

Cible privilégiée : le **revés du joueur au filet** (le smash de revers est faible) [estimation —
transposé du tennis/pickleball, aucune source padel ne le confirme].

### 6.5 Sur quel adversaire jouer

- Au filet, l'équipe choisit **un adversaire à attaquer** (le plus faible, le plus mal placé) et
  insiste [padeladdict].
- Changer de direction **seulement sur une balle confortable** : le changement modéré (vers le
  milieu) est plus sûr que le changement brusque (vers l'autre joueur), qui ouvre le parallèle et
  le milieu chez nous si on ne bascule pas vite [padeladdict].

---

## 7. Service et retour

### 7.1 Service

- Le service n'est pas un coup gagnant, c'est **un coup pour monter au filet** [LTA].
- Cible : alterner **le « T »** et **la vitre latérale** ; côté gauche, préférer la vitre latérale
  pour éviter un retour confortable [Noxsport]. Côté droit, les pros servent davantage au T
  [mesuré].
- Le **serveur monte immédiatement** après le service, vers une position qui couvre **son côté et
  le milieu** [LTA, Bounce]. Monter lentement = le relanceur vise ses pieds.
- Le **partenaire du serveur** est déjà au filet (`d ≈ 2–2,5`), au centre de sa moitié, regard
  **vers l'avant** (il ne se retourne pas pour regarder son partenaire servir) [padeladdict].
- Troisième coup (première volée du serveur) : **profond**, souvent au milieu ou changement de
  direction ; ne pas chercher à conclure trop tôt [The Padel School, tiendapadelpoint].
- Après un retour à plat, c'est le **serveur** qui joue le plus souvent le 3e coup ; après un retour
  en lob, c'est le **partenaire** (au filet, il le prend en bandeja/smash) [mesuré, WPT 2021].

Avantage au serveur : l'équipe au service gagne ~95 % des points de 1–2 coups, ~65 % à 3–4 coups,
et l'avantage s'efface après **6–8 coups** [mesuré, Ramón-Llin 2019].

### 7.2 Retour

- Position : près du fond (`d ≈ 8,5–9`), face au serveur, près de la vitre latérale sans y être
  collé (trop près on est gêné, trop loin on arrive en retard) [The Padel School].
- Objectif : **remettre en jeu**, pas gagner ; empêcher l'équipe au service de s'installer
  confortablement au filet [consensus].

| Service reçu | Retour |
|---|---|
| Bon service dans la vitre latérale (retour difficile) | **bloc simple vers le serveur** |
| Bon service au T | **lob** pour gagner du temps |
| Service facile, central | **bas dans les pieds du serveur qui monte**, ou **lob** immédiat pour prendre le filet |

Chiffres pros : 70 % de retours à plat, 30 % en lob ; les retours à plat vont au **serveur** à 72 %
(le partenaire est déjà au filet) [mesuré, Ramón-Llin 2019].

---

## 8. Lire l'adversaire (indices visibles à l'écran)

Le bot ne lit que ce qu'un humain voit (`bot.ts`). Indices utiles, tirés des coachs :

| Ce qu'on voit chez l'adversaire | Ce qui arrive | Réaction |
|---|---|---|
| Il se place **sous une balle haute**, confortable (balle verte pour lui) | lob ou attaque | joueurs au filet : **un demi-pas en arrière** |
| Jambes fléchies, raquette basse, face ouverte | **lob** | partir en arrière dès l'armé, se mettre de profil [tiendapadelpoint] |
| Il arme **au-dessus de la tête** près du filet, sous un lob court | **smash fort** | défenseurs : reculer et s'écarter vers les coins |
| Il arme au-dessus de la tête **en reculant** | bandeja / víbora (balle lente, profonde) | défenseurs : rester à d ≈ 7,5, prendre tôt |
| Il joue une balle **collée à la vitre / derrière la hanche** / en courant | balle faible | attaquants : **avancer** (d → 1,5) pour conclure |
| Il est **en transition** (no man's land) | il est vulnérable aux pieds | viser les pieds |
| Ses deux joueurs **décalés en profondeur** (un devant, un derrière) | diagonale ouverte | viser la diagonale entre eux |

Dans le jeu, l'anneau de couleur de la balle (verte/jaune/rouge) **est** cet indice : la couleur
de la balle **que l'adversaire va recevoir** dit à l'équipe s'il faut reculer (verte pour lui)
ou avancer (rouge pour lui).

---

## 9. Rôles drive / revés

Pour deux droitiers [Red Bull, courtsfinder, simplepadel] (les sources ne sont pas toutes
d'accord ; voici le consensus) :

| | **Drive** (côté droit) | **Revés** (côté gauche) |
|---|---|---|
| Profil | constant, défenseur, construit le point | finisseur, plus agressif |
| Au fond | beaucoup de jeu après la vitre, lobs, remises | bajadas, attaques sur balle haute |
| Au filet | volées de construction, bandeja | **smash / por tres** : prend la plupart des balles hautes au milieu (coup droit au centre) |
| Milieu | ne doit pas tout prendre (sinon il « vole » les balles du revés, coups précipités) | prend les balles lentes du milieu |
| Retour | retourne souvent le premier service de la partie | reçoit plus souvent les points décisifs (avantage) |

Pour l'IA : un profil par joueur (`role: 'drive' | 'reves'`) décalant les parts de coups — drive
plus de lobs et de remises, revés plus de remates et de víboras — et le droit au milieu (§3.4).
Gaucher à gauche + droitier à droite : les deux coups droits au milieu, les deux revers aux
vitres latérales.

---

## 10. Erreurs typiques — utiles pour les niveaux faciles

Un IA « facile » crédible ne joue pas au hasard : elle fait **les erreurs des amateurs**. Liste
tirée des coachs (Padel Browser, simplepadel, Bounce, Babolat, tiendapadelpoint) :

| Erreur | Comment la simuler |
|---|---|
| Attendre dans le no man's land | s'arrêter à `d ≈ 5` après une montée avortée |
| Se coller au filet (`d < 1,5`) | profondeur de base trop faible → lobé |
| Coller son dos à la vitre du fond | défense à `d ≈ 9,7` |
| Bouger sans tenir compte du partenaire | basculement `K = 0`, écart non tenu |
| Un au filet, un au fond | monter seul |
| Reculer seul sur un lob | le partenaire reste au filet |
| Les deux sur la même balle / aucun | attribution du milieu aléatoire |
| Attaquer depuis le fond | frappe forte sur balle jaune/rouge au fond |
| Smasher toutes les balles hautes | `remate` même loin du filet, perd le filet |
| Lob court | profondeur du lob `d ≈ 5` côté adverse → smash |
| Monter derrière une balle flottante | feu vert ignoré |
| Ne pas revenir à la base après le coup | reste là où il a frappé |
| Regarder la balle au lieu des adversaires | ne lit pas les indices du §8 (réaction tardive) |

Graduation proposée [estimation] :

| Niveau | Placement | Choix de coup | Lecture |
|---|---|---|---|
| **facile** | corde lâche (écart variable, `K ≈ 0,15`), reste parfois dans le no man's land, monte seul de temps en temps | lobs souvent courts, attaque du fond, smash systématique | réagit à la balle, pas aux indices |
| **normal** | corde tenue, `K ≈ 0,3`, monte derrière les lobs qui passent | tableau §5 avec du bruit ; bandeja quand il recule | lit le lob adverse (recule d'un demi-pas) |
| **fort** | corde stricte, escalonné, `K ≈ 0,4`, split step à chaque frappe adverse | tableau §5 ; milieu par défaut ; insiste sur un adversaire ; por tres sur lob court | lit tous les indices du §8, change de direction sur balle confortable |

---

## 11. Ce qui change en 1 contre 1 (mode duel actuel)

`Duel` est aujourd'hui un 1v1 : la plupart des règles s'appliquent avec une équipe d'un seul
joueur, en remplaçant « la corde » par :

- base latérale = **bissectrice des angles du frappeur** : `x = K1 * xStrikerNous`, `K1 ≈ 0,3–0,4`
  (au lieu de `x = 0` fixe dans `bot.ts`) [estimation] ;
- pas de « milieu » à exploiter côté adverse : la cible équivalente est **le côté libre** (déjà
  implémenté) et **les pieds** ;
- le tableau de choix du §5 et l'arbre au-dessus de la tête du §5.2 s'appliquent tels quels.

---

## 12. Paramètres récapitulatifs (à mettre dans un profil tactique)

| Clé proposée | Valeur | Sens |
|---|---|---|
| `net.depth` | 2,5 | profondeur au filet (m) |
| `net.depthThreat` | 3,2 | contre une balle verte adverse (lob possible) |
| `net.depthKill` | 1,6 | pour conclure, adversaire en difficulté |
| `net.stagger` | 0,6 | recul du joueur en diagonale (escalonné) |
| `back.depth` | 8,2 | profondeur en défense |
| `back.depthSmash` | 9,0 | contre un smash |
| `spacing.net` / `spacing.back` / `spacing.smash` | 3,2 / 3,0 / 3,6 | écart entre partenaires |
| `shift.k` | 0,4 | basculement vers le frappeur |
| `middle.tieSeconds` | 0,15 | égalité d'arrivée → coup droit au centre |
| `lob.minDepth` / `lob.goodDepth` | 5,5 / 8,5 | profondeur du lob côté adverse (m du filet) |
| `overhead.smashMaxDepth` | 5 | au-delà, pas de remate |
| `overhead.porTresMaxDepth` | 4 | por tres possible |
| `chiquita.minOppDepth` | 3 | chiquita seulement si le joueur au filet est à plus de 3 m |
| `lobOver.oppMaxDepth` | 1,5 | lober un joueur collé au filet |

---

## Sources

Coaching / blogs :

- Padel Browser — [Positioning & court coverage guide](https://www.padelbrowser.com/blog/padel-positioning-court-coverage-guide)
- Bounce — [Padel strategy](https://www.bounce.game/blog/padel-strategy), [Padel smash](https://www.bounce.game/blog/padel-smash)
- Padel Browser — [Left side vs right side](https://www.padelbrowser.com/blog/left-side-vs-right-side-padel)
- Padel Addict — [Cuándo invadir el lado de nuestro compañero](https://www.padeladdict.com/cuando-invadir-lado-pista-nuestro-companero-partido-padel/)
- The Padel School — [Right side player](https://thepadelschool.com/padel-tips/right-side-player), [Essential padel return rules](https://thepadelschool.com/post/essential-padel-return-rules)
- Bounce — [Padel rules](https://www.bounce.game/blog/padel-rules)
- Padel Addict — [Colocación en la volea](https://www.padeladdict.com/colocacion-en-la-volea/), [Cómo cubrir la red](https://www.padeladdict.com/como-cubrir-la-red/), [Ataque escalonado](https://www.padeladdict.com/ataque-escalonado/)
- Simple Padel — [Ultimate guide to positions in padel](https://simplepadel.com/ultimate-guide-to-positions-in-padel/)
- Padel Courts Finder — [Padel positioning guide](https://www.padelcourtsfinder.com/blog/padel-positioning-guide)
- Babolat — [Padel tactics (zones rouge/orange/verte)](https://www.babolat.com/es/news-articles-blog-padel-tactics/padel-tactics.html)
- Actu Padel — [How to defend a smash](https://actu-padel.com/en/how-to-defend-smash-padel/)
- The Padel School — [Where to hit the lob](https://thepadelschool.com/padel-tips/where-to-hit-the-lob), [Where to hit the return](https://thepadelschool.com/padel-tips/where-to-hit-the-return), [What is the chiquita](https://thepadelschool.com/padel-tips/what-is-the-chiquita), [How to hit a bandeja without any risk](https://thepadelschool.com/padel-tips/how-to-hit-a-bandeja-without-any-risk), [Training corners and bajadas](https://thepadelschool.com/padel-tips/training-corners-and-bajadas)
- Padel Tonic — [How to hit a bandeja](https://padeltonic.net/padel-news/499/how-to-hit-a-bandeja-a-defensive-smash-in-padel/)
- LTA Padel — [Serve tips](https://ltapadel.org.uk/play/padel-tips-and-techniques/serve/), [Match tactics](https://www.ltapadel.org.uk/play/how-to-get-started-playing-padel/padel-match-tactics)
- Head — [Padel tactics to improve your game](https://www.head.com/rs/stories/padel-tactics-to-improve-your-game)
- Red Bull — [Posiciones de juego explicadas](https://www.redbull.com/es-es/padel-posiciones-juego-explicadas)
- Noxsport — [Cómo realizar un buen saque](https://noxsport.com/en/blogs/making-you-improve/como-realizar-un-buen-saque-en-padel), [La chiquita](https://noxsport.com/en/blogs/making-you-improve/la-chiquita-en-padel)
- TiendaPadelPoint (boutique, à prendre avec prudence) — [Posicionamiento pareja](https://www.tiendapadelpoint.com/posicionamiento-pareja-padel), [Cómo posicionarse en la red](https://www.tiendapadelpoint.com/como-posicionarse-en-la-red-padel), [Placement double (fr)](https://www.tiendapadelpoint.com/fr/placement-double-padel-fr), [Anticiper le lob défensif (fr)](https://www.tiendapadelpoint.com/fr/anticiper-lob-defensif-padel-fr)

Études :

- Ramón-Llin et al. (2019), *Frontiers in Psychology* — [Serve and return in national/regional padel](https://www.frontiersin.org/articles/10.3389/fpsyg.2019.01194/full)
- Muñoz Marín et al. (2017) — [Acciones de subida a la red, WPT vs avanzados](https://dehesa.unex.es/handle/10662/8646)
- [Analysis of serve and serve-return strategies in elite padel](https://zaguan.unizar.es/record/96138?ln=en)
- [Analysis of the smash in junior padel (2012)](https://ccd.ucam.edu/visores/18_57/2012_E_CCD/index.html)
- Voir aussi les études citées dans `research/padel-pro/NOTES.md` (Martín-Miguel et al. 2024/2026).

Limites : aucune source ne donne de schéma chiffré complet des positions ; les distances viennent
de blogs qui se recoupent, les pourcentages d'études parfois anciennes (2015–2021) ou de petits
échantillons. Les valeurs marquées [estimation] sont à régler en jouant.
