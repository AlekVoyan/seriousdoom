import { runMiniGame3D } from './core/three3d';
import { doom } from './games/doom';

/**
 * Точка входа отдельной сборки «Фаєрвол».
 * В родительском проекте (VoxEvasion) эта игра — одна из мини-игр и запускается
 * из песочницы; здесь она сама себе приложение: заставка → забег → счёт.
 */

const shell = document.getElementById('shell') as HTMLDivElement;
const playBtn = document.getElementById('play') as HTMLButtonElement;
const scoreEl = document.getElementById('score') as HTMLDivElement;

let busy = false;

const play = async () => {
  if (busy) return;
  busy = true;
  shell.style.display = 'none';
  try {
    const res = await runMiniGame3D(doom, { stress: 20 });
    scoreEl.textContent = res.success
      ? `зароблено ${res.score}₴`
      : res.score > 0
        ? `порт впав · зароблено ${res.score}₴`
        : '';
  } finally {
    shell.style.display = '';
    playBtn.textContent = 'ЩЕ РАЗ';
    busy = false;
  }
};

playBtn.addEventListener('click', () => void play());
