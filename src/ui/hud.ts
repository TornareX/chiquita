export interface Hud {
  /** `active` : la souris est capturée et le joueur a la main. */
  update(active: boolean): void;
}

export function createHud(): Hud {
  const prompt = document.createElement('div');
  prompt.id = 'start-prompt';
  prompt.innerHTML =
    '<strong>Cliquer pour jouer</strong>' +
    '<span>ZQSD : se déplacer · Souris : regarder · Espace : split-step · Échap : libérer la souris</span>';
  document.body.append(prompt);

  return {
    update(active: boolean): void {
      prompt.hidden = active;
    },
  };
}
