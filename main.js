import './style.css'
import App from './src/App.js';

const BANNER_TEXT = 'Mitoza - Viktor Knežević, VIII beogradska gimnazija';

const main = async () => {
  const banner = document.querySelector('#banner');
  banner.innerHTML = BANNER_TEXT;

  const app = new App('#app');
  await app.initScene();
  app.animate();
};

main();
