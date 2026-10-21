/**
 * Couleurs d'équipe, communes à la 3D (maillots) et à l'interface : `src/ui/theme.css` reprend les mêmes valeurs
 * (`--blue`, `--blue-partner`, `--red`, `--red-partner`), vérifiées par `tests/render/teamColors.test.ts`.
 * Bleu ciel plutôt que bleu roi : il ressort sur le court, bleu lui aussi, et reste plus clair que le rouge
 * (daltonisme) ; texte en encre sur les deux.
 */
export const TEAM_COLORS = [0x3cc4ff, 0xff4d3d] as const;
/** En double, le partenaire (joueurs 2 et 3) porte une teinte plus claire de la couleur de son équipe. */
export const PARTNER_COLORS = [0xa6e6ff, 0xff9e94] as const;
