import './style.css'
import App from './src/App.js';

const main = async () => {
  const app = new App('#app');
  await app.initScene();
  app.animate();
};

main();
